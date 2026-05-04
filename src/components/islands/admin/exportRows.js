/**
 * exportRows — tiny CSV/JSON export helpers for the admin list views.
 *
 * Companion to the existing import flow in `ProduitsManager.jsx` and
 * `PromosManager.jsx` : the CSV emitted here is shaped exactly so the
 * import drawer can ingest it back unchanged. That round-trip is the
 * point — owners want to mass-edit in Excel / Sheets / Numbers.
 *
 * Behaviour
 * ---------
 *   - CSV uses RFC-4180-ish quoting: every cell is wrapped in double
 *     quotes ; embedded `"` are doubled. Comma is the separator (matches
 *     the importer's auto-detect priority).
 *   - First line is a header derived from the `columns` array.
 *   - JSON is plain `JSON.stringify(rows, null, 2)`.
 *   - Triggers a browser download via a transient <a download> ; cleans
 *     up the object URL on next tick.
 */

/**
 * @param {string} value
 */
function csvCell(value) {
  if (value == null) return '""';
  const s = String(value);
  /* Escape doubled-quotes ; quote everything (cheaper than checking
   * for special chars and getting the rules wrong on edge cases like
   * embedded newlines or NBSP). */
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<{ key: string, header?: string }>} columns
 * @returns {string}
 */
export function rowsToCsv(rows, columns) {
  const headerLine = columns.map((c) => csvCell(c.header ?? c.key)).join(",");
  const bodyLines = rows.map((r) =>
    columns.map((c) => csvCell(r?.[c.key] ?? "")).join(","),
  );
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}

/**
 * Trigger a browser download for the given text payload.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 */
export function downloadText(filename, content, mimeType) {
  if (typeof window === "undefined") return;
  /* Prepend a UTF-8 BOM for CSV so Excel on Windows opens accents
   * correctly without the user picking encoding manually. */
  const isCsv = mimeType.startsWith("text/csv");
  const payload = isCsv ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  /* Firefox needs the anchor in the DOM to honour the download
   * attribute reliably. */
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * @param {string} prefix - e.g. "produits"
 */
export function timestampedFilename(prefix, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.${ext}`;
}
