/* ------------------------------------------------------------
   Recettes — section inspiration sur la home.

   PHASE 1 : 3 recettes placeholder, images depuis rayons existants.
   PHASE 2 : Content Collection /src/content/recettes/*.md (futur).

   Chaque recette est ancrée à un rayon culturel pour créer le pont
   "produits → cuisine" et donner un use-case concret au visiteur.
   ------------------------------------------------------------ */

import type { RayonSlug } from "@/lib/site";

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
