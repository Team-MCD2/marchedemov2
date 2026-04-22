/* ------------------------------------------------------------
   Produits vedettes — placeholder home + /produits.

   PHASE 1 (MAINTENANT) : 8 produits temporaires construits à partir
   des images de rayons existantes (`/images/rayons/<slug>/...`),
   jamais de prix indiqué.

   PHASE 2 (QUAND SUPABASE EST REMPLI) : remplacer cet export par un
   `await supabase.from('produits').select('*').eq('actif', true)`
   dans le frontmatter du composant qui consomme.

   IMPORTANT : pas de prix affichés (cf doctrine, risque juridique
   de pratique commerciale trompeuse si écart magasin/site).
   ------------------------------------------------------------ */

import type { RayonSlug } from "@/lib/site";

export interface ProduitVedette {
  id: string;
  nom: string;
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
    image: "/images/rayons/boucherie-halal/11062b-603fa6aa568c43e08182a6e546211812f000.jpg",
    rayon: "boucherie-halal",
    badge: "Travail sur carcasse",
    origine: "France",
  },
  {
    id: "plantain-jaune",
    nom: "Banane plantain jaune",
    image: "/images/rayons/fruits-legumes/legumes-organiques.jpg",
    rayon: "fruits-legumes",
    badge: "Arrivage du jour",
    origine: "Côte d'Ivoire",
  },
  {
    id: "ras-el-hanout",
    nom: "Ras el hanout — mélange maison",
    image: "/images/rayons/epices-du-monde/marche-aux-epices-dubai.jpg",
    rayon: "epices-du-monde",
    badge: "Mélange artisanal",
    origine: "Maroc",
  },
  {
    id: "huile-palme-rouge",
    nom: "Huile de palme rouge",
    image: "/images/rayons/saveurs-afrique/image-de-annie-spratt.jpg",
    rayon: "saveurs-afrique",
    badge: "Import direct",
    origine: "Afrique de l'Ouest",
  },
  {
    id: "kimchi-coreen",
    nom: "Kimchi de chou — bocal",
    image: "/images/rayons/saveurs-asie/image-de-jason-leung.jpg",
    rayon: "saveurs-asie",
    badge: "Fermenté",
    origine: "Corée",
  },
  {
    id: "olives-maghreb",
    nom: "Olives noires du Maghreb",
    image: "/images/rayons/saveur-mediterranee.jpg",
    rayon: "saveur-mediterranee",
    badge: "Sélection maison",
    origine: "Maroc",
  },
  {
    id: "borek-fromage",
    nom: "Börek au fromage blanc",
    image: "/images/rayons/balkans-turques.jpg",
    rayon: "balkans-turques",
    badge: "Spécialité turque",
    origine: "Turquie",
  },
  {
    id: "samoussa-boeuf",
    nom: "Samoussas bœuf halal — surgelés",
    image: "/images/rayons/surgeles/vitrines-congelees.jpg",
    rayon: "surgeles",
    badge: "Halal",
  },
];
