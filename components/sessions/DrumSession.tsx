"use client";

import { useState, useEffect, useRef } from "react";
import BeatTimeline from "@/components/BeatTimeline";
import type { BeatHit } from "@/types";

interface DrumSessionProps {
  rms: number;
}

const SILENCE_THRESHOLD = 0.05;
const HIT_THRESHOLD = 0.12;
const HIT_COOLDOWN_MS = 80;

export default function DrumSession({ rms }: DrumSessionProps) {
  const [beats, setBeats] = useState<BeatHit[]>([]);
  const [bpm, setBpm] = useState(0);
  const [hitCount, setHitCount] = useState(0);

  const prevRmsRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const recentIntervalsRef = useRef<number[]>([]);

  // Detect hits from RMS spikes
  useEffect(() => {
    const now = Date.now();
    const wasQuiet = prevRmsRef.current < SILENCE_THRESHOLD;
    const isHit = rms > HIT_THRESHOLD && wasQuiet;
    const cooldownOk = now - lastHitTimeRef.current > HIT_COOLDOWN_MS;

    if (isHit && cooldownOk) {
      const interval = now - lastHitTimeRef.current;
      lastHitTimeRef.current = now;

      // Track intervals for BPM and regularity
      if (interval > 100 && interval < 3000) {
        recentIntervalsRef.current.push(interval);
        if (recentIntervalsRef.current.length > 16) {
          recentIntervalsRef.current = recentIntervalsRef.current.slice(-16);
        }

        // Calculate BPM from average interval
        const intervals = recentIntervalsRef.current;
        if (intervals.length >= 3) {
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          setBpm(Math.round(60000 / avg));
        }
      }

      // Check regularity — is this hit close to the average interval?
      const intervals = recentIntervalsRef.current;
      let isRegular = true;
      if (intervals.length >= 3) {
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const deviation = Math.abs(interval - avg) / avg;
        isRegular = deviation < 0.25; // within 25% of average
      }

      const newBeat: BeatHit = {
        time: now,
        intensity: Math.min(rms * 3, 1),
        isRegular,
      };

      setBeats((prev) => [...prev.slice(-40), newBeat]);
      setHitCount((c) => c + 1);
    }

    prevRmsRef.current = rms;
  }, [rms]);

  return (
    <div className="w-full flex flex-col items-center gap-4 max-w-lg">
      {/* Large BPM display */}
      <div className="text-center">
        <div className="text-white/30 text-[10px] uppercase tracking-widest mb-1">
          Detected BPM
        </div>
        <div
          className="text-5xl font-bold text-white"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {bpm > 0 ? bpm : "---"}
        </div>
        <div className="text-white/20 text-xs mt-1 font-mono">
          {hitCount} hits
        </div>
      </div>

      {/* Beat timeline */}
      <BeatTimeline beats={beats} bpm={bpm} />
    </div>
  );
}
