/**
 * scrape/grandfrais.mjs
 * -----------------------
 * Fetches product data from Grand Frais's public sitemap.
 *
 * Legal posture :
 *   - robots.txt allows all product URLs (/boucherie/, /fruits-et-legumes/,
 *     /epiceries-d-ici-et-d-ailleurs/, etc.). Only /userfiles and
 *     /files/institBackoffice/uploads/*rappel-produit* are disallowed.
 *   - We fetch HTML pages (which robots are free to fetch). Image URLs
 *     served from same domain are proxy-fetched as well; GF does not set
 *     hotlink protection on product images (tested manually).
 *   - We credit Grand Frais in src/data/CREDITS.md. If Grand Frais
 *     objects, we remove.
 *
 * Extraction strategy (tested on a real product page) :
 *   - product slug = last path segment minus "produit-" prefix
 *   - h1 → product name
 *   - og:description → short description (decode HTML entities)
 *   - image : first <img> whose src contains "/images/institBackoffice/uploads/"
 *     (those are curated product photos, skipping pictograms and rayon icons)
 *   - fallback : any non-svg, non-pictogram image in main content
 *
 * Output : scripts/data/produits-grandfrais.json
 *
 * Rate-limiting :
 *   - 1 req every 400ms (≈ 2.5 req/s), polite pace
 *   - exponential backoff on 429/5xx
 *   - resume-safe : re-run skips already-scraped URLs by default
 *
 * Usage :
 *   node scripts/scrape/grandfrais.mjs                        # full run
 *   node scripts/scrape/grandfrais.mjs --limit 20             # test run
 *   node scripts/scrape/grandfrais.mjs --section boucherie    # section only
 *   node scripts/scrape/grandfrais.mjs --fresh                # ignore cache
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SITEMAP_URL = "https://www.grandfrais.com/sitemap-rayons-produits.xml";
const DELAY_MS = 400;
const MAX_RETRIES = 3;

/* -------- CLI args -------- */
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = parseInt(getArg("--limit") ?? "0", 10);
const SECTION = getArg("--section");
const FRESH = args.includes("--fresh");

/* -------- HTTP helper -------- */
async function fetchText(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
    if (r.status === 429 || r.status >= 500) {
      if (attempt < MAX_RETRIES) {
        const wait = 1000 * Math.pow(2, attempt);
        console.log(`  [${r.status}] retry in ${wait}ms`);
        await new Promise((s) => setTimeout(s, wait));
        return fetchText(url, attempt + 1);
      }
    }
    return { status: r.status, text: await r.text() };
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      await new Promise((s) => setTimeout(s, 1000 * Math.pow(2, attempt)));
      return fetchText(url, attempt + 1);
    }
    return { status: 0, text: "", error: e.message };
  }
}

/* -------- Parsing -------- */
const decodeHtml = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&ecirc;/g, "ê")
    .replace(/&agrave;/g, "à")
    .replace(/&acirc;/g, "â")
    .replace(/&ccedil;/g, "ç")
    .replace(/&ocirc;/g, "ô")
    .replace(/&ucirc;/g, "û")
    .replace(/&icirc;/g, "î")
    .replace(/&icirc;/g, "î")
    .replace(/&iuml;/g, "ï")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function extractProduct(html, url) {
  const urlObj = new URL(url);
  const parts = urlObj.pathname.split("/").filter(Boolean);
  const slugPart = parts[parts.length - 1]; /* produit-xxx */
  const slug = slugPart.replace(/^produit-/, "");
  const section = parts[0]; /* boucherie, fruits-et-legumes, ... */
  const sousSection = parts.length >= 3 ? parts[1] : null;

  const nom = decodeHtml(html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ?? "");
  const description = decodeHtml(
    html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)?.[1] ?? "",
  );

  /* Prefer uploaded product image from /images/institBackoffice/uploads/.
     Fall back to any non-pictogram image. */
  const imgMatches = [...html.matchAll(/<img[^>]*?src=["']([^"']+)["']/gi)].map((m) => m[1]);
  let image_url = imgMatches.find(
    (src) => src.includes("/images/institBackoffice/uploads/") && !src.toLowerCase().includes("rappel-produit"),
  );
  if (!image_url) {
    image_url = imgMatches.find(
      (src) =>
        !src.startsWith("data:") &&
        !src.endsWith(".svg") &&
        !src.includes("/charte/") &&
        !src.includes("bynder.com") /* app store pictos */ &&
        !src.includes("visuel-metier") /* rayon icon */ &&
        (src.startsWith("http") || src.startsWith("/")),
    );
  }
  /* Absolutize */
  if (image_url?.startsWith("/")) image_url = "https://www.grandfrais.com" + image_url;

  return {
    source: "grandfrais",
    url,
    slug,
    nom,
    description: description || null,
    image_url: image_url || null,
    section,
    sous_section: sousSection,
  };
}

/* -------- Sitemap discovery -------- */
async function loadSitemapUrls() {
  const cachePath = "scripts/scrape/gf-sitemap-urls.json";
  if (!FRESH && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    if (Array.isArray(cached) && cached.length) {
      console.log(`[cache] sitemap: ${cached.length} urls`);
      return cached;
    }
  }
  console.log(`[fetch] sitemap ${SITEMAP_URL}`);
  const { text } = await fetchText(SITEMAP_URL);
  const urls = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /\/produit-[a-z0-9-]+\/?$/i.test(u));
  writeFileSync(cachePath, JSON.stringify(urls, null, 2));
  console.log(`[saved] sitemap: ${urls.length} product urls → ${cachePath}`);
  return urls;
}

/* -------- Main -------- */
(async () => {
  const outPath = "scripts/data/produits-grandfrais.json";
  mkdirSync(dirname(outPath), { recursive: true });

  /* Load existing progress (resumable) */
  const existing = !FRESH && existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
  const existingUrls = new Set(existing.map((p) => p.url));
  console.log(`[state] already scraped: ${existing.length} products`);

  /* Resolve target URL list */
  let urls = await loadSitemapUrls();
  if (SECTION) {
    urls = urls.filter((u) => new URL(u).pathname.startsWith(`/${SECTION}/`));
    console.log(`[filter] --section ${SECTION} → ${urls.length} urls`);
  }
  const toScrape = urls.filter((u) => !existingUrls.has(u));
  console.log(`[queue]  to scrape: ${toScrape.length} urls`);

  const slice = LIMIT > 0 ? toScrape.slice(0, LIMIT) : toScrape;
  console.log(`[run]    processing: ${slice.length} urls (delay ${DELAY_MS}ms)\n`);

  const results = [...existing];
  let ok = 0;
  let failed = 0;
  const start = Date.now();

  for (let i = 0; i < slice.length; i++) {
    const url = slice[i];
    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${slice.length}] ${url.replace("https://www.grandfrais.com", "")} ... `,
    );
    const { status, text } = await fetchText(url);
    if (status !== 200 || !text) {
      console.log(`SKIP (${status})`);
      failed++;
      continue;
    }
    const p = extractProduct(text, url);
    results.push(p);
    console.log(`${p.nom.slice(0, 40).padEnd(40)} ${p.image_url ? "IMG" : "NO-IMG"}`);
    ok++;

    /* Persist every 20 products to recover gracefully */
    if ((i + 1) % 20 === 0) {
      writeFileSync(outPath, JSON.stringify(results, null, 2));
    }

    await new Promise((s) => setTimeout(s, DELAY_MS));
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2));
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[done]  ok=${ok} failed=${failed} total=${results.length} in ${dur}s`);
  console.log(`[saved] ${outPath}`);
})();
