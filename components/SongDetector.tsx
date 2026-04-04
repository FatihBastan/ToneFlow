"use client";

import { motion } from "framer-motion";

interface SongDetectorProps {
  isDetecting: boolean;
}

/**
 * Visual indicator shown while ACRCloud is processing audio.
 */
export default function SongDetector({ isDetecting }: SongDetectorProps) {
  if (!isDetecting) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2 text-white/50 text-sm"
    >
      <motion.div
        className="w-2 h-2 rounded-full bg-blue-400"
        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      />
      Identifying song...
    </motion.div>
  );
}
