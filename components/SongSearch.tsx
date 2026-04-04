"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SearchResult } from "@/types";

interface SongSearchProps {
  onSelect: (result: SearchResult) => void;
  disabled?: boolean;
}

export default function SongSearch({ onSelect, disabled }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(q)}&limit=6`
      );
      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      const tracks = data.tracks?.items ?? [];

      setResults(
        tracks.map(
          (t: {
            id: string;
            name: string;
            artists: { name: string }[];
            album: {
              name: string;
              images: { url: string; width: number }[];
            };
            duration_ms: number;
          }): SearchResult => ({
            spotifyTrackId: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            album: t.album.name,
            albumArtUrl:
              t.album.images.find((i) => i.width === 300)?.url ??
              t.album.images[0]?.url,
            durationMs: t.duration_ms,
          })
        )
      );
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setIsFocused(false);
    inputRef.current?.blur();
    onSelect(result);
  };

  const showResults = isFocused && (results.length > 0 || isLoading);

  return (
    <div className="relative w-full max-w-lg" role="search" aria-label="Song search">
      {/* Search input */}
      <div className="glass flex items-center gap-3 px-4 py-3">
        {/* Search icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-white/30 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Delay to allow click on results
            setTimeout(() => setIsFocused(false), 200);
          }}
          disabled={disabled}
          placeholder="Search for a song..."
          aria-label="Search for a song"
          aria-autocomplete="list"
          aria-expanded={showResults}
          role="combobox"
          className="bg-transparent outline-none text-white placeholder-white/30 text-base w-full"
        />

        {/* Loading spinner */}
        {isLoading && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full shrink-0"
          />
        )}

        {/* Clear button */}
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="text-white/30 hover:text-white/60 transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Results dropdown */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label="Search results"
            className="absolute top-full left-0 right-0 mt-2 glass overflow-hidden z-50 max-h-[360px] overflow-y-auto"
          >
            {/* Spotify attribution */}
            <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-1.5 text-white/25 text-[10px]">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Powered by Spotify
            </div>
            {results.length === 0 && isLoading ? (
              <div className="px-4 py-6 text-center text-white/30 text-sm">
                Searching...
              </div>
            ) : (
              results.map((result) => (
                <button
                  key={result.spotifyTrackId}
                  onClick={() => handleSelect(result)}
                  role="option"
                  aria-label={`${result.title} by ${result.artist}, from ${result.album}`}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-left border-b border-white/5 last:border-b-0"
                >
                  {/* Album art */}
                  {result.albumArtUrl ? (
                    <img
                      src={result.albumArtUrl}
                      alt={result.album}
                      className="w-11 h-11 rounded-lg object-cover shrink-0"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-white/10 shrink-0 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-5 h-5 text-white/20"
                      >
                        <path d="M16 8A6 6 0 110 8a6 6 0 0116 0zm-1 0a5 5 0 10-10 0 5 5 0 0010 0z" />
                      </svg>
                    </div>
                  )}

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm font-medium truncate">
                      {result.title}
                    </div>
                    <div className="text-white/50 text-xs truncate">
                      {result.artist}
                    </div>
                    <div className="text-white/30 text-xs truncate">
                      {result.album}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="text-white/20 text-xs font-mono shrink-0">
                    {formatDuration(result.durationMs)}
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
