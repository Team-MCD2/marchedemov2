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

/* Whitelist for `next` redirects : same-origin, must start with /admin
 * to avoid the obvious open-redirect / phishing surface. Anything else
 * silently falls through to /admin. */
function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/admin";
  if (!raw.startsWith("/admin")) return "/admin";
  /* Reject protocol-relative URLs ("//evil.example/admin") and hosts
   * embedded via backslash quirks. */
  if (raw.startsWith("//") || raw.includes("\\")) return "/admin";
  return raw;
}

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));
  const ok = await login(password, cookies);
  if (!ok) {
    /* Preserve `next` across the failed-login round-trip so the user
     * still lands where they were heading after the second attempt. */
    const qs = new URLSearchParams({ error: "1" });
    if (next !== "/admin") qs.set("next", next);
    return redirect(`/admin/login?${qs.toString()}`, 303);
  }
  return redirect(next, 303);
};
