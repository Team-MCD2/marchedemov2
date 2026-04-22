#!/usr/bin/env node
/**
 * scripts/scrape/openfoodfacts.mjs
 *
 * Fetches ~200-400 products from OpenFoodFacts public API (openfoodfacts.org)
 * and normalizes them into our Supabase `produits` schema.
 *
 * Strategy : for each rayon, we query OFF with a curated set of search terms
 * or category tags. Results are deduplicated by barcode (EAN/code), filtered
 * to keep only items with a usable front image, then serialized to
 * `scripts/data/produits-off.json` for the merge step.
 *
 * Output :
 *   scripts/data/produits-off.json        — normalized produits (commit-safe)
 *   .tmp/off-cache/<query>.json           — raw API responses (gitignored)
 *   .tmp/off-scrape-report.json           — audit of what was kept/skipped
 *
 * Safe to re-run : cache avoids hitting the API twice. Delete `.tmp/off-cache`
 * to force a fresh pull.
 *
 * Legal : OFF data is CC-BY-SA 3.0. We store the image URL (pointing to OFF
 * CDN) rather than copying images, which respects the license and keeps
 * our repo light. Attribution in CREDITS.md.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const CACHE_DIR = path.join(ROOT, ".tmp", "off-cache");
const OUT_FILE = path.join(ROOT, "scripts", "data", "produits-off.json");
const REPORT_FILE = path.join(ROOT, ".tmp", "off-scrape-report.json");

/* Must stay ASCII-only (HTTP header constraint) — no em-dash, no accents. */
const USER_AGENT =
  "MarcheDeMo-V2-Scraper/1.0 (+contact@marchedemo.com) " +
  "Node.js/22 own-catalogue builder, https://marchedemo.com";

const OFF_BASE = "https://world.openfoodfacts.org";
/* API v2 endpoint — supports field selection which cuts payload 10x. */
const OFF_SEARCH = `${OFF_BASE}/api/v2/search`;

/* Fields we actually need. Requesting only these cuts payload by ~90%. */
const FIELDS = [
  "code",
  "product_name",
  "product_name_fr",
  "generic_name_fr",
  "brands",
  "brands_tags",
  "categories_tags",
  "countries_tags",
  "origins",
  "image_front_url",
  "image_front_small_url",
  "image_url",
  "nutriscore_grade",
  "packaging",
  "quantity",
  "labels_tags",
].join(",");

/* --------------------------------------------------------------------
   QUERY PLAN — per rayon, a list of OFF categories_tags_en to filter.
   OpenFoodFacts has a strict taxonomy under /categories.json; using
   `categories_tags_en=en:<slug>` gives RELEVANT results (filtered on
   the actual product category), unlike `search_terms` which returns
   anything with keyword overlap sorted by popularity.

   Taxonomy reference :
     https://static.openfoodfacts.org/data/taxonomies/categories.txt

   Each entry is { tag: "en:something", limit: 15 }. Limit per-category
   so we don't flood a single rayon.
   -------------------------------------------------------------------- */
const QUERY_PLAN = {
  "epices-du-monde": [
    { tag: "en:spices", limit: 30 },
    { tag: "en:teas", limit: 12 },
    { tag: "en:herbs-and-spices", limit: 10 },
    { tag: "en:salts", limit: 6 },
  ],
  "saveurs-asie": [
    { tag: "en:soy-sauces", limit: 12 },
    { tag: "en:asian-noodles", limit: 12 },
    { tag: "en:rices", limit: 15 },
    { tag: "en:curry-pastes", limit: 8 },
    { tag: "en:coconut-milks", limit: 8 },
    { tag: "en:hot-sauces", limit: 8 },
    { tag: "en:sesame-oils", limit: 6 },
    { tag: "en:rice-noodles", limit: 8 },
  ],
  "saveurs-afrique": [
    { tag: "en:palm-oils", limit: 8 },
    { tag: "en:dried-hibiscus", limit: 4 },
    { tag: "en:couscous-semolinas", limit: 8 },
    { tag: "en:stock-cubes", limit: 8 },
  ],
  "saveur-mediterranee": [
    { tag: "en:olive-oils", limit: 15 },
    { tag: "en:olives", limit: 12 },
    { tag: "en:feta", limit: 8 },
    { tag: "en:couscous", limit: 10 },
    { tag: "en:harissas", limit: 6 },
    { tag: "en:honeys", limit: 8 },
  ],
  "saveur-sud-amer": [
    { tag: "en:mate-drinks", limit: 6 },
    { tag: "en:black-beans", limit: 6 },
    { tag: "en:tortillas", limit: 8 },
  ],
  "balkans-turques": [
    { tag: "en:baklava", limit: 6 },
    { tag: "en:halvah", limit: 6 },
    { tag: "en:turkish-teas", limit: 4 },
  ],
  "fruits-legumes": [
    { tag: "en:dates", limit: 8 },
    { tag: "en:dried-fruits", limit: 10 },
    { tag: "en:compotes", limit: 8 },
    { tag: "en:fruit-juices", limit: 10 },
  ],
  "surgeles": [
    { tag: "en:frozen-vegetables", limit: 10 },
    { tag: "en:frozen-pizzas", limit: 6 },
    { tag: "en:mochis", limit: 4 },
    { tag: "en:edamame", limit: 4 },
  ],
  "produits-courants": [
    { tag: "en:pastas", limit: 10 },
    { tag: "en:flours", limit: 8 },
    { tag: "en:sugars", limit: 6 },
    { tag: "en:lentils", limit: 6 },
    { tag: "en:chickpeas", limit: 6 },
    { tag: "en:peeled-tomatoes", limit: 6 },
  ],
  /* boucherie-halal skipped — OFF rarely has fresh meat packshots. */
};

/* --------------------------------------------------------------------
   Rayon-specific category/sous_categorie mapping, mirroring what's in
   scripts/seed-produits.mjs BADGE_MAP. When a product's OFF categories
   match one of our patterns, we assign a canonical categorie.
   -------------------------------------------------------------------- */
const CATEGORIE_INFER = {
  "epices-du-monde": [
    { match: /en:ras-el-hanout|en:berb[ée]r[ée]/i, categorie: "Maghreb" },
    { match: /en:curry|en:garam-masala|en:tikka/i, categorie: "Inde", sous: "Simples" },
    { match: /en:chili|en:piment|en:hot-sauces/i, categorie: "Piments" },
    { match: /en:za-atar|en:sumac/i, categorie: "Méditerranée" },
    { match: /en:spices|en:moulu/i, categorie: "Maghreb" },
  ],
  "saveurs-asie": [
    { match: /en:rice|en:riz/i, categorie: "Riz & nouilles", sous: "Riz" },
    { match: /en:noodles|en:udon|en:ramen/i, categorie: "Riz & nouilles", sous: "Nouilles" },
    { match: /en:soy-sauces|en:kikkoman/i, categorie: "Sauces & condiments", sous: "Soja" },
    { match: /en:kimchi/i, categorie: "Frais", sous: "Kimchi" },
    { match: /en:coconut-milks/i, categorie: "Épicerie", sous: "Lait coco" },
    { match: /en:curry-pastes/i, categorie: "Sauces & condiments", sous: "Pâtes curry" },
  ],
  "saveurs-afrique": [
    { match: /en:attieke|en:couscous-semoule/i, categorie: "Féculents & farines" },
    { match: /en:hibiscus|en:bissap/i, categorie: "Épicerie", sous: "Boissons" },
    { match: /en:palm-oil|en:huile-palme/i, categorie: "Huiles" },
    { match: /en:manioc-flours|en:fufu/i, categorie: "Féculents & farines" },
    { match: /en:stock-cubes|en:maggi/i, categorie: "Sauces & condiments" },
  ],
  "saveur-mediterranee": [
    { match: /en:olive-oils/i, categorie: "Huiles & vinaigres" },
    { match: /en:olives-noires|en:olives-vertes|en:kalamata/i, categorie: "Olives & tapenades" },
    { match: /en:feta|en:cheeses/i, categorie: "Fromages", sous: "AOP" },
    { match: /en:couscous|en:semoules/i, categorie: "Semoules & couscous" },
    { match: /en:harissa|en:sauces-pim/i, categorie: "Harissas & condiments" },
    { match: /en:tahini|en:pate-sesame/i, categorie: "Harissas & condiments" },
  ],
  "saveur-sud-amer": [
    { match: /en:yerba-mate/i, categorie: "Boissons" },
    { match: /en:dulce-de-leche/i, categorie: "Sucré" },
    { match: /en:beans|en:haricots/i, categorie: "Légumineuses" },
    { match: /en:tortillas|en:arepa/i, categorie: "Farines" },
  ],
  "balkans-turques": [
    { match: /en:baklava|en:patisseries/i, categorie: "Pâtisseries", sous: "Baklava" },
    { match: /en:ayran|en:boissons/i, categorie: "Boissons" },
    { match: /en:feta|en:beyaz|en:cheeses/i, categorie: "Fromages" },
    { match: /en:halva/i, categorie: "Fruits secs & noix" },
    { match: /en:tea|en:thes/i, categorie: "Boissons" },
  ],
  "fruits-legumes": [
    { match: /en:dates/i, categorie: "Dattes & fruits secs", sous: "Dattes" },
    { match: /en:compotes|en:jus/i, categorie: "Fruits", sous: "Transformés" },
  ],
  "surgeles": [
    { match: /en:samossas|en:nems|en:bricks|en:gyoza/i, categorie: "Apéritifs" },
    { match: /en:pizzas/i, categorie: "Plats préparés halal" },
    { match: /en:edamame|en:frozen-vegetables/i, categorie: "Légumes" },
    { match: /en:mochi|en:glaces/i, categorie: "Desserts" },
  ],
  "produits-courants": [
    { match: /en:rice|en:riz/i, categorie: "Épicerie salée" },
    { match: /en:sugars|en:sucres/i, categorie: "Épicerie sucrée" },
    { match: /en:oils/i, categorie: "Épicerie salée" },
    { match: /en:flours|en:farines/i, categorie: "Épicerie salée" },
    { match: /en:tomato|en:conserves/i, categorie: "Épicerie salée" },
    { match: /en:legumes-secs|en:lentilles|en:pois-chiches/i, categorie: "Épicerie salée" },
  ],
};

/* --------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(level, ...args) {
  const tag = { info: "·", ok: "✓", warn: "!", err: "✗" }[level] ?? "·";
  console.log(`[off] ${tag}`, ...args);
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}
async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/* slugify — French-aware, removes accents, keeps alphanum + dashes. */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function cleanQueryForCache(q) {
  return slugify(q);
}

/* Infer ISO origin from OFF's countries_tags (["en:france","en:turkey"]). */
function inferOrigine(countriesTags = [], origins = "") {
  /* Prefer `origins` field when available (e.g. "Origine Turquie"). */
  if (origins && typeof origins === "string") {
    return origins.replace(/^Origine\s*:?\s*/i, "").trim().slice(0, 80);
  }
  /* Fallback to first non-France country in countries_tags. */
  const nonFr = countriesTags.find((c) => c !== "en:france");
  if (nonFr) return nonFr.replace("en:", "").replace(/-/g, " ");
  if (countriesTags.includes("en:france")) return "France";
  return null;
}

/* Infer categorie/sous_categorie from OFF categories_tags + our map. */
function inferCategorie(rayon, categoriesTags = []) {
  const map = CATEGORIE_INFER[rayon];
  if (!map) return { categorie: null, sous_categorie: null };
  const blob = categoriesTags.join(" ");
  for (const rule of map) {
    if (rule.match.test(blob)) {
      return { categorie: rule.categorie, sous_categorie: rule.sous ?? null };
    }
  }
  return { categorie: null, sous_categorie: null };
}

/* Pick the best image URL from OFF's offering. */
function pickImage(p) {
  return (
    p.image_front_url ||
    p.image_url ||
    p.image_front_small_url ||
    null
  );
}

/* Sanity filter : reject products without image or with a placeholder. */
function isUsable(p) {
  const img = pickImage(p);
  if (!img) return false;
  /* OFF sometimes returns a tiny placeholder — filter by URL pattern. */
  if (img.includes("/placeholder") || img.includes("image_not_available")) return false;
  if (!p.product_name && !p.product_name_fr) return false;
  return true;
}

/* --------------------------------------------------------------------
   Fetch one query with on-disk cache + retry on 503.
   OFF's search API returns 503 under load; we retry with exponential
   backoff (2s, 4s, 8s) up to 3 times per query before giving up.
   -------------------------------------------------------------------- */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

async function fetchQuery(tag, pageSize) {
  const cacheFile = path.join(CACHE_DIR, `${cleanQueryForCache(tag)}.json`);
  if (await fileExists(cacheFile)) {
    log("info", `cache hit : "${tag}"`);
    return JSON.parse(await readFile(cacheFile, "utf8"));
  }

  const url = new URL(OFF_SEARCH);
  /* categories_tags_en=en:spices → narrows to the actual category tree.
     Much more reliable than search_terms which is near-random. */
  url.searchParams.set("categories_tags_en", tag);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("sort_by", "popularity_key");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("countries_tags_en", "france");
  url.searchParams.set("lc", "fr");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const attemptStr = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : "";
    log("info", `fetching : "${tag}" (${pageSize} max)${attemptStr}`);

    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
    } catch (err) {
      log("warn", `network error on "${tag}" : ${err.message}`);
      res = null;
    }

    if (res && res.ok) {
      const json = await res.json();
      await writeFile(cacheFile, JSON.stringify(json, null, 2), "utf8");
      await sleep(2500); /* polite throttle between successful calls */
      return json;
    }

    const status = res?.status ?? "NETWORK";
    if (attempt === MAX_RETRIES) {
      log("err", `HTTP ${status} on "${tag}" (gave up after ${MAX_RETRIES} retries)`);
      return { products: [] };
    }

    /* Backoff : 2s, 4s, 8s */
    const wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
    log("warn", `HTTP ${status} on "${tag}" — backoff ${wait}ms`);
    await sleep(wait);
  }

  return { products: [] };
}

/* --------------------------------------------------------------------
   Main orchestrator
   -------------------------------------------------------------------- */
async function main() {
  await ensureDir(CACHE_DIR);
  await ensureDir(path.dirname(OUT_FILE));

  const bySlug = new Map(); /* dedup by slug */
  const report = { queriedTotal: 0, fetched: 0, kept: 0, perRayon: {} };

  for (const [rayon, queries] of Object.entries(QUERY_PLAN)) {
    report.perRayon[rayon] = { queried: 0, kept: 0 };

    for (const { tag, limit } of queries) {
      report.queriedTotal += 1;
      report.perRayon[rayon].queried += 1;

      const { products = [] } = await fetchQuery(tag, limit);
      report.fetched += products.length;

      for (const p of products) {
        if (!isUsable(p)) continue;

        const name = (p.product_name_fr || p.product_name || "").trim();
        const slug = slugify(`${name}-${p.code || ""}`);
        if (!slug || bySlug.has(slug)) continue;

        const { categorie, sous_categorie } = inferCategorie(
          rayon,
          p.categories_tags || [],
        );

        bySlug.set(slug, {
          slug,
          nom: name.slice(0, 100),
          description: (p.generic_name_fr || "").slice(0, 240),
          image_url: pickImage(p),
          rayon,
          categorie,
          sous_categorie,
          origine: inferOrigine(p.countries_tags || [], p.origins),
          badge: null,
          actif: true,
          ordre: 100,
          /* Source attribution for CREDITS.md — not persisted in Supabase. */
          _source: "openfoodfacts",
          _source_code: p.code,
          _brands: p.brands || null,
        });

        report.kept += 1;
        report.perRayon[rayon].kept += 1;
      }
    }
  }

  const produits = Array.from(bySlug.values());

  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        _source: "OpenFoodFacts (CC-BY-SA 3.0)",
        _fetched_at: new Date().toISOString(),
        _count: produits.length,
        produits,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  log("ok", `wrote ${produits.length} products → ${path.relative(ROOT, OUT_FILE)}`);
  log("info", `report → ${path.relative(ROOT, REPORT_FILE)}`);
  console.log("\nRépartition par rayon :");
  for (const [rayon, counts] of Object.entries(report.perRayon).sort()) {
    const line = `  ${rayon.padEnd(24)} → ${String(counts.kept).padStart(3)} gardés / ${counts.queried} queries`;
    console.log(line);
  }
}

main().catch((err) => {
  console.error("[off] ✗", err);
  process.exit(1);
});
