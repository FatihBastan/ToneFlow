/**
 * Autocorrelation-based pitch detection using NSDF with proper
 * fundamental frequency selection (picks first qualifying peak,
 * not the global maximum, to avoid octave errors with harmonic signals).
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  minFreq = 60,
  maxFreq = 2000
): { frequency: number; clarity: number } {
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.min(
    Math.floor(sampleRate / minFreq),
    buffer.length - 1
  );
  const bufferSize = buffer.length;

  // Compute RMS — skip if too quiet
  let rms = 0;
  for (let i = 0; i < bufferSize; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / bufferSize);
  if (rms < 0.01) {
    return { frequency: -1, clarity: 0 };
  }

  // --- Step 1: Compute full NSDF across all candidate periods ---
  const nsdfValues = new Float32Array(maxPeriod + 1);

  for (
    let period = minPeriod;
    period <= maxPeriod && period < bufferSize;
    period++
  ) {
    let correlation = 0;
    let normA = 0;
    let normB = 0;
    const len = bufferSize - period;

    for (let i = 0; i < len; i++) {
      correlation += buffer[i] * buffer[i + period];
      normA += buffer[i] * buffer[i];
      normB += buffer[i + period] * buffer[i + period];
    }

    const norm = normA + normB;
    nsdfValues[period] = norm > 0 ? (2 * correlation) / norm : 0;
  }

  // --- Step 2: Find all positive peaks in the NSDF ---
  interface Peak {
    period: number;
    value: number;
  }
  const peaks: Peak[] = [];
  let wasNegative = true;

  for (let period = minPeriod + 1; period < maxPeriod; period++) {
    if (nsdfValues[period] < 0) {
      wasNegative = true;
      continue;
    }

    if (wasNegative && nsdfValues[period] > 0) {
      wasNegative = false;
    }

    if (
      nsdfValues[period] > nsdfValues[period - 1] &&
      nsdfValues[period] >= nsdfValues[period + 1] &&
      nsdfValues[period] > 0
    ) {
      peaks.push({ period, value: nsdfValues[period] });
    }
  }

  if (peaks.length === 0) {
    return { frequency: -1, clarity: 0 };
  }

  // --- Step 3: Find the global maximum to set the threshold ---
  let globalMax = 0;
  for (const peak of peaks) {
    if (peak.value > globalMax) globalMax = peak.value;
  }

  // --- Step 4: Select the FIRST peak above the threshold ---
  const PEAK_THRESHOLD = 0.8;
  const threshold = globalMax * PEAK_THRESHOLD;

  let bestPeak: Peak | null = null;
  for (const peak of peaks) {
    if (peak.value >= threshold) {
      bestPeak = peak;
      break;
    }
  }

  if (!bestPeak || bestPeak.value < 0.5) {
    return { frequency: -1, clarity: 0 };
  }

  // --- Step 5: Parabolic interpolation for sub-sample accuracy ---
  const shift = bestPeak.period;
  if (shift > 0 && shift < bufferSize - 1) {
    const s0 = nsdfValues[shift - 1];
    const s1 = nsdfValues[shift];
    const s2 = nsdfValues[shift + 1];
    const denom = 2 * s1 - s2 - s0;

    if (denom !== 0) {
      const refinedShift = shift + (s2 - s0) / (2 * denom);
      if (refinedShift > 0) {
        return {
          frequency: sampleRate / refinedShift,
          clarity: bestPeak.value,
        };
      }
    }
  }

  return {
    frequency: sampleRate / bestPeak.period,
    clarity: bestPeak.value,
  };
}

/**
 * Compute RMS volume level from audio buffer (linear 0-1).
 */
export function computeRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * High-pass filter the buffer in-place using a simple one-pole filter.
 * Removes low-frequency rumble (AC hum, HVAC, mic handling) below ~50 Hz
 * before pitch analysis. Cutoff is approximate.
 */
export function highPassFilter(buffer: Float32Array, sampleRate: number, cutoffHz = 55): void {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let prevIn = buffer[0];
  let prevOut = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    const out = alpha * (prevOut + buffer[i] - prevIn);
    prevIn = buffer[i];
    prevOut = out;
    buffer[i] = out;
  }
}

/**
 * Apply a Hann window to the buffer in-place.
 * Reduces spectral leakage so the NSDF peaks are sharper and more reliable.
 */
export function applyHannWindow(buffer: Float32Array): void {
  const n = buffer.length;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    buffer[i] *= w;
  }
}

/**
 * Median-smooth a sequence of frequencies to reject single-frame outliers.
 * Returns the median of `samples` (frequencies > 0). If fewer than 3 valid
 * samples, returns the last one. Robust to occasional misdetections.
 */
export function medianFrequency(samples: number[]): number {
  const valid = samples.filter((f) => f > 0);
  if (valid.length === 0) return -1;
  if (valid.length < 3) return valid[valid.length - 1];
  const sorted = [...valid].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Detect octave jumps between consecutive readings.
 * If the new frequency is ~2x or ~0.5x of the previous AND clarity is similar,
 * the new reading is likely an octave-error glitch — return the corrected freq.
 */
export function correctOctaveJump(prev: number, current: number): number {
  if (prev <= 0) return current;
  const ratio = current / prev;
  // Within ±5% of half or double — almost certainly an octave error
  if (Math.abs(ratio - 2) < 0.1) return current / 2;
  if (Math.abs(ratio - 0.5) < 0.05) return current * 2;
  return current;
}

/**
 * Simple heuristic to detect if audio sounds like vocals.
 * Vocals typically have fundamental frequency in 80-1100 Hz range.
 */
export function isLikelyVocal(frequency: number, rms: number): boolean {
  if (rms < 0.02) return false;
  return frequency >= 80 && frequency <= 1100;
}
