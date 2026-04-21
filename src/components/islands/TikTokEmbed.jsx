import { useEffect, useRef, useState } from "react";

/**
 * TikTokEmbed — React island, lazy-loaded.
 *
 * Façade strategy (privacy- & performance-friendly):
 *   1. Render a local JPEG thumbnail (pre-fetched at build time) behind a
 *      generous Play button. Until the user clicks, ZERO third-party code
 *      runs and no cookie is set.
 *   2. On click, we either:
 *      (a) inject the oEmbed HTML we already cached at build time, or
 *      (b) fall back to a runtime oEmbed fetch against www.tiktok.com.
 *      Both paths then load TikTok's official embed.js script which
 *      activates the rich player.
 *   3. If everything fails (video removed, offline, blocked), we degrade
 *      gracefully to a plain link that opens TikTok in a new tab.
 *
 * Props:
 *   url        — full TikTok video URL (required)
 *   title      — human-readable caption shown on the placeholder
 *   thumbnail  — optional path to a locally-hosted JPEG preview
 *                (typically pulled from src/generated/tiktok-embeds.json)
 *   embedHtml  — optional pre-fetched oEmbed HTML <blockquote>
 *                (same origin as `thumbnail`). When provided we skip the
 *                runtime oEmbed network round-trip.
 *   author     — optional TikTok handle ("@marchedemo") shown below the title
 */
export default function TikTokEmbed({ url, title, thumbnail, embedHtml, author = "@marchedemo" }) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [html, setHtml] = useState("");
  const containerRef = useRef(null);

  const handlePlay = async () => {
    if (loading || loaded) return;
    setLoading(true);

    /* Fast path: build-time cached embed HTML, no network needed. */
    if (embedHtml) {
      setHtml(embedHtml);
      setLoaded(true);
      setLoading(false);
      return;
    }

    /* Slow path: runtime oEmbed fetch. */
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      );
      if (!res.ok) throw new Error("oEmbed failed");
      const data = await res.json();
      setHtml(data.html);
      setLoaded(true);
    } catch (e) {
      console.warn("TikTokEmbed failed to load:", e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /* Inject the embed.js script TikTok needs to activate the embed. */
  useEffect(() => {
    if (!loaded) return;
    const existing = document.querySelector(
      'script[src="https://www.tiktok.com/embed.js"]'
    );
    if (existing) {
      // Re-parse widgets
      if (window.tiktokEmbedLoad) window.tiktokEmbedLoad();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://www.tiktok.com/embed.js";
    s.async = true;
    document.body.appendChild(s);
  }, [loaded]);

  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block relative aspect-[9/16] rounded-3xl overflow-hidden bg-noir ring-1 ring-white/10"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 p-6 text-center gap-3">
          <TikTokGlyph className="w-12 h-12" />
          <p className="font-soft font-bold text-lg">{title}</p>
          <p className="text-white/60 text-xs">Voir sur TikTok ↗</p>
        </div>
      </a>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-[9/16] rounded-3xl overflow-hidden bg-noir ring-1 ring-white/10"
    >
      {!loaded && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex flex-col items-center justify-center group"
          aria-label={`Lire la vidéo TikTok : ${title}`}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity duration-300"
              loading="lazy"
              decoding="async"
              width="540"
              height="960"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0F0F0F] via-[#1C1C1C] to-[#0F0F0F]" />
          )}

          {/* Dark gradient for legibility under text */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none" />

          {/* TikTok platform badge */}
          <span className="absolute top-3.5 right-3.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-sm text-white text-[11px] font-pro font-bold tracking-wide">
            <TikTokGlyph className="w-3 h-3" />
            TikTok
          </span>

          {/* Play button */}
          <span
            className="relative z-10 w-20 h-20 rounded-full bg-white/95 flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.35)] group-hover:scale-110 group-hover:bg-white transition-all duration-300"
            aria-hidden="true"
          >
            {loading ? (
              <svg className="w-8 h-8 text-vert animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-vert ml-1.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </span>

          <span className="relative z-10 mt-4 font-soft font-bold text-white text-[16px] px-6 text-center text-balance leading-tight">
            {title}
          </span>
          <span className="relative z-10 mt-1.5 text-white/70 text-xs">
            {author} · TikTok
          </span>
        </button>
      )}

      {loaded && (
        <div
          className="absolute inset-0 [&>blockquote]:!m-0 [&>blockquote]:!max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

/* TikTok glyph — kept inline so the component has no extra dependency. */
function TikTokGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05z" />
    </svg>
  );
}
