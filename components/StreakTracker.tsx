"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StreakState } from "@/types";

interface StreakTrackerProps {
  streak: StreakState;
}

interface FloatingPlus {
  id: number;
  x: number;
}

const tierConfig = {
  none: { label: "", color: "text-white/30", glow: "" },
  warming_up: { label: "Warming Up", color: "text-amber-400", glow: "streak-glow-warming" },
  on_fire: { label: "On Fire!", color: "text-orange-400", glow: "streak-glow-fire" },
  blazing: { label: "BLAZING", color: "text-red-400", glow: "streak-glow-blazing" },
  legendary: { label: "LEGENDARY!", color: "text-purple-400", glow: "streak-glow-legendary" },
};

let plusIdCounter = 0;

export default function StreakTracker({ streak }: StreakTrackerProps) {
  const [floats, setFloats] = useState<FloatingPlus[]>([]);
  const [showBreak, setShowBreak] = useState(false);
  const prevCountRef = useRef(streak.count);

  // Spawn +1 float when count increases
  useEffect(() => {
    if (streak.count > prevCountRef.current && streak.count > 0) {
      const id = ++plusIdCounter;
      const x = -10 + Math.random() * 20;
      setFloats((prev) => [...prev.slice(-6), { id, x }]);

      // Clean up after animation
      setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
      }, 900);
    }

    // Detect streak break
    if (streak.justBroke) {
      setShowBreak(true);
      setTimeout(() => setShowBreak(false), 600);
    }

    prevCountRef.current = streak.count;
  }, [streak.count, streak.justBroke]);

  const config = tierConfig[streak.tier];

  return (
    <div className="relative" role="status" aria-label={`Streak: ${streak.count}${config.label ? `, ${config.label}, ${streak.multiplier}x multiplier` : ''}`} aria-live="polite">
      {/* Floating +1 indicators */}
      <div className="absolute -top-2 left-1/2 pointer-events-none">
        <AnimatePresence>
          {floats.map((f) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 1, y: 0, x: f.x }}
              animate={{ opacity: 0, y: -40, x: f.x }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute text-green-400 text-xs font-bold font-mono whitespace-nowrap"
            >
              +1
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Break animation */}
      <AnimatePresence>
        {showBreak && (
          <motion.div
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <div className="text-red-500 text-4xl font-bold font-mono opacity-60">
              {prevCountRef.current}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main counter */}
      <AnimatePresence mode="wait">
        {streak.count > 0 ? (
          <motion.div
            key="active"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={`glass px-3 py-2 sm:px-5 sm:py-3 text-center ${config.glow}`}
          >
            <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <motion.span
                key={streak.count}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
                className="text-2xl sm:text-3xl font-bold tracking-wider text-white inline-block"
              >
                {streak.count}
              </motion.span>
            </div>

            {config.label && (
              <motion.div
                className={`text-xs font-semibold uppercase tracking-widest mt-1 ${config.color}`}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {config.label} · {streak.multiplier}x
              </motion.div>
            )}
          </motion.div>
        ) : showBreak ? (
          <motion.div
            key="broken"
            initial={{ scale: 1.2, opacity: 1 }}
            animate={{
              scale: [1.2, 0.8, 1],
              opacity: [1, 0.5, 0.8],
            }}
            transition={{ duration: 0.5 }}
            className="glass px-5 py-3 text-center border-red-500/30"
          >
            <div
              className="text-3xl font-bold tracking-wider text-red-400/50"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              0
            </div>
            <div className="text-[10px] text-red-400/50 uppercase tracking-widest mt-1">
              Streak lost
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
