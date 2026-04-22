import type { APIRoute } from "astro";
import { login } from "@/lib/auth";

/**
 * POST /api/login — admin login.
 * Expects form-encoded { password }.
 * On success: sets signed cookie + redirects to /admin.
 * On failure: redirects to /admin/login?error=1.
 *
 * `prerender = false` is REQUIRED in Astro hybrid mode — without it
 * the Vercel adapter tries to prerender this route (fails silently
 * because there is no GET handler) and omits it from the routes
 * config, which makes every POST here return 404.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const ok = await login(password, cookies);
  if (!ok) return redirect("/admin/login?error=1", 303);
  return redirect("/admin", 303);
};
