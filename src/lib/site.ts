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
  /**
   * Liste ordonnée de 2 à 4 images qui alternent en crossfade sur la RayonCard
   * (home + /rayons). La 1ʳᵉ = image principale (même fichier que `image`).
   * Si absent ou <2 items, la card affiche simplement `image` (statique).
   */
  heroSlideshow?: string[];
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
    tagline: "Taillée sur carcasse. Prix de supermarché.",
    description:
      "Viandes, volailles et charcuteries 100% halal certifiées, sans électronarcose. Arrivage quotidien, traçabilité rigoureuse.",
    longDescription:
      "Toutes nos viandes sont halal certifiées, abattues sans électronarcose. On travaille les carcasses en interne : vous n'achetez que ce qui a été découpé du jour. Agneau, bœuf, volaille, charcuterie — traçabilité complète et prix affichés, week-end compris.",
    image: "/images/rayons/boucherie-halal.jpg",
    imageAlt:
      "Boucherie halal Marché de Mo' Toulouse — viande fraîche travaillée sur carcasse",
    heroSlideshow: [
      "/images/rayons/boucherie-halal.jpg",
      "/images/rayons/boucherie-halal/11062b-603fa6aa568c43e08182a6e546211812f000.jpg",
      "/images/rayons/boucherie-halal/image-de-cindie-hansen.jpg",
    ],
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
    tagline: "120 exotiques. Arrivés ce matin.",
    description:
      "Primeurs sélectionnés chaque matin. Bananes plantains, ignames, manioc, mangues, épices fraîches — le rayon le plus complet de l'agglomération toulousaine.",
    longDescription:
      "Livraison tous les matins depuis Rungis et les marchés directs internationaux. Bananes plantains, ignames, manioc, mangues, feuilles de manioc, piments frais — 120 références exotiques qu'on ne trouve pas en grande surface classique, au prix du marché.",
    image: "/images/rayons/fruits-legumes.jpg",
    imageAlt: "Rayon fruits et légumes Marché de Mo' Toulouse — primeurs exotiques",
    heroSlideshow: [
      "/images/rayons/fruits-legumes.jpg",
      "/images/rayons/fruits-legumes/legumes-organiques.jpg",
      "/images/rayons/fruits-legumes/pamplemousse.jpg",
      "/images/rayons/fruits-legumes/raisin.jpg",
    ],
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
    tagline: "L'atelier sensoriel du monde.",
    description:
      "Une offre d'épices et de thés sans équivalent dans la région toulousaine. Mélanges signatures, épices rares, thés sélectionnés.",
    longDescription:
      "Ras el hanout, za'atar, curry de Madras, piment berbère, safran iranien, cardamome verte — mélanges montés chez nous, épices rares importées en direct. Thés du Maghreb, de Turquie et d'Asie. L'offre la plus complète de l'agglomération, sans la marge d'une épicerie fine.",
    image: "/images/rayons/epices-du-monde.jpg",
    imageAlt: "Rayon épices du monde Marché de Mo' Toulouse — curry, za'atar, ras el hanout",
    heroSlideshow: [
      "/images/rayons/epices-du-monde.jpg",
      "/images/rayons/epices-du-monde/marche-aux-epices-dubai.jpg",
      "/images/rayons/epices-du-monde/11062b-430368cba3be40c8b0065e900753a781f000.jpg",
      "/images/rayons/epices-du-monde/716c51-f9304.jpg",
    ],
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
    tagline: "Dakar. Lagos. Abidjan. Ici.",
    description:
      "Produits de la gastronomie africaine et créole : plats cuisinés, conserves, condiments, boissons et spécialités introuvables ailleurs.",
    longDescription:
      "Afrique de l'Ouest, Afrique centrale, Maghreb, Antilles. Gombo, fufu, sauce graine, attiéké, bissap, ginger beer, plantain précuit, huile de palme rouge, poisson fumé — les produits qu'il fallait aller chercher à Paris sont maintenant à Toulouse, au prix juste.",
    image: "/images/rayons/saveurs-afrique.jpg",
    heroSlideshow: [
      "/images/rayons/saveurs-afrique.jpg",
      "/images/rayons/saveurs-afrique/image-de-annie-spratt.jpg",
      "/images/rayons/saveurs-afrique/11062b-9138c0db6e6443b7a1e1d02e0163279ff000.jpg",
      "/images/rayons/saveurs-afrique/slide-02-homepage-maceo-groupe-distributeur-produits-creole-.webp",
    ],
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
    tagline: "Tokyo, Séoul, Bangkok. Un rayon.",
    description:
      "Épicerie asiatique complète : sauces, pâtes, riz, nouilles, produits frais asiatiques. Authenticité et packaging d'origine.",
    longDescription:
      "Sauce soja Kikkoman, nuoc-mam, sambal oelek, gochujang, sauce d'huître, pâte de miso, riz jasmin, nouilles udon fraîches, kimchi, galettes de riz, feuilles de nori. Import direct, emballages d'origine — donc des prix plus bas que les épiceries spécialisées du centre-ville.",
    image: "/images/rayons/saveurs-asie.jpg",
    heroSlideshow: [
      "/images/rayons/saveurs-asie.jpg",
      "/images/rayons/saveurs-asie/image-de-jason-leung.jpg",
      "/images/rayons/saveurs-asie/image-de-arnie-chou.jpg",
      "/images/rayons/saveurs-asie/curry-de-poulet-indien.jpg",
    ],
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
    tagline: "Provence. Levant. Rien entre.",
    description:
      "Olives de Provence et du Maghreb, produits orientaux, turcs, levantins. L'épicerie méditerranéenne dans toute sa richesse.",
    longDescription:
      "Olives du Maghreb et de Provence, huiles d'olive vierges extra, harissa, couscous, semoule fine et moyenne, feuilles de brick, pâtes de dattes, confitures de coing, fromages levantins. La Méditerranée entière, au prix du supermarché.",
    image: "/images/rayons/saveur-mediterranee.jpg",
    imageAlt: "Rayon saveur méditerranéenne Marché de Mo' Toulouse — olives, huile d'olive, épices",
    heroSlideshow: [
      "/images/rayons/saveur-mediterranee.jpg",
      "/images/rayons/saveur-mediterranee/ouvrier-d-x27-epicerie.jpg",
    ],
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
    tagline: "Rio. Mexico. Bogotá. Sur votre table.",
    description:
      "Épicerie, conserves, boissons et spécialités d'Amérique Latine. Fruits exotiques et piments colorés de la région.",
    longDescription:
      "Arepas précuites, dulce de leche, tortillas de maïs, haricots noirs, piments habanero et chipotle, farine de manioc, maté, guaraná, yerba. Les ingrédients qu'il faut pour cuisiner latino à la maison — sans faire le tour de Toulouse.",
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
    tagline: "Istanbul à portée de fourchette.",
    description:
      "Épiceries, fromages, charcuteries halal, conserves et boissons des Balkans et de Turquie.",
    longDescription:
      "Ayran, kefir, fromage blanc turc, feta bulgare, pastırma halal, soudjouk, börek, baklava, lokoum, café turc, délices de rose. L'épicerie balkano-turque qui manquait à Toulouse, avec les vrais emballages d'origine.",
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
    tagline: "Le quotidien, prix plancher.",
    description:
      "Prix cassés sur les produits du quotidien. Notre espace déstockage propose des réductions significatives pour tous les budgets.",
    longDescription:
      "Notre espace déstockage : produits d'entretien, hygiène, épicerie sucrée et salée — aux prix les plus bas du magasin. Fin de série, fin de stock ou arrivage exceptionnel : les bonnes affaires changent chaque semaine.",
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
    tagline: "Le monde. En 10 minutes.",
    description:
      "Large sélection de surgelés du monde entier : plats cuisinés ethniques, viandes halal surgelées, légumes et snacking.",
    longDescription:
      "Samoussas, bricks, nems, keftas halal, poulet yassa, mafé, rouleaux de printemps, naans au fromage, pizzas halal, légumes vapeur, glaces du monde. Le rayon qui dépanne quand il n'y a pas le temps — sans transiger sur l'origine.",
    image: "/images/rayons/surgeles.jpg",
    imageAlt: "Rayon surgelés Marché de Mo' Toulouse — plats ethniques surgelés",
    heroSlideshow: [
      "/images/rayons/surgeles.jpg",
      "/images/rayons/surgeles/vitrines-congelees.jpg",
    ],
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
