import { useMemo, useState } from "react";

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

export default function ProduitsManager({ initialProduits, rayonsOptions }) {
  const [produits, setProduits] = useState(initialProduits ?? []);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState({ q: "", rayon: "", statut: "all" });
  const [toast, setToast] = useState(null);

  const rayonNom = useMemo(() => {
    const m = new Map();
    rayonsOptions.forEach((r) => m.set(r.slug, r.nom));
    return (slug) => m.get(slug) ?? slug;
  }, [rayonsOptions]);

  const filtered = useMemo(() => {
    return produits.filter((p) => {
      if (filter.rayon && p.rayon !== filter.rayon) return false;
      if (filter.statut === "active" && !p.actif) return false;
      if (filter.statut === "inactive" && p.actif) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const hay = `${p.nom} ${p.slug} ${p.description ?? ""} ${p.origine ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [produits, filter]);

  /* Group by rayon for the card layout */
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((p) => {
      if (!map.has(p.rayon)) map.set(p.rayon, []);
      map.get(p.rayon).push(p);
    });
    return Array.from(map.entries()).sort((a, b) =>
      rayonNom(a[0]).localeCompare(rayonNom(b[0]), "fr")
    );
  }, [filtered, rayonNom]);

  function notify(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3800);
  }

  async function toggleActif(row) {
    const next = { ...row, actif: !row.actif };
    setProduits((cur) => cur.map((p) => (p.id === row.id ? next : p)));
    try {
      const res = await fetch(`/api/admin/produits/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: next.actif }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { produit } = await res.json();
      setProduits((cur) => cur.map((p) => (p.id === row.id ? produit : p)));
    } catch (err) {
      setProduits((cur) => cur.map((p) => (p.id === row.id ? row : p)));
      notify("err", `Erreur : ${err.message}`);
    }
  }

  async function deleteProduit(row) {
    if (!confirm(`Supprimer définitivement « ${row.nom} » ?`)) return;
    const snapshot = produits;
    setProduits((cur) => cur.filter((p) => p.id !== row.id));
    try {
      const res = await fetch(`/api/admin/produits/${row.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      }
      notify("ok", `« ${row.nom} » supprimé.`);
    } catch (err) {
      setProduits(snapshot);
      notify("err", `Erreur : ${err.message}`);
    }
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
      origine: form.origine || null,
      badge: form.badge || null,
      actif: form.actif !== false,
      ordre: Number(form.ordre) || 0,
    };
    try {
      let res;
      if (isNew) {
        res = await fetch(`/api/admin/produits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/admin/produits/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { produit } = await res.json();
      if (isNew) {
        setProduits((cur) => [...cur, produit]);
      } else {
        setProduits((cur) => cur.map((p) => (p.id === produit.id ? produit : p)));
      }
      setEditing(null);
      notify("ok", isNew ? "Produit créé." : "Produit mis à jour.");
    } catch (err) {
      notify("err", `Erreur : ${err.message}`);
    }
  }

  async function bulkImport(arr) {
    try {
      const res = await fetch(`/api/admin/produits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produits: arr }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const { count } = await res.json();
      const refreshed = await fetch(`/api/admin/produits`).then((r) => r.json());
      setProduits(refreshed.produits ?? []);
      setImporting(false);
      notify("ok", `${count} produit(s) importé(s).`);
    } catch (err) {
      notify("err", `Erreur import : ${err.message}`);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="bg-white rounded-3xl shadow-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            placeholder="Rechercher nom, slug, origine…"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            className="flex-1 min-w-0 px-4 py-2 rounded-full border border-black/10 text-[14px] focus:border-vert focus:outline-none bg-creme"
          />
          <select
            value={filter.rayon}
            onChange={(e) => setFilter({ ...filter, rayon: e.target.value })}
            className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
          >
            <option value="">Tous rayons</option>
            {rayonsOptions.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.nom}
              </option>
            ))}
          </select>
          <select
            value={filter.statut}
            onChange={(e) => setFilter({ ...filter, statut: e.target.value })}
            className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
          >
            <option value="all">Tous statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="px-4 py-2 rounded-full bg-white border-2 border-black/10 text-[13px] font-bold hover:border-vert hover:text-vert transition"
          >
            Importer JSON
          </button>
          <button
            type="button"
            onClick={() => setEditing({ ...EMPTY_PRODUIT })}
            className="px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
          >
            + Nouveau produit
          </button>
        </div>
      </div>

      <p className="mt-4 text-[13px] text-neutral-500">
        <strong className="text-noir">{filtered.length}</strong> produit(s) affiché(s)
        {produits.length !== filtered.length && (
          <span> sur <strong className="text-noir">{produits.length}</strong> au total</span>
        )}
      </p>

      {/* Grouped by rayon */}
      {grouped.length === 0 ? (
        <div className="mt-4 bg-white rounded-3xl shadow-card p-10 text-center text-neutral-400">
          <p className="font-bold text-[15px] text-neutral-600">Aucun produit</p>
          <p className="mt-2 text-[13px]">
            Créez un produit ou importez un JSON pour commencer à remplir le catalogue.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {grouped.map(([rayonSlug, items]) => (
            <section key={rayonSlug} className="bg-white rounded-3xl shadow-card overflow-hidden">
              <header className="bg-creme px-5 py-3 border-b border-black/5 flex items-center justify-between">
                <h2 className="font-soft font-bold text-[16px]">{rayonNom(rayonSlug)}</h2>
                <span className="text-[12px] text-neutral-500">{items.length} produit(s)</span>
              </header>
              <ul className="divide-y divide-black/5">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-4 px-4 md:px-5 py-3 hover:bg-creme/50 transition">
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
                ))}
              </ul>
            </section>
          ))}
        </div>
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

      {toast && (
        <div
          role="status"
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
  const [form, setForm] = useState({ ...produit });
  const [saving, setSaving] = useState(false);
  const isNew = !produit.id;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
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

        <form onSubmit={submit} className="p-6 space-y-5">
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

          <Field label="Slug" required hint="Identifiant unique, sans espaces/majuscules.">
            <input
              type="text"
              required
              pattern="[a-z0-9-]+"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              className="input"
              placeholder="riz-basmati-parfume"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              className="input min-h-[70px] resize-y"
              placeholder="Courte description (origine, variété, suggestion d'usage)."
            />
          </Field>

          <Field label="URL image" hint="/images/produits/… ou URL Supabase Storage.">
            <input
              type="text"
              value={form.image_url ?? ""}
              onChange={(e) => set("image_url", e.target.value)}
              className="input"
              placeholder="/images/produits/riz-basmati.jpg"
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt=""
                className="mt-2 w-24 h-24 object-cover rounded-lg ring-1 ring-black/5"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
          </Field>

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
              disabled={saving}
              className="flex-1 px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-50"
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
/* Bulk import modal                                                  */
/* ================================================================ */
function ImportModal({ currentProduits, onCancel, onImport }) {
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
      const arr = Array.isArray(obj) ? obj : obj.produits;
      if (!Array.isArray(arr)) throw new Error("JSON doit être un tableau ou { produits: [...] }");
      setParsed(arr);
      setErr(null);
    } catch (e) {
      setParsed(null);
      setErr(e.message);
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
          <h2 className="font-soft font-bold text-[20px]">Importer des produits (JSON)</h2>
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
            Collez un tableau JSON ou <code className="bg-white px-1 rounded">{`{ produits: [...] }`}</code>.
            Les slugs existants sont mis à jour, les nouveaux créés.
            <br />
            <strong>Champs requis :</strong> slug, nom, rayon.
            <strong> Optionnels :</strong> description, image_url, prix_indicatif, unite, origine, badge, actif, ordre.
          </div>

          <textarea
            value={text}
            onChange={(e) => onPaste(e.target.value)}
            className="w-full min-h-[220px] font-mono text-[12px] px-4 py-3 border border-black/10 rounded-2xl bg-creme resize-y focus:outline-none focus:border-vert"
            placeholder={
              '[{"slug":"riz-basmati","nom":"Riz basmati parfumé","rayon":"produits-courants","origine":"Inde","unite":"kg"}]'
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
                      <th className="px-3 py-2 font-bold">Nom</th>
                      <th className="px-3 py-2 font-bold">Rayon</th>
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
