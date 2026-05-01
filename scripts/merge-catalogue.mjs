#!/usr/bin/env node
/**
 * scripts/merge-catalogue.mjs
 *
 * Combines the hand-curated starter (scripts/data/produits-starter.json)
 * and the OpenFoodFacts scrape output (scripts/data/produits-off.json)
 * into a single, normalized catalogue at src/data/produits-catalogue.json.
 *
 * This file is read by `src/lib/produits-repo.ts` as a fallback when
 * Supabase is unseeded, so /produits lights up without a database round
 * trip. Once Supabase is seeded, Supabase wins and this file is ignored
 * at runtime (but the seeder reads it to push rows).
 *
 * Merge rules:
 *   1. Starter is authoritative — its products keep their own slugs,
 *      their `ordre`, their hand-written descriptions, their badges.
 *      Starter products get `ordre` below 100 (hand-ranked).
 *   2. OFF products fill in around the starter. They carry real images.
 *      Their `ordre` is shifted to 100+ so curated always shows first.
 *   3. Dedup by slug. If a starter product shares a slug with OFF,
 *      starter wins but we borrow OFF's `image_url`.
 *   4. Every row is normalized to the shape consumed by produits-repo:
 *      { slug, nom, description, image_url, rayon, categorie,
 *        sous_categorie, origine, badge, actif, ordre }
 *
 * Safe to re-run. Output is committed so the site builds offline.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const STARTER_FILE = path.join(ROOT, "scripts", "data", "produits-starter.json");
const OFF_FILE = path.join(ROOT, "scripts", "data", "produits-off.json");
const OUT_FILE = path.join(ROOT, "src", "data", "produits-catalogue.json");

/* --------------------------------------------------------------------
   Starter → canonical shape. Starter uses `badge` for sous_categorie,
   but we want `badge` reserved for merchandising tags ("Vedette",
   "Nouveauté"). Map starter.badge → sous_categorie unless it looks
   like a merchandising tag.
   -------------------------------------------------------------------- */
const MERCH_BADGES = new Set([
  "Vedette",
  "Nouveauté",
  "Bestseller",
  "Édition limitée",
  "Halal certifié",
]);

/* Rayon-level default `categorie` when starter rows don't set one.
   Keeps the drill-down grid clean even for hand-curated items. */
const STARTER_CATEGORIE_DEFAULTS = {
  "boucherie-halal": {
    Agneau: "Agneau",
    Bœuf: "Bœuf",
    Volaille: "Volaille",
    Charcuterie: "Charcuterie",
  },
  "fruits-legumes": {
    "Fruit exotique": "Fruits",
    Exotique: "Fruits",
    Tubercule: "Légumes",
    Légume: "Légumes",
    Piment: "Piments",
    Dattes: "Dattes & fruits secs",
  },
};

function inferCategorieFromStarter(row) {
  const defaults = STARTER_CATEGORIE_DEFAULTS[row.rayon] ?? {};
  if (row.badge && defaults[row.badge]) return defaults[row.badge];
  return null;
}

function starterToCanonical(row) {
  const isMerch = row.badge && MERCH_BADGES.has(row.badge);
  return {
    slug: row.slug,
    nom: row.nom,
    description: row.description || "",
    image_url: null /* starter has no images; OFF merge may fill */,
    rayon: row.rayon,
    categorie: inferCategorieFromStarter(row),
    sous_categorie: !isMerch ? row.badge ?? null : null,
    origine: row.origine ?? null,
    badge: isMerch ? row.badge : null,
    actif: true,
    ordre: typeof row.ordre === "number" ? row.ordre : 50,
    unite: row.unite ?? null,
    _source: "starter",
  };
}

function offToCanonical(row) {
  return {
    slug: row.slug,
    nom: row.nom,
    description: row.description || "",
    image_url: row.image_url || null,
    rayon: row.rayon,
    categorie: row.categorie ?? null,
    sous_categorie: row.sous_categorie ?? null,
    origine: row.origine ?? null,
    badge: row.badge ?? null,
    actif: row.actif !== false,
    ordre: 100 + (typeof row.ordre === "number" ? row.ordre : 0),
    unite: null,
    _source: "openfoodfacts",
    _source_code: row._source_code ?? null,
    _brands: row._brands ?? null,
  };
}

async function main() {
  const starterRaw = JSON.parse(await readFile(STARTER_FILE, "utf8"));
  const offRaw = JSON.parse(await readFile(OFF_FILE, "utf8"));

  const starter = (starterRaw.produits || []).map(starterToCanonical);
  const off = (offRaw.produits || []).map(offToCanonical);

  const bySlug = new Map();

  /* Starter first — wins on conflict. */
  for (const row of starter) bySlug.set(row.slug, row);

  /* OFF second — adds new slugs, OR fills image on existing. */
  let imagesBorrowed = 0;
  for (const row of off) {
    const existing = bySlug.get(row.slug);
    if (existing) {
      if (!existing.image_url && row.image_url) {
        existing.image_url = row.image_url;
        imagesBorrowed += 1;
      }
      continue;
    }
    bySlug.set(row.slug, row);
  }

  const produits = Array.from(bySlug.values()).sort((a, b) => {
    if (a.rayon !== b.rayon) return a.rayon.localeCompare(b.rayon);
    if (a.ordre !== b.ordre) return a.ordre - b.ordre;
    return a.nom.localeCompare(b.nom, "fr");
  });

  const byRayon = {};
  for (const p of produits) {
    byRayon[p.rayon] = (byRayon[p.rayon] || 0) + 1;
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        _generated_at: new Date().toISOString(),
        _count: produits.length,
        _sources: {
          starter: starter.length,
          openfoodfacts: off.length,
          images_borrowed: imagesBorrowed,
        },
        _by_rayon: byRayon,
        produits,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`[merge] ✓ wrote ${produits.length} produits → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[merge]   starter=${starter.length}, off=${off.length}, images-borrowed=${imagesBorrowed}`);
  console.log(`[merge]   by rayon :`);
  for (const [r, c] of Object.entries(byRayon).sort()) {
    console.log(`            ${r.padEnd(24)} ${c}`);
  }
}

main().catch((err) => {
  console.error("[merge] ✗", err);
  process.exit(1);
});
