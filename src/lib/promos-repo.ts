/**
 * Promos repository — single source of truth for the rest of the app.
 *
 * Reads from Supabase (public.promos, RLS-enforced actif=true) when
 * the DB is reachable, falls back to Content Collections
 * (src/content/promos/*.json) otherwise. That fallback is what keeps
 * dev + preview builds working when Supabase env vars are missing,
 * and means a DB outage downgrades gracefully to stale data rather
 * than a white page.
 *
 * All pages that used to call `getCollection("promos")` should import
 * from here instead : the returned shape is identical to the Content
 * Collection schema, so existing PromoCard props still work.
 */
import { getCollection } from "astro:content";
import { supabase } from "@/lib/supabase";

/** Shape that all consumers expect. Mirrors the Content Collection. */
export interface PromoData {
  id: string;
  titre: string;
  description: string;
  image: string;
  prix_original: number;
  prix_promo: number;
  reduction_pct: number;
  rayon: string;
  magasin: "tous" | "portet" | "toulouse-sud";
  date_debut: string;
  date_fin: string;
  mise_en_avant: boolean;
  actif: boolean;
  ordre: number;
}

/* Mimics CollectionEntry<"promos"> so existing callers don't break. */
export interface PromoEntry {
  id: string;
  slug: string;
  collection: "promos";
  data: PromoData;
}

function rowToEntry(row: any): PromoEntry {
  return {
    id: row.id,
    slug: row.slug,
    collection: "promos",
    data: {
      id: row.slug,
      titre: row.titre,
      description: row.description ?? "",
      image: row.image_url ?? "",
      prix_original: Number(row.prix_original),
      prix_promo: Number(row.prix_promo),
      reduction_pct: Number(row.reduction_pct),
      rayon: row.rayon,
      magasin: row.magasin,
      date_debut: row.date_debut,
      date_fin: row.date_fin,
      mise_en_avant: !!row.mise_en_avant,
      actif: !!row.actif,
      ordre: Number(row.ordre ?? 0),
    },
  };
}

async function fromSupabase(): Promise<PromoEntry[] | null> {
  try {
    const { data, error } = await supabase
      .from("promos")
      .select("*")
      .eq("actif", true)
      .order("mise_en_avant", { ascending: false })
      .order("ordre", { ascending: true })
      .order("date_fin", { ascending: true });
    if (error) {
      console.warn("[promos-repo] Supabase error, falling back to Content Collection :", error.message);
      return null;
    }
    return (data ?? []).map(rowToEntry);
  } catch (e: any) {
    console.warn("[promos-repo] Supabase unreachable, falling back :", e?.message || e);
    return null;
  }
}

async function fromContentCollection(): Promise<PromoEntry[]> {
  const items = await getCollection("promos");
  return items
    .filter((p) => p.data.actif)
    .map((p): PromoEntry => ({
      id: String(p.id),
      slug: String(p.id), /* Content Collection uses id as slug */
      collection: "promos",
      data: {
        id: p.data.id,
        titre: p.data.titre,
        description: p.data.description ?? "",
        image: p.data.image,
        prix_original: Number(p.data.prix_original),
        prix_promo: Number(p.data.prix_promo),
        reduction_pct: p.data.reduction_pct,
        rayon: p.data.rayon,
        magasin: p.data.magasin,
        date_debut: p.data.date_debut,
        date_fin: p.data.date_fin,
        mise_en_avant: !!p.data.mise_en_avant,
        actif: !!p.data.actif,
        ordre: 0, /* Content Collection doesn't have ordre — default 0 */
      },
    }));
}

/**
 * Returns all active promos, sorted (featured first, then by ordre,
 * then by date_fin). Tries Supabase, falls back to Content Collection.
 */
export async function getActivePromos(): Promise<PromoEntry[]> {
  const supa = await fromSupabase();
  if (supa && supa.length > 0) return supa;
  return fromContentCollection();
}

/**
 * Returns active promos for a specific rayon (for /rayons/[slug]).
 */
export async function getPromosForRayon(slug: string): Promise<PromoEntry[]> {
  const all = await getActivePromos();
  return all.filter((p) => p.data.rayon === slug);
}
