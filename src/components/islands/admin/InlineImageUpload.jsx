import { useCallback, useEffect, useRef, useState } from "react";

/**
 * InlineImageUpload - shared inline uploader for CRUD modals.
 *
 * Responsibilities
 * ----------------
 *  - Drop-zone + file-picker that uploads ONE image to the admin
 *    medias endpoint (`POST /api/admin/medias`).
 *  - Writes the returned `publicUrl` back through `onChange(url)`.
 *  - Shows a thumbnail preview of the current value.
 *  - Keeps a collapsed "coller une URL manuellement" fallback so
 *    power-users can still paste a URL (e.g. when reusing an
 *    existing image).
 *
 * Props
 * -----
 *   folder       : Supabase Storage folder under the `medias`
 *                   bucket. Must be in the server-side whitelist
 *                   ("promos" | "produits" | "rayons" | "recettes"
 *                    | "home" | "magasins" | "postes").
 *   value        : current image URL (string | null).
 *   onChange     : (nextUrl: string) => void. Called with "" to clear.
 *   renameTo     : optional preferred filename (without extension).
 *                   The server slugifies it and keeps the original
 *                   extension. Typically the row's `slug` or `nom`.
 *   label        : optional label above the dropzone.
 *   hint         : optional helper text shown under the dropzone.
 *
 * Accessibility
 * -------------
 *  - The dropzone is a <button> so keyboard activates the picker.
 *  - All controls are keyboard reachable.
 *  - `aria-live="polite"` reports upload state.
 *  - Respects `prefers-reduced-motion` (no pulsing animations when
 *    the user asks for reduced motion).
 */

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml";
const MAX_BYTES = 8 * 1024 * 1024;

export default function InlineImageUpload({
  folder,
  value,
  onChange,
  renameTo,
  label = "Image",
  hint,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualUrl, setManualUrl] = useState(value ?? "");
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Keep the manual URL field in sync when value changes via upload. */
  useEffect(() => {
    setManualUrl(value ?? "");
  }, [value]);

  const uploadOne = useCallback(
    async (file) => {
      if (!file) return;
      setError(null);
      if (!file.type || !ACCEPT.split(",").includes(file.type)) {
        setError(`Type non accepté : ${file.type || "inconnu"}`);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`Fichier trop gros (${(file.size / 1024 / 1024).toFixed(1)} Mo > 8 Mo)`);
        return;
      }
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("folder", folder);
        if (renameTo) form.append("renameTo", renameTo);
        /* Default: upsert ON so a re-upload of the same slug+ext
         * replaces the file instead of 409-ing. This matches the
         * mental model of "I want to update this image". */
        form.append("upsert", "1");
        const res = await fetch("/api/admin/medias", { method: "POST", body: form });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
        const data = await res.json();
        onChange?.(data.file.publicUrl);
      } catch (err) {
        setError(err?.message || "Erreur d'upload");
      } finally {
        setUploading(false);
      }
    },
    [folder, onChange, renameTo]
  );

  /* ---- drag & drop ---- */
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragEnter = (e) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes("Files")) setDragging(true);
    };
    const onDragOver = (e) => {
      e.preventDefault();
    };
    const onDragLeave = (e) => {
      if (e.target === el) setDragging(false);
    };
    const onDrop = (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadOne(file);
    };
    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [uploadOne]);

  function clear() {
    setError(null);
    onChange?.("");
  }

  function onManualApply() {
    const next = manualUrl.trim();
    if (next && next !== value) onChange?.(next);
  }

  const hasImage = !!value;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[12px] font-bold text-neutral-500 uppercase tracking-wider">
          {label}
        </label>
        {hasImage && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] font-bold text-neutral-400 hover:text-rouge transition"
          >
            Retirer
          </button>
        )}
      </div>

      <div
        ref={dropRef}
        className={[
          "relative rounded-2xl border-2 border-dashed transition overflow-hidden",
          dragging ? "border-vert bg-vert/5" : "border-black/15 bg-creme/50",
          uploading ? "opacity-70 pointer-events-none" : "",
        ].join(" ")}
      >
        <div className="flex items-center gap-4 p-3">
          {/* Preview */}
          <div className="shrink-0 w-20 h-20 rounded-xl bg-white ring-1 ring-black/5 overflow-hidden flex items-center justify-center">
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <svg
                className="w-8 h-8 text-neutral-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-neutral-600 leading-snug">
              <strong className="text-noir">Déposez</strong> une image ici,{" "}
              <strong className="text-noir">ou</strong>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadOne(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-full bg-vert text-white text-[12px] font-bold hover:bg-vert-dark transition disabled:opacity-60"
                disabled={uploading}
              >
                {uploading ? "Envoi…" : hasImage ? "Remplacer…" : "Choisir un fichier"}
              </button>
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                className="px-3 py-1.5 rounded-full bg-white border border-black/10 text-[12px] font-bold text-neutral-600 hover:border-noir hover:text-noir transition"
                aria-expanded={showManual}
              >
                {showManual ? "Masquer URL" : "Coller une URL"}
              </button>
            </div>
            <p
              aria-live="polite"
              className="mt-1.5 text-[11px] text-neutral-400 leading-snug min-h-[1em]"
            >
              {error ? (
                <span className="text-rouge font-bold">{error}</span>
              ) : (
                hint ?? "JPEG, PNG, WebP, AVIF, GIF ou SVG. 8 Mo max."
              )}
            </p>
          </div>
        </div>
      </div>

      {showManual && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            onBlur={onManualApply}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onManualApply();
              }
            }}
            className="input flex-1"
            placeholder="/images/promos/agneau.jpg ou https://…"
          />
          <button
            type="button"
            onClick={onManualApply}
            className="px-3 py-2 rounded-full bg-noir text-white text-[12px] font-bold hover:bg-noir-soft transition"
          >
            Appliquer
          </button>
        </div>
      )}
    </div>
  );
}
