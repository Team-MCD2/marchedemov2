#!/usr/bin/env node
/**
 * scripts/scrape/match-auchan-catalogue.mjs
 *
 * Matches Auchan scraped products (scripts/data/produits-auchan.json)
 * to a target catalogue, picking the most relevant high-quality image
 * per product. Quality + relevance > raw quantity.
 *
 * Catalogue source (in priority order, controlled by --source):
 *   --source local     -> src/data/produits-catalogue.json (default)
 *   --source supabase  -> scripts/data/produits-supabase.json
 *   --source both      -> union, deduped by slug (supabase wins on conflict)
 *
 * Outputs in scripts/data/:
 *   - matches-auchan.json   : per-product top candidates (debug/inspection)
 *   - updates-auchan.json   : confident updates ready to apply
 *   - review-auchan.json    : ambiguous/low-confidence cases for manual check
 *
 * Confidence gates:
 *   --min        minimum absolute score                 (default 0.55)
 *   --margin     min gap to second-best                 (default 0.08)
 *   --only-missing only emit updates for products that
 *                  currently have no image_url
 *
 * Usage:
 *   node scripts/scrape/match-auchan-catalogue.mjs --source local --only-missing
 *   node scripts/scrape/match-auchan-catalogue.mjs --source both --min 0.5 --margin 0.06
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

const MIN = Number.parseFloat(getArg("--min", "0.20"));
const MARGIN = Number.parseFloat(getArg("--margin", "0.0"));
const ONLY_MISSING = args.includes("--only-missing");
const SOURCE = (getArg("--source", "local") || "local").toLowerCase();

const ROOT = path.resolve(import.meta.dirname, "../..");
const LOCAL_FILE = path.join(ROOT, "src", "data", "produits-catalogue.json");
const SUPABASE_FILE = path.join(ROOT, "scripts", "data", "produits-supabase.json");
const DATA_DIR = path.join(ROOT, "scripts", "data");

/* All retailer dump files we know about. Add a new file here when you
   add a new scraper (e.g. produits-carrefour.json, produits-monoprix.json).
   Each file must be a JSON array of products with at least:
       { source, name, image_url, product_url, category? }
   The matcher merges all of these into one candidate pool. */
const RETAILER_FILES = [
  path.join(DATA_DIR, "produits-auchan.json"),
  path.join(DATA_DIR, "produits-carrefour.json"),
  path.join(DATA_DIR, "produits-grandfrais.json"),
  path.join(DATA_DIR, "produits-leclerc.json"),
  path.join(DATA_DIR, "produits-monoprix.json"),
  path.join(DATA_DIR, "produits-intermarche.json"),
  path.join(DATA_DIR, "produits-off.json"),
  path.join(DATA_DIR, "produits-off-targeted.json"),
];

/* Each retailer scraper writes a slightly different shape. Normalize
   on load so the matcher always sees the same fields. */
function normalizeRetailerProduct(raw) {
  if (!raw || typeof raw !== "object") return null;

  const source = raw.source ?? raw._source ?? "unknown";
  const name = raw.name ?? raw.nom ?? raw.product_name_fr ?? raw.product_name ?? null;
  const image_url = raw.image_url ?? raw.image_front_url ?? raw.image ?? null;
  const category = raw.category ?? raw.section ?? raw.rayon ?? null;
  const category_path = raw.category_path ?? raw.sous_section ?? null;

  /* Stable identifier: prefer real product_url, then slug-based synthetic
     URL (e.g. for OFF entries which only carry slug + EAN code). */
  let product_url = raw.product_url ?? raw.url ?? null;
  if (!product_url) {
    if (raw._source_code) {
      product_url = `https://world.openfoodfacts.org/product/${raw._source_code}`;
    } else if (raw.slug) {
      product_url = `local://${source}/${raw.slug}`;
    }
  }

  if (!name || !image_url || !product_url) return null;
  return { source, name, image_url, product_url, category, category_path };
}

/* Output names kept generic (no "auchan" suffix) — they apply to any
   number of retailer sources merged together. */
const OUT_MATCHES = path.join(DATA_DIR, "matches-auchan.json");
const OUT_UPDATES = path.join(DATA_DIR, "updates-auchan.json");
const OUT_REVIEW = path.join(DATA_DIR, "review-auchan.json");

/* --------------------------------------------------------------------
   Tokenization + normalization
   -------------------------------------------------------------------- */

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function stripDiacritics(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    /* NFD does NOT decompose ligatures — they are distinct codepoints.
       Without these replacements, "bœuf" tokenizes to ["b", "uf"]
       which silently breaks any meat/egg/poultry matching. */
    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/æ/g, "ae").replace(/Æ/g, "AE")
    .replace(/ß/g, "ss");
}

function asciiLower(s) {
  return stripDiacritics(s).toLowerCase();
}

const STOPWORDS = new Set([
  "de", "d", "du", "des", "le", "la", "les", "un", "une", "et", "ou",
  "a", "au", "aux", "en", "pour", "par", "sur", "dans", "avec", "sans",
  "the", "of", "and", "or", "to", "from",
  "auchan", "marque", "repere", "repère", "monoprix", "casino", "leclerc", "marque-repere",
  "pack", "lot", "boite", "boîte", "paquet", "sachet", "barquette",
  "g", "gr", "kg", "ml", "cl", "l", "litre", "litres", "pieces", "piece", "pcs", "pc",
  "x", "n",
]);

function tokens(s) {
  const arr = asciiLower(s)
    /* Drop inline parenthetical glosses, e.g. "Ajvar (purée de
       poivrons grillés)" -> "Ajvar". They are aliases or hints, not
       part of the product head, and they otherwise force the
       secondary discriminator to look for tokens (puree, poivrons,
       grilles) that almost no retailer name will repeat. */
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => t.length > 1)
    .filter((t) => !/^\d+$/.test(t)); /* drop pure numbers */
  return arr;
}

/* Light French stemmer: covers the singular/plural cases that
   actually trip the matcher. We do NOT stem aggressively because
   "olives" and "olive (oil)" are different products in our context.
   Only -s and -es plurals on roots ≥ 4 chars are reduced. */
function singularize(t) {
  if (!t || t.length < 5) return t;
  if (t.endsWith("ses") && t.length > 6) return t.slice(0, -2); /* houmusses -> houmus */
  if (t.endsWith("es") && !t.endsWith("ges") && !t.endsWith("ces") && !t.endsWith("ses")) {
    return t.slice(0, -1); /* mangues -> mangue, olives -> olive */
  }
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1); /* gombos -> gombo, panes -> pane */
  return t;
}

/* True when two tokens share a stem under our singular rules. */
function sameStem(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return singularize(a) === singularize(b);
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function lcsTokens(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
}

/* --------------------------------------------------------------------
   Rayon-specific rules (must / avoid keywords + URL root match)
   These are the *primary* relevance filter. A candidate is only
   considered if at least one `must` keyword appears in its text and
   no `avoid` keyword does. This guarantees the image ACTUALLY shows
   the right kind of product (e.g. boucherie-halal never matches porc).
   -------------------------------------------------------------------- */

const RAYON_RULES = {
  "boucherie-halal": {
    rootMatch: ["boucherie", "volaille", "charcuterie"],
    must: [
      "agneau", "boeuf", "poulet", "dinde", "volaille", "viande",
      "merguez", "steak", "escalope", "gigot", "epaule", "cotelette",
      "cuisse", "aiguillette", "filet de poulet", "filet de boeuf",
      "roti", "brochette", "charcuterie", "cachir", "pastrami",
      "saucisson", "halal", "kefta", "tranche de dinde", "jambon de dinde",
      "jambon de poulet", "lardons de dinde", "saucisse de poulet",
      "saucisse de volaille", "kebab", "shawarma",
    ],
    avoid: [
      "porc", "jambon de pays", "jambon cru", "jambon blanc", "jambon sec",
      "bacon", "lardon", "lardons", "chorizo", "rillette", "andouille",
      "andouillette", "prosciutto", "salami", "saucisson sec", "pancetta",
      "speck", "coppa", "saucisse de strasbourg", "saucisse de francfort",
    ],
  },
  "fruits-legumes": {
    rootMatch: ["fruits-legumes"],
    must: [
      "fruit", "legume", "banane", "plantain", "mangue", "ananas",
      "avocat", "citron", "orange", "pomme", "poire", "tomate", "oignon",
      "pomme de terre", "patate", "carotte", "salade", "manioc", "igname",
      "gingembre", "coriandre", "grenade", "datte", "melon", "pasteque",
      "clementine", "kiwi", "fraise", "myrtille", "framboise", "abricot",
      "peche", "prune", "raisin", "cerise", "poivron", "aubergine",
      "courgette", "radis", "epinard", "chou", "brocoli", "champignon",
      "herbe", "persil", "basilic", "menthe", "figue", "litchi", "papaye",
    ],
    avoid: [
      "surgele", "en conserve", "deshydrate", "smoothie",
      "compote", "confiture", "yaourt",
    ],
  },
  "epices-du-monde": {
    rootMatch: ["epicerie", "epicerie-salee"],
    must: [
      "epice", "curry", "ras el hanout", "massale", "garam masala",
      "paprika", "curcuma", "cumin", "muscade", "cardamome", "cannelle",
      "poivre", "clou de girofle", "safran", "colombo", "tajine",
      "bouillon", "sumac", "zaatar", "za atar", "herbes de provence",
      "origan", "thym", "romarin", "laurier", "badiane", "anis etoile",
      "fenugrec", "moutarde en grain", "piment en poudre", "harissa en poudre",
    ],
    avoid: [
      "biscuit", "gateau", "chocolat", "confiserie", "viande", "volaille",
      "poisson",
    ],
  },
  "saveurs-afrique": {
    rootMatch: ["epicerie", "epicerie-salee", "epicerie-sucree"],
    must: [
      "attieke", "foufou", "fufu", "mais", "mil", "sorgho", "baobab",
      "manioc", "huile de palme", "arachide", "mafe", "thieboudienne",
      "plantain", "okra", "gombo", "bissap", "hibiscus", "africain",
      "senegal", "cote d ivoire", "cameroun", "ghana", "nigerian",
      "calalou", "feuille de manioc", "ndole", "kedjenou",
    ],
    avoid: ["porc", "vin", "biere", "alcool", "spiritueux"],
  },
  "saveurs-asie": {
    rootMatch: ["epicerie", "epicerie-salee", "epicerie-sucree"],
    must: [
      "riz thai", "riz basmati", "riz japonais", "sauce soja", "soja",
      "nuoc mam", "sriracha", "gochujang", "kimchi", "curry vert",
      "curry rouge", "noodle", "nouille", "udon", "ramen", "wasabi",
      "algue", "tofu", "sushi", "asiatique", "thai", "thailandais",
      "japonais", "vietnamien", "chinois", "coreen", "korean",
      "tom yum", "pho", "dim sum", "wok", "satay", "teriyaki", "miso",
      "dashi", "panko", "cinq epices", "tamari", "lait de coco",
      "vermicelle de riz", "papier de riz",
    ],
    avoid: ["porc", "vin", "biere", "alcool", "spiritueux"],
  },
  "saveur-mediterranee": {
    rootMatch: ["epicerie", "epicerie-salee", "oeufs-produits-laitiers"],
    must: [
      "huile d olive", "olive", "olives", "feta", "halloumi", "harissa",
      "tajine", "couscous", "semoule", "aubergine", "poivron", "tomate",
      "dolma", "pesto", "pita", "mediterran", "italien", "grec", "turc",
      "espagnol", "portugais", "tunisien", "marocain", "antipasti",
      "pomodoro", "origan", "romarin", "vinaigre balsamique", "tapenade",
      "anchois", "sardine", "thon a l huile", "mozzarella", "parmesan",
      "pecorino", "mozza",
    ],
    avoid: ["porc", "vin", "biere", "alcool", "spiritueux"],
  },
  "balkans-turques": {
    rootMatch: ["epicerie", "oeufs-produits-laitiers"],
    must: [
      "ayran", "baklava", "halloumi", "feta bulgare", "ajvar", "kaymak",
      "simit", "turc", "bulgare", "serbe", "grecque", "balkan", "pita",
      "sucuk", "soujouk", "tarama", "tzatziki", "kefir", "lokoum",
      "loukoum", "kasher", "kasar", "kashkaval",
    ],
    avoid: ["porc", "vin", "biere", "alcool", "spiritueux"],
  },
  "surgeles": {
    rootMatch: ["surgeles"],
    must: [
      "surgele", "glace", "glaces", "plat prepare", "pizza surgelee",
      "frite", "frites", "legume surgele", "poisson surgele", "crevette",
      "crevettes", "calamar", "samoussa", "nem", "nems", "boulette",
      "quiche", "tarte salee", "feuillete", "viande surgelee",
      "fruits surgeles", "sorbet",
    ],
    avoid: [],
  },
  "saveur-sud-amer": {
    rootMatch: ["epicerie", "epicerie-salee", "epicerie-sucree"],
    must: [
      "quinoa", "popcorn", "mais", "fajita", "tortilla", "salsa",
      "guacamole", "arepa", "tamale", "farine de manioc", "haricot noir",
      "haricots noirs", "sud americain", "mexicain", "bresilien",
      "peruvien", "argentin", "colombien", "tex mex", "cassonade",
      "dulce", "chipotle", "jalapeno", "tortilla chips",
    ],
    avoid: ["porc", "vin", "biere", "alcool", "spiritueux"],
  },
  "produits-courants": {
    rootMatch: [
      "oeufs-produits-laitiers", "epicerie-sucree", "epicerie-salee",
      "pain-patisserie", "boissons-sans-alcool",
    ],
    must: [
      "lait", "farine", "sucre", "huile", "riz", "pates", "oeufs",
      "beurre", "margarine", "yaourt", "fromage rape", "jus", "eau",
      "soda", "biscuit", "gateau", "pain", "baguette", "cereale",
      "confiture", "miel", "creme", "sel", "poivre", "vinaigre",
      "moutarde", "ketchup", "mayonnaise", "cafe", "the", "chocolat en poudre",
      "compote", "puree de tomate", "concentre de tomate",
    ],
    avoid: [
      "porc", "jambon de porc", "viande de porc",
      "alcool", "biere", "vin", "spiritueux",
    ],
  },
};

function asciiKeyword(kw) {
  return asciiLower(kw);
}

function hasAny(haystack, keywords) {
  for (const kw of keywords) {
    if (haystack.includes(asciiKeyword(kw))) return true;
  }
  return false;
}

/* --------------------------------------------------------------------
   Catalogue loading
   -------------------------------------------------------------------- */

function loadCatalogueLocal() {
  if (!fs.existsSync(LOCAL_FILE)) return [];
  const raw = readJson(LOCAL_FILE);
  return (raw.produits ?? []).map((p) => ({
    slug: p.slug,
    nom: p.nom,
    rayon: p.rayon,
    categorie: p.categorie ?? null,
    sous_categorie: p.sous_categorie ?? null,
    badge: p.badge ?? null,
    description: p.description ?? "",
    image_url: p.image_url ?? null,
    _origin: "local",
  }));
}

function loadCatalogueSupabase() {
  if (!fs.existsSync(SUPABASE_FILE)) return [];
  const raw = readJson(SUPABASE_FILE);
  const list = Array.isArray(raw) ? raw : raw.produits ?? [];
  return list.map((p) => ({
    slug: p.slug,
    nom: p.nom,
    rayon: p.rayon,
    categorie: p.categorie ?? null,
    sous_categorie: p.sous_categorie ?? null,
    badge: p.badge ?? null,
    description: p.description ?? "",
    image_url: p.image_url ?? null,
    _origin: "supabase",
  }));
}

function loadCatalogue() {
  if (SOURCE === "local") return loadCatalogueLocal();
  if (SOURCE === "supabase") return loadCatalogueSupabase();
  if (SOURCE === "both") {
    const local = loadCatalogueLocal();
    const sb = loadCatalogueSupabase();
    const map = new Map();
    for (const p of local) map.set(p.slug, p);
    for (const p of sb) map.set(p.slug, p); /* supabase wins on conflict */
    return [...map.values()];
  }
  throw new Error(`Unknown --source: ${SOURCE}`);
}

/* --------------------------------------------------------------------
   Scoring
   -------------------------------------------------------------------- */

/* Strip leading ALL-CAPS brand tokens (e.g. "MON BOUCHER", "AUCHAN BIO",
   "ALSACE LAIT", "LA POULE AU VERT", "AL QASSAB"). Brand prefixes
   contaminate token matching — e.g. "ALSACE LAIT Crème fluide" would
   wrongly match catalogue "Lait" via the brand string. */
function stripBrandPrefix(name) {
  if (!name) return "";
  /* Drop a leading parenthesized count like "(12) " from earlier scraping. */
  let s = String(name).replace(/^\s*\(\d+\)\s*/, "").trim();
  const parts = s.split(/\s+/);
  let i = 0;
  while (i < parts.length) {
    const t = parts[i];
    /* Token is considered brand if it is at least 2 chars and all of
       its alphabetic chars are uppercase (allowing accents, hyphens,
       and apostrophes). Pure-digit tokens are skipped too. */
    if (/^[A-ZÀ-ÖØ-Ý0-9'’\-]{2,}$/u.test(t) && /[A-ZÀ-ÖØ-Ý]/u.test(t)) {
      i++;
    } else break;
  }
  if (i === 0 || i === parts.length) return s;
  return parts.slice(i).join(" ");
}

/* Tokens preceded by "sans" within 1-2 words are NEGATED — e.g.
   "sans huile de palme" -> {huile, palme}. We must reject candidates
   where the catalogue head token is negated. */
function negatedTokenSet(name) {
  const lower = asciiLower(name);
  const out = new Set();
  /* "sans X" or "sans X de Y" patterns. */
  const re = /\bsans\s+([a-z]+)(?:\s+(?:de|d|du|des|le|la|les|à|a|au|aux)\s+([a-z]+))?/g;
  let m;
  while ((m = re.exec(lower)) !== null) {
    if (m[1]) out.add(m[1]);
    if (m[2]) out.add(m[2]);
  }
  return out;
}

function buildAuchanText(a) {
  const cleanName = stripBrandPrefix(a.name);
  return [cleanName, a.category_path ?? "", a.category ?? ""].filter(Boolean).join(" ");
}

function buildCatalogueText(p) {
  return [p.nom, p.categorie ?? "", p.sous_categorie ?? "", p.badge ?? "", p.description ?? ""]
    .filter(Boolean)
    .join(" ");
}

function computeIdf(auchanList) {
  const N = auchanList.length;
  const df = new Map();
  for (const a of auchanList) {
    const seen = new Set(tokens(buildAuchanText(a)));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [t, c] of df) idf.set(t, Math.log((N + 1) / (c + 1)) + 1);
  return idf;
}

function idfWeightedOverlap(prodTokens, auchanTokens, idf) {
  if (!prodTokens.length) return 0;
  const auchanSet = new Set(auchanTokens);
  let num = 0;
  let denom = 0;
  for (const t of prodTokens) {
    const w = idf.get(t) ?? 1;
    denom += w;
    if (auchanSet.has(t)) num += w;
  }
  return denom ? num / denom : 0;
}

function scoreCandidate(prod, prodTokens, prodNameTokens, prodNameTokenSet, auchan, idf, opts = {}) {
  const rules = RAYON_RULES[prod.rayon];
  const auchanCleanName = stripBrandPrefix(auchan.name);
  const auchanText = buildAuchanText(auchan);
  const auchanLower = asciiLower(auchanText);

  /* (1) Hard filter on rayon rules. */
  if (rules) {
    if (!hasAny(auchanLower, rules.must)) return null;
    if (rules.avoid.length && hasAny(auchanLower, rules.avoid)) return null;
  }

  /* (2) Negation filter: if the catalogue head appears as a "sans X"
     in the candidate, this is the OPPOSITE product (e.g. "sans huile de
     palme" must not match "Huile de tournesol"). */
  const negated = negatedTokenSet(auchan.name);
  for (const t of prodNameTokens) {
    if (negated.has(t)) return null;
    /* stem-level match: "sucres" should reject head "sucre" */
    for (const n of negated) {
      if (n.length >= 4 && (n.startsWith(t) || t.startsWith(n))) return null;
    }
  }

  /* (3) Catalogue head must appear in candidate (excluding brand
     prefix). Plural ↔ singular tolerated via stem helper, so
     "Mangues" matches a candidate "Mangue Kent" and vice versa. */
  const auchanCleanLower = asciiLower(auchanCleanName);
  const auchanCleanTokens = tokens(auchanCleanName);
  if (prodNameTokens.length) {
    const head = prodNameTokens[0];
    if (head && head.length > 2) {
      const literalHit = auchanCleanLower.includes(head);
      const stemHit =
        !literalHit &&
        auchanCleanTokens.some((t) => sameStem(t, head));
      if (!literalHit && !stemHit) return null;
    }
  }

  /* (4) Bidirectional head check: the candidate's first significant
     "content noun" (after stripping brand prefix and any leading
     qualifiers like "grand", "cru", "100") must overlap with the
     catalogue product's tokens. Catches:
       catalogue "Riz long grain" head=riz
       auchan "AUCHAN BIO Boisson au riz" -> head=boisson -> reject
       auchan "LE GALL Grand Cru Beurre" -> after qualifiers head=beurre -> reject.
     Skipped when the catalogue product is a single-token name like
     "Gochujang" — there's no other head to confuse with. */
  const QUALIFIER_HEADS = new Set([
    "vrai", "veritable", "pur", "pure", "extra", "petit", "petite",
    "grand", "grande", "frais", "fraiche", "nouveau", "nouvelle",
    "bio", "fin", "fine", "cru", "crue", "cuit", "cuite",
    "premier", "premiere", "super", "ultra", "mini", "maxi",
    "100", "true", "real",
  ]);
  const auchanNameTokens = tokens(auchanCleanName);
  if (auchanNameTokens.length && prodNameTokens.length >= 2) {
    let i = 0;
    while (i < auchanNameTokens.length && QUALIFIER_HEADS.has(auchanNameTokens[i])) i++;
    const aRealHead = auchanNameTokens[i];
    if (aRealHead && aRealHead.length > 2) {
      const inSet = prodNameTokenSet.has(aRealHead);
      const stemInSet =
        !inSet &&
        [...prodNameTokenSet].some((t) => sameStem(t, aRealHead));
      if (!inSet && !stemInSet) return null;
    }
  }

  /* (4b) Product-form consistency: if the candidate carries a
     "form-defining" noun (huile, yaourt, fromage, biscuit, ...)
     that the catalogue product does NOT carry, this is almost
     always a different product type. Catches cases where head and
     bidirectional pass but the candidate is e.g. olive *oil* when
     the catalogue is olives. */
  const PRIMARY_PRODUCT_NOUNS = [
    "huile", "vinaigre", "yaourt", "yaourts", "yogourt", "yogurt",
    "fromage", "fromages", "biscuit", "biscuits", "gateau", "gateaux",
    "boisson", "boissons", "sirop", "sirops", "soupe", "soupes",
    "tartine", "tartines", "confiture", "confitures",
    "lait", "beurre", "beurres", "creme", "cremes",
    "chocolat", "chocolats", "miel", "miels",
    "cafe", "cafes", "the", "thes", "biere", "bieres",
    "vin", "vins", "jus", "soda", "sodas",
    "glace", "glaces", "compote", "compotes",
    "tarte", "tartes", "pizza", "pizzas",
  ];
  for (const noun of PRIMARY_PRODUCT_NOUNS) {
    if (!auchanNameTokens.includes(noun)) continue;
    /* candidate has this product-form noun. If the catalogue product
       does too (literal or stem), they're consistent — keep going. */
    const inCat = prodNameTokenSet.has(noun) ||
      [...prodNameTokenSet].some((t) => sameStem(t, noun));
    if (!inCat) return null;
  }

  /* (5) Secondary discriminator: when the catalogue name has 2+
     significant tokens, at least one *non-generic* non-head token
     must appear in the candidate. "Generic" tokens (like "maison",
     "premium", "tradition", "précuit", "fermenté") are excluded so
     e.g. "Merguez maison" still matches a plain "Merguez". But
     "Huile de tournesol" must match a candidate that contains
     "tournesol" (not just any "Huile de Sésame").
     Skipped in `loose` mode (used as a last-resort fallback when
     no strict candidate exists for a product). */
  const GENERIC_DESCRIPTORS = new Set([
    "maison", "fermier", "fermiere",
    "premium", "select", "selection", "qualite", "extra", "fin", "fine",
    "tradition", "traditionnel", "traditionnelle", "classique",
    "frais", "fraiche", "fraiches", "naturel", "naturelle", "naturelles",
    "ordinaire", "standard", "simple", "ancien", "ancienne",
    "halal", "casher", "kasher", /* rayon rules already enforce halal */
    "precuit", "precuite", "cuit", "cuite",
    "fermente", "fermentee",
    "mure", "mures", "mur", "murs", /* "mûres" -> "mures" after diacritic strip */
    "seche", "sechee", "sec",
  ]);
  if (!opts.loose && prodNameTokens.length >= 2) {
    const secondary = prodNameTokens.slice(1).filter(
      (t) => t.length >= 3 && !GENERIC_DESCRIPTORS.has(t),
    );
    if (secondary.length > 0) {
      const auchanLowerName = asciiLower(auchanCleanName);
      const auchanLowerTokens = tokens(auchanCleanName);
      const anyHit = secondary.some(
        (t) =>
          auchanLowerName.includes(t) ||
          auchanLowerTokens.some((at) => sameStem(at, t)),
      );
      if (!anyHit) return null;
    }
  }

  const auchanTokens = tokens(auchanText);

  const jac = jaccard(prodTokens, auchanTokens);
  const lcs = lcsTokens(prodNameTokens, auchanNameTokens) /
              Math.max(1, Math.max(prodNameTokens.length, auchanNameTokens.length));
  const idfOverlap = idfWeightedOverlap(prodNameTokens, auchanNameTokens, idf);

  /* Plain token overlap (fallback for short names where IDF is noisy). */
  const inter = prodNameTokens.filter((t) => auchanNameTokens.includes(t)).length;
  const overlap = inter / Math.max(1, prodNameTokens.length);

  let rootBoost = 0;
  if (rules?.rootMatch?.length) {
    const path = asciiLower(auchan.category_path ?? auchan.category ?? "");
    if (rules.rootMatch.some((rm) => path.includes(asciiKeyword(rm)))) rootBoost = 0.05;
  }

  const score = 0.20 * jac + 0.20 * lcs + 0.20 * overlap + 0.35 * idfOverlap + rootBoost;
  return { score, jaccard: jac, lcs, overlap, idfOverlap, rootBoost };
}

function bestCandidatesForProduct(prod, auchan, idf, topK = 5) {
  const prodText = buildCatalogueText(prod);
  const prodTokens = tokens(prodText);
  const prodNameTokens = tokens(prod.nom);
  const prodNameTokenSet = new Set([...prodNameTokens, ...tokens(prodText)]);

  function score(loose) {
    const scored = [];
    for (const a of auchan) {
      if (!a?.image_url) continue;
      const s = scoreCandidate(
        prod, prodTokens, prodNameTokens, prodNameTokenSet, a, idf, { loose },
      );
      if (!s) continue;
      if (s.score <= 0) continue;
      scored.push({ ...s, loose, auchan: a });
    }
    scored.sort((x, y) => y.score - x.score);
    return scored;
  }

  /* Strict pass first. If nothing makes it through, drop the
     secondary discriminator (the most subjective check) and try
     again so very specific catalogue names like "Ayran turc" still
     return at least one head-aligned candidate. */
  let scored = score(false);
  if (!scored.length) scored = score(true);
  return scored.slice(0, topK);
}

/* --------------------------------------------------------------------
   Main
   -------------------------------------------------------------------- */

function main() {
  const catalogue = loadCatalogue();

  /* Load every available retailer dump and merge into a single
     candidate pool. Dedup is by product_url within each retailer.
     Different retailers may carry the same product but at different
     URLs — keeping both gives the matcher more variety. */
  const sources = [];
  const auchanMap = new Map();
  for (const file of RETAILER_FILES) {
    if (!fs.existsSync(file)) continue;
    let arr;
    try {
      arr = readJson(file);
    } catch {
      console.warn(`[warn] could not parse ${path.basename(file)}`);
      continue;
    }
    let kept = 0;
    /* Some retailer files (OFF) wrap rows in { produits: [...] }. */
    const list = Array.isArray(arr) ? arr : (arr?.produits ?? []);
    for (const raw of list) {
      const a = normalizeRetailerProduct(raw);
      if (!a) continue;
      if (auchanMap.has(a.product_url)) continue;
      auchanMap.set(a.product_url, a);
      kept += 1;
    }
    sources.push({ file: path.basename(file), kept });
  }
  if (auchanMap.size === 0) {
    throw new Error(`No retailer dumps found in ${DATA_DIR} (expected at least produits-auchan.json).`);
  }
  const auchanDeduped = [...auchanMap.values()];

  console.log("[load] retailers :");
  for (const s of sources) console.log(`  ${s.file.padEnd(28)} +${s.kept}`);

  const wanted = ONLY_MISSING ? catalogue.filter((p) => !p.image_url) : catalogue;

  console.log(`[load] catalogue=${catalogue.length} (source=${SOURCE}) wanted=${wanted.length} auchan=${auchanDeduped.length}`);
  console.log(`[cfg] min=${MIN} margin=${MARGIN} only-missing=${ONLY_MISSING}`);

  const idf = computeIdf(auchanDeduped);

  const matches = [];
  const updates = [];
  const review = [];
  const usedAuchanUrls = new Set();

  for (const p of wanted) {
    const candidates = bestCandidatesForProduct(p, auchanDeduped, idf, 5);
    const best = candidates[0] ?? null;
    const second = candidates[1] ?? null;
    const bestScore = best?.score ?? 0;
    const secondScore = second?.score ?? 0;
    const gap = bestScore - secondScore;

    matches.push({
      slug: p.slug,
      nom: p.nom,
      rayon: p.rayon,
      origin: p._origin,
      current_image_url: p.image_url ?? null,
      best: best
        ? {
            score: round(best.score),
            gap: round(gap),
            name: best.auchan.name,
            image_url: best.auchan.image_url,
            product_url: best.auchan.product_url,
            category: best.auchan.category,
            category_path: best.auchan.category_path ?? null,
          }
        : null,
      candidates: candidates.map((c) => ({
        score: round(c.score),
        name: c.auchan.name,
        image_url: c.auchan.image_url,
        product_url: c.auchan.product_url,
        category: c.auchan.category,
      })),
    });

    if (!best) continue;

    const confidentEnough = bestScore >= MIN && (candidates.length < 2 || gap >= MARGIN);
    if (confidentEnough) {
      updates.push({
        slug: p.slug,
        rayon: p.rayon,
        origin: p._origin,
        nom: p.nom,
        image_url: normalizeAuchanImageUrl(best.auchan.image_url, 800),
        source_url: best.auchan.product_url,
        confidence: round(bestScore),
        gap: round(gap),
        auchan_name: best.auchan.name,
      });
      usedAuchanUrls.add(best.auchan.product_url);
    } else {
      review.push({
        slug: p.slug,
        nom: p.nom,
        rayon: p.rayon,
        reason:
          bestScore < MIN
            ? `low_score(${round(bestScore)} < ${MIN})`
            : `low_margin(gap=${round(gap)} < ${MARGIN})`,
        candidates: candidates.slice(0, 5).map((c) => ({
          score: round(c.score),
          name: c.auchan.name,
          image_url: c.auchan.image_url,
          product_url: c.auchan.product_url,
        })),
      });
    }
  }

  fs.mkdirSync(path.dirname(OUT_MATCHES), { recursive: true });
  fs.writeFileSync(OUT_MATCHES, JSON.stringify(matches, null, 2));
  fs.writeFileSync(OUT_UPDATES, JSON.stringify({
    _generated_at: new Date().toISOString(),
    _source: SOURCE,
    _min: MIN,
    _margin: MARGIN,
    _only_missing: ONLY_MISSING,
    _catalogue_total: catalogue.length,
    _wanted: wanted.length,
    _auchan: auchanDeduped.length,
    _updates: updates.length,
    updates,
  }, null, 2));
  fs.writeFileSync(OUT_REVIEW, JSON.stringify({
    _generated_at: new Date().toISOString(),
    _source: SOURCE,
    _wanted: wanted.length,
    _review: review.length,
    review,
  }, null, 2));

  /* Variety check: how many unique Auchan images did we actually use? */
  const uniqueImages = new Set(updates.map((u) => u.image_url));
  const byRayon = updates.reduce((acc, u) => {
    acc[u.rayon] = (acc[u.rayon] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[out] matches -> ${path.relative(ROOT, OUT_MATCHES)}`);
  console.log(`[out] updates -> ${path.relative(ROOT, OUT_UPDATES)} (count=${updates.length}, unique-images=${uniqueImages.size})`);
  console.log(`[out] review  -> ${path.relative(ROOT, OUT_REVIEW)} (count=${review.length})`);
  console.log(`[breakdown] updates by rayon:`);
  for (const [r, c] of Object.entries(byRayon).sort()) {
    console.log(`  ${r.padEnd(22)} ${c}`);
  }
}

function round(n, d = 3) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

/* Normalize a cdn.auchan.fr image URL to a consistent 800px-wide
   render. Auchan's CDN respects ?width= / ?height= query params, so
   we rewrite them. Any URL not from the Auchan CDN is returned as-is. */
function normalizeAuchanImageUrl(url, target = 800) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("auchan.fr")) return url;
    u.searchParams.set("format", "rw");
    u.searchParams.set("quality", "80");
    u.searchParams.set("width", String(target));
    u.searchParams.set("height", String(target));
    return u.toString();
  } catch {
    return url;
  }
}

main();
