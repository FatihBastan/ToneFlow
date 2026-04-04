"use client";

import { useRef, useEffect, useCallback } from "react";
import type { BeatHit } from "@/types";

interface BeatTimelineProps {
  beats: BeatHit[];
  bpm: number;
}

export default function BeatTimeline({ beats, bpm }: BeatTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const beatsRef = useRef(beats);
  beatsRef.current = beats;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const now = Date.now();
    const windowMs = 8000; // Show 8 seconds of timeline
    const centerX = width * 0.15; // Playhead position

    ctx.clearRect(0, 0, width, height);

    // Background track
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, height / 2 - 1, width, 2);

    // Playhead line
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(centerX, 8, 2, height - 16);

    // Draw beat markers
    const current = beatsRef.current;
    for (const beat of current) {
      const age = now - beat.time;
      if (age < 0 || age > windowMs) continue;

      const x = centerX - (age / windowMs) * (width - centerX - 20) + (width - centerX - 20);
      // Actually — beats scroll left, newest at playhead
      const xPos = centerX + ((windowMs - age) / windowMs) * (width - centerX - 20);
      const alpha = 1 - age / windowMs;

      // Marker
      const markerSize = 6 + beat.intensity * 6;
      const color = beat.isRegular
        ? `rgba(74, 222, 128, ${alpha})`
        : `rgba(239, 68, 68, ${alpha})`;

      ctx.beginPath();
      ctx.arc(xPos, height / 2, markerSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Glow
      if (beat.isRegular && alpha > 0.5) {
        ctx.beginPath();
        ctx.arc(xPos, height / 2, markerSize + 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 222, 128, ${alpha * 0.15})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = (rect?.width ?? 400) * 2;
    canvas.height = 80;
    canvas.style.width = "100%";
    canvas.style.height = "40px";

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div className="glass px-4 py-3 w-full">
      {/* BPM display */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/30 text-[10px] uppercase tracking-widest">
          Beat Timeline
        </div>
        <div
          className="text-white/60 text-sm font-bold"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {bpm > 0 ? `${bpm} BPM` : "---"}
        </div>
      </div>

      <canvas ref={canvasRef} />

      <div className="flex items-center justify-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-[10px] text-white/30">On beat</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-[10px] text-white/30">Off beat</span>
        </div>
      </div>
    </div>
  );
}
