import type { APIRoute } from "astro";

/**
 * POST /api/newsletter
 * Accepts form-encoded or JSON payload with { email }.
 * In prod, forward to Brevo / Mailchimp using env API key.
 * Here, we simply echo back success to keep the pipeline working in dev.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const ct = request.headers.get("content-type") ?? "";
  let email = "";
  let wantsJson = ct.includes("application/json");

  if (wantsJson) {
    const body = await request.json().catch(() => ({}));
    email = typeof body.email === "string" ? body.email : "";
  } else {
    const form = await request.formData();
    email = String(form.get("email") ?? "");
  }

  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!ok) {
    if (wantsJson) {
      return new Response(JSON.stringify({ ok: false, error: "Email invalide" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return redirect("/?newsletter=error", 303);
  }

  // TODO (prod) — forward to Brevo / Mailchimp
  // const apiKey = import.meta.env.BREVO_API_KEY;
  // if (apiKey) { ... }

  console.log("[newsletter] subscribe:", email);

  if (wantsJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return redirect("/?newsletter=ok", 303);
};
