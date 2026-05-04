/**
 * priceDerivation
 *
 * Three-way bidirectional link between the promo price fields:
 *   { prix_original, prix_promo, reduction_pct }
 *
 * Rules
 * -----
 *  - The user edits ONE field at a time. Passed in as `edited`.
 *  - The function re-derives exactly ONE of the other two fields
 *    (the "oldest" of the two, unless locked steps in).
 *  - If a field is `locked`, it is never re-derived. The derived
 *    field is then the remaining unlocked one of the non-edited
 *    pair.
 *  - If both non-edited fields are locked, we ONLY accept the
 *    user's edit and derive nothing (user explicitly pinned both
 *    anchors).
 *  - If the user clears the edited field (empty string, NaN), we
 *    update it but derive nothing.
 *
 * Math
 * ----
 *    prix_promo        = prix_original * (1 - reduction_pct/100)
 *    prix_original     = prix_promo / (1 - reduction_pct/100)
 *    reduction_pct     = round(100 * (prix_original - prix_promo) / prix_original)
 *
 * Rounding
 * --------
 *    prix -> 2 decimals (banker-style via Math.round after *100)
 *    pct  -> integer
 *
 * Locks
 * -----
 *    A `lastEdited` history is used to pick which non-edited field
 *    is derived. Invariant: "lastEdited" stays as the most-recent
 *    user-originated edit; the OTHER non-edited field is derived
 *    first. This matches the mental model of "I just typed two
 *    prices; compute the % from them" without the user having to
 *    explicitly say so.
 *
 * Tested by  : src/lib/__tests__/priceDerivation.test.mjs
 */

export type PriceField = "prix_original" | "prix_promo" | "reduction_pct";

export type PriceTriple = {
  prix_original: number | string | null | undefined;
  prix_promo: number | string | null | undefined;
  reduction_pct: number | string | null | undefined;
};

export type DeriveOptions = {
  /** Field the user just typed into. Its new value is already in `triple`. */
  edited: PriceField;
  /**
   * Previous field the user typed into (most-recent before `edited`).
   * Used to pick the "older" sibling to derive. Optional.
   */
  lastEdited?: PriceField;
  /** Fields the user pinned with the lock icon. These are never re-derived. */
  locked?: ReadonlySet<PriceField>;
};

export type DeriveResult = {
  prix_original: number | "";
  prix_promo: number | "";
  reduction_pct: number | "";
  /** Which field, if any, was re-derived by this call. */
  derived: PriceField | null;
  /** Next lastEdited value the caller should persist (= edited). */
  lastEdited: PriceField;
};

/* ---------- helpers ---------- */

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n);
}

/* ---------- core ---------- */

export function derivePrices(
  triple: PriceTriple,
  { edited, lastEdited, locked }: DeriveOptions
): DeriveResult {
  const lockedSet = locked ?? new Set<PriceField>();

  /* Numeric view. `null` = not usable. */
  const nOrig = toNum(triple.prix_original);
  const nPromo = toNum(triple.prix_promo);
  const nPct = toNum(triple.reduction_pct);

  /* Pick the target field to derive.
   * - It is one of the two "non-edited" fields.
   * - It must NOT be locked.
   * - Among the two candidates, prefer the one that is NOT `lastEdited`
   *   (so the "oldest" of the two anchors is the one that gets refreshed).
   */
  const nonEdited = (["prix_original", "prix_promo", "reduction_pct"] as PriceField[]).filter(
    (f) => f !== edited
  );
  const unlocked = nonEdited.filter((f) => !lockedSet.has(f));

  let target: PriceField | null = null;
  if (unlocked.length === 1) {
    target = unlocked[0];
  } else if (unlocked.length === 2) {
    /* Prefer the one that is NOT lastEdited. */
    if (lastEdited && unlocked.includes(lastEdited)) {
      target = unlocked.find((f) => f !== lastEdited) ?? unlocked[0];
    } else {
      /* No lastEdited hint. Default priority: prefer deriving reduction_pct
       * when prices are the anchors (most common case). */
      if (edited === "prix_original" || edited === "prix_promo") {
        target = "reduction_pct";
      } else {
        target = "prix_promo";
      }
    }
  }

  /* Fallback output (just whatever the user has typed, unchanged). */
  let outOrig: number | "" = nOrig ?? "";
  let outPromo: number | "" = nPromo ?? "";
  let outPct: number | "" = nPct ?? "";

  /* Make sure the just-edited field keeps its raw numeric form for display
   * consistency when it round-trips (user typed "12.345" -> we don't
   * aggressively round their live input; rounding happens on the DERIVED
   * field only). */

  /* Derive. All three anchors must resolve to numbers for the
   * corresponding formula to fire. */
  let derived: PriceField | null = null;

  if (target) {
    switch (target) {
      case "reduction_pct": {
        if (nOrig != null && nPromo != null && nOrig > 0 && nPromo >= 0) {
          const pct = roundPct(((nOrig - nPromo) / nOrig) * 100);
          /* Clamp to [0, 99] so the existing form validation doesn't reject. */
          outPct = Math.max(0, Math.min(99, pct));
          derived = "reduction_pct";
        }
        break;
      }
      case "prix_promo": {
        if (nOrig != null && nPct != null && nOrig >= 0 && nPct >= 0 && nPct < 100) {
          const promo = roundPrice(nOrig * (1 - nPct / 100));
          outPromo = Math.max(0, promo);
          derived = "prix_promo";
        }
        break;
      }
      case "prix_original": {
        if (nPromo != null && nPct != null && nPromo >= 0 && nPct >= 0 && nPct < 100) {
          const orig = roundPrice(nPromo / (1 - nPct / 100));
          outOrig = Math.max(0, orig);
          derived = "prix_original";
        }
        break;
      }
    }
  }

  return {
    prix_original: outOrig,
    prix_promo: outPromo,
    reduction_pct: outPct,
    derived,
    lastEdited: edited,
  };
}
