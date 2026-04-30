"use client";

import { useState, useRef, useCallback } from "react";

interface MicrophoneState {
  isActive: boolean;
  error: string | null;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
}

export function useMicrophone() {
  const [state, setState] = useState<MicrophoneState>({
    isActive: false,
    error: null,
    stream: null,
    audioContext: null,
    analyser: null,
    sourceNode: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      const audioContext = new AudioContext({ sampleRate: 44100 });
      const analyser = audioContext.createAnalyser();
      // 4096 doubles pitch resolution at the bottom of the range (bass/baritone)
      // while still completing inside one animation frame on modest hardware.
      analyser.fftSize = 4096;
      // Only smooths frequency-domain reads (visualizer); time-domain (pitch) is unaffected.
      analyser.smoothingTimeConstant = 0.6;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      setState({
        isActive: true,
        error: null,
        stream,
        audioContext,
        analyser,
        sourceNode,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error:
          err instanceof Error
            ? err.message
            : "Failed to access microphone",
      }));
    }
  }, []);

  const stop = useCallback(() => {
    const { stream, audioContext, sourceNode } = stateRef.current;
    if (sourceNode) sourceNode.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (audioContext) audioContext.close();

    setState({
      isActive: false,
      error: null,
      stream: null,
      audioContext: null,
      analyser: null,
      sourceNode: null,
    });
  }, []);

  /**
   * Get time-domain audio data for pitch detection.
   */
  const getTimeDomainData = useCallback((): Float32Array | null => {
    const { analyser } = stateRef.current;
    if (!analyser) return null;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    return buffer;
  }, []);

  /**
   * Get frequency-domain data for visualization.
   */
  const getFrequencyData = useCallback((): Uint8Array | null => {
    const { analyser } = stateRef.current;
    if (!analyser) return null;
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buffer);
    return buffer;
  }, []);

  /**
   * Record a chunk of audio as a WAV Blob (for ACRCloud).
   */
  const recordChunk = useCallback(
    (durationMs: number): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const { stream } = stateRef.current;
        if (!stream) {
          reject(new Error("Microphone not active"));
          return;
        }

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          resolve(new Blob(chunks, { type: "audio/webm" }));
        };

        mediaRecorder.onerror = () => reject(new Error("Recording failed"));

        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, durationMs);
      });
    },
    []
  );

  return {
    isActive: state.isActive,
    error: state.error,
    audioContext: state.audioContext,
    analyser: state.analyser,
    start,
    stop,
    getTimeDomainData,
    getFrequencyData,
    recordChunk,
  };
}
