/**
 * scrape/leclerc.mjs
 * -----------------
 * Extracts product image URLs from E.Leclerc product pages using their public sitemaps.
 *
 * Robots posture (https://www.e.leclerc/robots.txt):
 * - Disallow: /recherche, /catalogue, etc.
 * - Sitemaps are explicitly listed and intended for crawlers.
 *
 * Output:
 * - scripts/data/produits-leclerc.json
 *
 * Usage:
 *   node scripts/scrape/leclerc.mjs --limit 200
 *   node scripts/scrape/leclerc.mjs --sitemap 1 --limit 100
 *   node scripts/scrape/leclerc.mjs --fresh
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DELAY_MS = 500;
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const LIMIT = parseInt(getArg("--limit") ?? "0", 10);
const SITEMAP_NO = parseInt(getArg("--sitemap") ?? "0", 10);
const NO_FILTER = args.includes("--no-filter");
const FILTER_FOOD = args.includes("--filter-food");
const SITEMAP_FOOD = args.includes("--sitemap-food");
const FRESH = args.includes("--fresh");

const OUT_PATH = "scripts/data/produits-leclerc.json";
const CACHE_DIR = "scripts/scrape/cache";
const CACHE_SITEMAP_INDEX = `${CACHE_DIR}/leclerc-sitemap-index.xml`;

async function sleep(ms) {
  await new Promise((s) => setTimeout(s, ms));
}

function normalizeLeclercImageUrl(u) {
  if (!u) return null;
  let url = String(u).trim();
  if (!url) return null;
  if (url.startsWith("//")) url = "https:" + url;
  // Many Leclerc images are served without extension (filerobot / media.e.leclerc).
  // Preserve as-is; consumers can request resizing parameters if needed.
  return url;
}

function pickBreadcrumbFromJsonLd(obj) {
  if (!obj) return null;
  if (obj?.["@type"] === "BreadcrumbList") return obj;
  if (Array.isArray(obj?.["@type"]) && obj["@type"].includes("BreadcrumbList")) return obj;
  return null;
}

function extractBreadcrumbText(jsonLdBlocks) {
  for (const raw of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        const bc = pickBreadcrumbFromJsonLd(c);
        if (bc?.itemListElement && Array.isArray(bc.itemListElement)) {
          const labels = bc.itemListElement
            .map((it) => it?.item?.name || it?.name)
            .filter(Boolean)
            .map((x) => String(x));
          if (labels.length) return labels.join(" > ");
        }
        if (c?.["@graph"] && Array.isArray(c["@graph"])) {
          for (const g of c["@graph"]) {
            const bc2 = pickBreadcrumbFromJsonLd(g);
            if (bc2?.itemListElement && Array.isArray(bc2.itemListElement)) {
              const labels = bc2.itemListElement
                .map((it) => it?.item?.name || it?.name)
                .filter(Boolean)
                .map((x) => String(x));
              if (labels.length) return labels.join(" > ");
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function isFoodBreadcrumb(breadcrumbText) {
  const b = String(breadcrumbText ?? "").toLowerCase();
  if (!b) return false;

  const allow = [
    "aliment", 
    "épicerie",
    "epicerie",
    "frais",
    "boisson",
    "surgel",
    "fruit",
    "légume",
    "legume",
    "boucher",
    "poisson",
    "traiteur",
    "bio",
    "petit déjeuner",
    "petit-dejeuner",
    "produits du monde",
    "hypermarché",
    "hypermarche",
  ];

  const deny = [
    "maison",
    "déco",
    "deco",
    "bricol",
    "jardin",
    "mode",
    "beauté",
    "beaute",
    "high-tech",
    "informatique",
    "tv",
    "jouet",
    "animalerie",
    "auto",
    "sport",
    "linge",
    "meuble",
  ];

  if (deny.some((k) => b.includes(k))) return false;
  return allow.some((k) => b.includes(k));
}

async function fetchText(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
      },
    });

    if (r.status === 429 || r.status >= 500) {
      if (attempt < MAX_RETRIES) {
        const wait = 1000 * Math.pow(2, attempt);
        console.log(`  [${r.status}] retry in ${wait}ms`);
        await sleep(wait);
        return fetchText(url, attempt + 1);
      }
    }

    return { status: r.status, text: await r.text() };
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      const wait = 1000 * Math.pow(2, attempt);
      await sleep(wait);
      return fetchText(url, attempt + 1);
    }
    return { status: 0, text: "", error: e?.message ?? String(e) };
  }
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractLocsFromSitemapXml(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function stripCdata(s) {
  return String(s ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeHtml(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestImageFromJsonLd(obj) {
  const img = obj?.image;
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    const s = img.find((x) => typeof x === "string" && x.startsWith("http"));
    return s ?? null;
  }
  if (typeof img === "object" && typeof img.url === "string") return img.url;
  return null;
}

function extractProductFromHtml(html, url) {
  const title = decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "");

  const ogImage =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/name=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    null;

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => stripCdata(m[1]).trim(),
  );

  const breadcrumb = extractBreadcrumbText(jsonLdBlocks);

  let imageFromLd = null;
  for (const raw of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (c?.["@type"] === "Product" || (Array.isArray(c?.["@type"]) && c["@type"].includes("Product"))) {
          imageFromLd = pickBestImageFromJsonLd(c);
          if (imageFromLd) break;
        }
        if (c?.["@graph"] && Array.isArray(c["@graph"])) {
          for (const g of c["@graph"]) {
            if (g?.["@type"] === "Product" || (Array.isArray(g?.["@type"]) && g["@type"].includes("Product"))) {
              imageFromLd = pickBestImageFromJsonLd(g);
              if (imageFromLd) break;
            }
          }
        }
      }
    } catch {
      /* ignore JSON parse errors */
    }
    if (imageFromLd) break;
  }

  const image_url = normalizeLeclercImageUrl(imageFromLd || ogImage);

  return {
    source: "leclerc",
    url,
    nom: title ? title.replace(/\s*\|\s*E\.Leclerc.*$/i, "").trim() : null,
    image_url: image_url || null,
    breadcrumb: breadcrumb || null,
  };
}

async function loadSitemapIndex() {
  mkdirSync(CACHE_DIR, { recursive: true });

  if (!FRESH && existsSync(CACHE_SITEMAP_INDEX)) {
    return readFileSync(CACHE_SITEMAP_INDEX, "utf8");
  }

  const indexUrl = "https://www.e.leclerc/sitemap/sitemap-index.xml";
  console.log(`[fetch] ${indexUrl}`);
  const { status, text } = await fetchText(indexUrl);
  if (status !== 200 || !text) throw new Error(`Failed sitemap-index.xml (${status})`);
  writeFileSync(CACHE_SITEMAP_INDEX, text, "utf8");
  return text;
}

async function listProductSitemaps() {
  const indexXml = await loadSitemapIndex();
  const locs = extractLocsFromSitemapXml(indexXml);
  let sms = locs.filter((u) => /\/sitemap-products-\d+\.xml$/i.test(u));
  if (SITEMAP_FOOD) {
    // Heuristic: higher sitemap numbers tend to include grocery/FP products rather than general marketplace.
    // Keep it flexible: pick the last ~20 sitemaps.
    sms = sms.slice(-20);
  }
  return sms;
}

async function loadProductUrlsFromSitemap(sitemapUrl) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const name = sitemapUrl.split("/").pop();
  const cachePath = `${CACHE_DIR}/${name}`;

  if (!FRESH && existsSync(cachePath)) {
    const xml = readFileSync(cachePath, "utf8");
    return extractLocsFromSitemapXml(xml);
  }

  console.log(`[fetch] ${sitemapUrl}`);
  const { status, text } = await fetchText(sitemapUrl);
  if (status !== 200 || !text) {
    console.log(`[skip] sitemap ${name} (${status})`);
    return [];
  }

  writeFileSync(cachePath, text, "utf8");
  return extractLocsFromSitemapXml(text);
}

(async () => {
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  const existing = !FRESH && existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
  const seen = new Set(existing.map((p) => p.url));

  const productSitemaps = await listProductSitemaps();
  if (!productSitemaps.length) {
    console.error("[err] No product sitemaps found on E.Leclerc sitemap-index.xml");
    process.exit(1);
  }

  const sitemapsToUse =
    SITEMAP_NO > 0 ? productSitemaps.filter((u) => u.endsWith(`sitemap-products-${SITEMAP_NO}.xml`)) : productSitemaps;

  if (SITEMAP_NO > 0 && !sitemapsToUse.length) {
    console.error(`[err] Requested --sitemap ${SITEMAP_NO} but not found in index`);
    process.exit(1);
  }

  console.log(`[info] product sitemaps: ${sitemapsToUse.length}`);

  let urls = [];
  for (const sm of sitemapsToUse) {
    const u = await loadProductUrlsFromSitemap(sm);
    urls.push(...u);
    if (LIMIT > 0 && urls.length >= LIMIT * 3) break;
  }

  urls = uniq(urls)
    .filter((u) => u.startsWith("https://www.e.leclerc/"))
    .filter((u) => !u.includes("/recherche"));

  if (LIMIT > 0) urls = urls.slice(0, LIMIT);

  const queue = urls.filter((u) => !seen.has(u));
  console.log(`[state] existing=${existing.length} queue=${queue.length} (delay ${DELAY_MS}ms)`);

  const results = [...existing];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    process.stdout.write(`[${String(i + 1).padStart(4)}/${queue.length}] ${url} ... `);

    const { status, text } = await fetchText(url);
    if (status !== 200 || !text) {
      console.log(`SKIP (${status})`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    const p = extractProductFromHtml(text, url);
    const keep = NO_FILTER ? true : FILTER_FOOD ? isFoodBreadcrumb(p.breadcrumb) : true;
    if (keep) {
      results.push(p);
      console.log(p.image_url ? "IMG" : "NO-IMG");
      ok++;
    } else {
      console.log("SKIP (non-food)");
    }

    if ((i + 1) % 25 === 0) writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

    await sleep(DELAY_MS);
  }

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n[done] ok=${ok} failed=${failed} total=${results.length}`);
  console.log(`[saved] ${OUT_PATH}`);
})();
