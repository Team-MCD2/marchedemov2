/**
 * /api/admin/produits/slug-check
 *
 *   GET ?slug=riz-basmati&exceptId=<uuid|optional>
 *     -> { slug, available: boolean }
 *
 * Used by the admin produit form for live uniqueness validation.
 * Admin-only; cheap indexed lookup.
 */
import type { APIRoute } from "astro";
import { isAuthenticated } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!(await isAuthenticated(cookies))) return json({ error: "Unauthorized" }, 401);
  if (!supabaseAdmin) return json({ error: "Supabase service_role key missing" }, 500);

  const slug = (url.searchParams.get("slug") ?? "").trim();
  const exceptId = url.searchParams.get("exceptId")?.trim() || null;

  if (!slug) return json({ slug: "", available: false });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return json({ slug, available: false, reason: "format" });
  }

  let q = supabaseAdmin.from("produits").select("id").eq("slug", slug).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q;

  if (error) return json({ error: error.message }, 500);
  return json({ slug, available: (data ?? []).length === 0 });
};
