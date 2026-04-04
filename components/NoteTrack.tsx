"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PitchData, FeedbackType } from "@/types";

interface NoteTrackProps {
  currentPitch: PitchData | null;
  rms: number;
  feedback: FeedbackType;
  centsTolerance?: number | null;
}

export default function NoteTrack({ currentPitch, rms, feedback, centsTolerance }: NoteTrackProps) {
  const isCorrect = feedback === "correct";
  const isWrong = feedback === "wrong";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="status"
      aria-label={currentPitch ? `Detected note: ${currentPitch.noteName}, ${currentPitch.frequency.toFixed(1)} hertz` : 'Waiting for note input'}
      aria-live="polite"
      className={`glass px-3 py-2 sm:px-5 sm:py-3 flex items-center gap-3 sm:gap-4 min-w-[150px] sm:min-w-[200px] transition-all duration-150 ${
        isCorrect
          ? "border-green-500/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]"
          : isWrong
            ? "border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            : ""
      }`}
    >
      {/* Volume meter */}
      <div className="flex flex-col items-center gap-1" aria-hidden="true">
        <div className="w-2 h-16 bg-white/10 rounded-full overflow-hidden relative">
          <motion.div
            className="absolute bottom-0 w-full rounded-full"
            style={{
              background: isCorrect
                ? "linear-gradient(to top, #22c55e, #4ade80)"
                : isWrong
                  ? "linear-gradient(to top, #ef4444, #f87171)"
                  : "linear-gradient(to top, #22c55e, #eab308, #ef4444)",
            }}
            animate={{ height: `${Math.min(rms * 500, 100)}%` }}
            transition={{ duration: 0.05 }}
          />
        </div>
        <span className="text-[10px] text-white/40 font-mono">VOL</span>
      </div>

      {/* Note display */}
      <div className="text-center flex-1 relative">
        <AnimatePresence mode="wait">
          {currentPitch ? (
            <motion.div
              key={currentPitch.noteName}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                x: isWrong ? [0, -4, 4, -3, 3, 0] : 0,
              }}
              transition={
                isWrong
                  ? { x: { duration: 0.3 } }
                  : { type: "spring", stiffness: 400 }
              }
            >
              <div
                className={`text-xl sm:text-2xl font-bold transition-colors duration-100 ${
                  isCorrect
                    ? "text-green-300"
                    : isWrong
                      ? "text-red-300"
                      : "text-white"
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {currentPitch.noteName}

                {/* Check / X indicator */}
                {isCorrect && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-green-400 text-sm ml-1 inline-block"
                  >
                    &#10003;
                  </motion.span>
                )}
                {isWrong && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-red-400 text-sm ml-1 inline-block"
                  >
                    &#10007;
                  </motion.span>
                )}
              </div>
              <div className="text-xs text-white/40 font-mono mt-0.5">
                {currentPitch.frequency.toFixed(1)} Hz
              </div>
              <div className="text-[10px] text-white/30 mt-0.5">
                clarity: {(currentPitch.clarity * 100).toFixed(0)}%
              </div>
              {centsTolerance !== undefined && centsTolerance !== null && currentPitch.centsOff !== undefined && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                    {/* Tolerance zone indicator */}
                    <div
                      className="absolute top-0 h-full bg-white/10 rounded-full"
                      style={{
                        left: `${50 - (centsTolerance)}%`,
                        width: `${centsTolerance * 2}%`,
                      }}
                    />
                    {/* Current cents position */}
                    <motion.div
                      className={`absolute top-0 h-full w-1 rounded-full ${
                        Math.abs(currentPitch.centsOff) <= centsTolerance
                          ? "bg-green-400"
                          : "bg-red-400"
                      }`}
                      animate={{
                        left: `${Math.max(0, Math.min(100, 50 + currentPitch.centsOff))}%`,
                      }}
                      transition={{ duration: 0.05 }}
                    />
                  </div>
                  <span className={`text-[9px] font-mono ${
                    Math.abs(currentPitch.centsOff) <= centsTolerance
                      ? "text-green-400/60"
                      : "text-red-400/60"
                  }`}>
                    {currentPitch.centsOff > 0 ? "+" : ""}{currentPitch.centsOff}¢
                  </span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-white/20 text-sm"
            >
              &#9833;
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
