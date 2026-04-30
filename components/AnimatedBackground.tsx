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
  // Spawn 2× the colors so the field feels rich even with few palette stops
  const slots = Math.max(colors.length * 2, 6);
  return Array.from({ length: slots }, (_, i) => {
    const color = colors[i % colors.length];
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 180 + Math.random() * 280,
      color,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      phase: (i / slots) * Math.PI * 2,
    };
  });
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
  // Smoothed intensity so the background doesn't strobe with every transient
  const smoothedAmpRef = useRef(0);
  // Smooth feedback boost that decays over time
  const boostRef = useRef(0);
  const wrongFlashRef = useRef(0);
  // DPR for sharp rendering on retina
  const dprRef = useRef(1);

  intensityRef.current = intensity;
  feedbackRef.current = feedback;

  useEffect(() => {
    if (feedback === "correct") {
      boostRef.current = Math.min(boostRef.current + 0.55, 1);
    } else if (feedback === "wrong") {
      boostRef.current = -0.7;
      wrongFlashRef.current = 0.55;
    }
  }, [feedback]);

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
    const dpr = dprRef.current;
    const orbs = orbsRef.current;

    // Smooth the audio amplitude so the orbs glide rather than strobe
    const targetAmp = intensityRef.current;
    smoothedAmpRef.current += (targetAmp - smoothedAmpRef.current) * 0.18;
    const amp = smoothedAmpRef.current;

    const time = Date.now() / 1000;

    boostRef.current *= 0.94;
    wrongFlashRef.current *= 0.9;
    const boost = boostRef.current;
    const wrongFlash = wrongFlashRef.current;

    // Deep gradient base — feels less flat than a single color
    const baseGrad = ctx.createRadialGradient(
      width / 2, height * 0.5, 0,
      width / 2, height * 0.5, Math.max(width, height) * 0.85
    );
    baseGrad.addColorStop(0, "#0d0d18");
    baseGrad.addColorStop(1, "#05050a");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    const fbScale = boost > 0 ? 1 + boost * 0.28 : 1 + boost * 0.15;
    const fbAlpha = boost > 0 ? 1 + boost * 0.5 : 1 + boost * 0.4;

    // Time-evolving drift makes the canvas never look static, even at silence
    for (const orb of orbs) {
      orb.x += orb.vx + Math.sin(time * 0.8 + orb.phase) * 0.35;
      orb.y += orb.vy + Math.cos(time * 0.7 + orb.phase) * 0.35;

      if (orb.x < -orb.radius) orb.x = width + orb.radius;
      if (orb.x > width + orb.radius) orb.x = -orb.radius;
      if (orb.y < -orb.radius) orb.y = height + orb.radius;
      if (orb.y > height + orb.radius) orb.y = -orb.radius;

      const pulsate = 1 + Math.sin(time * 2 + orb.phase) * 0.18 * (1 + amp * 3.5);
      const r = orb.radius * pulsate * fbScale;

      const baseAlpha = 0.22;
      const alpha = (baseAlpha + amp * 0.45) * Math.max(0.15, fbAlpha);

      const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, r);
      gradient.addColorStop(0, hexToRgba(orb.color, alpha));
      gradient.addColorStop(0.45, hexToRgba(orb.color, alpha * 0.4));
      gradient.addColorStop(1, hexToRgba(orb.color, 0));

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    // Vignette darkens the corners to focus the eye on the center
    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, height * 0.35,
      width / 2, height / 2, Math.max(width, height) * 0.85
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Faint grain overlay — kills banding and makes the background feel filmic
    if (Math.random() < 0.6) {
      ctx.fillStyle = "rgba(255,255,255,0.012)";
      const grainStep = 4 * dpr;
      for (let y = 0; y < height; y += grainStep) {
        for (let x = 0; x < width; x += grainStep) {
          if (Math.random() < 0.05) ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // Red vignette flash on wrong notes
    if (wrongFlash > 0.02) {
      const wv = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.3,
        width / 2, height / 2, height * 0.95
      );
      wv.addColorStop(0, "rgba(0,0,0,0)");
      wv.addColorStop(1, `rgba(220, 40, 40, ${wrongFlash * 0.4})`);
      ctx.fillStyle = wv;
      ctx.fillRect(0, 0, width, height);
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(1, 1); // we draw in raw px and let it stretch via CSS size
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
        // Default mood: deep blue/violet hint when no song is loaded
        orbsRef.current = createOrbs(
          ["#1a1147", "#16213e", "#0f3460", "#3b1d5b"],
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
