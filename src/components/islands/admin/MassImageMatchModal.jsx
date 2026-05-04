import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "./adminFetch.js";
import { optimizeImage } from "./imageOptimize.js";

/**
 * MassImageMatchModal
 * -------------------
 * Drag-and-drop N image files, upload them to Supabase Storage
 * (medias/produits/), auto-match each one against the product catalogue
 * via `/api/admin/produits/match-image`, and let the admin apply the
 * matches in bulk as `image_url` PATCHes.
 *
 * Flow (four steps) :
 *   1. drop     — dropzone + local preview
 *   2. uploading— per-file upload with live progress
 *   3. review   — table : file → best match → user confirms/skips/picks other
 *   4. applying — PATCH image_url on the chosen products
 *
 * No side effects escape the modal until the user clicks "Appliquer" on
 * the review step : users can cancel after upload without any products
 * being touched (files do end up in the bucket, which is intentional —
 * they can be picked up manually later from /admin/medias).
 *
 * Props :
 *   onClose             (() => void)
 *   onApplied           ((summary: {applied, failed, skipped}) => void)
 *   rayonsOptions       (for filtering products in the match API)
 */

const CONFIDENCE_COLORS = {
  high: "bg-vert/15 text-vert-dark border-vert/30",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-orange-100 text-orange-800 border-orange-300",
  none: "bg-neutral-100 text-neutral-500 border-neutral-300",
};

const CONFIDENCE_LABELS = {
  high: "Fiable",
  medium: "À vérifier",
  low: "Faible",
  none: "Aucun",
};

export default function MassImageMatchModal({ onClose, onApplied, rayonsOptions = [] }) {
  /* step : 'drop' | 'uploading' | 'review' | 'applying' | 'done' */
  const [step, setStep] = useState("drop");
  /* files : [{ id, file, previewUrl, status, safeName?, publicUrl?, path?, error? }] */
  const [files, setFiles] = useState([]);
  /* matches : fileId → MatchResult (from /api/admin/produits/match-image) */
  const [matches, setMatches] = useState({});
  /* choices : fileId → { productId: string|null, skip: boolean } */
  const [choices, setChoices] = useState({});
  const [overwrite, setOverwrite] = useState(false);
  const [rayonHint, setRayonHint] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [applySummary, setApplySummary] = useState(null);
  const [err, setErr] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  /* Cleanup object URLs on unmount / file removal to avoid memory leaks. */
  useEffect(() => {
    return () => {
      files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* ESC to close (unless we're mid-apply, to avoid losing in-flight work). */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && step !== "uploading" && step !== "applying") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  /* --------------------------------------------------------- */
  /* Step 1 : drop / pick                                      */
  /* --------------------------------------------------------- */
  function addFiles(list) {
    const images = list.filter((f) => f && f.type && f.type.startsWith("image/"));
    if (images.length === 0) return;
    const now = Date.now();
    setFiles((prev) => [
      ...prev,
      ...images.map((f, i) => ({
        id: `${now}-${i}-${f.name}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: "pending",
      })),
    ]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  }

  function onPick(e) {
    addFiles(Array.from(e.target.files || []));
    /* Reset input so same files can be picked again if user removes them. */
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(id) {
    setFiles((prev) => {
      const drop = prev.find((f) => f.id === id);
      if (drop?.previewUrl) URL.revokeObjectURL(drop.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  /* --------------------------------------------------------- */
  /* Step 2 : upload each file, then call matcher              */
  /* --------------------------------------------------------- */
  async function uploadAndMatch() {
    if (files.length === 0) return;
    setErr(null);
    setStep("uploading");
    setProgress({ done: 0, total: files.length });

    /* Upload with low concurrency to stay friendly on a single HTTP origin. */
    const CONCURRENCY = 3;
    const queue = [...files];
    const uploaded = [];

    async function uploadOne(f) {
      setFiles((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, status: "uploading" } : x)),
      );
      try {
        /* Resize + re-encode to WebP when it helps. Matching happens
         * on the filename (not the image contents) so the optimiser
         * preserving the basename is critical — `optimizeImage`
         * already does that. */
        const opt = await optimizeImage(f.file);
        const fd = new FormData();
        fd.append("file", opt.file);
        fd.append("folder", "produits");
        fd.append("upsert", "1"); /* allow overwriting if user re-drops */
        const res = await adminFetch("/api/admin/medias", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || res.statusText);
        }
        const { file: meta } = await res.json();
        const next = {
          ...f,
          status: "uploaded",
          safeName: meta.name,
          path: meta.path,
          publicUrl: meta.publicUrl,
        };
        uploaded.push(next);
        setFiles((prev) => prev.map((x) => (x.id === f.id ? next : x)));
      } catch (e) {
        setFiles((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, status: "failed", error: e.message } : x)),
        );
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    /* Simple concurrency pool. */
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) await uploadOne(next);
      }
    });
    await Promise.all(workers);

    if (uploaded.length === 0) {
      setErr("Aucun fichier n'a pu être uploadé. Rien à matcher.");
      setStep("drop");
      return;
    }

    /* ---------- Call matcher ---------- */
    try {
      const res = await adminFetch("/api/admin/produits/match-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: uploaded.map((u) => u.safeName),
          options: {
            onlyMissingImages: !overwrite,
            rayonHint: rayonHint || undefined,
            minScore: 0.5,
            max: 5,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || res.statusText);
      }
      const data = await res.json();
      const results = data.matches ?? [];

      const byFilename = new Map(results.map((r) => [r.filename, r]));
      const byId = {};
      const choicesInit = {};
      for (const u of uploaded) {
        const r = byFilename.get(u.safeName);
        byId[u.id] = r;
        if (r?.best && (r.confidence === "high" || r.confidence === "medium")) {
          choicesInit[u.id] = { productId: r.best.product.id, skip: false };
        } else {
          choicesInit[u.id] = { productId: null, skip: true };
        }
      }
      setMatches(byId);
      setChoices(choicesInit);
      setStep("review");
    } catch (e) {
      setErr(`Matching échoué : ${e.message}`);
      setStep("drop");
    }
  }

  /* --------------------------------------------------------- */
  /* Step 3 : review helpers                                   */
  /* --------------------------------------------------------- */
  function setChoice(fileId, patch) {
    setChoices((prev) => ({ ...prev, [fileId]: { ...prev[fileId], ...patch } }));
  }

  function selectAllGreen() {
    setChoices((prev) => {
      const next = { ...prev };
      for (const f of files) {
        const r = matches[f.id];
        if (r?.best && r.confidence === "high") {
          next[f.id] = { productId: r.best.product.id, skip: false };
        }
      }
      return next;
    });
  }

  function skipAll() {
    setChoices((prev) => {
      const next = { ...prev };
      for (const f of files) {
        next[f.id] = { productId: null, skip: true };
      }
      return next;
    });
  }

  /* --------------------------------------------------------- */
  /* Step 4 : apply selected matches                           */
  /* --------------------------------------------------------- */

  /**
   * Apply a pre-built list of {file, productId} pairs. Shared by
   * `applySelected` (review-then-apply path) and `applyAllConfident`
   * (one-click skip-the-review path).
   */
  async function applyMatches(toApply) {
    if (toApply.length === 0) {
      setErr("Aucun match à appliquer.");
      return;
    }
    setErr(null);
    setStep("applying");
    setProgress({ done: 0, total: toApply.length });

    let applied = 0;
    let failed = 0;
    for (const item of toApply) {
      try {
        const res = await adminFetch(`/api/admin/produits/${item.productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: item.publicUrl }),
        });
        if (!res.ok) throw new Error();
        applied++;
      } catch {
        failed++;
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    const skipped = files.length - toApply.length;
    const summary = {
      applied,
      failed,
      skipped,
      uploaded: files.filter((f) => f.status === "uploaded").length,
    };
    setApplySummary(summary);
    setStep("done");
    if (applied > 0) onApplied?.(summary);
  }

  async function applySelected() {
    const toApply = files
      .filter((f) => {
        const c = choices[f.id];
        return c && !c.skip && c.productId && f.publicUrl;
      })
      .map((f) => ({ productId: choices[f.id].productId, publicUrl: f.publicUrl }));
    if (toApply.length === 0) {
      setErr("Aucun match sélectionné.");
      return;
    }
    return applyMatches(toApply);
  }

  /**
   * One-click "Appliquer toutes les confiantes" :
   * apply every high-confidence match without going through the review
   * step. Doesn't read from `choices` state — derives the list directly
   * from `matches`, so it works regardless of what the user has clicked
   * so far. The match endpoint already filters out products that have
   * an image (when `overwrite=false`), so this is non-destructive by
   * default.
   */
  async function applyAllConfident() {
    const toApply = [];
    for (const f of files) {
      const r = matches[f.id];
      if (!f.publicUrl) continue;
      if (!r?.best || r.confidence !== "high") continue;
      toApply.push({ productId: r.best.product.id, publicUrl: f.publicUrl });
    }
    if (toApply.length === 0) {
      setErr("Aucun match confiant à appliquer.");
      return;
    }
    return applyMatches(toApply);
  }

  /* --------------------------------------------------------- */
  /* Render                                                    */
  /* --------------------------------------------------------- */
  const stats = useMemo(() => {
    if (step !== "review") return null;
    let high = 0,
      medium = 0,
      low = 0,
      none = 0;
    for (const f of files) {
      const r = matches[f.id];
      if (!r || !r.best) {
        none++;
        continue;
      }
      if (r.confidence === "high") high++;
      else if (r.confidence === "medium") medium++;
      else low++;
    }
    return { high, medium, low, none };
  }, [step, files, matches]);

  const selectedCount = useMemo(() => {
    if (step !== "review") return 0;
    return files.reduce((acc, f) => {
      const c = choices[f.id];
      return acc + (c && !c.skip && c.productId ? 1 : 0);
    }, 0);
  }, [step, files, choices]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-6">
      <div className="w-full max-w-5xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-soft font-bold text-[20px]">Importer images (auto-match)</h2>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              Glissez plusieurs images — elles seront uploadées puis associées automatiquement aux produits par nom de fichier.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            disabled={step === "uploading" || step === "applying"}
            className="w-9 h-9 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {err && (
            <div className="bg-rouge/5 border border-rouge/20 text-rouge rounded-2xl p-3 text-[13px]">
              {err}
            </div>
          )}

          {/* ---------- Step 1 : DROP ---------- */}
          {step === "drop" && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-3xl p-8 md:p-12 text-center transition ${
                  dragging ? "border-vert bg-vert/5" : "border-black/15 bg-creme/40"
                }`}
              >
                <svg className="w-12 h-12 mx-auto text-neutral-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="font-bold text-[15px] text-noir">Déposez vos images ici</p>
                <p className="text-[13px] text-neutral-500 mt-1">
                  JPG, PNG, WebP, AVIF · max 8 Mo par fichier
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={onPick}
                  className="hidden"
                  id="mass-image-input"
                />
                <label
                  htmlFor="mass-image-input"
                  className="inline-block mt-4 px-5 py-2 rounded-full bg-noir text-white font-bold text-[13px] cursor-pointer hover:bg-noir-soft transition"
                >
                  … ou choisir des fichiers
                </label>
              </div>

              {/* Options */}
              <div className="bg-creme rounded-2xl p-4 flex flex-wrap gap-4 items-center">
                <label className="inline-flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded accent-vert"
                  />
                  <span>
                    Écraser les images existantes
                    <span className="text-neutral-400"> (sinon seuls les produits sans image seront candidats)</span>
                  </span>
                </label>
                <div className="inline-flex items-center gap-2 text-[13px]">
                  <span className="text-neutral-500">Rayon ciblé :</span>
                  <select
                    value={rayonHint}
                    onChange={(e) => setRayonHint(e.target.value)}
                    className="px-3 py-1 rounded-full border border-black/10 text-[12px] bg-white"
                  >
                    <option value="">— tous —</option>
                    {rayonsOptions.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {files.length > 0 && (
                <div>
                  <p className="text-[12px] text-neutral-500 uppercase tracking-wider font-bold mb-2">
                    {files.length} fichier(s) prêt(s)
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {files.map((f) => (
                      <div key={f.id} className="relative group">
                        <img
                          src={f.previewUrl}
                          alt=""
                          className="w-full aspect-square object-cover rounded-xl ring-1 ring-black/10"
                        />
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-rouge text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          aria-label="Retirer"
                        >
                          ×
                        </button>
                        <p className="mt-1 text-[10px] text-neutral-500 truncate">{f.file.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- Step 2 : UPLOADING ---------- */}
          {step === "uploading" && (
            <div className="text-center py-8">
              <p className="font-bold text-[15px] text-noir">
                Upload en cours… {progress.done} / {progress.total}
              </p>
              <div className="mt-3 max-w-md mx-auto h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-vert transition-all"
                  style={{ width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` }}
                />
              </div>
              <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-w-3xl mx-auto">
                {files.map((f) => (
                  <div key={f.id} className="relative">
                    <img
                      src={f.previewUrl}
                      alt=""
                      className={`w-full aspect-square object-cover rounded-xl ring-1 ring-black/10 ${
                        f.status === "failed" ? "opacity-40" : ""
                      }`}
                    />
                    <div className="absolute inset-0 flex items-end justify-center pb-1">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          f.status === "uploaded"
                            ? "bg-vert text-white"
                            : f.status === "uploading"
                              ? "bg-yellow-400 text-noir"
                              : f.status === "failed"
                                ? "bg-rouge text-white"
                                : "bg-neutral-200 text-neutral-600"
                        }`}
                      >
                        {f.status === "uploaded"
                          ? "OK"
                          : f.status === "uploading"
                            ? "…"
                            : f.status === "failed"
                              ? "ERR"
                              : "en attente"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- Step 3 : REVIEW ---------- */}
          {step === "review" && (
            <>
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 text-[12px]">
                  {stats && (
                    <>
                      <Badge tone="high">{stats.high} fiables</Badge>
                      <Badge tone="medium">{stats.medium} à vérifier</Badge>
                      <Badge tone="low">{stats.low} faibles</Badge>
                      <Badge tone="none">{stats.none} sans match</Badge>
                    </>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {stats && stats.high > 0 && (
                    <button
                      type="button"
                      onClick={applyAllConfident}
                      title="Appliquer immédiatement toutes les correspondances fiables sans passer par la revue"
                      className="px-3 py-1 rounded-full bg-vert text-white font-bold text-[12px] hover:bg-vert-dark transition inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Appliquer les {stats.high} fiables
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={selectAllGreen}
                    className="px-3 py-1 rounded-full bg-vert/10 text-vert-dark font-bold text-[12px] hover:bg-vert/20 transition"
                  >
                    Sélectionner les fiables
                  </button>
                  <button
                    type="button"
                    onClick={skipAll}
                    className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 font-bold text-[12px] hover:bg-neutral-200 transition"
                  >
                    Tout ignorer
                  </button>
                </div>
              </div>

              <div className="border border-black/10 rounded-2xl overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-creme text-left text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 font-bold w-16">Fichier</th>
                      <th className="px-3 py-2 font-bold">Nom</th>
                      <th className="px-3 py-2 font-bold">Match</th>
                      <th className="px-3 py-2 font-bold w-28">Score</th>
                      <th className="px-3 py-2 font-bold w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <ReviewRow
                        key={f.id}
                        file={f}
                        match={matches[f.id]}
                        choice={choices[f.id]}
                        onChoose={(patch) => setChoice(f.id, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ---------- Step 4 : APPLYING ---------- */}
          {step === "applying" && (
            <div className="text-center py-8">
              <p className="font-bold text-[15px] text-noir">
                Application en cours… {progress.done} / {progress.total}
              </p>
              <div className="mt-3 max-w-md mx-auto h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-vert transition-all"
                  style={{ width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ---------- Step 5 : DONE ---------- */}
          {step === "done" && applySummary && (
            <div className="text-center py-6">
              <svg className="w-12 h-12 mx-auto text-vert mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="font-bold text-[16px] text-noir">Import terminé</p>
              <p className="text-[13px] text-neutral-600 mt-2">
                <strong className="text-vert-dark">{applySummary.applied}</strong> image(s) associée(s),{" "}
                <strong>{applySummary.skipped}</strong> ignorée(s)
                {applySummary.failed > 0 && (
                  <>
                    , <strong className="text-rouge">{applySummary.failed}</strong> en erreur
                  </>
                )}
                .
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-white border-t border-black/5 px-6 py-4 flex gap-3 justify-end">
          {step === "drop" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-white border-2 border-black/10 font-bold text-[13px] hover:border-noir transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={files.length === 0}
                onClick={uploadAndMatch}
                className="px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-40"
              >
                Uploader & matcher ({files.length})
              </button>
            </>
          )}
          {step === "review" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-white border-2 border-black/10 font-bold text-[13px] hover:border-noir transition"
              >
                Fermer sans appliquer
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={applySelected}
                className="px-5 py-2 rounded-full bg-vert text-white font-bold text-[13px] hover:bg-vert-dark transition disabled:opacity-40"
              >
                Appliquer {selectedCount} match(es)
              </button>
            </>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-noir text-white font-bold text-[13px] hover:bg-noir-soft transition"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */
/* Sub-components                                                    */
/* ================================================================ */

function Badge({ tone, children }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold ${
        CONFIDENCE_COLORS[tone] ?? CONFIDENCE_COLORS.none
      }`}
    >
      {children}
    </span>
  );
}

function ReviewRow({ file, match, choice, onChoose }) {
  const candidates = match?.candidates ?? [];
  const confidence = match?.confidence ?? "none";
  const best = match?.best;
  const selected = choice && !choice.skip && choice.productId;
  const currentProduct = candidates.find((c) => c.product.id === choice?.productId) ?? best;

  return (
    <tr className={`border-t border-black/5 ${selected ? "bg-vert/5" : ""}`}>
      <td className="px-3 py-2">
        {file.publicUrl ? (
          <img
            src={file.publicUrl}
            alt=""
            className="w-12 h-12 rounded-lg object-cover ring-1 ring-black/10"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-creme" />
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-neutral-600 max-w-xs truncate">
        {file.safeName || file.file.name}
      </td>
      <td className="px-3 py-2">
        {candidates.length > 0 ? (
          <select
            value={choice?.productId ?? ""}
            onChange={(e) =>
              onChoose({ productId: e.target.value || null, skip: !e.target.value })
            }
            className="w-full max-w-md px-2 py-1 rounded-lg border border-black/10 text-[12px] bg-white"
          >
            <option value="">— Ignorer —</option>
            {candidates.map((c) => (
              <option key={c.product.id} value={c.product.id}>
                {c.product.nom}
                {c.hasImage ? " (déjà illustré)" : ""}
                {c.product.rayon ? ` · ${c.product.rayon}` : ""}
                {" · "}
                {(c.score * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        ) : (
          <span className="text-neutral-400 text-[12px] italic">Aucun candidat ≥ 50%</span>
        )}
        {currentProduct?.hasImage && selected && !choice?.skip && (
          <p className="mt-1 text-[11px] text-orange-700">
            ⚠ Ce produit a déjà une image — elle sera remplacée.
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge tone={confidence}>
          {CONFIDENCE_LABELS[confidence]}
          {best ? ` ${(best.score * 100).toFixed(0)}%` : ""}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() =>
            onChoose(
              choice?.skip
                ? { productId: best?.product.id ?? null, skip: !best }
                : { productId: null, skip: true },
            )
          }
          className={`px-3 py-1 rounded-full text-[12px] font-bold transition ${
            selected
              ? "bg-vert text-white hover:bg-vert-dark"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          {selected ? "Appliquer" : "Ignorer"}
        </button>
      </td>
    </tr>
  );
}
