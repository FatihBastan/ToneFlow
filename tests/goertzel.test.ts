/**
 * Goertzel single-bin DFT magnitude — verify against synthetic sines.
 */
import { describe, it, expect } from "vitest";
import { goertzelMagnitude } from "../lib/pitch";

const SR = 44100;
const N = 4096;

function sine(freq: number, amp = 1.0): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return out;
}

function silence(): Float32Array {
  return new Float32Array(N);
}

function mix(...buffers: Float32Array[]): Float32Array {
  const out = new Float32Array(N);
  for (const b of buffers) for (let i = 0; i < N; i++) out[i] += b[i];
  return out;
}

describe("goertzelMagnitude", () => {
  it("returns a strong response at the buffer's true frequency", () => {
    const buf = sine(440);
    const mag = goertzelMagnitude(buf, SR, 440);
    expect(mag).toBeGreaterThan(100);
  });

  it("returns near-zero for a frequency not present in the signal", () => {
    const buf = sine(440);
    const mag = goertzelMagnitude(buf, SR, 220);
    // Should be tiny relative to the true bin
    const truth = goertzelMagnitude(buf, SR, 440);
    expect(mag / truth).toBeLessThan(0.05);
  });

  it("returns zero for silence at any frequency", () => {
    const buf = silence();
    expect(goertzelMagnitude(buf, SR, 440)).toBeLessThan(0.001);
  });

  it("returns zero for out-of-range bins (DC and above Nyquist)", () => {
    const buf = sine(440);
    expect(goertzelMagnitude(buf, SR, 0)).toBe(0);
    expect(goertzelMagnitude(buf, SR, SR / 2 + 100)).toBe(0);
    expect(goertzelMagnitude(buf, SR, -10)).toBe(0);
  });

  it("flute-like signal (weak fundamental + strong 2nd harmonic) shows the dominant bin", () => {
    // Synthesizes the failure mode the spectral check targets:
    // fundamental at 220 Hz (low energy), 2nd harmonic at 440 Hz (high energy).
    const fund = sine(220, 0.2);
    const harm = sine(440, 1.0);
    const buf = mix(fund, harm);
    const magFund = goertzelMagnitude(buf, SR, 220);
    const magHarm = goertzelMagnitude(buf, SR, 440);
    expect(magHarm).toBeGreaterThan(magFund);
    // Sub-octave check threshold (0.4) should compare these correctly:
    // 0.2/1.0 = 0.2, below threshold → does not fire (correct: harmonic is dominant).
    expect(magFund / magHarm).toBeLessThan(0.4);
  });

  it("subharmonic case (true f0 with a quiet half-frequency component) detected", () => {
    // 220 Hz fundamental visible at half its frequency — synthesizes the
    // case where NSDF could be misled. Sub-octave magnitude should be
    // a meaningful fraction of the candidate.
    const fund = sine(220, 0.5);
    const sub = sine(110, 0.3);
    const buf = mix(fund, sub);
    const magFund = goertzelMagnitude(buf, SR, 220);
    const magSub = goertzelMagnitude(buf, SR, 110);
    // 0.3/0.5 = 0.6, above threshold 0.4 → would trigger sub-octave correction
    expect(magSub / magFund).toBeGreaterThan(0.4);
  });
});
