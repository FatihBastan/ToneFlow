/**
 * NSynth-test benchmark.
 *
 * Each NSynth example is a single 4-second note with a known MIDI pitch
 * and instrument family. We run the production detector across the steady
 * portion of the note and compare the most-common MIDI estimate to the label.
 *
 * Usage:
 *   npm run bench:nsynth -- /path/to/nsynth-test
 *   npm run bench:nsynth -- /path/to/nsynth-test --limit 200
 *   npm run bench:nsynth -- /path/to/nsynth-test --family acoustic
 *
 * Expected layout (Magenta's official release):
 *   nsynth-test/
 *     audio/{instrument_str}-{pitch}-{velocity}.wav
 *     examples.json
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadWav } from "./lib/wav";
import { StatefulDetector } from "./lib/detector";
import { CrepeDetector, loadCrepeNode } from "./lib/crepeDetector";
import { frameAt, midiToHz, parseArgs, c } from "./lib/util";
import { frequencyToMidi } from "../lib/noteMapping";

interface NSynthRow {
  pitch: number;          // ground-truth MIDI 0–127
  family: string;         // instrument_family_str
  source: string;         // acoustic / electronic / synthetic
  filename: string;       // audio/...wav
}

const FRAME_SIZE = 4096;
const HOP_SIZE = 1024;
// Window around the loudest part of the note. Real users get their answer
// shortly after attack — we don't wait two seconds for sustain to decay.
const WINDOW_BEFORE_PEAK_S = 0.05;
const WINDOW_AFTER_PEAK_S = 0.6;
const MIN_SCORE_FRAMES = 3;

function loadIndex(rootDir: string, limit?: number, familyFilter?: string): NSynthRow[] {
  // Magenta ships an examples.json mapping example-id → metadata.
  const jsonPath = join(rootDir, "examples.json");
  const audioDir = join(rootDir, "audio");
  if (!existsSync(jsonPath) || !existsSync(audioDir)) {
    throw new Error(
      `Missing examples.json or audio/ in ${rootDir} — is this the NSynth-test root?`
    );
  }
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, {
    pitch: number;
    instrument_family_str: string;
    instrument_source_str: string;
  }>;

  const rows: NSynthRow[] = [];
  for (const [id, meta] of Object.entries(raw)) {
    if (familyFilter && meta.instrument_family_str !== familyFilter) continue;
    rows.push({
      pitch: meta.pitch,
      family: meta.instrument_family_str,
      source: meta.instrument_source_str,
      filename: `audio/${id}.wav`,
    });
    if (limit && rows.length >= limit) break;
  }
  return rows;
}

interface PerClipResult {
  refMidi: number;
  detMidi: number; // -1 = no detection
  detCents: number; // signed cents from refMidi (only valid when detected)
  exact: boolean;
  withinHalfStep: boolean;
  octaveError: boolean;
  family: string;
  source: string;
}

async function scoreClip(
  samples: Float32Array,
  sr: number,
  refMidi: number,
  family: string,
  source: string,
  detOpts: { rmsGate?: number; clarityThreshold?: number; useCrepe?: boolean } = {}
): Promise<PerClipResult> {
  const det = detOpts.useCrepe
    ? new CrepeDetector({ rmsGate: detOpts.rmsGate })
    : new StatefulDetector(detOpts);
  const refHz = midiToHz(refMidi);

  // 1) Find the energy peak — that's where the user actually hears the note.
  let peakSample = 0;
  let peakRms = 0;
  const rmsHop = 1024;
  const rmsWindow = 1024;
  for (let i = 0; i + rmsWindow < samples.length; i += rmsHop) {
    let s = 0;
    for (let j = 0; j < rmsWindow; j++) s += samples[i + j] * samples[i + j];
    const r = Math.sqrt(s / rmsWindow);
    if (r > peakRms) { peakRms = r; peakSample = i + rmsWindow / 2; }
  }

  // 2) Score frames in a tight window around the peak.
  const startSample = Math.max(0, peakSample - Math.floor(WINDOW_BEFORE_PEAK_S * sr));
  const endSample = Math.min(samples.length, peakSample + Math.floor(WINDOW_AFTER_PEAK_S * sr));

  const bins = new Map<number, number>();
  let totalCents = 0;
  let totalCount = 0;

  for (let i = startSample; i + FRAME_SIZE < endSample; i += HOP_SIZE) {
    const frame = frameAt(samples, i + FRAME_SIZE / 2, FRAME_SIZE);
    if (!frame) continue;
    const f = await Promise.resolve(det.detect(frame, sr));
    if (f <= 0) continue;
    const midi = frequencyToMidi(f);
    bins.set(midi, (bins.get(midi) ?? 0) + 1);
    totalCents += 1200 * Math.log2(f / refHz);
    totalCount++;
  }

  // 3) Reject if we got too few valid frames — likely the clip is noise.
  if (totalCount < MIN_SCORE_FRAMES) {
    bins.clear();
  }

  let bestMidi = -1;
  let bestCount = 0;
  for (const [m, n] of bins) {
    if (n > bestCount) {
      bestCount = n;
      bestMidi = m;
    }
  }

  const detected = bestMidi >= 0;
  const exact = detected && bestMidi === refMidi;
  const withinHalfStep = detected && Math.abs(bestMidi - refMidi) <= 0;
  const octaveError =
    detected &&
    !exact &&
    Math.abs(bestMidi - refMidi) % 12 === 0 &&
    bestMidi !== refMidi;

  return {
    refMidi,
    detMidi: bestMidi,
    detCents: totalCount > 0 ? totalCents / totalCount : 0,
    exact,
    withinHalfStep,
    octaveError,
    family,
    source,
  };
}

function summarize(results: PerClipResult[]): void {
  const total = results.length;
  const detected = results.filter((r) => r.detMidi >= 0).length;
  const exact = results.filter((r) => r.exact).length;
  const octaveErrors = results.filter((r) => r.octaveError).length;
  // Chroma-correct: ignores octave
  const chroma = results.filter(
    (r) => r.detMidi >= 0 && (r.detMidi - r.refMidi) % 12 === 0
  ).length;

  // Per-family breakdown
  const byFamily = new Map<string, PerClipResult[]>();
  for (const r of results) {
    const arr = byFamily.get(r.family) ?? [];
    arr.push(r);
    byFamily.set(r.family, arr);
  }

  console.log("");
  console.log(c.bold("Per-instrument-family accuracy:"));
  console.log(
    c.dim("  family               n     exact     chroma    oct-err   undetected")
  );
  const families = [...byFamily.keys()].sort();
  for (const fam of families) {
    const rs = byFamily.get(fam)!;
    const n = rs.length;
    const ex = rs.filter((r) => r.exact).length;
    const ch = rs.filter((r) => r.detMidi >= 0 && (r.detMidi - r.refMidi) % 12 === 0).length;
    const oc = rs.filter((r) => r.octaveError).length;
    const un = rs.filter((r) => r.detMidi < 0).length;
    const exP = ((ex / n) * 100).toFixed(1).padStart(5);
    const chP = ((ch / n) * 100).toFixed(1).padStart(5);
    console.log(
      `  ${fam.padEnd(20)} ${String(n).padStart(4)}   ${exP}%    ${chP}%      ${String(oc).padStart(4)}      ${String(un).padStart(4)}`
    );
  }

  console.log("");
  console.log(c.bold("Aggregate:"));
  console.log(`  Total clips:                ${total}`);
  console.log(
    `  Exact MIDI match:           ${c.green(((exact / total) * 100).toFixed(1) + "%")}   (${exact}/${total})`
  );
  console.log(
    `  Chroma-correct (RCA-like):  ${c.green(((chroma / total) * 100).toFixed(1) + "%")}   (${chroma}/${total})`
  );
  console.log(
    `  Octave errors:              ${c.yellow(((octaveErrors / total) * 100).toFixed(1) + "%")}   (${octaveErrors}/${total})`
  );
  console.log(
    `  Undetected (silence/noise): ${c.dim(((1 - detected / total) * 100).toFixed(1) + "%")}   (${total - detected}/${total})`
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const root = positional[0];
  if (!root) {
    console.error("Usage: npm run bench:nsynth -- <path-to-nsynth-test> [--limit N] [--family NAME]");
    process.exit(1);
  }
  const limit = flags.limit ? parseInt(flags.limit, 10) : undefined;
  const familyFilter = flags.family;
  const detOpts: {
    rmsGate?: number;
    clarityThreshold?: number;
    useCrepe?: boolean;
  } = {};
  if (flags["rms-gate"]) detOpts.rmsGate = parseFloat(flags["rms-gate"]);
  if (flags.clarity) detOpts.clarityThreshold = parseFloat(flags.clarity);
  if (flags.crepe !== undefined) detOpts.useCrepe = true;

  console.log(c.bold(c.cyan("NSynth-test pitch detection benchmark")));
  console.log(c.dim(`Root: ${root}`));
  if (limit) console.log(c.dim(`Limit: ${limit}`));
  if (familyFilter) console.log(c.dim(`Family filter: ${familyFilter}`));
  if (detOpts.rmsGate !== undefined) console.log(c.dim(`RMS gate: ${detOpts.rmsGate}`));
  if (detOpts.clarityThreshold !== undefined) console.log(c.dim(`Clarity threshold: ${detOpts.clarityThreshold}`));
  if (detOpts.useCrepe) console.log(c.dim(`Detector: CREPE-tiny ONNX`));

  if (detOpts.useCrepe) {
    process.stdout.write(c.dim("Loading CREPE model... "));
    await loadCrepeNode();
    console.log(c.dim("done"));
  }

  const rows = loadIndex(root, limit, familyFilter);
  console.log(c.dim(`Loaded index: ${rows.length} clips`));
  console.log("");

  const results: PerClipResult[] = [];
  let nextLog = 50;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const path = join(root, r.filename);
    let wav;
    try {
      wav = loadWav(path);
    } catch (e) {
      console.error(`Skip ${r.filename}: ${(e as Error).message}`);
      continue;
    }
    const result = await scoreClip(wav.samples, wav.sampleRate, r.pitch, r.family, r.source, detOpts);
    results.push(result);

    if (i + 1 >= nextLog) {
      const exactSoFar = results.filter((x) => x.exact).length;
      process.stdout.write(
        `  ${i + 1}/${rows.length}  exact=${((exactSoFar / results.length) * 100).toFixed(1)}%\r`
      );
      nextLog += 50;
    }
  }
  console.log("");
  summarize(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
