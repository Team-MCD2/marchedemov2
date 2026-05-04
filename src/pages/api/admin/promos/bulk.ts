/**
 * POST /api/admin/promos/bulk
 *
 * Body    : { ids: string[], action: BulkAction, patch?: object }
 *
 * Actions :
 *   "activate"    -> actif = true
 *   "deactivate"  -> actif = false
 *   "feature"     -> mise_en_avant = true
 *   "unfeature"   -> mise_en_avant = false
 *   "delete"      -> hard delete
 *   "patch"       -> partial update with `patch` (whitelisted fields)
 *
 * Reply   : { affected: number }
 *
 * Shared ALLOWED_FIELDS whitelist with /api/admin/promos/[id] so
 * bulk patch can't touch arbitrary columns.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/admin-activity";

export const prerender = false;

const ALLOWED_PATCH_FIELDS = new Set([
  "actif",
  "mise_en_avant",
  "rayon",
  "magasin",
  "ordre",
  "date_debut",
  "date_fin",
]);

type BulkAction =
  | "activate"
  | "deactivate"
  | "feature"
  | "unfeature"
  | "delete"
  | "patch";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthenticated(cookies))) return json({ error: "Unauthorized" }, 401);
  if (!supabaseAdmin) return json({ error: "Supabase service_role key missing" }, 500);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON body invalide" }, 400);
  }

  const ids: unknown = body?.ids;
  const action: BulkAction = body?.action;
  if (!Array.isArray(ids) || ids.length === 0) {
    return json({ error: "ids doit etre un tableau non vide" }, 400);
  }
  if (ids.length > 500) {
    return json({ error: "Trop de lignes (max 500 par appel)" }, 400);
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeIds = (ids as string[]).filter((x) => typeof x === "string" && uuidRe.test(x));
  if (safeIds.length !== ids.length) {
    return json({ error: "Certains ids ne sont pas des UUID valides" }, 400);
  }

  let patch: Record<string, any> | null = null;
  switch (action) {
    case "activate":
      patch = { actif: true };
      break;
    case "deactivate":
      patch = { actif: false };
      break;
    case "feature":
      patch = { mise_en_avant: true };
      break;
    case "unfeature":
      patch = { mise_en_avant: false };
      break;
    case "delete":
      patch = null; /* handled separately */
      break;
    case "patch": {
      const p = body?.patch;
      if (!p || typeof p !== "object") {
        return json({ error: "patch manquant" }, 400);
      }
      patch = {};
      for (const [k, v] of Object.entries(p)) {
        if (!ALLOWED_PATCH_FIELDS.has(k)) continue;
        patch[k] = v;
      }
      if (Object.keys(patch).length === 0) {
        return json({ error: "Aucun champ modifiable dans patch" }, 400);
      }
      break;
    }
    default:
      return json({ error: `Action inconnue : ${String(action)}` }, 400);
  }

  if (action === "delete") {
    const { error, count } = await supabaseAdmin
      .from("promos")
      .delete({ count: "exact" })
      .in("id", safeIds);
    if (error) return json({ error: error.message }, 500);
    logActivity({
      entity: "promo",
      action: "bulk",
      entity_label: `Suppression × ${count ?? safeIds.length}`,
      payload: { sub_action: "delete", count: count ?? safeIds.length, ids: safeIds.slice(0, 50) },
    });
    return json({ affected: count ?? safeIds.length });
  }

  const { error, count } = await supabaseAdmin
    .from("promos")
    .update(patch!, { count: "exact" })
    .in("id", safeIds);
  if (error) return json({ error: error.message }, 500);
  logActivity({
    entity: "promo",
    action: "bulk",
    entity_label: `${action} × ${count ?? safeIds.length}`,
    payload: { sub_action: action, patch, count: count ?? safeIds.length, ids: safeIds.slice(0, 50) },
  });
  return json({ affected: count ?? safeIds.length });
};
