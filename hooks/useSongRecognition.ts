"use client";

import { useState, useCallback } from "react";
import type { SongInfo } from "@/types";

export function useSongRecognition() {
  const [song, setSong] = useState<SongInfo | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognize = useCallback(async (audioBlob: Blob): Promise<SongInfo | null> => {
    setIsRecognizing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "sample.webm");

      const res = await fetch("/api/recognize", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Recognition failed: ${res.status}`);
      }

      const data = await res.json();

      if (data.song) {
        const newSong: SongInfo = {
          title: data.song.title,
          artist: data.song.artist,
          album: data.song.album,
          spotifyTrackId: data.song.spotifyTrackId,
          durationMs: data.song.durationMs,
          playOffsetMs: data.song.playOffsetMs,
          albumArtUrl: data.song.albumArtUrl,
          albumColors: data.song.albumColors,
        };
        setSong(newSong);
        return newSong;
      }

      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recognition failed");
      return null;
    } finally {
      setIsRecognizing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSong(null);
    setError(null);
  }, []);

  return { song, isRecognizing, error, recognize, reset };
}
