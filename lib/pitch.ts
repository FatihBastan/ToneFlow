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
  // A peak is where nsdf[i] > nsdf[i-1] and nsdf[i] >= nsdf[i+1]
  // and we've crossed zero from negative to positive before it.
  interface Peak {
    period: number;
    value: number;
  }
  const peaks: Peak[] = [];
  let wasNegative = true; // Start assuming negative so first positive region counts

  for (let period = minPeriod + 1; period < maxPeriod; period++) {
    if (nsdfValues[period] < 0) {
      wasNegative = true;
      continue;
    }

    // Only consider peaks after a zero crossing (negative → positive)
    if (
      wasNegative &&
      nsdfValues[period] > 0
    ) {
      wasNegative = false;
    }

    // Check if this is a local maximum
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
  // This is the key to avoiding octave errors: the fundamental frequency
  // always produces the first significant NSDF peak. Harmonics produce
  // peaks at integer multiples of the fundamental period (later in the array).
  // Using a threshold of 0.8 * globalMax catches the fundamental even when
  // a harmonic peak is slightly stronger.
  const PEAK_THRESHOLD = 0.8;
  const threshold = globalMax * PEAK_THRESHOLD;

  let bestPeak: Peak | null = null;
  for (const peak of peaks) {
    if (peak.value >= threshold) {
      bestPeak = peak;
      break; // Take the FIRST qualifying peak (shortest period = highest frequency = fundamental)
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
 * Compute RMS volume level from audio buffer.
 * Returns value 0.0 - 1.0
 */
export function computeRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Simple heuristic to detect if audio sounds like vocals.
 * Vocals typically have fundamental frequency in 80-1600 Hz range
 * with strong harmonic content.
 */
export function isLikelyVocal(frequency: number, rms: number): boolean {
  if (rms < 0.02) return false;
  return frequency >= 80 && frequency <= 1600;
}
