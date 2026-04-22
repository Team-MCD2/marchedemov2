// ====================================================================
// scripts/seed-produits.mjs
//
// Imports the starter product catalogue (~65 produits répartis sur les
// 10 rayons principaux) from scripts/data/produits-starter.json into
// the Supabase public.produits table.
//
// Upsert on slug — safe to re-run. Existing rows matching a slug will
// be updated with the starter values, which is useful if you want to
// reset the catalogue to the canonical sample set.
//
// Each produit uses `badge` as a sub-category indicator (Agneau, Bœuf,
// Volaille, Charcuterie for boucherie-halal ; Exotique, Tubercule,
// Dattes for fruits-legumes ; etc.). No prix_indicatif is set (null),
// matching the public doctrine of not showing retail prices outside
// the promos module.
//
// Usage :
//   node --env-file=.env.local scripts/seed-produits.mjs
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const STARTER_FILE = join(__dirname, "data", "produits-starter.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Required: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Run with:  node --env-file=.env.local scripts/seed-produits.mjs"
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function normalize(p) {
  return {
    slug: String(p.slug).trim().toLowerCase(),
    nom: String(p.nom).trim(),
    description: p.description ?? "",
    image_url: p.image_url ?? null,
    prix_indicatif: p.prix_indicatif != null ? Number(p.prix_indicatif) : null,
    unite: p.unite ?? null,
    rayon: p.rayon,
    origine: p.origine ?? null,
    badge: p.badge ?? null,
    actif: p.actif !== false,
    ordre: Number.isFinite(Number(p.ordre)) ? Number(p.ordre) : 0,
  };
}

async function main() {
  const raw = JSON.parse(await readFile(STARTER_FILE, "utf8"));
  const produits = raw.produits ?? [];
  console.log(`\n▶ Seeding ${produits.length} produits from ${STARTER_FILE}\n`);

  const rows = produits.map(normalize);

  /* Chunk to stay within Supabase payload limits (plenty of headroom, but good habit) */
  const CHUNK = 50;
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
  }

  /* Small summary per rayon */
  const byRayon = rows.reduce((acc, r) => {
    acc[r.rayon] = (acc[r.rayon] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`✓ Upserted ${ok} produits.\n`);
  console.log("Répartition par rayon :");
  for (const [rayon, count] of Object.entries(byRayon).sort()) {
    console.log(`  ${rayon.padEnd(22)} → ${count}`);
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
