/**
 * /api/admin/medias
 *
 * Thin wrapper around the Supabase Storage bucket 'medias'.
 * Protected by the admin cookie. Uses service_role so it can
 * read ALL files (public bucket gives anon reads, but admin
 * needs list + delete + metadata).
 *
 *   GET    ?folder=promos            → list files in that folder
 *   GET    ?folder=                  → list the root
 *   POST   (multipart/form-data)     → upload 1 file (fields :
 *                                       folder, file, upsert?)
 *   DELETE ?path=promos/foo.webp     → remove that file
 *
 * The bucket is public so getPublicUrl() returns a stable CDN
 * URL the user can paste into the promo/produit image_url field.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const prerender = false;

const BUCKET = "medias";

/* Whitelist folders to avoid typos and keep the bucket organized. */
const ALLOWED_FOLDERS = new Set([
  "",
  "promos",
  "produits",
  "rayons",
  "recettes",
  "home",
  "magasins",
  "postes",
]);

/* Accepted MIME types + max size (8 MB per file). */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
]);
const MAX_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requireAdmin(cookies: import("astro").AstroCookies): Promise<Response | null> {
  if (!(await isAuthenticated(cookies))) return json({ error: "Unauthorized" }, 401);
  if (!supabaseAdmin) return json({ error: "Supabase service_role key missing" }, 500);
  return null;
}

/* Normalise an arbitrary filename into a safe, slug-like key. */
function slugifyFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const cleanBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") /* strip diacritics */
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleanBase || "file") + ext;
}

/* ----------------------------------------------------------------- */
/* GET — list files (recursive up to 3 levels in the chosen folder)   */
/* ----------------------------------------------------------------- */
export const GET: APIRoute = async ({ url, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const folder = (url.searchParams.get("folder") ?? "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_FOLDERS.has(folder)) {
    return json({ error: `Dossier non autorisé : ${folder}` }, 400);
  }

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .list(folder || undefined, {
      limit: 500,
      sortBy: { column: "updated_at", order: "desc" },
    });
  if (error) return json({ error: error.message }, 500);

  /* Enrich each entry with its public URL + path. */
  const rows = (data ?? [])
    .filter((f) => f.id) /* drop folder placeholders */
    .map((f) => {
      const path = folder ? `${folder}/${f.name}` : f.name;
      const { data: pub } = supabaseAdmin!.storage.from(BUCKET).getPublicUrl(path);
      return {
        name: f.name,
        path,
        size: f.metadata?.size ?? null,
        mime: f.metadata?.mimetype ?? null,
        updated_at: f.updated_at,
        created_at: f.created_at,
        publicUrl: pub.publicUrl,
      };
    });

  return json({ folder, files: rows });
};

/* ----------------------------------------------------------------- */
/* POST — upload a single file (multipart/form-data)                  */
/* ----------------------------------------------------------------- */
export const POST: APIRoute = async ({ request, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const form = await request.formData();
  const file = form.get("file");
  const folderRaw = String(form.get("folder") ?? "");
  const upsert = form.get("upsert") === "1";
  const renameTo = form.get("renameTo");

  if (!(file instanceof File)) {
    return json({ error: "Champ 'file' manquant ou invalide" }, 400);
  }
  const folder = folderRaw.replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_FOLDERS.has(folder)) {
    return json({ error: `Dossier non autorisé : ${folder}` }, 400);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return json({ error: `Type non autorisé : ${file.type}` }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: `Fichier trop gros (${(file.size / 1024 / 1024).toFixed(1)} Mo > 8 Mo)` }, 400);
  }

  /* Either user-supplied rename, or safe-slug from original name. */
  const safeName = typeof renameTo === "string" && renameTo.trim()
    ? slugifyFilename(String(renameTo))
    : slugifyFilename(file.name);
  const path = folder ? `${folder}/${safeName}` : safeName;

  const { data, error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      upsert,
      contentType: file.type,
    });
  if (error) {
    /* 409 duplicate if upsert=false and file exists. */
    const status = /duplicate|already exists/i.test(error.message) ? 409 : 500;
    return json({ error: error.message }, status);
  }

  const { data: pub } = supabaseAdmin!.storage.from(BUCKET).getPublicUrl(data.path);
  return json(
    {
      file: {
        name: safeName,
        path: data.path,
        size: file.size,
        mime: file.type,
        publicUrl: pub.publicUrl,
      },
    },
    201
  );
};

/* ----------------------------------------------------------------- */
/* DELETE — remove a file                                             */
/* ----------------------------------------------------------------- */
export const DELETE: APIRoute = async ({ url, cookies }) => {
  const deny = await requireAdmin(cookies);
  if (deny) return deny;

  const path = url.searchParams.get("path");
  if (!path) return json({ error: "Paramètre 'path' requis" }, 400);

  /* Safety : only allow paths inside the whitelisted folders. */
  const folder = path.includes("/") ? path.split("/")[0] : "";
  if (!ALLOWED_FOLDERS.has(folder)) {
    return json({ error: `Chemin hors dossiers autorisés : ${path}` }, 400);
  }

  const { error } = await supabaseAdmin!.storage.from(BUCKET).remove([path]);
  if (error) return json({ error: error.message }, 500);
  return new Response(null, { status: 204 });
};
