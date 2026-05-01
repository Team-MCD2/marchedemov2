/**
 * update-products-with-images.mjs
 * ------------------------------
 * Updates Supabase products with images scraped from Grand Frais.
 * 
 * Strategy:
 * - Match Grand Frais products to existing products by name similarity
 * - Prioritize boucherie-halal section first
 * - Update image_url field in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Load Grand Frais data
const gfProducts = JSON.parse(readFileSync('scripts/data/produits-grandfrais.json', 'utf8'));

// Simple string similarity function (Levenshtein distance approximation)
function similarity(s1, s2) {
  s1 = s1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s2 = s2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  
  let matches = 0;
  const shorter = s1.length < s2.length ? s1 : s2;
  const longer = s1.length >= s2.length ? s1 : s2;
  
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

// Map Grand Frais sections to our rayon slugs
const sectionMapping = {
  'boucherie': 'boucherie-halal',
  'fruits-et-legumes': 'fruits-legumes',
  'epiceries-d-ici-et-d-ailleurs': 'epices-du-monde',
  'poissonnerie': 'surgele', // We'll map to surgele for now
  'fromagerie': 'surgele' // Map to surgele for now
};

async function updateProductImages() {
  console.log(`[start] Processing ${gfProducts.length} Grand Frais products`);
  
  // Get all products with images
  const productsWithImages = gfProducts.filter(p => p.image_url);
  
  console.log(`[focus] Found ${productsWithImages.length} products with images`);
  
  // Get existing products from Supabase
  const { data: existingProducts, error } = await supabase
    .from('produits')
    .select('id, nom, categorie, sous_categorie, image_url');
    
  if (error) {
    console.error('[error] Failed to fetch products:', error);
    return;
  }
  
  console.log(`[db] Found ${existingProducts.length} existing products`);
  
  let updated = 0;
  
  for (const gfProduct of productsWithImages) {
    // Find best matching existing product
    let bestMatch = null;
    let bestScore = 0;
    
    // Get the target rayon slug for this GF section
    const targetRayon = sectionMapping[gfProduct.section];
    if (!targetRayon) {
      console.log(`[skip] No mapping for section "${gfProduct.section}"`);
      continue;
    }
    
    for (const existing of existingProducts) {
      // Only match if category matches roughly or if it's in the right rayon
      const categoryMatch = existing.categorie?.toLowerCase().includes(targetRayon.replace('-', ' ')) ||
                           existing.categorie?.toLowerCase().includes(gfProduct.section.replace('-', ' '));
      
      if (categoryMatch || !existing.categorie) { // Also match products without categories
        const score = similarity(gfProduct.nom, existing.nom);
        if (score > bestScore && score > 0.6) { // 60% similarity threshold
          bestScore = score;
          bestMatch = existing;
        }
      }
    }
    
    if (bestMatch && !bestMatch.image_url) {
      console.log(`[match] "${gfProduct.nom}" → "${bestMatch.nom}" (${(bestScore * 100).toFixed(1)}% match)`);
      
      const { error: updateError } = await supabase
        .from('produits')
        .update({ image_url: gfProduct.image_url })
        .eq('id', bestMatch.id);
        
      if (updateError) {
        console.error(`[error] Failed to update product ${bestMatch.id}:`, updateError);
      } else {
        console.log(`[updated] Product ${bestMatch.id} now has image`);
        updated++;
      }
    }
  }
  
  console.log(`[done] Updated ${updated} products with images`);
}

updateProductImages().catch(console.error);
