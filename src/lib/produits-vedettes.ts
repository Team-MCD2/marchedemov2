/* ------------------------------------------------------------
   Produits vedettes — emergency fallback list.

   CURRENT ROLE : last-ditch fallback for the home showcase when
   Supabase is completely unreachable at build time. The canonical
   source is now the public.produits table, queried via
   src/lib/produits-repo.ts → getProduitsVedettes().

   All `.image` values are intentionally empty ("") — we don't
   want to ship misleading rayon/ambiance photos as product shots.
   ProduitCard renders a clean branded 'Photo à venir' placeholder
   when image is falsy. Admins upload the real product photos via
   /admin/medias + /admin/produits.

   LEGAL : no prices (doctrine — risk of misleading commercial
   practice if site price differs from store).
   ------------------------------------------------------------ */

import type { RayonSlug } from "@/lib/site";

export interface ProduitVedette {
  id: string;
  nom: string;
  /** Empty string = show the branded placeholder card. */
  image: string;
  rayon: RayonSlug;
  /** Petit badge optionnel : "Nouveau", "Halal", "Bio", "Import direct"... */
  badge?: string;
  /** Pays/région d'origine, optionnel. */
  origine?: string;
}

export const PRODUITS_VEDETTES: ProduitVedette[] = [
  {
    id: "agneau-halal",
    nom: "Épaule d'agneau halal",
    image: "",
    rayon: "boucherie-halal",
    badge: "Travail sur carcasse",
    origine: "France",
  },
  {
    id: "plantain-jaune",
    nom: "Banane plantain jaune",
    image: "",
    rayon: "fruits-legumes",
    badge: "Arrivage du jour",
    origine: "Côte d'Ivoire",
  },
  {
    id: "ras-el-hanout",
    nom: "Ras el hanout — mélange maison",
    image: "",
    rayon: "epices-du-monde",
    badge: "Mélange artisanal",
    origine: "Maroc",
  },
  {
    id: "huile-palme-rouge",
    nom: "Huile de palme rouge",
    image: "",
    rayon: "saveurs-afrique",
    badge: "Import direct",
    origine: "Afrique de l'Ouest",
  },
  {
    id: "kimchi-coreen",
    nom: "Kimchi de chou — bocal",
    image: "",
    rayon: "saveurs-asie",
    badge: "Fermenté",
    origine: "Corée",
  },
  {
    id: "olives-maghreb",
    nom: "Olives noires du Maghreb",
    image: "",
    rayon: "saveur-mediterranee",
    badge: "Sélection maison",
    origine: "Maroc",
  },
  {
    id: "borek-fromage",
    nom: "Börek au fromage blanc",
    image: "",
    rayon: "balkans-turques",
    badge: "Spécialité turque",
    origine: "Turquie",
  },
  {
    id: "samoussa-boeuf",
    nom: "Samoussas bœuf halal — surgelés",
    image: "",
    rayon: "surgeles",
    badge: "Halal",
  },
];
