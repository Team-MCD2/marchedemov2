# MARCHÉ DE MO' — PROMPT MAÎTRE V2 (reference)

This is the master brief for the Marché de Mo' V2 site. Do **not** modify this
file — it is a frozen reference for every decision on the project.

Source of truth:
- Stack : Astro + Tailwind + React islands + Vercel
- Brand palette : vert `#1C6B35`, rouge `#8B1919`, noir `#0F0F0F`, blanc `#FFFFFF`
- Fonts (Typekit) : `filson-pro`, `filson-soft`  — loaded via
  `<link rel="stylesheet" href="https://use.typekit.net/tci0qgy.css">`
- Deux niveaux de DA :
  1. **Global** — blanc + vert + rouge + noir. Pas de dark mode.
  2. **Culturel** — chaque page `/rayons/[slug]` culturelle a sa propre DA.

## Contacts / identité légale
- Nom : MARCHÉ DE MO'
- SIREN 924 841 471 · SIRET 924 841 471 00012 · RCS Toulouse
- Siège social : 6 Place Wilson, 31000 Toulouse
- Dirigeant : Samir Ouaddaha
- Tel : 05 82 95 82 52
- Email : contact@marchedemo.com

## Magasins
- **Portet-sur-Garonne** — 8 Allée Pablo Picasso, zone commerciale (1 200 m², 600 places)
- **Toulouse Sud — Cépière** — 5 rue Joachim du Bellay, 31100 Toulouse
  (sortie 27, 1 200 m², 600 places)

Horaires communs :
- Lun–Jeu 8h30–20h30
- Ven 8h30–13h & 14h–21h
- Sam 8h30–21h
- Dim 8h30–13h

## Réseaux
- Facebook : https://www.facebook.com/marchedemo/
- Instagram : https://www.instagram.com/marchedemo_supermarches/
- LinkedIn : https://linkedin.com/company/marché-de-mo/about/
- TikTok : https://www.tiktok.com/@marchedemo

## Rayons (10)
1. `/rayons/boucherie-halal`
2. `/rayons/fruits-legumes`
3. `/rayons/epices-du-monde`
4. `/rayons/saveurs-afrique` — DA africaine
5. `/rayons/saveurs-asie` — DA asiatique
6. `/rayons/saveur-mediterranee` — DA méditerranéenne
7. `/rayons/saveur-sud-amer` — DA latam
8. `/rayons/balkans-turques` — DA ottomane
9. `/rayons/produits-courants`
10. `/rayons/surgeles`

## Logos (dans /public/logos/)
| Fichier | Usage |
|---|---|
| `logo-marchedemo.png` | Logo complet fond blanc (texte vert, badge rouge) |
| `logo-marchedemo-FDROUGE.png` | Sticker / fond rouge — sections promo |
| `logo-marchedemo-rec.png` | Rectangulaire — footer, bannières |
| `logo-marchedemo-rec-contourwh.png` | Rectangulaire contour blanc — sur fonds colorés |
| `logo-marchedemo-rond-contourgreen.png` | Circulaire — header global, favicon hi-res |
| `favicon-marchedemo.png` | Portrait Mo' — favicon |
| `favicon-marchedemo-contourwh.png` | Portrait sticker — décoration |

Règles absolues :
- Breathing room autour du logo.
- Jamais dans un container coloré ajouté.
- Jamais de texte ajouté à côté.

## Sources de données dynamiques
- `src/content/promos/*.json` — promos de la semaine
- `src/content/videos/*.json` — TikToks assignés à un rayon ou à la home
- `src/content/postes/*.md` — offres d'emploi
- `src/content/articles/*.md` — blog

## Admin `/admin`
- Protégé par variable d'environnement Vercel.
- Gestion promos + vidéos uniquement.

## Interdits
- Pas de dark mode dominant
- Pas de beige / crème / ocre dans la palette globale
- Pas de SPA avec ancres `#`
- Pas de fonts serif élégantes
- Pas de container coloré autour du logo
- Pas de page `/videos` dédiée
- Pas de contenu placeholder « À suivre… »

## Crédit agence
Tout en bas du footer : `Fait par <a href="https://microdidact.com/" target="_blank" rel="noopener noreferrer">Microdidact</a>`
