import type { ModeConfig, PerformanceMode } from "@/types";

export const MODE_CONFIGS: Record<PerformanceMode, ModeConfig> = {
  vocals: {
    id: "vocals",
    label: "Vocals",
    emoji: "\uD83C\uDFA4",
    description: "Sing along with word-by-word karaoke",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "full",
    judgesCorrectness: true,
    // Voice is highly harmonic; quiet sustains and breathy phrasing
    // produce lower NSDF peaks than instruments. Lower the gate.
    clarityThreshold: 0.65,
    // Hold the RMS gate at the legacy default — the lower adaptive
    // floor lifts MIR-1K voicing recall but tanks RPA by 5 pts because
    // breath sounds and inter-phrase noise become voiced false alarms.
    // Vocals get a fixed gate; instruments still benefit from adaptive.
    rmsGate: 0.018,
  },
  guitar: {
    id: "guitar",
    label: "Guitar",
    emoji: "\uD83C\uDFB8",
    description: "Play guitar — stay in key",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "blurred",
    judgesCorrectness: true,
  },
  bass: {
    id: "bass",
    label: "Bass",
    emoji: "\uD83C\uDFB5",
    description: "Lay down the low end",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "blurred",
    judgesCorrectness: true,
  },
  piano: {
    id: "piano",
    label: "Piano/Keys",
    emoji: "\uD83C\uDFB9",
    description: "Play keys — pitch and key tracking",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "blurred",
    judgesCorrectness: true,
  },
  drums: {
    id: "drums",
    label: "Drums",
    emoji: "\uD83E\uDD41",
    description: "Keep the beat — timing is everything",
    needsSearch: true,
    tracksPitch: false,
    tracksRhythm: true,
    showLyrics: "none",
    judgesCorrectness: true,
    // Drums is RMS-spike based; a high gate keeps ambient/bleed out.
    // Set explicitly so adaptive calibration does not lower it.
    rmsGate: 0.05,
  },
  full_performance: {
    id: "full_performance",
    label: "Full Performance",
    emoji: "\uD83C\uDFAD",
    description: "Sing AND play — hard mode",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "full",
    judgesCorrectness: true,
    // Same shape as vocals: high gate so inter-phrase breaths are not
    // counted as note events; clarity stays loose so the voice still
    // registers when the singer is between strums.
    clarityThreshold: 0.65,
    rmsGate: 0.018,
  },
  free_play: {
    id: "free_play",
    label: "Free Play",
    emoji: "\u2728",
    description: "Just vibe — no judgment",
    needsSearch: true,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "none",
    judgesCorrectness: false,
  },
  auto_detect: {
    id: "auto_detect",
    label: "Auto-Detect",
    emoji: "\uD83D\uDD2E",
    description: "Identify a song playing nearby",
    needsSearch: false,
    tracksPitch: true,
    tracksRhythm: false,
    showLyrics: "none",
    judgesCorrectness: false,
  },
};

export const MODE_LIST: ModeConfig[] = Object.values(MODE_CONFIGS);
