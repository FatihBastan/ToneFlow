"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface SpeechRecognitionState {
  /** The latest batch of recognized words (resets each phrase) */
  recentWords: string[];
  /** Running total of all words recognized this session */
  allWords: string[];
  isListening: boolean;
  error: string | null;
}

// Browser typings for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export function useSpeechRecognition() {
  const [state, setState] = useState<SpeechRecognitionState>({
    recentWords: [],
    allWords: [],
    isListening: false,
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const allWordsRef = useRef<string[]>([]);
  const shouldRestartRef = useRef(false);

  const start = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setState((s) => ({
        ...s,
        error: "Speech recognition not supported in this browser. Use Chrome.",
      }));
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const words: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        if (!transcript) continue;

        const transcriptWords = transcript
          .toLowerCase()
          .replace(/[^\w\s']/g, "")
          .split(/\s+/)
          .filter(Boolean);

        if (result.isFinal) {
          // Add final words to the running total
          allWordsRef.current = [...allWordsRef.current, ...transcriptWords];
        }

        words.push(...transcriptWords);
      }

      if (words.length > 0) {
        setState((s) => ({
          ...s,
          recentWords: words,
          allWords: [...allWordsRef.current],
        }));
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      // "no-speech" and "aborted" are normal — just restart
      if (event.error === "no-speech" || event.error === "aborted") return;
      setState((s) => ({ ...s, error: `Speech error: ${event.error}` }));
    };

    recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started or disposed
        }
      } else {
        setState((s) => ({ ...s, isListening: false }));
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
      setState((s) => ({ ...s, isListening: true, error: null }));
    } catch {
      setState((s) => ({ ...s, error: "Failed to start speech recognition" }));
    }
  }, []);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setState((s) => ({ ...s, isListening: false }));
  }, []);

  const reset = useCallback(() => {
    allWordsRef.current = [];
    setState((s) => ({ ...s, recentWords: [], allWords: [] }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return { ...state, start, stop, reset };
}
