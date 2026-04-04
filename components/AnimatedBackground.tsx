"use client";

import { useRef, useEffect, useCallback } from "react";
import type { ColorOrb, FeedbackType } from "@/types";

interface AnimatedBackgroundProps {
  colors: string[];
  intensity: number; // 0-1, driven by audio RMS
  feedback: FeedbackType;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createOrbs(colors: string[], width: number, height: number): ColorOrb[] {
  return colors.map((color, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: 150 + Math.random() * 200,
    color,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    phase: (i / colors.length) * Math.PI * 2,
  }));
}

export default function AnimatedBackground({
  colors,
  intensity,
  feedback,
}: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<ColorOrb[]>([]);
  const animRef = useRef<number>(0);
  const colorsRef = useRef<string[]>(colors);
  const intensityRef = useRef(intensity);
  const feedbackRef = useRef(feedback);
  // Smooth feedback boost that decays over time
  const boostRef = useRef(0);   // -1 to +1 (positive = correct pulse, negative = wrong dim)
  const wrongFlashRef = useRef(0); // 0-1 for red vignette

  intensityRef.current = intensity;
  feedbackRef.current = feedback;

  // React to feedback changes
  useEffect(() => {
    if (feedback === "correct") {
      boostRef.current = Math.min(boostRef.current + 0.5, 1);
    } else if (feedback === "wrong") {
      boostRef.current = -0.7;
      wrongFlashRef.current = 0.6;
    }
  }, [feedback]);

  // Re-create orbs when colors change
  useEffect(() => {
    colorsRef.current = colors;
    const canvas = canvasRef.current;
    if (canvas && colors.length > 0) {
      orbsRef.current = createOrbs(colors, canvas.width, canvas.height);
    }
  }, [colors]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const orbs = orbsRef.current;
    const amp = intensityRef.current;
    const time = Date.now() / 1000;

    // Decay boost/flash each frame
    boostRef.current *= 0.95;
    wrongFlashRef.current *= 0.92;
    const boost = boostRef.current;
    const wrongFlash = wrongFlashRef.current;

    // Dark background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);

    // Feedback-reactive scale multiplier: correct = expand, wrong = shrink
    const fbScale = boost > 0 ? 1 + boost * 0.3 : 1 + boost * 0.15;
    // Feedback-reactive alpha: correct = brighter, wrong = dimmer
    const fbAlpha = boost > 0 ? 1 + boost * 0.5 : 1 + boost * 0.4;

    for (const orb of orbs) {
      orb.x += orb.vx + Math.sin(time + orb.phase) * 0.3;
      orb.y += orb.vy + Math.cos(time + orb.phase) * 0.3;

      if (orb.x < -orb.radius) orb.x = width + orb.radius;
      if (orb.x > width + orb.radius) orb.x = -orb.radius;
      if (orb.y < -orb.radius) orb.y = height + orb.radius;
      if (orb.y > height + orb.radius) orb.y = -orb.radius;

      const pulsate = 1 + Math.sin(time * 2 + orb.phase) * 0.15 * (1 + amp * 3);
      const r = orb.radius * pulsate * fbScale;

      const baseAlpha = 0.25;
      const alpha = (baseAlpha + amp * 0.4) * Math.max(0.15, fbAlpha);

      const gradient = ctx.createRadialGradient(
        orb.x, orb.y, 0,
        orb.x, orb.y, r
      );
      gradient.addColorStop(0, hexToRgba(orb.color, alpha));
      gradient.addColorStop(0.6, hexToRgba(orb.color, alpha * 0.4));
      gradient.addColorStop(1, hexToRgba(orb.color, 0));

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    // Red vignette flash on wrong notes
    if (wrongFlash > 0.02) {
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.3,
        width / 2, height / 2, height * 0.9
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, `rgba(220, 40, 40, ${wrongFlash * 0.35})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    // Subtle overlay
    ctx.fillStyle = "rgba(10, 10, 15, 0.05)";
    ctx.fillRect(0, 0, width, height);

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (colorsRef.current.length > 0) {
        orbsRef.current = createOrbs(colorsRef.current, canvas.width, canvas.height);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  useEffect(() => {
    if (colors.length === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        orbsRef.current = createOrbs(
          ["#1a1a2e", "#16213e", "#0f3460"],
          canvas.width,
          canvas.height
        );
      }
    }
  }, [colors]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
