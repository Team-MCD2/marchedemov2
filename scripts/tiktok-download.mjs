#!/usr/bin/env node
/**
 * scripts/tiktok-download.mjs
 *
 * Pipeline : enumerate every video posted by @marchedemo, sort by
 * view_count, take the TOP_N most-viewed, download each as MP4 to
 * `public/videos/tt-<id>.mp4`, and write a summary JSON the Astro
 * content collection can pick up.
 *
 * Idempotent : re-runs skip already-downloaded files.
 *
 * Usage  :
 *   node scripts/tiktok-download.mjs            # default TOP_N=3
 *   node scripts/tiktok-download.mjs --top 5    # top 5 instead
 *
 * Depends on `yt-dlp` (+ `curl-cffi` for TikTok impersonation) —
 * invoked via `python -m yt_dlp` since we don't ship a binary.
 *
 * Licensing : the videos are owned by the client (@marchedemo).
 * We host them locally so the site works offline / in regions where
 * TikTok's embed iframe is blocked, and so there's no third-party
 * cookie chain on first paint.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const TMP_DIR = path.join(ROOT, ".tmp");
const OUT_DIR = path.join(ROOT, "public", "videos");
const SUMMARY_FILE = path.join(ROOT, "src", "generated", "tiktok-local.json");

const PROFILE_URL = "https://www.tiktok.com/@marchedemo";

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
const topIdx = args.findIndex((a) => a === "--top");
const TOP_N = topIdx >= 0 ? Math.max(1, parseInt(args[topIdx + 1] ?? "3", 10)) : 3;
const FORCE = args.includes("--force");

/* ---------- helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(level, ...m) {
  const tag = { info: "·", ok: "✓", warn: "!", err: "✗" }[level] ?? "·";
  console.log(`[tt] ${tag}`, ...m);
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

/** Run a shell command, return stdout as string (throws on non-zero). */
function runCapture(cmd, cliArgs, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cliArgs, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

/** Stream-print a command. Useful for long-running yt-dlp downloads. */
function runTTY(cmd, cliArgs, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cliArgs, { cwd, shell: false, stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

/* ---------- step 1 : enumerate + rank ---------- */
async function listProfile() {
  log("info", `enumerating ${PROFILE_URL}…`);
  const stdout = await runCapture("python", [
    "-m",
    "yt_dlp",
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    PROFILE_URL,
  ]);
  const entries = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.id && e.url);

  log("ok", `got ${entries.length} entries`);
  return entries;
}

function pickTop(entries, n) {
  return entries
    .filter((e) => typeof e.view_count === "number")
    .sort((a, b) => b.view_count - a.view_count)
    .slice(0, n);
}

/* ---------- step 2 : download each mp4 + capture metadata ---------- */
async function downloadOne(entry) {
  const id = entry.id;
  const out = path.join(OUT_DIR, `tt-${id}.mp4`);
  const meta = path.join(OUT_DIR, `tt-${id}.info.json`);
  if (!FORCE && (await fileExists(out))) {
    log("info", `skip  ${id} — already on disk`);
    return { ok: true, file: out, metaFile: meta };
  }

  log("info", `dl    ${id}  (${entry.view_count?.toLocaleString()} vues)`);
  /* --no-part keeps the final file atomic; --write-info-json gives us
     title, description, duration, thumbnail URL, etc. for later. */
  await runTTY("python", [
    "-m",
    "yt_dlp",
    "--quiet",
    "--no-warnings",
    "--no-progress",
    "--format",
    /* mp4 ≤ 1080p, h264 pour compat large. TikTok exporte souvent du h264. */
    "mp4",
    "--write-info-json",
    "--output",
    path.join(OUT_DIR, "tt-%(id)s.%(ext)s"),
    entry.url,
  ]);

  return { ok: true, file: out, metaFile: meta };
}

/* ---------- step 3 : build summary ---------- */
async function buildSummary(entries, results) {
  const items = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const r = results[i];
    if (!r?.ok) continue;
    let info = {};
    try {
      info = JSON.parse(await readFile(r.metaFile, "utf8"));
    } catch {
      /* metadata optional */
    }
    items.push({
      id: e.id,
      url: e.url,
      view_count: e.view_count ?? null,
      title: (info.title ?? e.title ?? "").slice(0, 240),
      description: (info.description ?? "").slice(0, 400),
      duration: info.duration ?? null,
      width: info.width ?? null,
      height: info.height ?? null,
      src_local: `/videos/tt-${e.id}.mp4`,
      rank: i + 1,
      fetched_at: new Date().toISOString(),
    });
  }
  const summary = { source: PROFILE_URL, top_n: TOP_N, items };
  await ensureDir(path.dirname(SUMMARY_FILE));
  await writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8");
  log("ok", `wrote ${path.relative(ROOT, SUMMARY_FILE)}`);
  return summary;
}

/* ---------- main ---------- */
async function main() {
  await ensureDir(TMP_DIR);
  await ensureDir(OUT_DIR);

  const all = await listProfile();
  const top = pickTop(all, TOP_N);
  log("ok", `top ${TOP_N} by views :`);
  top.forEach((e, i) => {
    log(
      "info",
      `  ${i + 1}.  ${e.view_count?.toLocaleString().padStart(8)} vues · id=${e.id}`,
    );
  });

  const results = [];
  for (const e of top) {
    try {
      const r = await downloadOne(e);
      results.push(r);
      await sleep(800); /* be gentle with TikTok's CDN */
    } catch (err) {
      log("err", `failed to download ${e.id}: ${err.message}`);
      results.push({ ok: false });
    }
  }

  const summary = await buildSummary(top, results);
  log("ok", `done · ${summary.items.length}/${TOP_N} videos ready locally`);
}

main().catch((err) => {
  log("err", err.stack ?? err.message);
  process.exit(1);
});
