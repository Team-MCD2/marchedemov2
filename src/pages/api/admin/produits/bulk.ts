/**
 * POST /api/admin/produits/bulk
 *
 * Body    : { ids: string[], action: BulkAction, patch?: object }
 *
 * Actions :
 *   "activate"    -> actif = true
 *   "deactivate"  -> actif = false
 *   "delete"      -> hard delete
 *   "patch"       -> partial update (whitelisted fields only)
 *
 * Reply   : { affected: number }
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/admin-activity";

export const prerender = false;

const ALLOWED_PATCH_FIELDS = new Set([
  "actif",
  "rayon",
  "categorie",
  "sous_categorie",
  "badge",
  "unite",
  "origine",
  "ordre",
]);

type BulkAction = "activate" | "deactivate" | "delete" | "patch";

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
    case "delete":
      patch = null;
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
      .from("produits")
      .delete({ count: "exact" })
      .in("id", safeIds);
    if (error) return json({ error: error.message }, 500);
    logActivity({
      entity: "produit",
      action: "bulk",
      entity_label: `Suppression × ${count ?? safeIds.length}`,
      payload: { sub_action: "delete", count: count ?? safeIds.length, ids: safeIds.slice(0, 50) },
    });
    return json({ affected: count ?? safeIds.length });
  }

  const { error, count } = await supabaseAdmin
    .from("produits")
    .update(patch!, { count: "exact" })
    .in("id", safeIds);
  if (error) return json({ error: error.message }, 500);
  logActivity({
    entity: "produit",
    action: "bulk",
    entity_label: `${action} × ${count ?? safeIds.length}`,
    payload: { sub_action: action, patch, count: count ?? safeIds.length, ids: safeIds.slice(0, 50) },
  });
  return json({ affected: count ?? safeIds.length });
};
