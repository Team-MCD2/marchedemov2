/**
 * Tiny hand-rolled tests for priceDerivation.
 * Run with : node src/lib/__tests__/priceDerivation.test.mjs
 *
 * (No test framework installed in this repo; the vendoring overhead
 * isn't worth it for a pure util. Assertions via node:assert.)
 */
import assert from "node:assert/strict";
import { derivePrices } from "../priceDerivation.ts";

/* --------------------------------------------------------------- */
/* 1. Edit a prix -> reduction_pct is derived.                      */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 10, prix_promo: 8, reduction_pct: "" },
    { edited: "prix_promo", lastEdited: "prix_original" }
  );
  assert.equal(r.derived, "reduction_pct");
  assert.equal(r.reduction_pct, 20);
  assert.equal(r.prix_original, 10);
  assert.equal(r.prix_promo, 8);
  console.log("[ok] prix pair -> pct = 20%");
}

/* --------------------------------------------------------------- */
/* 2. Edit reduction_pct with prix_original pinned -> prix_promo    */
/*    derives.                                                      */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 20, prix_promo: 0, reduction_pct: 25 },
    { edited: "reduction_pct", lastEdited: "prix_original" }
  );
  assert.equal(r.derived, "prix_promo");
  assert.equal(r.prix_promo, 15);
  assert.equal(r.prix_original, 20);
  assert.equal(r.reduction_pct, 25);
  console.log("[ok] % + prix_original -> prix_promo = 15");
}

/* --------------------------------------------------------------- */
/* 3. Edit reduction_pct with prix_promo pinned -> prix_original    */
/*    derives.                                                      */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 99, prix_promo: 15, reduction_pct: 25 },
    { edited: "reduction_pct", lastEdited: "prix_promo" }
  );
  assert.equal(r.derived, "prix_original");
  assert.equal(r.prix_original, 20);
  assert.equal(r.prix_promo, 15);
  assert.equal(r.reduction_pct, 25);
  console.log("[ok] % + prix_promo -> prix_original = 20");
}

/* --------------------------------------------------------------- */
/* 4. Lock prix_original: editing % must derive prix_promo even if  */
/*    lastEdited would otherwise route to prix_original.            */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 20, prix_promo: 15, reduction_pct: 10 },
    {
      edited: "reduction_pct",
      lastEdited: "prix_promo",
      locked: new Set(["prix_original"]),
    }
  );
  assert.equal(r.derived, "prix_promo");
  assert.equal(r.prix_original, 20);
  assert.equal(r.prix_promo, 18);
  assert.equal(r.reduction_pct, 10);
  console.log("[ok] lock(prix_original) + edit% -> prix_promo = 18");
}

/* --------------------------------------------------------------- */
/* 5. Lock both anchors: editing % does NOTHING to prices.          */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 20, prix_promo: 15, reduction_pct: 42 },
    {
      edited: "reduction_pct",
      lastEdited: "prix_promo",
      locked: new Set(["prix_original", "prix_promo"]),
    }
  );
  assert.equal(r.derived, null);
  assert.equal(r.prix_original, 20);
  assert.equal(r.prix_promo, 15);
  assert.equal(r.reduction_pct, 42);
  console.log("[ok] lock(both prices) + edit% -> no derivation");
}

/* --------------------------------------------------------------- */
/* 6. Clearing a field: derivation halts gracefully, no crash.      */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: "", prix_promo: 8, reduction_pct: 20 },
    { edited: "prix_original", lastEdited: "prix_promo" }
  );
  assert.equal(r.derived, null);
  assert.equal(r.prix_original, "");
  assert.equal(r.prix_promo, 8);
  assert.equal(r.reduction_pct, 20);
  console.log("[ok] cleared prix_original -> no derivation, no crash");
}

/* --------------------------------------------------------------- */
/* 7. Rounding stability: 10 -> 33% -> should give 6.7, and         */
/*    re-deriving from 10 + 6.7 should give 33%.                    */
/* --------------------------------------------------------------- */
{
  const r1 = derivePrices(
    { prix_original: 10, prix_promo: 0, reduction_pct: 33 },
    { edited: "reduction_pct", lastEdited: "prix_original" }
  );
  assert.equal(r1.derived, "prix_promo");
  assert.equal(r1.prix_promo, 6.7);

  const r2 = derivePrices(
    { prix_original: 10, prix_promo: 6.7, reduction_pct: "" },
    { edited: "prix_promo", lastEdited: "reduction_pct" }
  );
  assert.equal(r2.derived, "reduction_pct");
  assert.equal(r2.reduction_pct, 33);
  console.log("[ok] rounding stability 10/33% <-> 10/6.7");
}

/* --------------------------------------------------------------- */
/* 8. Edge: 100% reduction_pct is rejected to avoid divide-by-zero. */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: "", prix_promo: 5, reduction_pct: 100 },
    { edited: "reduction_pct", lastEdited: "prix_promo" }
  );
  /* prix_original would be infinity, so we don't derive. */
  assert.equal(r.derived, null);
  assert.equal(r.prix_original, "");
  console.log("[ok] 100% does not divide by zero");
}

/* --------------------------------------------------------------- */
/* 9. pct is clamped to [0, 99] on derive.                          */
/* --------------------------------------------------------------- */
{
  const r = derivePrices(
    { prix_original: 10, prix_promo: 20, reduction_pct: "" },
    { edited: "prix_promo", lastEdited: "prix_original" }
  );
  assert.equal(r.derived, "reduction_pct");
  assert.equal(r.reduction_pct, 0); /* clamped negative -> 0 */
  console.log("[ok] pct clamped to 0 when prix_promo > prix_original");
}

console.log("\nAll priceDerivation tests passed.");
