import { defineCollection, z } from 'astro:content';

/* ------------------------------------------------------------
   PROMOS
   ------------------------------------------------------------ */
const promos = defineCollection({
  type: 'data',
  schema: z.object({
    id: z.string(),
    titre: z.string(),
    description: z.string().default(''),
    image: z.string(),
    prix_original: z.string(),
    prix_promo: z.string(),
    reduction_pct: z.number().int().min(0).max(99),
    rayon: z.enum([
      'boucherie-halal',
      'fruits-legumes',
      'epices-du-monde',
      'saveurs-afrique',
      'saveurs-asie',
      'saveur-mediterranee',
      'saveur-sud-amer',
      'balkans-turques',
      'produits-courants',
      'surgeles',
    ]),
    magasin: z.enum(['tous', 'portet', 'toulouse-sud']).default('tous'),
    date_debut: z.string(),
    date_fin: z.string(),
    mise_en_avant: z.boolean().default(false),
    actif: z.boolean().default(true),
  }),
});

/* ------------------------------------------------------------
   VIDEOS (TikTok)
   ------------------------------------------------------------ */
const videos = defineCollection({
  type: 'data',
  schema: z.object({
    id: z.string(),
    url_tiktok: z.string().url(),
    thumbnail: z.string().optional(),
    titre: z.string(),
    rayon: z.enum([
      'home',
      'boucherie-halal',
      'fruits-legumes',
      'epices-du-monde',
      'saveurs-afrique',
      'saveurs-asie',
      'saveur-mediterranee',
      'saveur-sud-amer',
      'balkans-turques',
      'produits-courants',
      'surgeles',
    ]),
    ordre: z.number().int().default(0),
    actif: z.boolean().default(true),
  }),
});

/* ------------------------------------------------------------
   POSTES (offres d'emploi)
   ------------------------------------------------------------ */
const postes = defineCollection({
  type: 'content',
  schema: z.object({
    titre: z.string(),
    magasin: z.enum(['portet', 'toulouse-sud', 'tous']).default('tous'),
    type_contrat: z.enum(['CDI', 'CDD', 'Apprentissage', 'Alternance', 'Stage']),
    temps: z.enum(['Temps plein', 'Temps partiel']).default('Temps plein'),
    resume: z.string(),
    missions: z.array(z.string()),
    profil: z.array(z.string()),
    date_publication: z.date(),
    actif: z.boolean().default(true),
  }),
});

/* ------------------------------------------------------------
   ARTICLES (blog)
   ------------------------------------------------------------ */
const articles = defineCollection({
  type: 'content',
  schema: z.object({
    titre: z.string(),
    categorie: z.enum(['promos', 'nouveautes', 'recettes', 'engagements', 'evenements']),
    resume: z.string(),
    image: z.string(),
    auteur: z.string().default("L'équipe Marché de Mo'"),
    date_publication: z.date(),
    actif: z.boolean().default(true),
  }),
});

/* ------------------------------------------------------------
   RECETTES (Content Collection MDX/MD)
   Le corps du .md contient : Ingrédients + Étapes + Astuces.
   Frontmatter = métadonnées pour cards, filtres, Schema.org Recipe.
   ------------------------------------------------------------ */
const recettes = defineCollection({
  type: 'content',
  schema: z.object({
    titre: z.string(),
    resume: z.string(),
    image: z.string(),
    imageAlt: z.string().optional(),
    /** Temps total en minutes (prep + cuisson). */
    tempsMin: z.number().int().positive(),
    /** Temps de préparation seul, si on veut le détail. */
    tempsPrepMin: z.number().int().positive().optional(),
    /** Temps de cuisson seul. */
    tempsCuissonMin: z.number().int().positive().optional(),
    portions: z.number().int().positive(),
    difficulte: z.enum(['Facile', 'Moyen', 'Avancé']),
    /** Rayons touchés par la recette (pour cross-linking). */
    rayons: z.array(z.enum([
      'boucherie-halal',
      'fruits-legumes',
      'epices-du-monde',
      'saveurs-afrique',
      'saveurs-asie',
      'saveur-mediterranee',
      'saveur-sud-amer',
      'balkans-turques',
      'produits-courants',
      'surgeles',
    ])),
    /** Rayon principal (pour la couleur/badge). */
    rayonPrincipal: z.enum([
      'boucherie-halal',
      'fruits-legumes',
      'epices-du-monde',
      'saveurs-afrique',
      'saveurs-asie',
      'saveur-mediterranee',
      'saveur-sud-amer',
      'balkans-turques',
      'produits-courants',
      'surgeles',
    ]),
    /** Origine géo/culturelle : "Sénégal", "Maghreb", "Corée"… */
    origine: z.string().optional(),
    /** Keywords SEO pour la page détail. */
    keywords: z.array(z.string()).default([]),
    date_publication: z.date(),
    actif: z.boolean().default(true),
    /** Mise en avant sur la home / index /recettes. */
    mise_en_avant: z.boolean().default(false),
  }),
});

export const collections = { promos, videos, postes, articles, recettes };
