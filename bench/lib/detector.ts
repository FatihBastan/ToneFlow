import {
  detectPitch,
  computeRMS,
  highPassFilter,
  applyHannWindow,
  medianFrequency,
  correctOctaveJump,
} from "../../lib/pitch";

/**
 * Mirrors the production hook's preprocessing chain so the benchmark
 * measures what real users actually get from the mic, not the raw
 * detectPitch() function in isolation.
 *
 * - High-pass filter (kills sub-50 Hz rumble)
 * - Hann window (sharper NSDF peaks)
 * - 5-frame median across detected frequencies
 * - Octave-jump correction against the previous smoothed reading
 *
 * Stateful: call detect() per frame in time order.
 */
export class StatefulDetector {
  private history: number[] = [];
  private prevFreq = -1;
  private historySize: number;
  private rmsGate: number;
  private clarityThreshold: number;

  constructor(opts: {
    historySize?: number;
    rmsGate?: number;
    clarityThreshold?: number;
  } = {}) {
    this.historySize = opts.historySize ?? 5;
    // Default matches the live hook's pre-adaptive fallback (and the
    // vocals-mode explicit override). To simulate the quiet-room case
    // instruments see post-calibration, run with `--rms-gate 0.005`.
    this.rmsGate = opts.rmsGate ?? 0.018;
    this.clarityThreshold = opts.clarityThreshold ?? 0.78;
  }

  reset(): void {
    this.history = [];
    this.prevFreq = -1;
  }

  /**
   * Returns the smoothed fundamental frequency in Hz, or -1 if the frame
   * is unvoiced / below the clarity threshold.
   */
  detect(frame: Float32Array, sampleRate: number): number {
    const rms = computeRMS(frame);
    if (rms < this.rmsGate) {
      this.reset();
      return -1;
    }

    const work = new Float32Array(frame); // copy so we don't mutate caller
    highPassFilter(work, sampleRate);
    applyHannWindow(work);

    const { frequency, clarity } = detectPitch(work, sampleRate);
    if (frequency <= 0 || clarity < this.clarityThreshold) {
      // Don't reset history — a single bad frame shouldn't wipe the smoother
      return this.prevFreq > 0 ? this.prevFreq : -1;
    }

    const corrected = correctOctaveJump(this.prevFreq, frequency);
    this.history.push(corrected);
    if (this.history.length > this.historySize) this.history.shift();
    const med = medianFrequency(this.history);
    if (med > 0) this.prevFreq = med;
    return med;
  }

  /**
   * Stateless single-shot for one-frame benchmarks (e.g. NSynth single notes).
   * Skips history but still applies HPF + window + clarity gate.
   */
  static detectOnce(
    frame: Float32Array,
    sampleRate: number,
    opts: { rmsGate?: number; clarityThreshold?: number } = {}
  ): number {
    const rmsGate = opts.rmsGate ?? 0.018;
    const clarityThreshold = opts.clarityThreshold ?? 0.78;
    const rms = computeRMS(frame);
    if (rms < rmsGate) return -1;
    const work = new Float32Array(frame);
    highPassFilter(work, sampleRate);
    applyHannWindow(work);
    const { frequency, clarity } = detectPitch(work, sampleRate);
    if (frequency <= 0 || clarity < clarityThreshold) return -1;
    return frequency;
  }
}
