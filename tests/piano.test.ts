/**
 * PIANO PITCH DETECTION TEST SUITE
 * Tests the full piano range (A0–C8), scales, and common progressions.
 * Uses piano-like harmonic profiles with slight inharmonicity.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch } from '../lib/pitch';
import { frequencyToNoteName, frequencyToMidi, midiToFrequency } from '../lib/noteMapping';
import {
  generatePianoTone,
  addNoise,
  PIANO_RANGE,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 4096;
const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('Piano — Full Chromatic Range (within detection bounds 60–2000 Hz)', () => {
  // MIDI 36 (C2, ~65 Hz) to MIDI 96 (C7, ~2093 Hz) covers the detectable range
  // The detector has minFreq=60, maxFreq=2000
  for (let midi = 36; midi <= 95; midi++) {
    const freq = midiToFrequency(midi);
    const octave = Math.floor(midi / 12) - 1;
    const noteName = `${chromatic[midi % 12]}${octave}`;

    it(`${noteName} — MIDI ${midi} (${Math.round(freq * 100) / 100} Hz)`, () => {
      const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(noteName);
    });
  }
});

describe('Piano — C Major Scale (all octaves)', () => {
  const cMajorMidi = [
    // C2 through C6
    36, 38, 40, 41, 43, 45, 47, // C2 D2 E2 F2 G2 A2 B2
    48, 50, 52, 53, 55, 57, 59, // C3 D3 E3 F3 G3 A3 B3
    60, 62, 64, 65, 67, 69, 71, // C4 D4 E4 F4 G4 A4 B4
    72, 74, 76, 77, 79, 81, 83, // C5 D5 E5 F5 G5 A5 B5
    84, 86, 88, 89, 91, 93, 95, // C6 D6 E6 F6 G6 A6 B6
  ];

  for (const midi of cMajorMidi) {
    const freq = midiToFrequency(midi);
    const octave = Math.floor(midi / 12) - 1;
    const noteName = `${chromatic[midi % 12]}${octave}`;

    it(`${noteName} (${Math.round(freq * 100) / 100} Hz)`, () => {
      const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(noteName);
    });
  }
});

describe('Piano — Landmark Notes', () => {
  const landmarks = [
    { name: 'Middle C', note: 'C4', freq: PIANO_RANGE.C4 },
    { name: 'Concert A', note: 'A4', freq: PIANO_RANGE.A4 },
    { name: 'C5 (soprano C)', note: 'C5', freq: PIANO_RANGE.C5 },
    { name: 'C3 (bass staff)', note: 'C3', freq: PIANO_RANGE.C3 },
    { name: 'C2 (low register)', note: 'C2', freq: PIANO_RANGE.C2 },
    { name: 'C6 (high register)', note: 'C6', freq: PIANO_RANGE.C6 },
  ];

  for (const l of landmarks) {
    it(`${l.name} — ${l.note} (${l.freq} Hz)`, () => {
      const buffer = generatePianoTone(l.freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(l.note);
      expect(result.clarity).toBeGreaterThan(0.5);
    });
  }
});

describe('Piano — Black Keys (all sharps/flats)', () => {
  // All black keys in octave 4
  const blackKeys = [
    { note: 'C#4', midi: 61 },
    { note: 'D#4', midi: 63 },
    { note: 'F#4', midi: 66 },
    { note: 'G#4', midi: 68 },
    { note: 'A#4', midi: 70 },
  ];

  for (const bk of blackKeys) {
    const freq = midiToFrequency(bk.midi);
    it(`${bk.note} (${Math.round(freq * 100) / 100} Hz)`, () => {
      const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(bk.note);
    });
  }
});

describe('Piano — Song Simulations', () => {
  describe('Fur Elise opening (A minor)', () => {
    const notes = [
      { note: 'E5', midi: 76 },
      { note: 'D#5', midi: 75 },
      { note: 'E5', midi: 76 },
      { note: 'D#5', midi: 75 },
      { note: 'E5', midi: 76 },
      { note: 'B4', midi: 71 },
      { note: 'D5', midi: 74 },
      { note: 'C5', midi: 72 },
      { note: 'A4', midi: 69 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Moonlight Sonata opening (C# minor)', () => {
    const notes = [
      { note: 'G#3', midi: 56 },
      { note: 'C#4', midi: 61 },
      { note: 'E4', midi: 64 },
      { note: 'G#3', midi: 56 },
      { note: 'C#4', midi: 61 },
      { note: 'E4', midi: 64 },
      { note: 'G#3', midi: 56 },
      { note: 'C#4', midi: 61 },
      { note: 'E4', midi: 64 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Clair de Lune excerpt (Db Major)', () => {
    const notes = [
      { note: 'A#4', midi: 70 },
      { note: 'G#4', midi: 68 },
      { note: 'F4', midi: 65 },
      { note: 'C#4', midi: 61 },
      { note: 'F4', midi: 65 },
      { note: 'G#4', midi: 68 },
      { note: 'A#4', midi: 70 },
      { note: 'C5', midi: 72 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const freq = midiToFrequency(n.midi);
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Piano — With Noise', () => {
  const testMidis = [48, 60, 72, 84]; // C3, C4, C5, C6

  for (const midi of testMidis) {
    const freq = midiToFrequency(midi);
    const octave = Math.floor(midi / 12) - 1;
    const noteName = `${chromatic[midi % 12]}${octave}`;

    it(`${noteName} with moderate noise`, () => {
      const clean = generatePianoTone(freq, 0.5, BUFFER_SIZE, SR);
      const noisy = addNoise(clean, 0.05);
      const result = detectPitch(noisy, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(noteName);
    });
  }
});
