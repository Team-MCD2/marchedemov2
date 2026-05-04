/**
 * BulkActionsBar - sticky bottom bar shown when N>0 rows are selected.
 *
 * Props
 * -----
 *   count    : number           selected row count.
 *   onClear  : () => void       clear selection callback.
 *   actions  : Action[]         { label, tone?, icon?, onClick, disabled? }
 *                                tone: "default" | "primary" | "danger"
 *
 * The bar auto-hides when count = 0. Keyboard: Esc clears selection.
 * aria-live="polite" announces selection count changes.
 */
export default function BulkActionsBar({ count, onClear, actions = [] }) {
  if (!count || count <= 0) return null;

  return (
    <div
      role="region"
      aria-label="Actions groupées"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-noir text-white rounded-full shadow-2xl pl-5 pr-2 py-2 flex items-center gap-3"
    >
      <span className="text-[13px] font-bold whitespace-nowrap">
        {count} s&eacute;lectionn&eacute;{count > 1 ? "s" : ""}
      </span>
      <div className="hidden sm:block h-5 w-px bg-white/20" />
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {actions.map((a, i) => {
          const tone = a.tone || "default";
          const base =
            "px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition disabled:opacity-50";
          const toneCls =
            tone === "primary"
              ? "bg-vert text-white hover:bg-vert-dark"
              : tone === "danger"
              ? "bg-rouge text-white hover:bg-rouge/90"
              : "bg-white/10 text-white hover:bg-white/20";
          return (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={`${base} ${toneCls}`}
              title={a.title ?? a.label}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer la s\u00e9lection (Esc)"
        title="Effacer la s\u00e9lection (Esc)"
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
