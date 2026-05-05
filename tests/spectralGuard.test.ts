/**
 * Spectral sub-octave guard — verify the post-NSDF check halves the
 * detected frequency only when half-frequency energy is dominant.
 *
 * Synthesizes signals that mimic the "weak fundamental, strong 2nd
 * harmonic" pattern (organ stops) versus a clean fundamental, and
 * confirms detectPitch lands on the right octave each time.
 */
import { describe, it, expect } from "vitest";
import { detectPitch } from "../lib/pitch";
import { frequencyToMidi } from "../lib/noteMapping";

const SR = 44100;
const N = 4096;

function harmonicTone(
  fund: number,
  harmonics: { freq: number; amp: number }[]
): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const h of harmonics) {
      s += h.amp * Math.sin((2 * Math.PI * h.freq * i) / SR);
    }
    out[i] = s;
  }
  return out;
}

describe("Spectral sub-octave guard", () => {
  it("clean fundamental at 440 Hz: no halving", () => {
    const buf = harmonicTone(440, [
      { freq: 440, amp: 1.0 },
      { freq: 880, amp: 0.4 },
      { freq: 1320, amp: 0.15 },
    ]);
    const { frequency } = detectPitch(buf, SR);
    const midi = frequencyToMidi(frequency);
    // Within ±1 semitone of A4 (MIDI 69)
    expect(Math.abs(midi - 69)).toBeLessThanOrEqual(1);
  });

  it("organ-pattern: weak fundamental + dominant 2nd harmonic resolves to true f0", () => {
    // The detector's NSDF would otherwise lock onto T = SR/440 (the
    // dominant harmonic). The Goertzel guard must drop it to 220 Hz
    // because the 220 Hz bin holds enough energy to be the real f0.
    const buf = harmonicTone(220, [
      { freq: 220, amp: 0.55 }, // fundamental, modest
      { freq: 440, amp: 1.0 },  // 2nd harmonic, strongest
      { freq: 660, amp: 0.4 },
      { freq: 880, amp: 0.25 },
    ]);
    const { frequency } = detectPitch(buf, SR);
    const midi = frequencyToMidi(frequency);
    // Should land on A3 (MIDI 57), NOT A4 (MIDI 69)
    expect(midi).toBeLessThan(64);
    expect(midi).toBeGreaterThan(54);
  });

  it("vocal-pattern: strong fundamental with weak sub-harmonic energy stays put", () => {
    // Female vocal-style: fundamental at 300 Hz (D4-ish), some breath
    // noise leaking into the 150 Hz region but not enough to override.
    const buf = harmonicTone(300, [
      { freq: 300, amp: 1.0 },
      { freq: 600, amp: 0.5 },
      { freq: 900, amp: 0.25 },
      { freq: 150, amp: 0.2 }, // breath leak — well below 0.4 threshold ratio
    ]);
    const { frequency } = detectPitch(buf, SR);
    const midi = frequencyToMidi(frequency);
    // Should land near D4 (MIDI 62)
    expect(Math.abs(midi - 62)).toBeLessThanOrEqual(1);
  });

  it("guard does not fire when the candidate is below ~120 Hz (HPF region)", () => {
    // The HPF in the live pipeline attenuates < 50 Hz; the guard ignores
    // sub-octaves that fall in or near that region, so a low-bass note
    // is reported as-is even if there is incidental low-Hz energy.
    const buf = harmonicTone(82, [
      { freq: 82, amp: 1.0 }, // E2 — low guitar string
      { freq: 164, amp: 0.5 },
    ]);
    const { frequency } = detectPitch(buf, SR);
    const midi = frequencyToMidi(frequency);
    // Should land near E2 (MIDI 40)
    expect(Math.abs(midi - 40)).toBeLessThanOrEqual(1);
  });
});
