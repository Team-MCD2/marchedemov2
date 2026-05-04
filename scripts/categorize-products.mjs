// ====================================================================
// scripts/categorize-products.mjs
//
// Auto-classifier for the produits catalogue.
//
// Reads src/data/produits-catalogue.json and assigns the correct
// (rayon, categorie, sous_categorie) to every product, using ordered
// keyword rules per rayon. Mirrors src/lib/taxonomie.ts so the public
// /rayons drill-down pages render every category and sub-category card
// fed by real product rows (not the "Catalogue en cours de constitution"
// empty-state).
//
// Usage:
//   node scripts/categorize-products.mjs --dry-run    # show diff
//   node scripts/categorize-products.mjs              # write back
//
// Output:
//   - rewrites src/data/produits-catalogue.json (in --apply mode)
//   - prints a per-rayon report
//   - emits scripts/data/categorize-report.json with full details
// ====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOGUE = path.join(ROOT, "src", "data", "produits-catalogue.json");
const REPORT = path.join(ROOT, "scripts", "data", "categorize-report.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

/* -----------------------------------------------------------------
   Normalisation helpers
----------------------------------------------------------------- */

function asciiLower(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase();
}

/* Combined normalised text for keyword matching: nom + slug + desc. */
function buildText(p) {
  return asciiLower([p.nom, p.slug, p.description, p.badge, p.origine].filter(Boolean).join(" "));
}

/* Test whether a product's text contains any of the given keywords.
   Keywords with leading/trailing pipes "|x|" enforce word boundaries. */
function matches(text, keywords) {
  for (const kw of keywords) {
    if (typeof kw === "string") {
      if (text.includes(kw)) return true;
    } else if (kw instanceof RegExp) {
      if (kw.test(text)) return true;
    }
  }
  return false;
}

/* -----------------------------------------------------------------
   Move-out rules : products that are visibly in the wrong rayon.
   Applied BEFORE in-rayon classification.
   Each rule says : "if a product currently in <fromRayon> matches
   <pattern>, move it to (newRayon, newCat, newSub)".
----------------------------------------------------------------- */

const MOVE_OUT_RULES = [
  /* Tea / infusions in epices-du-monde → produits-courants/Boissons. */
  {
    fromRayon: "epices-du-monde",
    when: [/\bthe\b/, /\btea\b/, /infusion/, /infuse/, /lipton/, /yellow label/, /earl grey/, /lemongrass/],
    to: { rayon: "produits-courants", categorie: "Boissons", sous_categorie: null },
  },
  /* Pringles, snacks, Tajín seasoning bottle, guacamole → produits-courants. */
  {
    fromRayon: "epices-du-monde",
    when: [/pringles/, /\bguacamole\b/],
    to: { rayon: "produits-courants", categorie: "Épicerie salée", sous_categorie: null },
  },
  /* All sels/salts → produits-courants/Épicerie salée. The taxonomy of
     epices-du-monde has no "Sels" category, so they were drifting into
     "Maghreb" by accident. */
  {
    fromRayon: "epices-du-monde",
    when: [/\bsel\b/, /\bsels\b/, /\bsel-/, /sel /, /\bsalt\b/, /sal marina/, /fleur de sel/, /herbamare/],
    to: { rayon: "produits-courants", categorie: "Épicerie salée", sous_categorie: null },
  },
  /* Bouillons / stock cubes → produits-courants/Épicerie salée. */
  {
    fromRayon: "epices-du-monde",
    when: [/bouillon/, /knorr.*aromat/, /aromat tube/],
    to: { rayon: "produits-courants", categorie: "Épicerie salée", sous_categorie: null },
  },
  /* Vanille bourbon / arômes → produits-courants/Épicerie sucrée. */
  {
    fromRayon: "epices-du-monde",
    when: [/arome.*vanille/, /arome.*loriginal/, /vanille bourbon/],
    to: { rayon: "produits-courants", categorie: "Épicerie sucrée", sous_categorie: null },
  },

  /* Compotes / jus / shots in fruits-legumes → produits-courants. */
  {
    fromRayon: "fruits-legumes",
    when: [/compote/, /pom'?potes/, /pom potes/, /puree de pomme/],
    to: { rayon: "produits-courants", categorie: "Épicerie sucrée", sous_categorie: null },
  },
  {
    fromRayon: "fruits-legumes",
    when: [/tropicana/, /pur jus/, /\bjus\b/, /\bpago\b/, /shot de gingembre/, /^le bio orange/, /le pur jus/],
    to: { rayon: "produits-courants", categorie: "Boissons", sous_categorie: null },
  },
  /* "Formule boost", "FA-BU-BLEU" — generic energy/boost products. */
  {
    fromRayon: "fruits-legumes",
    when: [/formule boost/, /fa-bu-bleu/],
    to: { rayon: "produits-courants", categorie: "Boissons", sous_categorie: null },
  },

  /* Salsa Mexicana / Tortillas / Pancho Villa wrongly under saveurs-asie
     (they are Latin-American). */
  {
    fromRayon: "saveurs-asie",
    when: [/salsa mexicana/, /pancho villa/, /tortilla/, /\bwrap\b/, /burrito/],
    to: { rayon: "saveur-sud-amer", categorie: "Épicerie", sous_categorie: null },
  },
];

/* -----------------------------------------------------------------
   In-rayon classification rules.
   Each entry : matches(text) => { categorie, sous_categorie }.
   Order matters — first match wins. End every rayon with a fallback.
----------------------------------------------------------------- */

const RAYON_RULES = {
  "boucherie-halal": [
    /* Charcuterie FIRST — "pastrami de dinde" must beat "dinde". */
    { when: [/pastrami/, /cachir/], cat: "Charcuterie halal", sub: "Pastrami" },
    { when: [/merguez/], cat: "Charcuterie halal", sub: "Merguez" },
    { when: [/saucisses?\b/, /\bsausage\b/], cat: "Charcuterie halal", sub: "Saucisses" },
    /* Préparations. */
    { when: [/brochette/], cat: "Préparations", sub: "Brochettes" },
    { when: [/hachis/, /\bkefta\b/, /\bkebab\b/], cat: "Préparations", sub: "Hachis" },
    { when: [/marinad/], cat: "Préparations", sub: "Marinades" },
    /* Viandes. */
    { when: [/agneau/, /\blamb\b/, /gigot/], cat: "Viandes", sub: "Agneau" },
    { when: [/\bboeuf\b/, /\bbœuf\b/, /\bbeef\b/, /entrecote/, /bavette/, /osso bucco/, /boeuf hache/, /aloyau/], cat: "Viandes", sub: "Bœuf" },
    { when: [/\bveau\b/, /\bveal\b/], cat: "Viandes", sub: "Veau" },
    { when: [/mouton/, /\bmutton\b/], cat: "Viandes", sub: "Mouton" },
    /* Volailles. */
    { when: [/cuisses? de poulet/, /escalopes? de poulet/, /poulet (entier|fermier|jaune)/, /\bpoulet\b/, /\bchicken\b/], cat: "Volailles", sub: "Poulet" },
    { when: [/\bdinde\b/, /\bturkey\b/], cat: "Volailles", sub: "Dinde" },
    { when: [/\bcanard\b/, /\bduck\b/], cat: "Volailles", sub: "Canard" },
    /* fallback */
    { when: [/.*/], cat: "Viandes", sub: null },
  ],

  "fruits-legumes": [
    /* Tubercules first — manioc, igname, patate-douce. */
    { when: [/\bmanioc\b/, /cassava/, /\byuca\b/], cat: "Tubercules", sub: "Manioc" },
    { when: [/\bigname\b/, /\byam\b/], cat: "Tubercules", sub: "Igname" },
    { when: [/patate douce/, /sweet potato/], cat: "Tubercules", sub: "Patates douces" },
    /* Dattes & fruits secs. */
    { when: [/\bdatte/, /\bdattes\b/, /medjool/, /deglet nour/], cat: "Dattes & fruits secs", sub: "Dattes" },
    { when: [/\bfigue/, /\bfigues\b/], cat: "Dattes & fruits secs", sub: "Figues" },
    { when: [/abricot.*sec/, /pruneau/, /pruneaux/], cat: "Dattes & fruits secs", sub: "Abricots secs" },
    { when: [/canneberge/, /\bcranberr/, /\bnoix\b/, /noisette/, /amande.*entiere/, /melange.*noix/, /melange.*fruits secs/, /fruits secs/, /studentenfutter/, /mendiant/, /mixed nuts/], cat: "Dattes & fruits secs", sub: null },
    /* Aromates & herbes. */
    { when: [/\bpersil\b/, /ciboulette/, /basilic/, /\bmenthe\b/, /\bcoriandre\b/, /\bthym\b/, /romarin/, /aromate/], cat: "Aromates & herbes", sub: null },
    /* Fruits — exotiques. */
    { when: [/\bplantain/, /\bmangue/, /\bmangues\b/, /\bpapaye/, /ananas/, /\bgoyave/, /\blitchi/, /fruit du dragon/, /fruit de la passion/, /\bdurian/, /jaquier/, /\bramboutan/, /\blongan/, /\blycee\b/], cat: "Fruits", sub: "Exotiques" },
    /* Fruits — agrumes. */
    { when: [/\borange\b/, /\boranges\b/, /\bcitron/, /pamplemousse/, /mandarine/, /clementine/], cat: "Fruits", sub: "Agrumes" },
    /* Fruits — rouges. */
    { when: [/\bfraise/, /\bframboise/, /\bmure\b/, /myrtille/, /cerise/, /grenade/, /grenades/], cat: "Fruits", sub: "Rouges" },
    /* Fruits — bio (fallback when explicitly bio). */
    { when: [/\bbio\b/, /biologique/], cat: "Fruits", sub: "Bio" },
    /* Fruits — de saison (default for non-exotic fruits). */
    { when: [/\bpomme/, /\bpoire/, /\bpeche\b/, /\bpeches\b/, /\babricot\b/, /\braisin/, /\bkiwi/, /\bnectarine/], cat: "Fruits", sub: "De saison" },
    /* Légumes — racines / feuilles / frais. */
    { when: [/carotte/, /betterav/, /\bnavet/, /\bradis\b/, /poireau/, /\boignon/, /\bechalo/], cat: "Légumes", sub: "Racines" },
    { when: [/epinard/, /\bkale\b/, /\bblette/, /\bsalade/, /laitue/, /endive/, /\bchou\b/], cat: "Légumes", sub: "Feuilles" },
    { when: [/piment antillais/, /piment frais/, /\bgombo/, /tomate fraiche/, /courgette/, /aubergine/, /poivron/, /\bconcombre/, /\bharicot vert/], cat: "Légumes", sub: "Frais" },
    /* fallback */
    { when: [/.*/], cat: "Légumes", sub: "Frais" },
  ],

  "epices-du-monde": [
    /* Maghreb — mélanges. */
    { when: [/ras el hanout/, /baharat/, /\bdukkah\b/, /melange.*marocain/, /melange.*tunisien/], cat: "Maghreb", sub: "Mélanges" },
    /* Maghreb — simples (cumin, coriandre…). */
    { when: [/\bcumin\b/, /coriandre/, /cardamome/, /\bcannelle\b/, /clou.*girofle/, /cumin (en grains|grains|moulu)/], cat: "Maghreb", sub: "Simples" },
    /* Inde — currys / masalas. */
    { when: [/\bcurry\b/, /vindaloo/, /jalfrezi/, /madras/, /tandoori/, /tikka/], cat: "Inde", sub: "Currys" },
    { when: [/masala/, /garam/], cat: "Inde", sub: "Masalas" },
    { when: [/curcuma/, /fenugrec/], cat: "Inde", sub: "Simples" },
    /* Piments. */
    { when: [/piment/, /\bcayenne/, /paprika/, /pepperonc/, /peperonc/, /harissa/, /sriracha/, /sambal/, /piri.?piri/, /tabasco/, /chili/, /chil[ié]/], cat: "Piments", sub: null },
    /* Méditerranée — herbes, sels marins, persillade. */
    { when: [/oregano/, /origan/, /\bthym\b/, /romarin/, /sauge/, /sariette/, /persillade/, /provencal/, /provence/, /5 baies/, /poivre/, /\bpepper\b/, /\bpoivron/, /\bbaies\b/], cat: "Méditerranée", sub: null },
    /* Asie. */
    { when: [/\bwasabi\b/, /\bsumac\b/, /sansho/, /cinq.?epices/, /five.?spice/], cat: "Asie", sub: null },
    /* Afrique de l'Ouest. */
    { when: [/yassa/, /\bsuya\b/, /jollof/, /poivre de selim/, /grain.* paradis/], cat: "Afrique de l'Ouest", sub: null },
    /* fallback : generic spice → Maghreb/Simples */
    { when: [/.*/], cat: "Maghreb", sub: "Simples" },
  ],

  "saveurs-afrique": [
    /* Féculents & farines. */
    { when: [/attieke/], cat: "Féculents & farines", sub: "Attiéké" },
    { when: [/farine.*mil/, /\bmil\b/, /\bfonio\b/], cat: "Féculents & farines", sub: "Mil" },
    { when: [/farine.*manioc/, /\bgari\b/, /\bfufu\b/, /tapioca/], cat: "Féculents & farines", sub: "Manioc" },
    { when: [/\briz\b/, /\brice\b/], cat: "Féculents & farines", sub: "Riz" },
    /* Huiles. */
    { when: [/huile.*palme/, /palm.*oil/, /azeite.*dende/, /huile rouge/, /\bdende\b/], cat: "Huiles", sub: null },
    /* Sauces & condiments. */
    { when: [/pate d.?arachide/, /peanut paste/, /\bsauce\b/, /tomate/], cat: "Sauces & condiments", sub: null },
    /* Épicerie. Bouillons (MAGGI cubes) MUST come before the generic
       Poudres rule — MAGGI bouillons aren't poudres, they're cubes. */
    { when: [/bouillon/, /\bkubor\b/, /\bkub\b/, /maggi/, /\bcube\b/], cat: "Épicerie", sub: "Bouillons" },
    { when: [/bissap/, /hibiscus/, /gingembre/], cat: "Épicerie", sub: "Boissons" },
    { when: [/baobab/, /\bnere\b/, /poudre/], cat: "Épicerie", sub: "Poudres" },
    /* fallback */
    { when: [/.*/], cat: "Épicerie", sub: null },
  ],

  "saveurs-asie": [
    /* Frais — kimchi, tofu, pickles. */
    { when: [/kimchi/], cat: "Frais", sub: "Kimchi" },
    { when: [/\btofu\b/], cat: "Frais", sub: "Tofu" },
    { when: [/pickles/, /pickled/, /umeboshi/], cat: "Frais", sub: "Pickles" },
    /* Riz & nouilles. */
    { when: [/vermicell?/, /vermicelle/], cat: "Riz & nouilles", sub: "Vermicelles" },
    { when: [/\bnouille/, /\bnoodle/, /\bramen\b/, /\budon\b/, /\bsoba\b/, /pad see ew/], cat: "Riz & nouilles", sub: "Nouilles" },
    { when: [/\briz\b/, /\brice\b/, /basmati/, /risotto/, /thai/], cat: "Riz & nouilles", sub: "Riz" },
    /* Sauces & condiments. */
    { when: [/sauce soja/, /\bsoy sauce/, /soja sauce/, /\bsoja\b/, /tamari/, /shoyu/, /kikkoman/], cat: "Sauces & condiments", sub: "Soja" },
    { when: [/sriracha/, /sambal/, /piri.?piri/, /sweet chilli/, /piment/, /tabasco/, /spicy/, /piri/], cat: "Sauces & condiments", sub: "Piments" },
    { when: [/curry paste/, /pate.*curry/, /tikka/, /korma/, /balti/, /masala paste/, /gochujang/, /miso/], cat: "Sauces & condiments", sub: "Pâtes" },
    /* Épicerie. */
    { when: [/lait.*coco/, /coconut milk/, /coconut.*cream/, /lait.*soja/, /lait d.?amande/], cat: "Épicerie", sub: "Laits végétaux" },
    { when: [/\bthe vert\b/, /matcha/, /sencha/, /oolong/], cat: "Épicerie", sub: "Thés" },
    { when: [/algue/, /\bnori\b/, /sesame/, /huile.*sesame/, /sesam/, /kit /, /thai.*kit/, /pickle/], cat: "Épicerie", sub: "Épicerie sèche" },
    /* fallback */
    { when: [/.*/], cat: "Épicerie", sub: "Épicerie sèche" },
  ],

  "saveur-mediterranee": [
    /* Huiles & vinaigres FIRST — "huile d'olive" must beat the olive rule. */
    { when: [/huile.*olive/, /olive oil/, /huile vierge/, /vinaigre/, /vinegar/], cat: "Huiles & vinaigres", sub: null },
    /* Olives & tapenades. */
    { when: [/\bolive/, /\boliven\b/, /tapenade/, /kalamata/], cat: "Olives & tapenades", sub: null },
    /* Fromages — AOP-tagged FIRST so "feta aop" beats plain "feta". */
    { when: [/feta\W*aop/, /aop\W*feta/, /pecorino\W*aop/, /parmigiano/, /parmesan/, /\baop\b/], cat: "Fromages", sub: "AOP" },
    { when: [/halloumi/], cat: "Fromages", sub: null },
    { when: [/\bfeta\b/, /\bfeta-/, /^feta/, /fromage.*brebis/, /fromage.*chevre/], cat: "Fromages", sub: "Saumure" },
    { when: [/ricotta/, /mozzarella/, /\bbrebis\b/], cat: "Fromages", sub: "Frais" },
    /* Semoules & couscous. */
    { when: [/couscous/, /semoule/, /boulgour/, /\bbulghur/, /tipiak/], cat: "Semoules & couscous", sub: null },
    /* Harissas & condiments. */
    { when: [/harissa/, /\bmiel\b/, /\bhoney\b/, /tartimiel/, /apiculteur/], cat: "Harissas & condiments", sub: null },
    /* fallback */
    { when: [/.*/], cat: "Harissas & condiments", sub: null },
  ],

  "saveur-sud-amer": [
    /* Légumineuses. */
    { when: [/black beans/, /haricots? noirs?/, /haricot.*black/, /haricots? rouges?/, /\bharicots?\b/, /\bbeans\b/], cat: "Légumineuses", sub: "Haricots" },
    { when: [/lentille/, /\blentil/], cat: "Légumineuses", sub: "Lentilles" },
    { when: [/pois.*chiche/, /\bpois\b/, /chickpea/, /\bpeas\b/], cat: "Légumineuses", sub: "Pois" },
    /* Céréales & graines. */
    { when: [/quinoa/], cat: "Céréales & graines", sub: "Quinoa" },
    { when: [/\bmais\b/, /\bmaize\b/, /popcorn/, /maize/], cat: "Céréales & graines", sub: "Maïs" },
    { when: [/amarante/, /chia/, /\bsorgho/], cat: "Céréales & graines", sub: "Amarante" },
    { when: [/\bdurum\b/, /\bble dur\b/, /\bepeautre\b/, /semoule de ble/], cat: "Céréales & graines", sub: "Blé" },
    { when: [/\bavoine\b/, /\borge\b/], cat: "Céréales & graines", sub: null },
    /* Farines. */
    { when: [/farine/], cat: "Farines", sub: null },
    /* fallback */
    { when: [/.*/], cat: "Épicerie", sub: null },
  ],

  "balkans-turques": [
    { when: [/baklava/, /baklawa/], cat: "Pâtisseries", sub: "Baklava" },
    { when: [/loukoum/, /\blokum\b/, /turkish delight/], cat: "Pâtisseries", sub: "Loukoums" },
    { when: [/\bhalva\b/, /\bhelva\b/, /tahin/], cat: "Pâtisseries", sub: "Halva" },
    { when: [/halloumi/], cat: "Fromages", sub: "Halloumi" },
    { when: [/\bfeta/, /fromage.*bulgare/, /fromage.*brebis/], cat: "Fromages", sub: "Feta" },
    { when: [/kashar/, /kasseri/, /kachkaval/, /kasher fromage/], cat: "Fromages", sub: "Kashar" },
    { when: [/ayran/], cat: "Boissons", sub: "Ayran" },
    { when: [/\bthe\b/, /\btea\b/, /\bcay\b/], cat: "Boissons", sub: "Thés" },
    { when: [/pistache/], cat: "Fruits secs & noix", sub: "Pistaches" },
    { when: [/noisette/], cat: "Fruits secs & noix", sub: "Noisettes" },
    { when: [/\bnoix\b/, /\bwalnut/], cat: "Fruits secs & noix", sub: "Noix" },
    { when: [/ajvar/, /tarama/, /yaprak/, /sarma/], cat: "Épicerie balkanique", sub: null },
    /* fallback */
    { when: [/.*/], cat: "Épicerie balkanique", sub: null },
  ],

  "produits-courants": [
    /* Boissons. */
    { when: [/\bthe\b/, /\btea\b/, /\binfusion/, /\binfuse\b/, /lipton/, /earl grey/, /lemongrass/, /yellow label/], cat: "Boissons", sub: null },
    { when: [/tropicana/, /\bjus\b/, /pur jus/, /\bsoda\b/, /\bcola\b/, /\bbiere\b/, /\bvin\b/, /\beau\b/, /\bpago\b/, /shot.*gingembre/, /lait demi.?ecreme/, /lait uht/, /lait entier/], cat: "Boissons", sub: null },
    /* Épicerie sucrée. */
    { when: [/\bsucre\b/, /cassonade/, /muscovado/, /stevia/, /confiture/, /\bchocolat/, /pate.*tartiner/, /nutella/, /biscuit/, /\bcompote/, /pom'?potes/, /pom potes/, /\bvanille/, /arome.*vanille/, /\bamandes? en poudre\b/, /poudre d.?amande/], cat: "Épicerie sucrée", sub: null },
    /* Épicerie salée — pâtes, riz, conserves, farines, légumineuses cuisinées. */
    { when: [/\bpates\b/, /\bpate\b/, /spaghetti/, /penne/, /linguine/, /capellini/, /fusilli/, /lasagne/, /tagliatell/, /macaroni/, /pates rigate/, /ravioli/], cat: "Épicerie salée", sub: null },
    { when: [/\briz\b/, /\brice\b/, /basmati/, /risotto/], cat: "Épicerie salée", sub: null },
    { when: [/\bfarine/, /\bflour/], cat: "Épicerie salée", sub: null },
    { when: [/lentille/, /pois.*chiche/, /haricot/, /chickpea/, /kichererbsen/], cat: "Épicerie salée", sub: null },
    { when: [/tomate.*pelee/, /concasse.*tomate/, /tomate concasse/, /\btomaten\b/, /tomate.*bocal/, /sauce tomate/], cat: "Épicerie salée", sub: null },
    { when: [/huile/, /\boil\b/], cat: "Épicerie salée", sub: null },
    { when: [/\bsel\b/, /\bsels\b/, /\bsalt\b/, /sal marina/, /fleur.*sel/, /herbamare/, /aromat/, /bouillon/, /knorr/], cat: "Épicerie salée", sub: null },
    { when: [/\boeuf/, /\boeufs/, /\bœuf/, /\beggs?\b/], cat: "Épicerie salée", sub: null },
    { when: [/nouille.*instant/, /noodle.*instant/], cat: "Épicerie salée", sub: null },
    { when: [/protein.*lentil/, /protein cake/], cat: "Épicerie salée", sub: null },
    /* Hygiène & entretien. */
    { when: [/shampoo/, /\bsavon\b/, /lessive/, /detergent/], cat: "Hygiène & entretien", sub: null },
    /* fallback */
    { when: [/.*/], cat: "Épicerie salée", sub: null },
  ],

  "surgeles": [
    /* Apéritifs. */
    { when: [/samoussa/, /samosa/], cat: "Apéritifs", sub: "Samoussas" },
    { when: [/\bnem\b/, /\bnems\b/], cat: "Apéritifs", sub: "Nems" },
    { when: [/bouchee/, /amuse.?bouche/], cat: "Apéritifs", sub: "Bouchées" },
    /* Plats préparés halal. */
    { when: [/\bhalal\b/, /boulettes? de viande/, /boulette.*viande/, /pizza.*halal/], cat: "Plats préparés halal", sub: null },
    { when: [/\bpizza/, /lasagne/, /gratin/, /\bplat\b/, /risotto/, /\brice meal/, /\brice cuisine/], cat: "Plats préparés halal", sub: null },
    /* Légumes. */
    { when: [/legume/, /poelee/, /ratatouille/, /haricots? vert/, /epinard/, /edamame/, /\bfeves?\b/, /champi(g|n)/, /brocoli/, /\bwok\b/, /melange.*legume/, /quinoa pois doux/, /quinoa/], cat: "Légumes", sub: null },
    /* Poissons. */
    { when: [/poisson/, /\bfish\b/, /panes? au poisson/, /panes.*poisson/, /pane au poisson/, /cabillaud/, /saumon/, /thon/, /merlu/, /colin/, /lieu noir/], cat: "Poissons", sub: null },
    /* Desserts. */
    { when: [/mochi/, /glace/, /sorbet/, /\bgateau/, /tiramisu/, /\bcake\b/, /tarte aux/], cat: "Desserts", sub: null },
    /* fallback */
    { when: [/.*/], cat: "Légumes", sub: null },
  ],
};

/* -----------------------------------------------------------------
   Run the classifier
----------------------------------------------------------------- */

function classify(p) {
  /* (1) Move-out check : sometimes products land in the wrong rayon. */
  for (const rule of MOVE_OUT_RULES) {
    if (rule.fromRayon !== p.rayon) continue;
    if (matches(buildText(p), rule.when)) {
      return {
        rayon: rule.to.rayon,
        categorie: rule.to.categorie,
        sous_categorie: rule.to.sous_categorie,
        moved: true,
      };
    }
  }
  /* (2) In-rayon classification. */
  const rules = RAYON_RULES[p.rayon];
  if (!rules) return null;
  const text = buildText(p);
  for (const r of rules) {
    if (matches(text, r.when)) {
      return {
        rayon: p.rayon,
        categorie: r.cat,
        sous_categorie: r.sub,
        moved: false,
      };
    }
  }
  return null;
}

function main() {
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const produits = cat.produits ?? [];

  let unchanged = 0;
  let changed = 0;
  let moved = 0;
  let unmatched = 0;
  const report = { byRayon: {}, moves: [], changes: [] };

  for (const p of produits) {
    const c = classify(p);
    if (!c) {
      unmatched += 1;
      continue;
    }
    const before = {
      rayon: p.rayon,
      categorie: p.categorie ?? null,
      sous_categorie: p.sous_categorie ?? null,
    };
    const after = {
      rayon: c.rayon,
      categorie: c.categorie ?? null,
      sous_categorie: c.sous_categorie ?? null,
    };
    if (
      before.rayon === after.rayon &&
      before.categorie === after.categorie &&
      before.sous_categorie === after.sous_categorie
    ) {
      unchanged += 1;
      continue;
    }
    if (!DRY_RUN) {
      p.rayon = after.rayon;
      p.categorie = after.categorie;
      p.sous_categorie = after.sous_categorie;
    }
    changed += 1;
    if (c.moved) {
      moved += 1;
      report.moves.push({ slug: p.slug, nom: p.nom, before, after });
    }
    report.changes.push({ slug: p.slug, nom: p.nom, before, after });
    report.byRayon[after.rayon] = (report.byRayon[after.rayon] ?? 0) + 1;
  }

  console.log(`[categorize] total=${produits.length} unchanged=${unchanged} changed=${changed} moved=${moved} unmatched=${unmatched}`);
  console.log("[categorize] new rayon distribution :");
  const ray = new Map();
  for (const p of produits) ray.set(p.rayon, (ray.get(p.rayon) ?? 0) + 1);
  for (const [k, v] of [...ray].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${v.toString().padStart(3)}  ${k}`);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(CATALOGUE, JSON.stringify(cat, null, 2));
    console.log(`[categorize] wrote ${path.relative(ROOT, CATALOGUE)}`);
  } else {
    console.log("[categorize] (dry-run — catalogue NOT written)");
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`[categorize] report -> ${path.relative(ROOT, REPORT)}`);
}

main();
