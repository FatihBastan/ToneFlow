/** Extract a slice of `samples` of length `frameSize` centered on `centerSample`. */
export function frameAt(
  samples: Float32Array,
  centerSample: number,
  frameSize: number
): Float32Array | null {
  const half = Math.floor(frameSize / 2);
  const start = centerSample - half;
  const end = start + frameSize;
  if (start < 0 || end > samples.length) return null;
  return samples.subarray(start, end);
}

/** Convert a MIDI note number (with decimals) to frequency in Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Parse simple `--key=value` and `--key value` CLI args. */
export function parseArgs(argv: string[]): {
  positional: string[];
  flags: Record<string, string>;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = "true";
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

/** ANSI color helpers. */
export const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
