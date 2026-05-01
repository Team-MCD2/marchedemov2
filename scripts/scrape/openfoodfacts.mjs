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

/* --------------------------------------------------------------------
   ENDPOINTS — we try two backends and whichever responds wins.

   1. `search.openfoodfacts.org` — the new ElasticSearch-powered search
      service. Purpose-built for search, handles load much better than
      the legacy MongoDB backend. Returns `hits` array.

   2. `world.openfoodfacts.org/api/v2/search` — the legacy API. Still
      works when search.* is being indexed. Returns `products` array.

   Both accept the same `fields` list; query syntax differs (Lucene vs
   named params) so we build per-endpoint URLs.
   -------------------------------------------------------------------- */
const OFF_SEARCH_NEW = "https://search.openfoodfacts.org/search";
const OFF_SEARCH_LEGACY = "https://world.openfoodfacts.org/api/v2/search";

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

/* Country tag → French display name. Covers the countries we see in OFF data. */
const COUNTRY_FR = {
  "en:france": "France",
  "en:germany": "Allemagne",
  "en:belgium": "Belgique",
  "en:switzerland": "Suisse",
  "en:luxembourg": "Luxembourg",
  "en:netherlands": "Pays-Bas",
  "en:united-kingdom": "Royaume-Uni",
  "en:spain": "Espagne",
  "en:italy": "Italie",
  "en:portugal": "Portugal",
  "en:austria": "Autriche",
  "en:czech-republic": "République tchèque",
  "en:croatia": "Croatie",
  "en:poland": "Pologne",
  "en:greece": "Grèce",
  "en:turkey": "Turquie",
  "en:morocco": "Maroc",
  "en:tunisia": "Tunisie",
  "en:algeria": "Algérie",
  "en:egypt": "Égypte",
  "en:lebanon": "Liban",
  "en:india": "Inde",
  "en:china": "Chine",
  "en:japan": "Japon",
  "en:vietnam": "Vietnam",
  "en:thailand": "Thaïlande",
  "en:indonesia": "Indonésie",
  "en:reunion": "Réunion",
  "en:guadeloupe": "Guadeloupe",
  "en:martinique": "Martinique",
  "en:mayotte": "Mayotte",
  "en:senegal": "Sénégal",
  "en:cote-d-ivoire": "Côte d'Ivoire",
  "en:cameroon": "Cameroun",
  "en:mali": "Mali",
  "en:mexico": "Mexique",
  "en:argentina": "Argentine",
  "en:brazil": "Brésil",
  "en:bolivia": "Bolivie",
  "en:peru": "Pérou",
  "en:australia": "Australie",
  "en:united-states": "États-Unis",
};

/* Normalize raw origin text (free-form from OFF) to clean French display. */
function normalizeFreeFormOrigin(raw) {
  return String(raw)
    .replace(/^Origine\s*:?\s*/i, "")
    .replace(/[,;].*$/, "") /* keep only first country if list */
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/* Infer a clean French origin from OFF's countries_tags + `origins` field. */
function inferOrigine(countriesTags = [], origins = "") {
  if (origins && typeof origins === "string" && origins.length > 1) {
    return normalizeFreeFormOrigin(origins);
  }
  /* Prefer a non-France country if the product is clearly imported. */
  const nonFr = countriesTags.find((c) => c !== "en:france" && COUNTRY_FR[c]);
  if (nonFr) return COUNTRY_FR[nonFr];
  if (countriesTags.includes("en:france")) return "France";
  /* Last resort: first tag, stripped. */
  if (countriesTags.length > 0) {
    return countriesTags[0]
      .replace("en:", "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
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

/* Categories that mean "junk food / desserts / bars" — we exclude them when they
   leak into rayons they don't belong to (e.g. Nakd bars in "dried-fruits"). */
const EXCLUDE_CATEGORIES = [
  "en:breakfast-cereals",
  "en:cereal-bars",
  "en:energy-bars",
  "en:biscuits",
  "en:cakes",
  "en:sweet-snacks",
  "en:cereals-bars",
  "en:chocolate-bars",
  "en:confectioneries",
];

/* Products whose name contains these chars without an _fr variant are
   clearly German/Austrian — not our target catalogue. */
const NON_FR_REGEX = /[äöüßÄÖÜ]/;

/* Sanity filter : reject products without image, placeholder images,
   non-French-only listings, or junk-food categories. */
function isUsable(p, rayon) {
  const img = pickImage(p);
  if (!img) return false;
  if (img.includes("/placeholder") || img.includes("image_not_available")) return false;

  const nameFr = (p.product_name_fr || "").trim();
  const name = (p.product_name || "").trim();
  if (!nameFr && !name) return false;

  /* Prefer French-named products. If only foreign name and it has
     German diacritics, skip — the catalogue is French-facing. */
  if (!nameFr && NON_FR_REGEX.test(name)) return false;

  /* Reject products whose categories include a junk-food tag, UNLESS
     the target rayon is explicitly about that category. */
  const cats = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  const isJunk = cats.some((c) => EXCLUDE_CATEGORIES.includes(c));
  const rayonAllowsSweets =
    rayon === "balkans-turques" /* baklava, halva = OK */ ||
    rayon === "surgeles"; /* mochis = OK */
  if (isJunk && !rayonAllowsSweets) return false;

  return true;
}

/* --------------------------------------------------------------------
   Fetch one query with on-disk cache + retry on 503.
   OFF's search API returns 503 under load; we retry with exponential
   backoff (2s, 4s, 8s) up to 3 times per query before giving up.
   -------------------------------------------------------------------- */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

/* Build URL for the NEW ElasticSearch-backed endpoint.
   Lucene query string: `categories_tags:"en:spices" AND countries_tags:"en:france"` */
function buildSearchNewUrl(tag, pageSize) {
  const url = new URL(OFF_SEARCH_NEW);
  const q = `categories_tags:"${tag}" AND countries_tags:"en:france"`;
  url.searchParams.set("q", q);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("sort_by", "-popularity_key");
  url.searchParams.set("langs", "fr");
  return url;
}

/* Build URL for the LEGACY MongoDB API. Uses named params. */
function buildSearchLegacyUrl(tag, pageSize) {
  const url = new URL(OFF_SEARCH_LEGACY);
  url.searchParams.set("categories_tags_en", tag);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("sort_by", "popularity_key");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("countries_tags_en", "france");
  url.searchParams.set("lc", "fr");
  return url;
}

/* Normalize response from either endpoint to a uniform `{ products: [] }`. */
function normalizeResponse(json) {
  if (Array.isArray(json?.products)) return { products: json.products };
  if (Array.isArray(json?.hits)) return { products: json.hits };
  return { products: [] };
}

async function tryFetch(url, label) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const json = await res.json();
      const norm = normalizeResponse(json);
      if (norm.products.length > 0) return { ok: true, json: norm, label };
      /* Zero results on legacy can mean the filter is wrong — fall through. */
      return { ok: res.ok, json: norm, label, empty: true };
    }
    return { ok: false, status: res.status, label };
  } catch (err) {
    return { ok: false, status: "NETWORK", error: err.message, label };
  }
}

async function fetchQuery(tag, pageSize) {
  const cacheFile = path.join(CACHE_DIR, `${cleanQueryForCache(tag)}.json`);
  if (await fileExists(cacheFile)) {
    log("info", `cache hit : "${tag}"`);
    return normalizeResponse(JSON.parse(await readFile(cacheFile, "utf8")));
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const attemptStr = attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : "";
    log("info", `fetching : "${tag}" (${pageSize} max)${attemptStr}`);

    /* Try NEW endpoint first — it's been stable when legacy is down. */
    const newRes = await tryFetch(buildSearchNewUrl(tag, pageSize), "search.new");
    if (newRes.ok && !newRes.empty) {
      await writeFile(cacheFile, JSON.stringify(newRes.json, null, 2), "utf8");
      await sleep(1500);
      return newRes.json;
    }

    /* Fallback to LEGACY endpoint. */
    const legacyRes = await tryFetch(buildSearchLegacyUrl(tag, pageSize), "search.legacy");
    if (legacyRes.ok && !legacyRes.empty) {
      await writeFile(cacheFile, JSON.stringify(legacyRes.json, null, 2), "utf8");
      await sleep(2500);
      return legacyRes.json;
    }

    /* If both failed for non-empty reason, retry with backoff. */
    if (attempt === MAX_RETRIES) {
      const status = `${newRes.status ?? "?"}/${legacyRes.status ?? "?"}`;
      log("err", `both endpoints failed for "${tag}" (${status}) — giving up`);
      /* If one returned empty, still cache it to avoid re-querying. */
      if (newRes.empty || legacyRes.empty) {
        const empty = newRes.empty ? newRes.json : legacyRes.json;
        await writeFile(cacheFile, JSON.stringify(empty, null, 2), "utf8");
        return empty;
      }
      return { products: [] };
    }

    const wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
    log(
      "warn",
      `"${tag}" → new=${newRes.status ?? "empty"}, legacy=${legacyRes.status ?? "empty"} — backoff ${wait}ms`,
    );
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
        if (!isUsable(p, rayon)) continue;

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
