/**
 * FilterChip - small pill used in the "active filters" strip above
 * admin tables. Click X to remove the filter.
 *
 * Props
 * -----
 *   label    : string | ReactNode   what the filter matches.
 *   onRemove : () => void           remove the filter.
 *   tone     : "default" | "sort"   default = neutral; sort = accent.
 */
export default function FilterChip({ label, onRemove, tone = "default" }) {
  const toneCls =
    tone === "sort"
      ? "bg-vert/10 text-vert-dark"
      : "bg-white border border-black/10 text-neutral-700";
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-[12px] font-bold ${toneCls}`}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${typeof label === "string" ? label : ""}`}
        className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
