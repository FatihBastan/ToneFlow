"use client";

import { motion } from "framer-motion";
import type { SongInfo as SongInfoType } from "@/types";

interface SongInfoProps {
  song: SongInfoType | null;
}

export default function SongInfo({ song }: SongInfoProps) {
  if (!song) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      role="status"
      aria-label={`Now playing: ${song.title} by ${song.artist}`}
      className="glass px-3 py-2.5 sm:px-6 sm:py-4 flex items-center gap-3 sm:gap-4 max-w-[85vw] sm:max-w-md"
    >
      {song.albumArtUrl && (
        <img
          src={song.albumArtUrl}
          alt={song.album}
          className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg shadow-lg shrink-0"
          crossOrigin="anonymous"
        />
      )}
      <div className="min-w-0">
        <h2 className="text-white font-semibold text-sm sm:text-lg truncate">
          {song.title}
        </h2>
        <p className="text-white/60 text-sm truncate">{song.artist}</p>
        <p className="text-white/40 text-xs truncate">{song.album}</p>
        <p className="text-white/25 text-[10px] mt-0.5 flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          via Spotify
        </p>
      </div>
    </motion.div>
  );
}
