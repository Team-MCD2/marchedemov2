import { useEffect, useRef, useState } from "react";
import { adminFetch } from "./adminFetch.js";

/**
 * ProductImageSearchModal
 * -----------------------
 * Admin helper modal that queries the OpenFoodFacts search endpoint
 * (`/api/admin/produits/image-search`) with a free-form query — by
 * default pre-filled with the product's name — and lets the admin
 * pick an image. Selection PATCHes the product row via the existing
 * `/api/admin/produits/[id]` endpoint, then bubbles the updated
 * product up through `onSaved` so the parent list can refresh without
 * a full reload.
 *
 * Props :
 *   produit         — the target product (must contain `id`, `nom`,
 *                     `slug`, and any existing `image_url`).
 *   onCancel()      — close the modal without applying anything.
 *   onSaved(updatedProduit)
 *                   — called after a successful PATCH. Parent should
 *                     replace its local copy with `updatedProduit`.
 *   onToast(level, message)
 *                   — optional helper to surface status toasts. Level
 *                     is one of "info" | "success" | "error".
 *
 * Notes :
 *   - Free-form OFF search is noisy; we surface attribution prominently
 *     so admins remember they are reusing CC-BY-SA imagery.
 *   - Images are loaded lazily with a neutral fallback when OFF's CDN
 *     rejects the hot-link.
 */
export default function ProductImageSearchModal({
  produit,
  onCancel,
  onSaved,
  onToast,
}) {
  const [query, setQuery] = useState(() => (produit?.nom ?? "").trim());
  const [results, setResults] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(/** @type {string | null} */ (null));
  const [saving, setSaving] = useState(/** @type {string | null} */ (null));
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const abortRef = useRef(/** @type {AbortController | null} */ (null));

  /* Auto-search on mount with the product's name so the modal is
     instantly useful — matches the admin's expectation of "open, pick,
     done" for images of staple items. */
  useEffect(() => {
    if (query) runSearch(query);
    /* Focus the search field so the admin can refine typing immediately. */
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(q) {
    const trimmed = String(q || "").trim();
    if (!trimmed) {
      setResults([]);
      setErr("Saisissez un terme de recherche.");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr(null);
    setHasSearched(true);
    try {
      const url = new URL("/api/admin/produits/image-search", window.location.origin);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("pageSize", "16");
      const res = await adminFetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErr(e?.message ?? "Échec de la recherche");
      setResults([]);
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setLoading(false);
    }
  }

  async function applyImage(candidate) {
    if (!produit?.id) {
      setErr("Produit non enregistré en base (pas d'id).");
      return;
    }
    setSaving(candidate.code || candidate.imageUrl);
    setErr(null);
    try {
      const res = await adminFetch(`/api/admin/produits/${produit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: candidate.imageUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const updated = payload?.produit ?? { ...produit, image_url: candidate.imageUrl };
      onToast?.("success", `Image associée à « ${produit.nom} »`);
      onSaved?.(updated);
    } catch (e) {
      setErr(e?.message ?? "Échec de l'enregistrement");
      onToast?.("error", `Échec : ${e?.message ?? "erreur inconnue"}`);
    } finally {
      setSaving(null);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    runSearch(query);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-6">
      <div className="w-full max-w-4xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-soft font-bold text-[20px] truncate">
              Chercher une image
            </h2>
            <p className="text-[12px] text-neutral-500 mt-0.5 truncate">
              pour <strong>{produit?.nom ?? "—"}</strong> · source OpenFoodFacts (CC-BY-SA)
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={onSubmit} className="px-6 pt-4 pb-3 border-b border-black/5 flex gap-2">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. riz basmati parfumé, dattes medjool, pois chiches…"
            className="flex-1 px-4 py-2 border border-black/10 rounded-full text-[14px] bg-creme focus:outline-none focus:border-vert"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
                </svg>
                Recherche…
              </>
            ) : (
              "Chercher"
            )}
          </button>
        </form>

        {/* Current image preview */}
        {produit?.image_url && (
          <div className="px-6 py-3 flex items-center gap-3 bg-creme border-b border-black/5">
            <img
              src={produit.image_url}
              alt=""
              className="w-10 h-10 object-cover rounded-lg ring-1 ring-black/5"
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
            <p className="text-[12px] text-neutral-500">
              Image actuelle — cliquez sur un résultat pour la remplacer.
            </p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {err && (
            <div className="mb-4 bg-rouge/5 border border-rouge/20 text-rouge rounded-2xl p-3 text-[13px]">
              <strong>Erreur :</strong> {err}
            </div>
          )}

          {loading && results.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl bg-creme animate-pulse"
                />
              ))}
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && !err && (
            <div className="text-center py-10 text-neutral-400 text-[13px]">
              <p className="font-bold text-neutral-500 text-[14px]">Aucun résultat</p>
              <p className="mt-1">
                Essayez un terme plus court (ex. « dattes » au lieu de « dattes medjool premium »)
                ou retirez les marques.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {results.map((r) => {
                const isSaving = saving === (r.code || r.imageUrl);
                return (
                  <button
                    type="button"
                    key={r.code || r.imageUrl}
                    onClick={() => applyImage(r)}
                    disabled={!!saving}
                    className={`group relative text-left bg-white rounded-2xl overflow-hidden ring-1 ring-black/5 hover:ring-vert transition ${
                      isSaving ? "opacity-60 cursor-wait" : ""
                    } ${saving && !isSaving ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <div className="aspect-square bg-creme flex items-center justify-center">
                      <img
                        src={r.thumbUrl || r.imageUrl}
                        alt={r.name}
                        loading="lazy"
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const sib = e.currentTarget.nextElementSibling;
                          if (sib) sib.textContent = "Image indisponible";
                        }}
                      />
                      <span className="hidden text-[11px] text-neutral-400"></span>
                    </div>
                    <div className="p-2 border-t border-black/5">
                      <p className="text-[12.5px] font-bold text-noir line-clamp-2 leading-tight">
                        {r.name}
                      </p>
                      <p className="text-[10.5px] text-neutral-500 mt-1 truncate">
                        {[r.brands, r.origine].filter(Boolean).join(" · ") || r.attribution}
                      </p>
                    </div>
                    {isSaving && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <svg className="w-6 h-6 animate-spin text-vert" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                          <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!hasSearched && !loading && (
            <div className="text-center py-10 text-neutral-400 text-[13px]">
              <p>La recherche démarre automatiquement avec le nom du produit.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-black/5 px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-neutral-500">
            Les images proviennent d'OpenFoodFacts sous licence CC-BY-SA 3.0.
            Attribution déjà déclarée dans <code className="bg-creme px-1 rounded">CREDITS.md</code>.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-full bg-white border-2 border-black/10 font-bold text-[12px] hover:border-noir transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
