/**
 * Music theory utilities — keys, scales, in-key checking.
 */

const ALL_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Semitone intervals from root for common scales
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

export interface KeyInfo {
  root: string;     // e.g. "A"
  quality: "Major" | "Minor";
  label: string;    // e.g. "A Minor"
  scaleNotes: string[]; // e.g. ["A", "B", "C", "D", "E", "F", "G"]
}

/**
 * Get the index of a note name (without octave) in the chromatic scale.
 */
function noteIndex(note: string): number {
  // Strip octave number
  const clean = note.replace(/\d+$/, "");
  const idx = ALL_NOTES.indexOf(clean);
  return idx >= 0 ? idx : 0;
}

/**
 * Build a scale from a root note and interval pattern.
 */
function buildScale(root: string, intervals: number[]): string[] {
  const rootIdx = ALL_NOTES.indexOf(root);
  return intervals.map((i) => ALL_NOTES[(rootIdx + i) % 12]);
}

/**
 * Get a key's info including its scale notes.
 */
export function getKeyInfo(root: string, quality: "Major" | "Minor"): KeyInfo {
  const intervals = quality === "Major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const scaleNotes = buildScale(root, intervals);
  return {
    root,
    quality,
    label: `${root} ${quality}`,
    scaleNotes,
  };
}

/**
 * Check if a note name (e.g. "C#4") is in the given key.
 */
export function isNoteInKey(noteName: string, key: KeyInfo): boolean {
  const clean = noteName.replace(/\d+$/, "");
  return key.scaleNotes.includes(clean);
}

/**
 * Check if a note is in key with a cents tolerance.
 * - centsTolerance = null → any in-key note passes (easy mode)
 * - centsTolerance = 35  → must be within ±35 cents of the target (medium)
 * - centsTolerance = 15  → must be within ±15 cents (hard)
 */
export function isNoteInKeyWithTolerance(
  noteName: string,
  centsOff: number | undefined,
  key: KeyInfo,
  centsTolerance: number | null
): boolean {
  const inKey = isNoteInKey(noteName, key);
  if (!inKey) return false;
  if (centsTolerance === null) return true;
  if (centsOff === undefined) return true;
  return Math.abs(centsOff) <= centsTolerance;
}

/**
 * Get how many cents a frequency is off from the nearest note.
 * Positive = sharp, negative = flat.
 */
export function getCentsOff(frequency: number): number {
  const midiExact = 12 * Math.log2(frequency / 440) + 69;
  const midiRounded = Math.round(midiExact);
  return Math.round((midiExact - midiRounded) * 100);
}

/**
 * Simple key estimation from a collection of detected note names.
 * Scores each possible key by how many of the detected notes
 * fall within its scale. Returns the best match.
 */
export function estimateKey(noteNames: string[]): KeyInfo {
  if (noteNames.length === 0) {
    return getKeyInfo("C", "Major");
  }

  // Count occurrences of each pitch class
  const counts = new Map<string, number>();
  for (const n of noteNames) {
    const clean = n.replace(/\d+$/, "");
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }

  let bestKey: KeyInfo = getKeyInfo("C", "Major");
  let bestScore = -1;

  for (const root of ALL_NOTES) {
    for (const quality of ["Major", "Minor"] as const) {
      const key = getKeyInfo(root, quality);
      let score = 0;
      for (const [note, count] of counts) {
        if (key.scaleNotes.includes(note)) {
          score += count;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
  }

  return bestKey;
}

/**
 * All 12 chromatic notes for display purposes.
 */
export const CHROMATIC_NOTES = ALL_NOTES;

/**
 * Common keys for quick reference.
 */
export const COMMON_KEYS: KeyInfo[] = [
  getKeyInfo("C", "Major"),
  getKeyInfo("G", "Major"),
  getKeyInfo("D", "Major"),
  getKeyInfo("A", "Minor"),
  getKeyInfo("E", "Minor"),
  getKeyInfo("D", "Minor"),
];
