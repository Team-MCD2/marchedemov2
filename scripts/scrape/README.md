# scripts/scrape — Pipeline catalogue produits

Pipeline de scraping **étape 8 du plan** pour enrichir le catalogue produits.
Toutes les sorties sont **versionnées git** pour reproductibilité et
l'idempotence (ré-exécution = pas d'effets de bord).

## Sources par priorité

| # | Source | Type | Deps | Légal | Volume estimé |
|---|--------|------|------|-------|----------------|
| 1 | **OpenFoodFacts** | API REST publique | 0 (fetch natif) | CC-BY-SA | ~200–400 produits |
| 2 | **Wixstatic (marchedemo.com)** | Scraper HTML | 0 (fetch + regex) | Propre contenu client | ~40 images HD |
| 3 | Grand Frais / Carrefour / Auchan | Playwright | +200Mo | À évaluer (robots.txt) | Optionnel |

## Flow

```
┌──────────────────┐     ┌──────────────────────┐
│ openfoodfacts.mjs│────▶│ data/produits-off.json│
└──────────────────┘     └──────────────────────┘
                                    │
┌──────────────────┐     ┌──────────────────────┐
│ scrape-wixstatic │────▶│ public/images/rayons/ │
│       .mjs (existant)│ └──────────────────────┘
└──────────────────┘                │
                                    ▼
                         ┌──────────────────────┐
                         │ data/produits-starter│
                         │       .json (manuel) │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   merge-sources.mjs  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  data/produits-all   │
                         │       .json          │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  seed-produits.mjs   │
                         │  (upsert Supabase)   │
                         └──────────────────────┘
```

## Exécution

```bash
# 1. OpenFoodFacts (premier run ~2 min)
node ./scripts/scrape/openfoodfacts.mjs

# 2. Merge toutes les sources
node ./scripts/scrape/merge-sources.mjs

# 3. Seed Supabase
node --env-file=.env.local ./scripts/seed-produits.mjs
```

## Licences et attribution

- **OpenFoodFacts** : données CC-BY-SA 3.0, images CC-BY-SA 3.0 (auteur
  variable selon produit). L'URL de l'image pointe vers les serveurs OFF
  en production — pas de copie locale nécessaire. Attribution dans
  `CREDITS.md`.
- **Wixstatic** : assets du client Marché de Mo', droits d'usage complets.
