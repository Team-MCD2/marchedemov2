/**
 * image-match.ts
 * --------------
 * Pure functions to match an image filename against a product catalogue
 * and score the similarity. Used by the admin "mass drag-drop" flow and
 * the "find images for products without image" pipeline.
 *
 * Design goals :
 *   - ZERO side effects, ZERO network, ZERO framework deps.
 *   - Deterministic scores in [0, 1] so we can set a threshold and show
 *     confidence % in the UI.
 *   - French-aware : strips diacritics, understands common stopwords
 *     ("de", "du", "la", "le", "et", "au"), handles weight/volume
 *     suffixes (500g, 1l) as lower-weight tokens.
 *   - Fast enough to score N filenames × M products (N=500, M=1500)
 *     in a single API call — build the product index ONCE then reuse.
 *
 * Scoring model (see `scoreMatch`) :
 *   S_exact_slug  = 1.0 if normalize(file) == product.slug, else 0
 *   S_exact_nom   = 0.95 if normalize(file) == normalize(product.nom), else 0
 *   S_jaccard     = |tokens(file) ∩ tokens(product)| / |union|   (0..1)
 *   S_lcs_ratio   = |longest common substring| / min(len(file), len(product))
 *   S_prefix      = 0.1 bonus if file starts with product.slug or vice versa
 *
 *   final = max(S_exact_slug, S_exact_nom, 0.65 * S_jaccard + 0.35 * S_lcs_ratio)
 *           + min(S_prefix, 0.05)          (capped so bonus never wins alone)
 *
 * A score >= 0.80 is "high confidence" — we show green in the UI and
 * allow "Apply all matched" bulk actions.
 * A score between 0.55 and 0.79 is "needs review" — shown as yellow,
 * user must confirm one of the candidates.
 * Below 0.55 is "unmatched" — shown red, user can manually pick or skip.
 */

/* -------------------------------------------------------------- */
/* Text normalisation                                             */
/* -------------------------------------------------------------- */

/** Strip file extension, diacritics, lowercase, non-alphanumeric → space. */
export function normalizeName(raw: string): string {
  /* Trim first so trailing whitespace doesn't prevent the extension regex
     from matching (e.g. "file.jpg  " → "file.jpg" → "file").             */
  const withoutExt = raw.trim().replace(/\.[a-z0-9]{1,5}$/i, "");
  return withoutExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") /* strip combining diacritics */
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Slugify : same as normalize but with hyphens as separator. */
export function slugifyName(raw: string): string {
  return normalizeName(raw).replace(/\s+/g, "-");
}

/* Common French + English stopwords that add no match signal. */
const STOPWORDS = new Set([
  "a", "au", "aux", "avec", "d", "de", "des", "du", "en", "et",
  "la", "le", "les", "l", "un", "une", "sur", "sous", "par", "pour",
  "the", "of", "and", "or", "to",
  /* brand-agnostic filler often present in scraped names */
  "bio", "naturel", "frais", "classique", "traditionnel", "traditionnelle",
]);

/* Weight / volume suffixes — kept as tokens but downweighted. */
const UNIT_RE = /^\d+(?:[.,]\d+)?(?:g|kg|ml|l|cl|cc|oz|lb|pc|pcs|piece|pieces|unite|unites|x\d+)$/;

/** Tokenize a normalized string, keep useful tokens. */
export function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** True if the token looks like a unit/quantity suffix (500g, 1l, 6x25cl). */
export function isUnitToken(tok: string): boolean {
  return UNIT_RE.test(tok);
}

/* -------------------------------------------------------------- */
/* Similarity primitives                                          */
/* -------------------------------------------------------------- */

/** Jaccard index of two token arrays, with unit-tokens at half weight. */
export function jaccardWeighted(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let interW = 0;
  let unionW = 0;
  const all = new Set<string>();
  a.forEach((t) => all.add(t));
  b.forEach((t) => all.add(t));
  for (const t of all) {
    const w = isUnitToken(t) ? 0.5 : 1;
    const inA = setA.has(t);
    const inB = setB.has(t);
    if (inA && inB) interW += w;
    if (inA || inB) unionW += w;
  }
  return unionW === 0 ? 0 : interW / unionW;
}

/** Length of the longest common substring (not subsequence) — O(n*m). */
export function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const n = a.length;
  const m = b.length;
  /* Rolling 1D DP to save memory on long strings. */
  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);
  let best = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return best;
}

/* -------------------------------------------------------------- */
/* Product index + matching                                       */
/* -------------------------------------------------------------- */

export interface CatalogProduct {
  id: string;
  slug: string;
  nom: string;
  image_url?: string | null;
  rayon?: string | null;
  [k: string]: unknown;
}

export interface IndexedProduct {
  product: CatalogProduct;
  slugNorm: string; /* slug with - → space */
  nomNorm: string;
  tokens: string[]; /* union of slug tokens + nom tokens */
  full: string; /* concat for LCS : "<slugNorm> <nomNorm>" */
}

/** Build the search index once for a catalogue. Cheap, pure. */
export function buildIndex(products: CatalogProduct[]): IndexedProduct[] {
  return products.map((p) => {
    const slugNorm = (p.slug ?? "").toLowerCase().replace(/-/g, " ");
    const nomNorm = normalizeName(p.nom ?? "");
    const slugTokens = tokenize(slugNorm);
    const nomTokens = tokenize(nomNorm);
    const tokens = Array.from(new Set([...slugTokens, ...nomTokens]));
    const full = `${slugNorm} ${nomNorm}`.trim();
    return { product: p, slugNorm, nomNorm, tokens, full };
  });
}

export interface MatchCandidate {
  product: CatalogProduct;
  score: number; /* final blended score in [0, 1] */
  /* Debug / UI signals : */
  exact: boolean;
  jaccard: number;
  lcsRatio: number;
  hasImage: boolean; /* true if product already has image_url */
}

export interface MatchResult {
  filename: string;
  fileNorm: string;
  best: MatchCandidate | null; /* null if no candidate >= minScore */
  candidates: MatchCandidate[]; /* top N, sorted score desc */
  confidence: "high" | "medium" | "low" | "none";
}

export interface MatchOptions {
  /** Filter candidates below this final score (default 0.55). */
  minScore?: number;
  /** Max candidates returned per filename (default 5). */
  max?: number;
  /** Optional rayon hint — when supplied, products of other rayons
   *  keep their raw score but get a small penalty (-0.15). */
  rayonHint?: string;
}

/** Score one filename against one indexed product. */
export function scoreMatch(
  fileNorm: string,
  fileTokens: string[],
  idx: IndexedProduct,
  rayonHint?: string,
): MatchCandidate {
  const { product, slugNorm, nomNorm, tokens, full } = idx;

  /* --- Exact matches --- */
  let exact = false;
  if (fileNorm === slugNorm || fileNorm === nomNorm) exact = true;
  const exactScore = exact ? (fileNorm === slugNorm ? 1.0 : 0.95) : 0;

  /* --- Fuzzy --- */
  const jaccard = jaccardWeighted(fileTokens, tokens);
  const lcs = longestCommonSubstring(fileNorm, full);
  const denom = Math.min(fileNorm.length || 1, full.length || 1);
  const lcsRatio = Math.min(1, lcs / denom);
  const blended = 0.65 * jaccard + 0.35 * lcsRatio;

  /* --- Prefix bonus --- */
  let prefix = 0;
  if (
    slugNorm.length >= 4 &&
    (fileNorm.startsWith(slugNorm) || slugNorm.startsWith(fileNorm))
  ) {
    prefix = 0.05;
  }

  let final = Math.max(exactScore, blended) + Math.min(prefix, 0.05);

  /* --- Rayon penalty if hint provided and product is in a different rayon --- */
  if (rayonHint && product.rayon && product.rayon !== rayonHint) {
    final -= 0.15;
  }

  final = Math.max(0, Math.min(1, final));

  return {
    product,
    score: Number(final.toFixed(4)),
    exact,
    jaccard: Number(jaccard.toFixed(4)),
    lcsRatio: Number(lcsRatio.toFixed(4)),
    hasImage: !!product.image_url,
  };
}

/** Find the best-matching products for one filename. */
export function findMatches(
  filename: string,
  index: IndexedProduct[],
  opts: MatchOptions = {},
): MatchResult {
  const minScore = opts.minScore ?? 0.55;
  const max = opts.max ?? 5;

  const fileNorm = normalizeName(filename);
  const fileTokens = tokenize(fileNorm);

  /* Empty/garbage filenames → no candidates. */
  if (fileTokens.length === 0) {
    return {
      filename,
      fileNorm,
      best: null,
      candidates: [],
      confidence: "none",
    };
  }

  const scored: MatchCandidate[] = index.map((idx) =>
    scoreMatch(fileNorm, fileTokens, idx, opts.rayonHint),
  );
  scored.sort((a, b) => b.score - a.score);

  const candidates = scored.filter((c) => c.score >= minScore).slice(0, max);
  const best = candidates[0] ?? null;
  const confidence: MatchResult["confidence"] = !best
    ? "none"
    : best.score >= 0.8
      ? "high"
      : best.score >= 0.65
        ? "medium"
        : "low";

  return { filename, fileNorm, best, candidates, confidence };
}

/** Batch helper : find matches for many filenames against one catalogue. */
export function findMatchesBatch(
  filenames: string[],
  products: CatalogProduct[],
  opts: MatchOptions = {},
): MatchResult[] {
  const index = buildIndex(products);
  return filenames.map((f) => findMatches(f, index, opts));
}
