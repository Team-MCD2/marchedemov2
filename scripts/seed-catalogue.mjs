// ====================================================================
// scripts/seed-catalogue.mjs
//
// Seeds Supabase public.produits with the FULL unified catalogue produced
// by scripts/merge-catalogue.mjs (starter + OpenFoodFacts scrape).
//
// Usage :
//   node scripts/merge-catalogue.mjs        # regenerate src/data/produits-catalogue.json
//   node --env-file=.env.local scripts/seed-catalogue.mjs
//
// Upsert on slug — safe to re-run.
//
// Difference vs seed-produits.mjs :
//   - seed-produits.mjs   → starter only (~72 rows, hand-curated)
//   - seed-catalogue.mjs  → starter + OFF (~358 rows, with real images)
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOGUE_FILE = join(__dirname, "..", "src", "data", "produits-catalogue.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Required : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Run with:  node --env-file=.env.local scripts/seed-catalogue.mjs",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/* Keep only the fields that exist in the DB schema. Drop `_source*` + `unite`
   if the DB doesn't have that column (schema-safe). */
function toDbRow(p) {
  return {
    slug: String(p.slug).trim().toLowerCase(),
    nom: String(p.nom).trim(),
    description: p.description ?? "",
    image_url: p.image_url ?? null,
    prix_indicatif: null,
    unite: p.unite ?? null,
    rayon: p.rayon,
    categorie: p.categorie ?? null,
    sous_categorie: p.sous_categorie ?? null,
    origine: p.origine ?? null,
    badge: p.badge ?? null,
    actif: p.actif !== false,
    ordre: Number.isFinite(Number(p.ordre)) ? Number(p.ordre) : 100,
  };
}

async function main() {
  const raw = JSON.parse(await readFile(CATALOGUE_FILE, "utf8"));
  const produits = raw.produits ?? [];
  console.log(`\n▶ Seeding ${produits.length} produits from unified catalogue\n`);

  const rows = produits.map(toDbRow);

  const CHUNK = 80;
  let ok = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("produits")
      .upsert(slice, { onConflict: "slug" })
      .select("slug");
    if (error) {
      console.error(`❌ Chunk ${i}–${i + slice.length} failed : ${error.message}`);
      process.exit(1);
    }
    ok += data?.length ?? 0;
    console.log(`  · chunk ${Math.floor(i / CHUNK) + 1} : ${data?.length}/${slice.length} upserted`);
  }

  const byRayon = rows.reduce((acc, r) => {
    acc[r.rayon] = (acc[r.rayon] ?? 0) + 1;
    return acc;
  }, {});
  const withImage = rows.filter((r) => r.image_url).length;
  console.log(`\n✓ Upserted ${ok} produits (${withImage} with images).\n`);
  console.log("Répartition par rayon :");
  for (const [rayon, count] of Object.entries(byRayon).sort()) {
    console.log(`  ${rayon.padEnd(22)} → ${count}`);
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
