/**
 * 1. Parse GF sitemap → list all product URLs by section
 * 2. Fetch one sample product page to see structure
 */
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
  });
  return { status: r.status, text: await r.text() };
}

/* Step 1 — read sitemap */
const sm = await get("https://www.grandfrais.com/sitemap-rayons-produits.xml");
const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log("Total URLs in sitemap :", urls.length);

const productUrls = urls.filter((u) => /\/produit-[a-z0-9-]+\/?$/i.test(u));
console.log("Product URLs          :", productUrls.length);

/* Bucket by top-level section */
const bySection = {};
for (const u of productUrls) {
  const path = new URL(u).pathname.split("/").filter(Boolean);
  const top = path[0];
  bySection[top] = (bySection[top] ?? 0) + 1;
}
console.log("By top section :");
for (const [k, v] of Object.entries(bySection).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(30)} ${v} products`);
}

/* Step 2 — sample product page */
const sample = productUrls.find((u) => u.includes("produit-boeuf")) || productUrls[0];
console.log("\n>>> Sample fetch :", sample);
const p = await get(sample);
console.log("Status :", p.status, "Len :", p.text.length);

const title = p.text.match(/<title[^>]*>([^<]+)/i)?.[1];
const h1 = p.text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
const ogImg = p.text.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1];
const ogDesc = p.text.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)?.[1];
const jsonld = [...p.text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

console.log("  title  :", title?.slice(0, 120));
console.log("  h1     :", h1?.slice(0, 120));
console.log("  ogImage:", ogImg);
console.log("  ogDesc :", ogDesc?.slice(0, 120));
console.log("  jsonld :", jsonld.length, "blocks");
jsonld.forEach((m, i) => {
  try {
    const p = JSON.parse(m[1]);
    console.log(`    ld[${i}] @type:`, Array.isArray(p) ? p.map((x) => x["@type"]) : p["@type"]);
  } catch {}
});

/* Image candidates : non-decorative */
const bigImgs = [...p.text.matchAll(/<img[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?/gi)]
  .map((m) => ({ src: m[1], alt: m[2] ?? "" }))
  .filter((i) => !i.src.startsWith("data:") && !i.src.includes("/charte/") && !i.src.endsWith(".svg"));
console.log("  Non-deco imgs:", bigImgs.length);
bigImgs.slice(0, 10).forEach((i) => console.log(`    ${i.src}\n     alt=${i.alt}`));

writeFileSync("scripts/scrape/probe-gf-product-sample.html", p.text.slice(0, 80000));
console.log("\n→ 80KB sample saved to scripts/scrape/probe-gf-product-sample.html");

/* Save full url list for next step */
writeFileSync(
  "scripts/scrape/gf-sitemap-urls.json",
  JSON.stringify(productUrls, null, 2),
);
console.log("→", productUrls.length, "URLs saved to scripts/scrape/gf-sitemap-urls.json");
