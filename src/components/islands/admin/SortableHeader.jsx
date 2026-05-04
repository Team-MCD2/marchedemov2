/**
 * SortableHeader - accessible <th> that toggles sort on click.
 *
 * Props
 * -----
 *   field      : string                      column identifier.
 *   label      : string | ReactNode          visible label.
 *   sort       : { field: string, dir: "asc" | "desc" }
 *   onSort     : (field, dir) => void
 *   align      : "left" | "right" | "center" (default "left")
 *   className  : extra classes.
 *
 * Behaviour
 * ---------
 *   - First click on a column = sort asc.
 *   - Subsequent click on same column = flip dir.
 *   - Adds `aria-sort` = "ascending" | "descending" | "none".
 *   - Arrow indicator is visible when active, faint when not.
 *   - Enter / Space on the inner button toggles sort (focusable).
 */
export default function SortableHeader({
  field,
  label,
  sort,
  onSort,
  align = "left",
  className = "",
}) {
  const isActive = sort?.field === field;
  const dir = isActive ? sort.dir : null;
  const ariaSort = !isActive ? "none" : dir === "asc" ? "ascending" : "descending";

  function handle() {
    if (!isActive) onSort(field, "asc");
    else onSort(field, dir === "asc" ? "desc" : "asc");
  }

  const alignCls =
    align === "right" ? "text-right justify-end" : align === "center" ? "text-center justify-center" : "text-left";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 font-bold ${className}`}
    >
      <button
        type="button"
        onClick={handle}
        className={`inline-flex items-center gap-1.5 ${alignCls} w-full hover:text-noir transition`}
      >
        <span>{label}</span>
        <span
          className={`inline-flex flex-col leading-none ${isActive ? "text-noir" : "text-neutral-300"}`}
          aria-hidden="true"
        >
          <svg
            className={`w-2.5 h-2.5 -mb-0.5 ${isActive && dir === "asc" ? "text-vert" : ""}`}
            viewBox="0 0 10 6"
            fill="currentColor"
          >
            <path d="M5 0 10 6H0z" />
          </svg>
          <svg
            className={`w-2.5 h-2.5 ${isActive && dir === "desc" ? "text-vert" : ""}`}
            viewBox="0 0 10 6"
            fill="currentColor"
          >
            <path d="M5 6 0 0h10z" />
          </svg>
        </span>
      </button>
    </th>
  );
}
