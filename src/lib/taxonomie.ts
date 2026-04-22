/**
 * Taxonomie du catalogue — arbre de catégories par rayon.
 *
 * Structure :
 *   TAXONOMIE[rayonSlug] = {
 *     [categorieLabel] : [sousCategorieLabel1, ...] | null
 *   }
 *
 * - `null` = feuille directement sous la catégorie (pas de niveau 2).
 * - Les labels utilisés ici sont les VALEURS stockées dans
 *   `produits.categorie` et `produits.sous_categorie`.
 *   Le slug URL est généré par `slugify()` plus bas.
 *
 * Cette taxonomie est la vérité pour :
 *   - Les pages /rayons/[slug]/[cat]/[sub] (navigation drill-down)
 *   - L'admin /admin/produits (select boxes)
 *   - Les scrapers (mapping des catégories Grand Frais/Carrefour → les nôtres)
 *
 * Pour ajouter une catégorie : éditer ce fichier + re-seeder les produits.
 */

import type { RayonSlug } from "@/lib/site";

/* --------------------------------------------------------------
   Structure de données
-------------------------------------------------------------- */

/** `null` = pas de sous-catégories (catégorie est une feuille). */
export type SousCategories = string[] | null;

export type RayonTaxonomie = Record<string, SousCategories>;

export const TAXONOMIE: Record<RayonSlug, RayonTaxonomie> = {
  "boucherie-halal": {
    "Viandes": ["Agneau", "Bœuf", "Veau", "Mouton"],
    "Volailles": ["Poulet", "Dinde", "Canard"],
    "Charcuterie halal": ["Merguez", "Saucisses", "Pastrami"],
    "Préparations": ["Brochettes", "Hachis", "Marinades"],
  },

  "fruits-legumes": {
    "Fruits": ["Exotiques", "De saison", "Agrumes", "Rouges", "Bio"],
    "Légumes": ["Frais", "Feuilles", "Racines", "Bio"],
    "Tubercules": ["Manioc", "Igname", "Patates douces"],
    "Aromates & herbes": null,
    "Dattes & fruits secs": ["Dattes", "Figues", "Abricots secs"],
  },

  "epices-du-monde": {
    "Maghreb": ["Mélanges", "Simples"],
    "Inde": ["Currys", "Masalas", "Simples"],
    "Afrique de l'Ouest": null,
    "Asie": null,
    "Méditerranée": null,
    "Piments": null,
  },

  "saveurs-afrique": {
    "Sauces & condiments": null,
    "Féculents & farines": ["Attiéké", "Mil", "Manioc", "Riz"],
    "Huiles": null,
    "Épicerie": ["Poudres", "Graines", "Boissons"],
  },

  "saveurs-asie": {
    "Riz & nouilles": ["Riz", "Nouilles", "Vermicelles"],
    "Sauces & condiments": ["Soja", "Piments", "Pâtes"],
    "Épicerie": ["Laits végétaux", "Thés", "Épicerie sèche"],
    "Frais": ["Tofu", "Kimchi", "Pickles"],
  },

  "saveur-mediterranee": {
    "Huiles & vinaigres": null,
    "Olives & tapenades": null,
    "Fromages": ["AOP", "Saumure", "Frais"],
    "Semoules & couscous": null,
    "Harissas & condiments": null,
  },

  "saveur-sud-amer": {
    "Céréales & graines": ["Quinoa", "Maïs", "Amarante"],
    "Légumineuses": ["Haricots", "Pois", "Lentilles"],
    "Farines": null,
    "Épicerie": null,
  },

  "balkans-turques": {
    "Boissons": ["Ayran", "Thés"],
    "Fromages": ["Halloumi", "Feta", "Kashar"],
    "Fruits secs & noix": ["Pistaches", "Noisettes", "Noix"],
    "Pâtisseries": ["Baklava", "Loukoums", "Halva"],
    "Épicerie balkanique": null,
  },

  "produits-courants": {
    "Épicerie salée": null,
    "Épicerie sucrée": null,
    "Boissons": null,
    "Hygiène & entretien": null,
  },

  "surgeles": {
    "Apéritifs": ["Samoussas", "Nems", "Bouchées"],
    "Plats préparés halal": null,
    "Légumes": null,
    "Poissons": null,
    "Desserts": null,
  },
};

/* Rayons à venir (présents dans le schema.sql mais pas encore dans
   site.ts). Quand ils seront ajoutés à RAYONS, déplacer ces entrées
   dans TAXONOMIE ci-dessus :

   "boulangerie": {
     "Pains du monde": ["Pain traditionnel", "Pains plats", "Wraps"],
     "Viennoiseries": null,
     "Pâtisseries orientales": null,
   },
   "produits-laitiers": {
     "Laits & yaourts": null,
     "Fromages du monde": ["AOP", "Frais", "À pâte dure"],
     "Beurres & crèmes": null,
     "Œufs": null,
   },
*/

/* --------------------------------------------------------------
   Slugify — label "Fruits exotiques" → "fruits-exotiques"
-------------------------------------------------------------- */

export function slugifyCat(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") /* strip accents */
    .replace(/[&']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* --------------------------------------------------------------
   Helpers drill-down
-------------------------------------------------------------- */

/**
 * Renvoie la liste des catégories d'un rayon sous forme de cards.
 * Retourne `null` si le rayon n'a pas de taxonomie (= affichage flat).
 */
export function getCategories(rayon: RayonSlug) {
  const tree = TAXONOMIE[rayon];
  if (!tree) return null;
  return Object.keys(tree).map((label) => ({
    label,
    slug: slugifyCat(label),
    hasChildren: Array.isArray(tree[label]) && (tree[label] as string[]).length > 0,
  }));
}

/**
 * Renvoie les sous-catégories d'une catégorie donnée, ou null
 * si la catégorie est une feuille (pas de niveau 2).
 */
export function getSousCategories(
  rayon: RayonSlug,
  categorieSlug: string
): { label: string; slug: string }[] | null {
  const tree = TAXONOMIE[rayon];
  if (!tree) return null;
  const catLabel = Object.keys(tree).find((l) => slugifyCat(l) === categorieSlug);
  if (!catLabel) return null;
  const subs = tree[catLabel];
  if (!subs || subs.length === 0) return null;
  return subs.map((label) => ({ label, slug: slugifyCat(label) }));
}

/**
 * Retrouve le label "canonique" depuis un slug (pour breadcrumb et DB match).
 */
export function categorieLabelFromSlug(
  rayon: RayonSlug,
  categorieSlug: string
): string | null {
  const tree = TAXONOMIE[rayon];
  if (!tree) return null;
  return Object.keys(tree).find((l) => slugifyCat(l) === categorieSlug) ?? null;
}

export function sousCategorieLabelFromSlug(
  rayon: RayonSlug,
  categorieSlug: string,
  sousCategorieSlug: string
): string | null {
  const subs = getSousCategories(rayon, categorieSlug);
  if (!subs) return null;
  return subs.find((s) => s.slug === sousCategorieSlug)?.label ?? null;
}

/**
 * Construit tous les chemins drill-down d'un rayon (pour getStaticPaths).
 * Produit : [{ cat: "fruits" }, { cat: "fruits", sub: "exotiques" }, ...]
 */
export function getDrillDownPaths(
  rayon: RayonSlug
): Array<{ cat: string; sub?: string }> {
  const tree = TAXONOMIE[rayon];
  if (!tree) return [];
  const paths: Array<{ cat: string; sub?: string }> = [];
  Object.entries(tree).forEach(([catLabel, subs]) => {
    const catSlug = slugifyCat(catLabel);
    paths.push({ cat: catSlug });
    if (subs && subs.length) {
      subs.forEach((subLabel) => {
        paths.push({ cat: catSlug, sub: slugifyCat(subLabel) });
      });
    }
  });
  return paths;
}
