#!/usr/bin/env node
/**
 * Build the Next.js static export for Capacitor / Android. The API
 * routes under app/api/ run on Vercel, not in the APK — but Next.js
 * `output: 'export'` refuses to build any project that contains
 * dynamic routes, so we move app/api/ out of the way for the export
 * pass and put it back afterwards.
 *
 * Robust to Ctrl-C and crashes: a `process.on('exit')` hook always
 * restores the directory before quitting so an interrupted build
 * doesn't leave the working tree in a half-renamed state.
 *
 * Usage: `npm run build:mobile`. Requires NEXT_PUBLIC_API_URL to be
 * set (the mobile bundle uses it to reach the deployed API).
 */

import { existsSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const API_DIR = join(ROOT, "app/api");
// Stash OUTSIDE app/ — Next.js scans every directory under app/ for
// routes regardless of the leading `.`, so a sibling stash inside the
// project root is the only safe spot.
const STASH_DIR = join(ROOT, ".api-stash");

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.error(
    "[build-mobile] NEXT_PUBLIC_API_URL is required so the bundled client " +
      "knows where to reach the API. Example:\n" +
      "  NEXT_PUBLIC_API_URL=https://your-toneflow.vercel.app npm run build:mobile"
  );
  process.exit(1);
}

let stashed = false;

function restore() {
  if (stashed && existsSync(STASH_DIR)) {
    try {
      // Copy stash → API_DIR (recreate, replacing any empty stubs Turbopack
      // may have left behind). Using cpSync + rmSync instead of renameSync
      // because macOS APFS rename of directories has edge cases that left
      // ghost "<name> 2" directories on a previous run.
      if (existsSync(API_DIR)) {
        rmSync(API_DIR, { recursive: true, force: true });
      }
      cpSync(STASH_DIR, API_DIR, { recursive: true });
      rmSync(STASH_DIR, { recursive: true, force: true });
      stashed = false;
      console.log("[build-mobile] restored app/api/");
    } catch (err) {
      console.error(
        `[build-mobile] CRITICAL: failed to restore app/api/ from ${STASH_DIR}: ${(err instanceof Error ? err.message : String(err))}`
      );
    }
  }
}

process.on("exit", restore);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

if (existsSync(STASH_DIR)) {
  console.error(
    `[build-mobile] ${STASH_DIR} already exists from a previous failed run. ` +
      `Inspect it manually and merge / delete before retrying.`
  );
  process.exit(1);
}

if (existsSync(API_DIR)) {
  console.log(`[build-mobile] stashing app/api/ → .api-stash/`);
  cpSync(API_DIR, STASH_DIR, { recursive: true });
  rmSync(API_DIR, { recursive: true, force: true });
  stashed = true;
}

const result = spawnSync("npx", ["next", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: false,
});

restore();

if (result.error) {
  console.error("[build-mobile] failed to spawn next build:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 0);
