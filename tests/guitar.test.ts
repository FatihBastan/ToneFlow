/**
 * GUITAR PITCH DETECTION TEST SUITE
 * Tests all 6 open strings, fretted notes across the neck,
 * common chords (as individual notes), with and without noise.
 * Uses guitar-like harmonic profiles for realism.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch } from '../lib/pitch';
import { frequencyToNoteName, frequencyToMidi } from '../lib/noteMapping';
import {
  generateGuitarTone,
  generateSineWave,
  addNoise,
  GUITAR_STRINGS,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 4096; // Larger buffer for low guitar frequencies

// Helper: test a frequency and check if detected note matches expected
function testNote(
  label: string,
  expectedFreq: number,
  expectedNote: string,
  generator: (freq: number) => Float32Array
) {
  const buffer = generator(expectedFreq);
  const result = detectPitch(buffer, SR);
  const detectedNote = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
  const centsOff = result.frequency > 0
    ? Math.round(1200 * Math.log2(result.frequency / expectedFreq))
    : null;

  return {
    label,
    expectedFreq,
    expectedNote,
    detectedFreq: Math.round(result.frequency * 100) / 100,
    detectedNote,
    clarity: Math.round(result.clarity * 1000) / 1000,
    centsOff,
    correct: detectedNote === expectedNote,
  };
}

describe('Guitar — Open Strings (Standard Tuning)', () => {
  const openStrings = [
    { name: '6th string (Low E)', freq: GUITAR_STRINGS.E2, note: 'E2' },
    { name: '5th string (A)', freq: GUITAR_STRINGS.A2, note: 'A2' },
    { name: '4th string (D)', freq: GUITAR_STRINGS.D3, note: 'D3' },
    { name: '3rd string (G)', freq: GUITAR_STRINGS.G3, note: 'G3' },
    { name: '2nd string (B)', freq: GUITAR_STRINGS.B3, note: 'B3' },
    { name: '1st string (High E)', freq: GUITAR_STRINGS.E4, note: 'E4' },
  ];

  for (const s of openStrings) {
    it(`detects ${s.name} — ${s.note} (${s.freq} Hz)`, () => {
      const result = testNote(s.name, s.freq, s.note, (f) =>
        generateGuitarTone(f, 0.5, BUFFER_SIZE, SR)
      );
      expect(result.correct).toBe(true);
      expect(result.clarity).toBeGreaterThan(0.5);
    });
  }
});

describe('Guitar — Fretted Notes (1st–12th fret on each string)', () => {
  // All notes from open to 12th fret for each string
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const stringConfigs = [
    { name: 'Low E string', openMidi: 40 }, // E2
    { name: 'A string', openMidi: 45 },     // A2
    { name: 'D string', openMidi: 50 },     // D3
    { name: 'G string', openMidi: 55 },     // G3
    { name: 'B string', openMidi: 59 },     // B3
    { name: 'High E string', openMidi: 64 },// E4
  ];

  for (const str of stringConfigs) {
    describe(`${str.name}`, () => {
      for (let fret = 1; fret <= 12; fret++) {
        const midi = str.openMidi + fret;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const octave = Math.floor(midi / 12) - 1;
        const noteName = `${chromatic[midi % 12]}${octave}`;

        it(`fret ${fret} — ${noteName} (${Math.round(freq * 100) / 100} Hz)`, () => {
          const buffer = generateGuitarTone(freq, 0.5, BUFFER_SIZE, SR);
          const result = detectPitch(buffer, SR);
          const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
          expect(detected).toBe(noteName);
        });
      }
    });
  }
});

describe('Guitar — Common Chord Notes (individual pitches)', () => {
  // Test individual notes that form common guitar chords
  const chordNotes = [
    // E Major chord tones
    { chord: 'E Major', note: 'E2', freq: 82.41 },
    { chord: 'E Major', note: 'B2', freq: 123.47 },
    { chord: 'E Major', note: 'E3', freq: 164.81 },
    { chord: 'E Major', note: 'G#3', freq: 207.65 },
    { chord: 'E Major', note: 'B3', freq: 246.94 },
    { chord: 'E Major', note: 'E4', freq: 329.63 },
    // A Minor chord tones
    { chord: 'A Minor', note: 'A2', freq: 110.00 },
    { chord: 'A Minor', note: 'E3', freq: 164.81 },
    { chord: 'A Minor', note: 'A3', freq: 220.00 },
    { chord: 'A Minor', note: 'C4', freq: 261.63 },
    { chord: 'A Minor', note: 'E4', freq: 329.63 },
    // G Major chord tones
    { chord: 'G Major', note: 'G2', freq: 98.00 },
    { chord: 'G Major', note: 'B2', freq: 123.47 },
    { chord: 'G Major', note: 'D3', freq: 146.83 },
    { chord: 'G Major', note: 'G3', freq: 196.00 },
    { chord: 'G Major', note: 'B3', freq: 246.94 },
    { chord: 'G Major', note: 'G4', freq: 392.00 },
    // C Major chord tones
    { chord: 'C Major', note: 'C3', freq: 130.81 },
    { chord: 'C Major', note: 'E3', freq: 164.81 },
    { chord: 'C Major', note: 'G3', freq: 196.00 },
    { chord: 'C Major', note: 'C4', freq: 261.63 },
    { chord: 'C Major', note: 'E4', freq: 329.63 },
    // D Major chord tones
    { chord: 'D Major', note: 'D3', freq: 146.83 },
    { chord: 'D Major', note: 'A3', freq: 220.00 },
    { chord: 'D Major', note: 'D4', freq: 293.66 },
    { chord: 'D Major', note: 'F#4', freq: 369.99 },
  ];

  for (const cn of chordNotes) {
    it(`${cn.chord} — ${cn.note} (${cn.freq} Hz)`, () => {
      const buffer = generateGuitarTone(cn.freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(cn.note);
    });
  }
});

describe('Guitar — With Realistic Noise', () => {
  const noiseLevels = [
    { label: 'Low noise (SNR ~30dB)', noiseAmp: 0.015 },
    { label: 'Medium noise (SNR ~20dB)', noiseAmp: 0.05 },
    { label: 'High noise (SNR ~14dB)', noiseAmp: 0.1 },
  ];

  const testFreqs = [
    { note: 'E2', freq: 82.41 },
    { note: 'A3', freq: 220.00 },
    { note: 'E4', freq: 329.63 },
  ];

  for (const noise of noiseLevels) {
    describe(noise.label, () => {
      for (const t of testFreqs) {
        it(`${t.note} (${t.freq} Hz)`, () => {
          const clean = generateGuitarTone(t.freq, 0.5, BUFFER_SIZE, SR);
          const noisy = addNoise(clean, noise.noiseAmp);
          const result = detectPitch(noisy, SR);
          const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
          // At high noise, we accept if it's within 1 semitone
          if (noise.noiseAmp <= 0.05) {
            expect(detected).toBe(t.note);
          } else {
            const expectedMidi = frequencyToMidi(t.freq);
            const detectedMidi = result.frequency > 0 ? frequencyToMidi(result.frequency) : -100;
            expect(Math.abs(detectedMidi - expectedMidi)).toBeLessThanOrEqual(1);
          }
        });
      }
    });
  }
});

describe('Guitar — High Fret Positions (12th–24th fret, High E string)', () => {
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const openMidi = 64; // E4

  for (let fret = 12; fret <= 24; fret++) {
    const midi = openMidi + fret;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const octave = Math.floor(midi / 12) - 1;
    const noteName = `${chromatic[midi % 12]}${octave}`;

    it(`fret ${fret} — ${noteName} (${Math.round(freq)} Hz)`, () => {
      const buffer = generateGuitarTone(freq, 0.5, BUFFER_SIZE, SR);
      const result = detectPitch(buffer, SR);
      const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
      expect(detected).toBe(noteName);
    });
  }
});

describe('Guitar — Song Simulations', () => {
  // Simulate playing recognizable note sequences
  describe('Smoke on the Water riff (G minor pentatonic)', () => {
    const riffNotes = [
      { note: 'G3', freq: 196.00 },
      { note: 'A#3', freq: 233.08 },
      { note: 'C4', freq: 261.63 },
      { note: 'G3', freq: 196.00 },
      { note: 'A#3', freq: 233.08 },
      { note: 'C#4', freq: 277.18 },
      { note: 'C4', freq: 261.63 },
      { note: 'G3', freq: 196.00 },
      { note: 'A#3', freq: 233.08 },
      { note: 'C4', freq: 261.63 },
      { note: 'A#3', freq: 233.08 },
      { note: 'G3', freq: 196.00 },
    ];

    for (let i = 0; i < riffNotes.length; i++) {
      const n = riffNotes[i];
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateGuitarTone(n.freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Seven Nation Army riff (E minor)', () => {
    const riffNotes = [
      { note: 'E3', freq: 164.81 },
      { note: 'E3', freq: 164.81 },
      { note: 'G3', freq: 196.00 },
      { note: 'E3', freq: 164.81 },
      { note: 'D3', freq: 146.83 },
      { note: 'C3', freq: 130.81 },
      { note: 'B2', freq: 123.47 },
    ];

    for (let i = 0; i < riffNotes.length; i++) {
      const n = riffNotes[i];
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateGuitarTone(n.freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Nothing Else Matters intro (E minor)', () => {
    const notes = [
      { note: 'E3', freq: 164.81 },
      { note: 'G3', freq: 196.00 },
      { note: 'B3', freq: 246.94 },
      { note: 'E4', freq: 329.63 },
      { note: 'B3', freq: 246.94 },
      { note: 'G3', freq: 196.00 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateGuitarTone(n.freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });

  describe('Stairway to Heaven intro (A minor)', () => {
    const notes = [
      { note: 'A2', freq: 110.00 },
      { note: 'C3', freq: 130.81 },
      { note: 'E3', freq: 164.81 },
      { note: 'A3', freq: 220.00 },
      { note: 'B3', freq: 246.94 },
      { note: 'E3', freq: 164.81 },
      { note: 'C3', freq: 130.81 },
      { note: 'B3', freq: 246.94 },
      { note: 'C4', freq: 261.63 },
      { note: 'E3', freq: 164.81 },
    ];

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      it(`note ${i + 1}: ${n.note}`, () => {
        const buffer = generateGuitarTone(n.freq, 0.5, BUFFER_SIZE, SR);
        const result = detectPitch(buffer, SR);
        const detected = result.frequency > 0 ? frequencyToNoteName(result.frequency) : 'NONE';
        expect(detected).toBe(n.note);
      });
    }
  });
});
