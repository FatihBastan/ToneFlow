/**
 * Fuzzy word matching for lyrics recognition.
 */

/** Normalize a word for comparison: lowercase, strip punctuation */
export function normalize(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w']/g, "")
    .trim();
}

/** Check if two words are a fuzzy match (handles speech recognition inaccuracies) */
export function wordsMatch(spoken: string, expected: string): boolean {
  const a = normalize(spoken);
  const b = normalize(expected);

  if (!a || !b) return false;

  // Exact match
  if (a === b) return true;

  // One contains the other (e.g. "don't" vs "dont")
  if (a.includes(b) || b.includes(a)) return true;

  // Edit distance for short words — allow 1 char difference
  if (b.length <= 4) {
    return editDistance(a, b) <= 1;
  }

  // For longer words, allow more tolerance
  const maxDist = Math.floor(b.length * 0.3);
  return editDistance(a, b) <= maxDist;
}

/** Simple Levenshtein edit distance */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Given a flat list of expected words and the latest recognized words,
 * find how far the singer has advanced.
 *
 * Returns the new cursor position (index into flatWords).
 * Also returns which words were matched vs missed.
 */
export function matchSpokenWords(
  flatWords: string[],
  spokenWords: string[],
  currentCursor: number
): { newCursor: number; results: Map<number, "correct" | "wrong"> } {
  const results = new Map<number, "correct" | "wrong">();
  let cursor = currentCursor;

  for (const spoken of spokenWords) {
    if (cursor >= flatWords.length) break;

    // Try to match against current word or next few (allow skipping 1-2)
    let matched = false;
    const lookAhead = Math.min(cursor + 4, flatWords.length);

    for (let i = cursor; i < lookAhead; i++) {
      if (wordsMatch(spoken, flatWords[i])) {
        // Mark any skipped words as wrong
        for (let j = cursor; j < i; j++) {
          results.set(j, "wrong");
        }
        // Mark matched word as correct
        results.set(i, "correct");
        cursor = i + 1;
        matched = true;
        break;
      }
    }

    // If no match in lookahead, don't advance — could be noise
    if (!matched) {
      // If we've seen multiple unmatched words in a row, the singer
      // might have skipped ahead — try a wider search
      const wideLookAhead = Math.min(cursor + 10, flatWords.length);
      for (let i = cursor; i < wideLookAhead; i++) {
        if (wordsMatch(spoken, flatWords[i])) {
          for (let j = cursor; j < i; j++) {
            results.set(j, "wrong");
          }
          results.set(i, "correct");
          cursor = i + 1;
          matched = true;
          break;
        }
      }
    }
  }

  return { newCursor: cursor, results };
}
