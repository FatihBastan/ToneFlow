/**
 * Smoke test for the bench harness.
 * Generates synthetic NSynth-like and MDB-like fixtures in a temp directory,
 * runs both runners, and asserts the harness produces sensible output.
 *
 * Run:  npx tsx bench/smokeTest.ts
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { midiToHz } from "./lib/util";

function writeWav16Mono(path: string, samples: Float32Array, sampleRate: number) {
  const numSamples = samples.length;
  const dataLen = numSamples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);             // PCM
  buf.writeUInt16LE(1, 22);             // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function makeTone(freq: number, durationS: number, sampleRate: number, harmonics = [1.0, 0.5, 0.3]): Float32Array {
  const n = Math.floor(durationS * sampleRate);
  const out = new Float32Array(n);
  const norm = harmonics.reduce((s, a) => s + a, 0);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      v += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 1) * i / sampleRate);
    }
    out[i] = (0.4 * v) / norm;
  }
  return out;
}

const tmp = join(tmpdir(), `toneflow-bench-smoke-${Date.now()}`);
console.log("Smoke fixture root:", tmp);

// ── NSynth-like fixture ──
{
  const root = join(tmp, "nsynth");
  mkdirSync(join(root, "audio"), { recursive: true });
  const examples: Record<string, { pitch: number; instrument_family_str: string; instrument_source_str: string }> = {};
  const cases = [
    { id: "guitar_acoustic-060-100", pitch: 60, family: "guitar" },
    { id: "guitar_acoustic-064-100", pitch: 64, family: "guitar" },
    { id: "bass_electronic-040-100", pitch: 40, family: "bass" },
    { id: "vocal_synthetic-072-100", pitch: 72, family: "vocal" },
  ];
  for (const cse of cases) {
    examples[cse.id] = {
      pitch: cse.pitch,
      instrument_family_str: cse.family,
      instrument_source_str: "acoustic",
    };
    const samples = makeTone(midiToHz(cse.pitch), 4, 16000);
    writeWav16Mono(join(root, "audio", `${cse.id}.wav`), samples, 16000);
  }
  writeFileSync(join(root, "examples.json"), JSON.stringify(examples, null, 2));

  console.log("\n── NSynth smoke ──");
  const r = spawnSync("npx", ["tsx", "bench/nsynth.ts", root], { encoding: "utf-8" });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// ── MDB-stem-synth-like fixture ──
{
  const root = join(tmp, "mdb");
  mkdirSync(join(root, "audio_stems"), { recursive: true });
  mkdirSync(join(root, "annotation_stems"), { recursive: true });

  const sr = 44100;
  // A simple "guitar stem": three sustained notes back to back
  const notes = [
    { midi: 55, durS: 1.0 }, // G3
    { midi: 60, durS: 1.0 }, // C4
    { midi: 64, durS: 1.0 }, // E4
  ];
  let allSamples: number[] = [];
  let annotations: { t: number; f: number }[] = [];
  let tCursor = 0;
  for (const n of notes) {
    const tone = makeTone(midiToHz(n.midi), n.durS, sr);
    allSamples.push(...tone);
    const hopS = 256 / sr;
    for (let s = 0; s < n.durS; s += hopS) {
      annotations.push({ t: tCursor + s, f: midiToHz(n.midi) });
    }
    tCursor += n.durS;
  }
  writeWav16Mono(join(root, "audio_stems", "guitar_test.wav"), Float32Array.from(allSamples), sr);
  writeFileSync(
    join(root, "annotation_stems", "guitar_test.csv"),
    annotations.map((a) => `${a.t.toFixed(6)},${a.f.toFixed(6)}`).join("\n")
  );

  console.log("\n── MDB-stem-synth smoke ──");
  const r = spawnSync("npx", ["tsx", "bench/mdbStemSynth.ts", root], { encoding: "utf-8" });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// ── MIR-1K-like fixture ──
{
  const root = join(tmp, "mir1k");
  mkdirSync(join(root, "Wavfile"), { recursive: true });
  mkdirSync(join(root, "PitchLabel"), { recursive: true });

  const sr = 16000;
  // Build right-channel "vocals" — three sustained notes; left = silence.
  const seq = [
    { midi: 60, durS: 0.5 },
    { midi: 62, durS: 0.5 },
    { midi: 64, durS: 0.5 },
  ];
  let right: number[] = [];
  let labels: number[] = []; // MIDI semitone, 0 = unvoiced
  // MIR-1K spec: first label at t=0.04s, hop 0.02s
  let labelCursor = 0.04;
  for (const n of seq) {
    const tone = makeTone(midiToHz(n.midi), n.durS, sr, [1.0, 0.6, 0.3]);
    right.push(...tone);
  }
  const totalS = right.length / sr;
  while (labelCursor < totalS) {
    const idx = Math.floor(labelCursor * sr);
    let cum = 0;
    let label = 0;
    for (const n of seq) {
      const next = cum + n.durS;
      if (labelCursor >= cum && labelCursor < next) { label = n.midi; break; }
      cum = next;
    }
    labels.push(label);
    labelCursor += 0.02;
  }
  // Build stereo buffer (left = silence, right = vocals)
  const stereo = Buffer.alloc(44 + right.length * 4);
  stereo.write("RIFF", 0, "ascii");
  stereo.writeUInt32LE(36 + right.length * 4, 4);
  stereo.write("WAVE", 8, "ascii");
  stereo.write("fmt ", 12, "ascii");
  stereo.writeUInt32LE(16, 16);
  stereo.writeUInt16LE(1, 20);
  stereo.writeUInt16LE(2, 22);
  stereo.writeUInt32LE(sr, 24);
  stereo.writeUInt32LE(sr * 4, 28);
  stereo.writeUInt16LE(4, 32);
  stereo.writeUInt16LE(16, 34);
  stereo.write("data", 36, "ascii");
  stereo.writeUInt32LE(right.length * 4, 40);
  for (let i = 0; i < right.length; i++) {
    stereo.writeInt16LE(0, 44 + i * 4);
    stereo.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(right[i] * 32767))), 44 + i * 4 + 2);
  }
  writeFileSync(join(root, "Wavfile", "smoke_clip.wav"), stereo);
  writeFileSync(join(root, "PitchLabel", "smoke_clip.pv"), labels.map((l) => l.toFixed(3)).join("\n"));

  console.log("\n── MIR-1K smoke ──");
  const r = spawnSync("npx", ["tsx", "bench/mir1k.ts", root], { encoding: "utf-8" });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rmSync(tmp, { recursive: true, force: true });
console.log("\nSmoke test cleanup done.");
