/**
 * Probe multiple GF URL patterns to find where product data lives.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const urls = [
  // Canonical path (from og:url)
  "https://www.grandfrais.com/boucherie/",
  "https://www.grandfrais.com/fruits-et-legumes/",
  "https://www.grandfrais.com/fromages-cremerie/",
  "https://www.grandfrais.com/saurisserie/",
  "https://www.grandfrais.com/epicerie-et-surgeles/",
  // Sitemap
  "https://www.grandfrais.com/sitemap-index.xml",
  // Alternative product paths
  "https://www.grandfrais.com/produits/",
  "https://www.grandfrais.com/produit/",
  // Search-like
  "https://www.grandfrais.com/recherche/?q=merguez",
];

for (const url of urls) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      redirect: "follow",
    });
    const text = await r.text();
    const canonical = text.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
    const title = text.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
    console.log(
      `${r.status}`.padEnd(4),
      `len=${String(text.length).padStart(7)}`,
      url.padEnd(60),
    );
    if (canonical) console.log("     canonical:", canonical);
    if (title) console.log("     title    :", title.slice(0, 80));
  } catch (e) {
    console.log("ERR", url, e.message);
  }
  await new Promise((r) => setTimeout(r, 500));
}
