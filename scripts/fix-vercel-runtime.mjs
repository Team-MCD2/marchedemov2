#!/usr/bin/env node
/**
 * Post-build: force every Vercel serverless function's Node.js runtime.
 *
 * Why this exists
 * ----------------
 * `@astrojs/vercel@7.x` has a hardcoded list of supported Node versions
 * (only 18 and 20). Any other local/build-time Node version silently falls
 * back to emitting `"runtime": "nodejs18.x"` in the generated
 * `.vercel/output/functions/<name>.func/.vc-config.json`. Vercel no longer
 * accepts `nodejs18.x`, so deployments fail.
 *
 * This script runs after `astro build` finishes (via the `postbuild` npm
 * script) and rewrites every function's `runtime` field to the target
 * value, regardless of what the adapter chose. It must run as a separate
 * step because the Vercel adapter writes its output AFTER Astro's
 * `astro:build:done` integration hooks fire.
 *
 * When we eventually migrate to Astro 5 + `@astrojs/vercel@9+` (which
 * exposes a native `runtime` option) this script becomes obsolete and can
 * be removed along with the `postbuild` entry in package.json.
 *
 * Target runtime can be overridden via the `VERCEL_NODE_RUNTIME` env var,
 * e.g. `VERCEL_NODE_RUNTIME=nodejs24.x npm run build`.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const TARGET_RUNTIME = process.env.VERCEL_NODE_RUNTIME || 'nodejs22.x';
const FUNCTIONS_DIR = resolve(process.cwd(), '.vercel', 'output', 'functions');

/**
 * Recursively walks a directory and yields every .vc-config.json path.
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkVcConfigs(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return; // No functions dir (e.g. pure static build).
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) {
      yield* walkVcConfigs(full);
    } else if (name === '.vc-config.json') {
      yield full;
    }
  }
}

async function main() {
  const patched = [];
  const skipped = [];

  for await (const file of walkVcConfigs(FUNCTIONS_DIR)) {
    const raw = await readFile(file, 'utf8');
    let cfg;
    try {
      cfg = JSON.parse(raw);
    } catch {
      continue;
    }
    // Only rewrite Node runtimes; leave `edge` and others alone.
    if (typeof cfg.runtime !== 'string' || !cfg.runtime.startsWith('nodejs')) continue;

    const rel = relative(process.cwd(), file);
    if (cfg.runtime === TARGET_RUNTIME) {
      skipped.push(rel);
      continue;
    }
    const before = cfg.runtime;
    cfg.runtime = TARGET_RUNTIME;
    await writeFile(file, JSON.stringify(cfg, null, 2) + '\n');
    patched.push(`${rel} (${before} → ${TARGET_RUNTIME})`);
  }

  if (patched.length === 0 && skipped.length === 0) {
    console.log(`[fix-vercel-runtime] No serverless functions found under ${relative(process.cwd(), FUNCTIONS_DIR)} (skipping).`);
    return;
  }
  if (patched.length > 0) {
    console.log(`[fix-vercel-runtime] Patched ${patched.length} function(s) to ${TARGET_RUNTIME}:`);
    for (const line of patched) console.log(`  • ${line}`);
  }
  if (skipped.length > 0) {
    console.log(`[fix-vercel-runtime] Already on ${TARGET_RUNTIME}: ${skipped.length} function(s).`);
  }
}

main().catch((err) => {
  console.error('[fix-vercel-runtime] Failed:', err);
  process.exit(1);
});
