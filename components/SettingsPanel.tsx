"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  // Detector state surfaced from usePitchDetection
  detector: "nsdf" | "crepe";
  modelLoading: boolean;
  modelError: string | null;
  effectiveRmsGate: number;
  noiseFloor: number;
  /** True while the calibration window is collecting samples. */
  calibrating: boolean;
  /** Triggers another 2s calibration window. May be no-op for override modes. */
  onRecalibrate: () => void;
  /** False when the active mode pins the gate (drums / vocals). */
  canRecalibrate: boolean;
  // CREPE flag (controlled — parent owns state)
  crepeEnabled: boolean;
  onCrepeChange: (next: boolean) => void;
}

/**
 * Bucket the measured ambient RMS into a user-facing label. Thresholds
 * are anchored to the adaptive-gate envelope (`ADAPTIVE_GATE_FLOOR =
 * 0.005`, `_CEILING = 0.025` in usePitchDetection): below floor reads
 * as "Quiet" because the gate is clamped down; above ~0.012 the gate
 * is heading toward the ceiling and quiet notes will start to clip.
 */
function classifyNoiseFloor(noiseFloor: number): {
  label: string;
  tone: "quiet" | "moderate" | "loud";
  hint: string | null;
} {
  if (noiseFloor < 0.005) {
    return { label: "Quiet", tone: "quiet", hint: null };
  }
  if (noiseFloor < 0.012) {
    return { label: "Moderate", tone: "moderate", hint: null };
  }
  return {
    label: "Loud",
    tone: "loud",
    hint: "Quiet notes may clip — try a quieter spot or move closer to the mic.",
  };
}

/**
 * Small modal-style panel for diagnostics + per-device toggles.
 *
 * The CREPE flag flip persists to localStorage via the parent. Other
 * fields are read-only diagnostics — they help confirm what the
 * detector is actually doing in the current session, since the live
 * decision (CREPE vs NSDF) depends on flag, mode, and load state.
 */
export default function SettingsPanel({
  open,
  onClose,
  detector,
  modelLoading,
  modelError,
  effectiveRmsGate,
  noiseFloor,
  calibrating,
  onRecalibrate,
  canRecalibrate,
  crepeEnabled,
  onCrepeChange,
}: SettingsPanelProps) {
  const noiseClass = noiseFloor > 0 ? classifyNoiseFloor(noiseFloor) : null;
  const toneStyle = noiseClass
    ? noiseClass.tone === "quiet"
      ? "text-emerald-300/90"
      : noiseClass.tone === "moderate"
        ? "text-sky-300/90"
        : "text-amber-300/90"
    : "text-white/80";
  // Close on Escape
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            aria-hidden="true"
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[min(360px,90vw)] glass p-5 text-white/80"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-white/60">
                Settings
              </h2>
              <button
                onClick={onClose}
                aria-label="Close settings"
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <section className="space-y-4">
              {/* CREPE toggle */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white/80">
                    Neural pitch detection
                  </div>
                  <div className="text-[11px] text-white/50 mt-0.5 leading-snug">
                    Use CREPE-tiny for instrument modes. Vocals, drums and
                    auto-detect always use the autocorrelator.
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={crepeEnabled}
                  onClick={() => onCrepeChange(!crepeEnabled)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                    crepeEnabled ? "bg-purple-500/70" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
                      crepeEnabled ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Diagnostics */}
              <div className="border-t border-white/10 pt-4">
                <div className="text-[10px] font-medium uppercase tracking-widest text-white/40 mb-2">
                  Diagnostics
                </div>
                <dl className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-white/50">Active detector</dt>
                    <dd className="text-white/80 font-mono">
                      {modelLoading
                        ? "loading model…"
                        : detector === "crepe"
                          ? "CREPE-tiny"
                          : "NSDF autocorrelator"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/50">RMS gate</dt>
                    <dd className="text-white/80 font-mono">
                      {effectiveRmsGate > 0
                        ? effectiveRmsGate.toFixed(4)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/50">Noise floor</dt>
                    <dd className="font-mono flex items-center gap-2">
                      <span className="text-white/80">
                        {noiseFloor > 0 ? noiseFloor.toFixed(4) : "—"}
                      </span>
                      {noiseClass && (
                        <span className={`text-[10px] uppercase tracking-wider ${toneStyle}`}>
                          {noiseClass.label}
                        </span>
                      )}
                    </dd>
                  </div>
                  {noiseClass?.hint && (
                    <div className="text-amber-300/70 text-[11px] mt-1 leading-snug">
                      {noiseClass.hint}
                    </div>
                  )}
                  {modelError && (
                    <div className="text-amber-300/80 text-[11px] mt-2">
                      {modelError}
                    </div>
                  )}
                </dl>

                <button
                  type="button"
                  onClick={onRecalibrate}
                  disabled={!canRecalibrate || calibrating}
                  className="mt-3 w-full text-xs font-medium px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 disabled:cursor-not-allowed transition-colors text-white/75"
                >
                  {calibrating
                    ? "Calibrating…"
                    : canRecalibrate
                      ? "Recalibrate mic"
                      : "Recalibrate (mode uses fixed gate)"}
                </button>
              </div>

              <div className="text-[10px] text-white/30 pt-2 leading-snug">
                Toggling the detector takes effect on the next session start —
                tap the back button and re-pick a mode.
              </div>
            </section>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
