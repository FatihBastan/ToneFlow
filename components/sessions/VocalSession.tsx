"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { matchSpokenWords, normalize } from "@/lib/wordMatch";
import type { LyricLine, FeedbackType } from "@/types";

interface VocalSessionProps {
  lyrics: LyricLine[];
  currentTime: number; // not used for advancement, but kept for interface compat
  feedback: FeedbackType;
  onWordFeedback?: (type: "correct" | "wrong") => void;
}

/** Flatten lyrics into a sequential word list with line/word indices */
interface FlatWord {
  text: string;
  lineIndex: number;
  wordIndex: number;
}

function flattenLyrics(lyrics: LyricLine[]): FlatWord[] {
  const flat: FlatWord[] = [];
  for (let li = 0; li < lyrics.length; li++) {
    const words = lyrics[li].text.split(/\s+/).filter(Boolean);
    for (let wi = 0; wi < words.length; wi++) {
      flat.push({ text: words[wi], lineIndex: li, wordIndex: wi });
    }
  }
  return flat;
}

export default function VocalSession({
  lyrics,
  feedback,
  onWordFeedback,
}: VocalSessionProps) {
  const speech = useSpeechRecognition();
  const [cursor, setCursor] = useState(0);
  const [wordStates, setWordStates] = useState<Map<number, "correct" | "wrong">>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const prevWordsLenRef = useRef(0);

  const flatWords = useMemo(() => flattenLyrics(lyrics), [lyrics]);

  // Start speech recognition on mount
  useEffect(() => {
    speech.start();
    return () => speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Match recognized words against lyrics
  useEffect(() => {
    const allWords = speech.allWords;
    if (allWords.length === prevWordsLenRef.current) return;

    // Only process new words since last check
    const newWords = allWords.slice(prevWordsLenRef.current);
    prevWordsLenRef.current = allWords.length;

    if (newWords.length === 0) return;

    const wordTexts = flatWords.map((w) => w.text);
    const { newCursor, results } = matchSpokenWords(wordTexts, newWords, cursor);

    if (newCursor > cursor) {
      setCursor(newCursor);
      setWordStates((prev) => {
        const next = new Map(prev);
        for (const [idx, state] of results) {
          next.set(idx, state);
        }
        return next;
      });

      // Report latest feedback to parent
      if (onWordFeedback) {
        const lastResult = results.get(newCursor - 1);
        if (lastResult) onWordFeedback(lastResult);
      }
    }
  }, [speech.allWords, flatWords, cursor, onWordFeedback]);

  // Find which line the cursor is on for scrolling
  const currentLineIndex = cursor < flatWords.length
    ? flatWords[cursor].lineIndex
    : lyrics.length - 1;

  // Auto-scroll to current line
  useEffect(() => {
    if (!containerRef.current) return;
    const lineEl = containerRef.current.querySelector(`[data-line="${currentLineIndex}"]`);
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  if (lyrics.length === 0) {
    return <p className="text-white/30 text-sm text-center">No synced lyrics found</p>;
  }

  // Build a word offset map: for each line, what flat index does it start at?
  const lineStartIndex: number[] = [];
  let offset = 0;
  for (const line of lyrics) {
    lineStartIndex.push(offset);
    const wordCount = line.text.split(/\s+/).filter(Boolean).length;
    offset += wordCount;
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div
        ref={containerRef}
        className="max-h-[45vh] overflow-y-auto px-6 py-4 space-y-3 w-full"
      >
        {lyrics.map((line, li) => {
          const isCurrentLine = li === currentLineIndex;
          const isPast = li < currentLineIndex;
          const words = line.text.split(/\s+/).filter(Boolean);
          const startIdx = lineStartIndex[li];

          return (
            <motion.div
              key={li}
              data-line={li}
              animate={{
                opacity: isCurrentLine ? 1 : isPast ? 0.35 : 0.5,
                scale: isCurrentLine ? 1.05 : 1,
              }}
              transition={{ duration: 0.3 }}
              className={`text-center text-lg font-medium leading-relaxed ${
                isCurrentLine ? "text-white" : "text-white/50"
              }`}
            >
              {words.map((word, wi) => {
                const flatIdx = startIdx + wi;
                const state = wordStates.get(flatIdx);
                const isCurrent = flatIdx === cursor;
                const isAhead = flatIdx > cursor;

                let className = "text-white/40"; // upcoming
                if (state === "correct") {
                  className = "text-green-300";
                } else if (state === "wrong") {
                  className = "text-red-400/70";
                } else if (isCurrent) {
                  className = "word-active";
                } else if (!isAhead && isPast) {
                  className = "text-white/25";
                }

                return (
                  <span
                    key={wi}
                    className={`inline-block mx-0.5 transition-all duration-150 ${className} ${
                      isCurrent ? "scale-110" : ""
                    }`}
                  >
                    {word}
                  </span>
                );
              })}
            </motion.div>
          );
        })}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-xs">
        <div className={`w-2 h-2 rounded-full ${
          speech.isListening ? "bg-green-400 animate-pulse" : "bg-white/20"
        }`} />
        <span className="text-white/30">
          {speech.isListening ? "Listening to you..." : "Starting mic..."}
        </span>
        {speech.error && (
          <span className="text-red-400/60 ml-2">{speech.error}</span>
        )}
      </div>
    </div>
  );
}
