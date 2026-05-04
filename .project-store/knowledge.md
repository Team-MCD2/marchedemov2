# Project Knowledge - Marche de Mo' V2

> Project-scoped tips, conventions, and lessons for P-marche-de-mo-v2.
> Cross-project insight gets PROMOTED to `db.md` W04 / W06.
> Seeded 2026-05-03 from archive + live-repo scan.

## Conventions

- **`PROMPT-MAITRE.md` is frozen**. It is the source of truth for
  brand palette, fonts, DA rules, store list, rayon list, logo
  rules, interdits. Never modify without owner sign-off; cite it
  when a design decision is questioned.
- **Two DA layers** :
  1. GLOBAL - white + vert `#1C6B35` + rouge `#8B1919` + noir
     `#0F0F0F`. No dark mode. No beige / cream / ocre.
  2. CULTURAL - each `/rayons/<culturelle>` page carries its own
     palette (`data-rayon="saveurs-afrique"` on `<body>` + a CSS
     variable override in `src/styles/`). The global nav always
     stays in the global palette.
- **Typography** : Filson Pro + Filson Soft via Typekit. No serif
  elegante. Preconnect + stylesheet loaded in `Layout.astro`.
- **Logo rules** (from PROMPT-MAITRE) : breathing room around it,
  never in an added coloured container, never with extra text.
  Use the right variant per background:
  - fond blanc     -> `logo-marchedemo.png`
  - fond rouge     -> `logo-marchedemo-FDROUGE.png`
  - footer / bands -> `logo-marchedemo-rec.png` (with contour
    white on coloured bands : `-rec-contourwh.png`)
  - header global  -> `logo-marchedemo-rond-contourgreen.png`
  - favicon        -> `favicon-marchedemo.png`
- **Routing** : multi-page with Astro View Transitions, NOT SPA
  with `#` anchors (explicit interdit in PROMPT-MAITRE).
- **Admin** is gated by `ADMIN_PASSWORD` cookie; every admin
  route carries `Cache-Control: private, no-store` and
  `X-Robots-Tag: noindex, nofollow` (see `vercel.json`).
- **Source-of-truth modules** (never hardcode business facts):
  - `src/lib/site.ts`      - contact, hours, socials, brand copy
  - `src/lib/taxonomie.ts` - rayon tree + leaf rules
  - `src/data/category-images.ts` - curated images per leaf
  - `src/lib/faqs.ts`      - FAQ content, fed into JSON-LD
  - `src/lib/schema.ts`    - schema.org generators
- **Content collections** (Astro content) :
  - `src/content/promos/*.json`    - weekly promos
  - `src/content/videos/*.json`    - TikTok assignments
  - `src/content/postes/*.md`      - job offers
  - `src/content/articles/*.md`    - blog
  - `src/content/recettes/*.md`    - recipes
- **Canonical URL** : `https://marchedemov2.vercel.app`
  (NOT `marchedemo.vercel.app`). Source of truth is `site:` in
  `astro.config.mjs`; `PUBLIC_SITE_URL` env mirrors it.
- **Leaf category display** : a rayon leaf without a curated
  image in `src/data/category-images.ts` is FILTERED OUT of the
  grid. A leaf with zero products falls back to popular products
  with CTAs (`src/pages/rayons/[...path].astro`).

## Tips (T-* IDs)

- **T-mdm-animation-primitives** - every animation effect
  currently ships as a data-attribute primitive in
  `src/layouts/Layout.astro`: `.reveal`, `.reveal-left`,
  `.reveal-right`, `.reveal-scale`, `.reveal-blur`;
  `data-parallax="0.3"`, `data-tilt` / `data-tilt-max`,
  `data-split-reveal`, `data-magnetic`, `.scroll-progress`.
  Reuse these BEFORE inventing a new one; consistency trumps
  novelty in motion design.
- **T-mdm-rayon-empty** - when adding or renaming a rayon leaf,
  (a) add the rule in `src/lib/taxonomie.ts`, (b) mirror in
  `scripts/categorize-products.mjs`, (c) add a curated image to
  `src/data/category-images.ts`, (d) run the categorize script,
  (e) `npm run build`, (f) spot-check the rayon page. See
  archive `PB-categorize-products-marche-de-mo`.
- **T-mdm-prebuild-tiktok** - `npm run prebuild` runs
  `scripts/fetch-tiktok-thumbs.mjs` before every build. If
  TikTok rate-limits, the script must fail-soft with text
  fallbacks, NEVER with broken images.
- **T-mdm-postbuild-vercel** - `scripts/fix-vercel-runtime.mjs`
  runs post-build to normalise the Vercel output runtime.
  Treat it as part of the deploy pipeline; any change to
  `@astrojs/vercel` version must re-validate this script.
- **T-mdm-og-hero-fallback** - `Layout.astro` picks the og:image
  in this order: explicit `ogImage` prop > `heroImage` prop >
  default `logo-marchedemo-rond-contourgreen.png`. Pages with
  a hero photo should pass `heroImage` - free per-page og.
- **T-mdm-reveal-stagger** - put `data-reveal-stagger` on a
  parent and `.reveal` on its children to get auto-incrementing
  delays (step 80ms, cap 600ms). No per-child math required.
- **T-mdm-analytics-gate** - Vercel Web Analytics is OFF by
  default (`webAnalytics: { enabled: false }` in
  `astro.config.mjs`). Enabling requires: (1) toggle in Vercel
  dashboard, (2) flip to `enabled: true`, (3) redeploy. Inverse
  order = 404 per visitor on `/_vercel/insights/script.js`.

## Lessons (L-YYYY-MM-DD-NNN)

- **L-2026-05-03-MDM-001** - when a leaf card would render without
  an image, the entire rayon grid looks broken, not just that
  card. Filter image-less leaves out of the default view; fall
  back to popular products on empty leaves. Promoted to db.md
  L-2026-05-03-002.
- **L-2026-05-03-MDM-002** - duplicate slides in an infinite-scroll
  carousel need the `inert` attribute, not just `aria-hidden`,
  to be truly removed from tab order. Promoted to db.md
  L-2026-05-03-005.
- **L-2026-05-03-MDM-003** - the canonical site URL was initially
  `marchedemo.vercel.app`; switching to `marchedemov2.vercel.app`
  silently broke sitemap + canonical until every reference was
  synchronised (`.env.example`, `astro.config.mjs`, any og:url
  literal). Promoted to db.md L-2026-05-03-004.

## Open loops

- **P0** React hydration TypeError in `ChatMo.jsx` + `LocalVideoPlayer.jsx`
  on prod. See `roadmap.md` Phase 1.
- **P1** Performance baseline never measured. Roadmap Phase 2.
- **P2** More animations wanted at multiple UI levels, without
  overdoing. Roadmap Phase 4.
- Error sink (Sentry / LogTail) not wired.
- Favicon set incomplete (W04.15 T-must-favicons).
- `README.md` has null bytes / UTF-16 BOM (L-017).
- Cookie consent not yet implemented (W04.15 T-must-consent).

## Pointers

- Frozen brief : `PROMPT-MAITRE.md` at repo root.
- Deploy doc  : `DEPLOY.md` at repo root.
- Credits     : `CREDITS.md` at repo root.
