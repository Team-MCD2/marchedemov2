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
