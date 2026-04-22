// ====================================================================
// scripts/seed-supabase.mjs
//
// Migre les promos du Content Collection (src/content/promos/*.json)
// vers la table Supabase public.promos.
//
// Usage :
//   1. Récupérer SUPABASE_SERVICE_ROLE_KEY dans Supabase Studio
//      → Settings → API → service_role → "Reveal"
//   2. Ajouter dans .env.local :
//        SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
//   3. Lancer :
//        node --env-file=.env.local scripts/seed-supabase.mjs
//
// Upsert par slug → re-exécution safe.
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PROMOS_DIR = join(PROJECT_ROOT, "src/content/promos");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Required: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Run with:  node --env-file=.env.local scripts/seed-supabase.mjs"
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// -----------------------------------------------------------------
// Seed promos
// -----------------------------------------------------------------
async function seedPromos() {
  const files = (await readdir(PROMOS_DIR)).filter((f) => f.endsWith(".json"));
  console.log(`\n▶ Seeding ${files.length} promos from ${PROMOS_DIR}\n`);

  let ok = 0;
  let ko = 0;

  for (const f of files) {
    const raw = JSON.parse(await readFile(join(PROMOS_DIR, f), "utf8"));
    const row = {
      slug: raw.id,
      titre: raw.titre,
      description: raw.description ?? "",
      image_url: raw.image,
      prix_original: Number(raw.prix_original),
      prix_promo: Number(raw.prix_promo),
      reduction_pct: raw.reduction_pct,
      rayon: raw.rayon,
      magasin: raw.magasin ?? "tous",
      date_debut: raw.date_debut,
      date_fin: raw.date_fin,
      mise_en_avant: !!raw.mise_en_avant,
      actif: raw.actif !== false,
    };
    const { error } = await sb.from("promos").upsert(row, { onConflict: "slug" });
    if (error) {
      console.error(`  ❌ ${f.padEnd(18)} → ${error.message}`);
      ko++;
    } else {
      console.log(`  ✓  ${f.padEnd(18)} → ${raw.id} (${raw.titre})`);
      ok++;
    }
  }

  console.log(`\n✓ Done. ${ok} upserted, ${ko} failed.`);
}

// -----------------------------------------------------------------
// Entry
// -----------------------------------------------------------------
try {
  await seedPromos();
} catch (err) {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}
