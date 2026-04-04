"use client";

import { useState, useCallback } from "react";

/**
 * Client-side color extraction from an album art URL using canvas.
 * Uses k-means-like approach to find dominant colors.
 */
export function useColorExtraction() {
  const [colors, setColors] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractFromUrl = useCallback(async (imageUrl: string) => {
    setIsExtracting(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      // Downscale for performance
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      const pixels: [number, number, number][] = [];

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        // Skip very dark and very light pixels
        const brightness = (r + g + b) / 3;
        if (brightness > 20 && brightness < 240) {
          pixels.push([r, g, b]);
        }
      }

      const extracted = quantizeColors(pixels, 6);
      const hexColors = extracted.map(
        ([r, g, b]) =>
          `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
      );

      setColors(hexColors.length >= 3 ? hexColors : ["#1a1a2e", "#16213e", "#0f3460"]);
    } catch {
      setColors(["#1a1a2e", "#16213e", "#0f3460"]);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  return { colors, isExtracting, extractFromUrl };
}

/**
 * Simple median-cut color quantization.
 */
function quantizeColors(
  pixels: [number, number, number][],
  count: number
): [number, number, number][] {
  if (pixels.length === 0) return [[26, 26, 46]];
  if (pixels.length <= count) return pixels;

  type Bucket = [number, number, number][];
  let buckets: Bucket[] = [pixels];

  while (buckets.length < count) {
    // Find bucket with largest range
    let maxRange = -1;
    let maxIdx = 0;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      for (let ch = 0; ch < 3; ch++) {
        const vals = bucket.map((p) => p[ch]);
        const range = Math.max(...vals) - Math.min(...vals);
        if (range > maxRange) {
          maxRange = range;
          maxIdx = i;
        }
      }
    }

    const bucket = buckets[maxIdx];
    // Find channel with largest range in this bucket
    let splitCh = 0;
    let bestRange = -1;
    for (let ch = 0; ch < 3; ch++) {
      const vals = bucket.map((p) => p[ch]);
      const range = Math.max(...vals) - Math.min(...vals);
      if (range > bestRange) {
        bestRange = range;
        splitCh = ch;
      }
    }

    bucket.sort((a, b) => a[splitCh] - b[splitCh]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(maxIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets.map((bucket) => {
    const avg: [number, number, number] = [0, 0, 0];
    for (const p of bucket) {
      avg[0] += p[0];
      avg[1] += p[1];
      avg[2] += p[2];
    }
    return [
      Math.round(avg[0] / bucket.length),
      Math.round(avg[1] / bucket.length),
      Math.round(avg[2] / bucket.length),
    ] as [number, number, number];
  });
}
