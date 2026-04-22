import type { APIRoute } from "astro";

/**
 * POST /api/contact — service client form.
 * Fields: prenom, nom, email, sujet, message, rgpd.
 * Logs + returns JSON (or redirect for form-encoded).
 *
 * `prerender = false` required in hybrid mode (cf login.ts).
 */
export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const ct = request.headers.get("content-type") ?? "";
  const wantsJson = ct.includes("application/json");
  let payload: Record<string, string> = {};

  if (wantsJson) {
    payload = await request.json().catch(() => ({}));
  } else {
    const form = await request.formData();
    for (const [k, v] of form.entries()) payload[k] = String(v);
  }

  const { prenom, nom, email, sujet, message } = payload;

  if (!prenom || !nom || !email || !sujet || !message) {
    const err = "Tous les champs obligatoires doivent être remplis";
    if (wantsJson) {
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return redirect("/service-client?contact=error", 303);
  }

  // TODO (prod) — forward to email service (Resend, SendGrid…)
  console.log("[contact]", { prenom, nom, email, sujet });

  if (wantsJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return redirect("/service-client?contact=ok", 303);
};
