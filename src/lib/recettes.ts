/* ------------------------------------------------------------
   Recettes — inspiration cuisine ancrée aux rayons.

   Source principale : src/content/recettes/*.md (Content Collection)
   Fallback statique  : RECETTES_HOME ci-dessous (pour home + admin
                         quand la collection est vide).

   Chaque recette est ancrée à un rayon principal + rayons secondaires
   pour créer le pont "produits → cuisine" (cross-linking).
   ------------------------------------------------------------ */

import type { RayonSlug } from "@/lib/site";
import { getCollection, type CollectionEntry } from "astro:content";

export interface Recette {
  id: string;
  titre: string;
  resume: string;
  image: string;
  /** Temps total préparation + cuisson, en minutes. */
  tempsMin: number;
  portions: number;
  difficulte: "Facile" | "Moyen" | "Avancé";
  rayon: RayonSlug;
  /** Si la recette pointe vers un article complet. Sinon → CTA inactif. */
  lien?: string;
}

/* --------------------------------------------------------------
   Helpers Content Collection
   -------------------------------------------------------------- */

/**
 * Convertit une entrée Content Collection en type `Recette` (pour
 * les cards home + RecetteCard component qui consomme ce type).
 */
export function collectionToRecette(entry: CollectionEntry<"recettes">): Recette {
  return {
    id: entry.slug,
    titre: entry.data.titre,
    resume: entry.data.resume,
    image: entry.data.image,
    tempsMin: entry.data.tempsMin,
    portions: entry.data.portions,
    difficulte: entry.data.difficulte,
    rayon: entry.data.rayonPrincipal,
    lien: `/recettes/${entry.slug}`,
  };
}

/**
 * Récupère toutes les recettes actives depuis la Collection, triées
 * par date_publication desc. Fallback sur RECETTES_HOME si erreur.
 */
export async function getAllRecettes(): Promise<Recette[]> {
  try {
    const entries = await getCollection("recettes", (r) => r.data.actif);
    if (entries.length === 0) return RECETTES_HOME;
    return entries
      .sort(
        (a, b) =>
          new Date(b.data.date_publication).getTime() -
          new Date(a.data.date_publication).getTime()
      )
      .map(collectionToRecette);
  } catch {
    return RECETTES_HOME;
  }
}

/**
 * Récupère les recettes mises en avant (badge mise_en_avant=true).
 * Utile pour la home : on affiche 3-6 recettes vedettes.
 */
export async function getRecettesVedettes(limit = 6): Promise<Recette[]> {
  try {
    const entries = await getCollection(
      "recettes",
      (r) => r.data.actif && r.data.mise_en_avant
    );
    if (entries.length === 0) return RECETTES_HOME.slice(0, limit);
    return entries
      .sort(
        (a, b) =>
          new Date(b.data.date_publication).getTime() -
          new Date(a.data.date_publication).getTime()
      )
      .slice(0, limit)
      .map(collectionToRecette);
  } catch {
    return RECETTES_HOME.slice(0, limit);
  }
}

/**
 * Renvoie les recettes qui utilisent un rayon donné (cross-linking
 * depuis la page rayon). Cherche dans le champ `rayons` (array).
 */
export async function getRecettesForRayon(rayon: RayonSlug, limit = 3): Promise<Recette[]> {
  try {
    const entries = await getCollection(
      "recettes",
      (r) => r.data.actif && r.data.rayons.includes(rayon)
    );
    return entries
      .sort(
        (a, b) =>
          new Date(b.data.date_publication).getTime() -
          new Date(a.data.date_publication).getTime()
      )
      .slice(0, limit)
      .map(collectionToRecette);
  } catch {
    return RECETTES_HOME.filter((r) => r.rayon === rayon).slice(0, limit);
  }
}

export const RECETTES_HOME: Recette[] = [
  {
    id: "mafe-senegalais",
    titre: "Mafé sénégalais à la pâte d'arachide",
    resume:
      "Le grand classique de l'Afrique de l'Ouest : mijoté de viande à la sauce arachide, servi sur du riz parfumé.",
    image: "/images/recettes/mafe-senegalais.jpg",
    tempsMin: 90,
    portions: 6,
    difficulte: "Facile",
    rayon: "saveurs-afrique",
  },
  {
    id: "bibimbap-coreen",
    titre: "Bibimbap coréen au kimchi",
    resume:
      "Bol de riz garni de légumes, viande marinée, kimchi maison et œuf au plat. Sauce gochujang piquante en finition.",
    image: "/images/recettes/bibimbap-coreen.jpg",
    tempsMin: 45,
    portions: 4,
    difficulte: "Moyen",
    rayon: "saveurs-asie",
  },
  {
    id: "tajine-agneau-pruneaux",
    titre: "Tajine d'agneau aux pruneaux",
    resume:
      "Un tajine sucré-salé emblématique du Maghreb : agneau confit, pruneaux moelleux, amandes grillées et ras el hanout.",
    image: "/images/recettes/tajine-agneau.jpg",
    tempsMin: 120,
    portions: 6,
    difficulte: "Moyen",
    rayon: "saveur-mediterranee",
  },
];
