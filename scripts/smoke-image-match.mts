/**
 * smoke-image-match.mts
 * ---------------------
 * Smoke test for `src/lib/image-match.ts`. Runs in two parts :
 *
 *   1. Offline unit sanity : synthetic products + synthetic filenames,
 *      asserts the matcher returns what we expect for known-good pairs.
 *   2. Live : if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present in
 *      .env.local, load the real catalogue and run the matcher against
 *      a curated list of realistic filenames. Prints a table — no DB
 *      writes, pure read.
 *
 * Run :
 *   node --experimental-strip-types scripts/smoke-image-match.mts
 *
 * Node 22.17 emits an "(SyntaxWarning) experimental feature" line but
 * executes fine. No extra deps required.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  normalizeName,
  tokenize,
  jaccardWeighted,
  findMatches,
  findMatchesBatch,
  buildIndex,
  type CatalogProduct,
} from "../src/lib/image-match.ts";

dotenv.config({ path: ".env.local" });

/* ------------------------------------------------------------------ */
/* Part 1 : offline unit sanity                                       */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${msg}`);
  } else {
    failed++;
    console.log(`  !!  ${msg}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

console.log("\n=== Part 1 : offline sanity ===\n");

/* normalizeName */
assertEq(normalizeName("Dattes Medjool.webp"), "dattes medjool", "strips extension + lowercases");
assertEq(normalizeName("Huile_d'olive 500ml.JPG"), "huile d olive 500ml", "strips apostrophes, keeps units");
assertEq(normalizeName("Épicéa_spécial.png"), "epicea special", "strips diacritics");
assertEq(normalizeName("  multi   spaces.jpg  "), "multi spaces", "collapses spaces");

/* tokenize drops stopwords */
const toks = tokenize(normalizeName("Huile d'olive et beurre de la maison"));
assert(!toks.includes("de") && !toks.includes("la") && !toks.includes("et"), "tokenize strips FR stopwords");
assert(toks.includes("huile") && toks.includes("olive") && toks.includes("beurre"), "tokenize keeps content words");

/* jaccardWeighted */
assertEq(jaccardWeighted(["a", "b"], ["a", "b"]), 1, "identical sets → 1");
assertEq(jaccardWeighted([], []), 0, "both empty → 0");
assert(jaccardWeighted(["a", "b"], ["b", "c"]) > 0 && jaccardWeighted(["a", "b"], ["b", "c"]) < 1, "partial overlap in (0,1)");

/* findMatches — exact slug match */
const products: CatalogProduct[] = [
  { id: "1", slug: "dattes-medjool", nom: "Dattes Medjool", rayon: "epices-du-monde" },
  { id: "2", slug: "huile-olive-500ml", nom: "Huile d'olive 500ml", rayon: "saveur-mediterranee" },
  { id: "3", slug: "semoule-couscous-moyenne", nom: "Semoule de couscous moyenne", rayon: "produits-courants" },
  { id: "4", slug: "thiere-marocaine", nom: "Théière marocaine", rayon: "saveur-mediterranee" },
  { id: "5", slug: "harissa-tunisienne-forte", nom: "Harissa tunisienne forte", rayon: "saveur-mediterranee" },
];

const m1 = findMatches("dattes-medjool.webp", buildIndex(products));
assert(m1.best?.product.slug === "dattes-medjool", "exact slug → best match");
assertEq(m1.confidence, "high", "exact slug → high confidence");
assert(m1.best!.score >= 0.95, "exact slug → score >= 0.95");

/* findMatches — filename == nom */
const m2 = findMatches("Huile d'olive 500ml.jpg", buildIndex(products));
assert(m2.best?.product.slug === "huile-olive-500ml", "exact nom → best match");
assertEq(m2.confidence, "high", "exact nom → high confidence");

/* findMatches — partial match */
const m3 = findMatches("semoule-couscous.png", buildIndex(products));
assert(m3.best?.product.slug === "semoule-couscous-moyenne", "partial slug → best match");
assert(m3.best!.score >= 0.6, "partial → score >= 0.6");

/* findMatches — no match (garbage filename) */
const m4 = findMatches("IMG_0001.jpg", buildIndex(products));
assertEq(m4.best, null, "garbage filename → no best (below minScore)");

/* findMatches — rayonHint penalises wrong rayon */
const m5a = findMatches("harissa.jpg", buildIndex(products));
const m5b = findMatches("harissa.jpg", buildIndex(products), { rayonHint: "boucherie-halal" });
assert(
  (m5a.best?.score ?? 0) > (m5b.best?.score ?? 0),
  "rayonHint penalises non-matching rayon (score drops)",
);

/* findMatchesBatch shape */
const batch = findMatchesBatch(["dattes-medjool.webp", "garbage.png"], products);
assertEq(batch.length, 2, "batch returns one result per filename");
assertEq(batch[0].filename, "dattes-medjool.webp", "batch preserves order [0]");
assertEq(batch[1].best, null, "batch preserves order [1] (garbage → null)");

/* ------------------------------------------------------------------ */
/* Part 2 : live catalogue (optional)                                 */
/* ------------------------------------------------------------------ */

console.log("\n=== Part 2 : live catalogue ===\n");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("(skipped — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)");
} else {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("produits")
    .select("id, slug, nom, rayon, image_url");

  if (error) {
    console.error("[supabase error]", error.message);
    process.exit(1);
  }

  const all = (data ?? []) as CatalogProduct[];
  console.log(`Loaded ${all.length} produits from Supabase`);
  if (all.length === 0) {
    console.log("(catalogue empty — nothing to test)");
  } else {
    const withImage = all.filter((p) => !!p.image_url).length;
    console.log(`  with image_url    : ${withImage}`);
    console.log(`  without image_url : ${all.length - withImage}\n`);

    /* Curated realistic filenames reflecting naming conventions we expect
       from admin drag-drop : some slug-identical, some nom-derived,
       some with rayon prefix, some with weight suffix, some garbage.    */
    const sampleFilenames = [
      /* Likely high-confidence matches if catalogue is seeded */
      "dattes-medjool.webp",
      "harissa-tunisienne.jpg",
      "semoule-couscous-moyenne.png",
      "huile-olive-500ml.webp",
      "merguez-agneau.jpg",
      "cumin-moulu-100g.jpg",
      "feta-500g.webp",
      "baklava-pistache.png",
      /* Garbage / ambiguous */
      "IMG_1234.jpg",
      "photo (2).webp",
      "a.png",
      /* Real product names we have */
      "Huile d'olive vierge extra.webp",
      "Poulet entier halal 1kg.jpg",
    ];

    const idx = buildIndex(all);
    console.log("Filename → best match (score / confidence)\n");
    for (const f of sampleFilenames) {
      const res = findMatches(f, idx);
      if (res.best) {
        const b = res.best;
        const flag = b.hasImage ? "[img]" : "[---]";
        console.log(
          `  ${f.padEnd(40)} → ${String(b.product.nom).padEnd(38)} ${b.score.toFixed(3)} ${res.confidence.padEnd(6)} ${flag}`,
        );
      } else {
        console.log(`  ${f.padEnd(40)} → (no match above minScore)     -     ${res.confidence}`);
      }
    }

    /* Distribution of confidence over a broader synthetic sweep : take
       every product's slug as a "filename" and verify it matches itself. */
    const selfTest = all.slice(0, Math.min(50, all.length));
    let selfHit = 0;
    for (const p of selfTest) {
      const res = findMatches(`${p.slug}.webp`, idx);
      if (res.best?.product.id === p.id) selfHit++;
    }
    console.log(
      `\nSelf-match sanity : ${selfHit}/${selfTest.length} produits matched themselves from `
        + `"<slug>.webp"`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Summary                                                            */
/* ------------------------------------------------------------------ */

console.log(`\n=== Summary : ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
