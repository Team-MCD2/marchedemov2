/**
 * /api/admin/produits/[id]
 *
 *   PATCH  : partial update on a single produit (by uuid or slug).
 *   DELETE : hard delete.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin, type RayonSlug } from "@/lib/supabase";
import { logActivity } from "@/lib/admin-activity";

export const prerender = false;

const ALLOWED_FIELDS = new Set([
  "slug",
  "nom",
  "description",
  "image_url",
  "prix_indicatif",
  "unite",
  "rayon",
  "categorie",
  "sous_categorie",
  "origine",
  "badge",
  "actif",
  "ordre",
]);

const ALLOWED_RAYONS: readonly RayonSlug[] = [
  "boucherie-halal",
  "fruits-legumes",
  "epices-du-monde",
  "saveurs-afrique",
  "saveurs-asie",
  "saveur-mediterranee",
  "saveur-sud-amer",
  "balkans-turques",
  "produits-courants",
  "surgeles",
  "boulangerie",
  "produits-laitiers",
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requireAdmin(cookies: import("astro").AstroCookies): Promise<Response | null> {
  if (!(await isAuthenticated(cookies))) return json({ error: "Unauthorized" }, 401);
  if (!supabaseAdmin) return json({ error: "Supabase service_role key missing" }, 500);
  return null;
}

async function resolveIdToUuid(idOrSlug: string): Promise<string | null> {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(idOrSlug)) return idOrSlug;
  const { data } = await supabaseAdmin!
    .from("produits")
    .select("id")
    .eq("slug", idOrSlug)
    .maybeSingle();
  return data?.id ?? null;
}

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const rawId = params.id;
  if (!rawId) return json({ error: "Missing id" }, 400);

  const uuid = await resolveIdToUuid(rawId);
  if (!uuid) return json({ error: "Produit introuvable" }, 404);

  try {
    const body = await request.json();
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      patch[k] = v;
    }
    if ("rayon" in patch && !ALLOWED_RAYONS.includes(patch.rayon as RayonSlug)) {
      return json({ error: `Rayon invalide : ${patch.rayon}` }, 400);
    }
    if ("prix_indicatif" in patch) {
      if (patch.prix_indicatif === "" || patch.prix_indicatif == null) {
        patch.prix_indicatif = null;
      } else {
        const n = Number(patch.prix_indicatif);
        if (!Number.isFinite(n) || n < 0) {
          return json({ error: "prix_indicatif doit être un nombre >= 0 ou null" }, 400);
        }
        patch.prix_indicatif = n;
      }
    }
    if ("slug" in patch) {
      patch.slug = String(patch.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    }

    const { data, error } = await supabaseAdmin!
      .from("produits")
      .update(patch)
      .eq("id", uuid)
      .select()
      .single();
    if (error) throw error;
    logActivity({
      entity: "produit",
      entity_id: data?.id ?? uuid,
      entity_label: data?.nom ?? null,
      action: "update",
      payload: { fields: Object.keys(patch), patch },
    });
    return json({ produit: data });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 400);
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const rawId = params.id;
  if (!rawId) return json({ error: "Missing id" }, 400);

  const uuid = await resolveIdToUuid(rawId);
  if (!uuid) return json({ error: "Produit introuvable" }, 404);

  /* Capture label before the row disappears so the audit feed stays
   * readable. */
  const { data: snap } = await supabaseAdmin!
    .from("produits")
    .select("id, nom, slug, rayon")
    .eq("id", uuid)
    .maybeSingle();

  const { error } = await supabaseAdmin!.from("produits").delete().eq("id", uuid);
  if (error) return json({ error: error.message }, 500);
  logActivity({
    entity: "produit",
    entity_id: uuid,
    entity_label: snap?.nom ?? snap?.slug ?? null,
    action: "delete",
    payload: { rayon: snap?.rayon ?? null, slug: snap?.slug ?? null },
  });
  return new Response(null, { status: 204 });
};
