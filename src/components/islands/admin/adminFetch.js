/**
 * adminFetch — thin `fetch()` wrapper for the admin islands that
 * handles the one error code every long-running form has to deal
 * with : 401 from an expired admin cookie.
 *
 * What it does
 * ------------
 *   - Forwards everything to `fetch()` exactly as given.
 *   - If the response status is 401, it :
 *       1. (optional) Persists the form payload to sessionStorage so
 *          the create/edit modal can rehydrate after re-login. The
 *          caller passes a `draftKey` + `draftValue` for that.
 *       2. Redirects the tab to `/admin/login?next=<currentPath>` so
 *          POST /api/login can bring the user back.
 *   - For all other responses, returns the `Response` object verbatim.
 *
 * Why it exists
 * -------------
 * Before this wrapper, an expired cookie surfaced as a generic
 * "Erreur : Unauthorized" toast and the user lost everything they had
 * typed. Dozens of fetch() call-sites in the managers each handled
 * 401 in slightly different ways or not at all. Centralising it keeps
 * the recovery flow consistent and lets us evolve it (banner, retry,
 * silent re-auth) in one place.
 *
 * Usage
 * -----
 *   const res = await adminFetch("/api/admin/produits", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *     headers: { "Content-Type": "application/json" },
 *     // optional draft persistence on 401 :
 *     draftKey: "admin.draft.produit",
 *     draftValue: form,
 *   });
 *
 * Side effect : on 401 the function NEVER resolves because we navigate
 * away. Callers should not await any post-fetch logic for that case.
 */

const SESSION_NEXT_KEY = "admin.session.next";

/**
 * @param {string | URL | Request} input
 * @param {RequestInit & { draftKey?: string, draftValue?: unknown }} [init]
 * @returns {Promise<Response>}
 */
export async function adminFetch(input, init = {}) {
  const { draftKey, draftValue, ...fetchInit } = init;
  const res = await fetch(input, fetchInit);
  if (res.status !== 401) return res;
  /* Persist the in-flight payload (typically the EditModal form) so a
   * subsequent admin page load can offer to restore it. We swallow
   * sessionStorage errors (private mode, quota) so the redirect still
   * happens. */
  if (draftKey != null && draftValue !== undefined) {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ savedAt: Date.now(), value: draftValue }),
      );
    } catch {
      /* harmless */
    }
  }
  /* Round-trip the current location so the user lands back on the
   * page they were on after login. */
  try {
    const next = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(SESSION_NEXT_KEY, next);
    const url = `/admin/login?next=${encodeURIComponent(next)}&expired=1`;
    window.location.assign(url);
  } catch {
    /* If location is locked (sandboxed iframe / weird embed) the user
     * still gets the 401 response and our caller's normal error path
     * will run. */
  }
  /* Return a never-resolving promise : the page is unloading, callers
   * shouldn't run any post-fetch code. Helps avoid flashing an error
   * toast on top of the navigation. */
  return new Promise(() => {});
}

/**
 * Try to load a previously stored draft (e.g. one stashed by
 * `adminFetch` before redirecting to login). Returns the bare value or
 * `null` if absent / expired.
 *
 * @param {string} key
 * @param {{ maxAgeMs?: number }} [opts]
 */
export function loadDraft(key, opts = {}) {
  if (typeof window === "undefined") return null;
  const maxAgeMs = opts.maxAgeMs ?? 60 * 60 * 1000; /* 1 h default */
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > maxAgeMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

/**
 * Persist a draft outside the 401 path (used by E.S2 auto-save).
 * Same shape as the one stored by `adminFetch`.
 *
 * @param {string} key
 * @param {unknown} value
 */
export function saveDraft(key, value) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), value }),
    );
  } catch {
    /* harmless */
  }
}

/**
 * @param {string} key
 */
export function clearDraft(key) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* harmless */
  }
}
