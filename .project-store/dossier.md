# Project Dossier - Marche de Mo' V2

> The big-picture document for P-marche-de-mo-v2. Updated in place,
> not re-written. Seeded 2026-05-03 per option C (archive port +
> live-repo reconciliation). Archive source:
> `db_store\archived\db-pre-rewrite-2026-05-03.md` lines 514-720.

## 1. Identity

- **name**        : Marche de Mo' V2
- **owner**       : Mommy Jayce (Microdidact)
- **client**      : MARCHE DE MO' (SIREN 924 841 471 / SIRET 924 841 471 00012 / RCS Toulouse)
- **directeur**   : Samir Ouaddaha
- **siege**       : 6 Place Wilson, 31000 Toulouse
- **repo path**   : `C:\Users\Mommy Jayce\Desktop\Microdidact\MarcheDeMoV2`
- **live url**    : https://marchedemov2.vercel.app (canonical - NOT marchedemo.vercel.app)
- **stack**       : Astro 4.16.10, React 18.3.1 islands, Tailwind 3.4, Supabase v2.104, Vercel (hybrid), Playwright. Node 22.
- **status**      : ACTIVE - roadmap Phase 1 open (React hydration fix).
- **positioning** : Plus grand supermarche ethnique d'Occitanie.
- **stores**      :
  - Portet-sur-Garonne - 8 Allee Pablo Picasso (1 200 m2, 600 places)
  - Toulouse Sud - Cepiere - 5 rue Joachim du Bellay (1 200 m2, 600 places)
- **hours**       : Lun-Jeu 8h30-20h30; Ven 8h30-13h + 14h-21h; Sam 8h30-21h; Dim 8h30-13h
- **contact**     : 05 82 95 82 52 / contact@marchedemo.com
- **socials**     : Facebook / Instagram / LinkedIn / TikTok (URLs in `src/lib/site.ts`)

## 2. Architecture

- **Astro hybrid output**. Static by default; SSR for `/admin` and `/api/*` via the Vercel adapter.
- **React islands** for interactive pieces only: `ChatMo.jsx`, `LocalVideoPlayer.jsx`, `TikTokEmbed.jsx`, `ApplicationForm.jsx`, plus the `admin/` island tree.
- **Tailwind + custom Typekit** (Filson Pro / Filson Soft) instead of self-hosted fonts. Palette locked to vert `#1C6B35`, rouge `#8B1919`, noir `#0F0F0F`, blanc `#FFFFFF`.
- **Two design layers** per `PROMPT-MAITRE.md`:
  1. Global DA - white / green / red / black, no dark mode, no beige.
  2. Cultural DA - each `/rayons/<culturelle>` page carries its own palette (saveurs-afrique, saveurs-asie, saveur-mediterranee, saveur-sud-amer, balkans-turques).
- **10 rayons** (`/rayons/<slug>`) with central taxonomy in `src/lib/taxonomie.ts` and curated images in `src/data/category-images.ts`. Leaf categories without a curated image are filtered out; empty leaves fall back to popular products.
- **Content sources** (file-based, under `src/content/`):
  - `promos/*.json`     - promos de la semaine
  - `videos/*.json`     - TikTok embeds per rayon / home
  - `postes/*.md`       - offres d'emploi
  - `articles/*.md`     - blog
  - `recettes/*.md`     - recettes (ex: pho-bo-vietnamien)
- **Supabase backend** - promos / produits / medias synchronised via `src/lib/promos-repo.ts`, `produits-repo.ts`, `produits-vedettes.ts`. Client wrapped in `src/lib/supabase.ts`.
- **Layout** (`src/layouts/Layout.astro`) centralises: SEO head (title, description, canonical, og/twitter cards, JSON-LD), View Transitions, ChatMo island on every page, scroll-progress bar, scroll-reveal observer, parallax / tilt / split-reveal / magnetic-CTA animation script.
- **Admin** (`/admin/*`) protected by `ADMIN_PASSWORD` cookie secret, served with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow` (see `vercel.json`).

## 3. Environment contract

Source : `.env.example` (UTF-8, committed) - never commit a real `.env.local`.

Server-side (no prefix):

| Name                       | Purpose                                        |
|---|---|
| `ADMIN_PASSWORD`           | Gate for `/admin`. Set in Vercel dashboard.    |
| `ADMIN_COOKIE_SECRET`      | Session cookie secret (>=32 random chars).     |
| `BREVO_API_KEY`            | Newsletter (Brevo) API key.                    |
| `BREVO_LIST_ID`            | Brevo list id for the public newsletter.       |
| `CONTACT_TO_EMAIL`         | Destination for `/service-client` + `/recrutement` form submissions. |
| `RESEND_API_KEY`           | Transactional email via Resend.                |
| `SUPABASE_URL`             | Supabase project URL.                          |
| `SUPABASE_ANON_KEY`        | Anon JWT, safe for public read under RLS.      |
| `SUPABASE_SERVICE_ROLE_KEY`| Service-role key (SERVER ONLY, bypasses RLS).  |

Public (exposed to client):

| Name               | Purpose                                         |
|---|---|
| `PUBLIC_SITE_URL`  | Canonical site URL (sitemap, canonical, og:url, RSS). Source of truth is `site:` in `astro.config.mjs`; this mirrors it. |

Hard rules:
- Trim every env var at module boot. See `PB-env-var-boot-validation`.
- Missing / malformed env THROWS at import time, never warn-and-fallback (L-009).
- Vercel UI can paste trailing newlines - re-paste each value (Save -> Edit -> re-Save) until no `%0A` appears in any query string (L-008).
- `SUPABASE_SERVICE_ROLE_KEY` ONLY on Vercel, ONLY for server routes (`/admin`, `/api/*`). NEVER exposed to the client.

## 4. Schema / Data map

File-based collections (under `src/content/`) are the canonical source for editorial content. Supabase hosts dynamic / transactional data.

Supabase (names TBC - confirm with `src/lib/produits-repo.ts`):
- `articles`  - shared product catalog used by rayons and the admin CMS.
- `promos`    - curated weekly promos surfaced on home + rayons.
- `videos`    - TikTok / local video references assigned to rayons.
- `medias`    - generic media objects referenced by the content files.

Remote image hosts allowlisted in `astro.config.mjs` (`image.remotePatterns`):
`static.wixstatic.com`, `images.unsplash.com`, `images.openfoodfacts.org`, `cdn.auchan.fr`, `www.grandfrais.com`. Audit trail (avr. 2026): openfoodfacts 349 refs, auchan 8, grandfrais 1.

Taxonomy source : `src/lib/taxonomie.ts` + rules in `scripts/categorize-products.mjs`. Rule order matters, first match wins. New leaves need a curated image in `src/data/category-images.ts` or they are filtered from the rayon grid.

## 5. Deployment runbook

Target : Vercel (git-integrated, hybrid output via `@astrojs/vercel/serverless`).

Steps for a normal release:
1. `git status` clean on `main`.
2. `npm run build` locally - confirm no TS errors, no build warnings, `.vercel/output/` generated.
3. Inspect `.vercel/output/static/_astro/*.js` for unexpected duplicates (two React cores = hydration bug waiting to happen, see L-001 / `PB-debug-astro-react-hydration`).
4. Commit, push. Vercel builds on push via git integration.
5. In Vercel Dashboard > Settings > Environment Variables: re-verify each env var for BOTH Production and Preview. Re-paste values to purge trailing whitespace.
6. Post-deploy smoke:
   - Open in incognito. DevTools > Application > Service Workers > Unregister. Clear site data. Hard reload.
   - Check canonical tag, `sitemap.xml`, `robots.txt`, og:image, Vercel beacon absent (Analytics is disabled - see ADR-012 in `decisions.md`).
   - Hit `/`, `/rayons/<leaf>`, `/admin` (login), `/api/*` (expected 401/403 without auth).
7. Log the outcome in this project's `log.md`.

Rollback : Vercel "Promote to Production" on the previous successful build. Do NOT re-deploy the bad commit; tag a fix and redeploy.

## 6. Role matrix

| Role            | Access                                 | Expected experience |
|---|---|---|
| anonymous       | all public pages, forms, content       | full public site.   |
| admin (cookied) | `/admin/*`, POST to `/api/admin/*`     | CMS for promos + videos. `noindex, nofollow`. |

No multi-tenancy; there is one admin. When a second role is added, update this matrix BEFORE shipping the UI (L-014 prevention rule).

## 7. SEO baseline (web)

- `<title>`, `<meta name="description">`, `<link rel="canonical">` per page via `Layout.astro` props.
- `<meta property="og:*">` + `<meta name="twitter:*">` with 1200x630 default og:image; explicit `og:image` prop per page when a hero photo exists (rayons, recettes, actus).
- `<link rel="preconnect">` for Typekit, `<link rel="preload">` for the header logo (every page) and the heroImage when provided.
- JSON-LD: FAQPage injected automatically from `faqItems`, Organization / LocalBusiness / Offer / etc. passed via `schema` prop per page.
- `robots.txt` + `sitemap.xml` served at root; sitemap plugin filters `/admin` paths.
- `lang="fr"` on `<html>`. `og:locale=fr_FR`.
- Vercel Web Analytics is DISABLED by default (`webAnalytics: { enabled: false }` in `astro.config.mjs`) to avoid the `/_vercel/insights/script.js` 404 per visitor before the dashboard toggle is flipped. Enable in lockstep with the dashboard setting (see `DEPLOY.md`).
- Canonical URL source of truth: `site: 'https://marchedemov2.vercel.app'` in `astro.config.mjs` (ADR-001).

## 8. Observability

- Vercel runtime logs for SSR routes (`/admin`, `/api/*`).
- No formal error sink (Sentry / LogTail) wired yet - OPEN LOOP.
- `console.error` in server routes is captured by Vercel; M06 error fields should be emitted there.
- No Playwright CI smoke - `playwright` is installed but only used via local `scripts/capture-mobile-home.mjs`.

## 9. Open loops and risks

- **P0 - React hydration TypeError** in `ChatMo.jsx` and `LocalVideoPlayer.jsx` on production ("Cannot read properties of null (reading 'useState')" / minified React error #423). Single React copy confirmed in `_astro` chunks. Hypotheses: stale CDN chunk cached in browser OR hydration mismatch between SSR output and client component. Playbook: `PB-debug-astro-react-hydration`. See roadmap Phase 1.
- **P1 - Performance baseline never measured**. Fonts, assets, and pages are reported-as-slow but without Lighthouse numbers we are guessing. See roadmap Phase 2.
- **P2 - Animation richness**. Layout.astro already ships reveal / parallax / tilt / split-reveal / magnetic-CTA primitives; owner wants more, at multiple UI levels, without overdoing. See roadmap Phase 4.
- **Error sink** not yet configured. M06 fields emitted to `console.error` only.
- **README encoding**: `README.md` contains null bytes / UTF-16 BOM (L-017). Recreate as plain UTF-8 before adding project content.
- **Brand icon set**: favicon uses `logo-marchedemo.png` only; missing 32x32 + 180x180 (apple-touch-icon) + 192/512 maskable pair per W04.15 T-must-favicons.
- **Cookie consent** banner not yet present; EU traffic + analytics (once enabled) will require it per W04.15 T-must-consent.
- **Vercel Web Analytics** deliberately disabled until dashboard toggle is flipped; coordinate with the owner before enabling to avoid the 404 window.

## 10. KPIs

To be defined once Phase 2 perf baseline is captured. Provisional targets (W04.10):
- Lighthouse mobile - Performance >= 90, Accessibility >= 95, Best Practices >= 95, SEO >= 95.
- LCP <= 2.5s on 4G mid-range device.
- CLS <= 0.1.
- TBT <= 200ms.
- Main JS chunk <= 250 KB gzip.

---

**Change log for this dossier**
- 2026-05-03 - seeded from archive + live-repo reconcile; no drift found against `package.json`, `astro.config.mjs`, `vercel.json`, `.env.example`, `PROMPT-MAITRE.md`.
