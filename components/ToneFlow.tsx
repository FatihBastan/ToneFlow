"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiUrl } from "@/lib/api";
import { useMicrophone } from "@/hooks/useMicrophone";
import { usePitchDetection } from "@/hooks/usePitchDetection";
import { useColorExtraction } from "@/hooks/useColorExtraction";
import AnimatedBackground from "@/components/AnimatedBackground";
import SpectrumVisualizer from "@/components/SpectrumVisualizer";
import SongInfoDisplay from "@/components/SongInfo";
import SongSearch from "@/components/SongSearch";
import ModeSelector from "@/components/ModeSelector";
import StreakTracker from "@/components/StreakTracker";
import NoteTrack from "@/components/NoteTrack";
import ParticleEffects from "@/components/ParticleEffects";
import VocalSession from "@/components/sessions/VocalSession";
import InstrumentSession from "@/components/sessions/InstrumentSession";
import DrumSession from "@/components/sessions/DrumSession";
import FullPerformanceSession from "@/components/sessions/FullPerformanceSession";
import FreePlaySession from "@/components/sessions/FreePlaySession";
import { MODE_CONFIGS } from "@/lib/modeConfig";
import { getFeatureFlags, setFeatureFlag } from "@/lib/featureFlags";
import { getKeyInfo, isNoteInKeyWithTolerance, estimateKey } from "@/lib/musicTheory";
import { DIFFICULTY_CONFIGS } from "@/lib/difficultyConfig";
import DifficultySelector from "@/components/DifficultySelector";
import SessionSummary from "@/components/SessionSummary";
import SettingsPanel from "@/components/SettingsPanel";
import type {
  AppState,
  SongInfo,
  SearchResult,
  LyricLine,
  StreakState,
  StreakTier,
  PerformanceMode,
  FeedbackType,
  Difficulty,
  SessionStats,
} from "@/types";

function getStreakTier(count: number): { tier: StreakTier; multiplier: number } {
  if (count >= 50) return { tier: "legendary", multiplier: 8 };
  if (count >= 30) return { tier: "blazing", multiplier: 4 };
  if (count >= 15) return { tier: "on_fire", multiplier: 2 };
  if (count >= 5) return { tier: "warming_up", multiplier: 1.5 };
  return { tier: "none", multiplier: 1 };
}

export default function ToneFlow() {
  // ── Core state ──
  const [appState, setAppState] = useState<AppState>("idle");
  const [selectedMode, setSelectedMode] = useState<PerformanceMode | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [pendingSong, setPendingSong] = useState<SongInfo | null>(null); // song detected via auto-detect, awaiting mode pick
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [streak, setStreak] = useState<StreakState>({
    count: 0,
    tier: "none",
    multiplier: 1,
    justBroke: false,
  });
  const [feedback, setFeedback] = useState<FeedbackType>("neutral");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [statusText, setStatusText] = useState("Choose your mode");
  const [songStartTime, setSongStartTime] = useState(0);
  // Lyrics timer that only advances when voice is detected (for vocals/full_performance)
  const [lyricsTime, setLyricsTime] = useState(0);
  const lyricsTimeRef = useRef(0);
  const lastTickRef = useRef(0);

  // ── Auto-detect state ──
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const recognitionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecognizingRef = useRef(false);

  // ── Streak tracking refs ──
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteRef = useRef<string | null>(null);    // last note that triggered a streak event
  const lastStreakTimeRef = useRef(0);                  // timestamp of last streak increment
  const NOTE_COOLDOWN_MS = 250; // min ms between streak increments

  // ── Session stats tracking ──
  const [sessionSummary, setSessionSummary] = useState<SessionStats | null>(null);
  const sessionStartRef = useRef(0);
  const totalNotesRef = useRef(0);
  const correctNotesRef = useRef(0);
  const wrongNotesRef = useRef(0);
  const longestStreakRef = useRef(0);
  const detectedNotesRef = useRef<string[]>([]); // for key estimation

  // ── Hooks ──
  const mic = useMicrophone();

  // Feature flags. The CREPE setting is reactive so the settings panel
  // toggle takes effect when the next session starts. Honour
  // `?crepe=1` / `?crepe=0` URL params for testing without DevTools.
  const [crepeEnabled, setCrepeEnabled] = useState(() => getFeatureFlags().crepe);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const param = params.get("crepe");
    if (param === "1" || param === "0") {
      const next = param === "1";
      setFeatureFlag("crepe", next);
      setCrepeEnabled(next);
    }
  }, []);
  const handleCrepeChange = useCallback((next: boolean) => {
    setFeatureFlag("crepe", next);
    setCrepeEnabled(next);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Per-mode threshold profiles: drums forces a high RMS gate, vocals
  // lowers clarity. Anything else inherits adaptive calibration.
  // CREPE only activates for instrument-pitch modes — vocals/drums skip it.
  const usesCrepe =
    crepeEnabled &&
    !!selectedMode &&
    selectedMode !== "vocals" &&
    selectedMode !== "drums" &&
    selectedMode !== "auto_detect";
  const pitchOpts = selectedMode
    ? {
        rmsGate: MODE_CONFIGS[selectedMode].rmsGate,
        clarityThreshold: MODE_CONFIGS[selectedMode].clarityThreshold,
        useCrepe: usesCrepe,
      }
    : undefined;
  const pitch = usePitchDetection(mic.analyser, mic.audioContext, pitchOpts);

  // ── Vocal word feedback (from speech recognition matching) ──
  const handleVocalWordFeedback = useCallback((type: "correct" | "wrong") => {
    totalNotesRef.current++;
    if (type === "correct") {
      correctNotesRef.current++;
      setFeedback("correct");
      setStreak((prev) => {
        const newCount = prev.count + 1;
        if (newCount > longestStreakRef.current) longestStreakRef.current = newCount;
        const { tier, multiplier } = getStreakTier(newCount);
        return { count: newCount, tier, multiplier, justBroke: false };
      });
    } else {
      wrongNotesRef.current++;
      setFeedback("wrong");
      setStreak((prev) => {
        if (prev.count > 0) {
          return { count: 0, tier: "none", multiplier: 1, justBroke: true };
        }
        return prev;
      });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setStreak((s) => ({ ...s, justBroke: false }));
      }, 100);
    }
    // Reset feedback to neutral after a short delay
    setTimeout(() => setFeedback("neutral"), 300);
  }, []);
  const colorExtract = useColorExtraction();

  const modeConfig = selectedMode ? MODE_CONFIGS[selectedMode] : null;

  // ── Shared: transition into "detected" state for any song ──
  const activateSong = useCallback(
    async (newSong: SongInfo) => {
      setSong(newSong);
      setAppState("detected");
      setStreak({ count: 0, tier: "none", multiplier: 1, justBroke: false });
      setFeedback("neutral");
      setStatusText(`Now playing: ${newSong.title}`);
      setSongStartTime(Date.now() - (newSong.playOffsetMs || 0));

      // Reset session stats
      sessionStartRef.current = Date.now();
      totalNotesRef.current = 0;
      correctNotesRef.current = 0;
      wrongNotesRef.current = 0;
      longestStreakRef.current = 0;
      detectedNotesRef.current = [];

      if (newSong.albumArtUrl) {
        colorExtract.extractFromUrl(newSong.albumArtUrl);
      }

      // Fetch lyrics
      try {
        const params = new URLSearchParams({
          artist: newSong.artist,
          track: newSong.title,
        });
        if (newSong.durationMs) {
          params.set("duration", (newSong.durationMs / 1000).toString());
        }
        const res = await fetch(apiUrl(`/api/lyrics?${params.toString()}`));
        if (res.ok) {
          const data = await res.json();
          setLyrics(data.lyrics ?? []);
        }
      } catch {
        // Lyrics are optional
      }

      if (!mic.isActive) {
        await mic.start();
      }
    },
    [colorExtract, mic]
  );

  // ── Mode selection ──
  const handleModeSelect = useCallback((mode: PerformanceMode) => {
    setSelectedMode(mode);
    if (mode === "auto_detect") {
      setStatusText("Starting auto-detect...");
    } else if (pendingSong) {
      // Song already detected via auto-detect — skip search, go straight to session
      activateSong(pendingSong);
      setPendingSong(null);
    } else {
      setStatusText("Search for a song");
    }
  }, [pendingSong, activateSong]);

  // ── Search selection ──
  const handleSearchSelect = useCallback(
    async (result: SearchResult) => {
      setAppState("detecting");
      setStatusText(`Fetching track info for "${result.title}"...`);

      let albumArtUrl = result.albumArtUrl;
      let albumColors: string[] | undefined;

      try {
        const res = await fetch(
          apiUrl(`/api/spotify/track?id=${result.spotifyTrackId}`)
        );
        if (res.ok) {
          setStatusText("Extracting album colors...");
          const data = await res.json();
          albumArtUrl = data.albumArtUrl ?? albumArtUrl;
          albumColors = data.albumColors;
        }
      } catch {
        // Use what we have
      }

      setStatusText("Loading lyrics & preparing session...");

      const newSong: SongInfo = {
        title: result.title,
        artist: result.artist,
        album: result.album,
        spotifyTrackId: result.spotifyTrackId,
        durationMs: result.durationMs,
        playOffsetMs: 0,
        albumArtUrl,
        albumColors,
      };

      await activateSong(newSong);
    },
    [activateSong]
  );

  // ── ACRCloud auto-detect ──
  const recognizeSong = useCallback(async () => {
    if (isRecognizingRef.current || !mic.isActive) return;
    isRecognizingRef.current = true;
    setStatusText("Recording audio sample...");

    try {
      const audioBlob = await mic.recordChunk(7000);
      setStatusText("Identifying song...");
      const formData = new FormData();
      formData.append("audio", audioBlob, "sample.webm");

      const res = await fetch(apiUrl("/api/recognize"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Recognition request failed");
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

        if (recognitionIntervalRef.current) {
          clearInterval(recognitionIntervalRef.current);
          recognitionIntervalRef.current = null;
        }

        // Store detected song and let user pick a mode
        setPendingSong(newSong);
        setIsAutoDetecting(false);
        setAppState("idle");
        setStatusText(`Detected "${newSong.title}" — pick a mode!`);
      } else {
        setStatusText("Listening... Play or sing something!");
      }
    } catch {
      setStatusText("Listening... Play or sing something!");
    } finally {
      isRecognizingRef.current = false;
    }
  }, [mic, activateSong]);

  const startAutoDetect = useCallback(async () => {
    setIsAutoDetecting(true);
    setAppState("listening");
    setStatusText("Listening... Play or sing something!");
    if (!mic.isActive) {
      await mic.start();
    }
  }, [mic]);

  // When auto_detect mode is selected, start immediately
  useEffect(() => {
    if (selectedMode === "auto_detect" && !isAutoDetecting && appState === "idle") {
      startAutoDetect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode]);

  // ACRCloud polling
  useEffect(() => {
    if (isAutoDetecting && mic.isActive && appState !== "detected") {
      recognizeSong();
      recognitionIntervalRef.current = setInterval(recognizeSong, 15000);
    }
    return () => {
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current);
        recognitionIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoDetecting, mic.isActive]);

  // Start pitch detection when mic is active
  useEffect(() => {
    if (mic.isActive && mic.analyser && mic.audioContext) {
      pitch.startDetection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.isActive, mic.analyser, mic.audioContext]);

  // ── Lyrics timer: advances only when sound is heard in vocal modes ──
  // Uses RMS (volume), not pitch — so a full song playing through speakers works fine.
  const RMS_VOICE_GATE = 0.008; // very low threshold — any audible sound advances lyrics

  useEffect(() => {
    if (appState !== "detected") return;

    const usesVoicePacing =
      selectedMode === "vocals" || selectedMode === "full_performance";

    if (!usesVoicePacing) {
      // Non-vocal modes: use wall clock time
      const interval = setInterval(() => {
        const t = songStartTime > 0 ? (Date.now() - songStartTime) / 1000 : 0;
        setLyricsTime(t);
      }, 50);
      return () => clearInterval(interval);
    }

    // Vocal modes: advance lyrics only while mic picks up sound
    const interval = setInterval(() => {
      const now = Date.now();
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      if (pitch.rms > RMS_VOICE_GATE) {
        // Sound detected — advance lyrics time
        lyricsTimeRef.current += dt;
        setLyricsTime(lyricsTimeRef.current);
      }
      // Silence — lyrics freeze and wait
    }, 50);

    return () => clearInterval(interval);
  }, [appState, selectedMode, songStartTime, pitch.rms]);

  // Reset lyrics timer when song changes
  useEffect(() => {
    lyricsTimeRef.current = 0;
    lastTickRef.current = 0;
    setLyricsTime(0);
  }, [song]);

  // ── Feedback + streak logic ──
  // Only fire streak events when a *new distinct note* is detected or enough
  // time has passed since the last evaluation. This prevents ambient noise
  // from machine-gunning the streak counter at 15+ fps.
  useEffect(() => {
    if (appState !== "detected" || !modeConfig) return;

    // Vocals mode uses speech recognition for feedback — skip pitch-based logic
    if (selectedMode === "vocals") return;

    const p = pitch.currentPitch;
    const now = Date.now();

    // Helper: should we count this as a new note event?
    // Requires pitch.stable so chaotic single-frame readings don't pump the streak.
    const isNewNoteEvent = (): boolean => {
      if (!p) return false;
      if (!pitch.stable) return false;
      const noteName = p.noteName;
      const timeSinceLast = now - lastStreakTimeRef.current;
      // New note name, or same note held long enough
      if (noteName !== lastNoteRef.current || timeSinceLast >= NOTE_COOLDOWN_MS) {
        lastNoteRef.current = noteName;
        lastStreakTimeRef.current = now;
        return true;
      }
      return false;
    };

    // Free play: every new note increments, silence resets after 3s
    if (!modeConfig.judgesCorrectness) {
      if (p && isNewNoteEvent()) {
        totalNotesRef.current++;
        correctNotesRef.current++;
        detectedNotesRef.current.push(p.noteName);
        setFeedback("correct");
        setStreak((prev) => {
          const newCount = prev.count + 1;
          if (newCount > longestStreakRef.current) longestStreakRef.current = newCount;
          const { tier, multiplier } = getStreakTier(newCount);
          return { count: newCount, tier, multiplier, justBroke: false };
        });
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          setStreak({ count: 0, tier: "none", multiplier: 1, justBroke: true });
          setTimeout(() => setStreak((s) => ({ ...s, justBroke: false })), 100);
        }, 3000);
      } else if (!p) {
        setFeedback("neutral");
      }
      return;
    }

    // Drums: RMS spike detection (handled in DrumSession, but update streak here)
    if (selectedMode === "drums") {
      if (pitch.rms > 0.12 && now - lastStreakTimeRef.current >= NOTE_COOLDOWN_MS) {
        lastStreakTimeRef.current = now;
        totalNotesRef.current++;
        correctNotesRef.current++;
        setFeedback("correct");
        setStreak((prev) => {
          const newCount = prev.count + 1;
          if (newCount > longestStreakRef.current) longestStreakRef.current = newCount;
          const { tier, multiplier } = getStreakTier(newCount);
          return { count: newCount, tier, multiplier, justBroke: false };
        });
      } else if (pitch.rms <= 0.12) {
        setFeedback("neutral");
      }
      return;
    }

    // Pitched modes: check if note is in key with difficulty tolerance — only on new note events
    if (p && isNewNoteEvent()) {
      // Auto-estimate key if song metadata doesn't include one
      if (!song?.key && detectedNotesRef.current.length > 0 && detectedNotesRef.current.length % 15 === 0) {
        const estimated = estimateKey(detectedNotesRef.current);
        setSong((prev) => prev ? { ...prev, key: estimated.label } : prev);
      }
      const songKeyStr = song?.key ?? "C Major";
      const parts = songKeyStr.split(" ");
      const quality = (parts[1] ?? "").toLowerCase().includes("min")
        ? "Minor" as const
        : "Major" as const;
      const keyInfo = getKeyInfo(parts[0], quality);
      const centsTolerance = DIFFICULTY_CONFIGS[difficulty].centsTolerance;
      const inKey = isNoteInKeyWithTolerance(p.noteName, p.centsOff, keyInfo, centsTolerance);

      totalNotesRef.current++;
      detectedNotesRef.current.push(p.noteName);

      if (inKey) {
        correctNotesRef.current++;
        setFeedback("correct");
        setStreak((prev) => {
          const newCount = prev.count + 1;
          if (newCount > longestStreakRef.current) longestStreakRef.current = newCount;
          const { tier, multiplier } = getStreakTier(newCount);
          return { count: newCount, tier, multiplier, justBroke: false };
        });
      } else {
        wrongNotesRef.current++;
        setFeedback("wrong");
        setStreak((prev) => {
          if (prev.count > 0) {
            return { count: 0, tier: "none", multiplier: 1, justBroke: true };
          }
          return prev;
        });
        // Clear justBroke after a frame
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          setStreak((s) => ({ ...s, justBroke: false }));
        }, 100);
      }
    } else {
      setFeedback("neutral");
      // Clear last note on silence so the same note re-triggers after a pause
      lastNoteRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch.currentPitch, pitch.rms, appState, selectedMode, modeConfig, song?.key, difficulty]);

  // ── Back / reset ──
  const handleBack = useCallback(() => {
    mic.stop();
    pitch.stopDetection();
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Show session summary if the user actually played something
    if (appState === "detected" && totalNotesRef.current > 0 && song && selectedMode) {
      const total = totalNotesRef.current;
      const correct = correctNotesRef.current;
      setSessionSummary({
        totalNotes: total,
        correctNotes: correct,
        wrongNotes: wrongNotesRef.current,
        accuracyPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
        longestStreak: longestStreakRef.current,
        finalStreak: streak.count,
        sessionDurationMs: Date.now() - sessionStartRef.current,
        difficulty,
        mode: selectedMode,
        songTitle: song.title,
        songArtist: song.artist,
      });

      // Also try to auto-estimate key if none was provided
      if (!song.key && detectedNotesRef.current.length >= 10) {
        const estimated = estimateKey(detectedNotesRef.current);
        setSong((prev) => prev ? { ...prev, key: estimated.label } : prev);
      }
      return; // Don't reset yet — summary will call handleDismissSummary
    }

    resetSession();
  }, [mic, pitch, appState, song, selectedMode, streak.count, difficulty]);

  const resetSession = useCallback(() => {
    setAppState("idle");
    setSong(null);
    setPendingSong(null);
    setLyrics([]);
    setStreak({ count: 0, tier: "none", multiplier: 1, justBroke: false });
    setFeedback("neutral");
    setSelectedMode(null);
    setIsAutoDetecting(false);
    setStatusText("Choose your mode");
  }, []);

  const handleDismissSummary = useCallback(() => {
    setSessionSummary(null);
    resetSession();
  }, [resetSession]);

  // ── Derived ──
  // lyricsTime is the voice-paced timer for vocal modes,
  // wall-clock fallback for instrument modes (managed in the effect above)
  const currentTime = lyricsTime;
  const bgColors =
    colorExtract.colors.length > 0
      ? colorExtract.colors
      : song?.albumColors ?? [];

  const isPreSession = appState === "idle" || appState === "listening";
  const showModeSelect = (selectedMode === null && appState === "idle") || (pendingSong !== null && selectedMode === null);
  const showSearch = selectedMode !== null && selectedMode !== "auto_detect" && isPreSession && !pendingSong;

  // ── Render session view by mode ──
  const renderSession = () => {
    if (appState !== "detected") return null;

    switch (selectedMode) {
      case "vocals":
        return (
          <VocalSession
            lyrics={lyrics}
            currentTime={currentTime}
            feedback={feedback}
            onWordFeedback={handleVocalWordFeedback}
          />
        );
      case "guitar":
      case "bass":
      case "piano":
        return (
          <InstrumentSession
            lyrics={lyrics}
            currentTime={currentTime}
            currentPitch={pitch.currentPitch}
            songKey={song?.key}
            feedback={feedback}
          />
        );
      case "drums":
        return <DrumSession rms={pitch.rms} />;
      case "full_performance":
        return (
          <FullPerformanceSession
            lyrics={lyrics}
            currentTime={currentTime}
            currentPitch={pitch.currentPitch}
            songKey={song?.key}
            feedback={feedback}
          />
        );
      case "free_play":
      case "auto_detect":
      default:
        return (
          <FreePlaySession
            currentPitch={pitch.currentPitch}
            rms={pitch.rms}
          />
        );
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden" aria-label="ToneFlow music performance app">
      <AnimatedBackground
        colors={bgColors}
        intensity={pitch.rms}
        feedback={feedback}
      />

      {/* Live frequency spectrum — atmospheric strip behind the bottom UI.
          Translucent bars rise from the very bottom edge so the NoteTrack and
          Streak cards still sit cleanly on top without competition. */}
      {mic.isActive && (
        <div
          className="fixed bottom-0 left-0 right-0 pointer-events-none"
          style={{ zIndex: 1, height: "14vh", maxHeight: "120px" }}
          aria-hidden="true"
        >
          <SpectrumVisualizer
            analyser={mic.analyser}
            colors={bgColors.length > 0 ? bgColors : undefined}
            bars={72}
            maxHeightFraction={0.85}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Particle effects layer */}
      <ParticleEffects
        feedback={feedback}
        streakCount={streak.count}
      />

      <div className="relative z-10 flex flex-col items-center justify-between h-full p-3 sm:p-6 safe-bottom">
        {/* ── Top bar ── */}
        <div className="w-full flex justify-center pt-2 sm:pt-4 safe-top">
          <AnimatePresence mode="wait">
            {song ? (
              <motion.div
                key="song-info"
                initial={{ opacity: 0, y: -15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex items-center gap-2 sm:gap-4 max-w-full px-1"
              >
                <motion.button
                  onClick={handleBack}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Go back to mode selection"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-colors shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-white/60"
                  >
                    <path
                      fillRule="evenodd"
                      d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                </motion.button>
                <SongInfoDisplay song={song} />
                {/* Mode badge */}
                {modeConfig && (
                  <div className="glass px-3 py-1.5 text-xs text-white/50 hidden sm:block">
                    {modeConfig.emoji} {modeConfig.label}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight aurora-text">
                  ToneFlow
                </h1>
                <p className="text-xs text-white/35 mt-1 tracking-wide">
                  {selectedMode
                    ? `${modeConfig?.emoji} ${modeConfig?.label} mode`
                    : "Real-time music performance"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings gear — top right, always visible */}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          className="fixed top-3 right-3 sm:top-5 sm:right-5 z-30 w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-colors safe-top"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 text-white/55"
          >
            <path
              fillRule="evenodd"
              d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-.125 1.262l-.962.962a1 1 0 01-1.262.125l-1.25-.834a6.95 6.95 0 01-1.416.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.95 6.95 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.95 6.95 0 01-.587-1.416l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.03l1.25.834a6.95 6.95 0 011.416-.587l.294-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* ── Difficulty selector ── */}
        <AnimatePresence>
          {appState === "detected" && modeConfig?.judgesCorrectness && selectedMode !== "drums" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2 }}
              className="mt-1"
            >
              <DifficultySelector selected={difficulty} onChange={setDifficulty} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Center ── */}
        <div className="flex flex-col items-center gap-5 w-full max-w-lg flex-1 justify-center">
          <AnimatePresence mode="wait">
            {/* Step 1: Mode selection */}
            {showModeSelect && (
              <motion.div
                key="mode-select"
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -15 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="w-full flex flex-col items-center gap-5"
              >
                {/* Show detected song when coming from auto-detect */}
                {pendingSong && (
                  <>
                    <div className="glass px-4 py-3 flex items-center gap-3">
                      {pendingSong.albumArtUrl && (
                        <img
                          src={pendingSong.albumArtUrl}
                          alt=""
                          className="w-10 h-10 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-white/80 text-sm font-medium truncate">
                          {pendingSong.title}
                        </div>
                        <div className="text-white/40 text-xs truncate">
                          {pendingSong.artist} &middot; {pendingSong.album}
                        </div>
                      </div>
                    </div>
                    <p className="text-white/40 text-xs uppercase tracking-widest text-center">
                      Now pick a mode
                    </p>
                  </>
                )}

                <ModeSelector onSelect={handleModeSelect} />
              </motion.div>
            )}

            {/* Step 2: Song search (for modes that need it) */}
            {showSearch && (
              <motion.div
                key="search-panel"
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -15 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="w-full flex flex-col items-center gap-4"
              >
                {/* Back to mode select */}
                <button
                  onClick={() => {
                    setSelectedMode(null);
                    setStatusText("Choose your mode");
                  }}
                  className="text-white/30 hover:text-white/50 text-xs flex items-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M14 8a.75.75 0 0 1-.75.75H4.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L4.56 7.25h8.69A.75.75 0 0 1 14 8Z" clipRule="evenodd" />
                  </svg>
                  Change mode
                </button>

                <SongSearch onSelect={handleSearchSelect} />

                <motion.p
                  key={statusText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-white/40 text-xs text-center"
                >
                  {statusText}
                </motion.p>

                {mic.error && (
                  <p className="text-red-400/80 text-xs text-center max-w-xs">
                    {mic.error}
                  </p>
                )}
              </motion.div>
            )}

            {/* Auto-detect: listening animation */}
            {selectedMode === "auto_detect" && appState === "listening" && (
              <motion.div
                key="auto-detect-listening"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="flex flex-col items-center gap-6"
              >
                {/* Back to mode select */}
                <button
                  onClick={handleBack}
                  className="text-white/30 hover:text-white/50 text-xs flex items-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M14 8a.75.75 0 0 1-.75.75H4.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L4.56 7.25h8.69A.75.75 0 0 1 14 8Z" clipRule="evenodd" />
                  </svg>
                  Cancel
                </button>

                {/* Pulsing rings */}
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-purple-500/20 listening-ring-1" />
                  <div className="absolute inset-2 rounded-full border border-purple-500/15 listening-ring-2" />
                  <div className="absolute inset-4 rounded-full border border-purple-500/10 listening-ring-3" />
                  <div className="text-4xl">&#128302;</div>
                </div>

                <div className="text-center">
                  <p className="text-white/60 text-sm font-medium">
                    {statusText}
                  </p>
                  <p className="text-white/30 text-xs mt-1">
                    Play the song on a speaker — we&apos;ll identify it
                  </p>
                  <p className="text-white/20 text-[10px] mt-2 max-w-[220px]">
                    Tip: This works with recorded tracks, not live covers. To play along to a song, use Search instead.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Detecting: multi-step loading */}
            {appState === "detecting" && (
              <motion.div
                key="detecting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center gap-5"
                role="status"
                aria-label={statusText}
              >
                {/* Animated music note loader */}
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-white/5 border-t-purple-400/60"
                  />
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="absolute inset-2 rounded-full border-2 border-white/5 border-b-blue-400/40"
                  />
                  <motion.span
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    className="text-2xl"
                    aria-hidden="true"
                  >
                    &#9835;
                  </motion.span>
                </div>

                <div className="text-center">
                  <motion.p
                    key={statusText}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-white/60 text-sm font-medium"
                  >
                    {statusText}
                  </motion.p>
                  <motion.div
                    className="flex items-center justify-center gap-1 mt-2"
                    aria-hidden="true"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.2, 0.8, 0.2] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-white/40"
                      />
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* Detected: mode-specific session view */}
            {appState === "detected" && (
              <motion.div
                key="session"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 250, damping: 22, delay: 0.1 }}
                className="w-full"
              >
                {renderSession()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom: Note Track + Streak ── */}
        <div className="w-full flex justify-between items-end pb-2 sm:pb-4">
          <AnimatePresence>
            {mic.isActive && appState === "detected" && selectedMode !== "drums" && selectedMode !== "vocals" && (
              <motion.div
                initial={{ opacity: 0, x: -30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -30, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <NoteTrack
                  currentPitch={pitch.currentPitch}
                  rms={pitch.rms}
                  feedback={feedback}
                  centsTolerance={modeConfig?.judgesCorrectness ? DIFFICULTY_CONFIGS[difficulty].centsTolerance : undefined}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(streak.count > 0 || streak.justBroke) && (
              <motion.div
                initial={{ opacity: 0, x: 30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <StreakTracker streak={streak} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mic calibration toast — shown for ~2s when a session begins so
          the user knows the gate is adaptive and not just unresponsive. */}
      <AnimatePresence>
        {pitch.calibrating && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            role="status"
            className="fixed top-20 left-1/2 -translate-x-1/2 z-30 glass px-4 py-2 text-xs text-white/70 flex items-center gap-2"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Calibrating mic — hold still…
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREPE model load + status toast (only visible when the flag is on). */}
      <AnimatePresence>
        {pitch.pitchModelLoading && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            role="status"
            className="fixed top-32 left-1/2 -translate-x-1/2 z-30 glass px-4 py-2 text-xs text-white/70 flex items-center gap-2"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Loading CREPE model…
          </motion.div>
        )}
        {pitch.pitchModelError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            role="alert"
            className="fixed top-32 left-1/2 -translate-x-1/2 z-30 glass px-4 py-2 text-xs text-amber-300/80 flex items-center gap-2 max-w-sm"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            CREPE unavailable — falling back to autocorrelator.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        detector={pitch.detector}
        modelLoading={pitch.pitchModelLoading}
        modelError={pitch.pitchModelError}
        effectiveRmsGate={pitch.effectiveRmsGate}
        noiseFloor={pitch.noiseFloor}
        crepeEnabled={crepeEnabled}
        onCrepeChange={handleCrepeChange}
      />

      {/* Session summary overlay */}
      <AnimatePresence>
        {sessionSummary && (
          <SessionSummary stats={sessionSummary} onClose={handleDismissSummary} />
        )}
      </AnimatePresence>
    </div>
  );
}
