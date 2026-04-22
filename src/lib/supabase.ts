/**
 * Supabase clients.
 *
 * Deux clients distincts :
 *  - `supabase`       : anon/publishable key, lecture publique (RLS : actif = true).
 *                       À utiliser dans toutes les pages publiques (SSR).
 *  - `supabaseAdmin`  : service role key, bypasse RLS.
 *                       À utiliser UNIQUEMENT dans /admin ou /api/admin/*.
 *                       Vaut `null` tant que SUPABASE_SERVICE_ROLE_KEY n'est pas défini.
 *
 * Env vars : cf `.env.local` (dev) et Vercel → Settings → Env (prod).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.SUPABASE_URL;
const anonKey = import.meta.env.SUPABASE_ANON_KEY;
const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase: SUPABASE_URL ou SUPABASE_ANON_KEY manquant. " +
      "Vérifie .env.local (dev) ou Vercel Environment Variables (prod)."
  );
}

/**
 * Client public — lecture seule via RLS (policies "actif = true").
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false },
});

/**
 * Client admin — bypasse RLS, UNIQUEMENT côté serveur (pages /admin, API routes).
 * `null` si la SERVICE_ROLE_KEY n'est pas configurée (= phase bootstrap).
 */
export const supabaseAdmin: SupabaseClient | null = serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

/* ------------------------------------------------------------------ */
/* Types d'enregistrements (miroir du schéma SQL)                      */
/* ------------------------------------------------------------------ */

export type RayonSlug =
  | "boucherie-halal"
  | "fruits-legumes"
  | "epices-du-monde"
  | "saveurs-afrique"
  | "saveurs-asie"
  | "saveur-mediterranee"
  | "saveur-sud-amer"
  | "balkans-turques"
  | "produits-courants"
  | "surgeles"
  | "boulangerie"
  | "produits-laitiers";

export type MagasinSlug = "tous" | "portet" | "toulouse-sud";

export interface PromoRow {
  id: string;
  slug: string;
  titre: string;
  description: string | null;
  image_url: string | null;
  prix_original: number;
  prix_promo: number;
  reduction_pct: number;
  rayon: RayonSlug;
  magasin: MagasinSlug;
  date_debut: string;
  date_fin: string;
  mise_en_avant: boolean;
  actif: boolean;
  ordre: number;
  created_at: string;
  updated_at: string;
}

export interface ProduitRow {
  id: string;
  slug: string;
  nom: string;
  description: string | null;
  image_url: string | null;
  prix_indicatif: number | null;
  unite: string | null;
  rayon: RayonSlug;
  origine: string | null;
  badge: string | null;
  actif: boolean;
  ordre: number;
  created_at: string;
  updated_at: string;
}
