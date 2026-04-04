"use client";

import LyricsDisplay from "@/components/LyricsDisplay";
import ScaleDisplay from "@/components/ScaleDisplay";
import PitchTuner from "@/components/PitchTuner";
import type { LyricLine, PitchData, FeedbackType } from "@/types";
import type { KeyInfo } from "@/lib/musicTheory";
import { getKeyInfo, isNoteInKey } from "@/lib/musicTheory";

interface FullPerformanceSessionProps {
  lyrics: LyricLine[];
  currentTime: number;
  currentPitch: PitchData | null;
  songKey?: string;
  feedback: FeedbackType;
}

export default function FullPerformanceSession({
  lyrics,
  currentTime,
  currentPitch,
  songKey,
  feedback,
}: FullPerformanceSessionProps) {
  const keyInfo = songKey
    ? (() => {
        const parts = songKey.split(" ");
        const quality = (parts[1] ?? "").toLowerCase().includes("min")
          ? "Minor" as const
          : "Major" as const;
        return getKeyInfo(parts[0], quality);
      })()
    : getKeyInfo("C", "Major");

  const currentNoteClean = currentPitch
    ? currentPitch.noteName.replace(/\d+$/, "")
    : null;
  const noteInKey = currentNoteClean
    ? isNoteInKey(currentPitch!.noteName, keyInfo)
    : null;

  return (
    <div className="w-full flex flex-col gap-3 h-full max-h-[60vh]">
      {/* Top half — Lyrics with karaoke */}
      <div className="flex-1 min-h-0">
        {lyrics.length > 0 ? (
          <LyricsDisplay
            lyrics={lyrics}
            currentTime={currentTime}
            feedback={feedback}
            compact
          />
        ) : (
          <p className="text-white/30 text-sm text-center py-4">
            No synced lyrics found
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 mx-4" />

      {/* Bottom half — Instrument pitch display */}
      <div className="flex items-center gap-4 px-4">
        {/* Current note large */}
        <div className="text-center flex-shrink-0">
          <div
            className={`text-3xl font-bold transition-colors duration-100 ${
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
        </div>

        {/* Scale strip */}
        <div className="flex-1 min-w-0">
          <ScaleDisplay
            songKey={keyInfo}
            currentNote={currentNoteClean}
            isCorrect={noteInKey}
          />
        </div>

        {/* Pitch tuner */}
        <PitchTuner
          centsOff={currentPitch?.centsOff ?? 0}
          isActive={!!currentPitch}
        />
      </div>
    </div>
  );
}
