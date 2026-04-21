#!/usr/bin/env node
/**
 * scrape-wixstatic.mjs — one-shot harvester for marchedemo.com
 *
 * Follows the 4-step methodology from plan.md Section VI:
 *   1. Fetch each page, read <title> (and og:title) → verify content mapping
 *   2. Extract every static.wixstatic.com URL + its alt text + surrounding context
 *   3. Resolve HD URL (strip existing transform params, add our own)
 *   4. Download to /public/images/[slug]/[descriptive-name].{ext}
 *
 * Outputs:
 *   - .tmp/wix-cache/<slug>.html     raw HTML (for offline re-parsing)
 *   - .tmp/wix-scrape-manifest.json  audit trail: every URL, alt, filename, status
 *   - public/images/rayons/<slug>/*  downloaded high-res images
 *
 * Safe to re-run (idempotent): existing files are skipped.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const CACHE_DIR = path.join(ROOT, '.tmp', 'wix-cache');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'rayons');
const ICON_PAY_DIR = path.join(ROOT, 'public', 'icons', 'paiement');
const ICON_SOCIAL_DIR = path.join(ROOT, 'public', 'icons', 'social');
const ICON_BRAND_DIR = path.join(ROOT, 'public', 'icons', 'brand');
const MANIFEST = path.join(ROOT, '.tmp', 'wix-scrape-manifest.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/* -------- helpers -------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(level, ...args) {
  const tag = { info: '·', ok: '✓', warn: '!', err: '✗' }[level] ?? '·';
  console.log(`[wix] ${tag}`, ...args);
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/* -------- Step 1: fetch HTML with cache -------- */

async function fetchPage(url, cachePath) {
  if (await fileExists(cachePath)) {
    log('info', `cache hit: ${path.basename(cachePath)}`);
    return readFile(cachePath, 'utf8');
  }
  log('info', `fetching ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml;q=0.9',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const html = await res.text();
  await writeFile(cachePath, html, 'utf8');
  await sleep(600); // polite throttle
  return html;
}

/* -------- Step 2: parse title, og:title, and all wixstatic images -------- */

function extractTitle(html) {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  )?.[1]?.trim();
  return { title, ogTitle: og };
}

/**
 * Extracts every <img> tag targeting static.wixstatic.com plus Wix's
 * <wix-image> custom elements + CSS background-image references.
 * Returns: Array<{ rawUrl, alt, contextText, role }>
 */
function extractImages(html) {
  const results = [];
  const seenUrls = new Set();

  /* Pattern A — classic <img> tag */
  const imgPattern = /<img\b[^>]*>/gi;
  for (const match of html.matchAll(imgPattern)) {
    const tag = match[0];
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    if (!src || !src.includes('static.wixstatic.com/media/')) continue;
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? '';
    const role = 'img';
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    results.push({ rawUrl: src, alt, role });
  }

  /* Pattern B — Wix <wix-image> custom tag: uri attribute */
  const wxPattern = /<wix-image\b[^>]*>/gi;
  for (const match of html.matchAll(wxPattern)) {
    const tag = match[0];
    const uri = tag.match(/\buri=["']([^"']+)["']/i)?.[1];
    if (!uri) continue;
    const src = `https://static.wixstatic.com/media/${uri}`;
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? '';
    results.push({ rawUrl: src, alt, role: 'wix-image' });
  }

  /* Pattern C — background-image:url(https://static.wixstatic.com/...) */
  const bgPattern =
    /background-image:\s*url\((['"]?)(https?:\/\/static\.wixstatic\.com\/media\/[^)'"]+)\1\)/gi;
  for (const match of html.matchAll(bgPattern)) {
    const src = match[2];
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    results.push({ rawUrl: src, alt: '', role: 'background' });
  }

  /* Pattern D — any stray "https://static.wixstatic.com/media/..." inside JSON blobs */
  const jsonPattern =
    /"(https?:\\?\/\\?\/static\.wixstatic\.com\\?\/media\\?\/[^"\\]+)"/gi;
  for (const match of html.matchAll(jsonPattern)) {
    const src = match[1].replace(/\\\//g, '/');
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    results.push({ rawUrl: src, alt: '', role: 'json' });
  }

  return results;
}

/* -------- Step 3: resolve high-resolution URL & derive filename -------- */

/**
 * Wix URL shapes encountered on marchedemo.com (all unified under one regex):
 *   (A) classic ~mv2:            716c51_<hex>~mv2.<ext>
 *   (B) URL-encoded tilde:       716c51_<hex>%7Emv2.<ext>
 *   (C) bare 32-char hash:       fe42c46e27b745ad8d007f01c5e495b1.<ext>
 *   (D) nsplsh + dimensions:     nsplsh_<hex>~mv2_d_<W>_<H>_s_<n>_<n>.<ext>
 *   (E) 11062b f000 suffix:      11062b_<hex>f000.<ext>
 *
 * The segment between /media/ and the extension is the canonical asset name;
 * it uniquely identifies the uploaded image. Everything after the extension
 * (a /v1/<transform>/... suffix) is a CDN-side transform we always replace
 * with our own /v1/fill/...q_90/ for HD delivery.
 */
const WIX_URL_RE =
  /^(https:\/\/static\.wixstatic\.com\/media\/([a-z0-9_~%]+))\.(jpg|jpeg|png|webp|gif)(?=[\/?]|$)/i;

function resolveHd(rawUrl, { width = 1600, height = 1200, q = 90 } = {}) {
  const m = rawUrl.match(WIX_URL_RE);
  if (!m) return { baseUrl: null, hdUrl: null, ext: null, hash: null, shape: null };
  const assetName = m[2].replace(/%7E/gi, '~');
  const ext = m[3].toLowerCase();
  const baseUrl = `https://static.wixstatic.com/media/${assetName}.${ext}`;
  const hash = assetName;
  const hdUrl = `${baseUrl}/v1/fill/w_${width},h_${height},al_c,q_${q},enc_auto/image.${ext}`;
  const shape = /~mv2_d_/.test(assetName)
    ? 'D'
    : /~mv2/.test(assetName)
    ? 'A'
    : /f000$/i.test(assetName)
    ? 'E'
    : 'C';
  return { baseUrl, hdUrl, ext, hash, shape };
}

/* -------- Step 4: download & save with descriptive filename -------- */

function slugify(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Decide a human-readable filename.
 * Priority: alt text → trailing /filename.ext in original URL → hash.
 */
function deriveFilename(image, hash, ext) {
  const fromAlt = slugify(image.alt);
  const urlName = image.rawUrl.match(/\/([a-z0-9_\-.]+)\.(?:jpg|jpeg|png|webp|gif)(?:\?|$)/i)?.[1];
  const fromUrl = urlName ? slugify(urlName.replace(/\.(?:jpg|jpeg|png|webp|gif)$/i, '')) : '';
  const stem = fromAlt || fromUrl || slugify(hash).slice(0, 12);
  return `${stem}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

/**
 * Classify an image by alt / url hints so global chrome (payment icons,
 * social logos, brand marks) is routed to /public/icons/ instead of
 * duplicated into every rayon folder.
 *
 * Returns { category, destDir, filename } where:
 *   - category: 'paiement' | 'social' | 'brand' | 'rayon'
 *   - destDir:  absolute path of the destination directory
 *   - filename: stable filename decoupled from per-page context
 */
function classifyImage(image, hash, ext, rayonSlug) {
  const alt = (image.alt || '').toLowerCase();
  const url = image.rawUrl.toLowerCase();
  const hay = `${alt} ${url}`;

  /* Payment providers */
  const payMatchers = [
    { re: /\bvisa\b/, name: 'visa' },
    { re: /master.?card/, name: 'mastercard' },
    { re: /american.?express|\bamex\b/, name: 'american-express' },
    { re: /\bmaestro\b/, name: 'maestro' },
    { re: /apple.?pay/, name: 'apple-pay' },
    { re: /google.?pa/, name: 'google-pay' },
    { re: /paypal/, name: 'paypal' },
    { re: /ticket.?restaurant|edenred/, name: 'ticket-restaurant' },
  ];
  for (const { re, name } of payMatchers) {
    if (re.test(hay)) {
      return { category: 'paiement', destDir: ICON_PAY_DIR, filename: `${name}.${ext === 'jpeg' ? 'jpg' : ext}` };
    }
  }

  /* Social networks */
  const socialMatchers = [
    { re: /facebook/, name: 'facebook' },
    { re: /instagram/, name: 'instagram' },
    { re: /linkedin/, name: 'linkedin' },
    { re: /tiktok/, name: 'tiktok' },
    { re: /twitter|\bx\.com\b/, name: 'twitter' },
    { re: /youtube/, name: 'youtube' },
  ];
  for (const { re, name } of socialMatchers) {
    if (re.test(hay)) {
      return { category: 'social', destDir: ICON_SOCIAL_DIR, filename: `${name}.${ext === 'jpeg' ? 'jpg' : ext}` };
    }
  }

  /* Brand marks (Marché de Mo' logo in various forms) */
  const brandMatchers = [
    { re: /marche.?de.?mo|marchedemo|logo.?mo\b|logo.?marche/, name: 'marche-de-mo' },
  ];
  for (const { re, name } of brandMatchers) {
    if (re.test(hay)) {
      return { category: 'brand', destDir: ICON_BRAND_DIR, filename: `${name}-${hash.slice(0, 8)}.${ext === 'jpeg' ? 'jpg' : ext}` };
    }
  }

  /* Default: authentic rayon image */
  const rayonDir = path.join(IMG_DIR, rayonSlug);
  return { category: 'rayon', destDir: rayonDir, filename: deriveFilename(image, hash, ext) };
}

async function downloadImage(hdUrl, destPath) {
  if (await fileExists(destPath)) return { skipped: true, bytes: 0 };
  const res = await fetch(hdUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = new Uint8Array(await res.arrayBuffer());
  await writeFile(destPath, arr);
  await sleep(200);
  return { skipped: false, bytes: arr.length };
}

/* -------- Main -------- */

async function main() {
  await ensureDir(CACHE_DIR);
  await ensureDir(IMG_DIR);
  await ensureDir(ICON_PAY_DIR);
  await ensureDir(ICON_SOCIAL_DIR);
  await ensureDir(ICON_BRAND_DIR);

  const pages = JSON.parse(
    await readFile(path.join(ROOT, 'scripts', 'wix-pages.json'), 'utf8')
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    pages: [],
  };

  /* Global dedup: each Wix asset hash is downloaded at most once across
     the entire run, regardless of how many pages reference it. */
  const globalSeenHashes = new Set();
  const globalByCategory = { paiement: 0, social: 0, brand: 0, rayon: 0 };

  for (const page of pages) {
    log('info', `── ${page.slug}  (${page.label})`);
    const cachePath = path.join(CACHE_DIR, `${page.slug}.html`);
    let html;
    try {
      html = await fetchPage(page.url, cachePath);
    } catch (e) {
      log('err', `fetch failed for ${page.url}: ${e.message}`);
      manifest.pages.push({ ...page, error: e.message });
      continue;
    }

    /* Step 1 — verify title */
    const { title, ogTitle } = extractTitle(html);
    const titleNorm = `${title} ${ogTitle}`.toLowerCase();
    const titleMatches = page.expectedInTitle.every((needle) =>
      titleNorm.includes(needle.toLowerCase())
    );
    if (!titleMatches) {
      log('warn', `title mismatch on ${page.slug}: title="${title}" og="${ogTitle}"`);
    } else {
      log('ok', `title match: "${title}"`);
    }

    /* Step 2 — extract images */
    const images = extractImages(html);
    log('info', `  ${images.length} candidate wixstatic image(s)`);

    /* Step 3 & 4 — resolve, classify, dedup, download */
    const downloaded = [];
    const skippedDup = [];
    const skippedUnparseable = [];

    for (const img of images) {
      const { baseUrl, hdUrl, ext, hash, shape } = resolveHd(img.rawUrl);
      if (!hash) {
        skippedUnparseable.push(img.rawUrl);
        continue;
      }
      if (globalSeenHashes.has(hash)) {
        skippedDup.push({ hash, alt: img.alt });
        continue;
      }
      globalSeenHashes.add(hash);

      const { category, destDir, filename } = classifyImage(img, hash, ext, page.slug);
      await ensureDir(destDir);
      const destPath = path.join(destDir, filename);

      try {
        const { skipped, bytes } = await downloadImage(hdUrl, destPath);
        if (skipped) {
          log('info', `  = [${category}] ${filename} (exists)`);
        } else {
          log('ok', `  \u2193 [${category}] ${filename} (${(bytes / 1024).toFixed(0)} KB)`);
        }
        globalByCategory[category] = (globalByCategory[category] ?? 0) + 1;
        const relPath = '/' + path.relative(path.join(ROOT, 'public'), destPath).replace(/\\/g, '/');
        downloaded.push({
          hash,
          alt: img.alt,
          role: img.role,
          category,
          shape,
          rawUrl: img.rawUrl,
          baseUrl,
          hdUrl,
          localPath: relPath,
          bytes,
        });
      } catch (e) {
        log('err', `  \u2717 ${filename}: ${e.message}`);
        downloaded.push({ hash, alt: img.alt, rawUrl: img.rawUrl, error: e.message });
      }
    }

    if (skippedUnparseable.length) {
      log('warn', `  ${skippedUnparseable.length} unparseable URL(s) skipped`);
    }
    if (skippedDup.length) {
      log('info', `  ${skippedDup.length} duplicate hash(es) skipped (already downloaded on prior page)`);
    }

    manifest.pages.push({
      ...page,
      title,
      ogTitle,
      titleMatches,
      imageCount: images.length,
      downloaded,
      skippedDup,
      skippedUnparseable,
    });
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  log('ok', `done. manifest → ${path.relative(ROOT, MANIFEST)}`);

  /* Summary */
  const totalDl = manifest.pages.reduce(
    (s, p) => s + (p.downloaded?.filter((d) => !d.error).length ?? 0),
    0
  );
  const totalErr = manifest.pages.reduce(
    (s, p) => s + (p.downloaded?.filter((d) => d.error).length ?? 0),
    0
  );
  log('info', `summary: ${totalDl} downloaded, ${totalErr} errors`);
  log('info', `  by category: paiement=${globalByCategory.paiement}, social=${globalByCategory.social}, brand=${globalByCategory.brand}, rayon=${globalByCategory.rayon}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
