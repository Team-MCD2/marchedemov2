/**
 * Probe Grand Frais — analyze page structure to design the scraper.
 * Run: node scripts/scrape/probe-grandfrais.mjs [url]
 */
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const url = process.argv[2] || "https://www.grandfrais.com/produits/boucherie";

const r = await fetch(url, {
  headers: {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9",
  },
});
const html = await r.text();

console.log("URL          :", url);
console.log("Status       :", r.status);
console.log("HTML length  :", html.length);

const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
console.log("Title        :", title?.[1]?.trim());

const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
console.log("H1           :", h1?.[1]?.trim());

/* JSON-LD for structured data */
const ldBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
console.log("JSON-LD count:", ldBlocks.length);
ldBlocks.slice(0, 3).forEach((m, i) => {
  try {
    const parsed = JSON.parse(m[1]);
    console.log(`  ld[${i}].@type :`, Array.isArray(parsed) ? parsed.map((p) => p["@type"]) : parsed["@type"]);
  } catch (e) {
    console.log(`  ld[${i}] parse error`);
  }
});

/* All images */
const imgs = [...html.matchAll(/<img[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?/gi)]
  .map((m) => ({ src: m[1], alt: m[2] }))
  .filter((x) => !x.src.startsWith("data:") && !x.src.startsWith("#"));
console.log("\nImages total :", imgs.length);
console.log("First 15 imgs:");
imgs.slice(0, 15).forEach((i) => console.log(`  src=${i.src}\n   alt=${i.alt ?? ""}`));

/* Product-like anchors */
const hrefRe = /href=["'](\/[^"'#?]*?)["']/g;
const hrefs = [...new Set([...html.matchAll(hrefRe)].map((m) => m[1]))];
const productLinks = hrefs.filter((h) => /\/produits\/[a-z-]+\/[a-z-]+/i.test(h));
console.log("\nProduct links found:", productLinks.length);
productLinks.slice(0, 20).forEach((h) => console.log("  ", h));

/* Meta tags, looking for OG image */
const og = [...html.matchAll(/<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']+)["']/gi)];
console.log("\nOG tags:");
og.forEach((m) => console.log(`  og:${m[1]} = ${m[2]}`));

/* Save first 8KB for manual inspection */
writeFileSync("scripts/scrape/probe-grandfrais-sample.html", html.slice(0, 50000));
console.log("\n→ saved 50KB sample to scripts/scrape/probe-grandfrais-sample.html");
