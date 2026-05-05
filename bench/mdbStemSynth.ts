/**
 * MDB-stem-synth benchmark.
 *
 * Each stem is a real solo-instrument or solo-vocal performance synthesized
 * from MedleyDB stems with sample-perfect ground-truth f0 annotations.
 * This is the closest available proxy for "someone playing a song's part"
 * — exactly the use case ToneFlow targets for instrument modes.
 *
 * Usage:
 *   npm run bench:mdb -- /path/to/MDB-stem-synth
 *   npm run bench:mdb -- /path/to/MDB-stem-synth --limit 20
 *   npm run bench:mdb -- /path/to/MDB-stem-synth --instrument guitar
 *
 * Expected layout:
 *   MDB-stem-synth/
 *     audio_stems/{stem}.wav        (44.1 kHz mono)
 *     annotation_stems/{stem}.csv   ("time,frequency" per line; 0 = unvoiced)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadWav } from "./lib/wav";
import { StatefulDetector } from "./lib/detector";
import { CrepeDetector, loadCrepeNode } from "./lib/crepeDetector";
import {
  newAccumulator,
  addFrame,
  computeMetrics,
  pct,
  type FrameAccumulator,
} from "./lib/metrics";
import { frameAt, parseArgs, c } from "./lib/util";

const FRAME_SIZE = 4096;

interface StemPair {
  audioPath: string;
  annPath: string;
  stemName: string;
  /** Inferred from the filename; stems are named like "MusicDelta_Beethoven_STEM_07.RESYN.wav" */
  instrumentGuess: string;
}

function loadIndex(rootDir: string, limit?: number, instrumentFilter?: string): StemPair[] {
  const audioDir = join(rootDir, "audio_stems");
  const annDir = join(rootDir, "annotation_stems");
  if (!existsSync(audioDir) || !existsSync(annDir)) {
    throw new Error(
      `Missing audio_stems/ or annotation_stems/ in ${rootDir} — is this the MDB-stem-synth root?`
    );
  }
  const audioFiles = readdirSync(audioDir).filter((f) => f.endsWith(".wav"));
  const pairs: StemPair[] = [];
  for (const audio of audioFiles) {
    // Annotation file is the same name with .csv (or .RESYN.csv) instead of .wav
    const base = audio.replace(/\.wav$/i, "");
    const candidate = [`${base}.csv`, `${base.replace(/\.RESYN$/i, "")}.csv`];
    let annFile: string | null = null;
    for (const cand of candidate) {
      if (existsSync(join(annDir, cand))) {
        annFile = cand;
        break;
      }
    }
    if (!annFile) continue;

    // Extract instrument hint from the filename if present
    const lower = base.toLowerCase();
    let instrument = "unknown";
    const instMatches = [
      "guitar", "bass", "violin", "viola", "cello", "piano", "vocal",
      "voice", "flute", "clarinet", "oboe", "saxophone", "trumpet",
      "trombone", "horn", "tuba", "synth", "organ",
    ];
    for (const i of instMatches) if (lower.includes(i)) { instrument = i; break; }

    if (instrumentFilter && instrument !== instrumentFilter) continue;

    pairs.push({
      audioPath: join(audioDir, audio),
      annPath: join(annDir, annFile),
      stemName: base,
      instrumentGuess: instrument,
    });
    if (limit && pairs.length >= limit) break;
  }
  return pairs;
}

function loadAnnotations(path: string): { times: Float64Array; freqs: Float32Array } {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const times = new Float64Array(lines.length);
  const freqs = new Float32Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const [t, f] = lines[i].split(/[, \t]+/);
    times[i] = parseFloat(t);
    freqs[i] = parseFloat(f);
  }
  return { times, freqs };
}

async function scoreStem(
  pair: StemPair,
  detOpts: { rmsGate?: number; clarityThreshold?: number; useCrepe?: boolean } = {}
): Promise<{ acc: FrameAccumulator; instrument: string }> {
  const wav = loadWav(pair.audioPath);
  const ann = loadAnnotations(pair.annPath);
  const acc = newAccumulator();
  const det = detOpts.useCrepe
    ? new CrepeDetector({ rmsGate: detOpts.rmsGate })
    : new StatefulDetector(detOpts);

  for (let i = 0; i < ann.times.length; i++) {
    const center = Math.round(ann.times[i] * wav.sampleRate);
    const frame = frameAt(wav.samples, center, FRAME_SIZE);
    if (!frame) continue;
    const detFreq = await Promise.resolve(det.detect(frame, wav.sampleRate));
    addFrame(acc, ann.freqs[i], detFreq);
  }
  return { acc, instrument: pair.instrumentGuess };
}

function summarize(perStem: { stem: string; instrument: string; acc: FrameAccumulator }[]): void {
  // Per-instrument aggregate
  const byInstrument = new Map<string, FrameAccumulator>();
  const overall = newAccumulator();

  for (const p of perStem) {
    const cur = byInstrument.get(p.instrument) ?? newAccumulator();
    cur.voicedRef += p.acc.voicedRef;
    cur.unvoicedRef += p.acc.unvoicedRef;
    cur.detectedOnVoiced += p.acc.detectedOnVoiced;
    cur.detectedOnUnvoiced += p.acc.detectedOnUnvoiced;
    cur.pitchCorrect += p.acc.pitchCorrect;
    cur.chromaCorrect += p.acc.chromaCorrect;
    cur.octaveError += p.acc.octaveError;
    cur.totalFrames += p.acc.totalFrames;
    byInstrument.set(p.instrument, cur);

    overall.voicedRef += p.acc.voicedRef;
    overall.unvoicedRef += p.acc.unvoicedRef;
    overall.detectedOnVoiced += p.acc.detectedOnVoiced;
    overall.detectedOnUnvoiced += p.acc.detectedOnUnvoiced;
    overall.pitchCorrect += p.acc.pitchCorrect;
    overall.chromaCorrect += p.acc.chromaCorrect;
    overall.octaveError += p.acc.octaveError;
    overall.totalFrames += p.acc.totalFrames;
  }

  console.log("");
  console.log(c.bold("Per-instrument metrics (frames aggregated):"));
  console.log(
    c.dim("  instrument        stems     RPA      RCA       VR        VFA      oct-err")
  );
  const instruments = [...byInstrument.keys()].sort();
  for (const inst of instruments) {
    const acc = byInstrument.get(inst)!;
    const n = perStem.filter((p) => p.instrument === inst).length;
    const m = computeMetrics(acc);
    console.log(
      `  ${inst.padEnd(15)} ${String(n).padStart(5)}    ${pct(m.rpa).padStart(6)}   ${pct(m.rca).padStart(6)}    ${pct(m.vr).padStart(6)}    ${pct(m.vfa).padStart(6)}   ${pct(m.octaveErrorRate).padStart(6)}`
    );
  }

  console.log("");
  const m = computeMetrics(overall);
  console.log(c.bold("Overall (all frames):"));
  console.log(`  Frames analyzed:           ${overall.totalFrames}`);
  console.log(`  Voiced ground-truth:       ${overall.voicedRef}`);
  console.log(`  Raw Pitch Accuracy (RPA):  ${c.green(pct(m.rpa))}`);
  console.log(`  Raw Chroma Accuracy (RCA): ${c.green(pct(m.rca))}`);
  console.log(`  Voicing Recall (VR):       ${c.green(pct(m.vr))}`);
  console.log(`  Voicing False Alarm (VFA): ${c.yellow(pct(m.vfa))}`);
  console.log(`  Overall Accuracy (OA):     ${c.green(pct(m.oa))}`);
  console.log(`  Octave-error rate:         ${c.yellow(pct(m.octaveErrorRate))}`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const root = positional[0];
  if (!root) {
    console.error("Usage: npm run bench:mdb -- <path-to-MDB-stem-synth> [--limit N] [--instrument NAME]");
    process.exit(1);
  }
  const limit = flags.limit ? parseInt(flags.limit, 10) : undefined;
  const instrumentFilter = flags.instrument;
  const detOpts: {
    rmsGate?: number;
    clarityThreshold?: number;
    useCrepe?: boolean;
  } = {};
  if (flags["rms-gate"]) detOpts.rmsGate = parseFloat(flags["rms-gate"]);
  if (flags.clarity) detOpts.clarityThreshold = parseFloat(flags.clarity);
  if (flags.crepe !== undefined) detOpts.useCrepe = true;

  console.log(c.bold(c.cyan("MDB-stem-synth benchmark")));
  console.log(c.dim(`Root: ${root}`));
  if (limit) console.log(c.dim(`Limit: ${limit} stems`));
  if (instrumentFilter) console.log(c.dim(`Instrument filter: ${instrumentFilter}`));
  if (detOpts.rmsGate !== undefined) console.log(c.dim(`RMS gate: ${detOpts.rmsGate}`));
  if (detOpts.clarityThreshold !== undefined) console.log(c.dim(`Clarity threshold: ${detOpts.clarityThreshold}`));
  if (detOpts.useCrepe) console.log(c.dim(`Detector: CREPE-tiny ONNX`));

  if (detOpts.useCrepe) {
    process.stdout.write(c.dim("Loading CREPE model... "));
    await loadCrepeNode();
    console.log(c.dim("done"));
  }

  const pairs = loadIndex(root, limit, instrumentFilter);
  console.log(c.dim(`Found ${pairs.length} stem pairs`));
  console.log("");

  const perStem: { stem: string; instrument: string; acc: FrameAccumulator }[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    process.stdout.write(`  [${i + 1}/${pairs.length}] ${p.stemName.slice(0, 50).padEnd(50)}\r`);
    try {
      const { acc, instrument } = await scoreStem(p, detOpts);
      perStem.push({ stem: p.stemName, instrument, acc });
    } catch (e) {
      console.error(`\nSkip ${p.stemName}: ${(e as Error).message}`);
    }
  }
  console.log("");
  summarize(perStem);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
