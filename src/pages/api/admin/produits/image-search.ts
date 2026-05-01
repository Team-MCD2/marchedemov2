/**
 * /api/admin/produits/image-search
 * --------------------------------
 * Interactive "Chercher image" helper for the admin UI. Given a free
 * form query (typically a product name) it hits OpenFoodFacts and
 * returns up to N ready-to-use image candidates, each with full
 * attribution metadata the UI can surface.
 *
 * This is a READ-only endpoint. The admin picks a candidate client-side
 * and the actual `image_url` PATCH goes through the existing
 * `/api/admin/produits/[id]` route, keeping the audit trail of which
 * external URL ended up attached to which product transparent.
 *
 * We accept either GET (?q=...) or POST ({ query }) so the UI can use
 * whichever is cleaner; GET is preferred for caching at the Vercel edge
 * if we later introduce a short TTL.
 *
 *   Response :
 *     {
 *       query    : string
 *       results  : ImageCandidate[]           // deduped, popularity-sorted
 *       count    : number                     // results.length
 *       source   : "openfoodfacts"
 *     }
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { searchOFFImages } from "@/lib/off-search";

export const prerender = false;

const MAX_PAGE_SIZE = 24;
const DEFAULT_PAGE_SIZE = 12;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function handle(query: string, pageSizeRaw: unknown): Promise<Response> {
  const q = query.trim();
  if (!q) {
    return json({ error: "`query` est requis" }, 400);
  }
  if (q.length > 120) {
    return json({ error: "`query` trop long (max 120 caractères)" }, 400);
  }
  let pageSize = DEFAULT_PAGE_SIZE;
  if (pageSizeRaw != null) {
    const n = Number(pageSizeRaw);
    if (!Number.isFinite(n) || n < 1 || n > MAX_PAGE_SIZE) {
      return json(
        { error: `pageSize doit être dans [1, ${MAX_PAGE_SIZE}]` },
        400,
      );
    }
    pageSize = Math.floor(n);
  }

  try {
    const results = await searchOFFImages(q, { pageSize });
    return json({
      query: q,
      results,
      count: results.length,
      source: "openfoodfacts" as const,
    });
  } catch (err: any) {
    return json(
      { error: err?.message ?? "Échec de la recherche OpenFoodFacts" },
      502,
    );
  }
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const q = url.searchParams.get("q") ?? "";
  const pageSize = url.searchParams.get("pageSize");
  return handle(q, pageSize);
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await isAuthenticated(cookies))) {
    return json({ error: "Unauthorized" }, 401);
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON body invalide" }, 400);
  }
  const q = String(body?.query ?? "");
  return handle(q, body?.pageSize);
};
