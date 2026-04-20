import type { APIRoute } from "astro";
import { login } from "@/lib/auth";

/**
 * POST /api/login — admin login.
 * Expects form-encoded { password }.
 * On success: sets signed cookie + redirects to /admin.
 * On failure: redirects to /admin/login?error=1.
 */
export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const ok = await login(password, cookies);
  if (!ok) return redirect("/admin/login?error=1", 303);
  return redirect("/admin", 303);
};
