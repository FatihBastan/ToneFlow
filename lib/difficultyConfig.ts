import type { Difficulty, DifficultyConfig } from "@/types";

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: "easy",
    label: "Easy",
    description: "Just hit the right key",
    centsTolerance: null, // any in-key note passes
    color: "text-green-400",
  },
  medium: {
    id: "medium",
    label: "Medium",
    description: "Stay within pitch",
    centsTolerance: 35, // ±35 cents
    color: "text-yellow-400",
  },
  hard: {
    id: "hard",
    label: "Hard",
    description: "Nail the note",
    centsTolerance: 15, // ±15 cents
    color: "text-red-400",
  },
};

export const DIFFICULTY_LIST: DifficultyConfig[] = Object.values(DIFFICULTY_CONFIGS);
