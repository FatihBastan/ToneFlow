const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

/**
 * Convert frequency (Hz) to MIDI note number.
 * MIDI 69 = A4 = 440 Hz
 */
export function frequencyToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Convert MIDI note number to note name with octave (e.g. "C4", "D#3").
 */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Convert frequency directly to note name.
 */
export function frequencyToNoteName(freq: number): string {
  return midiToNoteName(frequencyToMidi(freq));
}

/**
 * Get the frequency for a given MIDI note number.
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
