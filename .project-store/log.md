# Project Log - Marche de Mo' V2

> Append-only. One entry per working session. Full detail.
> Project-store seeded 2026-05-03.

## D-2026-05-03  Project store bootstrap + roadmap snapshot

- **context**     : owner directed a cross-project db_store rewrite
                    and then a project-by-project local-store
                    buildout. MarcheDeMoV2 was identified as the
                    active web project with no existing
                    `.project-store\`. Owner also requested adding
                    a "must-have functionalities + tips" discipline
                    to `db.md`, which Cascade captured as the THE
                    TWO BASELINES pair-of-rules (W00 point 11) and
                    the new W04.15 MUST-HAVES sub-chapter.
- **actions**     :
  - Reconciled the archived MdM-V2 dossier
    (`db_store\archived\db-pre-rewrite-2026-05-03.md` lines
    514-720) against the live repo - zero drift against
    `package.json`, `astro.config.mjs`, `vercel.json`,
    `.env.example`, `PROMPT-MAITRE.md`.
  - Created this project store per M08 schema (9 files).
  - Seeded `dossier.md`, `roadmap.md`, `knowledge.md`,
    `decisions.md` (ADR-001..012) by porting the archive +
    reconciling with the current codebase.
  - Added stub entry for P-marche-de-mo-v2 in `db.md` W07.
  - Added L-2026-05-03-025 to `db.md` W06 on the MUST-HAVES
    discipline.
  - `boss-feedback.md` and `owner-feedback.md` left as empty
    templates; owner fills them after review (per a new
    cross-project `discarded.md` entry).
- **learnings**   :
  - Archive-driven dossier creation (option C in the session
    decision list) beat fresh re-derivation by ~20 min and
    preserves decisions.
  - The MdM-V2 codebase already ships the W04.15 NAVIGATION and
    COMMUNICATION baseline items; the gap-shaped items are:
    favicon set (partial), cookie consent (absent), UTF-8
    `README.md` (null-byte broken), per-page og for articles
    / recettes (currently hero-image fallback only).
- **next session**:
  - await owner feedback on this store + db.md additions.
  - on green-light, execute roadmap Phase 1 (React hydration
    fix) per `PB-debug-astro-react-hydration`.
  - log the outcome + any cross-project lesson back to
    `db.md` W06.

## D-2026-05-03 (continued)  Admin dashboard feedback + Phases A-D seeded

- **context**     : owner returned with a concrete feedback block
                    targeting the admin dashboard. Verbatim
                    captured in `owner-feedback.md` entry
                    "2026-05-03 Admin dashboard - functional +
                    UX/UI overhaul". Five core asks:
                    (1) bidirectional auto-calc of promo prices
                    vs. percentage, (2) image upload with
                    drag-reorder inside the CRUD modals,
                    (3) click-header sort asc / desc on lists,
                    (4) replicate the public site rayon tree in
                    the admin, (5) refresh the dashboard DA.
                    Closed with "do the needful at all levels"
                    which Cascade reads as autonomy granted
                    through the phase boundary.
- **actions**     :
  - Surveyed the admin surface area before editing anything:
    - `src/pages/admin/{index,promos,produits,medias,login}.astro`
    - `src/components/islands/admin/{PromosManager,ProduitsManager,MediasManager,MassImageMatchModal,ProductImageSearchModal,ImportModal}.jsx`
    - `src/pages/api/admin/{promos,produits,medias,login,logout}/*.ts`
    - `src/components/admin/AdminTopbar.astro`
    - `src/lib/supabase.ts`, `src/lib/auth.ts`
  - Confirmed what already exists (don't rebuild):
    - `setPrix` in `PromosManager.jsx` already derives
      `reduction_pct` from the two prices (one-way only).
    - `MediasManager.jsx` already has drag-drop uploads into
      the `medias` Storage bucket via `/api/admin/medias`.
    - `ordre` columns exist on both promos and produits with
      full API coverage.
  - Confirmed what is missing (to build):
    - Reverse direction of the price derivation (% -> prix).
    - Inline image upload INSIDE the CRUD modals (not a
      separate page).
    - DnD row reorder UI on lists.
    - Click-header sort with `aria-sort` + URL persistence.
    - Admin navigation that mirrors the public rayon tree.
    - Refreshed topbar / stats / activity feed.
  - Appended ADR-013 through ADR-017 to `decisions.md` covering
    each decision produced by the feedback.
  - Inserted Admin Phases A-D into `roadmap.md` ahead of the
    existing public Phase 1 (React hydration), per the rule
    that admin blocks daily ops pre-launch.
  - Updated `.project-store\blacklisted.md` with 2 new bans:
    flat admin catalog + plain URL image field.
  - Updated `.project-store\discarded.md` with the rejected
    flat-admin-layout + plain-URL-image-field alternatives.
- **learnings**   :
  - Surveying before proposing saved at least 2 invented
    features (the drag-drop upload + the `ordre` columns were
    already there). Confirms the discipline from L-2026-05-03-025
    and the "ground the plan in reality" step of the owner's
    trusted loop.
  - The public site already exposes a clean taxonomy module;
    the admin tree must read from it, not duplicate it. One
    more instance of L-019 (source-of-truth modules).
- **next session**:
  - present the plan to the owner, get phase-boundary
    green-light, then execute Phases A -> B -> C -> D
    autonomously with a deploy after each.
  - React hydration (old Phase 1) can be picked up in parallel
    once admin Phase A is deployed - different code path.

## D-2026-05-03 (continued-2)  Phase A executed

- **context**     : owner response "do the needful at all levels /
                    as many as possible" treated as autonomy
                    grant through the phase boundary. Phase A of
                    the admin roadmap executed end-to-end.
- **actions**     :
  - Created `src/lib/priceDerivation.ts` - pure util for three-way
    bidirectional derivation across `prix_original` /
    `prix_promo` / `reduction_pct`. Includes a `lastEdited`
    history and a `locked` set so the user can pin any subset
    of the three. Rounding: prix -> 2 dec, pct -> integer.
    Safeguards against divide-by-zero (pct = 100) and negative
    pct (clamped to [0, 99]).
  - Created `src/lib/__tests__/priceDerivation.test.mjs` - 9
    assertions covering bidirectional derivation, locks,
    rounding stability, and edge cases. Not yet wired to a
    test runner (repo has no test script); documents intent
    and will be picked up when the test-runner gap closes.
  - Created `src/components/islands/admin/InlineImageUpload.jsx`
    - shared drop-zone + picker island. Uploads to
    `POST /api/admin/medias` with `upsert=1` and an optional
    `renameTo` filename hint. Collapsed "coller une URL"
    fallback for power-users. `aria-live="polite"` status
    line, keyboard accessible, Enter-to-apply on the URL
    fallback, onError hides broken preview thumbs.
  - Created `src/pages/api/admin/produits/slug-check.ts` -
    admin-only GET endpoint returning
    `{ slug, available: boolean, reason? }`. Validates format
    server-side (`/^[a-z0-9-]+$/`). Supports `exceptId` for
    edit flows. Cheap indexed lookup via service_role.
  - Edited `src/components/islands/admin/PromosManager.jsx`:
    - added imports for `useEffect` / `useRef`, the new
      `InlineImageUpload` island, and `derivePrices` util.
    - `EditModal` gained `lastEdited` + `locked` state, a
      `formRef`, date-range validation, and Esc / Ctrl+S
      keyboard shortcuts.
    - `setPrix` now routes through `derivePrices` and
      preserves the user's raw typed value on the edited
      field (avoids the "1." -> "1" snap bug).
    - the plain image-URL `Field` was replaced by
      `<InlineImageUpload folder="promos" ... />`.
    - the three price inputs now render as a new
      `PriceField` helper with an inline lock toggle
      (SVG lock / unlock).
    - date_fin input shows a live "must be after date_debut"
      error with `aria-invalid` + `aria-describedby`, and the
      submit button is disabled when validation fails.
  - Edited `src/components/islands/admin/ProduitsManager.jsx`:
    - added `useEffect` + `InlineImageUpload` imports.
    - `EditModal` gained `slugStatus` + `slugChecking` state,
      a debounced (350 ms) probe to
      `/api/admin/produits/slug-check?slug=...&exceptId=...`,
      a `formRef`, and Esc / Ctrl+S keyboard shortcuts.
    - slug input shows an inline "libre" / "pris" / "..."
      status pill and colours the border vert / rouge.
      submit is disabled while slug is conflicting or of
      invalid format.
    - plain image-URL `Field` replaced by
      `<InlineImageUpload folder="produits" ... />`.
- **verification**:
  - `npx astro check` -> 0 errors, 0 warnings on the Phase A
    files (19 pre-existing hints elsewhere, none introduced
    by this work).
  - Dev server boots clean on port 4321.
  - UI smoke-test pending owner verification.
- **learnings**   :
  - `type="number"` React inputs silently rewrite their
    string state to the util's numeric normalization; that
    eats mid-typing characters like "1.". Fix: keep the
    user's raw `e.target.value` on the edited field; only
    apply numeric normalization to the DERIVED siblings.
    Captured as a project-specific tip candidate.
  - Node 22.x supports `--experimental-strip-types` which
    could power a 10-line `npm run test:lib` script for the
    priceDerivation tests with zero devDep added. Parked as
    a Backlog item.
- **next session**:
  - Get owner smoke-test sign-off on Phase A.
  - On green-light: Phase B (sort headers + DnD reorder +
    bulk + URL-persisted state).
