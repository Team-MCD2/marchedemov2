/**
 * Capture a real mobile screenshot of the home page for the hero phone-mockup.
 *
 * Output: public/images/home/mobile-home-screen.jpg
 *
 * Usage :
 *   1. Start the dev server : `npm run dev`            (default port 4321)
 *   2. Run this script       : `node scripts/capture-mobile-home.mjs`
 *
 * The screenshot is taken at exactly the mockup's render dimensions
 * (360 × 780) so it can be dropped into the home page <img> as-is,
 * with no resampling.
 */

import { chromium } from "playwright";
import { mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET_URL = process.env.CAPTURE_URL ?? "http://localhost:4321/";
const OUT_PATH = join(ROOT, "public/images/home/mobile-home-screen.jpg");

/* Mockup dimensions (matches index.astro <img width="360" height="780">). */
const VIEWPORT = { width: 360, height: 780 };

async function main() {
  /* Sanity-check the dev server is up. */
  try {
    const r = await fetch(TARGET_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`[capture] dev server not reachable at ${TARGET_URL} — ${e.message}`);
    console.error(`[capture] start it first with: npm run dev`);
    process.exit(1);
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, /* retina sharpness */
    /* Modern iOS UA — we want the site to think it's a real phone. */
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    /* Disable animations so reveal() doesn't catch elements mid-fade. */
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  console.log(`[capture] loading ${TARGET_URL} …`);
  await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 30_000 });

  /* Give the hero one beat to settle (split-text reveal animations etc.). */
  await page.waitForTimeout(800);

  /* Force every reveal-* element to be visible — otherwise initial scroll
     position would catch them mid-fade. */
  await page.addStyleTag({
    content: `
      .reveal, .reveal-scale, [data-reveal-stagger] > *,
      [data-split-reveal] { opacity: 1 !important; transform: none !important; }
    `,
  });
  await page.waitForTimeout(200);

  /* Crop to viewport (no full-page scroll) — we only want the hero. */
  await page.screenshot({
    path: OUT_PATH,
    type: "jpeg",
    quality: 85,
    fullPage: false,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
  });

  await browser.close();

  await access(OUT_PATH);
  console.log(`[capture] OK → ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("[capture] FAILED", e);
  process.exit(1);
});
