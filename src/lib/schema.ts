/* JSON-LD schema.org helpers — called from each page via Layout.astro. */
import { SITE, SOCIAL, MAGASINS, type Magasin } from "./site";
import type { FAQItem } from "./faqs";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/logos/logo-marchedemo-rond-contourgreen.png`,
    description: SITE.shortPitch,
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: SITE.phoneE164,
        contactType: "customer service",
        areaServed: "FR",
        availableLanguage: ["French"],
      },
    ],
    sameAs: [SOCIAL.facebook, SOCIAL.instagram, SOCIAL.linkedin, SOCIAL.tiktok],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    inLanguage: "fr-FR",
    publisher: { "@type": "Organization", name: SITE.name },
  };
}

export function grocerySchema(m: Magasin) {
  return {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    "@id": `${SITE.url}/magasins/${m.slug}#store`,
    name: m.nom,
    image: `${SITE.url}${m.photo}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: m.adresseLigne1,
      addressLocality: m.ville,
      postalCode: m.codePostal,
      addressRegion: "Occitanie",
      addressCountry: "FR",
    },
    telephone: SITE.phoneE164,
    email: SITE.email,
    openingHours: m.openingHoursSchema,
    servesCuisine: ["Halal", "Africain", "Asiatique", "Méditerranéen", "Sud-Américain", "Balkans"],
    priceRange: "€€",
    hasMap: m.mapsLink,
    geo: {
      "@type": "GeoCoordinates",
      latitude: m.coords.lat,
      longitude: m.coords.lon,
    },
    url: `${SITE.url}/magasins/${m.slug}`,
    parentOrganization: { "@type": "Organization", name: SITE.name },
  };
}

export function allMagasinsSchema() {
  return Object.values(MAGASINS).map(grocerySchema);
}

export function faqSchema(items: FAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.r },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE.url}${item.url}`,
    })),
  };
}

export function jobPostingSchema(p: {
  titre: string;
  description: string;
  datePosted: string;
  employmentType: string;
  magasin: "portet" | "toulouse-sud" | "tous";
  slug: string;
}) {
  const locs =
    p.magasin === "tous"
      ? Object.values(MAGASINS)
      : [MAGASINS[p.magasin]];
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: p.titre,
    description: p.description,
    datePosted: p.datePosted,
    employmentType: p.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: SITE.name,
      sameAs: SITE.url,
      logo: `${SITE.url}/logos/logo-marchedemo-rond-contourgreen.png`,
    },
    jobLocation: locs.map((m) => ({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: m.adresseLigne1,
        addressLocality: m.ville,
        postalCode: m.codePostal,
        addressCountry: "FR",
      },
    })),
    url: `${SITE.url}/recrutement/${p.slug}`,
  };
}

export function offerSchema(p: {
  titre: string;
  description: string;
  image: string;
  prix_promo: string | number;
  prix_original: string | number;
  date_debut: string;
  date_fin: string;
}) {
  const priceStr = typeof p.prix_promo === "number" ? p.prix_promo.toFixed(2) : String(p.prix_promo);
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: p.titre,
    description: p.description,
    image: p.image.startsWith("http") ? p.image : `${SITE.url}${p.image}`,
    price: priceStr,
    priceCurrency: "EUR",
    priceValidUntil: p.date_fin,
    validFrom: p.date_debut,
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: SITE.name },
  };
}

/**
 * Schema.org Recipe — pour rich results Google (photo + temps +
 * étoiles + calories dans SERP). Appelé depuis /recettes/[slug].astro.
 *
 * Convertit les minutes en format ISO 8601 duration ("PT45M", "PT1H30M").
 */
function minutesToISO(min: number | undefined): string | undefined {
  if (!min || min < 1) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `PT${m}M`;
  if (m === 0) return `PT${h}H`;
  return `PT${h}H${m}M`;
}

export function recipeSchema(r: {
  titre: string;
  resume: string;
  image: string;
  imageAlt?: string;
  tempsMin: number;
  tempsPrepMin?: number;
  tempsCuissonMin?: number;
  portions: number;
  difficulte: "Facile" | "Moyen" | "Avancé";
  origine?: string;
  keywords: string[];
  date_publication: Date;
  slug: string;
  /** Liste des ingrédients plain-text extraite du MDX (optionnel, enrichit SERP). */
  ingredients?: string[];
  /** Liste des étapes plain-text extraite du MDX (optionnel). */
  steps?: string[];
}) {
  const imageUrl = r.image.startsWith("http") ? r.image : `${SITE.url}${r.image}`;
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: r.titre,
    description: r.resume,
    image: [imageUrl],
    author: { "@type": "Organization", name: SITE.name },
    datePublished: r.date_publication.toISOString(),
    prepTime: minutesToISO(r.tempsPrepMin),
    cookTime: minutesToISO(r.tempsCuissonMin),
    totalTime: minutesToISO(r.tempsMin),
    recipeYield: `${r.portions} portions`,
    recipeCategory: "Plat principal",
    recipeCuisine: r.origine,
    keywords: r.keywords?.join(", "),
    ...(r.ingredients && r.ingredients.length > 0
      ? { recipeIngredient: r.ingredients }
      : {}),
    ...(r.steps && r.steps.length > 0
      ? {
          recipeInstructions: r.steps.map((text, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            text,
          })),
        }
      : {}),
    url: `${SITE.url}/recettes/${r.slug}`,
  };
}
