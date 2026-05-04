# ToneFlow upgrade plan

What to work on next, ordered by impact-to-effort. Updated 2026-05-04
after the real-dataset benchmark pass — see `bench/RESULTS.md` for the
numbers this plan is reacting to.

---

## Where we stand

- **Vocals**: 89.1% RPA on MIR-1K — at YIN baseline, no work needed.
- **Instruments**: 66.0% exact on NSynth-test, 55.5% RPA on MDB-stem-synth
  — clearly below YIN baseline. Two failure modes to fix.
- **Polyphonic ("phone in the room")**: 32.7% RPA — algorithm limit.

The two instrument failure modes:
1. **34% of voiced frames go undetected** on real solo performances
   (gates tuned for noisy mic clip quiet notes from clean recordings).
2. **13% octave errors** on NSynth, concentrated on flute and organ
   (weak fundamental, strong 2nd harmonic).

---

## Tier 1 — High impact, ship-able as classical-DSP changes

### 1. Adaptive RMS gate
The 0.018 RMS gate is a guess about ambient mic noise. It clips quiet
real notes (MDB VR is only 65%). Replace with a measurement.

- At session start, sample 2 seconds of "silence" and compute noise floor.
- Set the live gate to `noiseFloor × 3` with a floor of 0.005 and a
  ceiling of 0.025.
- Display the calibrated value in the UI so the user knows it's adaptive.

Expected impact: MDB VR 65% → ~85%, lifts instrument RPA proportionally.
Vocals unaffected (already at VR 99%).

### 2. Spectral fundamental check for octave-up errors
Targeted fix for flute/organ. After NSDF picks period T, do a tiny FFT
on the same window and check the magnitude at frequency `SR/(2T)`. If it
has > X% of the magnitude at `SR/T`, the true fundamental is one octave
down.

- Tested in isolation first against NSynth flute clips before shipping
  globally — the failure mode is specific.
- Must NOT regress the unit-test suite (629/631 baseline) or the MIR-1K
  vocal numbers.

Expected impact: NSynth flute 28% → ~70% exact, organ 60% → ~75% exact.
Aggregate NSynth exact 66% → ~71%.

### 3. Per-mode threshold profiles
Drums mode does percussive RMS spike detection — it could use a much
higher RMS gate (0.05+) without losing anything. Vocals can use a lower
clarity threshold (0.65) because the human voice is very harmonic.

- Add `rmsGate` and `clarityThreshold` to `MODE_CONFIGS` in
  `lib/modeConfig.ts`.
- Pass through to `usePitchDetection` constructor.

Expected impact: small per-mode polish, no aggregate movement.

---

## Tier 2 — Bigger lifts

### 4. CREPE/SPICE pitch detection (ONNX)
The realistic path to instrument SOTA. CREPE-tiny is ~6 MB ONNX, runs
in WASM via `onnxruntime-web`. Closes the gap from ~66% to ~92% on
NSynth and MDB.

- Use only for instrument modes where per-note feedback matters
  (guitar/bass/piano/full_performance).
- Fall back to the autocorrelator if model load fails.
- Lazy-load the model — don't block first paint.

Cost: bundle size, ONNX runtime is ~2 MB compressed. Worth it for
instrument modes. Ship behind a flag first.

### 5. Polyphonic detection for "song in the room" use case
Right now `auto_detect` mode uses ACRCloud (cloud fingerprinting) to ID
the song, but does nothing with the live audio after that. For users
who want feedback while a song plays through a speaker, we need
melody-line extraction from polyphonic input.

- Spotify track-level audio analysis API (gets us beats and segments
  for free).
- Or a melody-extraction model (CREPE doesn't do polyphony).

This is a separate product surface from "play your guitar along".

---

## Tier 3 — Benchmark + UX polish

### 6. Per-instrument MedleyDB metadata
MDB-stem-synth currently lumps everything under "unknown". MedleyDB has
public YAML metadata mapping stem ID → instrument. Pull it in so we can
report "guitar 72% RPA, violin 88%, bass 50%" instead of one aggregate.

### 7. Bach10 + MDB-melody-synth datasets
Add polyphonic test datasets so we can measure the "song in the room"
case quantitatively before/after item 5.

### 8. Calibration UI
A 2-second "hold still while we calibrate" splash before each session.
Required for item 1 to land cleanly. Should also display: "Noise floor:
quiet / moderate / loud" with a tip if the environment is too loud.

### 9. Cents-tolerance display per mode
The per-mode `centsTolerance` in `DIFFICULTY_CONFIGS` is invisible to the
user. Show it on the difficulty selector as ±X cents so they understand
why "easy" is forgiving.

---

## Failed experiments — do NOT retry

| Tried | Result | Why it fails |
|---|---|---|
| PEAK_THRESHOLD < 0.8 | NSynth dropped 5+ pts | Lets noise spikes win the "first peak" race |
| PEAK_THRESHOLD > 0.8 | B6 unit test breaks | Edge-of-range fundamental falls below threshold |
| Lower RMS gate (0.018 → 0.002) | +6% detected, +0% exact | Added detections are wrong notes |
| Lower clarity (0.78 → 0.5) | Same | Lets through low-confidence guesses |
| Sub-octave NSDF validation (check 2T) | 469 unit tests broke | Real fundamentals DO produce strong NSDF peaks at 2T |

The lesson: gates and thresholds are at a local optimum for the current
algorithm. Real improvement requires either adaptive measurement (item 1)
or a fundamentally different algorithm (item 4).

---

## Constraints to respect

- **Unit tests must stay at 629/631 or better.** The 2 failing B6 tests
  are pre-existing and not worth fixing in isolation.
- **Vocals (MIR-1K right channel) must stay ≥ 88% RPA.** It's the one
  use case that currently works well — don't sacrifice it for instrument
  gains.
- **Production gates were not lowered** in this round on purpose. The
  bench shows lower gates help measurement but not real-world noisy mic
  performance. Adaptive gates (item 1) is the right path.
- **No new dependencies > 200 KB** without a flag and lazy load.

---

## Reproduce the current numbers

```bash
npm run test                                              # 629/631
npm run bench:smoke                                       # harness check
npm run bench:nsynth -- ./bench/datasets/nsynth-test      # 66.0% exact
npm run bench:mir1k  -- ./bench/datasets/MIR-1K-extracted/MIR-1K   # 89.1% RPA
npm run bench:mdb    -- ./bench/datasets/MDB-stem-synth --limit 30 # 55.5% RPA
```
