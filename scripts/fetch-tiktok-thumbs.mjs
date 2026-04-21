#!/usr/bin/env node
/**
 * Pre-build: fetch TikTok oEmbed metadata (thumbnail + embed HTML) for every
 * video entry in `src/content/videos/*.json` and cache the result locally.
 *
 * Why this exists
 * ----------------
 * We want a *privacy-respecting, performance-friendly* façade for TikTok
 * videos: until the user clicks "Play", we show a local JPEG thumbnail and
 * zero third-party code runs. When they do click, we hydrate with TikTok's
 * official embed (script + blockquote) so playback works out of the box.
 *
 * Fetching oEmbed at build time avoids a runtime round-trip and means the
 * generated site keeps working even if TikTok throttles or blocks the
 * visitor's browser (CORS, ad-blocker…).
 *
 * Outputs
 * -------
 *   public/videos/thumb-<id>.jpg       ← downloaded thumbnail (LCP-safe)
 *   src/generated/tiktok-embeds.json   ← map { [id]: { thumbnail, html, … } }
 *
 * The script is **non-blocking**: if a TikTok URL is a placeholder or the
 * video is private/removed, we log a warning, skip that entry and keep any
 * previously-cached data intact. The overall exit code stays 0 so
 * `prebuild` never breaks the deploy pipeline.
 *
 * Usage
 * -----
 *   node ./scripts/fetch-tiktok-thumbs.mjs
 *   npm run sync:tiktok      # convenience alias (added to package.json)
 *
 * Env overrides
 * -------------
 *   TIKTOK_FETCH_TIMEOUT_MS   default 8000
 *   TIKTOK_SKIP_IF_CACHED=1   only fetch entries missing from the cache
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const VIDEOS_DIR = resolve(process.cwd(), 'src', 'content', 'videos');
const THUMBS_DIR = resolve(process.cwd(), 'public', 'videos');
const GEN_DIR    = resolve(process.cwd(), 'src', 'generated');
const CACHE_FILE = resolve(GEN_DIR, 'tiktok-embeds.json');

const TIMEOUT_MS = Number(process.env.TIKTOK_FETCH_TIMEOUT_MS ?? 8000);
const SKIP_IF_CACHED = process.env.TIKTOK_SKIP_IF_CACHED === '1';
const USER_AGENT =
  'Mozilla/5.0 (compatible; MarcheDeMoBuildBot/1.0; +https://marchedemo.fr)';

/**
 * fetch() with a hard timeout — TikTok sometimes hangs instead of 404'ing.
 */
async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchOEmbed(videoUrl) {
  const api = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  const res = await fetchWithTimeout(api);
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.thumbnail_url) throw new Error('oEmbed payload missing thumbnail_url');
  return json;
}

async function downloadImage(url, destPath) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`thumbnail HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf.byteLength;
}

async function loadJsonIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  await mkdir(THUMBS_DIR, { recursive: true });
  await mkdir(GEN_DIR, { recursive: true });

  let videoFiles = [];
  try {
    videoFiles = (await readdir(VIDEOS_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    console.warn(`[tiktok] videos dir not found at ${VIDEOS_DIR}; nothing to do.`);
    return;
  }

  const cache = await loadJsonIfExists(CACHE_FILE, {});
  const ok = [];
  const skipped = [];
  const failed = [];

  for (const file of videoFiles) {
    const raw = await readFile(join(VIDEOS_DIR, file), 'utf8');
    const entry = JSON.parse(raw);
    const { id, url_tiktok } = entry;
    if (!id || !url_tiktok) {
      failed.push(`${file} (missing id or url_tiktok)`);
      continue;
    }

    if (SKIP_IF_CACHED && cache[id]?.html) {
      skipped.push(id);
      continue;
    }

    try {
      const oe = await fetchOEmbed(url_tiktok);
      const thumbRel = `/videos/thumb-${id}.jpg`;
      const size = await downloadImage(oe.thumbnail_url, join(THUMBS_DIR, `thumb-${id}.jpg`));
      cache[id] = {
        thumbnail: thumbRel,
        html: oe.html,
        title: oe.title ?? entry.titre ?? null,
        author_name: oe.author_name ?? null,
        author_url: oe.author_url ?? null,
        provider_name: oe.provider_name ?? 'TikTok',
        fetched_at: new Date().toISOString(),
      };
      ok.push(`${id} (${(size / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed.push(`${id} (${e.message})`);
    }
  }

  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');

  if (ok.length)      console.log(`[tiktok] ✓ cached ${ok.length}: ${ok.join(', ')}`);
  if (skipped.length) console.log(`[tiktok] — skipped (already cached) ${skipped.length}: ${skipped.join(', ')}`);
  if (failed.length)  console.warn(`[tiktok] ! failed ${failed.length}: ${failed.join(', ')}`);
  if (!ok.length && !skipped.length && !failed.length) {
    console.log('[tiktok] no video entries found.');
  }
}

main().catch((err) => {
  // Never fail the build on transient network issues — the component has a
  // graceful runtime fallback.
  console.warn('[tiktok] unexpected error (non-fatal):', err?.message ?? err);
});
