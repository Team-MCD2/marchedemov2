# Owner feedback register - Marche de Mo' V2

> Raw feedback from the owner (Mommy Jayce / Microdidact) on this
> project's work. Each entry must translate into at least one
> concrete rule, code change, lesson, or blacklisted/discarded
> entry. Owner-filled; Cascade does not pre-seed this file from
> chat transcripts (see cross-project `discarded.md`:
> "Blanket pre-seeding of boss-feedback.md / owner-feedback.md").

## Entry template

    ## YYYY-MM-DD  <feedback summary>
    - verbatim       : "..."
    - translated to  : rule in db.md / project knowledge /
                       blacklisted / discarded / ADR
    - status         : addressed / in-progress / deferred

## Entries

## D-2026-05-03 — nudge #2  (proceed, insist on max suggestions at all levels)

> procedd. i insist on as many suggestions (at all levels) as possible

Second doubled-down autonomy grant after Phase A was delivered. Owner
explicitly does NOT want me to stop at phase gates for smoke-tests;
instead, continue through B → C → D back-to-back, piling on as many
quality-of-life / UX / DA / a11y / security / robustness suggestions as
fit inside each phase.

Operating rule for the remainder of this block:

- only pause on unresolvable ambiguity or a blocking bug
- every phase must pack in at least 3 "bonus" improvements beyond the
  headline scope (keyboard shortcuts, undo toasts, density toggle,
  relative-time columns, saved views, etc.)
- deploy happens once at the end of D (or on any blocker)
- capture every added bonus in the log so nothing is invisible

## D-2026-05-03 — nudge #1  (reinforce "as many as possible")

## 2026-05-03  Admin dashboard - functional + UX/UI overhaul
- verbatim       : "there's huge work to do on the admin dashboard
                    and the admin's interface. interms of
                    functionlities, UX, UI, ease of use and much
                    more. here's the feedback:
                    les reduction doivent etre calculer
                    automatiquement - if i enter the prices, it
                    gives me the percentage and vice versa
                    quand on ajoute les articles et les promos, on
                    doit pouvoir televerser les images et on doit
                    pouvoir bouger l'ordre - drag n drop -
                    on doit pouvoir trier les articles et le
                    promos, descending and ascending order
                    au lieu d'afficher tout le catalogue, on doit
                    repliquer las meme structure que dans le site
                    arranger la DA du dashboard.
                    and all other sugestions that apply and as many
                    as possible. do the needful at all levels"
- translated to  :
    1. ADR-013 (to add) : admin must mirror the public site
       taxonomy (rayon -> categorie -> sous-categorie -> produits)
       rather than render a flat catalog.
    2. ADR-014 (to add) : in the promo form, prix_original /
       prix_promo / reduction_pct are bidirectionally linked -
       editing any two derives the third.
    3. ADR-015 (to add) : every list with an `ordre` field gets
       drag-and-drop reorder; persistence is one PATCH per moved
       row (or batch endpoint if list > 50).
    4. ADR-016 (to add) : list views support column-header sort
       (asc / desc) with aria-sort, persisted in the URL query.
    5. ADR-017 (to add) : image fields in CRUD modals use an
       inline uploader (drop-zone + picker) that stores into
       Supabase Storage `medias/<folder>/` and writes the public
       URL back to the row. Plain URL paste stays as a fallback.
    6. New roadmap phase A-D inserted ahead of existing Phase 1
       (React hydration). Admin work blocks no public-site bug,
       so admin runs first by daily-ops priority. Hydration
       fix can ship in parallel once admin Phase A is green.
    7. Project-level blacklisted addition : "shipping an admin
       form with a plain image-URL field when the inline upload
       UI is available" - banned going forward.
    8. Project-level discarded addition : "flat catalog admin
       layout" - rejected; replaced by the site-tree pattern.
- status         : in-progress (admin Phase A starting next).
