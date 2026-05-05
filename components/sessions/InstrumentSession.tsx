"use client";

import { useState, useEffect, useRef } from "react";
import LyricsDisplay from "@/components/LyricsDisplay";
import ScaleDisplay from "@/components/ScaleDisplay";
import type { LyricLine, PitchData, FeedbackType } from "@/types";
import type { KeyInfo } from "@/lib/musicTheory";
import { getKeyInfo, isNoteInKey, estimateKey } from "@/lib/musicTheory";

interface InstrumentSessionProps {
  lyrics: LyricLine[];
  currentTime: number;
  currentPitch: PitchData | null;
  songKey?: string; // e.g. "A Minor"
  feedback: FeedbackType;
  detector?: "nsdf" | "crepe";
}

export default function InstrumentSession({
  lyrics,
  currentTime,
  currentPitch,
  songKey,
  feedback,
  detector,
}: InstrumentSessionProps) {
  const [keyInfo, setKeyInfo] = useState<KeyInfo>(() => getKeyInfo("C", "Major"));
  const [inKeyPercent, setInKeyPercent] = useState(100);
  const notesRef = useRef<{ note: string; inKey: boolean }[]>([]);

  // Parse song key or estimate from detected notes
  useEffect(() => {
    if (songKey) {
      const parts = songKey.split(" ");
      if (parts.length >= 2) {
        const quality = parts[1].toLowerCase().includes("min") ? "Minor" : "Major";
        setKeyInfo(getKeyInfo(parts[0], quality));
        return;
      }
    }
  }, [songKey]);

  // Track notes for in-key percentage and key estimation
  useEffect(() => {
    if (!currentPitch) return;
    const clean = currentPitch.noteName.replace(/\d+$/, "");
    const inKey = isNoteInKey(currentPitch.noteName, keyInfo);
    notesRef.current.push({ note: clean, inKey });

    // Keep last 50 notes
    if (notesRef.current.length > 50) {
      notesRef.current = notesRef.current.slice(-50);
    }

    const inKeyCount = notesRef.current.filter((n) => n.inKey).length;
    setInKeyPercent(Math.round((inKeyCount / notesRef.current.length) * 100));

    // Re-estimate key every 20 notes if no songKey provided
    if (!songKey && notesRef.current.length % 20 === 0) {
      const estimated = estimateKey(notesRef.current.map((n) => n.note));
      setKeyInfo(estimated);
    }
  }, [currentPitch, keyInfo, songKey]);

  const currentNoteClean = currentPitch
    ? currentPitch.noteName.replace(/\d+$/, "")
    : null;

  const noteInKey = currentNoteClean
    ? isNoteInKey(currentPitch!.noteName, keyInfo)
    : null;

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Blurred lyrics as ambient texture */}
      {lyrics.length > 0 && (
        <div className="w-full opacity-50">
          <LyricsDisplay
            lyrics={lyrics}
            currentTime={currentTime}
            blurred
          />
        </div>
      )}

      {/* Main instrument display */}
      <div className="w-full max-w-md space-y-3">
        {/* Large detected note */}
        <div className="text-center">
          <div
            className={`text-5xl font-bold transition-colors duration-100 ${
              noteInKey === true
                ? "text-green-300"
                : noteInKey === false
                  ? "text-red-300"
                  : "text-white/20"
            }`}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {currentPitch ? currentPitch.noteName : "---"}
          </div>
          {currentPitch && (
            <div className="text-white/30 text-xs font-mono mt-1 flex items-center justify-center gap-2">
              <span>{currentPitch.frequency.toFixed(1)} Hz</span>
              {currentPitch.centsOff !== undefined && Math.abs(currentPitch.centsOff) >= 1 && (
                <span
                  className={`text-[10px] ${
                    Math.abs(currentPitch.centsOff) <= 15
                      ? "text-green-400/70"
                      : Math.abs(currentPitch.centsOff) <= 35
                        ? "text-amber-400/70"
                        : "text-red-400/70"
                  }`}
                  title="Cents off the nearest equal-tempered note"
                >
                  {currentPitch.centsOff > 0 ? "+" : ""}
                  {currentPitch.centsOff.toFixed(0)}¢
                </span>
              )}
              {detector === "crepe" && (
                <span
                  className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest text-purple-300/70 bg-purple-500/10 border border-purple-400/20"
                  title="Pitch is being read by the CREPE-tiny neural detector"
                >
                  CREPE
                </span>
              )}
            </div>
          )}
        </div>

        {/* Scale reference strip */}
        <ScaleDisplay
          songKey={keyInfo}
          currentNote={currentNoteClean}
          isCorrect={noteInKey}
        />

        {/* In-key percentage */}
        <div className="flex items-center justify-center gap-2">
          <div className="text-white/30 text-xs">Notes in key:</div>
          <div
            className={`text-sm font-bold font-mono ${
              inKeyPercent >= 80
                ? "text-green-400"
                : inKeyPercent >= 50
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          >
            {inKeyPercent}%
          </div>
        </div>
      </div>
    </div>
  );
}
