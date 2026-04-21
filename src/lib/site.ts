/* ------------------------------------------------------------
   Central site config — Marché de Mo' V2
   Single source of truth for contacts, magasins, rayons, socials.
   ------------------------------------------------------------ */

export const SITE = {
  name: "Marché de Mo'",
  legalName: "Marché de Mo'",
  tagline: "Commerçant engagé. Saveurs du Monde.",
  shortPitch:
    "Le plus grand supermarché ethnique d'Occitanie · 10 000+ références · Ouvert 7j/7",
  url: "https://marchedemo.vercel.app",
  locale: "fr_FR",
  phone: "05 82 95 82 52",
  phoneE164: "+33582958252",
  email: "contact@marchedemo.com",
  siren: "924 841 471",
  siret: "924 841 471 00012",
  rcs: "RCS Toulouse",
  siege: "6 Place Wilson, 31000 Toulouse, France",
  dirigeant: "Samir Ouaddaha",
  foundedYear: 2024,
  agence: {
    nom: "Microdidact",
    url: "https://microdidact.com/",
  },
} as const;

export const SOCIAL = {
  facebook: "https://www.facebook.com/marchedemo/",
  instagram: "https://www.instagram.com/marchedemo_supermarches/",
  linkedin: "https://linkedin.com/company/marché-de-mo/about/",
  tiktok: "https://www.tiktok.com/@marchedemo",
} as const;

/* ------------------------------------------------------------
   Magasins
   ------------------------------------------------------------ */
export type MagasinSlug = "portet" | "toulouse-sud";

export interface Magasin {
  slug: MagasinSlug;
  nom: string;
  nomCourt: string;
  adresseLigne1: string;
  ville: string;
  codePostal: string;
  departement: string;
  surface: string;
  parking: string;
  horaires: {
    lundiJeudi: string;
    vendredi: string;
    samedi: string;
    dimanche: string;
  };
  /** Schema.org openingHours array */
  openingHoursSchema: string[];
  telephone: string;
  telE164: string;
  mapsEmbed: string;
  mapsLink: string;
  /** Precise coordinates (WGS84) — used for cookieless OSM embed and schema.org geo. */
  coords: { lat: number; lon: number };
  photo: string;
  description: string;
  accroche: string;
  dateOuverture: string;
  atouts: string[];
  badge?: string;
}

export const MAGASINS: Record<MagasinSlug, Magasin> = {
  portet: {
    slug: "portet",
    nom: "Marché de Mo' — Portet-sur-Garonne",
    nomCourt: "Portet-sur-Garonne",
    adresseLigne1: "8 Allée Pablo Picasso",
    ville: "Portet-sur-Garonne",
    codePostal: "31120",
    departement: "Haute-Garonne",
    surface: "1 200 m²",
    parking: "600 places",
    horaires: {
      lundiJeudi: "8h30 – 20h30",
      vendredi: "8h30 – 13h & 14h – 21h",
      samedi: "8h30 – 21h",
      dimanche: "8h30 – 13h",
    },
    openingHoursSchema: [
      "Mo-Th 08:30-20:30",
      "Fr 08:30-13:00",
      "Fr 14:00-21:00",
      "Sa 08:30-21:00",
      "Su 08:30-13:00",
    ],
    telephone: "05 82 95 82 52",
    telE164: "+33582958252",
    coords: { lat: 43.5377, lon: 1.4094 },
    mapsEmbed:
      "https://www.openstreetmap.org/export/embed.html?bbox=1.4044%2C43.5347%2C1.4144%2C43.5407&layer=mapnik&marker=43.5377%2C1.4094",
    mapsLink:
      "https://maps.google.com/?q=8+All%C3%A9e+Pablo+Picasso+31120+Portet-sur-Garonne",
    photo: "/images/magasins/portet.jpg",
    badge: "Magasin historique",
    accroche: "Le magasin fondateur — 1 200 m² de saveurs du monde à Portet-sur-Garonne.",
    dateOuverture: "Août 2024",
    description:
      "Notre magasin fondateur, ouvert en août 2024 dans la zone commerciale de Portet-sur-Garonne. 1 200 m² dédiés aux saveurs du monde — boucherie halal, fruits et légumes exotiques, épicerie ethnique complète.",
    atouts: [
      "Boucherie halal sur carcasse — agneau, bœuf, volaille",
      "120+ références fruits & légumes exotiques",
      "600 places de parking gratuites",
      "Accès direct depuis la sortie Portet de la rocade",
      "Ouvert 7j/7 y compris le dimanche matin",
    ],
  },
  "toulouse-sud": {
    slug: "toulouse-sud",
    nom: "Marché de Mo' — Toulouse Sud Cépière",
    nomCourt: "Toulouse Sud — Cépière",
    adresseLigne1: "5 rue Joachim du Bellay",
    ville: "Toulouse",
    codePostal: "31100",
    departement: "Haute-Garonne",
    surface: "1 200 m²",
    parking: "600 places",
    horaires: {
      lundiJeudi: "8h30 – 20h30",
      vendredi: "8h30 – 13h & 14h – 21h",
      samedi: "8h30 – 21h",
      dimanche: "8h30 – 13h",
    },
    openingHoursSchema: [
      "Mo-Th 08:30-20:30",
      "Fr 08:30-13:00",
      "Fr 14:00-21:00",
      "Sa 08:30-21:00",
      "Su 08:30-13:00",
    ],
    telephone: "05 82 95 82 52",
    telE164: "+33582958252",
    coords: { lat: 43.5842, lon: 1.4042 },
    mapsEmbed:
      "https://www.openstreetmap.org/export/embed.html?bbox=1.3992%2C43.5812%2C1.4092%2C43.5872&layer=mapnik&marker=43.5842%2C1.4042",
    mapsLink:
      "https://maps.google.com/?q=5+rue+Joachim+du+Bellay+31100+Toulouse",
    photo: "/images/magasins/toulouse-sud.jpg",
    badge: "Dernier-né du groupe",
    accroche: "Le second magasin du Groupe, au cœur de Toulouse Sud Cépière.",
    dateOuverture: "Avril 2026",
    description:
      "Le dernier-né du Groupe Marché de Mo', déjà référence incontournable. Situé à l'entrée de la sortie périphérique Cépière, 1 200 m² d'espace de vente pour répondre à tous vos besoins.",
    atouts: [
      "Centre commercial L'Hippodrome — accès rocade",
      "Parking couvert gratuit — 600 places",
      "Rayon Saveurs d'Asie étendu — import direct Séoul/Tokyo",
      "Espace traiteur halal sur place",
      "Ouvert 7j/7, même le dimanche matin",
    ],
  },
};

/* ------------------------------------------------------------
   Rayons — 10 au total, dont 5 avec DA culturelle
   ------------------------------------------------------------ */
export type RayonSlug =
  | "boucherie-halal"
  | "fruits-legumes"
  | "epices-du-monde"
  | "saveurs-afrique"
  | "saveurs-asie"
  | "saveur-mediterranee"
  | "saveur-sud-amer"
  | "balkans-turques"
  | "produits-courants"
  | "surgeles";

export interface Rayon {
  slug: RayonSlug;
  nom: string;
  nomCourt: string;
  eyebrow: string;
  tagline: string;
  description: string;
  longDescription: string;
  image: string;
  imageAlt: string;
  heroImage?: string;
  culturel: boolean;
  ordre: number;
  icone: string;
  featured: string[];
  accent?: string;
  keywords: string[];
}

export const RAYONS: Record<RayonSlug, Rayon> = {
  "boucherie-halal": {
    slug: "boucherie-halal",
    nom: "Boucherie Halal",
    nomCourt: "Boucherie",
    eyebrow: "Rayon signature",
    tagline: "La viande, travaillée directement sur carcasse.",
    description:
      "Viandes, volailles et charcuteries 100% halal certifiées, sans électronarcose. Arrivage quotidien, traçabilité rigoureuse.",
    longDescription:
      "Marché de Mo' s'invite à votre table avec une sélection de viandes fraîches de qualité. La traçabilité rigoureuse vous assure des viandes, volailles et charcuteries de toute première fraîcheur, au meilleur prix du marché. Nous travaillons directement les carcasses afin de garantir une fraîcheur maximale. L'ensemble de nos viandes sont halal, certifiées et abattues sans électronarcose.",
    image: "/images/rayons/boucherie-halal.jpg",
    imageAlt:
      "Boucherie halal Marché de Mo' Toulouse — viande fraîche travaillée sur carcasse",
    culturel: false,
    ordre: 1,
    icone: "meat",
    featured: ["Agneau halal", "Bœuf sur carcasse", "Charcuterie halal", "Volaille fermière"],
    accent: "#8B1919",
    keywords: [
      "boucherie halal Toulouse",
      "viande halal Toulouse",
      "halal sans électronarcose",
      "boucher halal Portet",
    ],
  },
  "fruits-legumes": {
    slug: "fruits-legumes",
    nom: "Fruits & Légumes",
    nomCourt: "Primeurs",
    eyebrow: "Fraîcheur absolue",
    tagline: "120+ références exotiques, arrivage quotidien.",
    description:
      "Primeurs sélectionnés chaque matin. Bananes plantains, ignames, manioc, mangues, épices fraîches — le rayon le plus complet de l'agglomération toulousaine.",
    longDescription:
      "La fraîcheur absolue. Un arrivage quotidien de primeurs sélectionnés. Bananes plantains, ignames, manioc, mangues, épices fraîches — plus de 120 références exotiques fournies via les MIN (Rungis) et marchés directs internationaux.",
    image: "/images/rayons/fruits-legumes.jpg",
    imageAlt: "Rayon fruits et légumes Marché de Mo' Toulouse — primeurs exotiques",
    culturel: false,
    ordre: 2,
    icone: "leaf",
    featured: ["Plantain", "Manioc", "Igname", "Mangues"],
    accent: "#2E8B4A",
    keywords: [
      "fruits exotiques Toulouse",
      "légumes africains Toulouse",
      "plantain Toulouse",
      "primeur du monde Toulouse",
    ],
  },
  "epices-du-monde": {
    slug: "epices-du-monde",
    nom: "Épices du Monde",
    nomCourt: "Épices",
    eyebrow: "Voyage sensoriel",
    tagline: "Mélanges artisanaux & thés rares.",
    description:
      "Une offre d'épices et de thés sans équivalent dans la région toulousaine. Mélanges signatures, épices rares, thés sélectionnés.",
    longDescription:
      "Un voyage sensoriel intense. Mélanges artisanaux, épices rares, sélections de thés inédits. Une offre d'épices et de thés sans équivalent dans la région toulousaine.",
    image: "/images/rayons/epices-du-monde.jpg",
    imageAlt: "Épices du monde Marché de Mo' Toulouse — curcuma, paprika, cumin",
    culturel: false,
    ordre: 3,
    icone: "spice",
    featured: ["Ras el hanout", "Curcuma", "Piment berbère", "Thés du monde"],
    accent: "#C0812B",
    keywords: [
      "épices du monde Toulouse",
      "épices rares Toulouse",
      "ras el hanout Toulouse",
      "thé oriental Toulouse",
    ],
  },
  "saveurs-afrique": {
    slug: "saveurs-afrique",
    nom: "Saveurs d'Afrique & Créole",
    nomCourt: "Afrique & Créole",
    eyebrow: "Rayon culturel",
    tagline: "La cuisine africaine, enfin complète à Toulouse.",
    description:
      "Produits de la gastronomie africaine et créole : plats cuisinés, conserves, condiments, boissons et spécialités introuvables ailleurs.",
    longDescription:
      "Retrouvez les produits de la gastronomie africaine et créole : plats cuisinés, conserves, condiments, boissons et spécialités que vous ne trouverez nulle part ailleurs à Toulouse.",
    image: "/images/rayons/saveurs-afrique.jpg",
    imageAlt:
      "Rayon saveurs africaines et créoles Marché de Mo' Toulouse — produits du continent africain",
    culturel: true,
    ordre: 4,
    icone: "africa",
    featured: ["Gombo", "Fufu", "Sauce graine", "Bissap"],
    accent: "#C8751A",
    keywords: [
      "épicerie africaine Toulouse",
      "produits africains Toulouse",
      "créole Toulouse",
      "gombo Toulouse",
    ],
  },
  "saveurs-asie": {
    slug: "saveurs-asie",
    nom: "Saveurs d'Asie",
    nomCourt: "Asie",
    eyebrow: "Rayon culturel",
    tagline: "Japon · Corée · Thaïlande · Chine · Vietnam.",
    description:
      "Épicerie asiatique complète : sauces, pâtes, riz, nouilles, produits frais asiatiques. Authenticité et packaging d'origine.",
    longDescription:
      "Épicerie asiatique complète : Japon, Corée, Thaïlande, Chine, Vietnam. Sauces, pâtes, riz, nouilles, produits frais asiatiques.",
    image: "/images/rayons/saveurs-asie.jpg",
    imageAlt: "Rayon saveurs d'Asie Marché de Mo' Toulouse — produits japonais, coréens, thaïlandais",
    culturel: true,
    ordre: 5,
    icone: "asia",
    featured: ["Kimchi", "Sauce soja", "Nouilles udon", "Riz jasmin"],
    accent: "#C0392B",
    keywords: [
      "épicerie asiatique Toulouse",
      "produits japonais Toulouse",
      "épicerie coréenne Toulouse",
      "kimchi Toulouse",
    ],
  },
  "saveur-mediterranee": {
    slug: "saveur-mediterranee",
    nom: "Saveur Méditerranéenne",
    nomCourt: "Méditerranée",
    eyebrow: "Rayon culturel",
    tagline: "De Provence au Levant, la lumière du sud.",
    description:
      "Olives de Provence et du Maghreb, produits orientaux, turcs, levantins. L'épicerie méditerranéenne dans toute sa richesse.",
    longDescription:
      "Olives de Provence et du Maghreb, aromatisées au safran ou aux épices. Produits orientaux, turcs, levantins et du pourtour méditerranéen.",
    image: "/images/rayons/saveur-mediterranee.jpg",
    imageAlt: "Rayon saveur méditerranéenne Marché de Mo' Toulouse — olives, huile d'olive, épices",
    culturel: true,
    ordre: 6,
    icone: "olive",
    featured: ["Olives du Maghreb", "Huile d'olive", "Harissa", "Couscous"],
    accent: "#2A6599",
    keywords: [
      "épicerie méditerranéenne Toulouse",
      "produits orientaux Toulouse",
      "olives Toulouse",
      "harissa Toulouse",
    ],
  },
  "saveur-sud-amer": {
    slug: "saveur-sud-amer",
    nom: "Saveur Sud-Américaine",
    nomCourt: "Sud-Amérique",
    eyebrow: "Rayon culturel",
    tagline: "Brésil · Colombie · Mexique · Argentine.",
    description:
      "Épicerie, conserves, boissons et spécialités d'Amérique Latine. Fruits exotiques et piments colorés de la région.",
    longDescription:
      "Brésil, Colombie, Mexique, Argentine. Épicerie, conserves, boissons et spécialités d'Amérique Latine.",
    // DÉVIATION : le Wix officiel marchedemo.com n'a aucune image authentique
    // pour le rayon Sud-Américain (les 2 photos scrapées étaient « produits
    // de nettoyage » et « ménage », hors-sujet). Exception validée par le
    // client pour utiliser une photo Unsplash libre de droits.
    // Crédit : Alexandra Tran (@alexgoesglobal), slug Unsplash KjOy1JVwamI.
    // Voir CREDITS.md. À remplacer dès qu'une vraie photo du rayon en magasin
    // est fournie.
    image: "/images/rayons/saveur-sud-amer.jpg",
    imageAlt:
      "Plateau d'ingrédients latino-américains : plantain, avocat, arepa, orange, salsa et coriandre",
    culturel: true,
    ordre: 7,
    icone: "tropical",
    featured: ["Arepa", "Dulce de leche", "Piment habanero", "Maté"],
    accent: "#E63946",
    keywords: [
      "épicerie sud-américaine Toulouse",
      "produits mexicains Toulouse",
      "produits brésiliens Toulouse",
      "latam Toulouse",
    ],
  },
  "balkans-turques": {
    slug: "balkans-turques",
    nom: "Balkans & Turques",
    nomCourt: "Balkans & Turquie",
    eyebrow: "Rayon culturel",
    tagline: "Constantinople & les Balkans modernisés.",
    description:
      "Épiceries, fromages, charcuteries halal, conserves et boissons des Balkans et de Turquie.",
    longDescription:
      "Épiceries, fromages, charcuteries halal, conserves et boissons des Balkans et de Turquie.",
    image: "/images/rayons/balkans-turques.jpg",
    imageAlt:
      "Rayon Balkans et Turquie Marché de Mo' Toulouse — Adana kebab, börek, fromages blancs",
    culturel: true,
    ordre: 8,
    icone: "ottoman",
    featured: ["Börek", "Ayran", "Fromage blanc", "Baklava"],
    accent: "#8B2500",
    keywords: [
      "épicerie turque Toulouse",
      "produits balkans Toulouse",
      "börek Toulouse",
      "ayran Toulouse",
    ],
  },
  "produits-courants": {
    slug: "produits-courants",
    nom: "Produits Courants Discounts",
    nomCourt: "Discounts",
    eyebrow: "Prix cassés",
    tagline: "Le quotidien au meilleur prix.",
    description:
      "Prix cassés sur les produits du quotidien. Notre espace déstockage propose des réductions significatives pour tous les budgets.",
    longDescription:
      "Prix cassés sur les produits du quotidien. Notre espace déstockage propose des réductions significatives pour tous les budgets.",
    image: "/images/rayons/produits-courants.jpg",
    imageAlt: "Rayon produits courants discount Marché de Mo' Toulouse",
    culturel: false,
    ordre: 9,
    icone: "cart",
    featured: ["Épicerie sucrée", "Épicerie salée", "Entretien", "Hygiène"],
    keywords: [
      "discount Toulouse",
      "produits courants pas chers Toulouse",
      "supermarché discount Portet",
    ],
  },
  surgeles: {
    slug: "surgeles",
    nom: "Surgelé",
    nomCourt: "Surgelés",
    eyebrow: "Praticité",
    tagline: "Les saveurs du monde, prêtes en 10 minutes.",
    description:
      "Large sélection de surgelés du monde entier : plats cuisinés ethniques, viandes halal surgelées, légumes et snacking.",
    longDescription:
      "Large sélection de surgelés du monde entier : plats cuisinés ethniques, viandes halal surgelées, légumes et snacking.",
    image: "/images/rayons/surgeles.jpg",
    imageAlt: "Rayon surgelés Marché de Mo' Toulouse — plats ethniques surgelés",
    culturel: false,
    ordre: 10,
    icone: "snow",
    featured: ["Samoussas", "Bricks", "Nems", "Viande halal surgelée"],
    accent: "#2A7AB3",
    keywords: [
      "surgelés ethniques Toulouse",
      "plats surgelés halal Toulouse",
      "samoussa surgelé Toulouse",
    ],
  },
};

export const RAYONS_LIST = Object.values(RAYONS).sort((a, b) => a.ordre - b.ordre);

/* ------------------------------------------------------------
   Engagements (4)
   ------------------------------------------------------------ */
export const ENGAGEMENTS = [
  {
    titre: "Urgence alimentaire",
    resume: "Dons réguliers aux banques alimentaires locales.",
    description:
      "Nous menons des dons réguliers auprès des associations toulousaines engagées dans la lutte contre la précarité alimentaire, en coordination étroite avec les banques alimentaires de Haute-Garonne.",
    icone: "heart",
  },
  {
    titre: "Diversité & Inclusion",
    resume: "Un environnement équitable et inclusif.",
    description:
      "Notre équipe compte plus de 24 salariés âgés de 19 à 56 ans, issus de parcours très variés. 90% d'entre eux n'avaient pas d'emploi avant leur embauche chez nous — un engagement concret pour la réinsertion.",
    icone: "people",
  },
  {
    titre: "Sport",
    resume: "Soutien aux associations sportives locales.",
    description:
      "Nous accompagnons plusieurs clubs et associations sportives de l'agglomération toulousaine, parce que le sport est un formidable vecteur de lien social et d'inclusion.",
    icone: "trophy",
  },
  {
    titre: "Personnes dépendantes",
    resume: "Soutien aux personnes âgées de Toulouse.",
    description:
      "Partenariats avec les structures d'accompagnement des personnes âgées de l'agglomération : dons alimentaires, accueil adapté, accompagnement en magasin.",
    icone: "care",
  },
] as const;

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
export const rayonUrl = (slug: RayonSlug) => `/rayons/${slug}`;
export const magasinUrl = (slug: MagasinSlug) => `/magasins/${slug}`;
