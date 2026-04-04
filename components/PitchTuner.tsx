"use client";

import { motion } from "framer-motion";

interface PitchTunerProps {
  centsOff: number; // -50 to +50
  isActive: boolean;
}

export default function PitchTuner({ centsOff, isActive }: PitchTunerProps) {
  // Clamp to -50..+50 range
  const clamped = Math.max(-50, Math.min(50, centsOff));
  // Map to -1..1 for needle position
  const position = clamped / 50;
  const isOnPitch = Math.abs(clamped) < 10;

  return (
    <div className="glass px-3 py-2 w-36">
      <div className="text-[10px] text-white/30 text-center mb-1.5 font-mono uppercase tracking-wider">
        Tuner
      </div>

      {/* Scale markers */}
      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden mx-1">
        {/* Center green zone */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[20%] bg-green-500/15 rounded-full" />

        {/* Needle */}
        {isActive ? (
          <motion.div
            className={`absolute top-0 bottom-0 w-1 rounded-full ${
              isOnPitch ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" : "bg-white/60"
            }`}
            animate={{
              left: `${50 + position * 45}%`,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            style={{ marginLeft: "-2px" }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 w-1 rounded-full bg-white/20"
            style={{ left: "50%", marginLeft: "-2px" }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[9px] text-white/20">Flat</span>
        <span className={`text-[9px] ${isOnPitch && isActive ? "text-green-400" : "text-white/20"}`}>
          {isActive ? (isOnPitch ? "On pitch" : `${clamped > 0 ? "+" : ""}${clamped}c`) : "---"}
        </span>
        <span className="text-[9px] text-white/20">Sharp</span>
      </div>
    </div>
  );
}
