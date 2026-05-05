/**
 * CREPE-tiny pitch detection via ONNX Runtime Web.
 *
 * CREPE is a deep-learning monophonic pitch tracker. The "tiny" variant
 * is ~6 MB and runs in WebAssembly via onnxruntime-web. It outputs a
 * probability distribution over 360 pitch classes spanning C1 (32.7 Hz)
 * to G7 (3136 Hz) at 20-cent resolution.
 *
 * Lifecycle:
 *   1. `loadCrepe()` lazily fetches the model the first time it is
 *      called. Subsequent calls share the same `InferenceSession`.
 *   2. `detectPitchCrepe(buffer, sampleRate)` accepts an arbitrary
 *      sample rate, resamples to 16 kHz, runs inference, and returns
 *      `{ frequency, clarity }` matching the autocorrelator's contract.
 *   3. The detector falls back to the autocorrelator at every layer:
 *      `loadCrepe()` rejects on fetch/init failure; `detectPitchCrepe`
 *      throws if the session is not ready, so callers can catch and
 *      fall back per-frame.
 *
 * Bundle policy: this file is only imported when the user opts into
 * `featureFlags.crepe`. Static analysis of `usePitchDetection` should
 * keep the ORT runtime out of the default bundle.
 */

import type { InferenceSession, Tensor } from "onnxruntime-web";

const CREPE_MODEL_URL =
  process.env.NEXT_PUBLIC_CREPE_MODEL_URL ?? "/models/crepe-tiny.onnx";

const CREPE_INPUT_SAMPLES = 1024;
const CREPE_INPUT_RATE = 16000;
const CREPE_OUTPUT_BINS = 360;

// Bin → cents mapping that matches the upstream CREPE Python reference
// (`crepe.core.to_local_average_cents`). Cents are anchored at 10 Hz;
// bin 0 is at 1997.379 cents ≈ 31.7 Hz, bin 359 at 9177.379 cents ≈ 2 kHz.
// Naively assuming "C1 + 20 cents/bin" introduces a ~54-cent shift that
// snaps every detection to the wrong semitone — keep this aligned with
// the reference implementation.
const CREPE_CENTS_OFFSET = 1997.3794084376191;
const CREPE_CENTS_PER_BIN = 7180 / (CREPE_OUTPUT_BINS - 1);

interface CrepeRuntime {
  session: InferenceSession;
  /** ORT's `Tensor` constructor — captured at load to avoid re-imports. */
  TensorCtor: typeof Tensor;
}

let runtime: CrepeRuntime | null = null;
let loadingPromise: Promise<CrepeRuntime> | null = null;

/**
 * Idempotent loader. Multiple concurrent callers share the same load.
 * Throws if the model cannot be loaded — caller is expected to fall
 * back to a different detector.
 */
export async function loadCrepe(modelUrl = CREPE_MODEL_URL): Promise<void> {
  if (runtime) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const ort = await import("onnxruntime-web");
      // Direct ORT to the same package's WASM artifacts. Using the
      // jsdelivr CDN avoids a Next.js asset-pipeline dance for now;
      // mobile/Capacitor builds should bundle these locally instead.
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return { session, TensorCtor: ort.Tensor };
    })();
  }
  try {
    runtime = await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

/** True when the model has been successfully loaded and is ready to infer. */
export function isCrepeReady(): boolean {
  return runtime !== null;
}

/**
 * Linear-interpolation resampler. Good enough for pitch — the higher-
 * frequency content above 8 kHz that we lose is irrelevant to f0
 * estimation in CREPE's training range.
 */
function resampleLinear(
  input: Float32Array,
  inRate: number,
  outRate: number
): Float32Array {
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

/**
 * Center-crop or zero-pad the buffer to exactly CREPE_INPUT_SAMPLES.
 * CREPE expects a fixed-length frame.
 */
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

/** Standardize per-frame: subtract mean, divide by std (matches CREPE training). */
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

/**
 * Convert the 360-bin probability distribution into a single frequency
 * via local-weighted-mean around the argmax. This is the canonical
 * CREPE post-processing step ("Viterbi-style" averaging across a small
 * neighborhood) and avoids snapping to the nearest 20-cent grid point.
 */
function probsToFrequency(probs: Float32Array): {
  frequency: number;
  confidence: number;
} {
  let argmax = 0;
  let maxProb = -Infinity;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      argmax = i;
    }
  }
  // Local weighted mean over ±4 bins (CREPE convention)
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
 * Run CREPE inference on a buffer. Throws if the model has not been
 * loaded; callers should `await loadCrepe()` first or catch and fall
 * back to the autocorrelator.
 */
export async function detectPitchCrepe(
  buffer: Float32Array,
  sampleRate: number
): Promise<{ frequency: number; clarity: number }> {
  if (!runtime) {
    throw new Error("CREPE not loaded — call loadCrepe() first");
  }
  const resampled = resampleLinear(buffer, sampleRate, CREPE_INPUT_RATE);
  const fitted = fitToCrepeWindow(resampled);
  const normalized = normalize(fitted);
  // CREPE expects shape [1, 1024]
  const tensor = new runtime.TensorCtor("float32", normalized, [
    1,
    CREPE_INPUT_SAMPLES,
  ]);
  // Input/output names depend on how the model was exported. The
  // canonical CREPE export uses "input_1" → "Identity"; we read the
  // session's metadata to stay portable.
  const inputName = runtime.session.inputNames[0];
  const outputName = runtime.session.outputNames[0];
  const result = await runtime.session.run({ [inputName]: tensor });
  const output = result[outputName];
  if (!output || !(output.data instanceof Float32Array)) {
    throw new Error("CREPE output missing or wrong dtype");
  }
  const probs = output.data as Float32Array;
  if (probs.length !== CREPE_OUTPUT_BINS) {
    throw new Error(
      `Unexpected CREPE output length ${probs.length}; expected ${CREPE_OUTPUT_BINS}`
    );
  }
  const { frequency, confidence } = probsToFrequency(probs);
  // Map CREPE confidence (0–1) onto the autocorrelator's "clarity"
  // contract so downstream stability/streak logic doesn't need to
  // special-case which detector produced the reading.
  return { frequency, clarity: confidence };
}
