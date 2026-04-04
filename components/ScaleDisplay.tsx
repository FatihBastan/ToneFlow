"use client";

import { motion } from "framer-motion";
import type { KeyInfo } from "@/lib/musicTheory";
import { CHROMATIC_NOTES } from "@/lib/musicTheory";

interface ScaleDisplayProps {
  songKey: KeyInfo;
  currentNote: string | null; // e.g. "C#" (without octave)
  isCorrect: boolean | null;  // null = no note playing
}

export default function ScaleDisplay({
  songKey,
  currentNote,
  isCorrect,
}: ScaleDisplayProps) {
  return (
    <div className="glass px-4 py-3">
      {/* Key label */}
      <div className="text-center mb-3">
        <div className="text-white/30 text-[10px] uppercase tracking-widest mb-1">
          Song Key
        </div>
        <div
          className="text-white text-xl font-bold"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {songKey.label}
        </div>
      </div>

      {/* Scale strip */}
      <div className="flex gap-[3px] justify-center">
        {CHROMATIC_NOTES.map((note) => {
          const inScale = songKey.scaleNotes.includes(note);
          const isCurrent = currentNote === note;
          const isRoot = note === songKey.root;

          let bgColor = "bg-white/5";
          let textColor = "text-white/20";
          let glow = "";

          if (isCurrent && isCorrect === true) {
            bgColor = "bg-green-500/30";
            textColor = "text-green-300";
            glow = "shadow-[0_0_10px_rgba(74,222,128,0.5)]";
          } else if (isCurrent && isCorrect === false) {
            bgColor = "bg-red-500/30";
            textColor = "text-red-300";
            glow = "shadow-[0_0_10px_rgba(239,68,68,0.5)]";
          } else if (isRoot) {
            bgColor = "bg-white/15";
            textColor = "text-white/80";
          } else if (inScale) {
            bgColor = "bg-white/8";
            textColor = "text-white/50";
          }

          return (
            <motion.div
              key={note}
              animate={
                isCurrent
                  ? { scale: 1.15, y: -2 }
                  : { scale: 1, y: 0 }
              }
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`w-7 h-9 rounded-md flex items-center justify-center text-[10px] font-mono font-bold ${bgColor} ${textColor} ${glow} transition-colors duration-100`}
            >
              {note}
            </motion.div>
          );
        })}
      </div>

      {/* In-key percentage */}
    </div>
  );
}
