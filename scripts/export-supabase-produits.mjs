// ====================================================================
// scripts/export-supabase-produits.mjs
//
// Dumps the live `public.produits` table from Supabase to
// scripts/data/produits-supabase.json so the image matcher can score
// candidates against the authoritative platform catalogue.
//
// Output shape mirrors the local catalogue used by produits-repo.ts:
//   { _generated_at, _count, _by_rayon, produits: [...] }
//
// Each produit row keeps only the columns relevant to matching/wiring:
//   slug, nom, description, image_url, rayon, categorie,
//   sous_categorie, origine, badge, actif, ordre, unite
//
// Usage:
//   node --env-file=.env.local scripts/export-supabase-produits.mjs
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "data", "produits-supabase.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Required : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Run with:  node --env-file=.env.local scripts/export-supabase-produits.mjs",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const PAGE = 1000;
const COLUMNS = "slug,nom,description,image_url,rayon,categorie,sous_categorie,origine,badge,actif,ordre,unite";

async function main() {
  console.log("[export] fetching public.produits ...");
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await sb
      .from("produits")
      .select(COLUMNS)
      .order("rayon", { ascending: true })
      .order("ordre", { ascending: true })
      .order("nom", { ascending: true })
      .range(from, to);

    if (error) {
      console.error(`❌ Supabase error at range ${from}-${to}: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }

  const byRayon = {};
  for (const p of all) {
    byRayon[p.rayon] = (byRayon[p.rayon] ?? 0) + 1;
  }
  const withImages = all.filter((p) => !!p.image_url).length;

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        _generated_at: new Date().toISOString(),
        _count: all.length,
        _with_images: withImages,
        _by_rayon: byRayon,
        produits: all,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`[export] ✓ ${all.length} produits (${withImages} with image) -> ${OUT_FILE}`);
  console.log("[export] by rayon :");
  for (const [r, c] of Object.entries(byRayon).sort()) {
    console.log(`  ${r.padEnd(22)} ${c}`);
  }
}

main().catch((err) => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
