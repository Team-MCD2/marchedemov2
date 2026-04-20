import { useRef } from "react";

/**
 * PromoCarousel — horizontal scroll snap avec boutons précédent/suivant.
 * Receives already-rendered promo cards as children (SSR) + a trailing CTA.
 */
export default function PromoCarousel({ children }) {
  const scrollerRef = useRef(null);

  const scroll = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector(":scope > *");
    const step = card ? card.offsetWidth + 24 : 320;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div />
        <div className="flex gap-2">
          <button
            aria-label="Promo précédente"
            onClick={() => scroll(-1)}
            className="w-11 h-11 rounded-full bg-white border-2 border-black/10 hover:border-vert hover:text-vert transition"
          >
            <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            aria-label="Promo suivante"
            onClick={() => scroll(1)}
            className="w-11 h-11 rounded-full bg-vert text-white hover:bg-vert-dark transition"
          >
            <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth -mx-5 px-5 md:-mx-8 md:px-8 lg:mx-0 lg:px-0"
        style={{ scrollbarWidth: "none" }}
      >
        {Array.isArray(children)
          ? children.map((c, i) => (
              <div
                key={i}
                className="snap-start shrink-0 w-[280px] sm:w-[320px] md:w-[360px]"
              >
                {c}
              </div>
            ))
          : (
            <div className="snap-start shrink-0 w-[280px] sm:w-[320px] md:w-[360px]">
              {children}
            </div>
          )}
      </div>

      <style>{`
        .flex.gap-6::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
