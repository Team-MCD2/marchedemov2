/* FAQs — une banque par page.
   Chaque page passe sa liste à <Layout faqItems={...}> pour injecter
   automatiquement le JSON-LD FAQPage dans le <head>.                 */

export interface FAQItem {
  q: string;
  r: string;
}

export const FAQ_HOME: FAQItem[] = [
  {
    q: "Qu'est-ce que Marché de Mo' ?",
    r: "Le plus grand supermarché ethnique d'Occitanie. 10 000+ références, boucherie halal, fruits et légumes exotiques, épices du monde, saveurs d'Afrique, d'Asie, de Méditerranée et bien plus. Ouvert 7j/7 à Toulouse.",
  },
  {
    q: "Où se trouvent les magasins Marché de Mo' ?",
    r: "Deux magasins dans l'agglomération toulousaine — Portet-sur-Garonne (8 Allée Pablo Picasso) et Toulouse Sud Cépière (5 rue Joachim du Bellay, sortie 27).",
  },
  {
    q: "Les magasins sont-ils ouverts le dimanche ?",
    r: "Oui, 7 jours sur 7 dont le dimanche de 8h30 à 13h.",
  },
  {
    q: "Quels moyens de paiement acceptez-vous ?",
    r: "Visa, Mastercard, Maestro, American Express, Apple Pay, Google Pay, PayPal et Tickets Restaurant.",
  },
  {
    q: "Peut-on s'inscrire à un programme de fidélité ?",
    r: "Oui, Marché de Mo' propose un programme de fidélité avec des offres exclusives. Voir la page Programme de fidélité pour s'inscrire.",
  },
];

export const FAQ_BOUCHERIE: FAQItem[] = [
  {
    q: "La boucherie est-elle certifiée halal ?",
    r: "Oui. Toutes nos viandes sont halal certifiées, abattues sans électronarcose.",
  },
  {
    q: "La viande est-elle fraîche quotidiennement ?",
    r: "Oui, arrivage quotidien. Nous travaillons directement les carcasses.",
  },
  {
    q: "Où trouver de la viande halal à Toulouse ?",
    r: "Marché de Mo' propose la boucherie halal la plus complète de Toulouse, dans nos magasins de Portet-sur-Garonne et Toulouse Sud.",
  },
  {
    q: "Vendez-vous de l'agneau halal sans électronarcose ?",
    r: "Oui, l'intégralité de nos viandes est certifiée halal et abattue selon les préceptes islamiques, sans électronarcose.",
  },
];

export const FAQ_RAYONS_GENERAL: FAQItem[] = [
  {
    q: "Combien de références propose Marché de Mo' ?",
    r: "Plus de 10 000 références sur 10 rayons thématiques.",
  },
  {
    q: "Trouve-t-on des produits exotiques rares ?",
    r: "Oui, 120+ références exotiques en fruits et légumes et une épicerie ethnique complète pour les cuisines africaine, asiatique, créole et méditerranéenne.",
  },
  {
    q: "Proposez-vous des produits pour les cuisines africaines et créoles ?",
    r: "Oui, notre rayon Saveurs d'Afrique & Créole propose plats cuisinés, conserves, condiments et boissons introuvables ailleurs à Toulouse.",
  },
];

export const FAQ_MAGASINS: FAQItem[] = [
  {
    q: "Y a-t-il un parking ?",
    r: "Oui, 600 places de parking dans nos deux magasins.",
  },
  {
    q: "Les magasins sont-ils accessibles PMR ?",
    r: "Oui, nos magasins sont adaptés aux personnes à mobilité réduite.",
  },
  {
    q: "Comment venir au magasin de Toulouse Sud ?",
    r: "Sortie 27 de la rocade, direction Cépière. 5 rue Joachim du Bellay, 31100 Toulouse. Parking gratuit de 600 places sur place.",
  },
];

export const FAQ_PROMOS: FAQItem[] = [
  {
    q: "Comment sont choisies les promotions ?",
    r: "Nos équipes mettent à jour les offres chaque semaine selon les rayons et les magasins. Consultez /promos pour voir toutes les offres actives.",
  },
  {
    q: "Les promos sont-elles différentes selon les magasins ?",
    r: "Certaines promos sont communes aux deux magasins, d'autres sont exclusives à Portet ou à Toulouse Sud. La fiche promo indique toujours le(s) magasin(s) concerné(s).",
  },
];

export const FAQ_RECRUTEMENT: FAQItem[] = [
  {
    q: "Qui peut postuler chez Marché de Mo' ?",
    r: "Tout le monde. Nous recrutons avec ou sans diplôme, avec ou sans expérience. 90% de notre équipe actuelle n'avait pas d'emploi avant de rejoindre le Marché de Mo'.",
  },
  {
    q: "Quel âge pour travailler chez vous ?",
    r: "Notre équipe actuelle a entre 19 et 56 ans. Nous croyons fondamentalement à la diversité intergénérationnelle.",
  },
  {
    q: "Quel type de contrat proposez-vous ?",
    r: "CDI, CDD, apprentissage et alternance. Toutes nos offres ouvertes sont listées sur cette page /recrutement.",
  },
];

export const FAQ_ENGAGEMENTS: FAQItem[] = [
  {
    q: "Avec quelles associations travaillez-vous ?",
    r: "Nous sommes partenaires de plusieurs banques alimentaires de Haute-Garonne et d'associations de soutien aux personnes âgées de l'agglomération toulousaine.",
  },
  {
    q: "Comment l'inclusion se traduit concrètement ?",
    r: "90% de notre équipe n'avait pas d'emploi avant d'être embauchée chez nous. Nous travaillons avec France Travail et des associations de réinsertion pour recruter et former sur le terrain.",
  },
];

/* Helper : FAQ spécifique à un rayon — on combine la FAQ rayon général
   avec la FAQ boucherie si c'est le rayon boucherie.                  */
export function faqsForRayon(slug: string): FAQItem[] {
  if (slug === "boucherie-halal") return FAQ_BOUCHERIE.concat(FAQ_RAYONS_GENERAL.slice(0, 1));
  return FAQ_RAYONS_GENERAL;
}
