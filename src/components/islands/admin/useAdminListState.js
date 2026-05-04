import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useAdminListState - URL-persisted list state for admin tables.
 *
 * Returns a stable `state` object and a `set` mutator that updates
 * both React state AND the URL query string (via history.replaceState
 * so no navigation happens). On mount, state is hydrated from the
 * current URL; on unmount, nothing is cleaned up (the URL reflects
 * the last state you left the page in).
 *
 *   const { state, set, reset } = useAdminListState({
 *     defaults: { q: "", rayon: "", statut: "all", sort: "ordre", dir: "asc" },
 *     allowed: { statut: ["all", "active", "inactive"] },
 *   });
 *
 * Params
 * ------
 *   defaults : object        default values for every key you manage.
 *   allowed  : optional      per-key whitelist of accepted string values.
 *                            Values outside the whitelist fall back to
 *                            the default.
 *   storageKey : optional    localStorage key to ALSO persist state to,
 *                            so opening the page later without URL args
 *                            still restores the last view.
 *
 * Notes
 * -----
 *   - Keys whose value equals the default are REMOVED from the URL to
 *     keep shareable links short.
 *   - The hook debounces URL writes at ~120 ms to avoid thrashing the
 *     browser on fast keystrokes (search input).
 *   - SSR-safe: on the server (no `window`), returns defaults and a
 *     no-op setter.
 */

function readFromURL(defaults, allowed) {
  if (typeof window === "undefined") return { ...defaults };
  const p = new URLSearchParams(window.location.search);
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const raw = p.get(key);
    if (raw == null) continue;
    if (allowed?.[key] && !allowed[key].includes(raw)) continue;
    out[key] = raw;
  }
  return out;
}

function readFromStorage(storageKey, defaults, allowed) {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (parsed[key] == null) continue;
      if (allowed?.[key] && !allowed[key].includes(parsed[key])) continue;
      out[key] = parsed[key];
    }
    return out;
  } catch {
    return null;
  }
}

export function useAdminListState({ defaults, allowed, storageKey } = {}) {
  /* ----------------------------------------------------------------
   * Hydration-safe initial state.
   *
   * The previous implementation read `window.location.search` AND
   * `window.localStorage` inside the `useState(() => ...)` initializer.
   * That works on the server (both readers gate on `typeof window`),
   * but on the client's FIRST render — which is the hydration pass —
   * it reads URL params and storage values that the server didn't
   * see, producing different initial state and a React hydration
   * mismatch ("server HTML does not match client").
   *
   * The fix is a standard two-pass pattern :
   *   1. Pass 1 (matches SSR) : initial state = defaults exactly.
   *   2. Pass 2 (post-hydration `useEffect`) : if URL has params, apply
   *      them ; else fall back to storage. From this point on, normal
   *      controlled-component rendering takes over.
   *
   * The visible effect is a one-frame "flash" of default filters
   * before URL/storage values pop in — acceptable for an admin page
   * loaded with `client:load`, and the only correct behaviour given
   * that URL/storage are inherently client-only state. */
  const [state, setState] = useState(defaults);
  const [hydrated, setHydrated] = useState(false);

  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  /* Pass-2 sync : runs once after hydration on the client only. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = readFromURL(defaultsRef.current, allowedRef.current);
    const urlHasValues = Object.keys(defaultsRef.current).some(
      (k) => fromUrl[k] !== defaultsRef.current[k],
    );
    if (urlHasValues) {
      setState(fromUrl);
    } else {
      const fromStorage = readFromStorage(
        storageKeyRef.current,
        defaultsRef.current,
        allowedRef.current,
      );
      if (fromStorage) setState(fromStorage);
    }
    setHydrated(true);
    /* Empty dep array on purpose : we want this to fire exactly once
     * after the first render, and never again. The refs above let us
     * read the latest defaults / storage key without re-running. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Debounced URL + storage write. Skipped until hydration is done so
   * we never overwrite the user's existing URL/storage with our
   * (still-default) initial state. */
  const writeTimer = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try {
        const p = new URLSearchParams(window.location.search);
        for (const key of Object.keys(defaultsRef.current)) {
          const val = state[key];
          if (val == null || val === "" || val === defaultsRef.current[key]) {
            p.delete(key);
          } else {
            p.set(key, String(val));
          }
        }
        const qs = p.toString();
        const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(window.history.state, "", next);
        if (storageKeyRef.current) {
          try {
            window.localStorage.setItem(storageKeyRef.current, JSON.stringify(state));
          } catch {
            /* storage may be full or disabled; non-fatal */
          }
        }
      } catch {
        /* history API disabled in some sandboxed contexts */
      }
    }, 120);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [state]);

  const set = useCallback((patchOrKey, maybeValue) => {
    if (typeof patchOrKey === "string") {
      setState((s) => ({ ...s, [patchOrKey]: maybeValue }));
    } else {
      setState((s) => ({ ...s, ...patchOrKey }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ ...defaultsRef.current });
  }, []);

  const activeCount = useMemo(() => {
    return Object.keys(defaultsRef.current).filter((k) => state[k] !== defaultsRef.current[k]).length;
  }, [state]);

  return { state, set, reset, activeCount };
}

/**
 * Generic comparator for sortable list rows.
 *   compareRows(a, b, "titre", "asc")
 * Nulls are pushed to the end regardless of direction (stable UX).
 */
export function compareRows(a, b, field, dir = "asc") {
  const av = a?.[field];
  const bv = b?.[field];
  /* Nulls last */
  const aNull = av == null || av === "";
  const bNull = bv == null || bv === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  let cmp;
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else if (!isNaN(Date.parse(av)) && !isNaN(Date.parse(bv)) && /^\d{4}-\d{2}-\d{2}/.test(String(av))) {
    cmp = new Date(av).getTime() - new Date(bv).getTime();
  } else {
    cmp = String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}
