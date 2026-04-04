"use client";

import { motion } from "framer-motion";
import { MODE_LIST } from "@/lib/modeConfig";
import type { PerformanceMode } from "@/types";

interface ModeSelectorProps {
  onSelect: (mode: PerformanceMode) => void;
}

export default function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="w-full max-w-md" role="region" aria-label="Performance mode selection">
      <p id="mode-selector-label" className="text-white/40 text-xs uppercase tracking-widest text-center mb-4">
        Choose your mode
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-labelledby="mode-selector-label">
        {MODE_LIST.map((mode, i) => (
          <motion.button
            key={mode.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(mode.id)}
            aria-label={`${mode.label} mode`}
            className="glass flex flex-col items-center gap-1.5 px-2 py-3 sm:py-3 hover:bg-white/10 active:bg-white/15 transition-colors group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">
              {mode.emoji}
            </span>
            <span className="text-white/70 text-[11px] font-medium leading-tight text-center">
              {mode.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
