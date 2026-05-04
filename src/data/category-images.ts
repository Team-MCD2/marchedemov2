/**
 * category-images.ts
 * ------------------
 * Handpicked representative images for each (rayon, categorie) and
 * (rayon, categorie, sous-categorie). Used by /rayons/[...path].astro
 * to give every category/sub-category card a DISTINCT, relevant image.
 *
 * ALL local image paths below have been visually inspected, not assigned
 * blindly from filenames — see the inline `// <content>` comments.
 *
 * When no suitable image is available, the entry is simply omitted. The
 * card then renders the gradient fallback (see [...path].astro), which
 * is intentionally NOT the faded rayon hero (that caused the "same image
 * everywhere" bug).
 *
 * Keys are the exact labels from src/lib/taxonomie.ts.
 */
import type { RayonSlug } from "@/lib/site";

type CatMap = Record<string, string>;
type SubMap = Record<string, Record<string, string>>;

export interface RayonImagePack {
  categories?: CatMap;
  sousCategories?: SubMap; // sousCategories[categorie][sous-cat] = url
}

const GF = "https://www.grandfrais.com/images/institBackoffice/uploads/";
const GF_U = "https://www.grandfrais.com/userfiles/image/images/";

/* OFF (Open Food Facts) public product photos — used as polished
   fallbacks for sub-categories that don't yet have their own products
   in the catalogue. Every URL was visually inspected. */
const OFF = {
  /* boucherie-halal */
  veauEscalope:        "https://images.openfoodfacts.org/images/products/228/847/401/8105/front_fr.12.400.jpg",
  agneauFlageolets:    "https://images.openfoodfacts.org/images/products/356/007/055/8667/front_fr.14.400.jpg",
  canardMagret:        "https://images.openfoodfacts.org/images/products/306/716/362/3894/front_fr.5.400.jpg",
  saucissesHalal:      "https://images.openfoodfacts.org/images/products/356/007/056/9182/front_fr.18.400.jpg",
  brochettes:          "https://images.openfoodfacts.org/images/products/406/145/828/9849/front_de.4.400.jpg",
  /* fruits-legumes */
  agrumesOrange:       "https://images.openfoodfacts.org/images/products/544/900/026/6002/front_fr.55.400.jpg",
  feuillesEpinards:    "https://images.openfoodfacts.org/images/products/359/671/044/6087/front_fr.50.400.jpg",
  racinesOignon:       "https://images.openfoodfacts.org/images/products/900/251/560/1018/front_fr.66.400.jpg",
  figuesSechees:       "https://images.openfoodfacts.org/images/products/327/072/000/4115/front.4.400.jpg",
  persillade:          "https://images.openfoodfacts.org/images/products/20226572/front.9.400.jpg",
  /* saveurs-afrique */
  maniocCongele:       "https://images.openfoodfacts.org/images/products/341/600/901/1010/front_fr.12.400.jpg",
  rizThai:             "https://images.openfoodfacts.org/images/products/541/067/300/5052/front_fr.3.400.jpg",
  sesameGraines:       "https://images.openfoodfacts.org/images/products/360/090/002/1050/front_fr.41.400.jpg",
  /* saveurs-asie */
  theVert:             "https://images.openfoodfacts.org/images/products/505/595/390/0292/front.5.400.jpg",
  tofuNature:          "https://images.openfoodfacts.org/images/products/348/346/001/0500/front.8.400.jpg",
  cornichonsPickles:   "https://images.openfoodfacts.org/images/products/359/671/046/9611/front_fr.54.400.jpg",
  /* saveur-sud-amer */
  amaranteGraines:     "https://images.openfoodfacts.org/images/products/332/948/871/1251/front.7.400.jpg",
  /* saveur-mediterranee — fresh-cheese fallback (no in-DB product yet) */
  freshMozzarella:     "https://images.openfoodfacts.org/images/products/001/111/004/3740/front_en.3.400.jpg",
  /* extra Asian épicerie — used for the level-1 Épicerie card */
  huileSesameAsie:     "https://images.openfoodfacts.org/images/products/333/659/010/6264/front_en.65.400.jpg",
  /* balkans-turques */
  kasharPeynir:        "https://images.openfoodfacts.org/images/products/868/067/934/0281/front_tr.3.400.jpg",
  noisettesDecortiquees: "https://images.openfoodfacts.org/images/products/350/249/019/2106/front_fr.37.400.jpg",
  noixMelange:         "https://images.openfoodfacts.org/images/products/20815394/front_en.134.400.jpg",
  loukoumsRose:        "https://images.openfoodfacts.org/images/products/376/010/139/1052/front_fr.3.400.jpg",
  halvaSesame:         "https://images.openfoodfacts.org/images/products/081/496/802/1102/front_fr.3.400.jpg",
  /* surgeles */
  poissonsPanes:       "https://images.openfoodfacts.org/images/products/352/368/048/1244/front_fr.24.400.jpg",
  bouchees:            "https://images.openfoodfacts.org/images/products/325/647/704/5007/front_fr.9.400.jpg",
};

/* Local image shorthands for readability. */
const L = {
  /* boucherie-halal */
  seasonedBeef: "/images/rayons/boucherie-halal/11062b-603fa6aa568c43e08182a6e546211812f000.jpg", // beef roast being spiced
  rawCutletsRosemary: "/images/rayons/boucherie-halal/image-de-cindie-hansen.jpg",                // raw cutlets + rosemary
  /* fruits-legumes */
  pommeGolden: "/images/rayons/fruits-legumes/pomme-golden.jpg",
  legumesMix: "/images/rayons/fruits-legumes/legumes-organiques.jpg", // peppers + tomatoes + zucchini
  navet: "/images/rayons/fruits-legumes/navet.jpg",
  echalotte: "/images/rayons/fruits-legumes/echalotte.jpg",
  pruneaux: "/images/rayons/fruits-legumes/pruneaux.jpg",
  kiwi: "/images/rayons/fruits-legumes/kiwi.jpg",
  peche: "/images/rayons/fruits-legumes/peche.jpg",
  citron: "/images/rayons/fruits-legumes/citron.jpg",
  raisin: "/images/rayons/fruits-legumes/raisin.jpg",
  poire: "/images/rayons/fruits-legumes/poire.jpg",
  oignonRouge: "/images/rayons/fruits-legumes/oignon-rouge.jpg",
  /* epices-du-monde */
  dubaiMarket: "/images/rayons/epices-du-monde/marche-aux-epices-dubai.jpg", // varied spice market
  samiaPacks: "/images/rayons/epices-du-monde/716c51-9b04d.jpg",             // Maghreb spice packs (Raz el Hanout, Couscous)
  chiliSlicing: "/images/rayons/epices-du-monde/11062b-430368cba3be40c8b0065e900753a781f000.jpg", // red chili + knife
  floralSpicePile: "/images/rayons/epices-du-monde/nsplsh-528df.jpg",        // white powder in clay bowl
  indianSpiceMarket: "/images/rayons/epices-du-monde/image-de-paolo-bendandi.jpg", // curry/tandoori/masala bins
  almondCookies: "/images/rayons/epices-du-monde/716c51-32bbd.jpg",          // almond cookies on wood
  /* saveurs-afrique */
  africanRiceDishes: "/images/rayons/saveurs-afrique/image-de-keesha-x27-s-kitchen.jpg", // rice/stew/plantain
  peelingManioc: "/images/rayons/saveurs-afrique/image-de-annie-spratt.jpg",             // woman peeling cassava
  coffeeBeans: "/images/rayons/saveurs-afrique/11062b-9138c0db6e6443b7a1e1d02e0163279ff000.jpg", // roasted beans
  /* saveurs-asie */
  riceGrains: "/images/rayons/saveurs-asie/11062b-3f3563e7c2d44e50b2f3c9fedf6cc1bbf000.jpg", // white rice macro
  dumplings: "/images/rayons/saveurs-asie/image-de-jason-leung.jpg",                         // xiao long bao
  sushiSoy: "/images/rayons/saveurs-asie/image-de-mahmoud-fawzy.jpg",                        // sushi + soy sauce
  hkStreet: "/images/rayons/saveurs-asie/image-de-arnie-chou.jpg",                           // HK neon signs
  indianCurry: "/images/rayons/saveurs-asie/curry-de-poulet-indien.jpg",                     // chicken curry dish
  /* saveur-sud-amer */
  colombianPlate: "/images/rayons/saveur-sud-amer/plateau-colombien-alexandra-tran.jpg",     // plantain/avocado/arepa
  /* produits-courants */
  cashier: "/images/rayons/produits-courants/caisse-au-supermarche.jpg",                     // supermarket checkout
  /* surgeles */
  frozenVegs: "/images/rayons/surgeles/legumes-surgeles.jpg",                                // frozen veg bags
  frozenAisles: "/images/rayons/surgeles/vitrines-congelees.jpg",                            // freezer aisles
};

export const CATEGORY_IMAGES: Partial<Record<RayonSlug, RayonImagePack>> = {
  "boucherie-halal": {
    categories: {
      "Viandes": `${GF}NAVARIN%20AGNEAU.jpg`,        // lamb navarin (GF product shot)
      "Volailles": `${GF}651d413ca2dbb_poulet-bresse.webp`, // whole Bresse chicken
      "Préparations": L.seasonedBeef,                 // beef being seasoned (prep)
      "Charcuterie halal": OFF.saucissesHalal,        // OFF "Saucisses de Volaille Halal" packshot
    },
    sousCategories: {
      "Viandes": {
        "Agneau": `${GF}NAVARIN%20AGNEAU.jpg`,
        "Bœuf": `${GF}FILET%20DE%20BOEUF%20AU%20ROMARIN.jpg`,
        "Veau": `${GF}VEAU%20CORSE.jpg`,
        "Mouton": OFF.agneauFlageolets,             // lamb with flageolets (closest mutton-style visual)
      },
      "Volailles": {
        "Poulet": `${GF}651d413ca2dbb_poulet-bresse.webp`,
        "Dinde": `${GF}cuisse%20dinde.jpg`,
        "Canard": `${GF}NOUILLES%20SAUTEES%20AU%20CANARD.jpg`,
      },
      "Charcuterie halal": {
        "Saucisses": OFF.saucissesHalal,
      },
      "Préparations": {
        "Brochettes": OFF.brochettes,
        "Hachis": OFF.brochettes,                    // share a prep visual until we have a real hachis shot
        "Marinades": OFF.brochettes,
      },
    },
  },

  "fruits-legumes": {
    categories: {
      "Fruits": L.pommeGolden,
      "Légumes": L.legumesMix,
      "Tubercules": L.navet,
      "Aromates & herbes": OFF.persillade,            // persillade close-up
      "Dattes & fruits secs": L.pruneaux,
    },
    sousCategories: {
      "Fruits": {
        "Exotiques": L.kiwi,
        "De saison": L.peche,
        "Agrumes": OFF.agrumesOrange,                // a real orange product shot
        "Rouges": L.raisin,
        "Bio": L.poire,
      },
      "Légumes": {
        "Frais": L.legumesMix,
        "Racines": OFF.racinesOignon,                // oignons rouges
        "Feuilles": OFF.feuillesEpinards,            // épinards branches
        "Bio": L.echalotte,
      },
      "Dattes & fruits secs": {
        "Figues": OFF.figuesSechees,                 // figues séchées packshot
      },
    },
  },

  "epices-du-monde": {
    categories: {
      "Maghreb": L.samiaPacks,                       // Raz el Hanout, Épices couscous packs
      "Inde": L.indianSpiceMarket,                   // Curry/tandoori/masala bins labeled
      "Afrique de l'Ouest": L.floralSpicePile,       // white-powder spice bowl
      "Méditerranée": L.dubaiMarket,                 // varied colorful spice market
      "Piments": L.chiliSlicing,                     // red chili being sliced
      // "Asie" intentionally omitted — no usable shot (Buldak logo only)
    },
    sousCategories: {},
  },

  "saveurs-afrique": {
    categories: {
      "Sauces & condiments": L.africanRiceDishes,    // rice/stew/plantain plates
      "Féculents & farines": L.peelingManioc,        // woman peeling cassava
      "Épicerie": L.coffeeBeans,                     // roasted coffee beans
      // "Huiles" intentionally NOT overridden — the rayon page falls back
      // to the first DB product image (huile de palme), which is what the
      // category actually contains. The previous OFF.maniocCongele override
      // was a placeholder that confusingly showed cassava on the Huiles card.
    },
    sousCategories: {
      "Féculents & farines": {
        "Manioc": OFF.maniocCongele,                 // manioc nettoyé congelé
        "Riz": OFF.rizThai,                          // riz thai parfumé
      },
      "Épicerie": {
        "Graines": OFF.sesameGraines,                // graines de sésame
      },
    },
  },

  "saveurs-asie": {
    categories: {
      "Riz & nouilles": L.riceGrains,                // white rice macro
      "Sauces & condiments": L.sushiSoy,             // sushi + soy sauce bottle
      "Épicerie": OFF.huileSesameAsie,               // CAUVIN huile sésame grillé — bottle packshot, on-topic for pantry
      "Frais": L.dumplings,                          // steamed dumplings
    },
    sousCategories: {
      "Épicerie": {
        "Thés": OFF.theVert,                         // gunpowder thé vert
      },
      "Frais": {
        "Tofu": OFF.tofuNature,
        "Pickles": OFF.cornichonsPickles,
      },
    },
  },

  "saveur-mediterranee": {
    // No local or GF image cleanly matched the level-1 categories — every
    // card there is backed by real product photos (huile d'olive, olives,
    // feta, couscous, harissa) so the gradient fallback rarely shows.
    categories: {},
    sousCategories: {
      // Fromages > Frais has no in-DB product yet (no mozzarella/burrata/
      // ricotta in the catalogue), so the card was rendering the empty
      // gradient placeholder. Borrow an OFF "Fresh mozzarella" packshot
      // until the buyer adds the SKU.
      "Fromages": {
        "Frais": OFF.freshMozzarella,
      },
    },
  },

  "saveur-sud-amer": {
    categories: {
      "Céréales & graines": L.colombianPlate,        // plantain/avocado/arepa plate (arepa = corn)
    },
    sousCategories: {
      "Céréales & graines": {
        "Amarante": OFF.amaranteGraines,
      },
      // "Légumineuses > Pois/Lentilles" intentionally absent — no products
      // in the catalogue yet, so the rayon page filter hides them rather
      // than show aspirational-empty cards next to the populated Haricots.
    },
  },

  "balkans-turques": {
    categories: {
      "Pâtisseries": L.almondCookies,                // almond cookies on wood (fits baklava/halva vibe)
      "Fruits secs & noix": L.pruneaux,              // dried prunes
    },
    sousCategories: {
      "Boissons": {
        "Thés": OFF.theVert,                          // gunpowder thé vert (visual match)
      },
      "Fromages": {
        "Kashar": OFF.kasharPeynir,                   // Turkish peynir packshot
      },
      "Fruits secs & noix": {
        "Noisettes": OFF.noisettesDecortiquees,
        "Noix": OFF.noixMelange,
      },
      "Pâtisseries": {
        "Loukoums": OFF.loukoumsRose,
        "Halva": OFF.halvaSesame,
      },
    },
  },

  "produits-courants": {
    categories: {
      "Hygiène & entretien": L.cashier,              // supermarket checkout lane
    },
    sousCategories: {},
  },

  "surgeles": {
    categories: {
      "Légumes": L.frozenVegs,                       // frozen veg bags
      "Apéritifs": L.frozenAisles,                   // freezer aisle vitrine
      "Poissons": OFF.poissonsPanes,                 // OFF poisson pané packshot — closer to ourcatalogue's "Poisson pané halal"
      "Plats préparés halal": `${GF}NAVARIN%20AGNEAU.jpg`, // GF lamb navarin
    },
    sousCategories: {
      "Apéritifs": {
        "Bouchées": OFF.bouchees,
      },
    },
  },
};

/** Lookup helper: returns image URL for a categorie (level 1) or null. */
export function getCategorieImage(
  rayon: RayonSlug,
  categorieLabel: string,
): string | null {
  return CATEGORY_IMAGES[rayon]?.categories?.[categorieLabel] ?? null;
}

/** Lookup helper: returns image URL for a sous-categorie (level 2) or null. */
export function getSousCategorieImage(
  rayon: RayonSlug,
  categorieLabel: string,
  sousCatLabel: string,
): string | null {
  return (
    CATEGORY_IMAGES[rayon]?.sousCategories?.[categorieLabel]?.[sousCatLabel] ??
    null
  );
}
