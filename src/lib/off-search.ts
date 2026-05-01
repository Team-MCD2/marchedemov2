/**
 * src/lib/off-search.ts
 *
 * Thin server-side wrapper around the OpenFoodFacts search API, tuned
 * for the admin "Chercher image" modal.
 *
 * Why OFF rather than Carrefour / Leclerc?
 *   - OFF is a CC-BY-SA community DB already embedded in our pipeline
 *     (see `scripts/scrape/openfoodfacts.mjs`); no ToS / anti-bot
 *     gymnastics, images are meant to be reused with attribution.
 *   - We already credit OFF in CREDITS.md for the seed catalogue, so
 *     exposing a live search just extends the same posture.
 *
 * Design :
 *   - Try the new ElasticSearch endpoint first, fall back to the legacy
 *     MongoDB one if it 5xx's — same pattern as the offline scraper.
 *   - Return a deduplicated `ImageCandidate[]` that the UI can render
 *     directly (thumbnail + full image + source label + attribution).
 *   - No on-disk cache here — this is an interactive admin path. A
 *     short in-memory TTL cache would be a cheap future optimisation.
 */

const USER_AGENT =
  "MarcheDeMo-V2-AdminSearch/1.0 (+contact@marchedemo.com) " +
  "Node.js own-catalogue builder, https://marchedemo.com";

const OFF_SEARCH_NEW = "https://search.openfoodfacts.org/search";
const OFF_SEARCH_LEGACY = "https://world.openfoodfacts.org/api/v2/search";

/* Keep this set in sync with scripts/scrape/openfoodfacts.mjs FIELDS.
   Smaller than the scraper's list — we only need display data. */
const FIELDS = [
  "code",
  "product_name",
  "product_name_fr",
  "brands",
  "countries_tags",
  "origins",
  "image_front_url",
  "image_front_small_url",
  "image_url",
  "labels_tags",
  "quantity",
].join(",");

export interface ImageCandidate {
  /** OpenFoodFacts barcode / canonical id — stable primary key */
  code: string;
  /** Cleanest French product name we could find, falls back to `product_name` */
  name: string;
  brands: string | null;
  origine: string | null;
  quantity: string | null;
  /** Preferred full-resolution image URL (front image if present, else fallback). */
  imageUrl: string;
  /** Small / thumbnail variant (still hosted on OFF CDN). */
  thumbUrl: string;
  /** Which OFF endpoint returned this hit — useful for debugging. */
  source: "off-new" | "off-legacy";
  /** "OpenFoodFacts • CC-BY-SA" by default. Shown next to the image. */
  attribution: string;
}

/* Normalise OFF responses — new API uses `hits`, legacy uses `products`. */
function extractProducts(json: any): any[] {
  if (Array.isArray(json?.products)) return json.products;
  if (Array.isArray(json?.hits)) return json.hits;
  return [];
}

const COUNTRY_FR: Record<string, string> = {
  "en:france": "France",
  "en:morocco": "Maroc",
  "en:tunisia": "Tunisie",
  "en:algeria": "Algérie",
  "en:egypt": "Égypte",
  "en:lebanon": "Liban",
  "en:turkey": "Turquie",
  "en:india": "Inde",
  "en:china": "Chine",
  "en:japan": "Japon",
  "en:vietnam": "Vietnam",
  "en:thailand": "Thaïlande",
  "en:senegal": "Sénégal",
  "en:cote-d-ivoire": "Côte d'Ivoire",
  "en:cameroon": "Cameroun",
  "en:mali": "Mali",
  "en:portugal": "Portugal",
  "en:spain": "Espagne",
  "en:italy": "Italie",
  "en:greece": "Grèce",
  "en:mexico": "Mexique",
  "en:brazil": "Brésil",
};

function pickOrigine(p: any): string | null {
  if (p.origins && typeof p.origins === "string" && p.origins.length > 1) {
    return String(p.origins)
      .replace(/^Origine\s*:?\s*/i, "")
      .replace(/[,;].*$/, "")
      .trim()
      .slice(0, 80) || null;
  }
  const tags: string[] = Array.isArray(p.countries_tags) ? p.countries_tags : [];
  for (const t of tags) {
    const label = COUNTRY_FR[t];
    if (label && label !== "France") return label;
  }
  if (tags.includes("en:france")) return "France";
  return null;
}

function normaliseHit(p: any, source: "off-new" | "off-legacy"): ImageCandidate | null {
  const imageUrl: string =
    p.image_front_url || p.image_url || p.image_front_small_url || "";
  if (!imageUrl) return null;
  if (/placeholder|image_not_available/i.test(imageUrl)) return null;

  const name = (p.product_name_fr || p.product_name || "").trim();
  if (!name) return null;

  return {
    code: String(p.code ?? ""),
    name: name.slice(0, 160),
    brands: p.brands ? String(p.brands).split(",")[0].trim() : null,
    origine: pickOrigine(p),
    quantity: p.quantity ? String(p.quantity).slice(0, 40) : null,
    imageUrl,
    thumbUrl: p.image_front_small_url || imageUrl,
    source,
    attribution: "OpenFoodFacts · CC-BY-SA",
  };
}

async function tryFetch(url: URL, source: "off-new" | "off-legacy"): Promise<any[]> {
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    /* Admin UX: bail out quickly instead of hanging on OFF slowdowns. */
    signal: AbortSignal.timeout(7_000),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return extractProducts(json);
}

function buildSearchNewUrl(q: string, pageSize: number): URL {
  const url = new URL(OFF_SEARCH_NEW);
  /* Use free-form search across name & generic_name — this is what the
     admin types in the field (e.g. "riz basmati", "pois chiches"). */
  url.searchParams.set("q", q);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("sort_by", "-popularity_key");
  url.searchParams.set("langs", "fr");
  return url;
}

function buildSearchLegacyUrl(q: string, pageSize: number): URL {
  const url = new URL(OFF_SEARCH_LEGACY);
  url.searchParams.set("search_terms", q);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("sort_by", "popularity_key");
  url.searchParams.set("lc", "fr");
  return url;
}

/**
 * Search OpenFoodFacts for product image candidates matching a free-form
 * query. Deduplicates by `code`. Silent on errors — returns `[]` if
 * both endpoints are unreachable so the admin UI can show a graceful
 * "no results" state rather than a crash.
 */
export async function searchOFFImages(
  query: string,
  opts: { pageSize?: number } = {},
): Promise<ImageCandidate[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 16, 30));

  /* Try NEW first, then LEGACY if NEW yields nothing. Don't merge
     results — the two backends rank differently and would produce
     duplicates without adding value. */
  let rawHits: any[] = [];
  let source: "off-new" | "off-legacy" = "off-new";
  try {
    rawHits = await tryFetch(buildSearchNewUrl(q, pageSize), "off-new");
  } catch {
    rawHits = [];
  }
  if (rawHits.length === 0) {
    try {
      rawHits = await tryFetch(buildSearchLegacyUrl(q, pageSize), "off-legacy");
      source = "off-legacy";
    } catch {
      rawHits = [];
    }
  }

  const seen = new Set<string>();
  const results: ImageCandidate[] = [];
  for (const raw of rawHits) {
    const hit = normaliseHit(raw, source);
    if (!hit) continue;
    /* Dedupe by code, then by imageUrl as a safety net. */
    const key = hit.code || hit.imageUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(hit);
    if (results.length >= pageSize) break;
  }
  return results;
}
