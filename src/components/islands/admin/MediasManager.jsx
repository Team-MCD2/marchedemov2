import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MediasManager — gallery + upload UI for Supabase Storage 'medias'.
 *
 * Features :
 *   - Folder tabs (promos / produits / rayons / recettes / …).
 *   - Drag-and-drop anywhere on the gallery to upload.
 *   - File picker button.
 *   - Progress list while uploading (per file state).
 *   - Grid gallery with thumbnail preview, name, size, date.
 *   - Click a tile → menu : Copier l'URL · Ouvrir · Supprimer.
 *   - Confirm-before-delete.
 *   - Toast for success/error feedback.
 *
 * All requests go to /api/admin/medias which uses the service_role
 * and enforces the folder whitelist server-side.
 */

function fmtSize(bytes) {
  if (bytes == null) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function MediasManager({ initialFolder, initialFiles, folders }) {
  const [folder, setFolder] = useState(initialFolder);
  const [files, setFiles] = useState(initialFiles ?? []);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]); /* { name, state, error? } */
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const [menuFor, setMenuFor] = useState(null); /* path of file showing action menu */
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  /* ----- Load folder contents ----- */
  const loadFolder = useCallback(async (f) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/medias?folder=${encodeURIComponent(f)}`);
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch (err) {
      notify("err", `Erreur : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  function changeFolder(f) {
    if (f === folder) return;
    setFolder(f);
    setFiles([]);
    loadFolder(f);
  }

  /* ----- Upload ----- */
  const uploadFiles = useCallback(
    async (fileList) => {
      const arr = Array.from(fileList);
      if (arr.length === 0) return;

      /* Initialise per-file progress rows */
      const queued = arr.map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        state: "pending",
      }));
      setUploads((cur) => [...queued, ...cur]);

      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const id = queued[i].id;
        setUploads((cur) => cur.map((u) => (u.id === id ? { ...u, state: "uploading" } : u)));
        try {
          const form = new FormData();
          form.append("file", f);
          form.append("folder", folder);
          const res = await fetch("/api/admin/medias", { method: "POST", body: form });
          if (!res.ok) throw new Error((await res.json()).error || res.statusText);
          const data = await res.json();
          setUploads((cur) => cur.map((u) => (u.id === id ? { ...u, state: "done" } : u)));
          /* Prepend to gallery */
          setFiles((cur) => [data.file, ...cur.filter((x) => x.path !== data.file.path)]);
        } catch (err) {
          setUploads((cur) =>
            cur.map((u) => (u.id === id ? { ...u, state: "error", error: err.message } : u))
          );
        }
      }
      notify("ok", `Upload terminé (${arr.length} fichier(s)).`);

      /* Auto-clear completed rows after a bit */
      setTimeout(() => {
        setUploads((cur) => cur.filter((u) => u.state === "uploading" || u.state === "error"));
      }, 4000);
    },
    [folder]
  );

  /* ----- Drag & drop ----- */
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
      const files = e.dataTransfer?.files;
      if (files && files.length) uploadFiles(files);
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
  }, [uploadFiles]);

  /* ----- Delete ----- */
  async function deleteFile(path) {
    if (!confirm(`Supprimer « ${path} » ?\nCette action est définitive.`)) return;
    const snapshot = files;
    setFiles((cur) => cur.filter((f) => f.path !== path));
    setMenuFor(null);
    try {
      const res = await fetch(`/api/admin/medias?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      }
      notify("ok", `« ${path.split("/").pop()} » supprimé.`);
    } catch (err) {
      setFiles(snapshot);
      notify("err", `Erreur : ${err.message}`);
    }
  }

  /* ----- Copy URL ----- */
  function copyUrl(url) {
    navigator.clipboard
      .writeText(url)
      .then(() => notify("ok", "URL copiée dans le presse-papier."))
      .catch(() => notify("err", "Impossible de copier."));
    setMenuFor(null);
  }

  /* ----- Copy relative path (useful to store in Supabase image_url) ----- */
  function copyRelativePath(path) {
    navigator.clipboard
      .writeText(`/medias/${path}`)
      .then(() => notify("ok", "Chemin relatif copié."))
      .catch(() => notify("err", "Impossible de copier."));
    setMenuFor(null);
  }

  return (
    <div>
      {/* Folder tabs */}
      <div className="flex gap-2 overflow-x-auto mb-5 no-scrollbar">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => changeFolder(f.id)}
            className={[
              "px-4 py-1.5 rounded-full text-[13px] font-bold whitespace-nowrap transition",
              folder === f.id
                ? "bg-noir text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100 border border-black/5",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Drop zone / toolbar */}
      <div
        ref={dropRef}
        className={[
          "relative bg-white rounded-3xl shadow-card border-2 border-dashed transition",
          dragging ? "border-vert bg-vert/5" : "border-transparent",
        ].join(" ")}
      >
        <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="font-soft font-bold text-[16px]">
              Dossier <span className="text-vert">{folder || "racine"}</span>
            </p>
            <p className="text-[13px] text-neutral-500 mt-0.5">
              Glissez-déposez vos images ici, ou cliquez sur « Choisir des fichiers ». Formats acceptés : JPEG, PNG, WebP, AVIF, GIF, SVG. 8 Mo max par fichier.
            </p>
          </div>
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
            >
              Choisir des fichiers
            </button>
          </div>
        </div>

        {/* Upload progress list */}
        {uploads.length > 0 && (
          <div className="border-t border-black/5 px-5 md:px-6 py-3 space-y-1 text-[13px]">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <span
                  className={[
                    "w-2 h-2 rounded-full shrink-0",
                    u.state === "done" ? "bg-vert" : u.state === "error" ? "bg-rouge" : "bg-orange-400 animate-pulse",
                  ].join(" ")}
                />
                <span className="font-mono truncate flex-1">{u.name}</span>
                <span
                  className={[
                    "text-[11px] font-bold uppercase tracking-wider",
                    u.state === "done" ? "text-vert" : u.state === "error" ? "text-rouge" : "text-orange-500",
                  ].join(" ")}
                >
                  {u.state === "done" ? "OK" : u.state === "error" ? "Erreur" : u.state === "uploading" ? "Envoi…" : "En file"}
                </span>
                {u.error && <span className="text-[11px] text-rouge truncate">{u.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats line */}
      <p className="mt-4 text-[13px] text-neutral-500">
        {loading ? (
          "Chargement…"
        ) : (
          <>
            <strong className="text-noir">{files.length}</strong> fichier(s) dans <code className="bg-white px-1.5 py-0.5 rounded text-[12px]">{folder}</code>
          </>
        )}
      </p>

      {/* Gallery */}
      <div className="mt-3">
        {!loading && files.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-card p-12 text-center text-neutral-400">
            <p className="font-bold text-[15px] text-neutral-600">Aucun fichier dans « {folder} »</p>
            <p className="mt-2 text-[13px]">Glissez-déposez ou cliquez sur « Choisir des fichiers » pour commencer.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {files.map((f) => {
              const isImage = (f.mime ?? "").startsWith("image/");
              return (
                <div
                  key={f.path}
                  className="relative bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition group"
                >
                  <div className="relative aspect-square bg-creme">
                    {isImage ? (
                      <img
                        src={f.publicUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
                        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                    {/* Hover actions overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/60 via-black/20 to-transparent">
                      <button
                        type="button"
                        onClick={() => copyUrl(f.publicUrl)}
                        className="flex-1 px-2 py-1 rounded-full bg-white text-noir text-[11px] font-bold hover:bg-vert hover:text-white transition"
                        title="Copier l'URL publique"
                      >
                        Copier URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === f.path ? null : f.path)}
                        aria-label="Plus"
                        className="w-8 h-8 rounded-full bg-white hover:bg-noir hover:text-white text-noir transition flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
                        </svg>
                      </button>
                    </div>
                    {/* Action menu */}
                    {menuFor === f.path && (
                      <div className="absolute right-2 bottom-12 z-10 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-1 text-[12px] min-w-[160px]">
                        <a
                          href={f.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-3 py-2 rounded-lg hover:bg-creme transition"
                        >
                          Ouvrir ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => copyRelativePath(f.path)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-creme transition"
                        >
                          Copier le chemin
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFile(f.path)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-rouge/10 text-rouge transition font-bold"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="font-bold text-[12px] text-noir truncate" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 flex items-center justify-between gap-2">
                      <span>{fmtSize(f.size)}</span>
                      <span>{fmtDate(f.updated_at ?? f.created_at)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={[
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full font-bold text-[13px] shadow-card",
            toast.type === "ok" ? "bg-vert text-white" : "bg-rouge text-white",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>
    </div>
  );
}
