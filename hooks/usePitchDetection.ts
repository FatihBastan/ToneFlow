"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  detectPitch,
  computeRMS,
  isLikelyVocal,
  highPassFilter,
  applyHannWindow,
  medianFrequency,
  correctOctaveJump,
} from "@/lib/pitch";
import { frequencyToMidi, midiToNoteName } from "@/lib/noteMapping";
import { getCentsOff } from "@/lib/musicTheory";
import type { PitchData, AudioSourceType } from "@/types";

/** Track in-flight CREPE state so we can skip overlapping inferences. */
interface CrepeRuntime {
  /** Loaded successfully; safe to call detectPitchCrepe. */
  ready: boolean;
  /** A frame is currently being inferred — drop this tick to avoid pile-up. */
  inFlight: boolean;
  /** Most recent CREPE-provided frequency, used to bridge between frames. */
  lastFreq: number;
  /** Most recent CREPE-provided clarity, mapped from confidence. */
  lastClarity: number;
  /** True after a load attempt failed; we permanently fall back to NSDF. */
  failed: boolean;
}

interface PitchDetectionState {
  currentPitch: PitchData | null;
  rms: number;
  sourceType: AudioSourceType;
  isDetecting: boolean;
  /** True when the same MIDI note has been observed for several consecutive frames */
  stable: boolean;
  /** True while the noise-floor calibration window is collecting samples */
  calibrating: boolean;
  /** RMS gate currently in use; -1 until calibration completes (or override is set) */
  effectiveRmsGate: number;
  /** Measured ambient-noise RMS from the calibration window; -1 if skipped */
  noiseFloor: number;
  /** True while the CREPE model is being downloaded/initialised. */
  pitchModelLoading: boolean;
  /** Non-null when CREPE failed to load; the hook has fallen back to NSDF. */
  pitchModelError: string | null;
  /** Which detector produced the current reading. Useful for diagnostics. */
  detector: "nsdf" | "crepe";
}

export interface PitchDetectionOptions {
  /** Override the RMS gate. When set, skips adaptive calibration. */
  rmsGate?: number;
  /** Override the NSDF clarity threshold. Vocals can use ~0.65; default 0.78. */
  clarityThreshold?: number;
  /**
   * Use the CREPE-tiny ONNX model instead of the NSDF autocorrelator.
   * The model is lazy-loaded on first use; until it loads (or if it
   * fails) the hook falls back to the autocorrelator. State is reported
   * via `pitchModelLoading` and `pitchModelError` on the return value.
   */
  useCrepe?: boolean;
}

// Defaults tuned on noisy mic input — see bench/RESULTS.md
const DEFAULT_RMS_GATE = 0.018;
const DEFAULT_CLARITY_THRESHOLD = 0.78;
// Adaptive-gate envelope. Floor keeps a quiet room from disabling the gate;
// ceiling stops a loud calibration window from setting an unreachable bar.
const ADAPTIVE_GATE_FLOOR = 0.005;
const ADAPTIVE_GATE_CEILING = 0.025;
const NOISE_FLOOR_MULTIPLIER = 3;
const CALIBRATION_DURATION_MS = 2000;

export function usePitchDetection(
  analyser: AnalyserNode | null,
  audioContext: AudioContext | null,
  options?: PitchDetectionOptions
) {
  const [state, setState] = useState<PitchDetectionState>({
    currentPitch: null,
    rms: 0,
    sourceType: "unknown",
    isDetecting: false,
    stable: false,
    calibrating: false,
    effectiveRmsGate: options?.rmsGate ?? -1,
    noiseFloor: -1,
    pitchModelLoading: false,
    pitchModelError: null,
    detector: "nsdf",
  });

  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);
  const lastUpdateRef = useRef(0);

  // Frequency history for median smoothing — robust to single-frame glitches
  const freqHistoryRef = useRef<number[]>([]);
  const HISTORY_SIZE = 5;

  // Track the smoothed previous frequency for octave-jump correction
  const prevFreqRef = useRef(-1);

  // Track stability: how many consecutive frames have produced the same MIDI note
  const stableMidiRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const STABILITY_FRAMES = 2;

  // Live options ref so the rAF loop sees updates without re-binding callbacks
  const optionsRef = useRef<PitchDetectionOptions | undefined>(options);
  optionsRef.current = options;

  // Calibration state — collected during the first CALIBRATION_DURATION_MS
  // after startDetection() unless an explicit rmsGate override is supplied.
  const calibrationStartRef = useRef(0);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibratingRef = useRef(false);
  const adaptiveGateRef = useRef<number>(-1);

  // CREPE runtime state — lazy-loaded only if useCrepe is set.
  const crepeRef = useRef<CrepeRuntime>({
    ready: false,
    inFlight: false,
    lastFreq: -1,
    lastClarity: 0,
    failed: false,
  });

  const UPDATE_INTERVAL_MS = 50;

  /** Resolve which RMS gate to use right now: explicit override > adaptive > default. */
  const resolveRmsGate = (): number => {
    const override = optionsRef.current?.rmsGate;
    if (typeof override === "number") return override;
    if (adaptiveGateRef.current > 0) return adaptiveGateRef.current;
    return DEFAULT_RMS_GATE;
  };

  const resolveClarityThreshold = (): number =>
    optionsRef.current?.clarityThreshold ?? DEFAULT_CLARITY_THRESHOLD;

  const detect = useCallback(() => {
    if (!analyser || !audioContext || !activeRef.current) return;

    const now = performance.now();
    const elapsed = now - lastUpdateRef.current;
    rafRef.current = requestAnimationFrame(detect);
    if (elapsed < UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = now;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    // RMS measured before filtering so the volume meter reflects what the user hears
    const rms = computeRMS(buffer);

    // ── Calibration window ──
    // For the first CALIBRATION_DURATION_MS we sample the room's noise
    // floor and compute an adaptive gate. No pitch is reported during this
    // window so the user gets predictable behavior.
    if (calibratingRef.current) {
      calibrationSamplesRef.current.push(rms);
      const since = now - calibrationStartRef.current;
      if (since >= CALIBRATION_DURATION_MS) {
        // Use the median of collected RMS samples — robust to a stray
        // cough or thump during the calibration splash.
        const samples = [...calibrationSamplesRef.current].sort((a, b) => a - b);
        const noiseFloor = samples.length
          ? samples[Math.floor(samples.length / 2)]
          : 0;
        const adaptive = Math.min(
          ADAPTIVE_GATE_CEILING,
          Math.max(ADAPTIVE_GATE_FLOOR, noiseFloor * NOISE_FLOOR_MULTIPLIER),
        );
        adaptiveGateRef.current = adaptive;
        calibratingRef.current = false;
        calibrationSamplesRef.current = [];
        setState((prev) => ({
          ...prev,
          rms,
          calibrating: false,
          effectiveRmsGate: resolveRmsGate(),
          noiseFloor,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          rms,
          calibrating: true,
        }));
      }
      return;
    }

    const rmsGate = resolveRmsGate();
    const clarityThreshold = resolveClarityThreshold();
    const wantCrepe =
      optionsRef.current?.useCrepe === true &&
      crepeRef.current.ready &&
      !crepeRef.current.failed;

    let currentPitch: PitchData | null = null;
    let sourceType: AudioSourceType = "unknown";
    let stable = false;
    let detectorUsed: "nsdf" | "crepe" = "nsdf";

    if (rms > rmsGate) {
      // CREPE path: kick off async inference on a copy of the unprocessed
      // buffer. CREPE expects raw normalized audio, not HPF/windowed.
      // While inference is running we still fall through to the NSDF
      // path so the UI never freezes — the most recent CREPE reading
      // is kept in `crepeRef.current.lastFreq` for use below.
      if (wantCrepe && !crepeRef.current.inFlight) {
        crepeRef.current.inFlight = true;
        const crepeInput = new Float32Array(buffer);
        const sr = audioContext.sampleRate;
        // Fire and forget; result is read on the next frame.
        import("@/lib/crepePitch")
          .then(({ detectPitchCrepe }) => detectPitchCrepe(crepeInput, sr))
          .then((res) => {
            crepeRef.current.lastFreq = res.frequency;
            crepeRef.current.lastClarity = res.clarity;
          })
          .catch((err: unknown) => {
            // First failure flips us to permanent fallback so we don't
            // pile up rejected promises every frame.
            crepeRef.current.failed = true;
            crepeRef.current.ready = false;
            const message =
              err instanceof Error ? err.message : "CREPE inference failed";
            setState((prev) => ({
              ...prev,
              pitchModelError: message,
              detector: "nsdf",
            }));
          })
          .finally(() => {
            crepeRef.current.inFlight = false;
          });
      }

      // Pre-process: kill rumble + window for cleaner NSDF peaks
      highPassFilter(buffer, audioContext.sampleRate);
      applyHannWindow(buffer);

      let rawFreq: number;
      let clarity: number;
      if (wantCrepe && crepeRef.current.lastFreq > 0) {
        // CREPE has produced at least one reading — prefer it.
        rawFreq = crepeRef.current.lastFreq;
        clarity = crepeRef.current.lastClarity;
        detectorUsed = "crepe";
      } else {
        const nsdf = detectPitch(buffer, audioContext.sampleRate);
        rawFreq = nsdf.frequency;
        clarity = nsdf.clarity;
      }

      if (rawFreq > 0 && clarity > clarityThreshold) {
        // Octave-jump correction against the most recent stable estimate
        const corrected = correctOctaveJump(prevFreqRef.current, rawFreq);

        // Push into history and take the median — kills single-frame outliers
        freqHistoryRef.current.push(corrected);
        if (freqHistoryRef.current.length > HISTORY_SIZE) {
          freqHistoryRef.current.shift();
        }
        const smoothed = medianFrequency(freqHistoryRef.current);

        if (smoothed > 0) {
          prevFreqRef.current = smoothed;
          const midiNote = frequencyToMidi(smoothed);
          const noteName = midiToNoteName(midiNote);
          const centsOff = getCentsOff(smoothed);

          // Stability tracking — counts consecutive frames on the same MIDI note
          if (stableMidiRef.current === midiNote) {
            stableCountRef.current++;
          } else {
            stableMidiRef.current = midiNote;
            stableCountRef.current = 1;
          }
          stable = stableCountRef.current >= STABILITY_FRAMES;

          currentPitch = {
            frequency: smoothed,
            midiNote,
            noteName,
            clarity,
            centsOff,
          };
          sourceType = isLikelyVocal(smoothed, rms) ? "vocals" : "instrument";
        }
      } else {
        // Clarity failed — don't add bad reading to history, but don't reset either
        stableCountRef.current = 0;
      }
    } else {
      // Below noise gate — clear history so old data doesn't leak through after silence
      freqHistoryRef.current = [];
      prevFreqRef.current = -1;
      stableMidiRef.current = null;
      stableCountRef.current = 0;
    }

    setState((prev) => ({
      ...prev,
      currentPitch,
      rms,
      sourceType,
      isDetecting: true,
      stable,
      calibrating: false,
      effectiveRmsGate: rmsGate,
      detector: detectorUsed,
    }));
  }, [analyser, audioContext]);

  const startDetection = useCallback(() => {
    activeRef.current = true;

    // Kick off the CREPE model load if requested. We only attempt it
    // once per session — if it fails, `crepeRef.current.failed` is set
    // and the rest of the session uses the NSDF autocorrelator.
    if (
      optionsRef.current?.useCrepe &&
      !crepeRef.current.ready &&
      !crepeRef.current.failed
    ) {
      setState((prev) => ({ ...prev, pitchModelLoading: true, pitchModelError: null }));
      import("@/lib/crepePitch")
        .then(({ loadCrepe }) => loadCrepe())
        .then(() => {
          crepeRef.current.ready = true;
          setState((prev) => ({ ...prev, pitchModelLoading: false }));
        })
        .catch((err: unknown) => {
          crepeRef.current.failed = true;
          const message =
            err instanceof Error ? err.message : "Failed to load CREPE model";
          setState((prev) => ({
            ...prev,
            pitchModelLoading: false,
            pitchModelError: message,
            detector: "nsdf",
          }));
        });
    }

    // Decide whether to calibrate. If a mode supplies an explicit rmsGate
    // override (e.g. drums), there is nothing to calibrate against — the
    // user is opting into a fixed gate.
    const hasOverride = typeof optionsRef.current?.rmsGate === "number";
    if (hasOverride) {
      calibratingRef.current = false;
      adaptiveGateRef.current = -1;
      calibrationSamplesRef.current = [];
      setState((prev) => ({
        ...prev,
        calibrating: false,
        effectiveRmsGate: optionsRef.current!.rmsGate!,
        noiseFloor: -1,
      }));
    } else {
      calibratingRef.current = true;
      calibrationStartRef.current = performance.now();
      calibrationSamplesRef.current = [];
      adaptiveGateRef.current = -1;
      setState((prev) => ({
        ...prev,
        calibrating: true,
        effectiveRmsGate: -1,
        noiseFloor: -1,
      }));
    }
    rafRef.current = requestAnimationFrame(detect);
  }, [detect]);

  const recalibrate = useCallback(() => {
    // No-op when an explicit override is in effect — modes like drums
    // and vocals deliberately pin the gate, so re-measuring would just
    // overwrite their carefully chosen value with whatever the room
    // happens to be doing.
    if (typeof optionsRef.current?.rmsGate === "number") return;
    if (!activeRef.current) return;
    calibratingRef.current = true;
    calibrationStartRef.current = performance.now();
    calibrationSamplesRef.current = [];
    adaptiveGateRef.current = -1;
    setState((prev) => ({
      ...prev,
      calibrating: true,
      effectiveRmsGate: -1,
      noiseFloor: -1,
    }));
  }, []);

  const stopDetection = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    freqHistoryRef.current = [];
    prevFreqRef.current = -1;
    stableMidiRef.current = null;
    stableCountRef.current = 0;
    calibratingRef.current = false;
    calibrationSamplesRef.current = [];
    adaptiveGateRef.current = -1;
    // Don't reset CREPE ready/failed — keep the loaded model alive
    // across stop/start cycles so we don't pay the load cost twice.
    crepeRef.current.inFlight = false;
    crepeRef.current.lastFreq = -1;
    crepeRef.current.lastClarity = 0;
    setState({
      currentPitch: null,
      rms: 0,
      sourceType: "unknown",
      isDetecting: false,
      stable: false,
      calibrating: false,
      effectiveRmsGate: -1,
      noiseFloor: -1,
      pitchModelLoading: false,
      pitchModelError: null,
      detector: "nsdf",
    });
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    ...state,
    startDetection,
    stopDetection,
    recalibrate,
  };
}
