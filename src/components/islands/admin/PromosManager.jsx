import { useMemo, useState } from "react";

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
  const [filter, setFilter] = useState({ q: "", rayon: "", magasin: "", statut: "all" });
  const [toast, setToast] = useState(null); // { type: 'ok' | 'err', msg }

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
    return promos.filter((p) => {
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
  }, [promos, filter]);

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
      const { promos: imported, count } = await res.json();
      /* Refresh the table from the server truth. */
      const refreshed = await fetch(`/api/admin/promos`).then((r) => r.json());
      setPromos(refreshed.promos ?? []);
      setImporting(false);
      notify("ok", `${count} promo(s) importée(s).`);
    } catch (err) {
      notify("err", `Erreur import : ${err.message}`);
    }
  }

  /* =========================================================== */
  return (
    <div>
      {/* Toolbar */}
      <div className="bg-white rounded-3xl shadow-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            placeholder="Rechercher titre, slug…"
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
            value={filter.magasin}
            onChange={(e) => setFilter({ ...filter, magasin: e.target.value })}
            className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
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
            onChange={(e) => setFilter({ ...filter, statut: e.target.value })}
            className="px-3 py-2 rounded-full border border-black/10 text-[13px] bg-white"
          >
            <option value="all">Tous statuts</option>
            <option value="active">Actives</option>
            <option value="inactive">Inactives</option>
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
            onClick={() => setEditing({ ...EMPTY_PROMO })}
            className="px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
          >
            + Nouvelle promo
          </button>
        </div>
      </div>

      {/* Count line */}
      <p className="mt-4 text-[13px] text-neutral-500">
        <strong className="text-noir">{filtered.length}</strong> promo(s) affichée(s)
        {promos.length !== filtered.length && (
          <span> sur <strong className="text-noir">{promos.length}</strong> au total</span>
        )}
      </p>

      {/* Table */}
      <div className="mt-3 bg-white rounded-3xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-creme text-neutral-500 text-left text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 font-bold">Image</th>
                <th className="px-4 py-3 font-bold">Titre</th>
                <th className="px-4 py-3 font-bold">Rayon</th>
                <th className="px-4 py-3 font-bold">Prix</th>
                <th className="px-4 py-3 font-bold">Réduc</th>
                <th className="px-4 py-3 font-bold">Magasin</th>
                <th className="px-4 py-3 font-bold">Fin</th>
                <th className="px-4 py-3 font-bold">Statut</th>
                <th className="px-4 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-neutral-400">
                    Aucune promo ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-black/5 hover:bg-creme/50 transition">
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

  const isNew = !promo.id;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  /* Auto-compute reduction_pct from prix */
  function setPrix(field, value) {
    const next = { ...form, [field]: value };
    const orig = parseFloat(next.prix_original);
    const promoP = parseFloat(next.prix_promo);
    if (Number.isFinite(orig) && Number.isFinite(promoP) && orig > 0) {
      next.reduction_pct = Math.round(((orig - promoP) / orig) * 100);
    }
    setForm(next);
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

        <form onSubmit={submit} className="p-6 space-y-5">
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

          <Field label="URL de l'image" hint="Chemin relatif, ex : /images/promos/agneau.jpg — ou URL complète Supabase Storage.">
            <input
              type="text"
              value={form.image_url ?? ""}
              onChange={(e) => set("image_url", e.target.value)}
              className="input"
              placeholder="/images/promos/agneau.jpg"
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

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Prix original (€)" required>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.prix_original}
                onChange={(e) => setPrix("prix_original", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Prix promo (€)" required>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.prix_promo}
                onChange={(e) => setPrix("prix_promo", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Réduction (%)" required hint="Auto-calculée si vous saisissez les 2 prix.">
              <input
                type="number"
                step="1"
                min="0"
                max="99"
                required
                value={form.reduction_pct}
                onChange={(e) => set("reduction_pct", e.target.value)}
                className="input"
              />
            </Field>
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
                className="input"
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
              disabled={saving}
              className="flex-1 px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-50"
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
