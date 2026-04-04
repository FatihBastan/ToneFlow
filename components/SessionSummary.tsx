"use client";

import { motion } from "framer-motion";
import type { SessionStats } from "@/types";

interface SessionSummaryProps {
  stats: SessionStats;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getGrade(accuracy: number): { label: string; color: string } {
  if (accuracy >= 95) return { label: "S", color: "text-purple-400" };
  if (accuracy >= 85) return { label: "A", color: "text-green-400" };
  if (accuracy >= 70) return { label: "B", color: "text-blue-400" };
  if (accuracy >= 50) return { label: "C", color: "text-amber-400" };
  return { label: "D", color: "text-red-400" };
}

export default function SessionSummary({ stats, onClose }: SessionSummaryProps) {
  const grade = getGrade(stats.accuracyPercent);

  const statItems = [
    { label: "Notes hit", value: `${stats.correctNotes}/${stats.totalNotes}` },
    { label: "Accuracy", value: `${stats.accuracyPercent}%` },
    { label: "Longest streak", value: stats.longestStreak.toString() },
    { label: "Time played", value: formatDuration(stats.sessionDurationMs) },
    { label: "Difficulty", value: stats.difficulty.charAt(0).toUpperCase() + stats.difficulty.slice(1) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="glass w-full max-w-sm p-6 flex flex-col items-center gap-5"
      >
        {/* Song info */}
        <div className="text-center">
          <p className="text-white/40 text-xs uppercase tracking-widest">Session complete</p>
          <p className="text-white/80 text-sm font-medium mt-1 truncate max-w-[280px]">
            {stats.songTitle}
          </p>
          <p className="text-white/40 text-xs truncate max-w-[280px]">
            {stats.songArtist}
          </p>
        </div>

        {/* Grade */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
          className={`text-6xl font-bold ${grade.color}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {grade.label}
        </motion.div>

        {/* Stats grid */}
        <div className="w-full space-y-2">
          {statItems.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.06 }}
              className="flex justify-between items-center px-2"
            >
              <span className="text-white/40 text-xs">{item.label}</span>
              <span className="text-white/80 text-sm font-mono font-medium">{item.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Close button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/70 text-sm font-medium transition-colors mt-2"
        >
          Done
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
