/**
 * EmptyState (React) — JSX twin of `@components/admin/EmptyState.astro`.
 *
 * Used inside React islands (ProduitsManager, PromosManager, MediasManager,
 * CatalogueImagesView…) where Astro components can't be rendered directly.
 * Same visual contract : optional illustration, title, description, primary
 * + secondary CTA buttons.
 *
 * The default illustration is a brand-aligned inline SVG (vert accent on
 * white) so call-sites get something nice "for free". Pass `illustration`
 * to override or `icon` for a single emoji-style mark.
 *
 * Props
 * -----
 *   title          : string (required)
 *   description?   : string
 *   icon?          : string — single emoji or short markup (used INSTEAD of illustration)
 *   illustration?  : ReactNode — custom SVG / image (used INSTEAD of default)
 *   primaryLabel?  : string
 *   primaryHref?   : string
 *   primaryOnClick?: () => void
 *   secondaryLabel?: string
 *   secondaryHref? : string
 *   secondaryOnClick?: () => void
 *   tone?          : "neutral" | "vert" | "rouge"
 */
export default function EmptyState({
  title,
  description,
  icon,
  illustration,
  primaryLabel,
  primaryHref,
  primaryOnClick,
  secondaryLabel,
  secondaryHref,
  secondaryOnClick,
  tone = "neutral",
}) {
  const titleColor =
    tone === "vert" ? "text-vert-dark" : tone === "rouge" ? "text-rouge" : "text-neutral-700";

  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto" aria-hidden="true">
        {icon ? (
          <p className="text-[36px] mb-2">{icon}</p>
        ) : illustration ? (
          illustration
        ) : (
          <DefaultIllustration tone={tone} />
        )}
      </div>
      <p className={`font-soft font-bold text-[16px] ${titleColor}`}>{title}</p>
      {description && (
        <p className="mt-1.5 text-[13px] text-neutral-500 max-w-sm mx-auto">{description}</p>
      )}
      {(primaryLabel || secondaryLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryLabel &&
            (primaryHref ? (
              <a
                href={primaryHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
              >
                {primaryLabel}
              </a>
            ) : (
              <button
                type="button"
                onClick={primaryOnClick}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-vert text-white text-[13px] font-bold hover:bg-vert-dark transition"
              >
                {primaryLabel}
              </button>
            ))}
          {secondaryLabel &&
            (secondaryHref ? (
              <a
                href={secondaryHref}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black/10 hover:border-noir text-[13px] font-bold transition"
              >
                {secondaryLabel}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryOnClick}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black/10 hover:border-noir text-[13px] font-bold transition"
              >
                {secondaryLabel}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Friendly default illustration — a stylised market basket with a few
 * fruit shapes. Tone-aware fill so vert/rouge/neutral feel coherent.
 * Inline SVG keeps zero asset weight.
 */
function DefaultIllustration({ tone }) {
  const accent =
    tone === "rouge" ? "#A8261B" : tone === "vert" ? "#1C6B35" : "#1C6B35";
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      fill="none"
      className="mx-auto mb-3 opacity-90"
    >
      {/* Basket body */}
      <path
        d="M14 38 L82 38 L74 76 Q73 82 67 82 L29 82 Q23 82 22 76 Z"
        fill="white"
        stroke={accent}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* Basket handle */}
      <path
        d="M28 38 Q28 18 48 18 Q68 18 68 38"
        fill="none"
        stroke={accent}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Vertical staves on the basket */}
      <path
        d="M30 42 L27 78 M40 42 L39 78 M48 42 L48 78 M56 42 L57 78 M66 42 L69 78"
        stroke={accent}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Goods peeking above */}
      <circle cx="40" cy="32" r="6.5" fill={accent} fillOpacity="0.85" />
      <circle cx="56" cy="30" r="5" fill={accent} fillOpacity="0.55" />
      <path
        d="M40 25.5 Q40 22 43 22"
        stroke="#A8261B"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
