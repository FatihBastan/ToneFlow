/**
 * BOWED STRINGS (VIOLIN & CELLO) PITCH DETECTION TEST SUITE
 * Tests open strings, fingerboard positions, and classical repertoire.
 * Bowed strings have rich sawtooth-like harmonic content.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch } from '../lib/pitch';
import { frequencyToNoteName, frequencyToMidi, midiToFrequency } from '../lib/noteMapping';
import {
  generateBowedStringTone,
  generateVibrato,
  addNoise,
  VIOLIN_STRINGS,
  CELLO_STRINGS,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 4096;
const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('Violin — Open Strings', () => {
  const strings = [
    { name: 'G string', freq: VIOLIN_STRINGS.G3, note: 'G3' },
    { name: 'D string', freq: VIOLIN_STRINGS.D4, note: 'D4' },
    { name: 'A string', freq: VIOLIN_STRINGS.A4, note: 'A4' },
    { name: 'E string', freq: VIOLIN_STRINGS.E5, note: 'E5' },
  ];

  for (const s of strings) {
    it(`${s.name} — ${s.note} (${s.freq} Hz)`, () => {
      const buffer = generateBowedStringTone(s.freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(s.note);
    });
  }
});

describe('Violin — First Position (all 4 strings)', () => {
  // First position notes on each string (open to 4th finger)
  const firstPosition = [
    // G string: G3 A3 B3 C4 D4
    { note: 'A3', midi: 57 },
    { note: 'B3', midi: 59 },
    { note: 'C4', midi: 60 },
    { note: 'D4', midi: 62 },
    // D string: D4 E4 F4 G4 A4
    { note: 'E4', midi: 64 },
    { note: 'F4', midi: 65 },
    { note: 'G4', midi: 67 },
    { note: 'A4', midi: 69 },
    // A string: A4 B4 C5 D5 E5
    { note: 'B4', midi: 71 },
    { note: 'C5', midi: 72 },
    { note: 'D5', midi: 74 },
    { note: 'E5', midi: 76 },
    // E string: E5 F5 G5 A5 B5
    { note: 'F5', midi: 77 },
    { note: 'G5', midi: 79 },
    { note: 'A5', midi: 81 },
    { note: 'B5', midi: 83 },
  ];

  for (const n of firstPosition) {
    const freq = midiToFrequency(n.midi);
    it(`${n.note} (${Math.round(freq)} Hz)`, () => {
      const buffer = generateBowedStringTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});

describe('Violin — High Positions (3rd–7th position)', () => {
  // Higher positions on the E string
  const highNotes = [
    { note: 'C6', midi: 84 },
    { note: 'D6', midi: 86 },
    { note: 'E6', midi: 88 },
    { note: 'F6', midi: 89 },
    { note: 'G6', midi: 91 },
    { note: 'A6', midi: 93 },
  ];

  for (const n of highNotes) {
    const freq = midiToFrequency(n.midi);
    it(`${n.note} (${Math.round(freq)} Hz)`, () => {
      const buffer = generateBowedStringTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});

describe('Cello — Open Strings', () => {
  const strings = [
    { name: 'C string', freq: CELLO_STRINGS.C2, note: 'C2' },
    { name: 'G string', freq: CELLO_STRINGS.G2, note: 'G2' },
    { name: 'D string', freq: CELLO_STRINGS.D3, note: 'D3' },
    { name: 'A string', freq: CELLO_STRINGS.A3, note: 'A3' },
  ];

  for (const s of strings) {
    it(`${s.name} — ${s.note} (${s.freq} Hz)`, () => {
      const buffer = generateBowedStringTone(s.freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(s.note);
    });
  }
});

describe('Cello — First Position', () => {
  const celloPosNotes = [
    { note: 'D2', midi: 38 },
    { note: 'E2', midi: 40 },
    { note: 'F2', midi: 41 },
    { note: 'A2', midi: 45 },
    { note: 'B2', midi: 47 },
    { note: 'C3', midi: 48 },
    { note: 'E3', midi: 52 },
    { note: 'F3', midi: 53 },
    { note: 'G3', midi: 55 },
    { note: 'B3', midi: 59 },
    { note: 'C4', midi: 60 },
    { note: 'D4', midi: 62 },
  ];

  for (const n of celloPosNotes) {
    const freq = midiToFrequency(n.midi);
    it(`${n.note} (${Math.round(freq * 10) / 10} Hz)`, () => {
      const buffer = generateBowedStringTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});

describe('Strings — With Vibrato (bowed string characteristic)', () => {
  const vibratoTests = [
    { note: 'A4', freq: 440, rate: 6, depth: 35 },
    { note: 'D4', freq: 293.66, rate: 5, depth: 30 },
    { note: 'G3', freq: 196, rate: 5, depth: 25 },
    { note: 'E5', freq: 659.26, rate: 6, depth: 40 },
  ];

  for (const v of vibratoTests) {
    it(`${v.note} with vibrato (${v.rate}Hz, ${v.depth}cents)`, () => {
      const buffer = generateVibrato(v.freq, v.rate, v.depth, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const expectedMidi = frequencyToMidi(v.freq);
      const detectedMidi = result.frequency > 0 ? frequencyToMidi(result.frequency) : -100;
      expect(Math.abs(detectedMidi - expectedMidi)).toBeLessThanOrEqual(1);
    });
  }
});

describe('Strings — Song Simulations', () => {
  describe('Bach Cello Suite No.1 Prelude (G Major)', () => {
    const notes = [
      { note: 'G2', midi: 43 },
      { note: 'D3', midi: 50 },
      { note: 'B3', midi: 59 },
      { note: 'A3', midi: 57 },
      { note: 'B3', midi: 59 },
      { note: 'D3', midi: 50 },
      { note: 'B3', midi: 59 },
      { note: 'D3', midi: 50 },
      { note: 'G2', midi: 43 },
      { note: 'D3', midi: 50 },
      { note: 'B3', midi: 59 },
      { note: 'A3', midi: 57 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateBowedStringTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Pachelbel Canon in D (violin part)', () => {
    const notes = [
      { note: 'F#5', midi: 78 },
      { note: 'E5', midi: 76 },
      { note: 'D5', midi: 74 },
      { note: 'C#5', midi: 73 },
      { note: 'B4', midi: 71 },
      { note: 'A4', midi: 69 },
      { note: 'B4', midi: 71 },
      { note: 'C#5', midi: 73 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateBowedStringTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Strings — With Noise (concert hall ambience)', () => {
  const testNotes = [
    { note: 'G3', freq: 196.00 },
    { note: 'A4', freq: 440.00 },
    { note: 'E5', freq: 659.26 },
    { note: 'D3', freq: 146.83 },
  ];

  for (const n of testNotes) {
    it(`${n.note} with ambient noise`, () => {
      const clean = generateBowedStringTone(n.freq, 0.5, BUFFER_SIZE, SR);
      const noisy = addNoise(clean, 0.04);
      const result = detectPitch(noisy, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});
