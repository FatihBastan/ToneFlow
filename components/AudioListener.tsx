"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

interface AudioListenerProps {
  isListening: boolean;
  rms: number;
}

/**
 * Visual waveform ring that shows audio intensity while listening.
 */
export default function AudioListener({
  isListening,
  rms,
}: AudioListenerProps) {
  if (!isListening) return null;

  const bars = 24;
  const amplitude = Math.min(rms * 400, 100);

  return (
    <div className="flex items-center justify-center gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const offset = Math.abs(i - bars / 2) / (bars / 2);
        const height = Math.max(4, amplitude * (1 - offset * 0.6) * (0.5 + Math.random() * 0.5));

        return (
          <motion.div
            key={i}
            className="w-[3px] rounded-full bg-white/40"
            animate={{ height }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </div>
  );
}
