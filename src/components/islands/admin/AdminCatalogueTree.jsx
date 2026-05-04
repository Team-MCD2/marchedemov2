import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * AdminCatalogueTree — left-pane taxonomy tree mirroring the public site.
 *
 * Props
 * -----
 *   tree        : Array<RayonNode>     Built server-side from RAYONS + TAXONOMIE + live counts.
 *   activePath  : string               "" | "rayon" | "rayon/cat" | "rayon/cat/sub".
 *   publicUrl   : string | null        Optional "Voir sur le site public" link for the active scope.
 *
 * RayonNode shape (from SSR):
 * {
 *   kind: "rayon",
 *   slug, label, nomCourt, accent,
 *   href,
 *   counts: { total, actif, sansImage, promosActives, promosTotales, orphelin },
 *   children: CatNode[]
 * }
 *
 * CatNode / SubNode:
 * { kind: "cat" | "sub" | "orphelins", slug, label, href, counts, children?, isOrphan? }
 *
 * Behaviour
 * ---------
 *  - Search ("/ " focuses it) filters visible nodes.
 *  - Expanded-state persisted per rayon in localStorage.
 *  - Keyboard nav follows the WAI-ARIA tree pattern:
 *      ↑/↓ move the focused row, →/← expand/collapse, Enter navigates,
 *      Home/End jump to first/last.
 *  - Active path highlighted + ancestors auto-expanded.
 */

const STORAGE_KEY = "admin.catalogue.tree.expanded";

function readExpanded() {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeExpanded(map) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota, private mode — harmless */
  }
}

/* Normalise a string for fuzzy matching (strip accents, lowercase). */
function norm(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* Does this node or any descendant match the query? */
function matchesRec(node, q) {
  if (!q) return true;
  if (norm(node.label).includes(q)) return true;
  if (node.children) {
    return node.children.some((c) => matchesRec(c, q));
  }
  return false;
}

/**
 * @param {{
 *   tree?: any[],
 *   activePath?: string,
 *   publicUrl?: string | null,
 * }} props
 */
export default function AdminCatalogueTree({ tree = [], activePath = "", publicUrl = null }) {
  const [expanded, setExpanded] = useState(() => readExpanded());
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState(null);
  const searchRef = useRef(null);
  const containerRef = useRef(null);

  /* Ancestors of the active path auto-open. Fire once per activePath. */
  useEffect(() => {
    if (!activePath) return;
    const [rayonSlug, catSlug] = activePath.split("/");
    setExpanded((cur) => {
      const nxt = { ...cur };
      if (rayonSlug) nxt[rayonSlug] = true;
      if (rayonSlug && catSlug) nxt[`${rayonSlug}/${catSlug}`] = true;
      return nxt;
    });
  }, [activePath]);

  useEffect(() => {
    writeExpanded(expanded);
  }, [expanded]);

  function toggleExpanded(id) {
    setExpanded((cur) => ({ ...cur, [id]: !cur[id] }));
  }
  function setExpandedValue(id, value) {
    setExpanded((cur) => ({ ...cur, [id]: value }));
  }

  /* Filtered tree for search. Keeps ancestors of matches. */
  const q = norm(query.trim());
  const visibleTree = useMemo(() => {
    if (!q) return tree;
    return tree
      .map((rayon) => {
        if (norm(rayon.label).includes(q)) return rayon;
        const kids = (rayon.children ?? [])
          .map((cat) => {
            if (norm(cat.label).includes(q)) return cat;
            const subs = (cat.children ?? []).filter((s) => matchesRec(s, q));
            if (subs.length) return { ...cat, children: subs };
            return null;
          })
          .filter(Boolean);
        return kids.length ? { ...rayon, children: kids } : null;
      })
      .filter(Boolean);
  }, [tree, q]);

  /* When searching, expand every rayon that has a descendant match. */
  const searchExpanded = useMemo(() => {
    if (!q) return null;
    const map = {};
    for (const r of visibleTree) {
      map[r.slug] = true;
      for (const c of r.children ?? []) {
        map[`${r.slug}/${c.slug}`] = true;
      }
    }
    return map;
  }, [visibleTree, q]);

  const effectiveExpanded = searchExpanded ?? expanded;

  /* Flat list of visible nodes for keyboard cursor. */
  const flatVisible = useMemo(() => {
    const out = [];
    for (const r of visibleTree) {
      out.push({ id: r.slug, depth: 0, node: r, kind: "rayon" });
      if (effectiveExpanded[r.slug]) {
        for (const c of r.children ?? []) {
          const catId = `${r.slug}/${c.slug}`;
          out.push({ id: catId, depth: 1, node: c, kind: "cat" });
          if (effectiveExpanded[catId] && c.children) {
            for (const s of c.children) {
              out.push({ id: `${catId}/${s.slug}`, depth: 2, node: s, kind: "sub" });
            }
          }
        }
      }
    }
    return out;
  }, [visibleTree, effectiveExpanded]);

  /* Keep the focused id in sync with the active path on mount / when the
   * path changes. This means tab-focusing into the tree lands on the
   * selected node, not on the top. */
  useEffect(() => {
    if (activePath && flatVisible.some((r) => r.id === activePath)) {
      setFocusedId(activePath);
    } else if (!focusedId && flatVisible[0]) {
      setFocusedId(flatVisible[0].id);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [activePath]);

  /* Handle key input scoped to the container. */
  const onKeyDown = useCallback(
    (e) => {
      const idx = flatVisible.findIndex((r) => r.id === focusedId);
      const cur = idx >= 0 ? flatVisible[idx] : null;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = flatVisible[Math.min(idx + 1, flatVisible.length - 1)];
        if (next) setFocusedId(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = flatVisible[Math.max(idx - 1, 0)];
        if (prev) setFocusedId(prev.id);
      } else if (e.key === "Home") {
        e.preventDefault();
        if (flatVisible[0]) setFocusedId(flatVisible[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        const last = flatVisible[flatVisible.length - 1];
        if (last) setFocusedId(last.id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!cur) return;
        if (cur.node.children && cur.node.children.length) {
          if (!effectiveExpanded[cur.id]) {
            setExpandedValue(cur.id, true);
          } else {
            /* Already open — move to first child. */
            const childIdx = idx + 1;
            if (flatVisible[childIdx] && flatVisible[childIdx].depth > cur.depth) {
              setFocusedId(flatVisible[childIdx].id);
            }
          }
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!cur) return;
        if (cur.node.children && cur.node.children.length && effectiveExpanded[cur.id]) {
          setExpandedValue(cur.id, false);
        } else if (cur.depth > 0) {
          /* Walk back to parent. */
          for (let i = idx - 1; i >= 0; i--) {
            if (flatVisible[i].depth < cur.depth) {
              setFocusedId(flatVisible[i].id);
              break;
            }
          }
        }
      } else if (e.key === "Enter" || e.key === " ") {
        if (!cur) return;
        if (cur.node.href) {
          e.preventDefault();
          window.location.href = cur.node.href;
        }
      }
    },
    [flatVisible, focusedId, effectiveExpanded],
  );

  /* Global "/" focus on search while the tree is mounted, unless user
   * is already in an editable element. */
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "/") return;
      const t = e.target;
      const tag = t?.tagName?.toLowerCase();
      const editable =
        tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable;
      if (editable) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totalRayons = tree.length;
  const totalProduits = tree.reduce((s, r) => s + (r.counts?.total ?? 0), 0);

  return (
    <nav
      aria-label="Arborescence du catalogue"
      className="bg-white rounded-3xl shadow-card overflow-hidden"
    >
      {/* Header + search */}
      <div className="px-4 py-3 border-b border-black/5 bg-creme">
        <p className="font-soft font-bold text-[14px] text-noir">
          Catalogue
          <span className="ml-2 text-[11px] font-normal text-neutral-500">
            {totalProduits} produit(s) · {totalRayons} rayons
          </span>
        </p>
        <div className="mt-2 relative">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer…  (raccourci : /)"
            aria-label="Rechercher dans l'arbre"
            className="w-full px-3 py-1.5 pr-7 rounded-full border border-black/10 text-[12px] focus:border-vert focus:outline-none bg-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-neutral-400 hover:bg-neutral-100 flex items-center justify-center"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Top-level links */}
      <div className="px-3 py-2 border-b border-black/5 flex flex-col gap-0.5">
        <TopLink
          href="/admin/catalogue"
          label="Tous les rayons"
          active={activePath === ""}
          count={totalProduits}
        />
        <TopLink href="/admin/produits" label="Vue plate (tous les produits) →" muted />
        {publicUrl && (
          <TopLink
            href={publicUrl}
            label="Voir sur le site public ↗"
            muted
            external
          />
        )}
      </div>

      {/* Tree */}
      <div
        ref={containerRef}
        role="tree"
        aria-label="Rayons et catégories"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="py-1 max-h-[70vh] overflow-y-auto focus:outline-none"
      >
        {visibleTree.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-neutral-400 italic">
            Aucun nœud ne correspond à « {query} ».
          </p>
        ) : (
          visibleTree.map((rayon) => (
            <TreeRayon
              key={rayon.slug}
              rayon={rayon}
              activePath={activePath}
              expanded={effectiveExpanded}
              onToggle={toggleExpanded}
              focusedId={focusedId}
              setFocusedId={setFocusedId}
              searching={!!q}
            />
          ))
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-black/5 bg-creme/50 flex items-center gap-3 text-[10px] text-neutral-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-vert" />
          actifs
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          sans image
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rouge" />
          orphelins
        </span>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- */
/* Sub-components                                                    */
/* ---------------------------------------------------------------- */

function TopLink({ href, label, active = false, muted = false, count, external = false }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      className={`px-2 py-1.5 rounded-lg text-[12px] font-bold transition flex items-center justify-between ${
        active
          ? "bg-noir text-white"
          : muted
          ? "text-neutral-500 hover:bg-neutral-100"
          : "text-noir hover:bg-creme"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span>{label}</span>
      {count != null && (
        <span className={`text-[10px] ${active ? "text-white/70" : "text-neutral-400"}`}>
          {count}
        </span>
      )}
    </a>
  );
}

function TreeRayon({ rayon, activePath, expanded, onToggle, focusedId, setFocusedId, searching }) {
  const rayonId = rayon.slug;
  const isOpen = !!expanded[rayonId];
  const isActive = activePath === rayonId || activePath.startsWith(`${rayonId}/`);
  const isSelf = activePath === rayonId;
  const focused = focusedId === rayonId;
  return (
    <div role="none">
      <Row
        id={rayonId}
        depth={0}
        label={rayon.label}
        accent={rayon.accent}
        href={rayon.href}
        counts={rayon.counts}
        hasChildren={!!(rayon.children && rayon.children.length)}
        expanded={isOpen}
        onToggle={() => onToggle(rayonId)}
        isActive={isSelf}
        isOnActivePath={isActive && !isSelf}
        focused={focused}
        onFocus={() => setFocusedId(rayonId)}
      />
      {isOpen && rayon.children?.map((cat) => (
        <TreeCat
          key={cat.slug}
          rayonSlug={rayon.slug}
          cat={cat}
          activePath={activePath}
          expanded={expanded}
          onToggle={onToggle}
          focusedId={focusedId}
          setFocusedId={setFocusedId}
          searching={searching}
        />
      ))}
    </div>
  );
}

function TreeCat({ rayonSlug, cat, activePath, expanded, onToggle, focusedId, setFocusedId }) {
  const catId = `${rayonSlug}/${cat.slug}`;
  const isOpen = !!expanded[catId];
  const isActive = activePath === catId || activePath.startsWith(`${catId}/`);
  const isSelf = activePath === catId;
  const focused = focusedId === catId;
  return (
    <div role="none">
      <Row
        id={catId}
        depth={1}
        label={cat.label}
        href={cat.href}
        counts={cat.counts}
        isOrphan={cat.isOrphan}
        hasChildren={!!(cat.children && cat.children.length)}
        expanded={isOpen}
        onToggle={() => onToggle(catId)}
        isActive={isSelf}
        isOnActivePath={isActive && !isSelf}
        focused={focused}
        onFocus={() => setFocusedId(catId)}
      />
      {isOpen && cat.children?.map((sub) => {
        const subId = `${catId}/${sub.slug}`;
        const subActive = activePath === subId;
        const subFocused = focusedId === subId;
        return (
          <Row
            key={sub.slug}
            id={subId}
            depth={2}
            label={sub.label}
            href={sub.href}
            counts={sub.counts}
            isOrphan={sub.isOrphan}
            hasChildren={false}
            isActive={subActive}
            focused={subFocused}
            onFocus={() => setFocusedId(subId)}
          />
        );
      })}
    </div>
  );
}

/* One tree row — chevron + accent dot + label + count pills. */
function Row({
  depth,
  label,
  accent,
  href,
  counts,
  hasChildren,
  expanded,
  onToggle,
  isActive,
  isOnActivePath,
  focused,
  onFocus,
  isOrphan,
}) {
  const rowRef = useRef(null);

  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.focus({ preventScroll: false });
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focused]);

  const padLeft = 8 + depth * 14;

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? !!expanded : undefined}
      aria-selected={isActive}
      tabIndex={focused ? 0 : -1}
      ref={rowRef}
      onFocus={onFocus}
      className={`group flex items-center gap-1 pr-2 py-1 rounded-lg mx-2 transition outline-none ${
        isActive
          ? "bg-noir text-white"
          : isOnActivePath
          ? "bg-creme text-noir"
          : focused
          ? "bg-creme text-noir"
          : "hover:bg-creme/60"
      } ${isOrphan ? "italic" : ""}`}
      style={{ paddingLeft: padLeft }}
    >
      {/* Chevron */}
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          aria-label={expanded ? "Replier" : "Déplier"}
          className={`w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] ${
            isActive ? "text-white/80 hover:bg-white/10" : "text-neutral-400 hover:bg-black/5"
          }`}
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <path d="M3 1l4 4-4 4V1z" />
          </svg>
        </button>
      ) : (
        <span className="w-5 h-5 shrink-0" />
      )}

      {/* Accent dot for rayons */}
      {accent && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
      )}
      {!accent && isOrphan && (
        <span className="w-2 h-2 rounded-full bg-rouge shrink-0" aria-hidden="true" />
      )}

      {/* Label + href */}
      <a
        href={href}
        onClick={(e) => {
          /* Prevent double fire if the chevron was clicked */
          e.stopPropagation();
        }}
        className={`flex-1 min-w-0 truncate text-[12px] ${
          isActive ? "font-bold" : depth === 0 ? "font-bold" : "font-semibold"
        }`}
      >
        {label}
      </a>

      {/* Count pills */}
      {counts && (
        <span className="flex items-center gap-1 shrink-0 text-[10px]">
          {counts.orphelin > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full bg-rouge/10 text-rouge font-bold"
              title={`${counts.orphelin} produit(s) orphelin(s)`}
            >
              {counts.orphelin}⚠
            </span>
          )}
          {counts.sansImage > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full font-bold ${
                isActive ? "bg-white/15 text-white" : "bg-orange-100 text-orange-700"
              }`}
              title={`${counts.sansImage} produit(s) sans image`}
            >
              {counts.sansImage}🖼
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
              isActive
                ? "bg-white/20 text-white"
                : counts.total === 0
                ? "bg-neutral-100 text-neutral-400"
                : "bg-vert/15 text-vert-dark"
            }`}
            title={
              counts.actif != null
                ? `${counts.actif} actif(s) sur ${counts.total}`
                : `${counts.total} produit(s)`
            }
          >
            {counts.actif != null && counts.actif !== counts.total
              ? `${counts.actif}/${counts.total}`
              : counts.total}
          </span>
        </span>
      )}
    </div>
  );
}
