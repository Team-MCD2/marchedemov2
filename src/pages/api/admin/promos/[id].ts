/**
 * /api/admin/promos/[id]
 *
 * Per-row operations on a promo :
 *   PATCH  : partial update (any subset of allowed fields)
 *   DELETE : hard delete (use PATCH actif=false for soft-hide)
 *
 * The [id] segment accepts either the UUID primary key OR the slug.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin, type RayonSlug, type MagasinSlug } from "@/lib/supabase";
import { logActivity } from "@/lib/admin-activity";

export const prerender = false;

const ALLOWED_FIELDS = new Set([
  "titre",
  "description",
  "image_url",
  "prix_original",
  "prix_promo",
  "reduction_pct",
  "rayon",
  "magasin",
  "date_debut",
  "date_fin",
  "mise_en_avant",
  "actif",
  "ordre",
  "slug",
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
const ALLOWED_MAGASINS: readonly MagasinSlug[] = ["tous", "portet", "toulouse-sud"];

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

/* Try id as uuid, fall back to slug. Returns the canonical uuid or null. */
async function resolveIdToUuid(idOrSlug: string): Promise<string | null> {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(idOrSlug)) return idOrSlug;
  const { data } = await supabaseAdmin!
    .from("promos")
    .select("id")
    .eq("slug", idOrSlug)
    .maybeSingle();
  return data?.id ?? null;
}

/* ----------------------------------------------------------------- */
/* PATCH — partial update                                             */
/* ----------------------------------------------------------------- */
export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const rawId = params.id;
  if (!rawId) return json({ error: "Missing id" }, 400);

  const uuid = await resolveIdToUuid(rawId);
  if (!uuid) return json({ error: "Promo introuvable" }, 404);

  try {
    const body = await request.json();
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      patch[k] = v;
    }
    /* Light coercion + validation for fields present */
    if ("rayon" in patch && !ALLOWED_RAYONS.includes(patch.rayon as RayonSlug)) {
      return json({ error: `Rayon invalide : ${patch.rayon}` }, 400);
    }
    if ("magasin" in patch && !ALLOWED_MAGASINS.includes(patch.magasin as MagasinSlug)) {
      return json({ error: `Magasin invalide : ${patch.magasin}` }, 400);
    }
    if ("reduction_pct" in patch) {
      const n = Math.round(Number(patch.reduction_pct));
      if (!Number.isFinite(n) || n < 0 || n > 99) {
        return json({ error: "reduction_pct doit être entre 0 et 99" }, 400);
      }
      patch.reduction_pct = n;
    }
    for (const k of ["prix_original", "prix_promo"]) {
      if (k in patch) {
        const n = Number(patch[k]);
        if (!Number.isFinite(n) || n < 0) {
          return json({ error: `${k} doit être un nombre >= 0` }, 400);
        }
        patch[k] = n;
      }
    }
    if ("slug" in patch) {
      patch.slug = String(patch.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    }

    const { data, error } = await supabaseAdmin!
      .from("promos")
      .update(patch)
      .eq("id", uuid)
      .select()
      .single();
    if (error) throw error;
    logActivity({
      entity: "promo",
      entity_id: data?.id ?? uuid,
      entity_label: data?.titre ?? null,
      action: "update",
      payload: { fields: Object.keys(patch), patch },
    });
    return json({ promo: data });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 400);
  }
};

/* ----------------------------------------------------------------- */
/* DELETE — hard delete                                               */
/* ----------------------------------------------------------------- */
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const rawId = params.id;
  if (!rawId) return json({ error: "Missing id" }, 400);

  const uuid = await resolveIdToUuid(rawId);
  if (!uuid) return json({ error: "Promo introuvable" }, 404);

  /* Snapshot for the audit feed before the row vanishes. */
  const { data: snap } = await supabaseAdmin!
    .from("promos")
    .select("id, titre, slug, rayon")
    .eq("id", uuid)
    .maybeSingle();

  const { error } = await supabaseAdmin!.from("promos").delete().eq("id", uuid);
  if (error) return json({ error: error.message }, 500);
  logActivity({
    entity: "promo",
    entity_id: uuid,
    entity_label: snap?.titre ?? snap?.slug ?? null,
    action: "delete",
    payload: { rayon: snap?.rayon ?? null, slug: snap?.slug ?? null },
  });
  return new Response(null, { status: 204 });
};
