/**
 * revert-bad-gf-matches.mjs
 * -------------------------
 * Clears any image_url pointing to grandfrais.com from produits table.
 * The earlier fuzzy matcher assigned GF images to products whose names
 * only shared letter occurrences (e.g. "Volaille de Bresse" -> "Boulettes
 * de viande halal" @ 68%). Safer to start clean and drive per-category
 * images from a handpicked static map instead.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from("produits")
  .select("id, nom, image_url")
  .like("image_url", "%grandfrais.com%");

if (error) {
  console.error("[error] fetch:", error);
  process.exit(1);
}

console.log(`[found] ${data.length} products with grandfrais.com images`);
for (const p of data) {
  console.log(`  - ${p.nom} :: ${p.image_url}`);
}

if (data.length === 0) process.exit(0);

const ids = data.map((p) => p.id);
const { error: updErr } = await supabase
  .from("produits")
  .update({ image_url: null })
  .in("id", ids);

if (updErr) {
  console.error("[error] update:", updErr);
  process.exit(1);
}
console.log(`[done] cleared image_url on ${ids.length} products`);
