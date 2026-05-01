#!/usr/bin/env node
/**
 * scripts/scrape/off-by-name.mjs
 *
 * Targeted Open Food Facts search: for each catalogue product that
 * still has no image, query OFF for the product NAME (plus rayon
 * hints) and pick the top result whose image looks like a real
 * packshot. This complements category-based scrapers — it goes
 * straight after the gaps.
 *
 * Output: scripts/data/produits-off-targeted.json
 *   Array of { source, name, image_url, product_url, category }.
 *
 * The matcher in match-auchan-catalogue.mjs already lists this file
 * in RETAILER_FILES, so a re-run picks it up automatically.
 *
 * Usage:
 *   node scripts/scrape/off-by-name.mjs
 *   node scripts/scrape/off-by-name.mjs --limit 10
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = parseInt(getArg("--limit") ?? "0", 10);

const ROOT = path.resolve(import.meta.dirname, "../..");
const CATALOGUE_FILE = path.join(ROOT, "src", "data", "produits-catalogue.json");
const OUT_FILE = path.join(ROOT, "scripts", "data", "produits-off-targeted.json");

const UA = "MarcheDeMo-V2-TargetedSearch/1.0 (+contact@marchedemo.com) Node/22 own-catalogue builder";

const FIELDS = [
  "code", "product_name", "product_name_fr", "generic_name_fr", "brands",
  "categories_tags", "image_front_url", "image_url", "countries_tags",
].join(",");

/* OFF's ElasticSearch endpoint handles natural-language queries well. */
const SEARCH_URL = "https://search.openfoodfacts.org/search";

const DELAY_MS = 350;
const PAGE_SIZE = 24;

async function sleep(ms) {
  await new Promise((s) => setTimeout(s, ms));
}

function isUsableImage(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  if (!u.startsWith("http")) return false;
  /* OFF uses .200.jpg / .400.jpg suffixes for thumbnails, .full.jpg or
     just .jpg for full-size. We accept anything that's a JPG/PNG and
     not a placeholder. */
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return false;
  if (u.includes("invalid")) return false;
  return true;
}

/* Build a tighter search query from a catalogue product. We take the
   nom and append the rayon as a soft hint (boosts food-relevant hits
   over irrelevant brand collisions). */
function buildQuery(prod) {
  const nom = String(prod.nom ?? "").trim();
  /* Strip parenthetical aliases: "Poudre de baobab (pain de singe)" -> "Poudre de baobab" */
  const cleanNom = nom.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return cleanNom;
}

async function searchOff(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: String(PAGE_SIZE),
    fields: FIELDS,
    /* Restrict to French-language entries when possible. */
    langs: "fr",
  });
  const url = `${SEARCH_URL}?${params}`;

  let r;
  try {
    r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
      },
    });
  } catch (e) {
    return { hits: [], error: String(e?.message ?? e) };
  }

  if (!r.ok) {
    return { hits: [], error: `HTTP ${r.status}` };
  }

  let json;
  try {
    json = await r.json();
  } catch (e) {
    return { hits: [], error: `JSON parse: ${e?.message ?? e}` };
  }

  const hits = Array.isArray(json?.hits) ? json.hits : Array.isArray(json?.products) ? json.products : [];
  return { hits, error: null };
}

/* Score every usable hit, return them sorted from best to worst.
   We let the downstream matcher decide which actually passes its
   strict head/secondary/primary-noun rules; emitting more candidates
   means fewer hard misses. */
function rankHits(hits, query) {
  const queryTokens = new Set(
    String(query)
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .replace(/œ/g, "oe")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );

  const scored = [];
  for (const h of hits) {
    const img = h.image_front_url ?? h.image_url ?? null;
    if (!isUsableImage(img)) continue;
    const name = h.product_name_fr ?? h.product_name ?? h.generic_name_fr ?? "";
    if (!name) continue;
    const tokens = String(name)
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .replace(/œ/g, "oe")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    let overlap = 0;
    for (const t of tokens) if (queryTokens.has(t)) overlap += 1;
    const tags = Array.isArray(h.countries_tags) ? h.countries_tags : [];
    const frBoost = tags.some((c) => /(:france|:fr)$/i.test(String(c))) ? 1 : 0;
    /* Penalize candidates whose name is much longer than the query —
       "Pringles classic paprika" ranks below plain "Paprika". */
    const lenPenalty = Math.max(0, tokens.length - queryTokens.size) * 0.1;
    const score = overlap * 2 + frBoost - lenPenalty;
    scored.push({ hit: h, name, img, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function main() {
  if (!fs.existsSync(CATALOGUE_FILE)) {
    throw new Error(`Catalogue not found: ${CATALOGUE_FILE}`);
  }
  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE_FILE, "utf8"));
  const all = catalogue.produits ?? [];
  let missing = all.filter((p) => !p.image_url);
  if (LIMIT > 0) missing = missing.slice(0, LIMIT);

  console.log(`[off-by-name] catalogue=${all.length} missing-image=${missing.length}`);

  /* Resume-safe: reuse prior results so re-runs only fetch what's new. */
  let priorMap = new Map();
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prior = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
      if (Array.isArray(prior)) {
        for (const r of prior) if (r?._slug) priorMap.set(r._slug, r);
        console.log(`[off-by-name] resuming with ${priorMap.size} prior results on disk`);
      }
    } catch {
      /* ignore unreadable prior */
    }
  }

  /* When resuming, key by code (stable across re-runs) — slug-based
     keys would force re-fetching every product because we now emit
     multiple entries per slug. */
  const seenCodes = new Set();
  const results = [];
  for (const r of priorMap.values()) {
    if (r?._code && !seenCodes.has(r._code)) {
      seenCodes.add(r._code);
      results.push(r);
    }
  }

  /* Slugs already covered by ANY prior entry — skip them on resume. */
  const coveredSlugs = new Set(results.map((r) => r._slug).filter(Boolean));

  const TOP_K = 6;
  let totalHits = 0;
  let miss = 0;

  for (const p of missing) {
    if (coveredSlugs.has(p.slug)) continue;
    const query = buildQuery(p);
    if (!query) continue;

    process.stdout.write(`[${p.slug.padEnd(28)}] q="${query.slice(0, 50)}" ... `);
    const { hits, error } = await searchOff(query);
    if (error) {
      console.log(`ERR ${error}`);
      miss += 1;
      await sleep(DELAY_MS);
      continue;
    }

    const ranked = rankHits(hits, query);
    if (!ranked.length) {
      console.log("NO-MATCH");
      miss += 1;
      await sleep(DELAY_MS);
      continue;
    }

    const top = ranked.slice(0, TOP_K);
    let kept = 0;
    for (const r of top) {
      const code = r.hit.code ?? null;
      if (code && seenCodes.has(code)) continue;
      const productUrl = code
        ? `https://world.openfoodfacts.org/product/${code}`
        : `local://off-targeted/${p.slug}-${kept}`;
      const entry = {
        source: "off-targeted",
        name: r.name,
        image_url: r.img,
        product_url: productUrl,
        category: p.rayon,
        _slug: p.slug,
        _query: query,
        _confidence: r.score,
        _code: code,
      };
      results.push(entry);
      if (code) seenCodes.add(code);
      kept += 1;
    }
    totalHits += kept;

    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    console.log(`OK kept=${kept}/${top.length} top="${top[0].name.slice(0, 50)}"`);
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n[done] hits-added=${totalHits} miss=${miss} total-on-disk=${results.length}`);
  console.log(`[saved] ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("[off-by-name] fatal:", err);
  process.exit(1);
});
