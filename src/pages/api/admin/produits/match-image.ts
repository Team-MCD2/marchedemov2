/**
 * /api/admin/produits/match-image
 * -------------------------------
 * Given a list of image filenames (typically freshly uploaded via the
 * mass drag-drop flow), return for each the best-matching product(s)
 * from the `public.produits` catalogue using the pure matcher in
 * `src/lib/image-match.ts`.
 *
 * This endpoint is purposely SEPARATE from the /produits CRUD handlers so
 * it can be called without side effects — it only READS the catalogue,
 * never writes to it. The actual `image_url` PATCH happens from the
 * client after the admin confirms the matches, using the existing
 * /api/admin/produits/[id] PATCH route. This keeps the UI flow
 * transparent and auditable : match → review → apply.
 *
 * Protected by the admin cookie (same helper as the rest of /api/admin).
 *
 *   POST body :
 *     {
 *       filenames   : string[]                 // required, 1..500 items
 *       options?    : {
 *         minScore?          : number          // default 0.55
 *         max?               : number          // candidates per file, default 5
 *         rayonHint?         : string          // slug of a rayon to prefer
 *         onlyMissingImages? : boolean         // if true, filter out products
 *                                              // that already have image_url
 *       }
 *     }
 *
 *   Response :
 *     {
 *       matches    : MatchResult[]             // same order as filenames[]
 *       catalogue  : {
 *         total            : number            // produits in DB
 *         withImage        : number            // produits with image_url set
 *         withoutImage     : number
 *         consideredCount  : number            // how many went into the matcher
 *       }
 *     }
 *
 *   Status codes :
 *     200 on success (even if zero matches — empty candidates[])
 *     400 on malformed input
 *     401 on unauthenticated admin
 *     500 on DB / server error
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildIndex,
  findMatches,
  type CatalogProduct,
  type MatchOptions,
  type MatchResult,
} from "@/lib/image-match";

export const prerender = false;

/* Hard caps to prevent a malicious / buggy client from running the matcher
   over 10k filenames × 3k products in one request.                         */
const MAX_FILENAMES = 500;
const MAX_MIN_SCORE = 0.95;
const MIN_MIN_SCORE = 0.2;
const DEFAULT_MIN_SCORE = 0.55;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!supabaseAdmin) {
    return json({ error: "Supabase service_role key missing" }, 500);
  }

  /* ---------- Parse + validate body ---------- */
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON body invalide" }, 400);
  }

  const rawFiles = body?.filenames;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return json({ error: "`filenames` doit être un tableau non vide" }, 400);
  }
  if (rawFiles.length > MAX_FILENAMES) {
    return json(
      { error: `Trop de filenames (${rawFiles.length}), max ${MAX_FILENAMES} par requête` },
      400,
    );
  }
  const filenames: string[] = rawFiles
    .map((f) => (typeof f === "string" ? f.trim() : ""))
    .filter(Boolean);
  if (filenames.length === 0) {
    return json({ error: "Aucun filename valide après nettoyage" }, 400);
  }

  const opts = body?.options ?? {};
  const matchOpts: MatchOptions = {};
  if (opts.minScore != null) {
    const n = Number(opts.minScore);
    if (!Number.isFinite(n) || n < MIN_MIN_SCORE || n > MAX_MIN_SCORE) {
      return json(
        { error: `options.minScore doit être dans [${MIN_MIN_SCORE}, ${MAX_MIN_SCORE}]` },
        400,
      );
    }
    matchOpts.minScore = n;
  } else {
    matchOpts.minScore = DEFAULT_MIN_SCORE;
  }
  if (opts.max != null) {
    const n = Number(opts.max);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return json({ error: "options.max doit être dans [1, 20]" }, 400);
    }
    matchOpts.max = Math.floor(n);
  }
  if (typeof opts.rayonHint === "string" && opts.rayonHint.trim()) {
    matchOpts.rayonHint = opts.rayonHint.trim();
  }
  const onlyMissing = opts.onlyMissingImages === true;

  /* ---------- Load catalogue ---------- */
  const { data, error } = await supabaseAdmin
    .from("produits")
    .select("id, slug, nom, rayon, categorie, sous_categorie, image_url")
    .order("rayon", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const all = (data ?? []) as CatalogProduct[];
  const withImage = all.filter((p) => !!p.image_url).length;
  const considered = onlyMissing ? all.filter((p) => !p.image_url) : all;

  /* ---------- Run matcher ---------- */
  const index = buildIndex(considered);
  const matches: MatchResult[] = filenames.map((f) => findMatches(f, index, matchOpts));

  return json({
    matches,
    catalogue: {
      total: all.length,
      withImage,
      withoutImage: all.length - withImage,
      consideredCount: considered.length,
    },
  });
};
