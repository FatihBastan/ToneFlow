/**
 * MIR-1K benchmark — vocal pitch detection.
 *
 * MIR-1K is the standard monophonic singing dataset: 1000 short clips with
 * accompaniment in the LEFT channel and clean vocals in the RIGHT channel.
 * Ground-truth pitch (from Pitch Perfect / hand-corrected) is in .pv files
 * — one MIDI semitone value per 20 ms hop, 0 means unvoiced.
 *
 * We benchmark TWO modes:
 *   --channel right   (default) — clean vocals, ceiling for the algorithm
 *   --channel mix     — accompaniment + vocals, realistic open-mic case
 *
 * Usage:
 *   npm run bench:mir1k -- /path/to/MIR-1K
 *   npm run bench:mir1k -- /path/to/MIR-1K --limit 50 --channel mix
 *
 * Expected layout:
 *   MIR-1K/
 *     Wavfile/{name}.wav        (16 kHz stereo)
 *     PitchLabel/{name}.pv      (one float per 20 ms; 0 = unvoiced)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadWavStereo } from "./lib/wav";
import { StatefulDetector } from "./lib/detector";
import { CrepeDetector, loadCrepeNode } from "./lib/crepeDetector";
import {
  newAccumulator,
  addFrame,
  computeMetrics,
  pct,
  type FrameAccumulator,
} from "./lib/metrics";
import { frameAt, parseArgs, c, midiToHz } from "./lib/util";

const FRAME_SIZE = 1024; // 64 ms at 16 kHz — long enough for low male voice
const HOP_S = 0.02;       // MIR-1K labels are at 20 ms hop
const FIRST_LABEL_S = 0.04; // labels start at the 40 ms mark per MIR-1K spec

function loadIndex(rootDir: string, limit?: number): { audio: string; ann: string; name: string }[] {
  const audioDir = join(rootDir, "Wavfile");
  const annDir = join(rootDir, "PitchLabel");
  if (!existsSync(audioDir) || !existsSync(annDir)) {
    throw new Error(`Missing Wavfile/ or PitchLabel/ in ${rootDir}`);
  }
  const wavs = readdirSync(audioDir).filter((f) => f.endsWith(".wav")).sort();
  const out: { audio: string; ann: string; name: string }[] = [];
  for (const w of wavs) {
    const base = w.replace(/\.wav$/i, "");
    const annPath = join(annDir, `${base}.pv`);
    if (!existsSync(annPath)) continue;
    out.push({ audio: join(audioDir, w), ann: annPath, name: base });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** Parse a .pv file: one MIDI semitone per line; 0 = unvoiced. */
function loadPvAnnotations(path: string): Float32Array {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = new Float32Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const v = parseFloat(lines[i]);
    out[i] = v > 0 ? midiToHz(v) : 0;
  }
  return out;
}

async function scoreClip(
  samples: Float32Array,
  sr: number,
  refFreqs: Float32Array,
  detOpts: { rmsGate?: number; clarityThreshold?: number; useCrepe?: boolean } = {}
): Promise<FrameAccumulator> {
  const acc = newAccumulator();
  const det = detOpts.useCrepe
    ? new CrepeDetector({ rmsGate: detOpts.rmsGate })
    : new StatefulDetector(detOpts);
  for (let i = 0; i < refFreqs.length; i++) {
    const labelTime = FIRST_LABEL_S + i * HOP_S;
    const center = Math.round(labelTime * sr);
    const frame = frameAt(samples, center, FRAME_SIZE);
    if (!frame) continue;
    const detFreq = await Promise.resolve(det.detect(frame, sr));
    addFrame(acc, refFreqs[i], detFreq);
  }
  return acc;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const root = positional[0];
  if (!root) {
    console.error("Usage: npm run bench:mir1k -- <path-to-MIR-1K> [--limit N] [--channel right|mix]");
    process.exit(1);
  }
  const limit = flags.limit ? parseInt(flags.limit, 10) : undefined;
  const channel = (flags.channel ?? "right") as "right" | "mix" | "left";
  if (!["right", "mix", "left"].includes(channel)) {
    console.error(`--channel must be right (vocals), mix, or left (accompaniment)`);
    process.exit(1);
  }
  const detOpts: {
    rmsGate?: number;
    clarityThreshold?: number;
    useCrepe?: boolean;
  } = {};
  if (flags["rms-gate"]) detOpts.rmsGate = parseFloat(flags["rms-gate"]);
  if (flags.clarity) detOpts.clarityThreshold = parseFloat(flags.clarity);
  if (flags.crepe !== undefined) detOpts.useCrepe = true;

  console.log(c.bold(c.cyan("MIR-1K vocal benchmark")));
  console.log(c.dim(`Root: ${root}`));
  console.log(c.dim(`Channel: ${channel}  (right = clean vocals; mix = with accompaniment)`));
  if (limit) console.log(c.dim(`Limit: ${limit}`));
  if (detOpts.rmsGate !== undefined) console.log(c.dim(`RMS gate: ${detOpts.rmsGate}`));
  if (detOpts.clarityThreshold !== undefined) console.log(c.dim(`Clarity threshold: ${detOpts.clarityThreshold}`));
  if (detOpts.useCrepe) console.log(c.dim(`Detector: CREPE-tiny ONNX`));

  if (detOpts.useCrepe) {
    process.stdout.write(c.dim("Loading CREPE model... "));
    await loadCrepeNode();
    console.log(c.dim("done"));
  }

  const idx = loadIndex(root, limit);
  console.log(c.dim(`Loaded ${idx.length} clip pairs`));
  console.log("");

  const overall = newAccumulator();
  for (let i = 0; i < idx.length; i++) {
    const row = idx[i];
    process.stdout.write(`  [${i + 1}/${idx.length}] ${row.name.slice(0, 40).padEnd(40)}\r`);
    try {
      const wav = loadWavStereo(row.audio);
      let mono: Float32Array;
      if (channel === "right") mono = wav.right;
      else if (channel === "left") mono = wav.left;
      else {
        mono = new Float32Array(wav.right.length);
        for (let j = 0; j < mono.length; j++) mono[j] = (wav.left[j] + wav.right[j]) * 0.5;
      }
      const refs = loadPvAnnotations(row.ann);
      const acc = await scoreClip(mono, wav.sampleRate, refs, detOpts);
      overall.voicedRef += acc.voicedRef;
      overall.unvoicedRef += acc.unvoicedRef;
      overall.detectedOnVoiced += acc.detectedOnVoiced;
      overall.detectedOnUnvoiced += acc.detectedOnUnvoiced;
      overall.pitchCorrect += acc.pitchCorrect;
      overall.chromaCorrect += acc.chromaCorrect;
      overall.octaveError += acc.octaveError;
      overall.totalFrames += acc.totalFrames;
    } catch (e) {
      console.error(`\nSkip ${row.name}: ${(e as Error).message}`);
    }
  }
  console.log("");

  const m = computeMetrics(overall);
  console.log(c.bold("Aggregate (MIREX-style):"));
  console.log(`  Frames analyzed:           ${overall.totalFrames}`);
  console.log(`  Voiced ground-truth:       ${overall.voicedRef}`);
  console.log(`  Raw Pitch Accuracy (RPA):  ${c.green(pct(m.rpa))}`);
  console.log(`  Raw Chroma Accuracy (RCA): ${c.green(pct(m.rca))}`);
  console.log(`  Voicing Recall (VR):       ${c.green(pct(m.vr))}`);
  console.log(`  Voicing False Alarm (VFA): ${c.yellow(pct(m.vfa))}`);
  console.log(`  Overall Accuracy (OA):     ${c.green(pct(m.oa))}`);
  console.log(`  Octave-error rate:         ${c.yellow(pct(m.octaveErrorRate))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
