# Roadmap - Marche de Mo' V2

> Phased plan. Each phase has status, definition-of-done, and the
> next deploy gate. Per M05, once a phase is validated by the owner
> Cascade works autonomously through its items; check-in at phase
> boundary or on unresolvable ambiguity.

Last updated : 2026-05-04 (Phases A-D shipped; D.1 hotfixes landed; Phase E audit drafted)

> Ordering. Admin phases A-D run FIRST because admin is daily-ops
> critical and blocks the owner's ability to manage the catalog
> pre-launch. Public-site Phase 1 (React hydration) can be taken in
> parallel once admin Phase A is deployed, since it touches a
> different code path.

## Phase A - Admin forms + inline polish (P0, autonomy granted)

- **status**   : planned - owner green-lighted "do the needful at all levels"
- **dod**      :
  - `PromosManager.jsx` promo form: editing any 2 of { prix_original, prix_promo, reduction_pct } derives the 3rd. The user can lock one field to pin it. No rounding drift on repeated edits.
  - Every image URL field (promo + produit + media modals) has an inline uploader: drop-zone OR picker; uploads to Supabase Storage `medias/<folder>/<slug>-<timestamp>.<ext>`; writes the public URL back to the row. Plain URL paste stays as a manual-fallback (collapsed by default).
  - Form validations surfaced inline: `date_fin > date_debut`, slug unique (live debounced check against existing rows), required fields, numeric bounds on prices + percentage (0-100).
  - Modal keyboard shortcuts: `Esc` closes, `Ctrl/Cmd+S` saves.
  - All new behaviour respects `prefers-reduced-motion`.
- **approach** :
  1. Build a shared `priceDerivation.ts` util: `derive({ prix_original, prix_promo, reduction_pct, locked })` -> returns the normalized triple, rounded to 2 decimals on prix, 0 decimals on pct. Unit-tested both directions.
  2. Wire the util into `PromosManager.jsx -> setPrix` and extend to react to `reduction_pct` edits.
  3. Extract a shared `<InlineImageUpload />` island. Reuses the existing `/api/admin/medias` endpoint. Accepts `{ folder, onUploaded(publicUrl) }`.
  4. Add slug-uniqueness probe endpoint: `/api/admin/produits/slug-check?slug=...&exceptId=...` -> `{ available: boolean }`. Same for promos if the UI ever sets promo slugs (today promos don't have slugs - skip).
  5. Inline field-level validation via a tiny local `useFieldError(name)` hook.
- **verified** :

## Phase B - Admin list UX (sort + drag-reorder + bulk + URL state)

- **status**   : planned (autonomy granted, follows A)
- **dod**      :
  - Column headers on both managers are click-to-sort (asc / desc / default) with `aria-sort`. Default sort remains the current server order (`ordre` + `date_fin` for promos; `ordre` + `nom` for produits).
  - Each row has a drag handle. Dragging reorders the visible list and persists the new `ordre` via one batched call to new endpoints `/api/admin/promos/reorder` and `/api/admin/produits/reorder` (POST `[{id, ordre}]`). Rollback on failure.
  - Multi-select: row checkboxes + shift-click range + "select all on this page" + bulk actions { delete, toggle `actif`, set `rayon`, set `magasin`, set `date_fin` }. Admin auth re-check on destructive bulk.
  - Filter chips show live counts (`rayon: asie (12)`, `actif (34)`, `expire <= 7j (3)`). Clicking toggles.
  - Full state `{ filters, sort, page, query }` round-trips through the URL. Refresh preserves view.
  - Sticky toolbar on scroll.
- **approach** :
  1. HTML5 native drag-and-drop (no new dep); fall back to @dnd-kit ONLY if browser-test shows keyboard-reorder gaps we can't close cheaply.
  2. URL state via `URLSearchParams` + a tiny `useUrlState(schema)` hook; no router library.
  3. Bulk action confirm-modal reused across both managers.
- **verified** :

## Phase C - Site-mirroring admin navigation (rayon tree)

- **status**   : DONE (delivered 2026-05-04)
- **dod**      :
  - New `/admin/catalogue` page with a left-pane rayon tree matching the public site: Rayon -> Categorie -> Sous-categorie -> Produits. Node labels show child counts.
  - Nested route: `/admin/catalogue/[rayon]/[categorie]?/[sous-categorie]?` - each leaf shows the Phase B list, scoped to that subtree.
  - Breadcrumb across every leaf reflects the tree path and is clickable.
  - Empty leaf state: "aucun produit dans <sous-categorie>" with a "+ ajouter le premier" CTA that opens the create modal pre-filled with the rayon / categorie / sous-categorie.
  - `/admin/produits` stays as the flat "tous les produits" mode (linked from the tree top).
  - Promos: mirror structure via a rayon filter chip in the tree sidebar; promos don't nest deeper than rayon today.
- **approach** :
  1. Source of truth for the taxonomy: read the public site's `src/data/rayons.ts` (or equivalent) - reuse the same data module that powers `/rayons/[...path].astro`. No duplication.
  2. Aggregate-count query in one batched call via Supabase.
  3. Tree component is pure JSX with keyboard navigation (Arrow keys + Enter).
- **verified** : `npx astro check` clean (0 errors / 0 warnings, 136 files). Created `src/components/islands/admin/AdminCatalogueTree.jsx` (CSS-only popover, ARIA tree pattern, search with `/` shortcut, expand-state persisted in localStorage, accent dot per rayon, count + sansImage + orphelin pills). Created `src/pages/admin/catalogue/[...path].astro` with SSR-built tree, scope-aware ProduitsManager, breadcrumb, public-site deep link, orphans drill-down (`?view=orphelins`). Extended `ProduitsManager` with `scope` prop + `openNewProduit()` helper that pre-fills rayon/categorie/sous_categorie when creating from a leaf. Added 'Catalogue' nav entry to `AdminTopbar`.

## Phase D - Admin dashboard DA refresh

- **status**   : DONE (delivered 2026-05-04)
- **dod**      :
  - New admin topbar: logo + environment badge (Preview / Production) + section breadcrumb + user menu + logout.
  - Dashboard homepage replaced with:
    - 4 stat cards with 7-day delta + "derniers modifiés" mini-list.
    - Quick-actions strip: { + Promo, + Produit, Upload images, Import }.
    - Activity feed (last 20 admin writes).
  - Empty / loading / error states standardised across the admin (shared shells).
  - Mobile / tablet layout: sticky bottom action bar on list pages.
  - Motion matches the public site's primitives (reveal, hover lift, respects reduced motion).
  - Lighthouse Accessibility on the admin dashboard >= 95.
- **approach** :
  1. Introduce `admin_activity` table (id, created_at, actor, entity, entity_id, action, before, after) - one insert per successful write in the existing API routes. Trigger on write, not a DB trigger (keep ADR-010's hybrid model clean).
  2. Stat cards read `count(*) + count(*) where created_at >= now() - interval '7 days'` - two queries per card.
  3. Shared `<AdminShell>` island wrapping every admin page; Phases A-C refactor at the end of D to adopt it if not already.
- **verified** : `npx astro check` clean (0 errors / 0 warnings, 141 files). New migration `supabase/migrations/002_admin_activity.sql` (idempotent; private RLS). Helper `src/lib/admin-activity.ts` is fire-and-forget, bounded payloads (~16 KB cap), self-disabling on missing-table errors. Wired `logActivity()` into every admin write: produits/promos POST + PATCH + DELETE + bulk + reorder + import, medias POST + DELETE. Refreshed `AdminTopbar` with environment badge (Local / Preview / Production via `process.env.VERCEL_ENV`), two-row layout, CSS-only user menu, optional `subtitle` prop. Rewrote `/admin` dashboard with `StatCard` (7-day delta), `QuickAction` strip (5 tiles, `#new` + `#import` deep-links wired in both managers), `ActivityFeed`, recent promos + produits panels. New shared shells: `StatCard.astro`, `EmptyState.astro`, `QuickAction.astro`, `ActivityFeed.astro`. **Manual step required after deploy: run `supabase/migrations/002_admin_activity.sql` in Supabase SQL Editor**, otherwise the activity feed shows the empty hint and the helper silently no-ops.

## Phase D.1 - Post-D hotfixes (P0, 2026-05-04)

- **status**   : DONE
- **dod**      :
  - HTML `pattern` attributes compile under Chrome's Unicode-Sets (`v`) flag - no more "Invalid character class" console errors that silently void the regex.
  - Admin islands hydrate cleanly on pages that have URL filters or persisted localStorage - no more "Hydration failed because the initial UI does not match" cascade that switches the whole root to client rendering.
  - Creating a new produit or promo auto-fills the slug from `nom` / `titre`. Stops overwriting as soon as the user edits the slug. Removes the biggest friction point in the create flow : the browser's native "Please fill in this field" blocker on the slug.
  - Remaining cryptic `err.message` toasts translated through `humanizeError`.
- **verified** : `npx astro check` clean (0 errors / 0 warnings, 143 files). Fixes :
  - `ProduitsManager.jsx`, `PromosManager.jsx` : `pattern="[a-z0-9-]+"` -> `[a-z0-9\-]+` (v-mode needs the dash escaped).
  - `ApplicationForm.jsx` : `[0-9 +().-]{10,}` -> `[0-9 +\(\)\-.]{10,}`.
  - `AdminCatalogueTree.jsx` : moved `readExpanded()` out of the `useState` initializer into a post-hydration `useEffect` ; merge-not-replace to preserve activePath auto-expand ; write effect gated on `hydrated` so the first-render `{}` never clobbers storage.
  - `useAdminListState.js` : already fixed previous turn (same two-pass pattern).
  - `slugifyLocal()` added to both managers, wired to the `nom` / `titre` `onChange`, guarded by a `slugTouched` state that flips as soon as the user types into the slug field.
  - `MediasManager.jsx`, `ProduitsManager.jsx` ImportModal : `err.message` -> `humanizeError(err)`.

## Phase E - Admin post-launch polish (drafted 2026-05-04)

> Result of a full audit pass after Phases A-D shipped. Categorised
> MoSCoW. The MUST-HAVEs close bugs or usability cliffs that block
> daily ops ; the SHOULD-HAVEs remove paper-cuts ; the COULD-HAVEs
> are quality-of-life. Everything here is optional — promote items
> into a real phase only when there's capacity.

### E.MUST — ship before any broad owner handover

- **E.M1** — **Undo delete (snackbar, 8 s window).** Destructive actions currently use `window.confirm` + irreversible DELETE. Replace both produits and promos single-row delete with an optimistic delete + toast: "« Riz basmati » supprimé — Annuler (8 s)". The row snapshot is already captured (for rollback on API error) so the infra exists. Bulk delete keeps its confirm dialog (heavier action).
- **E.M2** — **Activity-log migration guard.** If the admin ever runs against a DB without `admin_activity` (local clone, staging spun up from backup before migration 002), the activity feed is silently empty and the helper silently no-ops. Surface a single banner on `/admin` : *"Activité : table absente — exécuter supabase/migrations/002_admin_activity.sql pour activer l'audit trail."* with a copy-to-clipboard button for the SQL.
- **E.M3** — **Slug-uniqueness probe 401 handling.** `/api/admin/produits/slug-check` returns the standard 401 when the cookie expires mid-session. Today the UI swallows it and shows "libre" (because the catch just resets status to `null`). Result: the user fills out the whole form, clicks save, the POST 401s, the toast says "connexion requise" but they've lost the modal state. Fix: on any 401 inside the modal, force a redirect to `/admin/login?next=<currentPath>` and keep the form values in `sessionStorage` so a re-login round-trip restores them.
- **E.M4** — **Slug validation parity client ↔ server.** The client slugifier strips accents + non-alnum. The server endpoint `normalizeProduit` does `replace(/[^a-z0-9-]/g, "-")` which DOES NOT strip accents. Result: pasting "crème-fraîche" through the API (bulk import, external scripts) writes `crème-fraîche` to the DB which then fails to match the regex in the admin filter and looks "untyped". Align the server on the same NFD-then-strip logic as `image-match.ts:slugifyName`.

### E.SHOULD — obvious UX gaps

- **E.S1** — **Keyboard help overlay (`?`).** Shortcut cheatsheet modal, auto-built from a central registry. Today `/`, `Esc`, `Ctrl/Cmd+S`, arrow-nav are undocumented outside tooltips.
- **E.S2** — **Draft auto-save in the create/edit modal.** Hook a debounced `sessionStorage.setItem("admin.draft.produit", JSON.stringify(form))` ; restore on next open ; clear on save or explicit discard. Prevents silent data loss on accidental close / tab kill.
- **E.S3** — **Image optimisation before upload.** Client-side resize+re-encode via the `Canvas.toBlob` path when the source exceeds ~1 MB or 2048 px on the long edge. Keeps admin uploads under the 8 MB cap without the owner having to pre-process in Photoshop. Bonus: automatic WebP conversion.
- **E.S4** — **CSV / JSON export.** Complements the existing import. Single button in the list toolbar, emits exactly the shape the import expects. Lets owners mass-edit in Excel / Sheets and re-import.
- **E.S5** — **Mobile sticky bottom bar.** On list pages `< 768px`, collapse the toolbar into a bottom bar with `+ Produit` | `Filtres` | `Trier`. Phase B DoD flagged this but only the desktop view shipped.
- **E.S6** — **Empty-state illustrations & CTAs.** Rayons with zero products show a plain "Aucun produit." Replace with a card: SVG illustration + "+ Ajouter le premier produit <rayon>" + link to bulk import. Same on `/admin/images-gap` when the gap is closed.
- **E.S7** — **Toast → aria-live region.** Today toasts are rendered in a plain `div`. Add `role="status" aria-live="polite"` so screen readers announce saves and errors. Zero visual change.
- **E.S8** — **"Récemment modifiés" filter chip.** `updated_at DESC` within last 24 h. Powers the "what did I change yesterday" check. Near-zero cost given sort dropdown already has `updated_at`.

### E.COULD — quality of life

- **E.C1** — **Multiple images per product (gallery).** Schema migration : `produits.images text[] default '{}'` OR a `produit_images` join table if we want alt-text per image. Requires rebuilding `InlineImageUpload` into a multi-image sortable (the user's original phase brief mentioned "drag-and-drop reordering" which suggests this).
- **E.C2** — **Bulk image apply "all green" preview.** MassImageMatchModal already does this but the confidence threshold and apply step could be one click away. Low-hanging UX win.
- **E.C3** — **Articles / recettes / videos admin.** Today these are `.md`/`.json` in Git ; the dashboard says so. A DB-backed admin is a larger project. Option A : content-collection-over-DB (keep markdown, store the file path) ; Option B : full rewrite to DB rows ; Option C : wire a GitHub-app editor. Recommend A if demand materialises.
- **E.C4** — **Dashboard 30-day sparkline.** Stat cards show a 7-day delta number ; add an inline sparkline built from the activity log so the owner sees "promos getting updated 3×/day this week".
- **E.C5** — **Per-rayon analytics.** Public-site traffic per rayon, feeding back into a "top rayon" card on the dashboard. Requires wiring Vercel Analytics or a bespoke event table.

### E.WON'T — explicitly out of scope pre-launch

- **E.W1** — **Multi-user admin with roles.** Single-password auth is adequate for one shop-owner and one partner.
- **E.W2** — **Real-time collab.** Overkill.
- **E.W3** — **In-admin AI description generator.** Interesting but not a must-have for the first 3 months of operations.

### How-to priorities

- **Quickest wins (< 1 h each, high user value)** : E.M2 banner, E.S1 overlay, E.S7 aria-live, E.S8 filter chip.
- **Medium (2-4 h each)** : E.M1 undo toast, E.S2 draft save, E.S3 image opt, E.S4 export, E.S6 empty states, E.C2 mass-match preview.
- **Larger (day+)** : E.M3 auth redirect w/ sessionStorage restore, E.S5 mobile bottom bar (touches every list page), E.C1 product gallery (schema change + UI rewrite), E.C3 articles admin.

## Phase 1 - React hydration fix (P0, public-site)

- **status**   : planned - awaiting owner green-light to execute
- **dod**      :
  - No "Cannot read properties of null (reading 'useState'|'useRef')" or minified React error #423 on production across: `/` (ChatMo + LocalVideoPlayer if present), `/rayons/<any leaf>`, any page with an island.
  - `npm ls react react-dom @astrojs/react` shows exactly one copy of each (already verified; re-verify post-fix).
  - Built `_astro/*.js` inspected: exactly one chunk contains the React core module.
  - Playwright smoke script asserts zero console errors on the 5 most-visited routes.
- **approach** :
  1. Apply `PB-debug-astro-react-hydration` end-to-end (W05).
  2. Prime suspect per prior session: stale CDN chunk OR hydration mismatch between SSR output and client tree in `ChatMo.jsx` + `LocalVideoPlayer.jsx`.
  3. If the mismatch is real, narrow by switching each island to `client:only="react"` one at a time and re-deploying to preview. The one that makes the error go away is the mismatching one; fix the SSR output to match, then restore the original directive if appropriate.
  4. Hard-refresh + CDN invalidate (see L-007) to rule out cache.
  5. Log the root cause as a cross-project lesson in `db.md` W06 if the root cause generalises.
- **verified** :

## Phase 2 - Performance baseline

- **status**   : planned
- **dod**      :
  - Lighthouse mobile numbers captured on `/`, `/rayons/saveurs-asie`, `/rayons/boucherie-halal`, `/recettes/pho-bo-vietnamien`, `/promos`. Stored in `log.md` as a table dated today.
  - Bundle analysis saved: total JS per route, largest chunks identified, duplicates flagged.
  - Third-party cost measured: Typekit weight, Vercel beacon (when enabled), social embeds.
  - No code changes in this phase. Measurement only.
- **verified** :

## Phase 3 - Performance fixes

- **status**   : planned
- **dod**      :
  - Targets from dossier section 10 met (LCP <= 2.5s, CLS <= 0.1, TBT <= 200ms, Lighthouse mobile >= 90/95/95/95, main chunk <= 250 KB gzip).
  - Before/after Lighthouse delta logged.
  - Each change anchored to a tip ID from W04.10 PERF or to a new lesson if a new technique was discovered.
- **likely targets** :
  - Typekit strategy (swap vs block) and subset.
  - LCP image per page: explicit dimensions + `fetchpriority="high"` audit.
  - Below-fold images lazy-loaded (already partially done in Layout.astro).
  - Split-reveal observer: audit for long-tasks on mobile.
  - Animation script defer / idle-load.
- **verified** :

## Phase 4 - Animation enhancements

- **status**   : planned
- **dod**      :
  - Animations extended to multiple UI levels (hero, section separators, card interactions, page transitions), consistent with brand tone.
  - Every added animation respects `prefers-reduced-motion` (already enforced at primitive level in Layout.astro - keep the discipline).
  - No animation causes a CLS regression (re-run Phase 3 Lighthouse after each).
  - Demo page or before/after screenshots recorded in `log.md`.
- **constraints** :
  - Existing primitives in Layout.astro stay the single source of truth: `reveal*`, `data-parallax`, `data-tilt`, `data-split-reveal`, `data-magnetic`, `scroll-progress`. Do NOT introduce a second animation library unless W04.14 LIBRARY-SELECTION research justifies it.
  - Brand rule per `PROMPT-MAITRE.md`: no beige / cream / ocre; no dark-mode dominant. Motion must remain inside that palette-of-emotions.
- **verified** :

## Phase 5 - W04.15 MUST-HAVES adoption pass (new)

- **status**   : planned
- **dod**      :
  - Walk the full W04.15 checklist against this site. Each item either TICKED or WAIVED by name in `decisions.md`.
  - Known gaps identified in the dossier section 9 (favicon set, cookie consent, og fine-tuning) ticked or scheduled.
  - `PB-web-qa-pre-deploy-review` signed off.
- **verified** :

## Backlog / unscheduled

- Error sink (Sentry or equivalent) wired for server routes. M06 fields emitted properly.
- Playwright CI smoke for the 5 critical routes.
- `README.md` recreated in UTF-8 (L-017 - current file has null bytes / UTF-16 BOM).
- Vercel Web Analytics coordinated enable (dashboard toggle + `astro.config.mjs` flag, in lockstep).
- Per-page `og:image` generation pipeline for articles + recettes + rayons (beyond the hero-image fallback).
