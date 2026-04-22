import { useEffect, useRef, useState } from "react";

/**
 * ChatMo — floating contact widget "Monsieur Mo'".
 *
 * Zero backend : just deep-links to WhatsApp, tel:, and mailto:.
 * Used as a React island with client:idle in Layout.astro so it
 * never blocks the critical render path.
 *
 * Props :
 *   - phoneE164    : "+33582958252"   (for tel: link, canonical form)
 *   - phoneDisplay : "05 82 95 82 52" (for UI display, formatted FR)
 *   - email        : "contact@marchedemo.com"
 *   - whatsappNumber (optional) : override the WhatsApp number if
 *                                  different from the main phone.
 *                                  Must be E.164 without "+".
 */
export default function ChatMo({
  phoneE164,
  phoneDisplay,
  email,
  whatsappNumber,
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef(null);
  const fabRef = useRef(null);

  /* Gate the entrance animation to the next frame so the initial
     transform starts from its "closed" state, not already-open. */
  useEffect(() => {
    setMounted(true);
  }, []);

  /* Close on Escape, and trap nothing else — we keep it lightweight. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    const onClickOutside = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        !fabRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    /* Slight delay so the opening click itself doesn't trigger a close. */
    const t = setTimeout(() => {
      document.addEventListener("click", onClickOutside);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClickOutside);
      clearTimeout(t);
    };
  }, [open]);

  /* Build deep-links. All three are safe to expose publicly. */
  const waDigits = (whatsappNumber ?? phoneE164).replace(/\D/g, "");
  const waLink = `https://wa.me/${waDigits}?text=${encodeURIComponent(
    "Bonjour ! J'ai une question sur Marché de Mo'."
  )}`;
  const telLink = `tel:${phoneE164}`;
  const mailLink = `mailto:${email}?subject=${encodeURIComponent(
    "Question depuis le site Marché de Mo'"
  )}`;

  return (
    <>
      {/* ---------------- Panel ---------------- */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Contacter Monsieur Mo'"
        aria-hidden={!open}
        className={[
          "fixed z-[60] bottom-24 right-4 md:right-6",
          "w-[calc(100vw-2rem)] sm:w-[360px] max-w-[360px]",
          "bg-white rounded-3xl overflow-hidden",
          "shadow-[0_20px_60px_rgba(0,0,0,0.25)] ring-1 ring-black/5",
          "origin-bottom-right transition-all duration-300 ease-out",
          open
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-3 scale-95 pointer-events-none",
        ].join(" ")}
      >
        {/* Header : gradient vert + Mo' avatar + close */}
        <div className="bg-gradient-to-br from-vert to-vert-dark text-white p-5 relative">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-inner shrink-0"
            >
              <img
                src="/logos/favicon-marchedemo.png"
                alt=""
                width="32"
                height="32"
                className="w-8 h-8 object-contain"
                loading="lazy"
                decoding="async"
              />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-soft font-black text-[16px] leading-tight">
                Monsieur Mo'
              </p>
              <p className="text-white/90 text-[12px] mt-0.5 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"
                />
                Réponse habituelle en &lt; 1h · 7j/7
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mt-4 text-white/95 text-[13.5px] leading-snug">
            Une question sur une promo, un produit, un recrutement ?
            Choisissez votre canal préféré, on vous répond.
          </p>
        </div>

        {/* Channels */}
        <div className="p-3 space-y-1.5">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-50 transition group"
            onClick={() => setOpen(false)}
          >
            <span className="w-11 h-11 rounded-2xl bg-[#25D366] flex items-center justify-center shrink-0">
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.465 3.488" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-soft font-bold text-[14px] text-neutral-900">
                WhatsApp
              </p>
              <p className="text-[12px] text-neutral-500 truncate">
                Écrire maintenant · le plus rapide
              </p>
            </div>
            <svg
              className="w-4 h-4 text-neutral-300 group-hover:text-vert group-hover:translate-x-0.5 transition"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <a
            href={telLink}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-50 transition group"
            onClick={() => setOpen(false)}
          >
            <span className="w-11 h-11 rounded-2xl bg-vert flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-soft font-bold text-[14px] text-neutral-900">
                Téléphone
              </p>
              <p className="text-[12px] text-neutral-500 truncate">
                {phoneDisplay} · lun-dim 8h-22h
              </p>
            </div>
            <svg
              className="w-4 h-4 text-neutral-300 group-hover:text-vert group-hover:translate-x-0.5 transition"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <a
            href={mailLink}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-50 transition group"
            onClick={() => setOpen(false)}
          >
            <span className="w-11 h-11 rounded-2xl bg-noir flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 6-10 7L2 6" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-soft font-bold text-[14px] text-neutral-900">
                Email
              </p>
              <p className="text-[12px] text-neutral-500 truncate">{email}</p>
            </div>
            <svg
              className="w-4 h-4 text-neutral-300 group-hover:text-vert group-hover:translate-x-0.5 transition"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {/* Small trust line */}
        <div className="bg-neutral-50 border-t border-neutral-100 px-5 py-3 text-[11px] text-neutral-500 leading-relaxed">
          Nous ne demandons jamais vos coordonnées bancaires par message.
          Merci de rester vigilants.
        </div>
      </div>

      {/* ---------------- FAB ---------------- */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer le chat" : "Contacter Monsieur Mo'"}
        aria-expanded={open}
        aria-controls="chat-mo-panel"
        className={[
          "fixed z-[60] bottom-4 right-4 md:bottom-6 md:right-6",
          "h-14 w-14 rounded-full bg-vert text-white",
          "shadow-[0_10px_30px_rgba(28,107,53,0.4)]",
          "flex items-center justify-center",
          "transition-all duration-300 ease-out",
          "hover:bg-vert-dark hover:scale-105",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-vert/30",
          mounted ? "opacity-100 scale-100" : "opacity-0 scale-75",
          open ? "rotate-0" : "rotate-0",
        ].join(" ")}
      >
        {open ? (
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}
