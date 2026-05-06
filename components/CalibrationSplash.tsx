"use client";

import { motion, AnimatePresence } from "framer-motion";

interface CalibrationSplashProps {
  /** True while the noise-floor calibration window is collecting samples. */
  active: boolean;
  /** Calibration window length, in milliseconds. Drives the progress bar. */
  durationMs?: number;
}

/**
 * Full-screen overlay shown during the 2s noise-floor calibration window.
 *
 * Replaces the small "Calibrating mic — hold still…" toast with a card
 * that visually pauses the UI. The user can't usefully interact during
 * calibration anyway — any audio we capture in this window seeds the
 * adaptive RMS gate, so a stray keystroke or shout would shift the
 * gate. Surfacing it as a splash makes the "hold still" instruction
 * obvious instead of hidden in a corner toast.
 */
export default function CalibrationSplash({
  active,
  durationMs = 2000,
}: CalibrationSplashProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          aria-label="Calibrating microphone"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 12, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="glass px-8 py-7 w-[min(380px,90vw)] text-center text-white/85"
          >
            <div className="flex items-center justify-center mb-4">
              <span className="relative inline-flex w-3 h-3">
                <span className="absolute inset-0 rounded-full bg-purple-400/40 animate-ping" />
                <span className="relative w-3 h-3 rounded-full bg-purple-400" />
              </span>
            </div>
            <div className="text-base font-semibold tracking-wide">
              Calibrating mic
            </div>
            <div className="text-xs text-white/55 mt-1.5 leading-relaxed">
              Hold still — measuring the room so the gate can adapt to
              your environment.
            </div>
            <div
              className="mt-5 h-1 w-full rounded-full bg-white/10 overflow-hidden"
              aria-hidden="true"
            >
              <motion.div
                key="progress"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: durationMs / 1000, ease: "linear" }}
                className="h-full bg-gradient-to-r from-purple-400 to-pink-400"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
