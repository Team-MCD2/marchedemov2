/**
 * imageOptimize — client-side resize + re-encode for admin uploads.
 *
 * Why
 * ---
 * The admin upload endpoint caps files at 8 MB and Supabase Storage
 * bandwidth is finite. Modern phone cameras routinely produce 6–12 MB
 * JPEGs at 4000+ px on the long edge — way more than any product
 * thumbnail or rayon hero needs (the public site never serves wider
 * than ~1280 px). Resizing in-browser before upload :
 *
 *   - Cuts payloads 5–20× → faster uploads on shop-floor 4G
 *   - Sidesteps the 8 MB rejection without owner intervention
 *   - Strips EXIF (privacy / GPS) for free
 *
 * Strategy
 * --------
 * Decode → letterbox-fit a Canvas at `MAX_EDGE` longest edge → encode
 * to WebP at `QUALITY`. Keeps the original `File.name` so the server-
 * side filename slugifier still produces predictable storage keys ;
 * the extension is rewritten to `.webp` only when the body actually
 * was re-encoded.
 *
 * Bypass conditions (returns the original `File` unchanged) :
 *   - SVG : already vector, would lose quality
 *   - GIF : may be animated, canvas would freeze it
 *   - Already small (< MIN_BYTES_TO_OPTIMIZE) AND already small-pixel
 *   - Re-encoding produced a larger blob (rare, e.g. tiny PNG icons)
 *   - Browser doesn't support `canvas.toBlob` or `createImageBitmap`
 *     (very old browsers — fall back gracefully to the raw file)
 */

const MAX_EDGE = 2048;
const QUALITY = 0.85;
const MIN_BYTES_TO_OPTIMIZE = 250 * 1024; /* 250 KB */
const SKIP_MIME = new Set(["image/svg+xml", "image/gif"]);

/**
 * @param {File} file
 * @returns {Promise<{ file: File, optimized: boolean, originalBytes: number, finalBytes: number }>}
 */
export async function optimizeImage(file) {
  const originalBytes = file.size;
  const passthrough = (reason) => ({
    file,
    optimized: false,
    originalBytes,
    finalBytes: originalBytes,
    reason,
  });

  if (!file || !file.type || !file.type.startsWith("image/")) {
    return passthrough("not-an-image");
  }
  if (SKIP_MIME.has(file.type)) {
    return passthrough(`skip-mime:${file.type}`);
  }
  if (typeof window === "undefined" || !window.createImageBitmap) {
    return passthrough("no-bitmap-support");
  }

  let bitmap;
  try {
    bitmap = await window.createImageBitmap(file);
  } catch {
    return passthrough("decode-failed");
  }
  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);

  /* If the image is already small (under both byte and pixel
   * thresholds) we skip the round-trip — re-encoding rarely beats
   * the source for already-optimized assets. */
  if (originalBytes < MIN_BYTES_TO_OPTIMIZE && longEdge <= MAX_EDGE) {
    bitmap.close?.();
    return passthrough("already-small");
  }

  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  /* Prefer OffscreenCanvas when available (no DOM mutation) ; fall
   * back to a regular <canvas> for browsers without it. */
  let canvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(targetW, targetH);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return passthrough("no-2d-ctx");
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  /* WebP gives the best quality/byte ratio across our use-cases.
   * Some browsers fall back silently to PNG if WebP isn't supported ;
   * we detect that by checking the resulting blob's `type`. */
  const blob = await canvasToBlob(canvas, "image/webp", QUALITY);
  if (!blob) return passthrough("canvas-toblob-failed");

  /* Re-encoding inflated the file (common for already-optimized icons
   * where headers + recompression beat a small source). Keep the
   * original. */
  if (blob.size >= originalBytes) {
    return passthrough("inflated");
  }

  const baseName = file.name.replace(/\.[a-z0-9]{1,5}$/i, "");
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
  const optimized = new File([blob], `${baseName}.${ext}`, {
    type: blob.type || "image/webp",
    lastModified: Date.now(),
  });
  return {
    file: optimized,
    optimized: true,
    originalBytes,
    finalBytes: optimized.size,
    width: targetW,
    height: targetH,
  };
}

/**
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {string} mime
 * @param {number} quality
 * @returns {Promise<Blob | null>}
 */
function canvasToBlob(canvas, mime, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: mime, quality }).catch(() => null);
  }
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") return resolve(null);
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}
