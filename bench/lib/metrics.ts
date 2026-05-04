/**
 * MIREX-standard pitch detection metrics.
 *
 * RPA — Raw Pitch Accuracy: % of voiced frames where detected freq is
 *       within ±50 cents of the ground truth.
 * RCA — Raw Chroma Accuracy: same as RPA but ignores octave errors
 *       (compares pitch class only). RCA - RPA = octave-error rate.
 * VR  — Voicing Recall: % of voiced ground-truth frames where we
 *       detected any pitch.
 * VFA — Voicing False Alarm: % of unvoiced ground-truth frames where
 *       we falsely detected pitch.
 * OA  — Overall Accuracy: combines pitch and voicing.
 *
 * A frame's reference is voiced when refFreq > 0; ours is voiced when
 * detFreq > 0.
 */

export interface FrameAccumulator {
  voicedRef: number;          // ground truth says voiced
  unvoicedRef: number;        // ground truth says unvoiced
  detectedOnVoiced: number;   // we detected something AND ref was voiced
  detectedOnUnvoiced: number; // we detected something AND ref was unvoiced
  pitchCorrect: number;       // detected within 50 cents of ref (voiced frames only)
  chromaCorrect: number;      // detected pitch class matches ref pitch class (ignoring octave)
  octaveError: number;        // chroma matches but pitch doesn't (off by ≥1 octave)
  totalFrames: number;
}

export function newAccumulator(): FrameAccumulator {
  return {
    voicedRef: 0,
    unvoicedRef: 0,
    detectedOnVoiced: 0,
    detectedOnUnvoiced: 0,
    pitchCorrect: 0,
    chromaCorrect: 0,
    octaveError: 0,
    totalFrames: 0,
  };
}

const CENTS_TOLERANCE = 50;

function freqToCents(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

/** Cents from `freq` to the nearest octave-equivalent of `ref`. */
function chromaCents(freq: number, ref: number): number {
  let diff = freqToCents(freq, ref);
  // Wrap to [-600, 600]
  while (diff > 600) diff -= 1200;
  while (diff < -600) diff += 1200;
  return diff;
}

export function addFrame(
  acc: FrameAccumulator,
  refFreq: number,
  detFreq: number
): void {
  acc.totalFrames++;
  const refVoiced = refFreq > 0;
  const detVoiced = detFreq > 0;

  if (refVoiced) {
    acc.voicedRef++;
    if (detVoiced) {
      acc.detectedOnVoiced++;
      const cents = freqToCents(detFreq, refFreq);
      const cAbs = Math.abs(cents);
      if (cAbs <= CENTS_TOLERANCE) {
        acc.pitchCorrect++;
        acc.chromaCorrect++;
      } else {
        const cc = Math.abs(chromaCents(detFreq, refFreq));
        if (cc <= CENTS_TOLERANCE) {
          acc.chromaCorrect++;
          acc.octaveError++;
        }
      }
    }
  } else {
    acc.unvoicedRef++;
    if (detVoiced) acc.detectedOnUnvoiced++;
  }
}

export interface MirexMetrics {
  rpa: number; // Raw Pitch Accuracy
  rca: number; // Raw Chroma Accuracy
  vr: number;  // Voicing Recall
  vfa: number; // Voicing False Alarm
  oa: number;  // Overall Accuracy
  octaveErrorRate: number;
  voicedFrames: number;
  totalFrames: number;
}

export function computeMetrics(acc: FrameAccumulator): MirexMetrics {
  const v = Math.max(1, acc.voicedRef);
  const u = Math.max(1, acc.unvoicedRef);
  const rpa = acc.pitchCorrect / v;
  const rca = acc.chromaCorrect / v;
  const vr = acc.detectedOnVoiced / v;
  const vfa = acc.detectedOnUnvoiced / u;
  // OA = (correctly-pitched-voiced + correctly-unvoiced) / total
  const correctUnvoiced = acc.unvoicedRef - acc.detectedOnUnvoiced;
  const oa = (acc.pitchCorrect + correctUnvoiced) / Math.max(1, acc.totalFrames);
  const octaveErrorRate =
    acc.detectedOnVoiced > 0 ? acc.octaveError / acc.detectedOnVoiced : 0;
  return {
    rpa,
    rca,
    vr,
    vfa,
    oa,
    octaveErrorRate,
    voicedFrames: acc.voicedRef,
    totalFrames: acc.totalFrames,
  };
}

export function pct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}
