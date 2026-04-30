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

interface PitchDetectionState {
  currentPitch: PitchData | null;
  rms: number;
  sourceType: AudioSourceType;
  isDetecting: boolean;
  /** True when the same MIDI note has been observed for several consecutive frames */
  stable: boolean;
}

export function usePitchDetection(
  analyser: AnalyserNode | null,
  audioContext: AudioContext | null
) {
  const [state, setState] = useState<PitchDetectionState>({
    currentPitch: null,
    rms: 0,
    sourceType: "unknown",
    isDetecting: false,
    stable: false,
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

  // Tunables
  const RMS_GATE = 0.018;
  const CLARITY_THRESHOLD = 0.78;
  const UPDATE_INTERVAL_MS = 50;

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

    let currentPitch: PitchData | null = null;
    let sourceType: AudioSourceType = "unknown";
    let stable = false;

    if (rms > RMS_GATE) {
      // Pre-process: kill rumble + window for cleaner NSDF peaks
      highPassFilter(buffer, audioContext.sampleRate);
      applyHannWindow(buffer);

      const { frequency: rawFreq, clarity } = detectPitch(
        buffer,
        audioContext.sampleRate
      );

      if (rawFreq > 0 && clarity > CLARITY_THRESHOLD) {
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

    setState({ currentPitch, rms, sourceType, isDetecting: true, stable });
  }, [analyser, audioContext]);

  const startDetection = useCallback(() => {
    activeRef.current = true;
    rafRef.current = requestAnimationFrame(detect);
  }, [detect]);

  const stopDetection = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    freqHistoryRef.current = [];
    prevFreqRef.current = -1;
    stableMidiRef.current = null;
    stableCountRef.current = 0;
    setState({
      currentPitch: null,
      rms: 0,
      sourceType: "unknown",
      isDetecting: false,
      stable: false,
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
  };
}
