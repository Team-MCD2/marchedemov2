/**
 * admin-errors.ts — translate cryptic JS errors into French
 * messages we are happy to put inside an admin toast.
 *
 * Why
 * ---
 * `fetch()` rejects with `TypeError: fetch failed` (Node / Undici) or
 * `TypeError: Failed to fetch` (Chromium / Firefox) when the request
 * never reaches the server (offline, dropped socket, dev-server
 * restart). Surfacing the raw `err.message` — as we did everywhere in
 * the managers — exposes implementation detail to non-technical users
 * and provides zero recovery hint. This helper centralises the mapping
 * so every `notify("err", ...)` call site uses the same wording.
 *
 * Use it like:
 *
 *   } catch (err) {
 *     notify("err", `Erreur : ${humanizeError(err)}`);
 *   }
 *
 * Keep this list short and high-signal — it's not an i18n framework.
 */

export function humanizeError(err: unknown): string {
  /* AbortError surfaces when the user cancels a request (e.g. closes
   * a modal mid-fetch). We don't want a scary toast for that. */
  if (err && typeof err === "object" && (err as any).name === "AbortError") {
    return "Requête annulée.";
  }

  const raw =
    err && typeof err === "object" && typeof (err as any).message === "string"
      ? (err as any).message
      : String(err ?? "");

  /* Network-level failure. Both Node and the browser throw a TypeError
   * with one of these strings in the message. */
  if (/fetch failed|Failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(raw)) {
    return "Réseau indisponible — vérifiez votre connexion et réessayez.";
  }

  /* JSON.parse failure on a non-JSON response (e.g. HTML 502 page).
   * The default Node message ("Unexpected token < in JSON at position 0")
   * is hostile; this rewording suggests retry. */
  if (/Unexpected token .* in JSON|Unexpected end of JSON input/i.test(raw)) {
    return "Réponse serveur invalide — réessayez dans un instant.";
  }

  /* 401 / 403 surface as an Error message we threw upstream. Tag it
   * specifically so the operator knows to log back in. */
  if (/Unauthorized|Forbidden|401|403/i.test(raw)) {
    return "Session expirée — reconnectez-vous (Déconnexion → Login).";
  }

  /* Unknown — fall through to the original message but trim absurdly
   * long stack-style strings. */
  return raw.length > 240 ? raw.slice(0, 237) + "…" : raw || "Erreur inconnue.";
}
