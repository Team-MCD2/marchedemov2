import { useEffect, useMemo, useRef, useState } from "react";
import MassImageMatchModal from "./MassImageMatchModal.jsx";
import ProductImageSearchModal from "./ProductImageSearchModal.jsx";
import InlineImageUpload from "./InlineImageUpload.jsx";
import BulkActionsBar from "./BulkActionsBar.jsx";
import FilterChip from "./FilterChip.jsx";
import UndoSnackbar from "./UndoSnackbar.jsx";
import EmptyState from "./EmptyState.jsx";
import ExportMenu from "./ExportMenu.jsx";
import MobileActionBar from "./MobileActionBar.jsx";
import { adminFetch, clearDraft, loadDraft, saveDraft } from "./adminFetch.js";
import { compareRows, useAdminListState } from "./useAdminListState.js";
import { humanizeError } from "../../../lib/admin-errors";

/**
 * ProduitsManager — admin table for public.produits (catalogue vitrine).
 *
 * Lighter than PromosManager : no dates, no magasin, no reduction,
 * prix_indicatif is optional.
 *
 * Layout is grouped by rayon (section per rayon) to reflect how
 * the product is shown on the public rayon pages.
 */

const EMPTY_PRODUIT = {
  id: null,
  slug: "",
  nom: "",
  description: "",
  image_url: "",
  prix_indicatif: "",
  unite: "",
  rayon: "",
  categorie: "",
  sous_categorie: "",
  origine: "",
  badge: "",
  actif: true,
  ordre: 0,
};

function fmtPrice(n) {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(2).replace(".", ",") + " €";
}

/* Local slugifier for the create-modal auto-suggest.
 *   "Riz Basmati Parfumé"  →  "riz-basmati-parfume"
 *   "Dattes d'Algérie (1 kg)"  →  "dattes-d-algerie-1-kg"
 * Kept local so the island stays a pure relative-import graph.
 * Mirrors the server-side normalisation in
 * `@/lib/image-match.ts` and `api/admin/produits/index.ts`. */
function slugifyLocal(raw) {
  if (!raw) return "";
  return String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * @typedef {Object} ProduitsManagerScope
 * @property {string | null} [rayon]          Locked rayon slug (matches produits.rayon)
 * @property {string | null} [categorie]      Locked categorie LABEL (matches produits.categorie)
 * @property {string | null} [sous_categorie] Locked sous_categorie LABEL
 * @property {string | null} [displayLabel]   Human name used in empty-state CTA
 * @property {"orphelins" | null} [view]     Special filter view (e.g. orphans-only)
 * @property {string[]} [knownCategorieLabels]      For orphans detection at rayon scope
 * @property {string[]} [knownSousCategorieLabels]  For orphans detection at categorie scope
 */

export default function ProduitsManager({ initialProduits, rayonsOptions, scope = null }) {
  const [produits, setProduits] = useState(initialProduits ?? []);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [massMatching, setMassMatching] = useState(false);
  const [imageSearching, setImageSearching] = useState(/** @type {null | object} */ (null));
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [undoData, setUndoData] = useState(null);
  /* Single-row deferred-delete state.
   * Shape : { row, timer, deadline } where `timer` is the setTimeout id
   * that will fire the actual DELETE call after 8 s if the user doesn't
   * undo. Kept separate from the bulk `undoData` because the semantics
   * differ : here the API call is DEFERRED ; for bulk it has already
   * happened and undo re-upserts. */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const searchInputRef = useRef(null);

  /* URL-persisted filters + sort. /admin/images-gap can still drive the
   * initial view via ?statut=sans-image because the URL is read on mount. */
  const STATUT_OPTS = ["all", "active", "inactive", "sans-image", "avec-image"];
  const SORT_OPTS = ["ordre", "nom", "slug", "rayon", "categorie", "prix_indicatif", "actif", "updated_at"];
  /* `recent` : "" = no filter, "24h" = updated in last 24 h, "7d" = 7 days.
   * Plays well with `useAdminListState` because it serialises as a plain
   * string in the URL ("?recent=24h") and round-trips identically. */
  const RECENT_OPTS = ["", "24h", "7d"];
  const { state: listState, set: setFilter, reset: resetFilter, activeCount } = useAdminListState({
    defaults: { q: "", rayon: "", statut: "all", recent: "", sort: "ordre", dir: "asc" },
    allowed: { statut: STATUT_OPTS, recent: RECENT_OPTS, dir: ["asc", "desc"], sort: SORT_OPTS },
    storageKey: "admin.produits.list",
  });
  const filter = listState;
  const sort = useMemo(() => ({ field: listState.sort, dir: listState.dir }), [listState.sort, listState.dir]);
  function setSort(field, dir) {
    setFilter({ sort: field, dir });
  }
  const canReorder = sort.field === "ordre" && sort.dir === "asc";

  const rayonNom = useMemo(() => {
    const m = new Map();
    rayonsOptions.forEach((r) => m.set(r.slug, r.nom));
    return (slug) => m.get(slug) ?? slug;
  }, [rayonsOptions]);

  const filtered = useMemo(() => {
    return produits.filter((p) => {
      /* Scope filters (forced by parent page; not user-editable). */
      if (scope?.rayon && p.rayon !== scope.rayon) return false;
      if (scope?.categorie && p.categorie !== scope.categorie) return false;
      if (scope?.sous_categorie && p.sous_categorie !== scope.sous_categorie) return false;
      /* Special view: orphans at the current scope level. */
      if (scope?.view === "orphelins") {
        if (scope?.sous_categorie) {
          /* Shouldn't normally happen (sub-scope is already a leaf), guard anyway. */
        } else if (scope?.categorie) {
          /* Sub-orphans within a categorie : sub_categorie not in the known list. */
          const known = scope.knownSousCategorieLabels ?? [];
          if (!p.sous_categorie) return true;
          if (known.includes(p.sous_categorie)) return false;
        } else if (scope?.rayon) {
          /* Cat-orphans within a rayon : categorie not in the known list. */
          const known = scope.knownCategorieLabels ?? [];
          if (!p.categorie) return true;
          if (known.includes(p.categorie)) return false;
        }
      }
      /* User-controllable filters (ignored for scoped fields). */
      if (!scope?.rayon && filter.rayon && p.rayon !== filter.rayon) return false;
      if (filter.statut === "active" && !p.actif) return false;
      if (filter.statut === "inactive" && p.actif) return false;
      if (filter.statut === "sans-image" && p.image_url) return false;
      if (filter.statut === "avec-image" && !p.image_url) return false;
      if (filter.recent) {
        /* `updated_at` is set by the SQL trigger ; falling back to
         * `created_at` keeps the filter useful even on rows imported
         * before the trigger existed. */
        const ts = Date.parse(p.updated_at ?? p.created_at ?? "");
        if (!Number.isFinite(ts)) return false;
        const windowMs = filter.recent === "7d" ? 7 * 86_400_000 : 86_400_000;
        if (Date.now() - ts > windowMs) return false;
      }
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const hay = `${p.nom} ${p.slug} ${p.description ?? ""} ${p.origine ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [produits, filter, scope]);

  /* New-product prefill helper. In scope mode, the new row is pre-filled
   * with the locked rayon / categorie / sous_categorie so the operator
   * doesn't have to pick them again. */
  function openNewProduit() {
    setEditing({
      ...EMPTY_PRODUIT,
      rayon: scope?.rayon ?? "",
      categorie: scope?.categorie ?? "",
      sous_categorie: scope?.sous_categorie ?? "",
    });
  }

  /* Sorted + grouped by rayon for the card layout.
   * When sort.field === 'ordre', items preserve the server's ordre sequence
   * because produits is fetched sorted by ordre. For any other sort field,
   * we explicitly sort within each rayon group so the UI reflects the choice. */
  const grouped = useMemo(() => {
    const sorted = [...filtered];
    if (sort.field && sort.field !== "ordre") {
      sorted.sort((a, b) => compareRows(a, b, sort.field, sort.dir));
    } else if (sort.dir === "desc") {
      sorted.reverse();
    }
    const map = new Map();
    sorted.forEach((p) => {
      if (!map.has(p.rayon)) map.set(p.rayon, []);
      map.get(p.rayon).push(p);
    });
    return Array.from(map.entries()).sort((a, b) =>
      rayonNom(a[0]).localeCompare(rayonNom(b[0]), "fr")
    );
  }, [filtered, rayonNom, sort]);

  /* Selection helpers. In ProduitsManager the layout is grouped by rayon,
   * so there is no global "select all" checkbox; instead each rayon header
   * has its own select-all-in-rayon via `toggleSelectRayon`. */
  function toggleSelected(id) {
    setSelected((cur) => {
      const nxt = new Set(cur);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  }
  function toggleSelectRayon(rayonSlug) {
    const ids = filtered.filter((p) => p.rayon === rayonSlug).map((p) => p.id);
    if (ids.length === 0) return;
    const allInRayonSelected = ids.every((id) => selected.has(id));
    setSelected((cur) => {
      const nxt = new Set(cur);
      if (allInRayonSelected) ids.forEach((id) => nxt.delete(id));
      else ids.forEach((id) => nxt.add(id));
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

  async function toggleActif(row) {
    const next = { ...row, actif: !row.actif };
    setProduits((cur) => cur.map((p) => (p.id === row.id ? next : p)));
    try {
      const res = await adminFetch(`/api/admin/produits/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: next.actif }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { produit } = await res.json();
      setProduits((cur) => cur.map((p) => (p.id === row.id ? produit : p)));
    } catch (err) {
      setProduits((cur) => cur.map((p) => (p.id === row.id ? row : p)));
      notify("err", `Erreur : ${humanizeError(err)}`);
    }
  }

  /* Deferred single-row delete : the row is hidden from the list right
   * away ; the actual API DELETE only fires after 8 s if the user
   * hasn't clicked "Annuler". Two benefits over the previous
   * confirm()-then-immediate-DELETE flow :
   *   1. Restoring is free (just cancel the timer) — no API round-trip,
   *      no risk of re-creating with a fresh id.
   *   2. Removes the modal blocker. Multiple deletes can stack ; each
   *      one queues its own timer. */
  function deleteProduit(row) {
    /* If a previous delete is still pending, commit it now so the new
     * one can replace it cleanly. Avoids racing two timers on the same
     * row state. */
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      void commitPendingDelete(pendingDelete.row);
    }
    setProduits((cur) => cur.filter((p) => p.id !== row.id));
    const timer = setTimeout(() => {
      void commitPendingDelete(row);
    }, 8000);
    setPendingDelete({ row, timer, deadline: Date.now() + 8000 });
  }

  async function commitPendingDelete(row) {
    /* Clear the pending state up-front so the snackbar disappears
     * regardless of whether the API call succeeds. We re-queue the row
     * on failure (rollback) below. */
    setPendingDelete((cur) => (cur && cur.row.id === row.id ? null : cur));
    try {
      const res = await adminFetch(`/api/admin/produits/${row.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      }
      notify("ok", `« ${row.nom} » supprimé.`);
    } catch (err) {
      /* API delete failed — bring the row back exactly where it was.
       * `produits` may have been mutated since deletion (other deletes,
       * filters changing) so we just push it back, sort happens on
       * next render via `compareRows`. */
      setProduits((cur) => (cur.some((p) => p.id === row.id) ? cur : [...cur, row]));
      notify("err", `Erreur : ${humanizeError(err)}`);
    }
  }

  function undoPendingDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    const { row } = pendingDelete;
    setPendingDelete(null);
    setProduits((cur) => (cur.some((p) => p.id === row.id) ? cur : [...cur, row]));
    notify("ok", `« ${row.nom} » restauré.`);
  }

  async function saveProduit(form) {
    const isNew = !form.id;
    const payload = {
      slug: form.slug,
      nom: form.nom,
      description: form.description,
      image_url: form.image_url || null,
      prix_indicatif: form.prix_indicatif === "" ? null : Number(form.prix_indicatif),
      unite: form.unite || null,
      rayon: form.rayon,
      categorie: form.categorie || null,
      sous_categorie: form.sous_categorie || null,
      origine: form.origine || null,
      badge: form.badge || null,
      actif: form.actif !== false,
      ordre: Number(form.ordre) || 0,
    };
    /* Pass `draftKey` + `draftValue` so a 401 mid-submit (expired
     * cookie) stashes the form in sessionStorage before redirecting
     * to /admin/login. The EditModal's own debounced auto-save also
     * keeps the draft fresh while typing — this is just belt-and-
     * braces for the exact moment of POST. */
    const draftKey = isNew ? "admin.draft.produit.new" : `admin.draft.produit.${form.id}`;
    try {
      let res;
      if (isNew) {
        res = await adminFetch(`/api/admin/produits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          draftKey,
          draftValue: form,
        });
      } else {
        res = await adminFetch(`/api/admin/produits/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          draftKey,
          draftValue: form,
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { produit } = await res.json();
      if (isNew) {
        setProduits((cur) => [...cur, produit]);
      } else {
        setProduits((cur) => cur.map((p) => (p.id === produit.id ? produit : p)));
      }
      /* Saved cleanly — discard any draft we'd been keeping for this
       * row so re-opening the modal doesn't restore stale values. */
      clearDraft(draftKey);
      setEditing(null);
      notify("ok", isNew ? "Produit créé." : "Produit mis à jour.");
    } catch (err) {
      notify("err", `Erreur : ${humanizeError(err)}`);
    }
  }

  async function bulkImport(arr) {
    try {
      const res = await adminFetch(`/api/admin/produits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produits: arr }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { count } = await res.json();
      const refreshed = await adminFetch(`/api/admin/produits`).then((r) => r.json());
      setProduits(refreshed.produits ?? []);
      setImporting(false);
      notify("ok", `${count} produit(s) importé(s).`);
    } catch (err) {
      notify("err", `Erreur import : ${humanizeError(err)}`);
    }
  }

  async function refreshProduits() {
    try {
      const res = await adminFetch(`/api/admin/produits`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setProduits(data.produits ?? []);
    } catch (err) {
      notify("err", `Erreur rafraîchissement : ${humanizeError(err)}`);
    }
  }

  async function onMassMatchApplied(summary) {
    await refreshProduits();
    const parts = [`${summary.applied} image(s) associée(s)`];
    if (summary.failed > 0) parts.push(`${summary.failed} échec(s)`);
    if (summary.skipped > 0) parts.push(`${summary.skipped} ignorée(s)`);
    notify("ok", parts.join(" · "));
  }

  /* ---------------- Bulk actions ---------------- */
  async function bulkAction(action) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const snapshot = produits;

    if (action === "delete") {
      if (!confirm(`Supprimer ${ids.length} produit(s) ? Vous aurez 8 s pour annuler.`)) return;
      setProduits((cur) => cur.filter((p) => !selected.has(p.id)));
      clearSelection();
    } else if (action === "activate" || action === "deactivate") {
      const val = action === "activate";
      setProduits((cur) =>
        cur.map((p) => (selected.has(p.id) ? { ...p, actif: val } : p))
      );
    }

    try {
      const res = await adminFetch(`/api/admin/produits/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { affected } = await res.json();

      if (action === "delete") {
        const msg = `${affected} produit(s) supprimé(s).`;
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
        notify("ok", `${affected} produit(s) mis à jour.`);
      }
    } catch (err) {
      setProduits(snapshot);
      notify("err", `Erreur : ${humanizeError(err)}`);
    }
  }

  /* ---------------- Bulk patch (e.g. change rayon for N rows) ---------------- */
  async function bulkPatch(patch) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const snapshot = produits;
    setProduits((cur) => cur.map((p) => (selected.has(p.id) ? { ...p, ...patch } : p)));
    try {
      const res = await adminFetch(`/api/admin/produits/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "patch", patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { affected } = await res.json();
      clearSelection();
      notify("ok", `${affected} produit(s) mis à jour.`);
    } catch (err) {
      setProduits(snapshot);
      notify("err", `Erreur : ${humanizeError(err)}`);
    }
  }

  async function undoBulkDelete() {
    if (!undoData) return;
    const rows = undoData.snapshot;
    if (undoData.timer) clearTimeout(undoData.timer);
    setUndoData(null);
    try {
      const res = await adminFetch(`/api/admin/produits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produits: rows }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      await refreshProduits();
      notify("ok", `${rows.length} produit(s) restauré(s).`);
    } catch (err) {
      notify("err", `Restauration impossible : ${humanizeError(err)}`);
    }
  }

  /* ---------------- Reorder within a rayon ---------------- */
  async function persistReorder(rows) {
    const payload = rows.map((p, i) => ({ id: p.id, ordre: i }));
    try {
      const res = await adminFetch(`/api/admin/produits/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    } catch (err) {
      notify("err", `Erreur réorganisation : ${humanizeError(err)}`);
    }
  }

  function moveRowInRayon(id, delta) {
    const row = produits.find((p) => p.id === id);
    if (!row) return;
    const rayonItems = grouped.find(([r]) => r === row.rayon)?.[1] ?? [];
    const idx = rayonItems.findIndex((p) => p.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= rayonItems.length) return;
    const nextRayon = [...rayonItems];
    const [moved] = nextRayon.splice(idx, 1);
    nextRayon.splice(target, 0, moved);
    applyRayonReorder(row.rayon, nextRayon);
  }

  function applyRayonReorder(rayonSlug, nextRayonItems) {
    /* Assign local indices 0..N within the rayon, then merge back
     * into the global produits list. `ordre` is re-indexed globally so
     * sort-by-ordre still produces stable output. */
    const newRayonOrderIds = nextRayonItems.map((p) => p.id);
    const others = produits.filter((p) => p.rayon !== rayonSlug);
    const reindexed = [];
    /* Walk original produits order, but when we hit any row of this rayon,
     * substitute the next id from the new order. */
    let cursor = 0;
    for (const p of produits) {
      if (p.rayon !== rayonSlug) {
        reindexed.push(p);
      } else {
        const nextId = newRayonOrderIds[cursor++];
        const nextRow = produits.find((q) => q.id === nextId);
        if (nextRow) reindexed.push(nextRow);
      }
    }
    /* Re-assign ordre globally for a clean sequence. */
    const withOrdre = reindexed.map((p, i) => ({ ...p, ordre: i }));
    setProduits(withOrdre);
    persistReorder(withOrdre);
    /* others is intentionally unused but kept for readability of the algo. */
    void others;
  }

  function onDragStart(id) {
    setDragId(id);
  }
  function onDragOverRow(e, id) {
    if (!dragId || dragId === id) return;
    const a = produits.find((p) => p.id === dragId);
    const b = produits.find((p) => p.id === id);
    if (!a || !b || a.rayon !== b.rayon) return; /* only within-rayon */
    e.preventDefault();
    setDragOverId(id);
  }
  function onDropRow(id) {
    if (!dragId || dragId === id) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const a = produits.find((p) => p.id === dragId);
    const b = produits.find((p) => p.id === id);
    if (!a || !b || a.rayon !== b.rayon) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const rayonItems = grouped.find(([r]) => r === a.rayon)?.[1] ?? [];
    const from = rayonItems.findIndex((p) => p.id === dragId);
    const to = rayonItems.findIndex((p) => p.id === id);
    if (from < 0 || to < 0) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const next = [...rayonItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    setDragOverId(null);
    applyRayonReorder(a.rayon, next);
  }

  /* ---------------- Deep-link hashes (#new, #import) -------------- */
  /* Run once on mount. Lets the dashboard "Actions rapides" tiles
   * land directly on an open modal. We strip the hash afterwards so
   * a refresh doesn't re-open it. The #new path uses openNewProduit
   * so any active scope (rayon/categorie/sous_categorie) pre-fills. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash;
    if (h === "#new") {
      openNewProduit();
    } else if (h === "#import") {
      setImporting(true);
    } else {
      return;
    }
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      /* harmless */
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* ---------------- List-level keyboard shortcuts ---------------- */
  useEffect(() => {
    function onKey(e) {
      if (editing || importing || massMatching || imageSearching) return;
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (editable) {
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
        openNewProduit();
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
  }, [editing, importing, massMatching, imageSearching, selected.size, reorderMode]);

  /* Prune selection when rows disappear (e.g. after filter change or delete). */
  useEffect(() => {
    setSelected((cur) => {
      let changed = false;
      const nxt = new Set();
      for (const id of cur) {
        if (produits.some((p) => p.id === id)) nxt.add(id);
        else changed = true;
      }
      return changed ? nxt : cur;
    });
  }, [produits]);

  return (
    <div className="pb-20 md:pb-0">
      {/* Sticky toolbar */}
      <div id="produits-toolbar" className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 pt-2 pb-3 bg-creme/85 backdrop-blur-md">
        <div className="bg-white rounded-3xl shadow-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 relative">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Rechercher nom, slug, origine…  (raccourci : /)"
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
            {!scope?.rayon && (
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
            )}
            <select
              value={filter.statut}
              onChange={(e) => setFilter({ statut: e.target.value })}
              className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
              <option value="sans-image">Sans image</option>
              <option value="avec-image">Avec image</option>
            </select>
            <select
              value={`${sort.field}:${sort.dir}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split(":");
                setSort(f, d);
              }}
              className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
              aria-label="Trier"
            >
              <option value="ordre:asc">Tri : ordre manuel</option>
              <option value="nom:asc">Tri : nom A→Z</option>
              <option value="nom:desc">Tri : nom Z→A</option>
              <option value="prix_indicatif:asc">Tri : prix croissant</option>
              <option value="prix_indicatif:desc">Tri : prix décroissant</option>
              <option value="updated_at:desc">Tri : récents</option>
            </select>
            {/* "Récemment modifiés" — answers "what did I touch
             * yesterday ?" without leaving the list view. Clicking
             * cycles "" → "24h" → "7d" → "" so a single button covers
             * both windows and clears itself. */}
            <button
              type="button"
              onClick={() => {
                const next =
                  filter.recent === "" ? "24h" : filter.recent === "24h" ? "7d" : "";
                setFilter({ recent: next });
              }}
              aria-pressed={filter.recent !== ""}
              title="Filtrer par date de modification (24 h / 7 j)"
              className={`px-3 py-2 rounded-full text-[13px] font-bold transition inline-flex items-center gap-1.5 ${
                filter.recent
                  ? "bg-vert text-white hover:bg-vert-dark"
                  : "bg-white border border-black/10 hover:border-noir text-noir"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {filter.recent === "24h" ? "24 h" : filter.recent === "7d" ? "7 j" : "Récents"}
            </button>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {canReorder && (
              <button
                type="button"
                onClick={() => setReorderMode((m) => !m)}
                aria-pressed={reorderMode}
                title={reorderMode ? "Sortir du mode réorganisation (Esc)" : "Activer le glisser-déposer dans chaque rayon"}
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
              onClick={() => setMassMatching(true)}
              className="px-4 py-2 rounded-full bg-white border-2 border-noir text-[13px] font-bold hover:bg-noir hover:text-white transition inline-flex items-center gap-1.5"
              title="Glisser-déposer plusieurs images et les associer automatiquement aux produits"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Images (auto-match)
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="px-4 py-2 rounded-full bg-white border-2 border-black/10 text-[13px] font-bold hover:border-vert hover:text-vert transition"
              title="Importer un CSV ou JSON (fichier ou copier/coller)"
            >
              Importer CSV/JSON
            </button>
            <ExportMenu rows={filtered} totalRows={produits.length} />
            <button
              type="button"
              onClick={openNewProduit}
              title="Créer un produit (n)"
              className="px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
            >
              + Nouveau produit
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Filtres actifs :
            </span>
            {filter.q && (
              <FilterChip label={`« ${filter.q} »`} onRemove={() => setFilter({ q: "" })} />
            )}
            {!scope?.rayon && filter.rayon && (
              <FilterChip
                label={`Rayon : ${rayonNom(filter.rayon)}`}
                onRemove={() => setFilter({ rayon: "" })}
              />
            )}
            {filter.statut !== "all" && (
              <FilterChip
                label={`Statut : ${
                  {
                    active: "actifs",
                    inactive: "inactifs",
                    "sans-image": "sans image",
                    "avec-image": "avec image",
                  }[filter.statut] ?? filter.statut
                }`}
                onRemove={() => setFilter({ statut: "all" })}
              />
            )}
            {filter.recent && (
              <FilterChip
                label={`Modifiés : ${filter.recent === "24h" ? "24 h" : "7 j"}`}
                onRemove={() => setFilter({ recent: "" })}
              />
            )}
            {(sort.field !== "ordre" || sort.dir !== "asc") && (
              <FilterChip
                tone="sort"
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

      {/* Count + reorder-mode hint */}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-neutral-500">
          <strong className="text-noir">{filtered.length}</strong> produit(s) affiché(s)
          {produits.length !== filtered.length && (
            <span> sur <strong className="text-noir">{produits.length}</strong> au total</span>
          )}
        </p>
        {reorderMode && (
          <span className="inline-block px-3 py-1 rounded-full bg-rouge/10 text-rouge font-bold text-[11px] uppercase tracking-wider">
            → Mode réorganisation : glissez dans le même rayon ou utilisez ↑↓
          </span>
        )}
      </div>

      {/* Grouped by rayon */}
      {grouped.length === 0 ? (
        <div className="mt-4 bg-white rounded-3xl shadow-card overflow-hidden">
          {scope?.view === "orphelins" ? (
            <EmptyState
              tone="vert"
              icon="🎉"
              title="Aucun produit orphelin"
              description="Tous les produits de ce scope sont correctement rattachés à la taxonomie. Beau travail !"
            />
          ) : scope?.displayLabel ? (
            <EmptyState
              title={`Aucun produit dans ${scope.displayLabel}`}
              description="Cette catégorie est vide. Ajoutez le premier produit pour la peupler — il sera automatiquement rattaché au scope actuel."
              primaryLabel="+ Ajouter le premier produit"
              primaryOnClick={openNewProduit}
              secondaryLabel="Importer en masse"
              secondaryOnClick={() => setImporting(true)}
            />
          ) : (filter.q || filter.recent || (filter.statut !== "all") || filter.rayon) ? (
            <EmptyState
              icon="🔎"
              title="Aucun produit ne correspond aux filtres"
              description="Essayez d'élargir la recherche, ou réinitialisez les filtres pour voir tout le catalogue."
              primaryLabel="Réinitialiser les filtres"
              primaryOnClick={resetFilter}
            />
          ) : (
            <EmptyState
              title="Aucun produit"
              description="Créez votre premier produit ou importez un fichier JSON / CSV pour commencer à remplir le catalogue."
              primaryLabel="+ Nouveau produit"
              primaryOnClick={openNewProduit}
              secondaryLabel="Importer JSON / CSV"
              secondaryOnClick={() => setImporting(true)}
            />
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {grouped.map(([rayonSlug, items]) => {
            const rayonIds = items.map((p) => p.id);
            const allRayonSelected = rayonIds.length > 0 && rayonIds.every((id) => selected.has(id));
            const someRayonSelected = rayonIds.some((id) => selected.has(id));
            return (
            <section key={rayonSlug} className="bg-white rounded-3xl shadow-card overflow-hidden">
              <header className="bg-creme px-5 py-3 border-b border-black/5 flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allRayonSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someRayonSelected && !allRayonSelected;
                    }}
                    onChange={() => toggleSelectRayon(rayonSlug)}
                    aria-label={`Tout sélectionner dans ${rayonNom(rayonSlug)}`}
                    className="w-4 h-4 accent-vert"
                  />
                  <h2 className="font-soft font-bold text-[16px]">{rayonNom(rayonSlug)}</h2>
                </label>
                <span className="text-[12px] text-neutral-500">{items.length} produit(s)</span>
              </header>
              <ul className="divide-y divide-black/5">
                {items.map((p, i) => {
                  const isSel = selected.has(p.id);
                  const isDragOver = reorderMode && dragOverId === p.id;
                  return (
                  <li
                    key={p.id}
                    onDragOver={reorderMode ? (e) => onDragOverRow(e, p.id) : undefined}
                    onDrop={reorderMode ? () => onDropRow(p.id) : undefined}
                    className={[
                      "flex items-center gap-3 px-4 md:px-5 py-3 transition",
                      isSel ? "bg-vert/5" : "hover:bg-creme/50",
                      isDragOver ? "outline outline-2 outline-vert -outline-offset-2" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelected(p.id)}
                      aria-label={`Sélectionner ${p.nom}`}
                      className="w-4 h-4 accent-vert cursor-pointer shrink-0"
                    />
                    {reorderMode && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span
                          draggable
                          onDragStart={() => onDragStart(p.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverId(null);
                          }}
                          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-noir select-none"
                          title="Glisser pour déplacer (dans ce rayon)"
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
                            onClick={() => moveRowInRayon(p.id, -1)}
                            disabled={i === 0}
                            aria-label="Monter d'un rang"
                            className="w-4 h-4 text-neutral-400 hover:text-noir disabled:opacity-30 transition flex items-center justify-center"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0 10 6H0z" /></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRowInRayon(p.id, +1)}
                            disabled={i === items.length - 1}
                            aria-label="Descendre d'un rang"
                            className="w-4 h-4 text-neutral-400 hover:text-noir disabled:opacity-30 transition flex items-center justify-center"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 6 0 0h10z" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover ring-1 ring-black/5 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-creme flex items-center justify-center text-neutral-300 shrink-0">
                        —
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-noir truncate">{p.nom}</p>
                        {p.badge && (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-rouge/10 text-rouge font-bold text-[10px] uppercase tracking-wider">
                            {p.badge}
                          </span>
                        )}
                        {p.origine && (
                          <span className="text-[11px] text-neutral-400">· {p.origine}</span>
                        )}
                      </div>
                      <p className="text-[12px] text-neutral-500 truncate">
                        {p.slug}
                        {p.prix_indicatif != null && (
                          <span className="ml-2 text-neutral-600">
                            — indicatif : <strong>{fmtPrice(p.prix_indicatif)}{p.unite ? " / " + p.unite : ""}</strong>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActif(p)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition ${
                          p.actif
                            ? "bg-vert/15 text-vert-dark hover:bg-vert/25"
                            : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
                        }`}
                      >
                        {p.actif ? "● Actif" : "○ Inactif"}
                      </button>
                      {!p.image_url && (
                        <button
                          type="button"
                          onClick={() => setImageSearching(p)}
                          className="px-3 py-1 rounded-full bg-white border border-vert text-vert text-[12px] font-bold hover:bg-vert hover:text-white transition inline-flex items-center gap-1"
                          title="Chercher une image pour ce produit via OpenFoodFacts"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                          </svg>
                          Image
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="px-3 py-1 rounded-full bg-noir text-white text-[12px] font-bold hover:bg-noir-soft transition"
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProduit(p)}
                        aria-label="Supprimer"
                        className="w-8 h-8 rounded-full text-neutral-400 hover:bg-rouge/10 hover:text-rouge transition flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </section>
            );
          })}
        </div>
      )}

      {/* Bulk actions bar (shown when rows selected) */}
      <BulkActionsBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          { label: "Activer", onClick: () => bulkAction("activate") },
          { label: "Désactiver", onClick: () => bulkAction("deactivate") },
          {
            label: "Changer de rayon…",
            onClick: () => {
              const current = Array.from(new Set(
                produits.filter((p) => selected.has(p.id)).map((p) => p.rayon)
              ));
              const list = rayonsOptions.map((r) => `${r.slug} (${r.nom})`).join("\n");
              const hint = current.length === 1 ? `\n\nActuel : ${current[0]}` : "";
              const choice = prompt(
                `Entrez le slug du rayon cible :\n\n${list}${hint}`,
                current[0] ?? ""
              );
              if (!choice) return;
              const ok = rayonsOptions.some((r) => r.slug === choice);
              if (!ok) {
                notify("err", `Rayon inconnu : ${choice}`);
                return;
              }
              bulkPatch({ rayon: choice });
            },
          },
          { label: "Supprimer", tone: "danger", onClick: () => bulkAction("delete") },
        ]}
      />

      {/* Undo toast for bulk delete */}
      {undoData && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
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

      {/* Mobile-only thumb-reachable action bar. Hidden ≥ md. */}
      <MobileActionBar
        label="Produit"
        toolbarId="produits-toolbar"
        filterCount={
          (filter.q ? 1 : 0) +
          (filter.rayon ? 1 : 0) +
          (filter.statut !== "all" ? 1 : 0) +
          (filter.recent ? 1 : 0)
        }
        onNew={() => setEditing({ ...EMPTY_PRODUIT })}
      />

      {/* Single-row deferred-delete snackbar with countdown ring. */}
      {pendingDelete && (
        <UndoSnackbar
          row={pendingDelete.row}
          deadline={pendingDelete.deadline}
          label={`« ${pendingDelete.row.nom} » supprimé.`}
          onUndo={undoPendingDelete}
        />
      )}

      {editing && (
        <EditModal
          produit={editing}
          rayonsOptions={rayonsOptions}
          onCancel={() => setEditing(null)}
          onSave={saveProduit}
        />
      )}

      {importing && (
        <ImportModal
          currentProduits={produits}
          onCancel={() => setImporting(false)}
          onImport={bulkImport}
        />
      )}

      {massMatching && (
        <MassImageMatchModal
          rayonsOptions={rayonsOptions}
          onClose={() => setMassMatching(false)}
          onApplied={onMassMatchApplied}
        />
      )}

      {imageSearching && (
        <ProductImageSearchModal
          produit={imageSearching}
          onCancel={() => setImageSearching(null)}
          onToast={(level, msg) => notify(level === "error" ? "err" : "ok", msg)}
          onSaved={(updated) => {
            setProduits((list) =>
              list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
            );
            setImageSearching(null);
          }}
        />
      )}

      {toast && (
        <div
          /* `role="alert"` for errors (assertive) ; `status` for OK
           * (polite) so SRs interrupt only when something actually
           * went wrong. `aria-atomic` makes the whole message read,
           * not just the diff. */
          role={toast.type === "err" ? "alert" : "status"}
          aria-live={toast.type === "err" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full font-bold text-[13px] shadow-card ${
            toast.type === "ok" ? "bg-vert text-white" : "bg-rouge text-white"
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
function EditModal({ produit, rayonsOptions, onCancel, onSave }) {
  const isNew = !produit.id;
  const draftKey = isNew ? "admin.draft.produit.new" : `admin.draft.produit.${produit.id}`;

  /* On first mount we look in sessionStorage for a recent draft (saved
   * either by `adminFetch` after a 401, or by the debounced auto-save
   * below) and use it instead of the prop. We DON'T fall back to a
   * draft for an existing row whose underlying data has changed since
   * the snapshot — that's a future refinement ; for now we accept up
   * to 1 h of staleness, the same window adminFetch uses. */
  const [form, setForm] = useState(() => {
    const draft = loadDraft(draftKey);
    return draft && typeof draft === "object" ? { ...produit, ...draft } : { ...produit };
  });
  const [draftRestored, setDraftRestored] = useState(() => loadDraft(draftKey) != null);
  const [saving, setSaving] = useState(false);
  /* Slug uniqueness probe. null = unchecked, true/false = result. */
  const [slugStatus, setSlugStatus] = useState(null);
  const [slugChecking, setSlugChecking] = useState(false);
  /* Track whether the user has edited the slug by hand. Auto-suggest
   * from `nom` stops as soon as they do, so we never overwrite a
   * deliberate slug. */
  const [slugTouched, setSlugTouched] = useState(
    !!(produit.id || produit.slug) || !!loadDraft(draftKey),
  );
  const formRef = useRef(null);

  /* Debounced auto-save of the draft to sessionStorage so closing the
   * tab / browser crash / 401-during-typing all recover gracefully on
   * next mount. 400 ms is enough to coalesce typing without hammering
   * sessionStorage. */
  useEffect(() => {
    const h = setTimeout(() => saveDraft(draftKey, form), 400);
    return () => clearTimeout(h);
  }, [form, draftKey]);

  function set(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      /* Auto-fill slug from `nom` on new rows until the user has
       * deliberately touched the slug field. This removes the single
       * biggest friction point of the "Nouveau produit" flow — the
       * browser's "Please fill in this field" native popup on submit. */
      if (field === "nom" && isNew && !slugTouched) {
        next.slug = slugifyLocal(value);
      }
      return next;
    });
  }

  /* Debounced slug-uniqueness check via /api/admin/produits/slug-check.
   * Only runs when the slug changed from the original. */
  useEffect(() => {
    const s = (form.slug || "").trim();
    /* Slug unchanged from the row we're editing -> trivially ok. */
    if (!isNew && s === (produit.slug || "")) {
      setSlugStatus(null);
      return;
    }
    if (!s || !/^[a-z0-9-]+$/.test(s)) {
      setSlugStatus(null);
      return;
    }
    let cancelled = false;
    setSlugChecking(true);
    const h = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ slug: s });
        if (!isNew && produit.id) qs.set("exceptId", String(produit.id));
        const res = await adminFetch(`/api/admin/produits/slug-check?${qs.toString()}`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (!cancelled) setSlugStatus(!!data.available);
      } catch {
        if (!cancelled) setSlugStatus(null);
      } finally {
        if (!cancelled) setSlugChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [form.slug, isNew, produit.id, produit.slug]);

  const slugFormatInvalid =
    form.slug && !/^[a-z0-9-]+$/.test(form.slug) ? "Lettres min., chiffres, tirets uniquement." : null;
  const slugError =
    slugFormatInvalid || (slugStatus === false ? "Ce slug est déjà pris." : null);

  const canSave = !saving && !slugError;

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

  function discardDraft() {
    clearDraft(draftKey);
    setForm({ ...produit });
    setDraftRestored(false);
    /* For new rows we also reset the slug-touched flag so auto-suggest
     * resumes from a blank `nom`. */
    if (isNew) setSlugTouched(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-6">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-soft font-bold text-[20px]">
            {isNew ? "Nouveau produit" : `Éditer « ${produit.nom} »`}
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

        {draftRestored && (
          <div
            role="status"
            aria-live="polite"
            className="px-6 py-2.5 bg-orange-50 border-b border-orange-200 text-[12px] text-orange-900 flex items-center justify-between gap-3"
          >
            <span>↺ Brouillon restauré depuis votre dernière session.</span>
            <button
              type="button"
              onClick={discardDraft}
              className="font-bold text-orange-900 hover:underline shrink-0"
            >
              Repartir des valeurs initiales
            </button>
          </div>
        )}

        <form ref={formRef} onSubmit={submit} className="p-6 space-y-5">
          <Field label="Nom du produit" required>
            <input
              type="text"
              required
              value={form.nom}
              onChange={(e) => set("nom", e.target.value)}
              className="input"
              placeholder="Riz basmati parfumé"
            />
          </Field>

          <Field
            label="Slug"
            required
            hint="Identifiant unique, sans espaces/majuscules."
          >
            <div className="relative">
              <input
                type="text"
                required
                /* The dash and hyphen must be escaped inside a
                 * character class when the regex is compiled in
                 * Unicode-Sets (`v`) mode — which Chrome now does
                 * for HTML `pattern` attributes. An unescaped `-`
                 * there throws "Invalid character class" and voids
                 * the whole pattern. */
                pattern="[a-z0-9\-]+"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                className={`input pr-20 ${slugError ? "!border-rouge" : slugStatus === true ? "!border-vert" : ""}`}
                placeholder="riz-basmati-parfume"
                aria-invalid={!!slugError}
                aria-describedby={slugError ? "produit-slug-error" : undefined}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold uppercase tracking-wider pointer-events-none">
                {slugChecking ? (
                  <span className="text-neutral-400">…</span>
                ) : slugStatus === true ? (
                  <span className="text-vert">✓ libre</span>
                ) : slugStatus === false ? (
                  <span className="text-rouge">✗ pris</span>
                ) : null}
              </div>
            </div>
            {slugError && (
              <p id="produit-slug-error" className="mt-1 text-[12px] font-bold text-rouge">
                {slugError}
              </p>
            )}
          </Field>

          <Field label="Description">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              className="input min-h-[70px] resize-y"
              placeholder="Courte description (origine, variété, suggestion d'usage)."
            />
          </Field>

          <InlineImageUpload
            folder="produits"
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            renameTo={form.slug || form.nom}
            label="Image du produit"
            hint="Déposer une image l'envoie dans Supabase Storage. JPEG, PNG, WebP, AVIF. 8 Mo max."
          />

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
            <Field label="Origine" hint="Pays ou région.">
              <input
                type="text"
                value={form.origine ?? ""}
                onChange={(e) => set("origine", e.target.value)}
                className="input"
                placeholder="Sénégal, Inde, Portugal…"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Catégorie" hint="Niveau 1 de la taxonomie (drill-down sur la page rayon).">
              <input
                type="text"
                value={form.categorie ?? ""}
                onChange={(e) => set("categorie", e.target.value)}
                className="input"
                placeholder="Fruits, Viandes, Épices…"
              />
            </Field>
            <Field label="Sous-catégorie" hint="Niveau 2 optionnel (ex : « Dattes » sous « Fruits »).">
              <input
                type="text"
                value={form.sous_categorie ?? ""}
                onChange={(e) => set("sous_categorie", e.target.value)}
                className="input"
                placeholder="Dattes, Exotiques…"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Prix indicatif (€)" hint="Optionnel. Non affiché publiquement par défaut.">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.prix_indicatif ?? ""}
                onChange={(e) => set("prix_indicatif", e.target.value)}
                className="input"
                placeholder="2.90"
              />
            </Field>
            <Field label="Unité" hint="kg, pièce, litre, 500 g…">
              <input
                type="text"
                value={form.unite ?? ""}
                onChange={(e) => set("unite", e.target.value)}
                className="input"
                placeholder="kg"
              />
            </Field>
            <Field label="Badge" hint="Bio, AOP, Artisanal…">
              <input
                type="text"
                value={form.badge ?? ""}
                onChange={(e) => set("badge", e.target.value)}
                className="input"
                placeholder="Bio"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5 items-center">
            <label className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={!!form.actif}
                onChange={(e) => set("actif", e.target.checked)}
                className="w-4 h-4 rounded accent-vert"
              />
              <span>Actif (visible sur le site)</span>
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
              {saving ? "Enregistrement…" : isNew ? "Créer le produit" : "Enregistrer"}
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

/* ================================================================ */
/* Bulk import modal (JSON or CSV — auto-detected)                    */
/* ================================================================ */

/** Detect CSV vs JSON from the first non-whitespace character.
 *  `[` or `{` → JSON ; anything else → CSV. Strips UTF-8 BOM first. */
function detectFormat(text) {
  const clean = text.replace(/^\uFEFF/, "").trimStart();
  if (!clean) return "empty";
  const c0 = clean[0];
  if (c0 === "[" || c0 === "{") return "json";
  return "csv";
}

/** Minimal RFC-4180 CSV parser that handles :
 *  - UTF-8 BOM
 *  - comma OR semicolon separator (auto-detected from header line)
 *  - quoted fields with embedded separators, newlines, and ""-escaped quotes
 *  - CRLF and LF line endings
 *  - blank lines (dropped)
 *  Header row mandatory. Returns an array of plain objects using
 *  lower_snake_case header keys. */
function parseCSV(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const sep = semis > commas ? ";" : ",";

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === '"' && cell === "") {
        inQuotes = true;
      } else if (c === sep) {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v !== "")) rows.push(row);
  }

  if (rows.length < 2) throw new Error("CSV vide ou sans en-tête");
  /* Normalise headers into safe snake_case keys :
     - strip UTF-8 diacritics    ("Catégorie"   → "Categorie")
     - lowercase                 ("Categorie"   → "categorie")
     - turn any non-alphanum run ("Sous-catégorie" → "sous_categorie")
       into a single underscore
     - trim leading / trailing underscores                              */
  const headers = rows[0].map((h) =>
    String(h)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
  );
  return rows.slice(1).map((r, idx) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = (r[i] ?? "").trim();
      if (v !== "") obj[h] = v;
    });
    /* Boolean normalisation for `actif` if provided as text. */
    if ("actif" in obj) {
      const t = String(obj.actif).toLowerCase();
      obj.actif = !(t === "0" || t === "false" || t === "non" || t === "n" || t === "");
    }
    return obj;
  });
}

function ImportModal({ currentProduits, onCancel, onImport }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [format, setFormat] = useState(null); /* 'json' | 'csv' | null */
  const [err, setErr] = useState(null);
  const fileInputRef = useRef(null);

  function onPaste(v) {
    setText(v);
    if (!v.trim()) {
      setParsed(null);
      setErr(null);
      setFormat(null);
      return;
    }
    const fmt = detectFormat(v);
    setFormat(fmt);
    try {
      if (fmt === "json") {
        const obj = JSON.parse(v);
        const arr = Array.isArray(obj) ? obj : obj.produits;
        if (!Array.isArray(arr)) throw new Error("JSON doit être un tableau ou { produits: [...] }");
        setParsed(arr);
      } else if (fmt === "csv") {
        setParsed(parseCSV(v));
      } else {
        setParsed(null);
      }
      setErr(null);
    } catch (e) {
      setParsed(null);
      setErr(e.message);
    }
  }

  async function onFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      onPaste(txt);
    } catch (readErr) {
      setErr(`Lecture du fichier échouée : ${humanizeError(readErr)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const existingSlugs = new Set(currentProduits.map((p) => p.slug));
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
          <div>
            <h2 className="font-soft font-bold text-[20px]">Importer des produits</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              Coller du JSON ou CSV, ou charger un fichier. Format détecté automatiquement.
            </p>
          </div>
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
            <strong>JSON :</strong> tableau <code className="bg-white px-1 rounded">[...]</code> ou <code className="bg-white px-1 rounded">{`{ produits: [...] }`}</code>.
            <br />
            <strong>CSV :</strong> une ligne d'en-tête puis une ligne par produit. Séparateur <code>,</code> ou <code>;</code> auto-détecté.
            <br />
            <strong>Champs requis :</strong> slug, nom, rayon.
            <strong> Optionnels :</strong> description, image_url, prix_indicatif, unite, categorie, sous_categorie, origine, badge, actif, ordre.
            <br />
            Les slugs existants sont mis à jour, les nouveaux créés.
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={onFilePick}
              className="hidden"
              id="import-file-input"
            />
            <label
              htmlFor="import-file-input"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border-2 border-black/10 font-bold text-[13px] cursor-pointer hover:border-noir transition"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Charger un fichier
            </label>
            {format && format !== "empty" && (
              <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] uppercase tracking-wider">
                Format détecté : {format}
              </span>
            )}
            {text && (
              <button
                type="button"
                onClick={() => onPaste("")}
                className="text-[12px] text-neutral-500 hover:text-rouge transition"
              >
                Vider
              </button>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => onPaste(e.target.value)}
            className="w-full min-h-[220px] font-mono text-[12px] px-4 py-3 border border-black/10 rounded-2xl bg-creme resize-y focus:outline-none focus:border-vert"
            placeholder={
              'slug,nom,rayon,categorie,sous_categorie,origine\nriz-basmati,Riz basmati parfumé,produits-courants,"Céréales",,Inde\n\n-- ou JSON --\n[{"slug":"riz-basmati","nom":"Riz basmati","rayon":"produits-courants"}]'
            }
            spellCheck={false}
          />

          {err && (
            <div className="bg-rouge/5 border border-rouge/20 text-rouge rounded-2xl p-3 text-[13px]">
              <strong>{format === "csv" ? "CSV" : "JSON"} invalide :</strong> {err}
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
                      <th className="px-3 py-2 font-bold">Nom</th>
                      <th className="px-3 py-2 font-bold">Rayon</th>
                      <th className="px-3 py-2 font-bold">Catégorie</th>
                      <th className="px-3 py-2 font-bold">Origine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((p, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="px-3 py-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p._action === "Création"
                                ? "bg-vert/15 text-vert-dark"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {p._action}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono">{p.slug}</td>
                        <td className="px-3 py-1.5">{p.nom}</td>
                        <td className="px-3 py-1.5 text-neutral-500">{p.rayon}</td>
                        <td className="px-3 py-1.5 text-neutral-500">
                          {p.categorie ?? "—"}
                          {p.sous_categorie ? <span className="text-neutral-400"> / {p.sous_categorie}</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-500">{p.origine ?? "—"}</td>
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
              Publier {parsed?.length ?? 0} produit(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
