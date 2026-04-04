"use client";

import { useRef, useEffect, useCallback } from "react";
import type { FeedbackType } from "@/types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ParticleEffectsProps {
  feedback: FeedbackType;
  streakCount: number;
  /** Screen position to emit from — defaults to center-bottom */
  emitX?: number;
  emitY?: number;
}

export default function ParticleEffects({
  feedback,
  streakCount,
  emitX,
  emitY,
}: ParticleEffectsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef(0);
  const prevFeedbackRef = useRef<FeedbackType>("neutral");

  // Spawn particles on correct feedback when streak is high enough
  useEffect(() => {
    if (feedback === "correct" && prevFeedbackRef.current !== "correct" && streakCount >= 15) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const cx = emitX ?? canvas.width / 2;
      const cy = emitY ?? canvas.height * 0.7;
      const count = Math.min(8 + Math.floor(streakCount / 10), 20);

      const colors =
        streakCount >= 50
          ? ["#a855f7", "#c084fc", "#e879f9", "#f0abfc"]
          : streakCount >= 30
            ? ["#ef4444", "#f97316", "#fbbf24"]
            : ["#22c55e", "#4ade80", "#86efac"];

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 2 + Math.random() * 4;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life: 1,
          maxLife: 0.6 + Math.random() * 0.4,
          size: 2 + Math.random() * 3,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }
    prevFeedbackRef.current = feedback;
  }, [feedback, streakCount, emitX, emitY]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dt = 1 / 60;
    const alive: Particle[] = [];

    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= dt / p.maxLife;

      if (p.life <= 0) continue;
      alive.push(p);

      const alpha = p.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2 * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    particlesRef.current = alive;

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  );
}
