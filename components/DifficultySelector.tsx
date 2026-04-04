"use client";

import { motion } from "framer-motion";
import { DIFFICULTY_LIST } from "@/lib/difficultyConfig";
import type { Difficulty } from "@/types";

interface DifficultySelectorProps {
  selected: Difficulty;
  onChange: (difficulty: Difficulty) => void;
}

export default function DifficultySelector({ selected, onChange }: DifficultySelectorProps) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Difficulty">
      <span className="text-white/30 text-[10px] uppercase tracking-widest mr-1">Difficulty</span>
      {DIFFICULTY_LIST.map((d) => {
        const isActive = selected === d.id;
        return (
          <motion.button
            key={d.id}
            onClick={() => onChange(d.id)}
            whileTap={{ scale: 0.92 }}
            role="radio"
            aria-checked={isActive}
            aria-label={`${d.label}: ${d.description}`}
            className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs sm:text-[11px] font-medium transition-all border ${
              isActive
                ? `${d.color} bg-white/10 border-white/20`
                : "text-white/30 bg-white/5 border-white/5 hover:bg-white/8 hover:text-white/50"
            }`}
          >
            {d.label}
          </motion.button>
        );
      })}
    </div>
  );
}
