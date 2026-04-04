"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { detectPitch, computeRMS, isLikelyVocal } from "@/lib/pitch";
import { frequencyToMidi, midiToNoteName } from "@/lib/noteMapping";
import { getCentsOff } from "@/lib/musicTheory";
import type { PitchData, AudioSourceType } from "@/types";

interface PitchDetectionState {
  currentPitch: PitchData | null;
  rms: number;
  sourceType: AudioSourceType;
  isDetecting: boolean;
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
  });

  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);
  const lastUpdateRef = useRef(0);

  // Noise gate: ignore anything below this RMS volume
  const RMS_GATE = 0.015;
  // Minimum clarity to accept a pitch reading
  const CLARITY_THRESHOLD = 0.75;
  // Minimum ms between state updates (throttle to ~15 fps for pitch)
  const UPDATE_INTERVAL_MS = 65;

  const detect = useCallback(() => {
    if (!analyser || !audioContext || !activeRef.current) return;

    const now = performance.now();
    const elapsed = now - lastUpdateRef.current;

    // Always schedule next frame, but only update state at throttled rate
    rafRef.current = requestAnimationFrame(detect);

    if (elapsed < UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = now;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const rms = computeRMS(buffer);

    let currentPitch: PitchData | null = null;
    let sourceType: AudioSourceType = "unknown";

    // Only attempt pitch detection if volume is above noise gate
    if (rms > RMS_GATE) {
      const { frequency, clarity } = detectPitch(buffer, audioContext.sampleRate);

      if (frequency > 0 && clarity > CLARITY_THRESHOLD) {
        const midiNote = frequencyToMidi(frequency);
        const noteName = midiToNoteName(midiNote);
        const centsOff = getCentsOff(frequency);
        currentPitch = { frequency, midiNote, noteName, clarity, centsOff };
        sourceType = isLikelyVocal(frequency, rms) ? "vocals" : "instrument";
      }
    }

    setState({ currentPitch, rms, sourceType, isDetecting: true });
  }, [analyser, audioContext]);

  const startDetection = useCallback(() => {
    activeRef.current = true;
    rafRef.current = requestAnimationFrame(detect);
  }, [detect]);

  const stopDetection = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState({
      currentPitch: null,
      rms: 0,
      sourceType: "unknown",
      isDetecting: false,
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
