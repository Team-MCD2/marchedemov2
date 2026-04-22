import type { APIRoute } from "astro";

/**
 * POST /api/fidelite — loyalty program sign-up.
 * Fields: prenom, nom, email, telephone, magasin, rgpd.
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

  const { prenom, nom, email } = payload;
  if (!prenom || !nom || !email) {
    if (wantsJson) {
      return new Response(JSON.stringify({ ok: false, error: "Champs obligatoires manquants" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    return redirect("/programme-fidelite?fidelite=error", 303);
  }

  // TODO (prod) — create loyalty account + send welcome email with virtual card
  console.log("[fidelite]", { prenom, nom, email });

  if (wantsJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  return redirect("/programme-fidelite?fidelite=ok", 303);
};
