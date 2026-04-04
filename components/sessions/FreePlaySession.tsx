"use client";

import { motion } from "framer-motion";
import type { PitchData } from "@/types";

interface FreePlaySessionProps {
  currentPitch: PitchData | null;
  rms: number;
}

export default function FreePlaySession({
  currentPitch,
  rms,
}: FreePlaySessionProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Big note display */}
      <div className="text-center">
        {currentPitch ? (
          <motion.div
            key={currentPitch.noteName}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div
              className="text-6xl font-bold text-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currentPitch.noteName}
            </div>
            <div className="text-white/30 text-sm font-mono mt-2">
              {currentPitch.frequency.toFixed(1)} Hz
            </div>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: [0.15, 0.3, 0.15] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            <div
              className="text-6xl font-bold text-white/10"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              &#9835;
            </div>
            <div className="text-white/20 text-sm mt-2">
              Just play — no judgment
            </div>
          </motion.div>
        )}
      </div>

      {/* Volume visualization */}
      <div className="flex items-end gap-[2px] h-12">
        {Array.from({ length: 32 }).map((_, i) => {
          const center = 16;
          const dist = Math.abs(i - center) / center;
          const h = Math.max(2, (1 - dist) * rms * 200);
          return (
            <motion.div
              key={i}
              className="w-[3px] rounded-full bg-white/20"
              animate={{ height: h }}
              transition={{ duration: 0.05 }}
            />
          );
        })}
      </div>
    </div>
  );
}
