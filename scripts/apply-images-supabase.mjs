// ====================================================================
// scripts/apply-images-supabase.mjs
//
// Pushes image_url updates from scripts/data/updates-auchan.json into
// the live Supabase public.produits table.
//
// Behavior:
// - For each update, only updates rows where slug matches.
// - By default, only fills image_url when the row currently has none.
//   Pass --overwrite to force-replace existing image_url values.
// - Pass --dry-run to print what would change without touching the DB.
// - Updates are sent in chunks via .upsert with onConflict=slug to
//   keep the operation idempotent and safe to re-run.
//
// Usage:
//   node --env-file=.env.local scripts/apply-images-supabase.mjs --dry-run
//   node --env-file=.env.local scripts/apply-images-supabase.mjs
//   node --env-file=.env.local scripts/apply-images-supabase.mjs --overwrite
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const UPDATES_FILE = join(ROOT, "scripts", "data", "updates-auchan.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const OVERWRITE = args.includes("--overwrite");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Required : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Run with:  node --env-file=.env.local scripts/apply-images-supabase.mjs",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const raw = JSON.parse(await readFile(UPDATES_FILE, "utf8"));
  const updates = raw.updates ?? [];

  if (updates.length === 0) {
    console.log("[apply-sb] no updates to apply.");
    return;
  }

  /* Pull current image_url for every slug we plan to touch, so we
     can respect the OVERWRITE flag. */
  const slugs = updates.map((u) => u.slug);
  const existing = new Map();
  const CHUNK_READ = 200;
  for (let i = 0; i < slugs.length; i += CHUNK_READ) {
    const slice = slugs.slice(i, i + CHUNK_READ);
    const { data, error } = await sb
      .from("produits")
      .select("slug,image_url")
      .in("slug", slice);
    if (error) {
      console.error(`❌ Read failed at chunk ${i}: ${error.message}`);
      process.exit(1);
    }
    for (const r of data ?? []) existing.set(r.slug, r.image_url);
  }

  /* Build the set of rows we actually want to push. */
  const toApply = [];
  let skippedExisting = 0;
  let missingSlug = 0;
  let unchanged = 0;

  for (const u of updates) {
    if (!existing.has(u.slug)) {
      missingSlug += 1;
      console.log(`[skip] slug not in Supabase: ${u.slug}`);
      continue;
    }
    const current = existing.get(u.slug);
    if (current && !OVERWRITE) {
      skippedExisting += 1;
      continue;
    }
    if (current === u.image_url) {
      unchanged += 1;
      continue;
    }
    toApply.push({ slug: u.slug, image_url: u.image_url });
  }

  console.log(
    `[apply-sb] updates=${updates.length} push=${toApply.length} ` +
    `skipped-existing=${skippedExisting} unchanged=${unchanged} missing-slug=${missingSlug} ` +
    `(overwrite=${OVERWRITE}, dry-run=${DRY_RUN})`,
  );

  if (DRY_RUN) {
    for (const r of toApply) console.log(`[dry] ${r.slug} -> ${r.image_url}`);
    return;
  }

  if (toApply.length === 0) {
    console.log("[apply-sb] nothing to push.");
    return;
  }

  /* Update one slug at a time to avoid wiping other columns via upsert.
     A targeted .update() keeps the rest of the row intact and is safer
     than upserting partial rows. */
  let ok = 0;
  for (const r of toApply) {
    const { error } = await sb
      .from("produits")
      .update({ image_url: r.image_url })
      .eq("slug", r.slug);
    if (error) {
      console.error(`❌ Update failed for ${r.slug}: ${error.message}`);
      continue;
    }
    ok += 1;
  }

  console.log(`[apply-sb] ✓ updated ${ok}/${toApply.length} rows.`);
}

main().catch((err) => {
  console.error("❌ Apply (supabase) failed:", err);
  process.exit(1);
});
