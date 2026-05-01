/**
 * scrape/carrefour.mjs
 * -------------------
 * Extracts product image URLs from Carrefour product pages using publicly accessible sitemaps.
 *
 * Robots posture (https://www.carrefour.fr/robots.txt):
 * - Only a few store-selection endpoints are disallowed.
 * - Product pages appear allowed.
 *
 * Important:
 * - Carrefour may return 403 for some sitemap endpoints depending on headers.
 *   This script uses a browser-like UA and retries.
 *
 * Output:
 * - scripts/data/produits-carrefour.json
 *
 * Usage:
 *   node scripts/scrape/carrefour.mjs --limit 200
 *   node scripts/scrape/carrefour.mjs --fresh
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

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
const URLS_FILE = getArg("--urls");
const CATEGORY_URL = getArg("--category");
const SINGLE_URL = getArg("--url");
const USE_PLAYWRIGHT = args.includes("--playwright");
const FRESH = args.includes("--fresh");

const OUT_PATH = "scripts/data/produits-carrefour.json";
const CACHE_DIR = "scripts/scrape/cache";

async function sleep(ms) {
  await new Promise((s) => setTimeout(s, ms));
}

async function extractProductFromPage(page, url) {
  const title = decodeHtml((await page.title()) ?? "");

  const ogImage = await page
    .$eval('meta[property="og:image"], meta[name="og:image"]', (el) => el.getAttribute("content"))
    .catch(() => null);

  const jsonLdTexts = await page
    .$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent || ""))
    .catch(() => []);

  let imageFromLd = null;
  for (const raw0 of jsonLdTexts) {
    const raw = stripCdata(String(raw0).trim());
    if (!raw) continue;
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
      /* ignore */
    }
    if (imageFromLd) break;
  }

  const image_url = imageFromLd || ogImage;
  return {
    source: "carrefour",
    url,
    nom: title ? title.replace(/\s*\|\s*Carrefour.*$/i, "").trim() : null,
    image_url: image_url || null,
  };
}

async function fetchText(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
      },
      redirect: "follow",
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

async function withBrowser(fn) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    try {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }
  const context = await browser.newContext({
    userAgent: UA,
    locale: "fr-FR",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });
    return await fn({ page, context, browser });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function pwGoto(page, url) {
  const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const status = r?.status?.() ?? 0;
  return status;
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

function loadUrlsFromFile(filePath) {
  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) return [];

  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (Array.isArray(parsed?.urls)) return parsed.urls.map(String);
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function extractProductLinksFromCategoryHtml(html) {
  const hrefs = [...html.matchAll(/href=["'](\/p\/[^"'#?]+)["']/gi)].map((m) => m[1]);
  return Array.from(new Set(hrefs)).map((p) => `https://www.carrefour.fr${p}`);
}

async function extractProductLinksFromCategoryPage(page) {
  const hrefs = await page.$$eval('a[href^="/p/"]', (as) => as.map((a) => a.getAttribute("href") || ""));
  return Array.from(new Set(hrefs))
    .filter((h) => h.startsWith("/p/"))
    .map((h) => `https://www.carrefour.fr${h}`);
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
      /* ignore */
    }
    if (imageFromLd) break;
  }

  const image_url = imageFromLd || ogImage;

  return {
    source: "carrefour",
    url,
    nom: title ? title.replace(/\s*\|\s*Carrefour.*$/i, "").trim() : null,
    image_url: image_url || null,
  };
}

async function tryFetchSitemap(url) {
  const name = url.split("/").pop() || "sitemap.xml";
  const cachePath = `${CACHE_DIR}/carrefour-${name}`;

  if (!FRESH && existsSync(cachePath)) {
    return readFileSync(cachePath, "utf8");
  }

  console.log(`[fetch] ${url}`);
  const { status, text } = await fetchText(url);
  if (status !== 200 || !text) return null;

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, text, "utf8");
  return text;
}

async function loadSitemapIndexOrUrlset() {
  const candidates = [
    "https://www.carrefour.fr/sitemap.xml",
    "https://www.carrefour.fr/sitemap_index.xml",
    "https://www.carrefour.fr/sitemap-index.xml",
    "https://www.carrefour.fr/sitemaps/sitemap.xml",
  ];

  for (const u of candidates) {
    const xml = await tryFetchSitemap(u);
    if (xml && (xml.includes("<sitemapindex") || xml.includes("<urlset"))) {
      return { url: u, xml };
    }
  }

  return null;
}

function isUrlset(xml) {
  return xml.includes("<urlset");
}

function isSitemapIndex(xml) {
  return xml.includes("<sitemapindex");
}

(async () => {
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  const existing = !FRESH && existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
  const seen = new Set(existing.map((p) => p.url));

  let productUrls = [];

  if (SINGLE_URL) {
    productUrls = [SINGLE_URL];
  } else if (URLS_FILE) {
    productUrls = loadUrlsFromFile(URLS_FILE);
  } else if (CATEGORY_URL) {
    if (USE_PLAYWRIGHT) {
      productUrls = await withBrowser(async ({ page }) => {
        console.log(`[pw] goto category ${CATEGORY_URL}`);
        const status = await pwGoto(page, CATEGORY_URL);
        if (status !== 200) throw new Error(`Category fetch failed (${status})`);
        await page.waitForTimeout(1200);
        const urls = await extractProductLinksFromCategoryPage(page);
        return urls;
      });
    } else {
      console.log(`[fetch] category ${CATEGORY_URL}`);
      const { status, text } = await fetchText(CATEGORY_URL);
      if (status !== 200 || !text) {
        console.error(`[err] Unable to fetch category url (${status})`);
        process.exit(1);
      }
      productUrls = extractProductLinksFromCategoryHtml(text);
    }
  } else {
    const sitemapRoot = await loadSitemapIndexOrUrlset();
    if (sitemapRoot) {
      if (isUrlset(sitemapRoot.xml)) {
        productUrls = extractLocsFromSitemapXml(sitemapRoot.xml);
      } else if (isSitemapIndex(sitemapRoot.xml)) {
        const sitemapLocs = extractLocsFromSitemapXml(sitemapRoot.xml);
        const limited = LIMIT > 0 ? sitemapLocs.slice(0, 3) : sitemapLocs;

        for (const sm of limited) {
          const xml = await tryFetchSitemap(sm);
          if (!xml) continue;
          const locs = extractLocsFromSitemapXml(xml);
          productUrls.push(...locs);
          if (LIMIT > 0 && productUrls.length >= LIMIT * 3) break;
        }
      }
    }
  }

  if (!productUrls.length) {
    console.error(
      "[err] No product URLs found for Carrefour.\n" +
        "      The sitemap appears blocked (403) on this network.\n" +
        "      Retry using either:\n" +
        "        - node scripts/scrape/carrefour.mjs --category <categoryUrl> --limit 50\n" +
        "        - node scripts/scrape/carrefour.mjs --urls <urls.txt|urls.json> --limit 200\n",
    );
    process.exit(1);
  }

  productUrls = Array.from(new Set(productUrls))
    .filter((u) => u.startsWith("https://www.carrefour.fr/"))
    .filter((u) => !u.includes("/recherche"));

  if (LIMIT > 0) productUrls = productUrls.slice(0, LIMIT);

  const queue = productUrls.filter((u) => !seen.has(u));
  console.log(`[state] existing=${existing.length} queue=${queue.length} (delay ${DELAY_MS}ms)`);

  const results = [...existing];
  let ok = 0;
  let failed = 0;

  if (USE_PLAYWRIGHT) {
    await withBrowser(async ({ page }) => {
      for (let i = 0; i < queue.length; i++) {
        const url = queue[i];
        process.stdout.write(`[${String(i + 1).padStart(4)}/${queue.length}] ${url} ... `);

        const status = await pwGoto(page, url);
        if (status !== 200) {
          console.log(`SKIP (${status})`);
          failed++;
          await sleep(DELAY_MS);
          continue;
        }

        await page.waitForTimeout(600);
        const p = await extractProductFromPage(page, url);
        results.push(p);
        console.log(p.image_url ? "IMG" : "NO-IMG");
        ok++;

        if ((i + 1) % 25 === 0) writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

        await sleep(DELAY_MS);
      }
    });
  } else {
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
      results.push(p);
      console.log(p.image_url ? "IMG" : "NO-IMG");
      ok++;

      if ((i + 1) % 25 === 0) writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

      await sleep(DELAY_MS);
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n[done] ok=${ok} failed=${failed} total=${results.length}`);
  console.log(`[saved] ${OUT_PATH}`);
})();
