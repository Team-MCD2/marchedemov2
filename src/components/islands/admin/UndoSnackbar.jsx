import { useEffect, useState } from "react";

/**
 * UndoSnackbar — bottom-centered transient notification with an
 * "Annuler" action and a countdown ring.
 *
 * Used by the deferred-delete pattern in `ProduitsManager` and
 * `PromosManager` : when the user deletes a row we hide it from the
 * list immediately, queue a setTimeout that fires the actual API
 * DELETE after `deadline - Date.now()` ms, and show this snackbar so
 * they can back out before the timer expires.
 *
 * Props
 * -----
 *   - `label`    : the announcement text, e.g. `« Riz basmati » supprimé.`
 *   - `deadline` : absolute epoch ms when the underlying timer fires.
 *                  Used purely to render the countdown ring — the real
 *                  timer lives in the parent so cancellation is direct.
 *   - `onUndo`   : called when the user clicks "Annuler".
 *   - `row`      : optional, kept on the props purely so the component
 *                  rerenders / resets state when the parent queues a
 *                  fresh delete with a different row id.
 */
export default function UndoSnackbar({ label, deadline, onUndo, row }) {
  const [now, setNow] = useState(() => Date.now());

  /* Tick every 100 ms so the ring animates smoothly without burning
   * CPU. Stops as soon as we've crossed the deadline (parent will
   * unmount us on the next state flush anyway). */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() < deadline) {
        raf = window.setTimeout(tick, 100);
      }
    };
    tick();
    return () => {
      if (raf) clearTimeout(raf);
    };
    /* `row?.id` so a fresh delete (different row) restarts the ring
     * even if `deadline` numerically coincides. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, row?.id]);

  const total = 8000;
  const remaining = Math.max(0, deadline - now);
  const fraction = Math.max(0, Math.min(1, remaining / total));

  /* Ring geometry : circumference = 2π·r ; we shrink the dash-offset
   * as `fraction` decreases so the stroke "drains". */
  const RADIUS = 8;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - fraction);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-noir text-white text-[13px] font-bold shadow-2xl flex items-center gap-3 max-w-[calc(100vw-2rem)]"
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="relative inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full bg-vert hover:bg-vert-dark transition shrink-0"
        aria-label={`Annuler la suppression — ${Math.ceil(remaining / 1000)} s restantes`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 10 10)"
            style={{ transition: "stroke-dashoffset 100ms linear" }}
          />
        </svg>
        <span>Annuler</span>
      </button>
    </div>
  );
}
