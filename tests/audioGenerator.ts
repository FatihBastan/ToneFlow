/**
 * Synthetic audio buffer generators for testing pitch detection.
 * Generates Float32Array buffers simulating real instrument signals.
 */

const SAMPLE_RATE = 44100;
const DEFAULT_BUFFER_SIZE = 2048;

/**
 * Generate a pure sine wave at a given frequency.
 */
export function generateSineWave(
  frequency: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    buffer[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return buffer;
}

/**
 * Generate a signal with harmonics (more realistic instrument simulation).
 * harmonicAmplitudes: array of relative amplitudes for each harmonic.
 * e.g. [1, 0.5, 0.3] = fundamental + 2nd harmonic at 50% + 3rd at 30%
 */
export function generateWithHarmonics(
  fundamental: number,
  harmonicAmplitudes: number[],
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  // Normalize so peak doesn't clip
  const totalEnergy = harmonicAmplitudes.reduce((s, a) => s + Math.abs(a), 0);
  const normFactor = totalEnergy > 0 ? 1 / totalEnergy : 1;

  for (let i = 0; i < bufferSize; i++) {
    let sample = 0;
    for (let h = 0; h < harmonicAmplitudes.length; h++) {
      const freq = fundamental * (h + 1);
      sample += harmonicAmplitudes[h] * normFactor * Math.sin(2 * Math.PI * freq * i / sampleRate);
    }
    buffer[i] = amplitude * sample;
  }
  return buffer;
}

/**
 * Simulate a guitar tone — strong fundamental with decaying harmonics + slight inharmonicity.
 */
export function generateGuitarTone(
  frequency: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  // Guitar has strong harmonics: fundamental, 2nd, 3rd strong; higher ones decay
  const harmonics = [1.0, 0.7, 0.5, 0.3, 0.15, 0.08, 0.04];
  return generateWithHarmonics(frequency, harmonics, amplitude, bufferSize, sampleRate);
}

/**
 * Simulate a piano tone — rich harmonics with slight inharmonicity at higher partials.
 */
export function generatePianoTone(
  frequency: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  // Piano has very rich harmonic spectrum
  const harmonics = [1.0, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05, 0.03];
  const buffer = new Float32Array(bufferSize);
  const totalEnergy = harmonics.reduce((s, a) => s + a, 0);
  const normFactor = 1 / totalEnergy;

  for (let i = 0; i < bufferSize; i++) {
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      // Piano inharmonicity: higher partials are slightly sharp
      const inharmonicity = 1 + (h * h * 0.0001);
      const freq = frequency * (h + 1) * inharmonicity;
      sample += harmonics[h] * normFactor * Math.sin(2 * Math.PI * freq * i / sampleRate);
    }
    buffer[i] = amplitude * sample;
  }
  return buffer;
}

/**
 * Simulate a bass guitar tone — very strong fundamental, fewer audible harmonics.
 */
export function generateBassTone(
  frequency: number,
  amplitude = 0.6,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const harmonics = [1.0, 0.5, 0.25, 0.12, 0.06];
  return generateWithHarmonics(frequency, harmonics, amplitude, bufferSize, sampleRate);
}

/**
 * Simulate a vocal tone — strong formant-like harmonics in the 300-3000 Hz range.
 */
export function generateVocalTone(
  frequency: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  // Vocals have strong harmonics shaped by formants
  const harmonics = [1.0, 0.9, 0.7, 0.8, 0.5, 0.6, 0.3, 0.2, 0.15, 0.1];
  return generateWithHarmonics(frequency, harmonics, amplitude, bufferSize, sampleRate);
}

/**
 * Simulate vibrato — frequency oscillates around the center frequency.
 */
export function generateVibrato(
  centerFreq: number,
  vibratoRate: number,    // vibrato speed in Hz (typically 4-7 Hz)
  vibratoDepth: number,   // depth in cents (typically 20-80 cents)
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  const depthFactor = Math.pow(2, vibratoDepth / 1200); // cents to frequency ratio

  for (let i = 0; i < bufferSize; i++) {
    const t = i / sampleRate;
    const vibrato = Math.sin(2 * Math.PI * vibratoRate * t);
    const freqMultiplier = Math.pow(depthFactor, vibrato);
    const instantFreq = centerFreq * freqMultiplier;
    buffer[i] = amplitude * Math.sin(2 * Math.PI * instantFreq * t);
  }
  return buffer;
}

/**
 * Simulate a bowed string (violin/cello) — sawtooth-like waveform with harmonics.
 */
export function generateBowedStringTone(
  frequency: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  // Bowed strings approximate a sawtooth — all harmonics present, amplitude ~ 1/n
  const numHarmonics = Math.min(15, Math.floor((sampleRate / 2) / frequency));
  const harmonics: number[] = [];
  for (let h = 1; h <= numHarmonics; h++) {
    harmonics.push(1 / h);
  }
  return generateWithHarmonics(frequency, harmonics, amplitude, bufferSize, sampleRate);
}

/**
 * Generate silence (for testing noise gate).
 */
export function generateSilence(bufferSize = DEFAULT_BUFFER_SIZE): Float32Array {
  return new Float32Array(bufferSize);
}

/**
 * Generate white noise at a given amplitude.
 */
export function generateNoise(
  amplitude = 0.1,
  bufferSize = DEFAULT_BUFFER_SIZE
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    buffer[i] = amplitude * (Math.random() * 2 - 1);
  }
  return buffer;
}

/**
 * Add noise to an existing buffer.
 */
export function addNoise(buffer: Float32Array, noiseAmplitude = 0.02): Float32Array {
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[i] + noiseAmplitude * (Math.random() * 2 - 1);
  }
  return result;
}

/**
 * Generate a signal with a detuned frequency (for testing cents accuracy).
 * centsOffset: how many cents sharp (+) or flat (-) from the target frequency.
 */
export function generateDetunedTone(
  targetFrequency: number,
  centsOffset: number,
  amplitude = 0.5,
  bufferSize = DEFAULT_BUFFER_SIZE,
  sampleRate = SAMPLE_RATE
): Float32Array {
  const detunedFreq = targetFrequency * Math.pow(2, centsOffset / 1200);
  return generateSineWave(detunedFreq, amplitude, bufferSize, sampleRate);
}

// Standard tuning reference frequencies
export const GUITAR_STRINGS = {
  E2: 82.41,    // Low E (6th string)
  A2: 110.00,   // A (5th string)
  D3: 146.83,   // D (4th string)
  G3: 196.00,   // G (3rd string)
  B3: 246.94,   // B (2nd string)
  E4: 329.63,   // High E (1st string)
};

export const BASS_STRINGS = {
  E1: 41.20,    // Low E (4th string)
  A1: 55.00,    // A (3rd string)
  D2: 73.42,    // D (2nd string)
  G2: 98.00,    // G (1st string)
};

export const PIANO_RANGE = {
  A0: 27.50,    // Lowest piano note
  C1: 32.70,
  C2: 65.41,
  C3: 130.81,
  C4: 261.63,   // Middle C
  A4: 440.00,   // Concert A
  C5: 523.25,
  C6: 1046.50,
  C7: 2093.00,
  C8: 4186.01,  // Highest piano note
};

export const VOCAL_RANGES = {
  bass:     { low: 82.41,  high: 329.63 },   // E2 - E4
  baritone: { low: 98.00,  high: 392.00 },   // G2 - G4
  tenor:    { low: 130.81, high: 523.25 },   // C3 - C5
  alto:     { low: 174.61, high: 698.46 },   // F3 - F5
  soprano:  { low: 261.63, high: 1046.50 },  // C4 - C6
};

export const VIOLIN_STRINGS = {
  G3: 196.00,
  D4: 293.66,
  A4: 440.00,
  E5: 659.26,
};

export const CELLO_STRINGS = {
  C2: 65.41,
  G2: 98.00,
  D3: 146.83,
  A3: 220.00,
};

export const SAMPLE_RATE_DEFAULT = SAMPLE_RATE;
