import { useEffect, useState } from "react";

/**
 * KeyboardHelpOverlay — global "?" cheatsheet for the admin.
 *
 * Mounted once per admin page (via AdminTopbar) so every screen has
 * the same discoverability for keyboard navigation. The list itself
 * is intentionally short and consistent across screens — anything
 * truly screen-specific belongs in inline tooltips, not here.
 *
 * Open : "?" (or "Shift + /" on most layouts)
 * Close : "Escape", click backdrop, click ✕
 *
 * The component refuses to open while the user is typing into an
 * input / textarea / contenteditable so power users can keep typing
 * "?" inside the description field without surprise modals.
 */
export default function KeyboardHelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function isTyping(target) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (target.isContentEditable) return true;
      return false;
    }
    function onKey(e) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen((cur) => !cur);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-help-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        /* Click on the backdrop closes ; clicks inside the panel are
         * stopped by the inner onClick stopPropagation. */
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-black/5 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 id="kb-help-title" className="font-soft font-bold text-[18px]">
            Raccourcis clavier
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer (Échap)"
            className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="p-6 space-y-5">
          <Section title="Navigation">
            <Row keys={["?"]} label="Ouvrir / fermer cette aide" />
            <Row keys={["Échap"]} label="Fermer modale ou aide" />
            <Row keys={["/"]} label="Focus sur la barre de recherche" />
          </Section>

          <Section title="Listes (produits / promos)">
            <Row keys={["n"]} label="Nouveau produit / nouvelle promo" />
            <Row keys={["r"]} label="Mode réorganisation" />
            <Row keys={["↑", "↓"]} label="Naviguer entre les rangs (en mode réorg.)" />
          </Section>

          <Section title="Modale d'édition">
            <Row keys={["Ctrl", "S"]} altKeys={["⌘", "S"]} label="Enregistrer" />
            <Row keys={["Échap"]} label="Annuler / fermer" />
          </Section>

          <Section title="Arborescence catalogue">
            <Row keys={["↑", "↓"]} label="Rang précédent / suivant" />
            <Row keys={["→"]} label="Déplier la branche" />
            <Row keys={["←"]} label="Replier la branche" />
            <Row keys={["Entrée"]} label="Ouvrir la page de la branche" />
            <Row keys={["Début", "Fin"]} label="Premier / dernier rang" />
          </Section>
        </div>

        <footer className="px-6 py-3 border-t border-black/5 bg-creme/50 text-[11px] text-neutral-500 sticky bottom-0">
          Astuce : tapez <Kbd>?</Kbd> n'importe où (sauf dans un champ de texte) pour rouvrir cette aide.
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

function Row({ keys, altKeys, label }) {
  return (
    <li className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-neutral-700">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-300">+</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
        {altKeys && (
          <span className="ml-1 flex items-center gap-1 text-neutral-400">
            <span>·</span>
            {altKeys.map((k, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>+</span>}
                <Kbd subtle>{k}</Kbd>
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

function Kbd({ children, subtle }) {
  return (
    <kbd
      className={`inline-block min-w-[1.5rem] text-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono border ${
        subtle
          ? "bg-neutral-50 border-neutral-200 text-neutral-500"
          : "bg-noir text-white border-noir"
      }`}
    >
      {children}
    </kbd>
  );
}
