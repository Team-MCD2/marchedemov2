// ====================================================================
// scripts/apply-images-local.mjs
//
// Applies image_url updates from scripts/data/updates-auchan.json to
// the local fallback catalogue at src/data/produits-catalogue.json.
//
// Behavior:
// - Loads updates-auchan.json (output of match-auchan-catalogue.mjs).
// - Loads src/data/produits-catalogue.json.
// - For each update, finds the matching produit by slug and sets its
//   `image_url` to the Auchan URL.
// - Writes the catalogue back, preserving all other fields.
//
// Modes:
//   default        : only fill image_url when currently null/empty.
//   --overwrite    : also replace existing image_url (use carefully).
//   --dry-run      : print what would change, don't write.
//
// Usage:
//   node scripts/apply-images-local.mjs              # safe default
//   node scripts/apply-images-local.mjs --dry-run
//   node scripts/apply-images-local.mjs --overwrite
// ====================================================================
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const UPDATES_FILE = join(ROOT, "scripts", "data", "updates-auchan.json");
const CATALOGUE_FILE = join(ROOT, "src", "data", "produits-catalogue.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const OVERWRITE = args.includes("--overwrite");

async function main() {
  const updatesRaw = JSON.parse(await readFile(UPDATES_FILE, "utf8"));
  const updates = updatesRaw.updates ?? [];
  const catalogue = JSON.parse(await readFile(CATALOGUE_FILE, "utf8"));
  const produits = catalogue.produits ?? [];

  const bySlug = new Map(produits.map((p) => [p.slug, p]));

  let changed = 0;
  let skippedExisting = 0;
  let missingSlug = 0;

  for (const u of updates) {
    const p = bySlug.get(u.slug);
    if (!p) {
      missingSlug += 1;
      console.log(`[skip] slug not in local catalogue: ${u.slug}`);
      continue;
    }
    if (p.image_url && !OVERWRITE) {
      skippedExisting += 1;
      continue;
    }
    if (p.image_url === u.image_url) continue;

    if (DRY_RUN) {
      console.log(`[dry] ${u.slug} -> ${u.image_url}`);
    } else {
      p.image_url = u.image_url;
    }
    changed += 1;
  }

  if (!DRY_RUN && changed > 0) {
    catalogue._image_apply_at = new Date().toISOString();
    catalogue._image_apply_count = (catalogue._image_apply_count ?? 0) + changed;
    await writeFile(CATALOGUE_FILE, JSON.stringify(catalogue, null, 2), "utf8");
  }

  console.log(`[apply] updates=${updates.length} changed=${changed} skipped-existing=${skippedExisting} missing-slug=${missingSlug}`);
  console.log(`[apply] ${DRY_RUN ? "(dry-run, file unchanged)" : `wrote ${CATALOGUE_FILE}`}`);
}

main().catch((err) => {
  console.error("❌ Apply failed:", err);
  process.exit(1);
});
