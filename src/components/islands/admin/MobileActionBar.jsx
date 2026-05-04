/**
 * MobileActionBar — bottom-fixed action bar for admin list pages on
 * viewports < 768 px.
 *
 * Rationale
 * ---------
 * The desktop sticky-top toolbar (search, filters, sort, + Nouveau)
 * is ergonomic on large screens but pushes the table content too far
 * down on phones — every scroll trip hides the primary action. A
 * thumb-reachable bottom bar with the 3 highest-traffic actions fixes
 * that :
 *   - `+ Nouveau`   → opens the create modal (passed via `onNew`)
 *   - `Filtres`     → scrolls the top toolbar into view so the user
 *                     can use the native selects ; no parallel UI.
 *   - `Trier`       → same as Filtres — one source of truth for the
 *                     filter/sort controls.
 *
 * Kept deliberately small : no popovers, no bottom-sheet, no new
 * mental model. Mobile users just get a faster path to the buttons
 * that already exist at the top of the page.
 *
 * Shown only below `md` (Tailwind ≥ 768 px hides it).
 *
 * Props
 *   label       : string  — the "+" button label ("Nouveau produit", etc.)
 *   onNew       : () => void
 *   filterCount : number  — badge on the Filtres button
 *   toolbarId?  : string  — target element id for "Filtres / Trier" scrolls.
 *                           Defaults to scrolling to document top.
 */
export default function MobileActionBar({
  label = "Nouveau",
  onNew,
  filterCount = 0,
  toolbarId,
}) {
  function scrollToToolbar() {
    const el = toolbarId ? document.getElementById(toolbarId) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      /* Focus the first input inside the toolbar so a screen-reader
       * / keyboard user lands where they expect. */
      const focusable = el.querySelector("input, select, button");
      if (focusable instanceof HTMLElement) {
        /* timeout so the scroll finishes before focus — otherwise
         * iOS re-scrolls to centre the focused input. */
        setTimeout(() => focusable.focus({ preventScroll: true }), 300);
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Actions rapides"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-black/10 px-3 py-2 flex items-center gap-2"
      /* `pb-safe` bumps padding-bottom for devices with home-indicator
       * notches (iPhone). Uses a CSS custom property we set below. */
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <button
        type="button"
        onClick={scrollToToolbar}
        aria-label="Filtres et recherche"
        className="relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-full text-[12px] font-bold bg-white border border-black/10 hover:border-noir transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Filtres
        {filterCount > 0 && (
          <span
            aria-label={`${filterCount} filtre(s) actif(s)`}
            className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rouge text-white text-[10px] font-bold flex items-center justify-center"
          >
            {filterCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={scrollToToolbar}
        aria-label="Trier"
        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-full text-[12px] font-bold bg-white border border-black/10 hover:border-noir transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h13M3 12h9M3 18h5M17 4v16m0 0-3-3m3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Trier
      </button>
      <button
        type="button"
        onClick={onNew}
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-[12px] font-bold bg-vert text-white hover:bg-vert-dark transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {label}
      </button>
    </div>
  );
}
