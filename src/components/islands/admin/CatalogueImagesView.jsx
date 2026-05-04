import { useMemo, useRef, useState, useEffect } from "react";

/**
 * CatalogueImagesView — DB-driven gallery of every image referenced by
 * a promo or a product, grouped by Rayon (public-site taxonomy).
 *
 * Why this exists
 * ---------------
 * The previous /admin/medias page listed *storage bucket* folders
 * (promos / produits / rayons / …). That's useful for raw file admin
 * but hides the real question the owner asks daily: "quel produit
 * dans mon catalogue n'a pas encore d'image ?" That answer lives in
 * the DB (`produits.image_url`, `promos.image_url`) — not in storage.
 *
 * So this view :
 *   - lists every promo + every product, sourced from `initialPromos`
 *     / `initialProduits` which are SSR-fetched from Supabase,
 *   - groups them under a "Promos" pseudo-section + one section per
 *     rayon (same order as the public site),
 *   - highlights rows missing an image,
 *   - deep-links each card to `/admin/catalogue/<rayon>/<cat>/<sub>`
 *     so clicking jumps to the scoped list where the image can be
 *     uploaded inline through the existing product edit modal.
 *
 * Raw storage object management stays in the sibling MediasManager —
 * toggled via the `?mode=storage` tab on the page.
 */

/* ---------------- Local slugify (matches lib/taxonomie.ts) ----------------
 * Kept local so this island doesn't pull in the TS helper module
 * (vite could then try to SSR-transform it, adding bundle weight).
 * Same behaviour : lower-case, strip accents, non-alnum → "-". */
function slugifyCat(label) {
  if (!label) return "";
  return String(label)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------------- Filter state helper ----------------
 * Three-way toggle : "all" | "with" | "without".
 * We keep the value in component state (no URL sync — the view is
 * transient, unlike the managers which persist their filters). */
const FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "with", label: "Avec image" },
  { id: "without", label: "Sans image" },
];

/* ---------------- Presentational cards ----------------
 * Kept as dumb components : the parent does all filtering/sorting.
 * Both cards fit the same ~180 × 220 tile so the grid stays uniform. */

function ImageThumb({ src, alt, accent }) {
  /* The `object-cover` + aspect-square frame makes portrait and
   * landscape photos look equally tidy in the grid. Lazy-load so a
   * rayon with 100 produits doesn't stall the first paint. */
  const [loaded, setLoaded] = useState(false);
  if (!src) {
    return (
      <div
        className="aspect-square w-full rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-dashed border-rouge/30 bg-rouge/5"
        aria-hidden="true"
      >
        <svg className="w-7 h-7 text-rouge/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="9" r="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] font-bold text-rouge/80 uppercase tracking-wider">
          Sans image
        </span>
      </div>
    );
  }
  return (
    <div
      className="aspect-square w-full rounded-2xl overflow-hidden bg-creme relative"
      style={{ "--accent": accent || "#1C6B35" }}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-black/5 to-black/10" />
      )}
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function ProductCard({ p, rayon }) {
  const catSlug = slugifyCat(p.categorie || "");
  const subSlug = slugifyCat(p.sous_categorie || "");
  const href = [
    "/admin/catalogue",
    p.rayon,
    catSlug || null,
    subSlug || null,
  ]
    .filter(Boolean)
    .join("/");
  return (
    <a
      href={href}
      className="group flex flex-col gap-2 rounded-2xl p-2 hover:bg-creme transition focus:outline-none focus:ring-2 focus:ring-vert/40"
      title={`Ouvrir « ${p.nom} » dans le catalogue`}
    >
      <ImageThumb src={p.image_url} alt={p.nom} accent={rayon?.accent} />
      <div className="px-1">
        <p className="text-[13px] font-bold text-noir leading-tight line-clamp-2">
          {p.nom}
        </p>
        {(p.categorie || p.sous_categorie) && (
          <p className="mt-0.5 text-[11px] text-neutral-500 line-clamp-1">
            {[p.categorie, p.sous_categorie].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {!p.actif && (
            <span className="inline-block px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600 text-[9px] font-bold uppercase tracking-wider">
              Inactif
            </span>
          )}
          {!p.image_url && (
            <span className="inline-block px-1.5 py-0.5 rounded-full bg-rouge/10 text-rouge text-[9px] font-bold uppercase tracking-wider">
              ⚠ Sans image
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function PromoCard({ p }) {
  /* Promos route to /admin/promos — the list already filters by rayon
   * on that page, so no deep-link parameter needed for now. */
  const img = p.image_url || null;
  return (
    <a
      href="/admin/promos"
      className="group flex flex-col gap-2 rounded-2xl p-2 hover:bg-creme transition focus:outline-none focus:ring-2 focus:ring-rouge/40"
      title={`Ouvrir « ${p.titre} » dans les promos`}
    >
      <ImageThumb src={img} alt={p.titre} accent="#8B1919" />
      <div className="px-1">
        <p className="text-[13px] font-bold text-noir leading-tight line-clamp-2">
          {p.titre}
        </p>
        {p.rayon && (
          <p className="mt-0.5 text-[11px] text-neutral-500 line-clamp-1 capitalize">
            {p.rayon.replace(/-/g, " ")}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {!p.actif && (
            <span className="inline-block px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600 text-[9px] font-bold uppercase tracking-wider">
              Inactif
            </span>
          )}
          {!img && (
            <span className="inline-block px-1.5 py-0.5 rounded-full bg-rouge/10 text-rouge text-[9px] font-bold uppercase tracking-wider">
              ⚠ Sans image
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/* ---------------- Section wrapper (header + grid) ---------------- */
function SectionCard({ id, accent, title, subtitle, count, withImageCount, children, empty }) {
  return (
    <section
      id={id}
      className="rounded-3xl bg-white border border-black/5 shadow-sm p-4 md:p-6 scroll-mt-28"
    >
      <header className="flex items-center gap-3 mb-4 flex-wrap">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ background: accent || "#1C6B35" }}
          aria-hidden="true"
        />
        <h2 className="text-[18px] md:text-[22px] font-soft font-bold text-noir">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[12px] text-neutral-500">{subtitle}</span>
        )}
        <span className="ml-auto text-[12px] text-neutral-500 tabular-nums">
          <strong className="text-noir">{withImageCount}</strong>
          <span className="text-neutral-400"> / {count}</span> avec image
        </span>
      </header>
      {empty ? (
        <p className="text-[13px] text-neutral-400 italic px-2 py-6 text-center">
          {empty}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
          {children}
        </div>
      )}
    </section>
  );
}

/* ---------------- Main island ---------------- */
export default function CatalogueImagesView({ initialPromos, initialProduits, rayons }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const searchRef = useRef(null);

  /* "/" keyboard shortcut focuses the search — matches the other
   * admin islands (ProduitsManager, PromosManager). Skip when the
   * user is already typing inside a control. */
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "/") return;
      const t = e.target;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();

  /* Predicate reused by both promos and produits.
   *  - "with"    → row must have a non-empty image_url,
   *  - "without" → row must lack it,
   *  - "all"     → no constraint.
   * The `isPromo` arg is kept for future divergence (e.g. if promos
   * later get a separate background-image column) without forcing
   * every call site to change. */
  function matchesFilter(row /* , isPromo */) {
    if (filter === "all") return true;
    const hasImage = Boolean(row.image_url);
    return filter === "with" ? hasImage : !hasImage;
  }

  function matchesQuery(row, isPromo) {
    if (!q) return true;
    const hay = isPromo
      ? [row.titre, row.slug, row.rayon]
      : [row.nom, row.slug, row.categorie, row.sous_categorie];
    return hay.some((v) => v && String(v).toLowerCase().includes(q));
  }

  /* Slice promos + group produits by rayon. Memoised because
   * 400+ rows × two filters re-render otherwise on every keystroke. */
  const promosFiltered = useMemo(
    () =>
      (initialPromos ?? []).filter(
        (p) => matchesFilter(p, true) && matchesQuery(p, true),
      ),
    [initialPromos, filter, q],
  );

  const produitsByRayon = useMemo(() => {
    const map = new Map();
    for (const p of initialProduits ?? []) {
      if (!matchesFilter(p, false)) continue;
      if (!matchesQuery(p, false)) continue;
      const key = p.rayon || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [initialProduits, filter, q]);

  /* Top-line totals — always reflect the *unfiltered* dataset so the
   * stats don't jitter while typing in the search box. */
  const totals = useMemo(() => {
    const totalProduits = (initialProduits ?? []).length;
    const produitsWith = (initialProduits ?? []).filter((p) => !!p.image_url).length;
    const totalPromos = (initialPromos ?? []).length;
    const promosWith = (initialPromos ?? []).filter((p) => !!p.image_url).length;
    return { totalProduits, produitsWith, totalPromos, promosWith };
  }, [initialProduits, initialPromos]);

  /* Rayon-level image-coverage counts, used in the quick-jump chips
   * and the section header "X / Y avec image" pill. */
  function rayonCounts(rayonSlug) {
    const all = (initialProduits ?? []).filter((p) => p.rayon === rayonSlug);
    const withImage = all.filter((p) => !!p.image_url).length;
    return { total: all.length, withImage };
  }

  const sortedRayons = (rayons ?? []).slice().sort((a, b) => a.ordre - b.ordre);

  /* "Orphan" rayon = a DB value that doesn't match any known slug.
   * We still surface those so the owner can clean up. */
  const knownSlugs = new Set(sortedRayons.map((r) => r.slug));
  const orphanRayonSlugs = Array.from(
    new Set(
      (initialProduits ?? [])
        .map((p) => p.rayon)
        .filter((r) => r && !knownSlugs.has(r)),
    ),
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ----- Toolbar : search + filter chips + quick-jump ----- */}
      <div className="sticky top-[64px] md:top-[72px] z-20 bg-creme/90 backdrop-blur-sm -mx-4 md:mx-0 px-4 md:px-0 py-3 border-b border-black/5 md:border-0">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer (raccourci : /)"
              className="w-full pl-9 pr-3 py-2 bg-white rounded-full border-2 border-black/10 text-[13px] focus:border-noir focus:outline-none transition"
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
                    active
                      ? "bg-noir text-white"
                      : "bg-white border-2 border-black/10 hover:border-noir text-noir"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick-jump strip */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
          <a
            href="#promos"
            className="shrink-0 px-2.5 py-1 rounded-full bg-white border-2 border-black/10 hover:border-noir text-[11px] font-bold transition"
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
              style={{ background: "#8B1919" }}
            />
            Promos
          </a>
          {sortedRayons.map((r) => {
            const { total, withImage } = rayonCounts(r.slug);
            if (total === 0) return null;
            return (
              <a
                key={r.slug}
                href={`#${r.slug}`}
                className="shrink-0 px-2.5 py-1 rounded-full bg-white border-2 border-black/10 hover:border-noir text-[11px] font-bold transition whitespace-nowrap"
                title={`${r.nom} — ${withImage}/${total} avec image`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ background: r.accent || "#1C6B35" }}
                />
                {r.nomCourt || r.nom}
                <span className="ml-1 text-neutral-400 font-normal">
                  {withImage}/{total}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      {/* ----- Promos section ----- */}
      <SectionCard
        id="promos"
        accent="#8B1919"
        title="Promos"
        subtitle={
          totals.totalPromos > 0
            ? `${totals.totalPromos} promo(s) enregistrée(s)`
            : "aucune promo"
        }
        count={totals.totalPromos}
        withImageCount={totals.promosWith}
        empty={promosFiltered.length === 0 ? "Aucune promo ne correspond aux filtres." : null}
      >
        {promosFiltered.map((p) => (
          <PromoCard key={p.id} p={p} />
        ))}
      </SectionCard>

      {/* ----- Per-rayon sections ----- */}
      {sortedRayons.map((r) => {
        const { total, withImage } = rayonCounts(r.slug);
        const items = produitsByRayon.get(r.slug) ?? [];
        /* Hide rayons with zero products both before AND after filter —
         * otherwise the page is a wall of empty headers on narrow queries. */
        if (total === 0) return null;
        return (
          <SectionCard
            key={r.slug}
            id={r.slug}
            accent={r.accent}
            title={r.nom}
            subtitle={r.nomCourt && r.nomCourt !== r.nom ? r.nomCourt : null}
            count={total}
            withImageCount={withImage}
            empty={items.length === 0 ? "Aucun produit ne correspond aux filtres." : null}
          >
            {items.map((p) => (
              <ProductCard key={p.id} p={p} rayon={r} />
            ))}
          </SectionCard>
        );
      })}

      {/* ----- Orphans (unknown rayon slug on a product row) ----- */}
      {orphanRayonSlugs.map((rSlug) => {
        const items = produitsByRayon.get(rSlug) ?? [];
        if (items.length === 0) return null;
        return (
          <SectionCard
            key={`orphan-${rSlug}`}
            id={`orphan-${rSlug}`}
            accent="#C0392B"
            title={`Rayon inconnu : ${rSlug}`}
            subtitle="à reclasser"
            count={items.length}
            withImageCount={items.filter((p) => !!p.image_url).length}
          >
            {items.map((p) => (
              <ProductCard key={p.id} p={p} rayon={null} />
            ))}
          </SectionCard>
        );
      })}
    </div>
  );
}
