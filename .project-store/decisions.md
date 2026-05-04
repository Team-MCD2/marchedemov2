# Architecture Decision Records - Marche de Mo' V2

> Each decision is small, numbered, and dated. Record context,
> decision, consequences. Never rewrite a decision - if it is
> superseded, add a new ADR that references the old.
> Seeded 2026-05-03 from the archived dossier's "key decisions"
> section + the brand rules in `PROMPT-MAITRE.md`.

## ADR-001  Canonical site URL is `marchedemov2.vercel.app`          [STATUS: active]
- context      : early builds referenced `marchedemo.vercel.app`; the production domain moved to `marchedemov2.vercel.app` but residual references lived in copy, sitemap, og:url.
- decision     : canonical source of truth is `site:` in `astro.config.mjs`. `PUBLIC_SITE_URL` env mirrors it. All canonical / og:url / sitemap / RSS references derive from `site:`.
- consequences : any domain change requires: (1) update `site:`, (2) update `PUBLIC_SITE_URL` in Vercel env (Production + Preview), (3) redeploy. See cross-project lesson L-2026-05-03-004.

## ADR-002  Empty leaf categories fall back to popular products    [STATUS: active]
- context      : some rayon leaves have zero matching products, which would render a bare empty grid.
- decision     : in `src/pages/rayons/[...path].astro`, if the leaf has no products, surface the popular-products grid with clear "aucun produit dans cette categorie, voici ce qui plait" copy + CTAs.
- consequences : leaf pages never look broken; users always have a next action; a SKU catalog refresh cannot degrade the UX. See cross-project L-2026-05-03-002.

## ADR-003  Leaf cards without a curated image are hidden          [STATUS: active]
- context      : mixing cards with / without images makes the whole rayon section look incomplete.
- decision     : `src/data/category-images.ts` is the whitelist. Leaves not present are filtered OUT of the default grid.
- consequences : adding a new leaf requires shipping a curated image in the same PR. Enforced in the `T-mdm-rayon-empty` tip.

## ADR-004  Cache policy in `vercel.json`                          [STATUS: active]
- context      : public assets should cache long, admin / api must not cache, robots / sitemap should pick up changes fast.
- decision     :
  - `/images`, `/logos`, `/videos`    -> 30 days + stale-while-revalidate
  - `/icons`                           -> 1 year immutable
  - `/favicon.png`                     -> 30 days
  - `/robots.txt`                      -> 1 hour
  - `/api/*` and `/admin/*`            -> `private, no-store`
  - global security headers on `/(.*)` -> HSTS 2y + preload, X-CTO nosniff, X-Frame SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking camera / microphone / geolocation / interest-cohort.
- consequences : first visit to an admin surface never sees a stale bundle; static assets survive Vercel redeploys.

## ADR-005  Vercel Web Analytics injected by the adapter only      [STATUS: active]
- context      : injecting the beacon manually in `Layout.astro` while the adapter also injects it doubles events and doubles the script cost. See cross-project lesson L-2026-05-03-003.
- decision     : analytics is configured once, in `astro.config.mjs` via `vercel({ webAnalytics: { enabled: ... } })`. `Layout.astro` contains only a comment pointing to this.
- consequences : enabling / disabling analytics is a one-config-file change.

## ADR-006  Duplicate carousel slides carry `inert`, not just aria-hidden [STATUS: active]
- context      : infinite-scroll clones kept keyboard focus reachable, which tabbed users into invisible copies.
- decision     : cloned slides receive `inert` (which also implies aria-hidden).
- consequences : keyboard + screen-reader tab order matches visible content. See cross-project lesson L-2026-05-03-005.

## ADR-007  `PROMPT-MAITRE.md` is a frozen reference               [STATUS: active]
- context      : brand, palette, DA rules, legal identity, store addresses, rayon list, logo variants and interdits must stay stable across sessions.
- decision     : `PROMPT-MAITRE.md` at repo root is frozen. Cascade NEVER modifies it; it cites it when a design trade-off is questioned. Changes happen ONLY via an owner-driven ADR superseding this one.
- consequences : any apparent conflict between a design request and `PROMPT-MAITRE.md` pauses the work and surfaces the conflict to the owner, rather than quietly overriding one or the other.

## ADR-008  No dark-mode dominant; brand is light-only             [STATUS: active]
- context      : brand palette (white + vert + rouge + noir) was designed for light backgrounds. `PROMPT-MAITRE.md` lists "pas de dark mode dominant" in interdits.
- decision     : site stays light-only. Individual surfaces MAY use dark sections (hero, promos) per the brand, but there is no OS-preference dark variant. This is the explicit WAIVER of W04.15 `T-must-theme-os`.
- consequences : `prefers-color-scheme: dark` is intentionally ignored. Waiver recorded here so W04.15 adoption-check accepts the gap.

## ADR-009  No SPA with `#` anchors                                [STATUS: active]
- context      : SPA-style `#section` routing was considered for internal navigation. `PROMPT-MAITRE.md` lists "pas de SPA avec ancres `#`" in interdits.
- decision     : multi-page routing with Astro View Transitions. Every anchor is a full page with its own URL, title, og, canonical.
- consequences : better SEO, better share-ability, slightly more routing code to maintain. Hash-fragments are allowed only for in-page jumps (e.g. skip-to-content), never as primary navigation.

## ADR-010  Hybrid output mode (SSG default, SSR for admin / api)  [STATUS: active]
- context      : most pages are editorially static; `/admin` needs server-side auth; `/api/*` needs server routing.
- decision     : `output: 'hybrid'` in `astro.config.mjs`. Pages default to pre-rendered; `/admin/*` and `/api/*` are explicitly SSR via `export const prerender = false`.
- consequences : public pages are CDN-cacheable and fast; admin / api run serverless on Vercel. Canonical URL discipline (ADR-001) is critical because pre-rendered pages bake the canonical at build time.

## ADR-011  ChatMo island uses `client:idle`                       [STATUS: active - re-evaluate in Phase 1]
- context      : ChatMo is present on every page via `Layout.astro` but is not critical to first paint.
- decision     : `client:idle` - hydrates after the browser is idle, after LCP.
- consequences : LCP is protected; ChatMo is available within ~500ms of idle. If Phase 1's hydration investigation points at a timing issue, revisit with `client:only="react"` or `client:visible`.

## ADR-012  Vercel Web Analytics disabled by default               [STATUS: active]
- context      : enabling analytics in `astro.config.mjs` before flipping the dashboard toggle produces `/_vercel/insights/script.js` 404 per visitor.
- decision     : keep `webAnalytics: { enabled: false }` until the dashboard toggle is on, THEN flip to `true` in a coordinated deploy.
- consequences : zero analytics until deliberately enabled. When enabled, must also add a cookie-consent banner if any non-essential cookie is set (W04.15 `T-must-consent`).

## ADR-013  Admin mirrors the public site taxonomy                 [STATUS: active - implement in Phase C]
- context      : flat `/admin/produits` catalog does not scale once the SKU count grows and forces the owner to re-learn where items live. The public site already organises everything as Rayon -> Categorie -> Sous-categorie.
- decision     : `/admin/catalogue` is a tree view driven by the same data module that powers `/rayons/[...path].astro`. Nested routes `/admin/catalogue/[rayon]/[categorie]?/[sous-categorie]?` surface the scoped product list. The flat page stays as "tous les produits" mode.
- consequences : editing a product is now one click per level, matching the owner's mental model. The taxonomy becomes a single source of truth - a public-site rayon rename auto-propagates to the admin with no separate migration.

## ADR-014  Bidirectional price / percentage derivation in promo form [STATUS: active - implement in Phase A]
- context      : today `PromosManager.setPrix` computes `reduction_pct` from the two prices but ignores pct edits. The owner edits any of the three depending on how the deal was negotiated (supplier quotes % off, or fixed "nouveau prix", or both).
- decision     : the three fields { prix_original, prix_promo, reduction_pct } are linked via a shared `priceDerivation.ts` util. Editing any two derives the third. The user can optionally lock one field to pin it. Rounding: prix -> 2 decimals, pct -> integer. Unit tests cover both directions.
- consequences : no more silent mismatch between the displayed discount and the actual prices. The util is reusable outside the promo form if a future "set -X%" bulk action is added.

## ADR-015  Drag-and-drop reorder on every list with an `ordre` column [STATUS: active - implement in Phase B]
- context      : `ordre` is already persisted for promos and produits but only editable via a plain number input, which forces the owner to type integers to nudge a single item.
- decision     : every admin list with an `ordre` column gets a drag-handle per row. Reorder triggers a batched POST to `/api/admin/<entity>/reorder` with `[{id, ordre}]`. Rollback on failure. Below 50 rows the reorder is purely client-side until persist; above 50, paginate and reorder within the page.
- consequences : reordering a top-10 promo list becomes a 1-second action instead of a 15-second one. The `ordre` field stays server-of-truth; the UI is just a friendlier editor. Keyboard-only reorder is supported via the same handles (`Alt+ArrowUp/Down`).

## ADR-016  List-view sort is click-header, asc/desc, URL-persisted [STATUS: active - implement in Phase B]
- context      : the current lists expose filter chips but no column sort. The owner needs "newest first", "most discounted first", "expiring soonest", etc.
- decision     : every list column that is sortable shows a click-to-sort header with `aria-sort` set to `ascending` / `descending` / `none`. The sort (`?sort=<column>&dir=<asc|desc>`) persists in the URL alongside existing filters + pagination + search so that refresh / bookmark / share all round-trip.
- consequences : the list is now shareable ("send me the link to your 10-most-expiring promos") and the state survives reload. The URL schema becomes part of the admin contract and must be respected by future list pages.

## ADR-017  Image fields use an inline uploader, plain URL is fallback [STATUS: active - implement in Phase A]
- context      : today the promo + produit modals ask the owner to paste a public image URL. The drag-drop uploader already exists in `MediasManager.jsx` but is gated behind a separate navigation step.
- decision     : every admin form field that stores a public image URL is replaced by a shared `<InlineImageUpload />` island that (a) shows a drop-zone + picker, (b) uploads to Supabase Storage `medias/<folder>/<slug>-<timestamp>.<ext>` via `/api/admin/medias`, (c) writes the public URL back to the form. A collapsed "coller une URL" section stays as manual fallback.
- consequences : the owner never leaves the modal to attach an image. Filename normalisation (via the existing `slugifyFilename`) stays the single source of truth. Shipping an admin form with a plain image-URL field when the inline uploader exists is now project-banned (see `.project-store\blacklisted.md`).
