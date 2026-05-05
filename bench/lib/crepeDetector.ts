/**
 * Node-side CREPE-tiny detector for benchmarks. Mirrors enough of the
 * StatefulDetector contract to drop into the bench scripts, but with an
 * **async** detect method since `onnxruntime-node` runs inference on a
 * worker pool and only exposes a Promise-returning API.
 *
 * Loads the model from `public/models/crepe-tiny.onnx` by default;
 * override with the `CREPE_MODEL_PATH` env var.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { InferenceSession, Tensor, env } from "onnxruntime-node";

// Quiet ORT logging — bench output is otherwise unreadable.
env.logLevel = "error";

const CREPE_INPUT_SAMPLES = 1024;
const CREPE_INPUT_RATE = 16000;
const CREPE_OUTPUT_BINS = 360;
// Bin → cents mapping that matches the upstream CREPE Python reference
// (`crepe.core.to_local_average_cents`). Cents are anchored at 10 Hz;
// bin 0 is at 1997.379 cents ≈ 31.7 Hz, bin 359 at 9177.379 cents ≈ 2 kHz.
const CREPE_CENTS_OFFSET = 1997.3794084376191;
const CREPE_CENTS_PER_BIN = 7180 / (CREPE_OUTPUT_BINS - 1);

let cachedSession: InferenceSession | null = null;
let cachedInputName = "";
let cachedOutputName = "";

export function defaultCrepeModelPath(): string {
  if (process.env.CREPE_MODEL_PATH) return resolve(process.env.CREPE_MODEL_PATH);
  return resolve(join(process.cwd(), "public/models/crepe-tiny.onnx"));
}

export async function loadCrepeNode(modelPath?: string): Promise<void> {
  if (cachedSession) return;
  const path = modelPath ?? defaultCrepeModelPath();
  if (!existsSync(path)) {
    throw new Error(
      `CREPE model not found at ${path}. ` +
        `Set CREPE_MODEL_PATH or drop the file at public/models/crepe-tiny.onnx — ` +
        `see public/models/README.md for the conversion recipe.`
    );
  }
  cachedSession = await InferenceSession.create(path, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
  cachedInputName = cachedSession.inputNames[0];
  cachedOutputName = cachedSession.outputNames[0];
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function fitToCrepeWindow(buffer: Float32Array): Float32Array {
  if (buffer.length === CREPE_INPUT_SAMPLES) return buffer;
  const out = new Float32Array(CREPE_INPUT_SAMPLES);
  if (buffer.length > CREPE_INPUT_SAMPLES) {
    const start = Math.floor((buffer.length - CREPE_INPUT_SAMPLES) / 2);
    out.set(buffer.subarray(start, start + CREPE_INPUT_SAMPLES));
  } else {
    const start = Math.floor((CREPE_INPUT_SAMPLES - buffer.length) / 2);
    out.set(buffer, start);
  }
  return out;
}

function normalize(buffer: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i];
  const mean = sum / buffer.length;
  let variance = 0;
  for (let i = 0; i < buffer.length; i++) {
    const d = buffer[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / buffer.length) || 1;
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = (buffer[i] - mean) / std;
  return out;
}

function probsToFrequency(probs: Float32Array): { frequency: number; confidence: number } {
  let argmax = 0;
  let maxProb = -Infinity;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      argmax = i;
    }
  }
  const span = 4;
  const lo = Math.max(0, argmax - span);
  const hi = Math.min(probs.length - 1, argmax + span);
  let weightSum = 0;
  let centroid = 0;
  for (let i = lo; i <= hi; i++) {
    const w = probs[i];
    weightSum += w;
    centroid += i * w;
  }
  const refinedBin = weightSum > 0 ? centroid / weightSum : argmax;
  const cents = CREPE_CENTS_OFFSET + refinedBin * CREPE_CENTS_PER_BIN;
  const frequency = 10 * Math.pow(2, cents / 1200);
  return { frequency, confidence: maxProb };
}

/**
 * Async-only CREPE detector. Bench scripts must `await` each call.
 * Stateless: no smoothing, no octave-jump correction — CREPE is accurate
 * enough per-frame that the StatefulDetector's smoothing pipeline is
 * counter-productive (it would round-trip readings through a 5-frame
 * median that introduces lag without removing real noise).
 */
export class CrepeDetector {
  private confidenceThreshold: number;
  private rmsGate: number;

  constructor(opts: { rmsGate?: number; confidenceThreshold?: number } = {}) {
    if (!cachedSession) {
      throw new Error("Call await loadCrepeNode() before constructing CrepeDetector");
    }
    // Match the autocorrelator's adaptive floor by default so the two
    // detectors are comparing the same set of voiced frames.
    this.rmsGate = opts.rmsGate ?? 0.005;
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.5;
  }

  reset(): void {
    // Stateless — nothing to reset.
  }

  async detect(frame: Float32Array, sampleRate: number): Promise<number> {
    if (!cachedSession) throw new Error("Session not loaded");
    let rmsSq = 0;
    for (let i = 0; i < frame.length; i++) rmsSq += frame[i] * frame[i];
    const rms = Math.sqrt(rmsSq / frame.length);
    if (rms < this.rmsGate) return -1;

    const resampled = resampleLinear(frame, sampleRate, CREPE_INPUT_RATE);
    const fitted = fitToCrepeWindow(resampled);
    const normalized = normalize(fitted);
    const tensor = new Tensor("float32", normalized, [1, CREPE_INPUT_SAMPLES]);
    const result = await cachedSession.run({ [cachedInputName]: tensor });
    const output = result[cachedOutputName];
    if (!output || !(output.data instanceof Float32Array)) return -1;
    const probs = output.data as Float32Array;
    if (probs.length !== CREPE_OUTPUT_BINS) return -1;
    const { frequency, confidence } = probsToFrequency(probs);
    if (confidence < this.confidenceThreshold) return -1;
    return frequency;
  }
}
