import { useEffect, useRef, useState } from "react";

/**
 * TikTokEmbed — React island, lazy-loaded.
 * 1. Displays a styled thumbnail placeholder (so LCP isn't hurt).
 * 2. On click, fetches official TikTok oEmbed HTML + injects their script.
 * 3. If the embed fails (blocked, offline), we gracefully degrade to a
 *    native link that opens TikTok in a new tab.
 *
 * Props:
 *   url       : full TikTok video URL
 *   title     : descriptive title shown on the placeholder
 *   thumbnail : optional path to a local JPEG preview
 */
export default function TikTokEmbed({ url, title, thumbnail }) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [html, setHtml] = useState("");
  const containerRef = useRef(null);

  const handlePlay = async () => {
    if (loading || loaded) return;
    setLoading(true);
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
          <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.62a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.05z" />
          </svg>
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
          aria-label={`Lire la vidéo : ${title}`}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#0F0F0F] via-[#1C1C1C] to-[#0F0F0F]" />
          )}
          <span
            className="relative z-10 w-20 h-20 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300"
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
          <span className="relative z-10 mt-4 font-soft font-bold text-white text-[16px] px-6 text-center">
            {title}
          </span>
          <span className="relative z-10 mt-1.5 text-white/60 text-xs">
            @marchedemo · TikTok
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
