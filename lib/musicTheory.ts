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
 * Krumhansl-Schmuckler tone profiles. Higher weights on the tonic, dominant,
 * and mediant — the tones that actually establish a key — so the estimator
 * doesn't tie between the seven keys that all share the same scale notes.
 */
const KRUMHANSL_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KRUMHANSL_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0, denomA = 0, denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Estimate key by correlating the observed pitch-class histogram against
 * Krumhansl-Schmuckler tone profiles for every major and minor key.
 * This is dramatically more accurate than counting in-key notes because
 * the profile weights the tonic and dominant heavily — the diatonic notes
 * are not all equally diagnostic.
 */
export function estimateKey(noteNames: string[]): KeyInfo {
  if (noteNames.length === 0) {
    return getKeyInfo("C", "Major");
  }

  // Build the 12-bin pitch-class histogram
  const histogram = new Array(12).fill(0);
  for (const n of noteNames) {
    const clean = n.replace(/\d+$/, "");
    const idx = ALL_NOTES.indexOf(clean);
    if (idx >= 0) histogram[idx]++;
  }

  let bestKey: KeyInfo = getKeyInfo("C", "Major");
  let bestScore = -Infinity;

  for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
    // Rotate the profile so its first slot aligns with this candidate root
    const rotatedMajor = new Array(12);
    const rotatedMinor = new Array(12);
    for (let i = 0; i < 12; i++) {
      rotatedMajor[(rootIdx + i) % 12] = KRUMHANSL_MAJOR[i];
      rotatedMinor[(rootIdx + i) % 12] = KRUMHANSL_MINOR[i];
    }

    const majorScore = pearsonCorrelation(histogram, rotatedMajor);
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = getKeyInfo(ALL_NOTES[rootIdx], "Major");
    }
    const minorScore = pearsonCorrelation(histogram, rotatedMinor);
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = getKeyInfo(ALL_NOTES[rootIdx], "Minor");
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
