/**
 * admin-activity.ts — fire-and-forget audit logger for /api/admin/* routes.
 *
 * Design goals
 * ------------
 *  - **Never throw** at the call site. If Supabase is unreachable, the
 *    table doesn't exist (migration 002 not applied), or the network
 *    flakes, the user-visible write must still succeed. We log to
 *    `console.warn` for ops visibility but swallow the error.
 *  - **Non-blocking**. Returns immediately (fire-and-forget). Callers
 *    never `await` this in the hot path.
 *  - **Bounded payloads**. Patches above ~16 KB are truncated so a
 *    runaway import doesn't bloat the audit table.
 *  - **Best-effort schema check**. The first failure remembered for
 *    the lifetime of the lambda — subsequent writes short-circuit
 *    silently to avoid log spam.
 */
import { supabaseAdmin } from "@/lib/supabase";

export type AdminEntity = "promo" | "produit" | "media" | "import" | "auth";

export type AdminAction =
  | "create"
  | "update"
  | "delete"
  | "bulk"
  | "reorder"
  | "upload"
  | "import"
  | "login"
  | "logout";

export interface AdminActivityRow {
  id: number;
  created_at: string;
  actor: string;
  entity: AdminEntity;
  entity_id: string | null;
  entity_label: string | null;
  action: AdminAction;
  payload: Record<string, any>;
}

interface LogActivityArgs {
  entity: AdminEntity;
  entity_id?: string | null;
  entity_label?: string | null;
  action: AdminAction;
  payload?: Record<string, any> | null;
  actor?: string;
}

/* Keeps the module lean : remember whether the activity table is
 * present so we don't keep slamming Supabase with doomed inserts. */
let tableMissing = false;

const MAX_PAYLOAD_BYTES = 16 * 1024;

function safeJson(value: any): Record<string, any> {
  try {
    const json = JSON.stringify(value ?? {});
    if (json.length <= MAX_PAYLOAD_BYTES) return value ?? {};
    /* Oversize : keep the keys but stub the values. */
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const stubbed: Record<string, any> = {};
      for (const k of Object.keys(value)) {
        stubbed[k] = "[truncated]";
      }
      stubbed.__truncated__ = true;
      stubbed.__original_size__ = json.length;
      return stubbed;
    }
    return { __truncated__: true, __original_size__: json.length };
  } catch {
    return { __unserializable__: true };
  }
}

/**
 * Insert one row into `admin_activity`. Fire-and-forget — never blocks
 * the caller. Errors are logged once but never re-thrown.
 */
export function logActivity(args: LogActivityArgs): void {
  if (tableMissing || !supabaseAdmin) return;
  const row = {
    actor: args.actor ?? "admin",
    entity: args.entity,
    entity_id: args.entity_id ?? null,
    entity_label: args.entity_label ?? null,
    action: args.action,
    payload: safeJson(args.payload ?? {}),
  };
  /* Intentionally not awaited. */
  void supabaseAdmin
    .from("admin_activity")
    .insert(row)
    .then(({ error }) => {
      if (!error) return;
      const msg = (error.message ?? "").toLowerCase();
      /* Migration 002 not yet applied → flip the kill switch silently. */
      if (
        msg.includes("relation") &&
        msg.includes("admin_activity") &&
        msg.includes("does not exist")
      ) {
        tableMissing = true;
        console.warn(
          "[admin-activity] Table absente. Exécutez supabase/migrations/002_admin_activity.sql.",
        );
        return;
      }
      console.warn("[admin-activity] insert error:", error.message);
    });
}

/**
 * Read the most recent activity rows. Used by the admin dashboard.
 * Returns [] if the table is missing or reads fail (graceful).
 */
export async function recentActivity(limit = 20): Promise<AdminActivityRow[]> {
  if (!supabaseAdmin || tableMissing) return [];
  const { data, error } = await supabaseAdmin
    .from("admin_activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      msg.includes("relation") &&
      msg.includes("admin_activity") &&
      msg.includes("does not exist")
    ) {
      tableMissing = true;
    }
    return [];
  }
  return (data as AdminActivityRow[]) ?? [];
}

/**
 * Probe the activity table availability so the dashboard can surface
 * a clear "run the migration" banner instead of silently showing an
 * empty feed (which is indistinguishable from "no writes yet").
 *
 * Returns :
 *   - `{ available: true }` when a `select count(*)` succeeds.
 *   - `{ available: false, reason: "missing" }` when the migration
 *     hasn't been applied (`relation "admin_activity" does not exist`).
 *   - `{ available: false, reason: "unknown" }` for any other failure
 *     (network, RLS, service-role key missing, etc.). These should be
 *     retried next page-load ; we don't flip the kill switch here.
 */
export async function activityTableStatus(): Promise<
  { available: true } | { available: false; reason: "missing" | "unknown"; detail?: string }
> {
  if (!supabaseAdmin) return { available: false, reason: "unknown", detail: "service_role key missing" };
  if (tableMissing) return { available: false, reason: "missing" };
  const { error } = await supabaseAdmin
    .from("admin_activity")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return { available: true };
  const msg = (error.message ?? "").toLowerCase();
  if (
    msg.includes("relation") &&
    msg.includes("admin_activity") &&
    msg.includes("does not exist")
  ) {
    tableMissing = true;
    return { available: false, reason: "missing" };
  }
  return { available: false, reason: "unknown", detail: error.message };
}

/**
 * Recent rows for one entity (e.g. "produit"), most recent first.
 */
export async function recentByEntity(
  entity: AdminEntity,
  limit = 5,
): Promise<AdminActivityRow[]> {
  if (!supabaseAdmin || tableMissing) return [];
  const { data, error } = await supabaseAdmin
    .from("admin_activity")
    .select("*")
    .eq("entity", entity)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data as AdminActivityRow[]) ?? [];
}

/**
 * Daily activity counts over the last `days` days, bucketed by
 * (entity, action). Returns a dense array of length `days` with
 * UTC-day buckets, ordered oldest → newest, so the dashboard
 * sparkline can render straight from `counts[i]`.
 *
 * Cheap : pulls only `created_at, entity, action` (no payloads),
 * filters server-side on `created_at >= today - days`. Large logs
 * (50k rows / month) stay well under the 1 MB Supabase soft-cap.
 *
 * Returns `null` if the table is missing — callers should hide the
 * sparkline cards rather than showing zeroed bars (which would be
 * indistinguishable from "no activity yet").
 */
export interface DailyActivityBucket {
  /** ISO date `YYYY-MM-DD` for the UTC day (oldest first). */
  date: string;
  /** Total rows in this day, all entities/actions. */
  total: number;
  /** Per-entity counts. */
  byEntity: Record<AdminEntity, number>;
  /** Per-action counts (create / update / delete). */
  byAction: Record<AdminAction, number>;
}

export async function dailyActivityCounts(
  days = 14,
): Promise<DailyActivityBucket[] | null> {
  if (!supabaseAdmin || tableMissing) return null;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const { data, error } = await supabaseAdmin
    .from("admin_activity")
    .select("created_at, entity, action")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      msg.includes("relation") &&
      msg.includes("admin_activity") &&
      msg.includes("does not exist")
    ) {
      tableMissing = true;
    }
    return null;
  }

  /* Pre-allocate dense buckets — important so the sparkline shows
   * zero days as zero (gap), not as a missing data point. */
  const buckets: DailyActivityBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    buckets.push({
      date: d.toISOString().slice(0, 10),
      total: 0,
      byEntity: { promo: 0, produit: 0, media: 0, import: 0, auth: 0 },
      byAction: {
        create: 0,
        update: 0,
        delete: 0,
        bulk: 0,
        reorder: 0,
        upload: 0,
        import: 0,
        login: 0,
        logout: 0,
      },
    });
  }
  const indexFor = (iso: string) => {
    const d = new Date(iso);
    const day = Math.floor((d.getTime() - since.getTime()) / 86_400_000);
    return Math.max(0, Math.min(days - 1, day));
  };

  for (const row of data ?? []) {
    const i = indexFor(row.created_at as string);
    const b = buckets[i];
    b.total++;
    const e = row.entity as AdminEntity;
    if (b.byEntity[e] !== undefined) b.byEntity[e]++;
    const a = row.action as AdminAction;
    if (b.byAction[a] !== undefined) b.byAction[a]++;
  }
  return buckets;
}
