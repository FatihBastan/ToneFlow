"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { LyricLine, FeedbackType } from "@/types";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  currentTime: number;
  blurred?: boolean;
  feedback?: FeedbackType;
  compact?: boolean; // true for split layout (Full Performance)
}

export default function LyricsDisplay({
  lyrics,
  currentTime,
  blurred = false,
  feedback = "neutral",
  compact = false,
}: LyricsDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  let currentLineIndex = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      currentLineIndex = i;
      break;
    }
  }

  useEffect(() => {
    if (currentLineIndex < 0 || !containerRef.current) return;
    const lineEl = containerRef.current.children[currentLineIndex] as HTMLElement;
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  const maxH = compact ? "max-h-[25vh]" : "max-h-[40vh]";

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={blurred ? "Lyrics (blurred)" : "Synced lyrics"}
      aria-live="polite"
      className={`${maxH} overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 space-y-2 sm:space-y-3 transition-all duration-500 ${
        blurred ? "lyrics-blurred" : "lyrics-clear"
      }`}
    >
      {lyrics.map((line, i) => {
        const isActive = i === currentLineIndex;
        const isPast = i < currentLineIndex;

        return (
          <motion.div
            key={i}
            animate={{
              opacity: isActive ? 1 : isPast ? 0.3 : 0.5,
              scale: isActive ? (compact ? 1.02 : 1.05) : 1,
            }}
            transition={{ duration: 0.3 }}
            className={`text-center leading-relaxed ${
              compact ? "text-sm sm:text-base" : "text-base sm:text-lg"
            } font-medium ${isActive ? "text-white" : "text-white/50"}`}
          >
            {line.words && isActive && !blurred ? (
              <span className="inline">
                {line.words.map((word, wi) => {
                  const isWordActive =
                    currentTime >= word.startTime &&
                    currentTime < word.endTime;
                  const isWordPast = currentTime >= word.endTime;

                  // Feedback-reactive word styling
                  let wordClass = "text-white/40";
                  if (isWordActive) {
                    if (feedback === "correct") {
                      wordClass = "word-active-correct";
                    } else if (feedback === "wrong") {
                      wordClass = "word-active-wrong";
                    } else {
                      wordClass = "word-active";
                    }
                  } else if (isWordPast) {
                    wordClass = "text-white/80";
                  }

                  return (
                    <span
                      key={wi}
                      className={`inline-block mx-0.5 transition-all duration-150 ${wordClass} ${
                        isWordActive ? "scale-110" : ""
                      }`}
                    >
                      {word.text}
                    </span>
                  );
                })}
              </span>
            ) : (
              line.text
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
