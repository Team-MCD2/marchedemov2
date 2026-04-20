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
  prix_promo: string;
  prix_original: string;
  date_debut: string;
  date_fin: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: p.titre,
    description: p.description,
    image: p.image.startsWith("http") ? p.image : `${SITE.url}${p.image}`,
    price: p.prix_promo,
    priceCurrency: "EUR",
    priceValidUntil: p.date_fin,
    validFrom: p.date_debut,
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: SITE.name },
  };
}
