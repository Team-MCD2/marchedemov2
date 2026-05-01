// ====================================================================
// scripts/apply-catalogue-supabase.mjs
//
// Pushes the local src/data/produits-catalogue.json into the live
// Supabase public.produits table. Per slug, syncs:
//   image_url, rayon, categorie, sous_categorie, badge, origine, ordre
//
// This is the canonical bulk-sync after running the matcher and the
// classifier locally. Safer than a blind upsert because it pulls each
// slug's current row first, computes a diff, and only writes columns
// that actually changed.
//
// Flags:
//   --dry-run          show diff without writing.
//   --slugs=a,b,c      restrict to a comma-separated subset.
//   --only=field1,2    restrict the writeable column set.
//                      (default: image_url,rayon,categorie,sous_categorie)
//   --include-meta     also push badge,origine,ordre.
//
// Usage:
//   node --env-file=.env.local scripts/apply-catalogue-supabase.mjs --dry-run
//   node --env-file=.env.local scripts/apply-catalogue-supabase.mjs
// ====================================================================
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOGUE = path.join(ROOT, "src", "data", "produits-catalogue.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INCLUDE_META = args.includes("--include-meta");
const slugsArg = args.find((a) => a.startsWith("--slugs="));
const onlySlugs = slugsArg ? new Set(slugsArg.slice("--slugs=".length).split(",").filter(Boolean)) : null;
const onlyArg = args.find((a) => a.startsWith("--only="));
const DEFAULT_FIELDS = ["image_url", "rayon", "categorie", "sous_categorie"];
const META_FIELDS = ["badge", "origine", "ordre"];
const FIELDS = onlyArg
  ? onlyArg.slice("--only=".length).split(",").filter(Boolean)
  : INCLUDE_META
    ? [...DEFAULT_FIELDS, ...META_FIELDS]
    : DEFAULT_FIELDS;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env vars. Required: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with:  node --env-file=.env.local scripts/apply-catalogue-supabase.mjs",
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/* Normalise null/undefined/empty-string for diff comparison. */
function norm(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const allLocal = cat.produits ?? [];
  const local = onlySlugs
    ? allLocal.filter((p) => onlySlugs.has(p.slug))
    : allLocal;

  console.log(
    `[apply] catalogue=${allLocal.length} target=${local.length} ` +
    `fields=[${FIELDS.join(",")}] dry-run=${DRY_RUN}`,
  );

  /* Pull the live rows for the slugs we want to touch. */
  const slugs = local.map((p) => p.slug);
  const liveBySlug = new Map();
  const CHUNK = 200;
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const slice = slugs.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("produits")
      .select("slug,image_url,rayon,categorie,sous_categorie,badge,origine,ordre")
      .in("slug", slice);
    if (error) {
      console.error(`Read failed at chunk ${i}: ${error.message}`);
      process.exit(1);
    }
    for (const r of data ?? []) liveBySlug.set(r.slug, r);
  }

  /* Build per-slug diff and the patch payload. */
  const patches = []; /* {slug, patch:{...}, diff:[...]} */
  let missingSlug = 0;
  let unchanged = 0;
  for (const p of local) {
    const live = liveBySlug.get(p.slug);
    if (!live) {
      missingSlug += 1;
      continue;
    }
    const patch = {};
    const diff = [];
    for (const f of FIELDS) {
      const next = norm(p[f]);
      const prev = norm(live[f]);
      if (next !== prev) {
        patch[f] = next;
        diff.push(`${f}: ${JSON.stringify(prev)} -> ${JSON.stringify(next)}`);
      }
    }
    if (Object.keys(patch).length === 0) {
      unchanged += 1;
      continue;
    }
    patches.push({ slug: p.slug, patch, diff });
  }

  console.log(
    `[apply] to-update=${patches.length} unchanged=${unchanged} ` +
    `missing-slug=${missingSlug}`,
  );

  /* Per-field stats so it's clear what is actually being pushed. */
  const fieldHits = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  for (const p of patches) for (const f of Object.keys(p.patch)) fieldHits[f] += 1;
  console.log("[apply] per-field changes :");
  for (const f of FIELDS) console.log(`  ${fieldHits[f].toString().padStart(4)}  ${f}`);

  if (DRY_RUN) {
    /* Print a sample so we can eyeball the changes. */
    for (const p of patches.slice(0, 25)) {
      console.log(`[dry] ${p.slug}`);
      for (const d of p.diff) console.log(`       ${d}`);
    }
    if (patches.length > 25) console.log(`[dry] ... +${patches.length - 25} more`);
    return;
  }

  if (patches.length === 0) {
    console.log("[apply] nothing to push.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const p of patches) {
    const { error } = await sb.from("produits").update(p.patch).eq("slug", p.slug);
    if (error) {
      failed += 1;
      console.error(`Update failed for ${p.slug}: ${error.message}`);
      continue;
    }
    ok += 1;
  }

  console.log(`[apply] done. ok=${ok} failed=${failed} total=${patches.length}`);
}

main().catch((err) => {
  console.error("Apply failed:", err);
  process.exit(1);
});
