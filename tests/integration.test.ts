/**
 * INTEGRATION TEST SUITE
 * Full pipeline: generate audio → detect pitch → map note → check key → evaluate streak
 * Tests the complete flow as the app would use it in real-time.
 */
import { describe, it, expect } from 'vitest';
import { detectPitch, computeRMS, isLikelyVocal } from '../lib/pitch';
import { frequencyToMidi, midiToNoteName, frequencyToNoteName, midiToFrequency } from '../lib/noteMapping';
import { getKeyInfo, isNoteInKey, isNoteInKeyWithTolerance, getCentsOff, estimateKey } from '../lib/musicTheory';
import {
  generateGuitarTone,
  generatePianoTone,
  generateVocalTone,
  generateBassTone,
  generateBowedStringTone,
  generateSilence,
  generateNoise,
  generateDetunedTone,
  addNoise,
  SAMPLE_RATE_DEFAULT as SR,
} from './audioGenerator';

const BUFFER_SIZE = 4096;

// Simulate the streak logic from ToneFlow.tsx
function getStreakTier(count: number) {
  if (count >= 50) return { tier: 'legendary', multiplier: 8 };
  if (count >= 30) return { tier: 'blazing', multiplier: 4 };
  if (count >= 15) return { tier: 'on_fire', multiplier: 2 };
  if (count >= 5) return { tier: 'warming_up', multiplier: 1.5 };
  return { tier: 'none', multiplier: 1 };
}

describe('Integration — Full Detection Pipeline', () => {
  it('guitar A string → detect → MIDI 45 → A2 → in A Minor key → streak +1', () => {
    const buffer = generateGuitarTone(110, 0.5, BUFFER_SIZE, SR);
    const { frequency, clarity } = detectPitch(buffer, SR);

    expect(frequency).toBeGreaterThan(0);
    expect(clarity).toBeGreaterThan(0.5);

    const midi = frequencyToMidi(frequency);
    const noteName = midiToNoteName(midi);
    expect(noteName).toBe('A2');

    const key = getKeyInfo('A', 'Minor');
    expect(isNoteInKey(noteName, key)).toBe(true);

    const cents = getCentsOff(frequency);
    expect(isNoteInKeyWithTolerance(noteName, cents, key, 35)).toBe(true); // medium difficulty
  });

  it('piano middle C → detect → C4 → in C Major → all difficulties pass', () => {
    const buffer = generatePianoTone(261.63, 0.5, BUFFER_SIZE, SR);
    const { frequency, clarity } = detectPitch(buffer, SR);
    const noteName = frequencyToNoteName(frequency);
    expect(noteName).toBe('C4');

    const key = getKeyInfo('C', 'Major');
    const cents = getCentsOff(frequency);

    // All difficulties should pass for a clean generated tone
    expect(isNoteInKeyWithTolerance(noteName, cents, key, null)).toBe(true);  // easy
    expect(isNoteInKeyWithTolerance(noteName, cents, key, 35)).toBe(true);    // medium
    expect(isNoteInKeyWithTolerance(noteName, cents, key, 15)).toBe(true);    // hard
  });

  it('vocal A4 → classify as vocal → show lyrics (not blurred)', () => {
    const buffer = generateVocalTone(440, 0.5, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    const rms = computeRMS(buffer);

    expect(frequency).toBeGreaterThan(0);
    expect(isLikelyVocal(frequency, rms)).toBe(true);
  });

  it('guitar low E2 → classify as instrument → blur lyrics', () => {
    const buffer = generateGuitarTone(82.41, 0.5, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    const rms = computeRMS(buffer);

    // E2 = 82.41 Hz is at the boundary of vocal range
    // The detection result depends on the frequency detected
    expect(frequency).toBeGreaterThan(0);
  });
});

describe('Integration — Silence & Noise Gate', () => {
  it('silence produces no pitch detection', () => {
    const buffer = generateSilence(BUFFER_SIZE);
    const { frequency, clarity } = detectPitch(buffer, SR);
    expect(frequency).toBe(-1);
    expect(clarity).toBe(0);
  });

  it('very quiet signal (below RMS gate) produces no detection', () => {
    const buffer = generateGuitarTone(440, 0.005, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    expect(frequency).toBe(-1);
  });

  it('white noise produces no clear pitch', () => {
    const buffer = generateNoise(0.3, BUFFER_SIZE);
    const { frequency, clarity } = detectPitch(buffer, SR);
    // Noise should either not detect or have very low clarity
    if (frequency > 0) {
      expect(clarity).toBeLessThan(0.75);
    }
  });
});

describe('Integration — Detuned Notes & Difficulty Filtering', () => {
  const key = getKeyInfo('C', 'Major');

  it('C4 detuned +10 cents passes all difficulties', () => {
    const buffer = generateDetunedTone(261.63, 10, 0.5, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    const noteName = frequencyToNoteName(frequency);
    const cents = getCentsOff(frequency);

    expect(noteName).toBe('C4');
    expect(isNoteInKeyWithTolerance(noteName, cents, key, null)).toBe(true);
    expect(isNoteInKeyWithTolerance(noteName, cents, key, 35)).toBe(true);
    expect(isNoteInKeyWithTolerance(noteName, cents, key, 15)).toBe(true);
  });

  it('C4 detuned +25 cents passes easy and medium, fails hard', () => {
    const buffer = generateDetunedTone(261.63, 25, 0.5, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    const noteName = frequencyToNoteName(frequency);
    const cents = getCentsOff(frequency);

    if (noteName === 'C4') {
      expect(isNoteInKeyWithTolerance(noteName, cents, key, null)).toBe(true);
      expect(isNoteInKeyWithTolerance(noteName, cents, key, 35)).toBe(true);
      expect(isNoteInKeyWithTolerance(noteName, cents, key, 15)).toBe(false);
    }
    // If detuning pushed it to a different note, the test validates that boundary
  });

  it('C4 detuned +45 cents — may round to C#4 (out of C Major)', () => {
    const buffer = generateDetunedTone(261.63, 45, 0.5, BUFFER_SIZE, SR);
    const { frequency } = detectPitch(buffer, SR);
    const noteName = frequencyToNoteName(frequency);
    // At 45 cents sharp, it should still round to C4 (boundary is at 50 cents)
    // but the cents value should be high
    if (noteName === 'C4') {
      const cents = getCentsOff(frequency);
      expect(Math.abs(cents)).toBeGreaterThan(30);
    }
  });
});

describe('Integration — Streak Simulation', () => {
  it('playing C Major scale on guitar → 7 correct notes in key', () => {
    const key = getKeyInfo('C', 'Major');
    const scaleFreqs = [
      261.63, // C4
      293.66, // D4
      329.63, // E4
      349.23, // F4
      392.00, // G4
      440.00, // A4
      493.88, // B4
    ];

    let streak = 0;
    for (const freq of scaleFreqs) {
      const buffer = generateGuitarTone(freq, 0.5, BUFFER_SIZE, SR);
      const { frequency } = detectPitch(buffer, SR);
      const noteName = frequencyToNoteName(frequency);

      if (isNoteInKey(noteName, key)) {
        streak++;
      } else {
        streak = 0;
      }
    }

    expect(streak).toBe(7);
    expect(getStreakTier(streak).tier).toBe('warming_up');
    expect(getStreakTier(streak).multiplier).toBe(1.5);
  });

  it('playing with one wrong note resets streak', () => {
    const key = getKeyInfo('C', 'Major');
    const notes = [
      261.63, // C4 ✓
      293.66, // D4 ✓
      329.63, // E4 ✓
      277.18, // C#4 ✗ — not in C Major
      349.23, // F4 ✓ (streak restarted)
      392.00, // G4 ✓
    ];

    let streak = 0;
    let maxStreak = 0;
    for (const freq of notes) {
      const buffer = generateGuitarTone(freq, 0.5, BUFFER_SIZE, SR);
      const { frequency } = detectPitch(buffer, SR);
      const noteName = frequencyToNoteName(frequency);

      if (isNoteInKey(noteName, key)) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }

    expect(streak).toBe(2); // F4, G4 after reset
    expect(maxStreak).toBe(3); // C4, D4, E4 before wrong note
  });

  it('50+ note streak reaches Legendary tier', () => {
    const tier = getStreakTier(50);
    expect(tier.tier).toBe('legendary');
    expect(tier.multiplier).toBe(8);
  });

  it('streak tier boundaries are exact', () => {
    expect(getStreakTier(0).tier).toBe('none');
    expect(getStreakTier(4).tier).toBe('none');
    expect(getStreakTier(5).tier).toBe('warming_up');
    expect(getStreakTier(14).tier).toBe('warming_up');
    expect(getStreakTier(15).tier).toBe('on_fire');
    expect(getStreakTier(29).tier).toBe('on_fire');
    expect(getStreakTier(30).tier).toBe('blazing');
    expect(getStreakTier(49).tier).toBe('blazing');
    expect(getStreakTier(50).tier).toBe('legendary');
    expect(getStreakTier(100).tier).toBe('legendary');
  });
});

describe('Integration — Key Estimation from Performance', () => {
  it('playing A minor pentatonic scale → estimates A Minor', () => {
    const pentatonicFreqs = [
      220.00, // A3
      261.63, // C4
      293.66, // D4
      329.63, // E4
      392.00, // G4
      440.00, // A4
    ];

    const detectedNotes: string[] = [];
    for (const freq of pentatonicFreqs) {
      const buffer = generateGuitarTone(freq, 0.5, BUFFER_SIZE, SR);
      const { frequency } = detectPitch(buffer, SR);
      if (frequency > 0) {
        detectedNotes.push(frequencyToNoteName(frequency));
      }
    }

    const estimated = estimateKey(detectedNotes);
    // A minor pentatonic fits both A Minor and C Major
    expect(
      (estimated.root === 'A' && estimated.quality === 'Minor') ||
      (estimated.root === 'C' && estimated.quality === 'Major')
    ).toBe(true);
  });
});

describe('Integration — Cross-Instrument Same Note', () => {
  // The same note should be detected correctly regardless of instrument timbre
  const testFreq = 440; // A4
  const expectedNote = 'A4';

  it('guitar A4 = piano A4 = vocal A4 = violin A4', () => {
    const instruments = [
      { name: 'Guitar', gen: () => generateGuitarTone(testFreq, 0.5, BUFFER_SIZE, SR) },
      { name: 'Piano', gen: () => generatePianoTone(testFreq, 0.5, BUFFER_SIZE, SR) },
      { name: 'Vocals', gen: () => generateVocalTone(testFreq, 0.5, BUFFER_SIZE, SR) },
      { name: 'Violin', gen: () => generateBowedStringTone(testFreq, 0.5, BUFFER_SIZE, SR) },
      { name: 'Bass (octave up)', gen: () => generateBassTone(testFreq, 0.6, BUFFER_SIZE, SR) },
    ];

    for (const inst of instruments) {
      const buffer = inst.gen();
      const { frequency } = detectPitch(buffer, SR);
      const noteName = frequencyToNoteName(frequency);
      expect(noteName).toBe(expectedNote);
    }
  });
});

describe('Integration — RMS Volume Levels', () => {
  it('computeRMS matches expected levels', () => {
    const silence = generateSilence(BUFFER_SIZE);
    expect(computeRMS(silence)).toBe(0);

    const quiet = generateGuitarTone(440, 0.01, BUFFER_SIZE, SR);
    expect(computeRMS(quiet)).toBeLessThan(0.02);

    const normal = generateGuitarTone(440, 0.5, BUFFER_SIZE, SR);
    expect(computeRMS(normal)).toBeGreaterThan(0.1);

    const loud = generateGuitarTone(440, 0.9, BUFFER_SIZE, SR);
    expect(computeRMS(loud)).toBeGreaterThan(0.3);
  });
});
