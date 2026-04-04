import type { LyricLine, LyricWord, LRCLibResponse } from "@/types";

const LRCLIB_BASE = "https://lrclib.net/api";

/**
 * Fetch synced lyrics from LRCLIB.
 */
export async function getLyrics(
  artist: string,
  track: string,
  duration?: number
): Promise<LyricLine[] | null> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  if (duration) {
    params.set("duration", Math.round(duration).toString());
  }

  const response = await fetch(`${LRCLIB_BASE}/get?${params.toString()}`);

  if (!response.ok) {
    // Try search as fallback
    return searchLyrics(`${artist} ${track}`);
  }

  const data: LRCLibResponse = await response.json();

  if (data.syncedLyrics) {
    return parseLRC(data.syncedLyrics);
  }

  if (data.plainLyrics) {
    // Return plain lyrics without timing
    return data.plainLyrics.split("\n").map((text, i) => ({
      time: i * 3, // rough estimate
      text: text.trim(),
    }));
  }

  return null;
}

/**
 * Search LRCLIB for lyrics.
 */
async function searchLyrics(query: string): Promise<LyricLine[] | null> {
  const response = await fetch(
    `${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`
  );

  if (!response.ok) return null;

  const results: LRCLibResponse[] = await response.json();
  if (!results.length) return null;

  const best = results[0];
  if (best.syncedLyrics) {
    return parseLRC(best.syncedLyrics);
  }

  return null;
}

/**
 * Parse LRC format lyrics into structured LyricLine array.
 * Format: [mm:ss.xx] Lyrics text
 */
export function parseLRC(lrc: string): LyricLine[] {
  const lines = lrc.split("\n").filter(Boolean);
  const parsed: LyricLine[] = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centiseconds = parseInt(match[3], 10);
    const text = match[4].trim();

    if (!text) continue;

    const time =
      minutes * 60 +
      seconds +
      centiseconds / (match[3].length === 3 ? 1000 : 100);

    parsed.push({ time, text });
  }

  // Add word-level timing estimates
  for (let i = 0; i < parsed.length; i++) {
    const line = parsed[i];
    const nextTime = i + 1 < parsed.length ? parsed[i + 1].time : line.time + 5;
    const lineDuration = nextTime - line.time;

    const words = line.text.split(/\s+/);
    const wordDuration = lineDuration / words.length;

    line.words = words.map(
      (text, wi): LyricWord => ({
        text,
        startTime: line.time + wi * wordDuration,
        endTime: line.time + (wi + 1) * wordDuration,
      })
    );
  }

  return parsed;
}
