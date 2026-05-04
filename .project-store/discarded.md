# Discarded ideas for Marche de Mo' V2

> Project-scope graveyard. For cross-project discards see
> `db_store\discarded.md`. Append-only; seeded 2026-05-03 from the
> archived dossier's "key decisions" + prior-session context.

## Entry template

    ## <Idea (one line)>
    - tried on      : YYYY-MM-DD
    - why rejected  : the actual constraint that killed it
    - alternative   : what we did instead (link an ADR / tip / lesson)

## Discarded ideas

## Canonical site URL at `marchedemo.vercel.app`
- tried on      : early-2026 (pre-rewrite)
- why rejected  : the production domain is `marchedemov2.vercel.app`.
                  Keeping the V1 hostname in canonical / sitemap /
                  og:url silently split the SEO signal between the
                  two domains.
- alternative   : canonical source of truth is `site:` in
                  `astro.config.mjs`; `PUBLIC_SITE_URL` env mirrors
                  it. See ADR-001 and cross-project lesson
                  L-2026-05-03-004.

## Manual Vercel Web Analytics beacon in Layout.astro
- tried on      : early-2026 (pre-rewrite)
- why rejected  : the `@astrojs/vercel` adapter already injects the
                  beacon when `webAnalytics.enabled` is true.
                  Manual injection doubled the events and doubled
                  the script weight.
- alternative   : configure analytics ONLY in `astro.config.mjs`.
                  See ADR-005 and cross-project lesson
                  L-2026-05-03-003.

## Rendering rayon leaves without a curated image
- tried on      : early-2026
- why rejected  : a rayon grid with some image-less cards looks
                  broken as a whole. Users judged the entire rayon
                  "unfinished".
- alternative   : filter image-less leaves out of the default
                  grid; `src/data/category-images.ts` is the
                  whitelist. Empty leaves fall back to popular
                  products with CTAs. See ADR-002, ADR-003, and
                  cross-project lesson L-2026-05-03-002.

## Aria-hidden alone on cloned infinite-carousel slides
- tried on      : early-2026
- why rejected  : `aria-hidden` alone did not remove the cloned
                  slides from tab order across all browsers.
                  Keyboard users tabbed into invisible copies.
- alternative   : `inert` (which implies aria-hidden) on every
                  clone. See ADR-006 and cross-project lesson
                  L-2026-05-03-005.

## Adding GSAP / Framer Motion / Lottie for the Phase 4 animation pass
- tried on      : not executed - considered 2026-05-03 while
                  planning Phase 4.
- why rejected  : Layout.astro already ships 6 animation
                  primitives (reveal, parallax, tilt, split-reveal,
                  magnetic, scroll-progress) as data-attribute
                  APIs. Adding a library would duplicate most of
                  them, inflate bundle size, and fragment the
                  brand-motion language.
- alternative   : extend the existing primitives first; introduce
                  a library ONLY if W04.14 LIBRARY-SELECTION
                  research against the gap justifies it.

## A `/videos` dedicated page
- tried on      : not executed - considered during content-
                  strategy discussions.
- why rejected  : explicit interdit in `PROMPT-MAITRE.md`. Videos
                  derive meaning from the rayon / home context
                  they are assigned to; a "videos dump" page
                  strips that context.
- alternative   : videos live in `src/content/videos/*.json` with
                  an `assignment` (rayon slug or "home") and
                  surface inside the assigned page via
                  `LocalVideoPlayer.jsx` / `TikTokEmbed.jsx`.

## Flat `/admin/produits` as the primary admin browse surface
- tried on      : V2 pre-rewrite (still shipping 2026-05-03 at
                  the time of this entry).
- why rejected  : the public site is organised as Rayon ->
                  Categorie -> Sous-categorie. The owner thinks
                  about the store that way too. A flat table
                  forced a cognitive re-mapping on every edit
                  and did not scale past ~100 SKUs.
- alternative   : `/admin/catalogue` with a rayon tree sidebar
                  and nested routes. The flat list survives as
                  a "tous les produits" fallback mode. See
                  ADR-013 and roadmap Phase C.

## Plain image-URL text field in admin CRUD modals
- tried on      : V2 pre-rewrite (still shipping 2026-05-03 at
                  the time of this entry).
- why rejected  : the owner had to navigate away to
                  `/admin/medias`, upload, copy the public URL,
                  come back, paste. Six clicks for one image.
                  Meanwhile the drag-drop uploader already
                  existed - it was just not wired into the
                  CRUD forms.
- alternative   : shared `<InlineImageUpload />` island reused in
                  every form that stores an image URL. One drop
                  or one click. See ADR-017 and roadmap Phase A.

## One-way price-to-percentage derivation in the promo form
- tried on      : V2 pre-rewrite (still shipping 2026-05-03 at
                  the time of this entry).
- why rejected  : owners negotiate deals in either direction -
                  "30% off" OR "nouveau prix a 4,99 EUR". The
                  form derived `reduction_pct` from prices but
                  ignored percentage edits, so the displayed
                  discount went stale the moment the owner
                  typed a %.
- alternative   : shared `priceDerivation.ts` util driving a
                  three-way bidirectional link with an optional
                  lock. See ADR-014 and roadmap Phase A.

## Typed integer input as the primary way to edit `ordre`
- tried on      : V2 pre-rewrite.
- why rejected  : nudging one row by one position required
                  typing two integers; swapping two rows
                  required four edits. The `ordre` column was
                  effectively read-only in practice.
- alternative   : drag-handle per row with HTML5 native DnD +
                  batched reorder endpoint. Keyboard-only users
                  get `Alt+ArrowUp/Down`. See ADR-015 and
                  roadmap Phase B.

## Admin list without click-to-sort column headers
- tried on      : V2 pre-rewrite.
- why rejected  : the owner could filter ("rayon: asie") but
                  not ask "which of these expires soonest".
                  Past 15 rows, a list without sort is a visual
                  dump.
- alternative   : click-to-sort headers with `aria-sort`, URL
                  persistence via `?sort=col&dir=desc`. See
                  ADR-016 and roadmap Phase B.
