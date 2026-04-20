import type { APIRoute } from "astro";

/**
 * POST /api/candidature — job application form.
 * Accepts multipart/form-data for CV upload.
 * Fields: prenom, nom, email, telephone, magasin, poste, message, rgpd, cv (File).
 */
export const POST: APIRoute = async ({ request }) => {
  if (!request.headers.get("content-type")?.includes("multipart/form-data") &&
      !request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    return jsonError("Format attendu : multipart/form-data", 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Impossible de lire le formulaire", 400);
  }

  const data = {
    prenom: String(form.get("prenom") ?? ""),
    nom: String(form.get("nom") ?? ""),
    email: String(form.get("email") ?? ""),
    telephone: String(form.get("telephone") ?? ""),
    magasin: String(form.get("magasin") ?? "tous"),
    poste: String(form.get("poste") ?? "spontanee"),
    message: String(form.get("message") ?? ""),
    rgpd: form.get("rgpd") === "on" || form.get("rgpd") === "true",
  };

  const cv = form.get("cv");
  const hasCv = cv instanceof File && cv.size > 0;

  if (!data.prenom || !data.nom || !data.email || !data.telephone) {
    return jsonError("Champs obligatoires manquants", 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return jsonError("Email invalide", 400);
  }
  if (!data.rgpd) {
    return jsonError("Vous devez accepter le traitement de vos données", 400);
  }
  if (hasCv) {
    if (cv.size > 5 * 1024 * 1024) return jsonError("CV trop lourd (max 5 Mo)", 400);
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(cv.type)) return jsonError("Format CV non supporté (PDF, DOC, DOCX)", 400);
  }

  // TODO (prod) — store CV + forward to recruiting email / ATS
  console.log("[candidature]", { ...data, hasCv, cvName: hasCv ? cv.name : null });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
