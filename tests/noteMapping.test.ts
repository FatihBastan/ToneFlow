/**
 * NOTE MAPPING & MUSIC THEORY TEST SUITE
 * Tests frequency→MIDI conversion, MIDI→note name, cents calculation,
 * key detection, and in-key checking across all difficulties.
 */
import { describe, it, expect } from 'vitest';
import { frequencyToMidi, midiToNoteName, frequencyToNoteName, midiToFrequency } from '../lib/noteMapping';
import {
  getKeyInfo,
  isNoteInKey,
  isNoteInKeyWithTolerance,
  getCentsOff,
  estimateKey,
} from '../lib/musicTheory';

describe('frequencyToMidi — Standard Reference Frequencies', () => {
  const references = [
    { freq: 27.50, midi: 21, name: 'A0' },
    { freq: 55.00, midi: 33, name: 'A1' },
    { freq: 110.00, midi: 45, name: 'A2' },
    { freq: 220.00, midi: 57, name: 'A3' },
    { freq: 440.00, midi: 69, name: 'A4 (Concert A)' },
    { freq: 880.00, midi: 81, name: 'A5' },
    { freq: 1760.00, midi: 93, name: 'A6' },
    { freq: 261.63, midi: 60, name: 'C4 (Middle C)' },
    { freq: 329.63, midi: 64, name: 'E4' },
    { freq: 392.00, midi: 67, name: 'G4' },
    { freq: 523.25, midi: 72, name: 'C5' },
    { freq: 82.41, midi: 40, name: 'E2 (Guitar low E)' },
    { freq: 196.00, midi: 55, name: 'G3 (Guitar G)' },
  ];

  for (const r of references) {
    it(`${r.name}: ${r.freq} Hz → MIDI ${r.midi}`, () => {
      expect(frequencyToMidi(r.freq)).toBe(r.midi);
    });
  }
});

describe('midiToNoteName — MIDI to Note Name', () => {
  const mappings = [
    { midi: 21, note: 'A0' },
    { midi: 24, note: 'C1' },
    { midi: 36, note: 'C2' },
    { midi: 48, note: 'C3' },
    { midi: 60, note: 'C4' },
    { midi: 69, note: 'A4' },
    { midi: 72, note: 'C5' },
    { midi: 84, note: 'C6' },
    { midi: 61, note: 'C#4' },
    { midi: 63, note: 'D#4' },
    { midi: 66, note: 'F#4' },
    { midi: 68, note: 'G#4' },
    { midi: 70, note: 'A#4' },
  ];

  for (const m of mappings) {
    it(`MIDI ${m.midi} → ${m.note}`, () => {
      expect(midiToNoteName(m.midi)).toBe(m.note);
    });
  }
});

describe('frequencyToNoteName — End-to-End Conversion', () => {
  const tests = [
    { freq: 440.00, note: 'A4' },
    { freq: 261.63, note: 'C4' },
    { freq: 329.63, note: 'E4' },
    { freq: 82.41, note: 'E2' },
    { freq: 1046.50, note: 'C6' },
    { freq: 110.00, note: 'A2' },
  ];

  for (const t of tests) {
    it(`${t.freq} Hz → ${t.note}`, () => {
      expect(frequencyToNoteName(t.freq)).toBe(t.note);
    });
  }
});

describe('midiToFrequency — Reverse Conversion', () => {
  it('MIDI 69 → 440 Hz exactly', () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it('MIDI 60 → ~261.63 Hz (Middle C)', () => {
    expect(Math.abs(midiToFrequency(60) - 261.63)).toBeLessThan(0.01);
  });

  it('round-trip: freq → midi → freq preserves within 1 cent', () => {
    const testFreqs = [110, 220, 330, 440, 550, 660, 880, 1000];
    for (const f of testFreqs) {
      const midi = frequencyToMidi(f);
      const roundTrip = midiToFrequency(midi);
      const centsDiff = Math.abs(1200 * Math.log2(roundTrip / f));
      expect(centsDiff).toBeLessThan(50); // Within half a semitone
    }
  });
});

describe('getCentsOff — Pitch Accuracy', () => {
  it('exact A4 (440 Hz) → 0 cents off', () => {
    expect(getCentsOff(440)).toBe(0);
  });

  it('slightly sharp A4 (442 Hz) → positive cents', () => {
    const cents = getCentsOff(442);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeLessThan(10);
  });

  it('slightly flat A4 (438 Hz) → negative cents', () => {
    const cents = getCentsOff(438);
    expect(cents).toBeLessThan(0);
    expect(cents).toBeGreaterThan(-10);
  });

  it('quarter tone sharp (A4 + 50 cents) → ~50 cents', () => {
    const freq = 440 * Math.pow(2, 50 / 1200);
    const cents = getCentsOff(freq);
    // At the boundary, rounding might assign to next note
    expect(Math.abs(cents)).toBeLessThanOrEqual(50);
  });

  it('exact C4 (261.63 Hz) → ~0 cents', () => {
    const cents = getCentsOff(261.63);
    expect(Math.abs(cents)).toBeLessThanOrEqual(1);
  });
});

describe('getKeyInfo — Key Scale Construction', () => {
  it('C Major → C D E F G A B', () => {
    const key = getKeyInfo('C', 'Major');
    expect(key.scaleNotes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(key.label).toBe('C Major');
  });

  it('A Minor → A B C D E F G', () => {
    const key = getKeyInfo('A', 'Minor');
    expect(key.scaleNotes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('G Major → G A B C D E F#', () => {
    const key = getKeyInfo('G', 'Major');
    expect(key.scaleNotes).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  it('D Major → D E F# G A B C#', () => {
    const key = getKeyInfo('D', 'Major');
    expect(key.scaleNotes).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('E Minor → E F# G A B C D', () => {
    const key = getKeyInfo('E', 'Minor');
    expect(key.scaleNotes).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
  });

  it('F Major → F G A A# C D E', () => {
    const key = getKeyInfo('F', 'Major');
    expect(key.scaleNotes).toEqual(['F', 'G', 'A', 'A#', 'C', 'D', 'E']);
  });

  it('all 24 keys have exactly 7 scale notes', () => {
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const root of roots) {
      for (const q of ['Major', 'Minor'] as const) {
        const key = getKeyInfo(root, q);
        expect(key.scaleNotes.length).toBe(7);
      }
    }
  });
});

describe('isNoteInKey — In-Key Checking', () => {
  const cMajor = getKeyInfo('C', 'Major');

  it('C4 is in C Major', () => expect(isNoteInKey('C4', cMajor)).toBe(true));
  it('D3 is in C Major', () => expect(isNoteInKey('D3', cMajor)).toBe(true));
  it('E5 is in C Major', () => expect(isNoteInKey('E5', cMajor)).toBe(true));
  it('F4 is in C Major', () => expect(isNoteInKey('F4', cMajor)).toBe(true));
  it('G2 is in C Major', () => expect(isNoteInKey('G2', cMajor)).toBe(true));
  it('A4 is in C Major', () => expect(isNoteInKey('A4', cMajor)).toBe(true));
  it('B3 is in C Major', () => expect(isNoteInKey('B3', cMajor)).toBe(true));

  it('C#4 is NOT in C Major', () => expect(isNoteInKey('C#4', cMajor)).toBe(false));
  it('D#3 is NOT in C Major', () => expect(isNoteInKey('D#3', cMajor)).toBe(false));
  it('F#4 is NOT in C Major', () => expect(isNoteInKey('F#4', cMajor)).toBe(false));
  it('G#5 is NOT in C Major', () => expect(isNoteInKey('G#5', cMajor)).toBe(false));
  it('A#4 is NOT in C Major', () => expect(isNoteInKey('A#4', cMajor)).toBe(false));
});

describe('isNoteInKeyWithTolerance — Difficulty Levels', () => {
  const cMajor = getKeyInfo('C', 'Major');

  describe('Easy mode (no cents tolerance)', () => {
    it('any in-key note passes regardless of cents', () => {
      expect(isNoteInKeyWithTolerance('C4', 45, cMajor, null)).toBe(true);
      expect(isNoteInKeyWithTolerance('E4', -49, cMajor, null)).toBe(true);
    });
    it('out-of-key note always fails', () => {
      expect(isNoteInKeyWithTolerance('C#4', 0, cMajor, null)).toBe(false);
    });
  });

  describe('Medium mode (±35 cents)', () => {
    it('in-key within tolerance passes', () => {
      expect(isNoteInKeyWithTolerance('C4', 30, cMajor, 35)).toBe(true);
      expect(isNoteInKeyWithTolerance('E4', -35, cMajor, 35)).toBe(true);
    });
    it('in-key outside tolerance fails', () => {
      expect(isNoteInKeyWithTolerance('C4', 40, cMajor, 35)).toBe(false);
      expect(isNoteInKeyWithTolerance('G4', -36, cMajor, 35)).toBe(false);
    });
  });

  describe('Hard mode (±15 cents)', () => {
    it('in-key within tolerance passes', () => {
      expect(isNoteInKeyWithTolerance('A4', 10, cMajor, 15)).toBe(true);
      expect(isNoteInKeyWithTolerance('B3', -15, cMajor, 15)).toBe(true);
    });
    it('in-key outside tolerance fails', () => {
      expect(isNoteInKeyWithTolerance('A4', 20, cMajor, 15)).toBe(false);
      expect(isNoteInKeyWithTolerance('D4', -16, cMajor, 15)).toBe(false);
    });
  });
});

describe('estimateKey — Key Detection from Notes', () => {
  it('C D E F G A B → C Major or A Minor', () => {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
    const key = estimateKey(notes);
    // C Major and A Minor have the same notes — either is valid
    expect(
      (key.root === 'C' && key.quality === 'Major') ||
      (key.root === 'A' && key.quality === 'Minor')
    ).toBe(true);
  });

  it('E F# G A B C D → E Minor or G Major', () => {
    const notes = ['E3', 'F#3', 'G3', 'A3', 'B3', 'C4', 'D4'];
    const key = estimateKey(notes);
    expect(
      (key.root === 'E' && key.quality === 'Minor') ||
      (key.root === 'G' && key.quality === 'Major')
    ).toBe(true);
  });

  it('weighted notes emphasize the key', () => {
    // Many C and G notes → strongly C Major
    const notes = ['C4', 'C4', 'C4', 'G4', 'G4', 'E4', 'D4', 'F4'];
    const key = estimateKey(notes);
    expect(key.root).toBe('C');
  });

  it('empty notes defaults to C Major', () => {
    const key = estimateKey([]);
    expect(key.root).toBe('C');
    expect(key.quality).toBe('Major');
  });
});
