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
  const [state, setState] = useState(() => {
    const fromUrl = readFromURL(defaults, allowed);
    /* If any key differs from default, URL wins; else try storage. */
    const urlHasValues = Object.keys(defaults).some((k) => fromUrl[k] !== defaults[k]);
    if (urlHasValues) return fromUrl;
    return readFromStorage(storageKey, defaults, allowed) ?? fromUrl;
  });

  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  /* Debounced URL + storage write. */
  const writeTimer = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
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
