/**
 * VOCALS PITCH DETECTION TEST SUITE
 * Tests male and female vocal ranges, vibrato, different vowel simulations,
 * and real song melody lines.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch, isLikelyVocal } from '../lib/pitch';
import { frequencyToNoteName, frequencyToMidi, midiToFrequency } from '../lib/noteMapping';
import {
  generateVocalTone,
  generateVibrato,
  addNoise,
  VOCAL_RANGES,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 4096;
const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('Vocals — Male Range (Bass to Tenor)', () => {
  describe('Bass voice (E2–E4)', () => {
    const bassNotes = [
      { note: 'E2', midi: 40 },
      { note: 'G2', midi: 43 },
      { note: 'A2', midi: 45 },
      { note: 'C3', midi: 48 },
      { note: 'E3', midi: 52 },
      { note: 'G3', midi: 55 },
      { note: 'A3', midi: 57 },
      { note: 'C4', midi: 60 },
      { note: 'E4', midi: 64 },
    ];

    for (const n of bassNotes) {
      const freq = midiToFrequency(n.midi);
      it(`${n.note} (${Math.round(freq)} Hz)`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Tenor voice (C3–C5)', () => {
    const tenorNotes = [
      { note: 'C3', midi: 48 },
      { note: 'E3', midi: 52 },
      { note: 'G3', midi: 55 },
      { note: 'A3', midi: 57 },
      { note: 'C4', midi: 60 },
      { note: 'E4', midi: 64 },
      { note: 'G4', midi: 67 },
      { note: 'A4', midi: 69 },
      { note: 'C5', midi: 72 },
    ];

    for (const n of tenorNotes) {
      const freq = midiToFrequency(n.midi);
      it(`${n.note} (${Math.round(freq)} Hz)`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Vocals — Female Range (Alto to Soprano)', () => {
  describe('Alto voice (F3–F5)', () => {
    const altoNotes = [
      { note: 'F3', midi: 53 },
      { note: 'A3', midi: 57 },
      { note: 'C4', midi: 60 },
      { note: 'E4', midi: 64 },
      { note: 'G4', midi: 67 },
      { note: 'A4', midi: 69 },
      { note: 'C5', midi: 72 },
      { note: 'E5', midi: 76 },
      { note: 'F5', midi: 77 },
    ];

    for (const n of altoNotes) {
      const freq = midiToFrequency(n.midi);
      it(`${n.note} (${Math.round(freq)} Hz)`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Soprano voice (C4–C6)', () => {
    const sopranoNotes = [
      { note: 'C4', midi: 60 },
      { note: 'E4', midi: 64 },
      { note: 'G4', midi: 67 },
      { note: 'A4', midi: 69 },
      { note: 'C5', midi: 72 },
      { note: 'E5', midi: 76 },
      { note: 'G5', midi: 79 },
      { note: 'A5', midi: 81 },
      { note: 'C6', midi: 84 },
    ];

    for (const n of sopranoNotes) {
      const freq = midiToFrequency(n.midi);
      it(`${n.note} (${Math.round(freq)} Hz)`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Vocals — Vibrato Detection', () => {
  // Vibrato should still detect the center pitch
  const vibratoTests = [
    { note: 'A3', freq: 220.00, rate: 5, depth: 30 },   // Standard vibrato
    { note: 'A4', freq: 440.00, rate: 6, depth: 40 },   // Wider vibrato
    { note: 'E4', freq: 329.63, rate: 5, depth: 20 },   // Narrow vibrato
    { note: 'C5', freq: 523.25, rate: 7, depth: 50 },   // Fast wide vibrato
    { note: 'G3', freq: 196.00, rate: 4, depth: 25 },   // Slow vibrato
  ];

  for (const v of vibratoTests) {
    it(`${v.note} with vibrato (rate=${v.rate}Hz, depth=${v.depth}cents)`, () => {
      const buffer = generateVibrato(v.freq, v.rate, v.depth, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      // Vibrato may cause slight pitch deviation, accept ±1 semitone
      const expectedMidi = frequencyToMidi(v.freq);
      const detectedMidi = result.frequency > 0 ? frequencyToMidi(result.frequency) : -100;
      expect(Math.abs(detectedMidi - expectedMidi)).toBeLessThanOrEqual(1);
    });
  }
});

describe('Vocals — isLikelyVocal classification', () => {
  it('classifies vocal range frequencies as vocal', () => {
    expect(isLikelyVocal(220, 0.05)).toBe(true);   // A3
    expect(isLikelyVocal(440, 0.05)).toBe(true);   // A4
    expect(isLikelyVocal(880, 0.05)).toBe(true);   // A5
    expect(isLikelyVocal(130, 0.05)).toBe(true);   // C3
    expect(isLikelyVocal(1046, 0.05)).toBe(true);  // C6
  });

  it('rejects frequencies outside vocal range', () => {
    expect(isLikelyVocal(50, 0.05)).toBe(false);    // Too low
    expect(isLikelyVocal(2000, 0.05)).toBe(false);  // Too high
    expect(isLikelyVocal(4000, 0.05)).toBe(false);  // Way too high
  });

  it('rejects quiet signals even in vocal range', () => {
    expect(isLikelyVocal(440, 0.01)).toBe(false);   // Below RMS threshold
    expect(isLikelyVocal(440, 0.005)).toBe(false);  // Way below threshold
  });
});

describe('Vocals — Song Melody Simulations', () => {
  describe('Bohemian Rhapsody — "Is this the real life" (Bb Major)', () => {
    const melody = [
      { note: 'A#4', midi: 70 },  // "Is"
      { note: 'A#4', midi: 70 },  // "this"
      { note: 'A#4', midi: 70 },  // "the"
      { note: 'A4', midi: 69 },   // "real"
      { note: 'G4', midi: 67 },   // "life"
      { note: 'A4', midi: 69 },   // "Is"
      { note: 'A4', midi: 69 },   // "this"
      { note: 'A4', midi: 69 },   // "just"
      { note: 'G#4', midi: 68 },  // "fan"
      { note: 'G4', midi: 67 },   // "ta"
      { note: 'F4', midi: 65 },   // "sy"
    ];

    for (let i = 0; i < melody.length; i++) {
      const n = melody[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Hallelujah — Leonard Cohen (C Major)', () => {
    const melody = [
      { note: 'E4', midi: 64 },
      { note: 'E4', midi: 64 },
      { note: 'E4', midi: 64 },
      { note: 'E4', midi: 64 },
      { note: 'F4', midi: 65 },
      { note: 'F4', midi: 65 },
      { note: 'E4', midi: 64 },
      { note: 'D4', midi: 62 },
      { note: 'C4', midi: 60 },
      { note: 'C4', midi: 60 },
      { note: 'D4', midi: 62 },
      { note: 'E4', midi: 64 },
    ];

    for (let i = 0; i < melody.length; i++) {
      const n = melody[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Someone Like You — Adele (A Major, female range)', () => {
    const melody = [
      { note: 'E4', midi: 64 },
      { note: 'C#4', midi: 61 },
      { note: 'A3', midi: 57 },
      { note: 'E4', midi: 64 },
      { note: 'C#4', midi: 61 },
      { note: 'B3', midi: 59 },
      { note: 'A3', midi: 57 },
      { note: 'E4', midi: 64 },
      { note: 'F#4', midi: 66 },
      { note: 'E4', midi: 64 },
    ];

    for (let i = 0; i < melody.length; i++) {
      const n = melody[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Nessun Dorma — Pavarotti (G Major, tenor high notes)', () => {
    const melody = [
      { note: 'B4', midi: 71 },
      { note: 'A4', midi: 69 },
      { note: 'G4', midi: 67 },
      { note: 'F#4', midi: 66 },
      { note: 'G4', midi: 67 },
      { note: 'A4', midi: 69 },
      { note: 'B4', midi: 71 },
    ];

    for (let i = 0; i < melody.length; i++) {
      const n = melody[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Vocals — With Background Noise', () => {
  const testNotes = [
    { note: 'A3', midi: 57 },
    { note: 'C4', midi: 60 },
    { note: 'E4', midi: 64 },
    { note: 'A4', midi: 69 },
    { note: 'C5', midi: 72 },
  ];

  for (const n of testNotes) {
    const freq = midiToFrequency(n.midi);
    it(`${n.note} with crowd noise`, () => {
      const clean = generateVocalTone(freq, 0.5, BUFFER_SIZE, SR);
      const noisy = addNoise(clean, 0.06);
      const result = detectPitch(noisy, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});
