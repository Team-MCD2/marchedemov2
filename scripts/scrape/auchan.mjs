/**
 * scrape/auchan.mjs
 * ------------------
 * Scrapes product images from Auchan website.
 * 
 * Legal posture:
 * - robots.txt allows crawling except /recherche* (search pages)
 * - We'll navigate through category pages to find products
 * - Rate limiting: 1 req every 500ms to be polite
 * 
 * Strategy:
 * - Focus on key categories: boucherie, fruits-legumes, epicerie
 * - Extract high-quality product images
 * - Save to scripts/data/produits-auchan.json
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DELAY_MS = 600;

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    },
  });
  const text = await r.text();
  return { status: r.status, text };
}

function extractLocsFromSitemapXml(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function loadCategoriesSitemap() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(CACHE_CATEGORIES)) return readFileSync(CACHE_CATEGORIES, "utf8");
  const url = "https://www.auchan.fr/sitemaps/sitemap-categories.xml";
  console.log(`[fetch] ${url}`);
  const { status, text } = await fetchText(url);
  if (status !== 200 || !text) throw new Error(`Failed categories sitemap (${status})`);
  writeFileSync(CACHE_CATEGORIES, text, "utf8");
  return text;
}

function deriveTopCategoryFromCategoryUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || "auchan";
  } catch {
    return "auchan";
  }
}

function deriveCategoryPathFromCategoryUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    /* Drop trailing 'ca-nXXXX' identifier so the path stays human readable. */
    if (parts.length && /^ca-n[\d]+/i.test(parts[parts.length - 1])) parts.pop();
    return parts.join("/").toLowerCase();
  } catch {
    return "";
  }
}

/* Specialty / world-cuisine keywords. Any sitemap URL whose pathname
   contains one of these is prioritized into a dedicated worklist tier
   so we don't miss thin-but-critical categories like dattes, olives,
   epices, fruits-exotiques, cuisine-du-monde, etc. */
const SPECIALTY_KEYWORDS = [
  "exotique", "exotiques",
  "cuisine-du-monde", "cuisine-d-ailleurs", "cuisine-internationale",
  "asie", "asiat", "japonais", "thai", "chinois", "viet", "coreen", "indien", "inde",
  "orient", "maghreb", "moyen-orient", "marocain", "tunisien", "libanais", "turc",
  "italien", "italie", "espagnol", "espagne", "portugais", "grec", "grecque",
  "africain", "afrique", "antillais", "antilles", "creole",
  "mexic", "tex-mex", "bresilien", "argentin", "peruvien",
  "epice", "epices", "herbe", "herbes", "condiment",
  "datte", "dattes", "figue", "figues", "fruits-secs",
  "olive", "olives", "tapenade",
  "sushi", "ramen", "udon", "wok", "nem", "samoussa", "feuillete",
  "bio", "vegetarien", "vegan", "halal", "casher", "kasher",
  "couscous", "tajine", "harissa", "feta", "halloumi", "mozzarella",
  "noodle", "nouille", "pita", "tortilla", "fajita",
  "baklava", "loukoum", "halva",
  "soja", "tofu", "miso", "kimchi",
  "quinoa", "lentille", "pois-chiche", "haricot",
  "huile-d-olive", "vinaigre",
];

function isSpecialty(url) {
  const path = (new URL(url).pathname).toLowerCase();
  return SPECIALTY_KEYWORDS.some((k) => path.includes(k));
}

function buildCategoryWorklistFromSitemap(locs) {
  const allowRoots = [
    "/oeufs-produits-laitiers/",
    "/boucherie-volaille-poissonnerie/",
    "/fruits-legumes/",
    "/surgeles/",
    "/epicerie-sucree/",
    "/epicerie-salee/",
    "/boissons-sans-alcool/",
    "/pain-patisserie/",
  ];

  const allowed = locs
    .filter((u) => u.startsWith("https://www.auchan.fr/"))
    .filter((u) => allowRoots.some((r) => u.includes(r)))
    .filter((u) => /\/ca-n\d+/i.test(u));

  /* Tier 1: specialty / world-cuisine paths — always included, never
     truncated by MAX_CATEGORIES. */
  const specialty = allowed.filter(isSpecialty);

  /* Tier 2: remaining categories, deepest first per root, capped per
     root by MAX_CATEGORIES. */
  const generic = allowed.filter((u) => !isSpecialty(u));
  const depth = (u) => new URL(u).pathname.split("/").filter(Boolean).length;
  generic.sort((a, b) => depth(b) - depth(a));

  const byRoot = new Map();
  for (const u of generic) {
    const hit = allowRoots.find((r) => u.includes(r)) ?? "other";
    const arr = byRoot.get(hit) ?? [];
    arr.push(u);
    byRoot.set(hit, arr);
  }

  const tier2 = [];
  for (const r of allowRoots) {
    const slice = (byRoot.get(r) ?? []).slice(0, MAX_CATEGORIES);
    tier2.push(...slice);
  }

  /* Specialty FIRST so a small TARGET still captures the rare stuff. */
  const work = [...specialty, ...tier2];

  /* De-dupe preserving order. */
  const seen = new Set();
  const uniq = [];
  for (const u of work) {
    if (seen.has(u)) continue;
    seen.add(u);
    uniq.push(u);
  }

  return uniq;
}

const LIMIT = parseInt(getArg("--limit") ?? "0", 10);
const PAGES = parseInt(getArg("--pages") ?? "2", 10);
const USE_PLAYWRIGHT = !args.includes("--fetch");
const USE_SITEMAP = args.includes("--sitemap");
const TARGET = parseInt(getArg("--target") ?? "0", 10);
const MAX_CATEGORIES = parseInt(getArg("--max-categories") ?? "60", 10);

const CACHE_DIR = "scripts/scrape/cache";
const CACHE_CATEGORIES = `${CACHE_DIR}/auchan-sitemap-categories.xml`;

// Key Auchan categories to scrape (stable roots from https://www.auchan.fr/sitemaps/sitemap-categories.xml)
// Goal: maximize usable food images (avoid non-food departments).
const CATEGORIES = {
  "oeufs-produits-laitiers": "https://www.auchan.fr/oeufs-produits-laitiers/ca-n01",
  "boucherie-volaille-poissonnerie": "https://www.auchan.fr/boucherie-volaille-poissonnerie/ca-n02",
  "fruits-legumes": "https://www.auchan.fr/fruits-legumes/ca-n03",
  "surgeles": "https://www.auchan.fr/surgeles/ca-n04",
  "epicerie-sucree": "https://www.auchan.fr/epicerie-sucree/ca-n05",
  "epicerie-salee": "https://www.auchan.fr/epicerie-salee/ca-n06",
  "boissons-sans-alcool": "https://www.auchan.fr/boissons-sans-alcool/ca-n07",
  "pain-patisserie": "https://www.auchan.fr/pain-patisserie/ca-n1203",
};

async function sleep(ms) {
  await new Promise((s) => setTimeout(s, ms));
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

function normalizeImageUrl(u) {
  if (!u) return null;
  let url = String(u);
  if (url.startsWith("//")) url = "https:" + url;
  url = url.replace(/\?width=\d+&height=\d+$/, "");
  if (url.startsWith("/")) url = "https://www.auchan.fr" + url;
  return url;
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

function cleanName(raw) {
  const s = decodeHtml(raw);
  const lines = s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/^\(\d+\)$/.test(x));

  if (!lines.length) return "";

  const withoutUnits = lines.filter((x) => !/\b\d+\s*(g|kg|ml|l)\b/i.test(x));
  const chosen = (withoutUnits.length ? withoutUnits : lines).slice(0, 3);
  return chosen
    .join(" ")
    .replace(/^\(\d+\)\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/(\d)(g|kg|ml|l)(\d)/gi, "$1$2 $3")
    .replace(/(\d)(\s*)(pi[eè]ce|pi[eè]ces)\b/gi, "$1 $3")
    .trim();
}

function isPlaceholderImage(url) {
  const u = String(url ?? "").toLowerCase();
  return !u || u.includes("no-picture") || u.endsWith(".svg");
}

async function extractImageFromProductPage(context, url) {
  const page = await context.newPage();
  try {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });

    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        break;
      } catch (e) {
        if (attempt === 2) return null;
        await sleep(500 + attempt * 750);
      }
    }

    const status = r?.status?.() ?? 0;
    if (status && status !== 200) return null;

    const og = await page
      .$eval('meta[property="og:image"], meta[name="og:image"]', (el) => el.getAttribute("content"))
      .catch(() => null);

    const jsonLdTexts = await page
      .$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent || ""))
      .catch(() => []);

    let fromLd = null;
    for (const raw0 of jsonLdTexts) {
      const raw = stripCdata(String(raw0).trim());
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const c of candidates) {
          if (c?.["@type"] === "Product" || (Array.isArray(c?.["@type"]) && c["@type"].includes("Product"))) {
            fromLd = pickBestImageFromJsonLd(c);
            if (fromLd) break;
          }
          if (c?.["@graph"] && Array.isArray(c["@graph"])) {
            for (const g of c["@graph"]) {
              if (g?.["@type"] === "Product" || (Array.isArray(g?.["@type"]) && g["@type"].includes("Product"))) {
                fromLd = pickBestImageFromJsonLd(g);
                if (fromLd) break;
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (fromLd) break;
    }

    const img = normalizeImageUrl(fromLd || og);
    if (!img || isPlaceholderImage(img)) return null;
    return img;
  } finally {
    await page.close().catch(() => {});
  }
}

async function extractProductsFromCategoryPage(page, category, limit, categoryPath = "") {
  const products = [];
  const seen = new Set();

  await page.waitForTimeout(1200);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  // Scroll a bit to trigger lazy content
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
    await page.waitForTimeout(800);
  }

  const cards = await page.$$('[data-testid="product-item"], article[data-product-id], article');
  for (const card of cards) {
    if (limit > 0 && products.length >= limit) break;

    const rawName = await card
      .$eval("a, h2, h3", (el) => (el.textContent || "").trim())
      .catch(() => "");
    const name = cleanName(rawName);

    const href = await card
      .$eval('a[href]', (a) => a.getAttribute("href"))
      .catch(() => null);
    const product_url = href
      ? href.startsWith("http")
        ? href
        : `https://www.auchan.fr${href}`
      : null;

    const img = await card
      .$eval("img", (imgEl) => imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || "")
      .catch(() => "");

    const image_url = normalizeImageUrl(img);

    if (name && product_url) {
      if (seen.has(product_url)) continue;
      seen.add(product_url);
      products.push({
        source: "auchan",
        name,
        image_url: image_url && !isPlaceholderImage(image_url) ? image_url : null,
        product_url,
        category,
        category_path: categoryPath || null,
        section: mapAuchanCategoryToSection(category),
      });
    }
  }

  /* Fill missing images by opening product pages (only for placeholders). */
  const ctx = page.context();
  for (const p of products) {
    if (p.image_url) continue;
    if (!p.product_url) continue;
    try {
      const real = await extractImageFromProductPage(ctx, p.product_url);
      if (real) p.image_url = real;
    } catch {
      // Ignore individual product failures; keep scraping.
    }
    await sleep(Math.max(250, Math.floor(DELAY_MS * 0.6)));
  }

  return products;
}

async function findNextPageUrl(page) {
  const relNext = await page.$eval('a[rel="next"]', (a) => a.getAttribute('href')).catch(() => null);
  if (relNext) return relNext.startsWith('http') ? relNext : `https://www.auchan.fr${relNext}`;

  const ariaNext = await page
    .$eval('a[aria-label*="Suivant"], button[aria-label*="Suivant"]', (el) => {
      if (el.tagName.toLowerCase() === 'a') return el.getAttribute('href');
      return null;
    })
    .catch(() => null);
  if (ariaNext) return ariaNext.startsWith('http') ? ariaNext : `https://www.auchan.fr${ariaNext}`;

  return null;
}

/* Map Auchan categories to our sections */
function mapAuchanCategoryToSection(auchanCategory) {
  const mapping = {
    'boucherie': 'boucherie',
    'fruits-legumes': 'fruits-et-legumes', 
    'epicerie': 'epiceries-d-ici-et-d-ailleurs'
  };
  return mapping[auchanCategory] || auchanCategory;
}

/* Main scraping function */
(async () => {
  const outPath = "scripts/data/produits-auchan.json";
  mkdirSync(dirname(outPath), { recursive: true });
  
  console.log('[start] Scraping Auchan for high-quality product images');
  
  const allProducts = [];
  let totalScraped = 0;
  
  const categoryEntries = [];
  if (USE_SITEMAP) {
    const xml = await loadCategoriesSitemap();
    const locs = extractLocsFromSitemapXml(xml);
    const urls = buildCategoryWorklistFromSitemap(locs);
    for (const u of urls) {
      const top = deriveTopCategoryFromCategoryUrl(u);
      categoryEntries.push([top, u]);
    }
    console.log(`[info] sitemap categories selected: ${categoryEntries.length} (max per root=${MAX_CATEGORIES})`);
  } else {
    for (const [category, url] of Object.entries(CATEGORIES)) categoryEntries.push([category, url]);
  }

  /* Load any prior dump up front so we can save merged state after
     every category. This makes the scraper crash-safe: we never lose
     more than one category's worth of work if the network drops. */
  let priorMap = new Map();
  if (existsSync(outPath)) {
    try {
      const prior = JSON.parse(readFileSync(outPath, "utf8"));
      if (Array.isArray(prior)) {
        for (const p of prior) {
          if (p?.product_url) priorMap.set(p.product_url, p);
        }
        console.log(`[merge] loaded ${priorMap.size} prior products from ${outPath}`);
      }
    } catch {
      console.log("[merge] prior file unreadable, will start fresh");
    }
  }

  function saveMerged() {
    const map = new Map(priorMap);
    for (const p of allProducts) {
      if (p?.product_url) map.set(p.product_url, p);
    }
    writeFileSync(outPath, JSON.stringify([...map.values()], null, 2));
    return map.size;
  }

  let crashedAt = null;
  try {

  for (const [category, url] of categoryEntries) {
    console.log(`\n[category] ${category}: ${url}`);

    if (!USE_PLAYWRIGHT) {
      console.log("[skip] Fetch-mode disabled for Auchan (dynamic pages). Use Playwright (default) or update selectors.");
      continue;
    }

    const categoryPath = deriveCategoryPathFromCategoryUrl(url);

    const products = await withBrowser(async ({ page }) => {
      let nextUrl = url;
      const collected = [];
      const seenUrls = new Set();

      for (let p = 0; p < Math.max(1, PAGES); p++) {
        if (!nextUrl) break;
        if (seenUrls.has(nextUrl)) break;
        seenUrls.add(nextUrl);

        let r = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            r = await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
            break;
          } catch (e) {
            if (attempt === 2) {
              console.log(`[skip] Failed to navigate category page (${String(e?.message || e)})`);
              r = null;
              break;
            }
            await sleep(750 + attempt * 1000);
          }
        }

        const status = r?.status?.() ?? 0;
        if (status && status !== 200) {
          console.log(`[skip] Failed to fetch category page (${status})`);
          break;
        }
        if (!r) break;

        const remaining = LIMIT > 0 ? Math.max(0, LIMIT - collected.length) : 0;
        const batch = await extractProductsFromCategoryPage(page, category, remaining, categoryPath);
        collected.push(...batch);

        if (LIMIT > 0 && collected.length >= LIMIT) break;
        nextUrl = await findNextPageUrl(page);
        await sleep(Math.max(200, Math.floor(DELAY_MS * 0.5)));
      }

      // Deduplicate across pages
      const map = new Map();
      for (const it of collected) map.set(it.product_url, it);
      return [...map.values()];
    });

    console.log(`[found] ${products.length} products in ${category}`);
    allProducts.push(...products);
    totalScraped += products.length;

    /* Persist after every category so crashes lose at most one batch. */
    const saved = saveMerged();
    console.log(`[save] ${saved} unique products on disk (+${products.length} this category, ${totalScraped} new this run)`);

    if (TARGET > 0 && totalScraped >= TARGET) {
      console.log(`[stop] target reached: ${totalScraped}/${TARGET}`);
      break;
    }

    await sleep(DELAY_MS * 2);
  }

  } catch (err) {
    crashedAt = err;
    console.error(`\n[error] scrape interrupted: ${err?.message || err}`);
  } finally {
    const finalCount = saveMerged();
    if (crashedAt) {
      console.log(`\n[partial] ${totalScraped} new products this run (saved). Total on disk: ${finalCount}.`);
      process.exitCode = 2;
    } else {
      console.log(`\n[done] Scraped ${totalScraped} new products this run`);
      console.log(`[saved] ${outPath} (${finalCount} total unique products)`);

      const bySection = allProducts.reduce((acc, p) => {
        acc[p.section] = (acc[p.section] || 0) + 1;
        return acc;
      }, {});
      console.log('\n[breakdown] Products by section (this run):');
      Object.entries(bySection).forEach(([section, count]) => {
        console.log(`  ${section}: ${count}`);
      });
    }
  }
})();
