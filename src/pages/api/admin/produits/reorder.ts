/**
 * POST /api/admin/produits/reorder
 *
 * Body  : { rows: [{ id: string, ordre: number }, ...] }
 * Reply : { updated: number }
 *
 * Same shape as /api/admin/promos/reorder - batched ordre updates.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/admin-activity";

export const prerender = false;

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
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ error: "rows doit etre un tableau non vide" }, 400);
  }
  if (rows.length > 500) {
    return json({ error: "Trop de lignes (max 500 par appel)" }, 400);
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clean: { id: string; ordre: number }[] = [];
  for (const r of rows) {
    if (!r || typeof r.id !== "string" || !uuidRe.test(r.id)) {
      return json({ error: "Chaque ligne doit avoir un id UUID valide" }, 400);
    }
    const n = Math.round(Number(r.ordre));
    if (!Number.isFinite(n)) {
      return json({ error: `ordre invalide pour ${r.id}` }, 400);
    }
    clean.push({ id: r.id, ordre: n });
  }

  const updates = await Promise.all(
    clean.map((r) =>
      supabaseAdmin!.from("produits").update({ ordre: r.ordre }).eq("id", r.id)
    )
  );
  const errored = updates.find((u) => u.error);
  if (errored?.error) return json({ error: errored.error.message }, 500);

  logActivity({
    entity: "produit",
    action: "reorder",
    entity_label: `Réorganisation × ${clean.length}`,
    payload: { count: clean.length, sample: clean.slice(0, 10) },
  });
  return json({ updated: clean.length });
};
