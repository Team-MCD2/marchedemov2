/**
 * /api/admin/produits
 *
 * Admin CRUD for the public.produits table in Supabase (catalogue).
 * Protected by the admin cookie. Writes use the service_role key.
 *
 *   GET   : list all produits (active + inactive)
 *   POST  : create one
 *   PUT   : bulk upsert (import), body = { produits: [...] }
 *
 * Schema notes :
 *   - No magasin column (catalogue is shared across both stores).
 *   - prix_indicatif is nullable : we don't always advertise a price,
 *     and the public site never shows it unless explicitly requested
 *     (no misleading "prix cassé" signal outside /promos).
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin, type RayonSlug } from "@/lib/supabase";

export const prerender = false;

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

function normalizeProduit(raw: any) {
  const required = ["slug", "nom", "rayon"];
  for (const f of required) {
    if (raw[f] === undefined || raw[f] === null || raw[f] === "") {
      throw new Error(`Champ obligatoire manquant : ${f}`);
    }
  }
  const rayon = String(raw.rayon).trim();
  if (!ALLOWED_RAYONS.includes(rayon as RayonSlug)) {
    throw new Error(`Rayon invalide : ${rayon}`);
  }
  let prix_indicatif: number | null = null;
  if (raw.prix_indicatif != null && raw.prix_indicatif !== "") {
    const n = Number(raw.prix_indicatif);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`prix_indicatif doit être un nombre >= 0 ou vide`);
    }
    prix_indicatif = n;
  }
  return {
    slug: String(raw.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    nom: String(raw.nom).trim(),
    description: raw.description != null ? String(raw.description) : "",
    image_url: raw.image_url || raw.image || null,
    prix_indicatif,
    unite: raw.unite ? String(raw.unite).trim() : null,
    rayon,
    origine: raw.origine ? String(raw.origine).trim() : null,
    badge: raw.badge ? String(raw.badge).trim() : null,
    actif: raw.actif !== false,
    ordre: Number.isFinite(Number(raw.ordre)) ? Number(raw.ordre) : 0,
  };
}

export const GET: APIRoute = async ({ cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const { data, error } = await supabaseAdmin!
    .from("produits")
    .select("*")
    .order("rayon", { ascending: true })
    .order("ordre", { ascending: true })
    .order("nom", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ produits: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  try {
    const body = await request.json();
    const row = normalizeProduit(body);
    const { data, error } = await supabaseAdmin!
      .from("produits")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return json({ produit: data }, 201);
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 400);
  }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  try {
    const body = await request.json();
    if (!Array.isArray(body.produits)) {
      return json({ error: "Format attendu : { produits: [...] }" }, 400);
    }
    const rows = body.produits.map(normalizeProduit);
    const { data, error } = await supabaseAdmin!
      .from("produits")
      .upsert(rows, { onConflict: "slug" })
      .select();
    if (error) throw error;
    return json({ produits: data ?? [], count: data?.length ?? 0 });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 400);
  }
};
