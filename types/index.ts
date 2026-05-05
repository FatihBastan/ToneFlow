// ─── App State ───────────────────────────────────────────────
export type AppState = "idle" | "listening" | "detecting" | "detected";

export type AudioSourceType = "vocals" | "instrument" | "unknown";

// ─── Performance Mode ────────────────────────────────────────
export type PerformanceMode =
  | "vocals"
  | "guitar"
  | "bass"
  | "drums"
  | "piano"
  | "full_performance"
  | "free_play"
  | "auto_detect";

export interface ModeConfig {
  id: PerformanceMode;
  label: string;
  emoji: string;
  description: string;
  needsSearch: boolean; // false for auto_detect
  tracksPitch: boolean;
  tracksRhythm: boolean;
  showLyrics: "full" | "blurred" | "none";
  judgesCorrectness: boolean; // false for free_play
  /** Override RMS gate for this mode. If set, skips adaptive calibration. */
  rmsGate?: number;
  /** Override clarity threshold for the NSDF best-peak gate. */
  clarityThreshold?: number;
}

// ─── Feedback ────────────────────────────────────────────────
export type FeedbackType = "correct" | "wrong" | "neutral";

export interface FeedbackEvent {
  type: FeedbackType;
  timestamp: number;
}

// ─── Song / Track ────────────────────────────────────────────
export interface SongInfo {
  title: string;
  artist: string;
  album: string;
  spotifyTrackId?: string;
  durationMs: number;
  playOffsetMs: number;
  albumArtUrl?: string;
  albumColors?: string[];
  key?: string; // e.g. "A Minor", "C Major"
}

// ─── ACRCloud ────────────────────────────────────────────────
export interface ACRCloudResponse {
  status: {
    code: number;
    msg: string;
  };
  metadata?: {
    music: ACRCloudMusic[];
  };
}

export interface ACRCloudMusic {
  title: string;
  artists: { name: string }[];
  album: { name: string };
  external_metadata?: {
    spotify?: {
      track?: { id: string };
    };
  };
  play_offset_ms: number;
  duration_ms: number;
}

// ─── Spotify ─────────────────────────────────────────────────
export interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string; id: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
}

// ─── Lyrics ──────────────────────────────────────────────────
export interface LyricLine {
  time: number; // seconds
  text: string;
  words?: LyricWord[];
}

export interface LyricWord {
  text: string;
  startTime: number; // seconds
  endTime: number;   // seconds
}

export interface LRCLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

// ─── Pitch Detection ────────────────────────────────────────
export interface PitchData {
  frequency: number;  // Hz
  midiNote: number;   // 0-127
  noteName: string;   // e.g. "C4", "D#3"
  clarity: number;    // 0-1 confidence
  centsOff?: number;  // cents sharp (+) or flat (-) from nearest note
}

// ─── Session Stats ──────────────────────────────────────────
export interface SessionStats {
  totalNotes: number;
  correctNotes: number;
  wrongNotes: number;
  accuracyPercent: number;
  longestStreak: number;
  finalStreak: number;
  sessionDurationMs: number;
  difficulty: Difficulty;
  mode: PerformanceMode;
  songTitle: string;
  songArtist: string;
}

// ─── Difficulty ─────────────────────────────────────────────
export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  description: string;
  centsTolerance: number | null; // null = no cents check (any in-key note passes)
  color: string;
}

// ─── Streak ──────────────────────────────────────────────────
export type StreakTier = "none" | "warming_up" | "on_fire" | "blazing" | "legendary";

export interface StreakState {
  count: number;
  tier: StreakTier;
  multiplier: number;
  justBroke: boolean;  // true for one frame after streak breaks
}

// ─── Search ──────────────────────────────────────────────────
export interface SearchResult {
  spotifyTrackId: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl?: string;
  durationMs: number;
}

// ─── Beat / Drums ────────────────────────────────────────────
export interface BeatHit {
  time: number;      // ms timestamp
  intensity: number; // 0-1
  isRegular: boolean; // true if timing is consistent
}

// ─── Color / Background ─────────────────────────────────────
export interface ColorOrb {
  x: number;
  y: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  phase: number;
}
