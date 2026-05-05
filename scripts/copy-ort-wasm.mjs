#!/usr/bin/env node
/**
 * Copy onnxruntime-web's WASM artifacts into public/ort/ so the static
 * Next.js build (and the Capacitor Android shell) can load them locally
 * without hitting a CDN. Runs from `prebuild` and `postinstall` so any
 * `npm install` or `npm run build` keeps the directory current.
 *
 * The set of files mirrors what onnxruntime-web 1.25.x can fetch at
 * runtime depending on browser capabilities (SIMD, threads, asyncify,
 * JSEP/WebGPU). Copying the lot is ~5 MB on disk; leaving any of them
 * out triggers a 404 in browsers that selected that variant.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(ROOT, "node_modules/onnxruntime-web/dist");
const DEST = resolve(ROOT, "public/ort");

if (!existsSync(SRC)) {
  console.error(
    `[copy-ort-wasm] ${SRC} missing. Run \`npm install\` first or remove this script's hook from package.json.`
  );
  // Exit 0 so a fresh clone's postinstall doesn't fail before deps are in.
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

// Files that must travel together for the runtime to find a working
// variant. The .map source maps are nice in dev but not required.
const PATTERN = /^ort-wasm-.*\.(mjs|wasm)$/;

const wanted = readdirSync(SRC).filter((f) => PATTERN.test(f));
if (wanted.length === 0) {
  console.warn(`[copy-ort-wasm] no ort-wasm-*.{mjs,wasm} in ${SRC}`);
  process.exit(0);
}

let copied = 0;
let skipped = 0;
for (const f of wanted) {
  const srcPath = join(SRC, f);
  const dstPath = join(DEST, f);
  // Skip if dest is up-to-date (mtime ≥ src) — keeps repeat runs fast.
  if (existsSync(dstPath)) {
    const srcM = statSync(srcPath).mtimeMs;
    const dstM = statSync(dstPath).mtimeMs;
    if (dstM >= srcM) {
      skipped++;
      continue;
    }
  }
  copyFileSync(srcPath, dstPath);
  copied++;
}

console.log(
  `[copy-ort-wasm] ${copied} copied, ${skipped} unchanged in public/ort/`
);
