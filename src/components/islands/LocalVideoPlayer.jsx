import { useEffect, useRef, useState } from "react";

export default function LocalVideoPlayer({ src, title, href }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onVolume = () => setMuted(Boolean(v.muted));
    v.addEventListener("volumechange", onVolume);
    return () => v.removeEventListener("volumechange", onVolume);
  }, []);

  const toggleMute = async () => {
    const v = videoRef.current;
    if (!v) return;

    const nextMuted = !v.muted;
    v.muted = nextMuted;
    if (!nextMuted && v.volume === 0) v.volume = 1;

    try {
      await v.play();
    } catch {
      /* ignore */
    }

    setMuted(nextMuted);
  };

  if (!src || failed) {
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block relative aspect-[9/16] rounded-3xl overflow-hidden bg-noir ring-1 ring-white/10"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 p-6 text-center gap-3">
          <p className="font-soft font-bold text-lg">{title}</p>
          <p className="text-white/60 text-xs">Voir la vidéo ↗</p>
        </div>
      </a>
    ) : null;
  }

  return (
    <div className="relative aspect-[9/16] rounded-3xl overflow-hidden bg-noir ring-1 ring-white/10">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        src={src}
        playsInline
        muted
        autoPlay
        loop
        preload="metadata"
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-3.5 right-3.5 z-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-[12px] font-pro font-bold tracking-wide hover:bg-black/70 transition-colors"
        aria-label={muted ? `Activer le son : ${title}` : `Couper le son : ${title}`}
      >
        {muted ? "Son" : "Muet"}
        <span aria-hidden="true" className="text-[12px]">
          {muted ? "Off" : "On"}
        </span>
      </button>

      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white pointer-events-none">
        <p className="font-soft font-bold text-[15px] leading-tight line-clamp-2">{title}</p>
      </div>
    </div>
  );
}
