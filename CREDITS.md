# Credits

## Image credits

Toutes les images du site proviennent de `static.wixstatic.com` (CDN du site
officiel [marchedemo.com](https://www.marchedemo.com)), récupérées via le
scraper documenté dans `scripts/scrape-wixstatic.mjs`.

### Écarts documentés

| Contexte | Source | Auteur | Raison de l'écart |
|---|---|---|---|
| `public/images/rayons/saveur-sud-amer.jpg` | [Unsplash — KjOy1JVwamI](https://unsplash.com/photos/KjOy1JVwamI) | Alexandra Tran ([@alexgoesglobal](https://unsplash.com/@alexgoesglobal)) | Le site Wix officiel n'avait aucune image authentique pour le rayon Sud-Américain (les 2 photos scrapées étaient du ménage/produits de nettoyage, hors-sujet). Écart validé par le client. À remplacer dès qu'une photo authentique du rayon en magasin est fournie. |
| `public/images/rayons/saveur-mediterranee.jpg` | [Unsplash — fQHQp75Ap3E](https://unsplash.com/photos/olives-and-olive-oil-on-a-wooden-table-fQHQp75Ap3E) | Anya Chernykh ([@anyachernykh](https://unsplash.com/@anyachernykh)) | L'image Wix d'origine (verre de glaçons, `image-de-giorgio-trovato.jpg`) n'avait aucun rapport avec la Méditerranée. Remplacée par une nature morte rustique : olives noires/vertes, huile d'olive, branches d'olivier — raccord parfait avec la description du rayon (olives, huile d'olive vierge extra, harissa, couscous). À remplacer dès qu'une photo authentique du rayon en magasin est fournie. |
| `public/images/rayons/boucherie-halal.jpg` | Réutilisation locale — copie de `rayons/boucherie-halal/image-de-cindie-hansen.jpg` (elle-même issue du scrape Wix). | Cindie Hansen (via Wix officiel) | L'image d'origine (carcasses suspendues en chambre froide, `slaughterhouse-carcasses-raw-meat-beef-6.jpg`) était trop graphique pour un site e-commerce grand public. Remplacée par une photo appétissante de côtelettes fraîches au romarin (déjà présente dans le dossier du rayon). Le fichier source reste dans `rayons/boucherie-halal/slaughterhouse-carcasses-raw-meat-beef-6.jpg` pour traçabilité. |
| `public/images/recettes/mafe-senegalais.jpg` | [Wikimedia Commons — Domoda.jpg](https://commons.wikimedia.org/wiki/File:Domoda.jpg) | T.K. Naliaka · **CC BY-SA 4.0** | Section « Recettes inspirées de nos rayons » (home). Photo authentique de *maafé/domoda* sénégalais (riz + sauce arachide + viande + légumes). Attribution requise ; licence partage identique. Remplace un premier choix Unsplash qui n'était pas représentatif du plat. |
| `public/images/recettes/bibimbap-coreen.jpg` | [Unsplash — 4f4YZfDMLeU](https://unsplash.com/photos/4f4YZfDMLeU) | Jakub Kapusnak ([@foodish](https://unsplash.com/@foodish)) | Idem. Bibimbap coréen authentique avec kimchi et banchan. |
| `public/images/recettes/tajine-agneau.jpg` | [Unsplash — _V4v7BbG338](https://unsplash.com/photos/_V4v7BbG338) | Annie Spratt ([@anniespratt](https://unsplash.com/@anniespratt)) | Idem. Tagine marocain en vaisselle traditionnelle. |
| `public/images/recettes/couscous-royal.jpg` | [Unsplash — lOMCKZ1LHQ4](https://unsplash.com/photos/a-white-plate-topped-with-rice-and-vegetables-lOMCKZ1LHQ4) | Mourad HARKAT ([@artist_mourad](https://unsplash.com/@artist_mourad)) | Recette « Couscous royal » (page recette + encarts home/rayon). Photo authentique de couscous nord-africain (semoule + sauce tomate + légumes + pois chiches). L'image Wix précédente était hors-sujet (verre de glaçons). |

### Ré-organisation locale après scrape (cleanup manuel, aucun téléchargement nouveau)

Le scraper a, sur certaines pages Wix, récupéré des images qui sont thématiquement rattachées à un autre rayon que celui de la page scrapée. Les déplacements ci-dessous corrigent ce rangement — le contenu des images est identique à celui de marchedemo.com :

| Avant (scrape) | Après (rangement final) | Justification |
|---|---|---|
| `rayons/balkans-turques/legumes-surgeles.jpg` | `rayons/surgeles/legumes-surgeles.jpg` | Sachets de légumes surgelés → rayon Surgelé. |
| `rayons/balkans-turques/1f05a3c9….jpg` | `rayons/surgeles/vitrines-congelees.jpg` | Vitrines de congélateurs en grande surface → rayon Surgelé. |
| `rayons/produits-courants.jpg` (vitrines congelées, scrape initial) | remplacé par `rayons/epices-du-monde/caisse-au-supermarche.jpg` | La vitrine congélateurs ne représente pas les produits courants ; la scène de caisse/panier est bien plus fidèle à « discount du quotidien ». Le fichier `rayons/produits-courants/caisse-au-supermarche.jpg` est conservé pour traçabilité. |

### Rayons laissés en image statique (pas de slideshow)

3 rayons n'ont qu'**une seule image pertinente** côté Wix officiel après cleanup :

- `saveur-sud-amer` — 1 image (Unsplash fallback, cf. écart ci-dessus).
- `balkans-turques` — 1 image pertinente (Adana kebab). Les 2 autres images scrapées sur la page étaient en réalité des vitrines de congelés (déplacées vers `surgeles/`).
- `produits-courants` — 1 image pertinente (scène de caisse).

Pour activer un slideshow dessus, il faudrait soit (a) une session photo en magasin, soit (b) validation client pour utiliser des clichés Unsplash libres de droits.

### Licences

- **Wixstatic (marchedemo.com)** : réutilisation intra-entreprise (V2 du même
  site). Les images restent la propriété de Marché de Mo'.
- **Unsplash** : [licence Unsplash](https://unsplash.com/license) — libre pour
  usage commercial, attribution non requise mais recommandée (ci-dessus).
