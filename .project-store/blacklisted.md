# Blacklisted for Marche de Mo' V2

> Project-level ban list. For cross-project bans, see
> `db_store\blacklisted.md`. Append-only; seeded 2026-05-03 from
> `PROMPT-MAITRE.md` interdits and the archived dossier.

## Banned libraries

(none yet - project-specific library bans go here. Cross-project
library bans live in `db_store\blacklisted.md`.)

## Banned patterns

- **Modifying `PROMPT-MAITRE.md`** without an owner-signed ADR
  superseding ADR-007. The file is frozen reference material;
  treat it as read-only during ordinary sessions.
- **Dark-mode dominant** on any surface. Brand is light-only.
  OS `prefers-color-scheme: dark` is deliberately ignored per
  ADR-008. Individual dark sections (hero, promo ribbons) are
  fine; a site-wide dark theme is not.
- **Beige / cream / ocre** in the global palette. Explicit
  interdit in `PROMPT-MAITRE.md`.
- **Serif elegant fonts**. Filson Pro + Filson Soft cover every
  need. No added Google Font, no Adobe display serif, no "it's
  just for this one hero" exception.
- **A dedicated `/videos` page**. Explicit interdit in
  `PROMPT-MAITRE.md`. Videos live inside the rayons or home
  they are assigned to via `src/content/videos/*.json`.
- **"A suivre..." or placeholder copy** shipped to production.
  Explicit interdit. If a surface is not ready, hide it; do not
  fill it with stub text.
- **SPA with `#` anchors** as primary navigation. Multi-page
  with Astro View Transitions is the contract (ADR-009). Hash
  fragments are allowed only for skip-to-content and in-page
  jumps.
- **Coloured container around the logo**. Explicit interdit;
  pick the right logo variant per background instead (see
  `knowledge.md` logo rules).
- **Text added next to the logo**. Explicit interdit.
- **Manual injection of the Vercel Analytics beacon in
  `Layout.astro`**. The adapter already handles it (ADR-005).
  Double injection doubles the events.
- **Hardcoded business facts** (phone, email, address, SIREN,
  opening hours, store location) anywhere outside the
  source-of-truth modules (`src/lib/site.ts`). See L-2026-05-03-019.
- **A new remote image host** not listed in
  `astro.config.mjs -> image.remotePatterns`. Adding one means
  updating that allowlist AND verifying the host's licensing /
  attribution requirements.
- **New animation libraries** (GSAP, Framer Motion, etc.)
  before running W04.14 LIBRARY-SELECTION against the existing
  Layout.astro primitives. Consistency beats novelty in motion
  design on this brand.
- **Shipping a rayon leaf without a curated image** in
  `src/data/category-images.ts`. The leaf will be filtered out
  of the grid, which is correct; ship the image in the same PR.
- **Admin CRUD modal with a plain image-URL text field** when
  the inline uploader exists (ADR-017). The inline uploader
  writes to Supabase Storage `medias/<folder>/` and returns the
  public URL back into the form. A collapsed "coller une URL"
  section stays as a manual fallback, but the default surface
  is the drop-zone + picker.
- **Flat admin catalog** when the site exposes a
  Rayon -> Categorie -> Sous-categorie taxonomy. `/admin/produits`
  stays available as "tous les produits" mode, but the primary
  browse surface is `/admin/catalogue` with the tree matching
  the public routing (ADR-013). This is how the owner thinks
  about the store; the admin must match.
- **Admin list without click-to-sort column headers** once the
  list has more than 10 rows. Sort must be asc / desc / default
  with `aria-sort`, persisted in the URL (ADR-016).
- **Admin list with an `ordre` column and no drag handles**.
  The `ordre` value exists to be editable; a number input alone
  is cruel UX once there are more than 5 rows (ADR-015).
- **Unilateral price <-> percentage derivation**. In the promo
  form, editing any two of { prix_original, prix_promo,
  reduction_pct } must derive the third (ADR-014). Deriving
  only one direction produces stale discount displays.

## AI-tells to remove on sight

(Inherited from `db_store\blacklisted.md`. Project-specific
copy-tells will be added here as they surface. Key MdM-specific
additions:)

- **Marketing hyperbole in French** ("revolutionnaire", "unique
  au monde", "incroyable") in body copy. Brand voice is warm
  but factual.
- **Franglais** in user-facing copy ("booster vos ventes",
  "checker les promos"). French site, French copy. English
  terms only where the industry uses them (TikTok, live, etc.).

## Why each is banned (one-line justification)

- PROMPT-MAITRE modifications : frozen reference; changes need
  ADR + owner sign-off.
- Dark-mode dominant          : brand palette is light-only;
                                 waiver recorded in ADR-008.
- Beige / cream / ocre        : clashes with vert / rouge brand.
- Serif elegant fonts         : wrong brand register; Filson
                                 covers every case.
- `/videos` page              : explicit interdit; videos belong
                                 in their assigned rayon / home.
- Placeholder copy            : looks unfinished; hide instead.
- SPA with # anchors          : bad SEO / share-ability; use
                                 View Transitions.
- Logo container / added text : brand rule from PROMPT-MAITRE.
- Manual Vercel beacon        : adapter already injects (L-003).
- Hardcoded business facts    : sync drift is a customer-
                                 visible bug (L-019).
- Unlisted remote image host  : build rejects the URL; silent
                                 fallback is worse than a build
                                 failure.
- New animation libraries     : duplicate primitives, bundle
                                 bloat, brand-motion drift.
- Image-less rayon leaves     : breaks the grid visual.
- Plain URL image field       : forces the owner out of the
                                 modal when the uploader already
                                 exists (ADR-017).
- Flat admin catalog          : does not match the owner's
                                 mental model; public taxonomy
                                 is the source of truth (ADR-013).
- Unsortable list headers     : >10-row lists without sort are
                                 unusable (ADR-016).
- `ordre` with no drag handle : typing integers to nudge one row
                                 is cruel UX (ADR-015).
- One-way price derivation    : produces stale discount displays
                                 whenever % is edited (ADR-014).
