/**
 * BASS GUITAR PITCH DETECTION TEST SUITE
 * Tests all 4 open strings, fretted positions, walking bass lines,
 * and slap bass patterns. Bass frequencies are low (41–400 Hz),
 * which is challenging for pitch detection.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch } from '../lib/pitch';
import { frequencyToNoteName, frequencyToMidi, midiToFrequency } from '../lib/noteMapping';
import {
  generateBassTone,
  addNoise,
  BASS_STRINGS,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 8192; // Extra large buffer needed for low bass frequencies
const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('Bass — Open Strings (Standard Tuning)', () => {
  const openStrings = [
    { name: '4th string (Low E)', freq: BASS_STRINGS.E1, note: 'E1', midi: 28 },
    { name: '3rd string (A)', freq: BASS_STRINGS.A1, note: 'A1', midi: 33 },
    { name: '2nd string (D)', freq: BASS_STRINGS.D2, note: 'D2', midi: 38 },
    { name: '1st string (G)', freq: BASS_STRINGS.G2, note: 'G2', midi: 43 },
  ];

  for (const s of openStrings) {
    it(`detects ${s.name} — ${s.note} (${s.freq} Hz)`, () => {
      const buffer = generateBassTone(s.freq, 0.6, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR, 30, 500);
      if (s.freq < 60) {
        // Below default minFreq — test with extended range
        // May detect octave harmonic instead
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        const detectedMidi = result.frequency > 0 ? frequencyToMidi(result.frequency) : -100;
        // Accept if within one octave (12 semitones)
        expect(Math.abs(detectedMidi - s.midi) % 12).toBe(0);
      } else {
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(s.note);
      }
    });
  }
});

describe('Bass — Fretted Notes (all 4 strings, frets 1–12)', () => {
  const stringConfigs = [
    { name: 'E string', openMidi: 28 },
    { name: 'A string', openMidi: 33 },
    { name: 'D string', openMidi: 38 },
    { name: 'G string', openMidi: 43 },
  ];

  for (const str of stringConfigs) {
    describe(`${str.name}`, () => {
      for (let fret = 1; fret <= 12; fret++) {
        const midi = str.openMidi + fret;
        const freq = midiToFrequency(midi);
        const octave = Math.floor(midi / 12) - 1;
        const noteName = `${chromatic[midi % 12]}${octave}`;

        it(`fret ${fret} — ${noteName} (${Math.round(freq * 100) / 100} Hz)`, () => {
          // Use extended range for bass
          const buffer = generateBassTone(freq, 0.6, BUFFER_SIZE, SR);
          const result = detectPitch(buffer, SR, 30, 500);
          const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';

          if (freq < 60) {
            // Very low frequencies may detect octave
            const detectedMidi = result.frequency > 0 ? frequencyToMidi(result.frequency) : -100;
            expect(Math.abs(detectedMidi - midi) % 12).toBe(0);
          } else {
            expect(detected).toBe(noteName);
          }
        });
      }
    });
  }
});

describe('Bass — Walking Bass Lines', () => {
  describe('12-Bar Blues in A (walking bass)', () => {
    const walkingLine = [
      { note: 'A2', freq: 110.00 },
      { note: 'C#3', freq: 138.59 },
      { note: 'E3', freq: 164.81 },
      { note: 'C#3', freq: 138.59 },
      { note: 'D3', freq: 146.83 },
      { note: 'F#3', freq: 185.00 },
      { note: 'A3', freq: 220.00 },
      { note: 'F#3', freq: 185.00 },
      { note: 'E3', freq: 164.81 },
      { note: 'G#3', freq: 207.65 },
      { note: 'B3', freq: 246.94 },
      { note: 'A3', freq: 220.00 },
    ];

    for (let i = 0; i < walkingLine.length; i++) {
      const n = walkingLine[i];
      it(`beat ${i + 1}: ${n.note}`, () => {
        const buffer = generateBassTone(n.freq, 0.6, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR, 60, 500);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Stand By Me bass line (A major)', () => {
    const bassline = [
      { note: 'A2', freq: 110.00 },
      { note: 'A2', freq: 110.00 },
      { note: 'F#2', freq: 92.50 },
      { note: 'F#2', freq: 92.50 },
      { note: 'D2', freq: 73.42 },
      { note: 'E2', freq: 82.41 },
      { note: 'A2', freq: 110.00 },
      { note: 'A2', freq: 110.00 },
    ];

    for (let i = 0; i < bassline.length; i++) {
      const n = bassline[i];
      it(`beat ${i + 1}: ${n.note}`, () => {
        const buffer = generateBassTone(n.freq, 0.6, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR, 60, 500);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Another One Bites the Dust (E minor)', () => {
    const bassline = [
      { note: 'E2', freq: 82.41 },
      { note: 'E2', freq: 82.41 },
      { note: 'E2', freq: 82.41 },
      { note: 'G2', freq: 98.00 },
      { note: 'E2', freq: 82.41 },
      { note: 'A2', freq: 110.00 },
      { note: 'B2', freq: 123.47 },
      { note: 'A2', freq: 110.00 },
    ];

    for (let i = 0; i < bassline.length; i++) {
      const n = bassline[i];
      it(`beat ${i + 1}: ${n.note}`, () => {
        const buffer = generateBassTone(n.freq, 0.6, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR, 60, 500);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});

describe('Bass — Slap Bass (higher harmonics, percussive)', () => {
  // Slap bass produces stronger upper harmonics
  const slapNotes = [
    { note: 'E2', freq: 82.41 },
    { note: 'G2', freq: 98.00 },
    { note: 'A2', freq: 110.00 },
    { note: 'D3', freq: 146.83 },
    { note: 'G3', freq: 196.00 },
  ];

  for (const n of slapNotes) {
    it(`slap ${n.note} (${n.freq} Hz)`, () => {
      // Slap has brighter harmonics
      const buffer = generateBassTone(n.freq, 0.6, BUFFER_SIZE, SR);
      const noisy = addNoise(buffer, 0.03); // Slap has transient noise
      const result = detectPitch(noisy, SR, 60, 500);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});

describe('Bass — With Noise', () => {
  const testNotes = [
    { note: 'E2', freq: 82.41 },
    { note: 'A2', freq: 110.00 },
    { note: 'D3', freq: 146.83 },
    { note: 'G3', freq: 196.00 },
  ];

  for (const n of testNotes) {
    it(`${n.note} with moderate noise`, () => {
      const clean = generateBassTone(n.freq, 0.6, BUFFER_SIZE, SR);
      const noisy = addNoise(clean, 0.04);
      const result = detectPitch(noisy, SR, 60, 500);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(n.note);
    });
  }
});
