/**
 * Lightweight feature flag store for opt-in features that aren't
 * baked into the production build. Reads from localStorage (browser)
 * with an env-var fallback. Defaults are conservative — anything that
 * adds bundle weight, downloads a model, or changes the algorithm
 * surface should default to OFF.
 */

export interface FeatureFlags {
  /** Use CREPE-tiny ONNX model instead of NSDF autocorrelator. */
  crepe: boolean;
}

const DEFAULTS: FeatureFlags = {
  // CREPE is the default detector for instrument-pitch modes — it lifts
  // MDB RPA from ~70% to ~93% on real solo recordings (see RESULTS.md).
  // Vocals/drums/auto_detect mode gating still routes those to the
  // autocorrelator since CREPE-tiny is worse on monophonic singing.
  // To disable for a specific user/device:
  //   localStorage.setItem('toneflow.flags', JSON.stringify({crepe: false}))
  crepe: true,
};

const STORAGE_KEY = "toneflow.flags";

function readStorage(): Partial<FeatureFlags> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readEnv(): Partial<FeatureFlags> {
  // NEXT_PUBLIC_ prefixed env vars are exposed to the browser by Next.js.
  // Use them as a build-time default so deployments can flip features
  // without shipping a UI yet.
  const out: Partial<FeatureFlags> = {};
  if (process.env.NEXT_PUBLIC_TONEFLOW_CREPE === "1") out.crepe = true;
  return out;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    ...DEFAULTS,
    ...readEnv(),
    ...readStorage(),
  };
}

export function setFeatureFlag<K extends keyof FeatureFlags>(
  key: K,
  value: FeatureFlags[K]
): void {
  if (typeof window === "undefined") return;
  const current = readStorage();
  const next = { ...current, [key]: value };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
