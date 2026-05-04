import { useEffect, useMemo, useRef, useState } from "react";
import InlineImageUpload from "./InlineImageUpload.jsx";
import BulkActionsBar from "./BulkActionsBar.jsx";
import SortableHeader from "./SortableHeader.jsx";
import FilterChip from "./FilterChip.jsx";
import { compareRows, useAdminListState } from "./useAdminListState.js";
import { derivePrices } from "../../../lib/priceDerivation";

/**
 * PromosManager — interactive admin table for the public.promos table.
 *
 * Features :
 *   - Table with all promos (active + inactive).
 *   - Inline quick toggle for `actif` + `mise_en_avant`.
 *   - Edit modal for full CRUD on a row.
 *   - "Nouvelle promo" button → blank edit modal.
 *   - "Importer JSON" drawer : paste an array, preview, publish via PUT.
 *   - Filters : search, rayon, magasin, statut.
 *   - Optimistic UI : table updates locally as soon as the API responds.
 *
 * All requests go to /api/admin/promos/* which requires the admin cookie.
 */

const EMPTY_PROMO = {
  id: null,
  slug: "",
  titre: "",
  description: "",
  image_url: "",
  prix_original: "",
  prix_promo: "",
  reduction_pct: "",
  rayon: "",
  magasin: "tous",
  date_debut: todayISO(),
  date_fin: inDaysISO(14),
  mise_en_avant: false,
  actif: true,
  ordre: 0,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function inDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtPrice(n) {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(2).replace(".", ",") + " €";
}
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PromosManager({ initialPromos, rayonsOptions, magasinsOptions }) {
  const [promos, setPromos] = useState(initialPromos ?? []);
  const [editing, setEditing] = useState(null); // null | EMPTY_PROMO | existing row
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'ok' | 'err', msg }
  const [selected, setSelected] = useState(() => new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [undoData, setUndoData] = useState(null); // { snapshot: Promo[], message, timer }
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const searchInputRef = useRef(null);

  /* URL-persisted filters + sort, also mirrored to localStorage so opening
   * /admin/promos without query args restores the last view. */
  const STATUT_OPTS = ["all", "active", "inactive"];
  const SORT_OPTS = [
    "ordre",
    "titre",
    "rayon",
    "magasin",
    "prix_promo",
    "reduction_pct",
    "date_fin",
    "updated_at",
    "actif",
  ];
  const { state: listState, set: setFilter, reset: resetFilter, activeCount } = useAdminListState({
    defaults: { q: "", rayon: "", magasin: "", statut: "all", sort: "ordre", dir: "asc" },
    allowed: { statut: STATUT_OPTS, dir: ["asc", "desc"], sort: SORT_OPTS },
    storageKey: "admin.promos.list",
  });
  const filter = listState;
  const sort = useMemo(() => ({ field: listState.sort, dir: listState.dir }), [listState.sort, listState.dir]);
  function setSort(field, dir) {
    setFilter({ sort: field, dir });
  }

  /* Reorder mode is only meaningful when sorted by ordre ascending. */
  const canReorder = sort.field === "ordre" && sort.dir === "asc";

  const rayonNom = useMemo(() => {
    const m = new Map();
    rayonsOptions.forEach((r) => m.set(r.slug, r.nom));
    return (slug) => m.get(slug) ?? slug;
  }, [rayonsOptions]);

  const magasinNom = useMemo(() => {
    const m = new Map();
    magasinsOptions.forEach((r) => m.set(r.slug, r.nom));
    return (slug) => m.get(slug) ?? slug;
  }, [magasinsOptions]);

  const filtered = useMemo(() => {
    const base = promos.filter((p) => {
      if (filter.rayon && p.rayon !== filter.rayon) return false;
      if (filter.magasin && p.magasin !== filter.magasin) return false;
      if (filter.statut === "active" && !p.actif) return false;
      if (filter.statut === "inactive" && p.actif) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const hay = `${p.titre} ${p.slug} ${p.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort.field) base.sort((a, b) => compareRows(a, b, sort.field, sort.dir));
    return base;
  }, [promos, filter, sort]);

  /* Selection helpers (only rows currently visible can be selected). */
  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  function toggleSelected(id) {
    setSelected((cur) => {
      const nxt = new Set(cur);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  }
  function toggleSelectAllVisible() {
    setSelected((cur) => {
      if (allVisibleSelected) {
        const nxt = new Set(cur);
        visibleIds.forEach((id) => nxt.delete(id));
        return nxt;
      }
      const nxt = new Set(cur);
      visibleIds.forEach((id) => nxt.add(id));
      return nxt;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  function notify(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3800);
  }

  /* ---------------- Toggle actif / mise_en_avant (inline) ---------------- */
  async function togglePromoField(row, field) {
    const next = { ...row, [field]: !row[field] };
    /* Optimistic update */
    setPromos((cur) => cur.map((p) => (p.id === row.id ? next : p)));
    try {
      const res = await fetch(`/api/admin/promos/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next[field] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { promo } = await res.json();
      setPromos((cur) => cur.map((p) => (p.id === row.id ? promo : p)));
    } catch (err) {
      /* Rollback */
      setPromos((cur) => cur.map((p) => (p.id === row.id ? row : p)));
      notify("err", `Erreur : ${err.message}`);
    }
  }

  /* ---------------- Delete ---------------- */
  async function deletePromo(row) {
    if (!confirm(`Supprimer définitivement la promo « ${row.titre} » ?`)) return;
    const snapshot = promos;
    setPromos((cur) => cur.filter((p) => p.id !== row.id));
    try {
      const res = await fetch(`/api/admin/promos/${row.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      }
      notify("ok", `Promo « ${row.titre} » supprimée.`);
    } catch (err) {
      setPromos(snapshot);
      notify("err", `Erreur : ${err.message}`);
    }
  }

  /* ---------------- Save (create or update) ---------------- */
  async function savePromo(form) {
    const isNew = !form.id;
    const payload = {
      slug: form.slug,
      titre: form.titre,
      description: form.description,
      image_url: form.image_url || null,
      prix_original: Number(form.prix_original),
      prix_promo: Number(form.prix_promo),
      reduction_pct: Number(form.reduction_pct),
      rayon: form.rayon,
      magasin: form.magasin,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      mise_en_avant: !!form.mise_en_avant,
      actif: form.actif !== false,
      ordre: Number(form.ordre) || 0,
    };
    try {
      let res;
      if (isNew) {
        res = await fetch(`/api/admin/promos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/admin/promos/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { promo } = await res.json();
      if (isNew) {
        setPromos((cur) => [...cur, promo]);
      } else {
        setPromos((cur) => cur.map((p) => (p.id === promo.id ? promo : p)));
      }
      setEditing(null);
      notify("ok", isNew ? "Promo créée." : "Promo mise à jour.");
    } catch (err) {
      notify("err", `Erreur : ${err.message}`);
    }
  }

  /* ---------------- Bulk import ---------------- */
  async function bulkImport(arr) {
    try {
      const res = await fetch(`/api/admin/promos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promos: arr }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { count } = await res.json();
      /* Refresh the table from the server truth. */
      const refreshed = await fetch(`/api/admin/promos`).then((r) => r.json());
      setPromos(refreshed.promos ?? []);
      setImporting(false);
      notify("ok", `${count} promo(s) importée(s).`);
    } catch (err) {
      notify("err", `Erreur import : ${err.message}`);
    }
  }

  /* ---------------- Bulk actions (activate/deactivate/feature/delete) ---------------- */
  async function bulkAction(action) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    /* For destructive actions, stash a snapshot so we can offer Undo. */
    const snapshot = promos;

    if (action === "delete") {
      if (!confirm(`Supprimer ${ids.length} promo(s) ? Vous aurez 8 s pour annuler.`)) return;
      /* Optimistic: remove locally. */
      setPromos((cur) => cur.filter((p) => !selected.has(p.id)));
      clearSelection();
    } else if (action === "activate" || action === "deactivate") {
      const val = action === "activate";
      setPromos((cur) => cur.map((p) => (selected.has(p.id) ? { ...p, actif: val } : p)));
    } else if (action === "feature" || action === "unfeature") {
      const val = action === "feature";
      setPromos((cur) =>
        cur.map((p) => (selected.has(p.id) ? { ...p, mise_en_avant: val } : p))
      );
    }

    try {
      const res = await fetch(`/api/admin/promos/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { affected } = await res.json();

      if (action === "delete") {
        /* Offer undo for 8 s. Because we already persisted the delete,
         * undo re-inserts the snapshot via the bulk import endpoint. */
        const msg = `${affected} promo(s) supprimée(s).`;
        if (undoData?.timer) clearTimeout(undoData.timer);
        const timer = setTimeout(() => setUndoData(null), 8000);
        setUndoData({
          snapshot: snapshot.filter((p) => ids.includes(p.id)),
          message: msg,
          timer,
        });
        notify("ok", msg);
      } else {
        clearSelection();
        notify("ok", `${affected} promo(s) mise(s) à jour.`);
      }
    } catch (err) {
      setPromos(snapshot);
      notify("err", `Erreur : ${err.message}`);
    }
  }

  /* ---------------- Undo last bulk delete ---------------- */
  async function undoBulkDelete() {
    if (!undoData) return;
    const rows = undoData.snapshot;
    if (undoData.timer) clearTimeout(undoData.timer);
    setUndoData(null);
    try {
      const res = await fetch(`/api/admin/promos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promos: rows }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const refreshed = await fetch(`/api/admin/promos`).then((r) => r.json());
      setPromos(refreshed.promos ?? []);
      notify("ok", `${rows.length} promo(s) restaurée(s).`);
    } catch (err) {
      notify("err", `Restauration impossible : ${err.message}`);
    }
  }

  /* ---------------- Reorder (drag + up/down buttons) ---------------- */
  async function persistReorder(rows) {
    /* rows is the NEW visible order. Re-index ordre from 0..N. */
    const payload = rows.map((p, i) => ({ id: p.id, ordre: i }));
    try {
      const res = await fetch(`/api/admin/promos/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    } catch (err) {
      notify("err", `Erreur réorganisation : ${err.message}`);
    }
  }

  function applyReorder(nextFiltered) {
    /* Merge the new visible order back into the full `promos` list:
     * - rebuild the filtered subset
     * - keep rows not in the visible set at their original position */
    const filteredIds = new Set(nextFiltered.map((p) => p.id));
    const visibleIndexes = [];
    promos.forEach((p, i) => {
      if (filteredIds.has(p.id)) visibleIndexes.push(i);
    });
    const next = [...promos];
    visibleIndexes.forEach((idx, k) => {
      next[idx] = nextFiltered[k];
    });
    /* Reassign ordre globally so the server sees a clean sequence. */
    const reindexed = next.map((p, i) => ({ ...p, ordre: i }));
    setPromos(reindexed);
    persistReorder(reindexed);
  }

  function moveRow(id, delta) {
    const idx = filtered.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= filtered.length) return;
    const next = [...filtered];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    applyReorder(next);
  }

  function onDragStart(id) {
    setDragId(id);
  }
  function onDragOverRow(e, id) {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    setDragOverId(id);
  }
  function onDropRow(id) {
    if (!dragId || dragId === id) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const from = filtered.findIndex((p) => p.id === dragId);
    const to = filtered.findIndex((p) => p.id === id);
    if (from < 0 || to < 0) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const next = [...filtered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    setDragOverId(null);
    applyReorder(next);
  }

  /* ---------------- Deep-link hashes (#new, #import) -------------- */
  /* Run once on mount. Lets the dashboard "Actions rapides" tiles
   * land directly on an open modal. We strip the hash afterwards so
   * a refresh doesn't re-open it. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash;
    if (h === "#new") {
      setEditing({ ...EMPTY_PROMO });
    } else if (h === "#import") {
      setImporting(true);
    } else {
      return;
    }
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      /* read-only contexts (e.g. some embed) — harmless to ignore */
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* ---------------- List-level keyboard shortcuts ---------------- */
  useEffect(() => {
    function onKey(e) {
      /* Skip when focus is in an editable element or a modal is open. */
      if (editing || importing) return;
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (editable) {
        /* Still allow Escape to clear selection. */
        if (e.key === "Escape" && selected.size > 0) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setEditing({ ...EMPTY_PROMO });
      } else if (e.key === "Escape") {
        if (selected.size > 0) {
          e.preventDefault();
          clearSelection();
        } else if (reorderMode) {
          setReorderMode(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, importing, selected.size, reorderMode]);

  /* Clear selection if the visible rows change and selected rows fall out of view. */
  useEffect(() => {
    setSelected((cur) => {
      let changed = false;
      const nxt = new Set();
      for (const id of cur) {
        if (promos.some((p) => p.id === id)) nxt.add(id);
        else changed = true;
      }
      return changed ? nxt : cur;
    });
  }, [promos]);

  /* =========================================================== */
  return (
    <div>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 bg-creme/85 backdrop-blur-md">
        <div className="bg-white rounded-3xl shadow-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 relative">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Rechercher titre, slug…  (raccourci : /)"
                value={filter.q}
                onChange={(e) => setFilter({ q: e.target.value })}
                className="w-full px-4 py-2 pr-9 rounded-full border border-black/10 text-[14px] focus:border-vert focus:outline-none bg-creme"
                aria-label="Recherche"
              />
              {filter.q && (
                <button
                  type="button"
                  onClick={() => setFilter({ q: "" })}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-neutral-400 hover:bg-neutral-100 flex items-center justify-center"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <select
              value={filter.rayon}
              onChange={(e) => setFilter({ rayon: e.target.value })}
              className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
              aria-label="Filtrer par rayon"
            >
              <option value="">Tous rayons</option>
              {rayonsOptions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.nom}
                </option>
              ))}
            </select>
            <select
              value={filter.magasin}
              onChange={(e) => setFilter({ magasin: e.target.value })}
              className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
              aria-label="Filtrer par magasin"
            >
              <option value="">Tous magasins</option>
              {magasinsOptions.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.nom}
                </option>
              ))}
            </select>
            <select
              value={filter.statut}
              onChange={(e) => setFilter({ statut: e.target.value })}
              className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Actives</option>
              <option value="inactive">Inactives</option>
            </select>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {canReorder && (
              <button
                type="button"
                onClick={() => setReorderMode((m) => !m)}
                aria-pressed={reorderMode}
                title={reorderMode ? "Sortir du mode réorganisation (Esc)" : "Activer le mode glisser-déposer"}
                className={`px-4 py-2 rounded-full text-[13px] font-bold transition inline-flex items-center gap-1.5 ${
                  reorderMode
                    ? "bg-rouge text-white hover:bg-rouge/90"
                    : "bg-white border-2 border-black/10 hover:border-noir"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {reorderMode ? "Terminer" : "Réorganiser"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="px-4 py-2 rounded-full bg-white border-2 border-black/10 text-[13px] font-bold hover:border-vert hover:text-vert transition"
            >
              Importer JSON
            </button>
            <button
              type="button"
              onClick={() => setEditing({ ...EMPTY_PROMO })}
              title="Créer une promo (n)"
              className="px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
            >
              + Nouvelle promo
            </button>
          </div>
        </div>

        {/* Active filters chips */}
        {activeCount > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Filtres actifs :
            </span>
            {filter.q && (
              <FilterChip label={`« ${filter.q} »`} onRemove={() => setFilter({ q: "" })} />
            )}
            {filter.rayon && (
              <FilterChip
                label={`Rayon : ${rayonNom(filter.rayon)}`}
                onRemove={() => setFilter({ rayon: "" })}
              />
            )}
            {filter.magasin && (
              <FilterChip
                label={`Magasin : ${magasinNom(filter.magasin)}`}
                onRemove={() => setFilter({ magasin: "" })}
              />
            )}
            {filter.statut !== "all" && (
              <FilterChip
                label={`Statut : ${filter.statut === "active" ? "actives" : "inactives"}`}
                onRemove={() => setFilter({ statut: "all" })}
              />
            )}
            {(sort.field !== "ordre" || sort.dir !== "asc") && (
              <FilterChip
                label={`Tri : ${sort.field} ${sort.dir === "asc" ? "↑" : "↓"}`}
                onRemove={() => setSort("ordre", "asc")}
              />
            )}
            <button
              type="button"
              onClick={resetFilter}
              className="text-[11px] font-bold text-neutral-500 hover:text-rouge transition underline underline-offset-2"
            >
              Tout réinitialiser
            </button>
          </div>
        )}
      </div>

      {/* Count line + reorder-mode hint */}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-neutral-500">
          <strong className="text-noir">{filtered.length}</strong> promo(s) affichée(s)
          {promos.length !== filtered.length && (
            <span> sur <strong className="text-noir">{promos.length}</strong> au total</span>
          )}
        </p>
        {reorderMode && (
          <span className="inline-block px-3 py-1 rounded-full bg-rouge/10 text-rouge font-bold text-[11px] uppercase tracking-wider">
            → Mode réorganisation : glissez les lignes ou utilisez ↑↓
          </span>
        )}
      </div>

      {/* Table */}
      <div className="mt-3 bg-white rounded-3xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-creme text-neutral-500 text-left text-[11px] uppercase tracking-wider">
                <th scope="col" className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Tout sélectionner dans la vue"
                    className="w-4 h-4 accent-vert cursor-pointer"
                  />
                </th>
                {reorderMode && <th scope="col" className="px-2 py-3 w-10" aria-label="Réorganiser" />}
                <th scope="col" className="px-4 py-3 font-bold">Image</th>
                <SortableHeader field="titre" label="Titre" sort={sort} onSort={setSort} />
                <SortableHeader field="rayon" label="Rayon" sort={sort} onSort={setSort} />
                <SortableHeader field="prix_promo" label="Prix" sort={sort} onSort={setSort} />
                <SortableHeader field="reduction_pct" label="Réduc" sort={sort} onSort={setSort} />
                <SortableHeader field="magasin" label="Magasin" sort={sort} onSort={setSort} />
                <SortableHeader field="date_fin" label="Fin" sort={sort} onSort={setSort} />
                <SortableHeader field="actif" label="Statut" sort={sort} onSort={setSort} />
                <th scope="col" className="px-4 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={reorderMode ? 11 : 10} className="px-4 py-16 text-center text-neutral-400">
                    Aucune promo ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const isSel = selected.has(p.id);
                const isDragOver = reorderMode && dragOverId === p.id;
                return (
                  <tr
                    key={p.id}
                    onDragOver={reorderMode ? (e) => onDragOverRow(e, p.id) : undefined}
                    onDrop={reorderMode ? () => onDropRow(p.id) : undefined}
                    className={[
                      "border-t border-black/5 transition",
                      isSel ? "bg-vert/5" : "hover:bg-creme/50",
                      isDragOver ? "outline outline-2 outline-vert -outline-offset-2" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelected(p.id)}
                        aria-label={`Sélectionner ${p.titre}`}
                        className="w-4 h-4 accent-vert cursor-pointer"
                      />
                    </td>
                    {reorderMode && (
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-0.5">
                          <span
                            draggable
                            onDragStart={() => onDragStart(p.id)}
                            onDragEnd={() => {
                              setDragId(null);
                              setDragOverId(null);
                            }}
                            className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-noir select-none"
                            title="Glisser pour déplacer"
                            aria-hidden="true"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="9" cy="6" r="1.5" />
                              <circle cx="15" cy="6" r="1.5" />
                              <circle cx="9" cy="12" r="1.5" />
                              <circle cx="15" cy="12" r="1.5" />
                              <circle cx="9" cy="18" r="1.5" />
                              <circle cx="15" cy="18" r="1.5" />
                            </svg>
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => moveRow(p.id, -1)}
                              aria-label="Monter d'un rang"
                              className="w-4 h-4 text-neutral-400 hover:text-noir transition flex items-center justify-center"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0 10 6H0z" /></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRow(p.id, +1)}
                              aria-label="Descendre d'un rang"
                              className="w-4 h-4 text-neutral-400 hover:text-noir transition flex items-center justify-center"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 6 0 0h10z" /></svg>
                            </button>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover ring-1 ring-black/5"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-creme flex items-center justify-center text-neutral-400">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="font-bold text-noir truncate">{p.titre}</p>
                      <p className="text-[11px] text-neutral-400 truncate">{p.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{rayonNom(p.rayon)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-rouge">{fmtPrice(p.prix_promo)}</span>
                      <span className="ml-1 text-neutral-400 line-through">
                        {fmtPrice(p.prix_original)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-rouge/10 text-rouge font-bold text-[12px]">
                        -{p.reduction_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                      {magasinNom(p.magasin)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                      {fmtDate(p.date_fin)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => togglePromoField(p, "actif")}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition ${
                            p.actif
                              ? "bg-vert/15 text-vert-dark hover:bg-vert/25"
                              : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
                          }`}
                        >
                          {p.actif ? "● Active" : "○ Inactive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePromoField(p, "mise_en_avant")}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition ${
                            p.mise_en_avant
                              ? "bg-rouge/15 text-rouge hover:bg-rouge/25"
                              : "bg-transparent text-neutral-400 hover:bg-neutral-100 border border-neutral-200"
                          }`}
                        >
                          ★ Vedette
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="px-3 py-1 rounded-full bg-noir text-white text-[12px] font-bold hover:bg-noir-soft transition"
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePromo(p)}
                          aria-label="Supprimer"
                          className="w-8 h-8 rounded-full text-neutral-400 hover:bg-rouge/10 hover:text-rouge transition flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk actions bar (shown when rows selected) */}
      <BulkActionsBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          { label: "Activer", onClick: () => bulkAction("activate") },
          { label: "Désactiver", onClick: () => bulkAction("deactivate") },
          { label: "★ Vedette", onClick: () => bulkAction("feature") },
          { label: "Retirer vedette", onClick: () => bulkAction("unfeature") },
          { label: "Supprimer", tone: "danger", onClick: () => bulkAction("delete") },
        ]}
      />

      {/* Undo toast for bulk delete */}
      {undoData && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-noir text-white text-[13px] font-bold shadow-2xl flex items-center gap-3"
        >
          <span>{undoData.message}</span>
          <button
            type="button"
            onClick={undoBulkDelete}
            className="px-3 py-1 rounded-full bg-vert hover:bg-vert-dark transition"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Edit / create modal */}
      {editing && (
        <EditModal
          promo={editing}
          rayonsOptions={rayonsOptions}
          magasinsOptions={magasinsOptions}
          onCancel={() => setEditing(null)}
          onSave={savePromo}
        />
      )}

      {/* Import modal */}
      {importing && (
        <ImportModal
          currentPromos={promos}
          onCancel={() => setImporting(false)}
          onImport={bulkImport}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full font-bold text-[13px] shadow-card ${
            toast.type === "ok"
              ? "bg-vert text-white"
              : "bg-rouge text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/* Edit / Create modal                                                */
/* ================================================================ */
function EditModal({ promo, rayonsOptions, magasinsOptions, onCancel, onSave }) {
  const [form, setForm] = useState({ ...promo });
  const [saving, setSaving] = useState(false);
  /* Track the last price field the user typed into so the three-way
   * derivation picks the "oldest" sibling to refresh. */
  const [lastEdited, setLastEdited] = useState(null);
  /* User-pinned fields: never re-derived. */
  const [locked, setLocked] = useState(() => new Set());
  const formRef = useRef(null);

  const isNew = !promo.id;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  /* Bidirectional three-way derivation across prix_original / prix_promo /
   * reduction_pct. Powered by src/lib/priceDerivation.ts.
   *
   * NOTE: we preserve the user's raw typed value on the edited field (so
   * mid-typing states like "1." survive). Only the two OTHER fields are
   * overwritten by the derived values. */
  function setPrix(field, value) {
    const next = { ...form, [field]: value };
    const result = derivePrices(next, { edited: field, lastEdited, locked });
    setForm({
      ...next,
      prix_original: field === "prix_original" ? value : result.prix_original,
      prix_promo: field === "prix_promo" ? value : result.prix_promo,
      reduction_pct: field === "reduction_pct" ? value : result.reduction_pct,
    });
    setLastEdited(result.lastEdited);
  }

  function toggleLock(field) {
    setLocked((cur) => {
      const nxt = new Set(cur);
      if (nxt.has(field)) nxt.delete(field);
      else nxt.add(field);
      return nxt;
    });
  }

  /* ----- Inline validation ----- */
  const dateError =
    form.date_debut && form.date_fin && form.date_fin < form.date_debut
      ? "La date de fin doit être postérieure à la date de début."
      : null;

  const canSave = !saving && !dateError;

  /* ----- Keyboard shortcuts : Esc = cancel, Ctrl/Cmd+S = save ----- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (canSave) formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, canSave]);

  async function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-6">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-soft font-bold text-[20px]">
            {isNew ? "Nouvelle promo" : `Éditer « ${promo.titre} »`}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={submit} className="p-6 space-y-5">
          <Field label="Titre" required>
            <input
              type="text"
              required
              value={form.titre}
              onChange={(e) => set("titre", e.target.value)}
              className="input"
              placeholder="Épaule d'agneau halal entière"
            />
          </Field>

          <Field label="Slug (identifiant unique)" required hint="Utilisé comme clé, pas de majuscules/espaces.">
            <input
              type="text"
              required
              pattern="[a-z0-9-]+"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              className="input"
              placeholder="agneau-halal-epaule"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              className="input min-h-[70px] resize-y"
              placeholder="Courte phrase visible sur la carte."
            />
          </Field>

          <InlineImageUpload
            folder="promos"
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            renameTo={form.slug || form.titre}
            label="Image de la promo"
            hint="Déposer une image l'envoie dans Supabase Storage. JPEG, PNG, WebP, AVIF. 8 Mo max."
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <PriceField
              label="Prix original (€)"
              field="prix_original"
              value={form.prix_original}
              step="0.01"
              min="0"
              required
              locked={locked.has("prix_original")}
              onToggleLock={() => toggleLock("prix_original")}
              onChange={(v) => setPrix("prix_original", v)}
            />
            <PriceField
              label="Prix promo (€)"
              field="prix_promo"
              value={form.prix_promo}
              step="0.01"
              min="0"
              required
              locked={locked.has("prix_promo")}
              onToggleLock={() => toggleLock("prix_promo")}
              onChange={(v) => setPrix("prix_promo", v)}
            />
            <PriceField
              label="Réduction (%)"
              field="reduction_pct"
              value={form.reduction_pct}
              step="1"
              min="0"
              max="99"
              required
              hint="Éditez 2 des 3 champs, le 3e se calcule seul."
              locked={locked.has("reduction_pct")}
              onToggleLock={() => toggleLock("reduction_pct")}
              onChange={(v) => setPrix("reduction_pct", v)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Rayon" required>
              <select
                required
                value={form.rayon}
                onChange={(e) => set("rayon", e.target.value)}
                className="input"
              >
                <option value="">— Choisir —</option>
                {rayonsOptions.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.nom}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Magasin" required>
              <select
                required
                value={form.magasin}
                onChange={(e) => set("magasin", e.target.value)}
                className="input"
              >
                {magasinsOptions.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Début" required>
              <input
                type="date"
                required
                value={form.date_debut}
                onChange={(e) => set("date_debut", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Fin" required>
              <input
                type="date"
                required
                value={form.date_fin}
                onChange={(e) => set("date_fin", e.target.value)}
                className={`input ${dateError ? "!border-rouge" : ""}`}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? "promo-date-error" : undefined}
              />
            </Field>
          </div>
          {dateError && (
            <p id="promo-date-error" className="text-[12px] font-bold text-rouge -mt-3">
              {dateError}
            </p>
          )}

          <div className="flex flex-wrap gap-5 items-center">
            <label className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={!!form.actif}
                onChange={(e) => set("actif", e.target.checked)}
                className="w-4 h-4 rounded accent-vert"
              />
              <span>Active (visible sur le site)</span>
            </label>
            <label className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={!!form.mise_en_avant}
                onChange={(e) => set("mise_en_avant", e.target.checked)}
                className="w-4 h-4 rounded accent-rouge"
              />
              <span>Mise en avant (featured)</span>
            </label>
            <Field label="Ordre" hint="Petit = en premier." inline>
              <input
                type="number"
                step="1"
                value={form.ordre ?? 0}
                onChange={(e) => set("ordre", e.target.value)}
                className="input w-20"
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-3 sticky bottom-0 bg-white border-t border-black/5 -mx-6 px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-full bg-white border-2 border-black/10 font-bold text-[13px] hover:border-noir transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex-1 px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-50"
              title="Ctrl/Cmd + S pour enregistrer"
            >
              {saving ? "Enregistrement…" : isNew ? "Créer la promo" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.9rem;
          border: 1px solid rgba(0,0,0,0.12);
          border-radius: 0.75rem;
          background: white;
          font-size: 14px;
          color: #111;
        }
        .input:focus { outline: none; border-color: #1C6B35; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, required, inline, children }) {
  return (
    <div className={inline ? "inline-flex items-center gap-2" : ""}>
      <label className="block text-[12px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-rouge ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-neutral-400 leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * PriceField - input with an inline lock toggle. Clicking the lock
 * pins the field so the three-way derivation never overwrites it.
 */
function PriceField({
  label,
  field,
  value,
  step,
  min,
  max,
  required,
  hint,
  locked,
  onToggleLock,
  onChange,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={`price-${field}`}
          className="block text-[12px] font-bold text-neutral-500 uppercase tracking-wider"
        >
          {label}
          {required && <span className="text-rouge ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          aria-label={locked ? `Déverrouiller ${label}` : `Verrouiller ${label} pour éviter le re-calcul automatique`}
          title={locked ? "Verrouillé - cliquer pour libérer" : "Verrouiller - ne sera plus re-calculé"}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition shrink-0 ${
            locked
              ? "bg-rouge/15 text-rouge hover:bg-rouge/25"
              : "text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {locked ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 7.5-1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      <input
        id={`price-${field}`}
        type="number"
        step={step}
        min={min}
        max={max}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input ${locked ? "ring-2 ring-rouge/30" : ""}`}
      />
      {hint && <p className="mt-1 text-[11px] text-neutral-400 leading-snug">{hint}</p>}
    </div>
  );
}

/* ================================================================ */
/* Bulk Import modal                                                  */
/* ================================================================ */
function ImportModal({ currentPromos, onCancel, onImport }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState(null);

  function onPaste(v) {
    setText(v);
    if (!v.trim()) {
      setParsed(null);
      setErr(null);
      return;
    }
    try {
      const obj = JSON.parse(v);
      const arr = Array.isArray(obj) ? obj : obj.promos;
      if (!Array.isArray(arr)) throw new Error("JSON doit être un tableau ou { promos: [...] }");
      setParsed(arr);
      setErr(null);
    } catch (e) {
      setParsed(null);
      setErr(e.message);
    }
  }

  const existingSlugs = new Set(currentPromos.map((p) => p.slug));
  const diff = parsed
    ? parsed.map((p) => ({
        ...p,
        _action: existingSlugs.has(p.slug) ? "Mise à jour" : "Création",
      }))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-6">
      <div className="w-full max-w-3xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-soft font-bold text-[20px]">Importer des promos (JSON)</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-creme rounded-2xl p-4 text-[13px] text-neutral-600 leading-relaxed">
            Collez un tableau JSON d'objets promos ou <code className="bg-white px-1 rounded">{`{ promos: [...] }`}</code>.
            Les slugs existants seront mis à jour, les nouveaux seront créés.
            <br/>
            <strong>Champs requis :</strong> slug, titre, prix_original, prix_promo, reduction_pct, rayon, date_debut, date_fin.
          </div>

          <textarea
            value={text}
            onChange={(e) => onPaste(e.target.value)}
            className="w-full min-h-[220px] font-mono text-[12px] px-4 py-3 border border-black/10 rounded-2xl bg-creme resize-y focus:outline-none focus:border-vert"
            placeholder={
              '[{"slug":"agneau","titre":"Épaule d agneau","prix_original":18.90,"prix_promo":12.90,"reduction_pct":32,"rayon":"boucherie-halal","date_debut":"2026-04-21","date_fin":"2026-04-27"}]'
            }
            spellCheck={false}
          />

          {err && (
            <div className="bg-rouge/5 border border-rouge/20 text-rouge rounded-2xl p-3 text-[13px]">
              <strong>JSON invalide :</strong> {err}
            </div>
          )}

          {parsed && (
            <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
              <div className="bg-creme px-4 py-2 text-[12px] font-bold text-neutral-500 uppercase tracking-wider">
                Prévisualisation · {parsed.length} ligne(s)
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-white sticky top-0">
                    <tr className="text-left text-neutral-400">
                      <th className="px-3 py-2 font-bold">Action</th>
                      <th className="px-3 py-2 font-bold">Slug</th>
                      <th className="px-3 py-2 font-bold">Titre</th>
                      <th className="px-3 py-2 font-bold">Rayon</th>
                      <th className="px-3 py-2 font-bold">Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((p, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="px-3 py-1.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p._action === "Création" ? "bg-vert/15 text-vert-dark" : "bg-blue-100 text-blue-700"
                          }`}>
                            {p._action}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono">{p.slug}</td>
                        <td className="px-3 py-1.5">{p.titre}</td>
                        <td className="px-3 py-1.5 text-neutral-500">{p.rayon}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className="font-bold text-rouge">{fmtPrice(p.prix_promo)}</span>
                          <span className="ml-1 text-neutral-400 line-through">{fmtPrice(p.prix_original)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-full bg-white border-2 border-black/10 font-bold text-[13px] hover:border-noir transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => parsed && onImport(parsed)}
              disabled={!parsed || parsed.length === 0}
              className="flex-1 px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-50"
            >
              Publier {parsed?.length ?? 0} promo(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
