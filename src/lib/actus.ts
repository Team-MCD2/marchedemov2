/* ------------------------------------------------------------
   Actus — flux unifié "Les actus du marché".

   Inspiré du pattern Grand Frais "Les actus du meilleur marché" :
   un seul stream visuel qui agrège différents types de contenu
   sous un affichage uniforme (card = image + badge rayon + titre).

   Types de contenu agrégés :
     - article        → src/content/articles (blog éditorial)
     - recette        → src/lib/recettes.ts (inspiration culinaire)
     - arrivage       → produit saisonnier qui vient d'arriver en rayon
     - nouveaute      → nouveau produit ajouté au catalogue
     - evenement      → festival, campagne, animation magasin

   Les arrivages / événements / nouveautés sont actuellement seeded
   manuellement dans ACTUS_SEED ci-dessous. À terme : migration vers
   une Content Collection `/src/content/actus/*.md` pour que l'équipe
   édite via l'admin.

   ------------------------------------------------------------ */

import { getCollection } from "astro:content";
import { RAYONS, type RayonSlug } from "@/lib/site";
import { RECETTES_HOME } from "@/lib/recettes";

/** Type d'actu — utilisé pour le libellé fallback quand pas de rayon. */
export type ActuType =
  | "article"
  | "recette"
  | "arrivage"
  | "nouveaute"
  | "evenement";

export interface ActuItem {
  id: string;
  type: ActuType;
  titre: string;
  /** Resume optionnel, 1-2 phrases. */
  resume?: string;
  image: string;
  imageAlt?: string;
  /** Rayon associé — sert à colorer le badge + libeller. Optionnel. */
  rayon?: RayonSlug;
  /** Date de publication (pour tri desc). */
  date: Date;
  /** Lien vers la page détail (obligatoire, même si page n'existe pas encore). */
  href: string;
  /** Override du badge visible. Si absent : rayon.nomCourt ou type formaté. */
  badgeLabel?: string;
}

/* --------------------------------------------------------------
   SEED — arrivages, nouveautés, événements (statique pour l'instant)
   -------------------------------------------------------------- */
const ACTUS_SEED: ActuItem[] = [
  {
    id: "arrivage-mangues-kent",
    type: "arrivage",
    titre: "Arrivage mangues Kent du Mali",
    resume:
      "Les mangues Kent ultra-sucrées arrivent en rayon ce mardi. Quantité limitée, saison courte.",
    image: "/images/rayons/fruits-legumes/pamplemousse.jpg",
    imageAlt: "Cagette de mangues Kent fraîchement arrivées",
    rayon: "fruits-legumes",
    date: new Date("2026-04-20"),
    href: "/rayons/fruits-legumes/fruits/exotiques",
  },
  {
    id: "festival-ramadan-2026",
    type: "evenement",
    titre: "Préparation du Ramadan — arrivages spéciaux",
    resume:
      "Dattes Medjool de Tunisie, farines pour pâtisseries orientales, harissa artisanale. Tout pour un mois béni.",
    image: "/images/rayons/epices-du-monde/marche-aux-epices-dubai.jpg",
    imageAlt: "Étal d'épices et dattes pour le Ramadan",
    rayon: "saveur-mediterranee",
    date: new Date("2026-04-18"),
    href: "/rayons/saveur-mediterranee",
  },
  {
    id: "nouveaute-gochujang",
    type: "nouveaute",
    titre: "Nouveau : gochujang artisanal coréen",
    resume:
      "Pâte fermentée de piment coréen, marque Sempio — enfin disponible en rayon Asie.",
    image: "/images/rayons/saveurs-asie/image-de-jason-leung.jpg",
    imageAlt: "Pot de gochujang sur comptoir",
    rayon: "saveurs-asie",
    date: new Date("2026-04-15"),
    href: "/rayons/saveurs-asie/sauces-condiments",
  },
  {
    id: "arrivage-agneau-printemps",
    type: "arrivage",
    titre: "Agneau de printemps — carcasse entière",
    resume:
      "Arrivage hebdomadaire d'agneau halal, sans électronarcose. Découpe sur mesure au comptoir.",
    image: "/images/rayons/boucherie-halal/image-de-cindie-hansen.jpg",
    imageAlt: "Étal de boucherie halal avec agneau",
    rayon: "boucherie-halal",
    date: new Date("2026-04-12"),
    href: "/rayons/boucherie-halal/viandes/agneau",
  },
  {
    id: "nouveaute-plantain-precuit",
    type: "nouveaute",
    titre: "Plantain précuit Afropèze",
    resume:
      "Gain de temps garanti : plantain bouilli, emballé sous-vide. Prêt à poêler ou frire.",
    image: "/images/rayons/saveurs-afrique/slide-02-homepage-maceo-groupe-distributeur-produits-creole-.webp",
    imageAlt: "Sachet de plantain précuit",
    rayon: "saveurs-afrique",
    date: new Date("2026-04-10"),
    href: "/rayons/saveurs-afrique/feculents-farines",
  },
  {
    id: "evenement-festival-africain",
    type: "evenement",
    titre: "Semaine Saveurs d'Afrique — 22 au 28 avril",
    resume:
      "Dégustations, démos cuisine, prix découverte sur tout le rayon africain. Les deux magasins.",
    image: "/images/rayons/saveurs-afrique/image-de-annie-spratt.jpg",
    imageAlt: "Étal de produits africains pour la semaine festival",
    rayon: "saveurs-afrique",
    date: new Date("2026-04-08"),
    href: "/rayons/saveurs-afrique",
  },
];

/* --------------------------------------------------------------
   Helpers
   -------------------------------------------------------------- */

const TYPE_LABELS: Record<ActuType, string> = {
  article: "Actualité",
  recette: "Recette",
  arrivage: "Arrivage",
  nouveaute: "Nouveauté",
  evenement: "Événement",
};

/** Renvoie le label de badge affiché (rayon > override > type). */
export function actuBadgeLabel(actu: ActuItem): string {
  if (actu.badgeLabel) return actu.badgeLabel;
  if (actu.rayon && RAYONS[actu.rayon]) return RAYONS[actu.rayon].nomCourt;
  return TYPE_LABELS[actu.type];
}

/** Renvoie la couleur de badge (rayon.accent si défini, sinon fallback par type). */
export function actuBadgeColor(actu: ActuItem): string {
  if (actu.rayon && RAYONS[actu.rayon]?.accent) return RAYONS[actu.rayon].accent!;
  /* Fallback par type : arrivage = orange vif, nouveauté = vert, evenement = rouge */
  switch (actu.type) {
    case "arrivage":  return "#E07B1F";
    case "nouveaute": return "#1C6B35";
    case "evenement": return "#C53030";
    case "recette":   return "#8B4513";
    default:          return "#1C6B35";
  }
}

/* --------------------------------------------------------------
   Aggregator — merge toutes les sources en un stream unique trié.
   -------------------------------------------------------------- */

/**
 * Renvoie tous les actus du marché, triés du plus récent au plus ancien.
 * Fusion :
 *   - src/content/articles (Content Collection)
 *   - src/lib/recettes (RECETTES_HOME)
 *   - ACTUS_SEED (arrivages, événements, nouveautés statiques)
 *
 * @param limit Nombre max d'items à renvoyer (default = illimité).
 */
export async function getActus(limit?: number): Promise<ActuItem[]> {
  const items: ActuItem[] = [];

  /* 1 — Articles (Content Collection) */
  try {
    const articles = await getCollection("articles", (a) => a.data.actif);
    for (const a of articles) {
      /* On mappe la catégorie Content Collection vers notre type ActuType
         pour que le badge "NOUVEAUTÉS" / "ÉVÉNEMENTS" soit cohérent. */
      const typeMap: Record<string, ActuType> = {
        promos: "evenement",
        nouveautes: "nouveaute",
        recettes: "recette",
        engagements: "article",
        evenements: "evenement",
      };
      items.push({
        id: `article-${a.slug}`,
        type: typeMap[a.data.categorie] ?? "article",
        titre: a.data.titre,
        resume: a.data.resume,
        image: a.data.image,
        imageAlt: a.data.titre,
        date: new Date(a.data.date_publication),
        href: `/actualites/${a.slug}`,
      });
    }
  } catch (e) {
    /* Collection non trouvée ou vide — on continue. */
  }

  /* 2 — Recettes (lib static) */
  for (const r of RECETTES_HOME) {
    items.push({
      id: `recette-${r.id}`,
      type: "recette",
      titre: r.titre,
      resume: r.resume,
      image: r.image,
      imageAlt: r.titre,
      rayon: r.rayon,
      /* Pas de date dans RECETTES_HOME → on utilise une date antérieure
         pour qu'elles n'apparaissent pas en tête. */
      date: new Date("2026-03-01"),
      href: r.lien ?? `/rayons/${r.rayon}`,
    });
  }

  /* 3 — Seeds arrivages / événements / nouveautés */
  items.push(...ACTUS_SEED);

  /* Tri par date desc */
  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  return typeof limit === "number" ? items.slice(0, limit) : items;
}
