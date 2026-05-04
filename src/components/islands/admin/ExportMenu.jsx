import { useState } from "react";
import { rowsToCsv, downloadText, timestampedFilename } from "./exportRows.js";

/**
 * ExportMenu — split button that lets the admin export the current
 * (filtered) list as CSV or JSON.
 *
 * Both produits and promos share this component ; the caller passes
 * a `kind` ("produits" | "promos") to pick the right column set and
 * filename prefix. The CSV columns are aligned with what the existing
 * import drawer accepts so the export-edit-import loop is lossless.
 *
 * Design choices :
 *   - Tiny <details> for the dropdown (no portal, no library) so the
 *     menu closes on outside click via the browser's built-in
 *     summary/details semantics.
 *   - Filename includes a YYYYMMDD-HHMM stamp so multiple exports the
 *     same day don't overwrite each other in the Downloads folder.
 *   - Empty state : exporter is greyed out but the button stays
 *     visible so the action is discoverable.
 */
export default function ExportMenu({ rows, totalRows, kind = "produits" }) {
  const [open, setOpen] = useState(false);
  const empty = !rows || rows.length === 0;

  const columns = kind === "promos" ? PROMO_COLUMNS : PRODUIT_COLUMNS;

  function exportAs(format) {
    if (empty) return;
    const filename = timestampedFilename(kind, format);
    if (format === "csv") {
      const csv = rowsToCsv(rows, columns);
      downloadText(filename, csv, "text/csv");
    } else {
      /* JSON export is the inverse of the import drawer's `[{...}]`
       * format. We strip server-managed fields (id, created_at,
       * updated_at) so re-importing creates clean upserts by slug. */
      const slim = rows.map((r) => Object.fromEntries(
        columns.map((c) => [c.key, r[c.key] ?? null]),
      ));
      downloadText(filename, JSON.stringify(slim, null, 2), "application/json");
    }
    setOpen(false);
  }

  return (
    <details
      className="relative"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className={`list-none cursor-pointer px-4 py-2 rounded-full text-[13px] font-bold border-2 transition inline-flex items-center gap-1.5 ${
          empty
            ? "bg-white border-black/10 text-neutral-400 cursor-not-allowed"
            : "bg-white border-black/10 hover:border-vert hover:text-vert"
        }`}
        title={empty ? "Aucune ligne à exporter" : `Exporter ${rows.length} ligne(s)`}
        aria-disabled={empty || undefined}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Exporter
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {!empty && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-card border border-black/5 p-2 z-30">
          <p className="px-3 pt-1 pb-2 text-[10px] uppercase font-bold tracking-wider text-neutral-400">
            {rows.length === totalRows
              ? `${rows.length} ligne(s)`
              : `${rows.length} sur ${totalRows} (filtrées)`}
          </p>
          <button
            type="button"
            onClick={() => exportAs("csv")}
            className="block w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-creme"
          >
            <span className="font-bold">CSV</span>
            <span className="block text-[11px] text-neutral-500">Excel · Numbers · Sheets</span>
          </button>
          <button
            type="button"
            onClick={() => exportAs("json")}
            className="block w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-creme"
          >
            <span className="font-bold">JSON</span>
            <span className="block text-[11px] text-neutral-500">Réimportable tel quel</span>
          </button>
        </div>
      )}
    </details>
  );
}

/* Column sets — match what the import drawer accepts so a CSV export
 * round-trips through Excel / Sheets and back into the admin without
 * field-mapping drama. */

const PRODUIT_COLUMNS = [
  { key: "slug" },
  { key: "nom" },
  { key: "rayon" },
  { key: "categorie" },
  { key: "sous_categorie" },
  { key: "origine" },
  { key: "badge" },
  { key: "unite" },
  { key: "prix_indicatif" },
  { key: "image_url" },
  { key: "description" },
  { key: "actif" },
  { key: "ordre" },
];

const PROMO_COLUMNS = [
  { key: "slug" },
  { key: "titre" },
  { key: "rayon" },
  { key: "magasin" },
  { key: "prix_original" },
  { key: "prix_promo" },
  { key: "reduction_pct" },
  { key: "date_debut" },
  { key: "date_fin" },
  { key: "mise_en_avant" },
  { key: "image_url" },
  { key: "description" },
  { key: "actif" },
  { key: "ordre" },
];
