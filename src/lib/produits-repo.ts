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
      return STATIC_FALLBACK.slice(0, limit);
    }
    const rows = (data ?? []) as DbRow[];
    if (rows.length === 0) return STATIC_FALLBACK.slice(0, limit);
    return rows.map(rowToProduitVedette);
  } catch (e: any) {
    console.warn("[produits-repo] Supabase unreachable :", e?.message || e);
    return STATIC_FALLBACK.slice(0, limit);
  }
}
