/**
 * Produits repository — Supabase-first, with static fallback for the
 * "Produits vedettes" home slot.
 *
 * Why a repo layer : the home page used to read PRODUITS_VEDETTES
 * from src/lib/produits-vedettes.ts (static placeholder). Now it
 * should read from Supabase so the admin can curate the showcase
 * without a redeploy. We keep the static list as a resilience fallback
 * so the page never breaks if Supabase is unreachable at build time.
 *
 * Featured logic : for now, we treat the 8 produits with the smallest
 * `ordre` value (and actif=true) across all rayons as "vedettes". This
 * avoids adding a schema column. Admins control the showcase by
 * editing `ordre` in /admin/produits — lower = more prominent.
 */
import { supabase } from "@/lib/supabase";
import {
  PRODUITS_VEDETTES as STATIC_FALLBACK,
  type ProduitVedette,
} from "@/lib/produits-vedettes";
import CATALOGUE_JSON from "@/data/produits-catalogue.json";

/* --------------------------------------------------------------------
   Local catalogue fallback
   -------------------------------------------------------------------- */

interface CatalogueRow {
  slug: string;
  nom: string;
  description: string;
  image_url: string | null;
  rayon: string;
  categorie: string | null;
  sous_categorie: string | null;
  origine: string | null;
  badge: string | null;
  actif: boolean;
  ordre: number;
  unite?: string | null;
}

const LOCAL_CATALOGUE = (CATALOGUE_JSON as { produits: CatalogueRow[] }).produits
  .filter((r) => r.actif !== false);

interface DbRow {
  slug: string;
  nom: string;
  description: string | null;
  image_url: string | null;
  rayon: string;
  badge: string | null;
  origine: string | null;
  ordre: number;
}

function rowToProduitVedette(r: DbRow): ProduitVedette {
  return {
    id: r.slug,
    nom: r.nom,
    image: r.image_url ?? "",
    rayon: r.rayon as ProduitVedette["rayon"],
    badge: r.badge ?? undefined,
    origine: r.origine ?? undefined,
  };
}

/**
 * Returns up to `limit` featured produits (by ordre asc, nom asc).
 * No longer filters by image_url : the ProduitCard handles missing
 * images with a clean branded placeholder, so returning all actif
 * rows gives better coverage and the admin can upload a real image
 * later without needing to re-rank anything.
 *
 * Falls back to the static placeholder list (with .image cleared)
 * only if Supabase is completely unreachable.
 */
export async function getProduitsVedettes(limit = 8): Promise<ProduitVedette[]> {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select("slug, nom, description, image_url, rayon, badge, origine, ordre")
      .eq("actif", true)
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true })
      .limit(limit);
    if (error) {
      console.warn("[produits-repo] Supabase error :", error.message);
      return vedettesFromLocal(limit);
    }
    const rows = (data ?? []) as DbRow[];
    if (rows.length === 0) return vedettesFromLocal(limit);
    return rows.map(rowToProduitVedette);
  } catch (e: any) {
    console.warn("[produits-repo] Supabase unreachable :", e?.message || e);
    return vedettesFromLocal(limit);
  }
}

/* Vedettes from local catalogue — pick lowest `ordre` per rayon up to
   `limit`, preferring rows with an image. Falls back to STATIC_FALLBACK
   if the local catalogue itself is missing (shouldn't happen). */
function vedettesFromLocal(limit: number): ProduitVedette[] {
  if (LOCAL_CATALOGUE.length === 0) return STATIC_FALLBACK.slice(0, limit);
  const sorted = [...LOCAL_CATALOGUE].sort((a, b) => {
    const ai = a.image_url ? 0 : 1;
    const bi = b.image_url ? 0 : 1;
    if (ai !== bi) return ai - bi;
    if (a.ordre !== b.ordre) return a.ordre - b.ordre;
    return a.nom.localeCompare(b.nom, "fr");
  });
  return sorted.slice(0, limit).map((r) => ({
    id: r.slug,
    nom: r.nom,
    image: r.image_url ?? "",
    rayon: r.rayon as ProduitVedette["rayon"],
    badge: r.badge ?? undefined,
    origine: r.origine ?? undefined,
  }));
}

/* --------------------------------------------------------------------
   Full catalogue helpers — power the public /produits page.
   -------------------------------------------------------------------- */

export interface ProduitPublic {
  slug: string;
  nom: string;
  description: string;
  image: string | null;
  rayon: string;
  categorie: string | null;
  sous_categorie: string | null;
  origine: string | null;
  badge: string | null;
  ordre: number;
}

interface DbRowFull extends DbRow {
  categorie: string | null;
  sous_categorie: string | null;
}

function rowToProduitPublic(r: DbRowFull): ProduitPublic {
  return {
    slug: r.slug,
    nom: r.nom,
    description: r.description ?? "",
    image: r.image_url,
    rayon: r.rayon,
    categorie: r.categorie,
    sous_categorie: r.sous_categorie,
    origine: r.origine,
    badge: r.badge,
    ordre: r.ordre,
  };
}

/**
 * Full catalogue — every actif produit, ordered by rayon then ordre.
 * Used by /produits to build the client-side filterable grid.
 *
 * This may return hundreds of rows after seeding. Supabase's default
 * row cap is 1000 which is more than enough; beyond that we'd paginate.
 */
export async function getAllProduits(): Promise<ProduitPublic[]> {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select(
        "slug, nom, description, image_url, rayon, categorie, sous_categorie, origine, badge, ordre",
      )
      .eq("actif", true)
      .order("rayon", { ascending: true })
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true });
    if (error || !data || data.length === 0) {
      if (error) console.warn("[produits-repo] getAllProduits error :", error.message);
      return allFromLocal();
    }
    return data.map((r) => rowToProduitPublic(r as DbRowFull));
  } catch (e: any) {
    console.warn("[produits-repo] Supabase unreachable :", e?.message || e);
    return allFromLocal();
  }
}

function allFromLocal(): ProduitPublic[] {
  return LOCAL_CATALOGUE.map(localToPublic);
}

function localToPublic(r: CatalogueRow): ProduitPublic {
  return {
    slug: r.slug,
    nom: r.nom,
    description: r.description ?? "",
    image: r.image_url,
    rayon: r.rayon,
    categorie: r.categorie,
    sous_categorie: r.sous_categorie,
    origine: r.origine,
    badge: r.badge,
    ordre: r.ordre,
  };
}

/**
 * Every produit for one rayon, drill-down filterable.
 * Used by /produits/[rayon] and the rayon-page deep dive section.
 */
export async function getProduitsByRayon(rayon: string): Promise<ProduitPublic[]> {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select(
        "slug, nom, description, image_url, rayon, categorie, sous_categorie, origine, badge, ordre",
      )
      .eq("actif", true)
      .eq("rayon", rayon)
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true });
    if (error || !data || data.length === 0) {
      if (error) console.warn("[produits-repo] getProduitsByRayon error :", error.message);
      return LOCAL_CATALOGUE.filter((r) => r.rayon === rayon).map(localToPublic);
    }
    return data.map((r) => rowToProduitPublic(r as DbRowFull));
  } catch (e: any) {
    console.warn("[produits-repo] Supabase unreachable :", e?.message || e);
    return LOCAL_CATALOGUE.filter((r) => r.rayon === rayon).map(localToPublic);
  }
}

/**
 * Single produit by slug — used by /produits/[slug].
 * Returns null if not found or inactif.
 */
export async function getProduitBySlug(
  slug: string,
): Promise<ProduitPublic | null> {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select(
        "slug, nom, description, image_url, rayon, categorie, sous_categorie, origine, badge, ordre",
      )
      .eq("actif", true)
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.warn("[produits-repo] getProduitBySlug error :", error.message);
      const local = LOCAL_CATALOGUE.find((r) => r.slug === slug);
      return local ? localToPublic(local) : null;
    }
    return rowToProduitPublic(data as DbRowFull);
  } catch (e: any) {
    console.warn("[produits-repo] Supabase unreachable :", e?.message || e);
    const local = LOCAL_CATALOGUE.find((r) => r.slug === slug);
    return local ? localToPublic(local) : null;
  }
}

/* Returns every distinct slug — useful for getStaticPaths in
   /produits/[slug]. Prefers Supabase when seeded, otherwise uses local. */
export async function getAllProduitSlugs(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select("slug")
      .eq("actif", true);
    if (error || !data || data.length === 0) {
      return LOCAL_CATALOGUE.map((r) => r.slug);
    }
    return data.map((r: { slug: string }) => r.slug);
  } catch {
    return LOCAL_CATALOGUE.map((r) => r.slug);
  }
}
