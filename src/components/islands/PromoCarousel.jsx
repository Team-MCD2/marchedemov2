/**
 * PromoCarousel — défilement automatique horizontal droite → gauche, en boucle.
 *
 * Comportement :
 *   - Cards rendues 2× pour un loop seamless (translateX 0 → -50%).
 *   - Pause au survol (souris) ET au focus clavier (accessibilité).
 *   - Vitesse calculée selon le nombre de cards (~50 px/s = lecture confortable).
 *   - prefers-reduced-motion : animation désactivée, scroll horizontal manuel
 *     redevient possible (overflow-x-auto + scroll-snap).
 *
 * Pure CSS animation, aucun JS d'état (les boutons prev/next ont été retirés
 * car redondants avec l'auto-scroll). React n'est gardé que pour
 * l'hydratation des children côté Astro.
 */
export default function PromoCarousel({ children }) {
  const items = Array.isArray(children) ? children : [children];
  /* Duplique la liste pour un défilement seamless. */
  const doubled = [...items, ...items];

  /* Vitesse : ~5 s par card (60 s pour 12 cards doublés = 6 originaux). */
  const seconds = Math.max(20, items.length * 5);

  return (
    <div className="promo-marquee-wrap relative -mx-5 md:-mx-8 lg:mx-0 group">
      <div
        className="promo-marquee flex gap-6 px-5 md:px-8 lg:px-0 will-change-transform"
        style={{ "--promo-marquee-duration": `${seconds}s` }}
      >
        {doubled.map((c, i) => (
          <div
            key={i}
            className="shrink-0 w-[280px] sm:w-[320px] md:w-[360px]"
            aria-hidden={i >= items.length ? "true" : undefined}
          >
            {c}
          </div>
        ))}
      </div>

      {/* Hint discret pour utilisateur — pause au hover */}
      <div className="hidden md:flex items-center justify-end gap-2 mt-4 text-[12px] text-neutral-400 font-pro">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-vert animate-pulse" />
          Défilement auto · pause au survol
        </span>
      </div>

      <style>{`
        .promo-marquee-wrap { overflow: hidden; }
        .promo-marquee {
          animation: promo-marquee-scroll var(--promo-marquee-duration, 60s) linear infinite;
        }
        .promo-marquee-wrap:hover .promo-marquee,
        .promo-marquee-wrap:focus-within .promo-marquee {
          animation-play-state: paused;
        }
        @keyframes promo-marquee-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .promo-marquee-wrap { overflow-x: auto; scroll-snap-type: x mandatory; }
          .promo-marquee { animation: none; }
          .promo-marquee > div { scroll-snap-align: start; }
        }
      `}</style>
    </div>
  );
}
