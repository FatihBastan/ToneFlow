"use client";

import { useEffect, useRef } from "react";

interface SpectrumVisualizerProps {
  analyser: AnalyserNode | null;
  /** Album-derived colors for the bars; falls back to a cool gradient. */
  colors?: string[];
  /** Bars to draw across the width. Smaller = chunkier, larger = denser. */
  bars?: number;
  /** Maximum bar height as a fraction of canvas height. */
  maxHeightFraction?: number;
  /** Optional className for sizing — defaults to a thin strip. */
  className?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16) || 200;
  const g = parseInt(hex.slice(3, 5), 16) || 200;
  const b = parseInt(hex.slice(5, 7), 16) || 200;
  return { r, g, b };
}

export default function SpectrumVisualizer({
  analyser,
  colors,
  bars = 56,
  maxHeightFraction = 0.95,
  className = "w-full h-16",
}: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  // Smoothed bar heights so motion is fluid rather than jittery
  const heightsRef = useRef<Float32Array | null>(null);
  // Color stops cached as RGB so we don't reparse 60×/sec
  const colorRgbRef = useRef<{ r: number; g: number; b: number }[]>([]);

  useEffect(() => {
    const stops = colors && colors.length > 0
      ? colors
      : ["#7c3aed", "#3b82f6", "#06b6d4"];
    colorRgbRef.current = stops.map(hexToRgb);
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (!heightsRef.current || heightsRef.current.length !== bars) {
      heightsRef.current = new Float32Array(bars);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const heights = heightsRef.current!;

      if (analyser) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        // Map FFT bins to log-spaced groups for a more musical response.
        // The lowest bins (0..3) are dominated by DC + rumble — skip them.
        const startBin = 4;
        const endBin = Math.min(freqData.length, 1024); // cap at ~22 kHz, plenty
        const logStart = Math.log(startBin);
        const logEnd = Math.log(endBin);
        const logStep = (logEnd - logStart) / bars;

        for (let i = 0; i < bars; i++) {
          const binStart = Math.floor(Math.exp(logStart + i * logStep));
          const binEnd = Math.max(
            binStart + 1,
            Math.floor(Math.exp(logStart + (i + 1) * logStep))
          );
          let sum = 0;
          let count = 0;
          for (let b = binStart; b < binEnd && b < freqData.length; b++) {
            sum += freqData[b];
            count++;
          }
          // Normalized 0–1, with a soft compressor curve for visual punch
          const raw = count > 0 ? sum / count / 255 : 0;
          const target = Math.pow(raw, 0.7);

          // Asymmetric smoothing — fast attack, slow release feels alive
          const prev = heights[i];
          heights[i] =
            target > prev ? prev + (target - prev) * 0.45 : prev * 0.88;
        }
      } else {
        // Idle: gentle breathing animation so the viz never looks dead
        const t = performance.now() / 1000;
        for (let i = 0; i < bars; i++) {
          const idle = 0.05 + 0.03 * Math.sin(t * 1.5 + i * 0.4);
          heights[i] += (idle - heights[i]) * 0.05;
        }
      }

      const colorStops = colorRgbRef.current;
      const barW = width / bars;
      const gap = Math.max(1, dpr); // 1 logical px

      for (let i = 0; i < bars; i++) {
        const h = heights[i] * height * maxHeightFraction;
        if (h < 1) continue;

        // Pick a color along the palette based on bar position
        const t = i / Math.max(1, bars - 1);
        const idxF = t * (colorStops.length - 1);
        const idx = Math.floor(idxF);
        const frac = idxF - idx;
        const c0 = colorStops[idx];
        const c1 = colorStops[Math.min(idx + 1, colorStops.length - 1)];
        const r = Math.round(c0.r + (c1.r - c0.r) * frac);
        const g = Math.round(c0.g + (c1.g - c0.g) * frac);
        const b = Math.round(c0.b + (c1.b - c0.b) * frac);

        // Vertical gradient — bright at the bottom, fades into translucency up top
        const grad = ctx.createLinearGradient(0, height - h, 0, height);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.0)`);
        grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.55)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.95)`);

        ctx.fillStyle = grad;
        const x = i * barW + gap / 2;
        const w = barW - gap;
        const y = height - h;
        // Rounded top corners
        const radius = Math.min(w / 2, 4 * dpr);
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, height);
        ctx.closePath();
        ctx.fill();
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyser, bars, maxHeightFraction]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
