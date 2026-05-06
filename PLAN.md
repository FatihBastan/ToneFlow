# ToneFlow upgrade plan

What to work on next, ordered by impact-to-effort. Updated 2026-05-06.
See `bench/RESULTS.md` for the measured numbers.

---

## Status as of 2026-05-06

### Done
- ✅ **Tier 1 #1** — adaptive RMS gate
- ✅ **Tier 1 #2** — Goertzel sub-octave guard (organ +1.8 pts; flute
  hypothesis was wrong but the guard is net-positive)
- ✅ **Tier 1 #3** — per-mode threshold profiles (drums / vocals /
  full_performance)
- ✅ **Tier 2 #4** — CREPE-tiny ONNX, default-on for instrument modes.
  **NSynth 66 → 73% exact, MDB 70 → 93% RPA** on the 5-stem prefix.
  Vocals stay on NSDF (CREPE-tiny is *worse* on monophonic singing).
  Model committed at `public/models/crepe-tiny.onnx` (1.9 MB);
  onnxruntime-web WASM is bundled locally via
  `scripts/copy-ort-wasm.mjs`; settings panel exposes a per-device
  toggle.
- ✅ **Tier 3 #9** — cents-tolerance label on the difficulty selector.
  Plus a live cents-off readout in the instrument session note display.
- ✅ **Bench infra** — `bench:nsynth` / `bench:mdb` / `bench:mir1k`
  accept `--rms-gate`, `--clarity`, `--crepe`. Node-side
  `CrepeDetector` mirrors the `StatefulDetector` contract.
- ✅ **Mobile build fix** — `npm run build:mobile` actually works now.
  `scripts/build-mobile.mjs` stashes `app/api/` outside the project
  (the API routes are deployed to Vercel; they're not meant to live in
  the APK). Robust to crashes / SIGINT / macOS APFS rename quirks via
  `cpSync` + `rmSync` (an earlier `renameSync` version produced ghost
  "<name> 2" directories on a flaky run).
- ✅ **Settings panel** — gear icon top right; CREPE toggle, active
  detector, effective RMS gate, measured noise floor, model error.
- ✅ **Tests** — 639/641 (629 pre-existing + 6 Goertzel + 4 spectral
  guard; the same 2 B6 unit tests are still pre-existing failures).
- ✅ **Mobile WASM trim** — `scripts/build-mobile.mjs` now prunes
  `out/ort/` after the static export, keeping only the asyncify pair
  (`ort-wasm-simd-threaded.asyncify.{mjs,wasm}`). The other three
  variants (threaded SIMD, JSEP/WebGPU, JSPI) can't run in Capacitor's
  Android WebView anyway — no `crossOriginIsolated`, no WebGPU, no
  JSPI. APK payload drops from ~76 MB to ~23 MB of WASM (50.8 MB
  saved). `public/ort/` keeps the full set so the Vercel web build
  still ships every variant for browser auto-selection.

### Partial
- 🟡 **Tier 3 #8** — calibration UI is a small toast; no full splash
  with measured noise floor display + manual recalibrate.

### Not started
- ⬜ **Tier 2 #5** — polyphonic detection ("song in the room"). Spotify
  audio analysis API or a melody-extraction model. Separate product
  surface from "play your guitar along".
- ⬜ **Tier 3 #6** — per-instrument MedleyDB metadata (the dataset
  itself doesn't carry instrument labels; the parent MedleyDB does).
- ⬜ **Tier 3 #7** — Bach10 / MDB-melody-synth bench coverage for
  polyphonic measurement.

### What I'd do first when we come back
1. **Tier 3 #8 calibration splash** — block session start until
   calibration completes, show measured noise floor with quiet /
   moderate / loud label, give the user a "recalibrate" button. ~45 min.
2. **Full 30-stem CREPE MDB bench** — confirm the 93% number on the
   full set (the run we kicked off this session was killed at stem ~20).
3. **Smoke-test the trimmed APK on a real device** — confirm ORT
   actually selects the asyncify variant when the others are absent
   (no 404 thrash, CREPE inference still produces sane output). If it
   probes the missing files first, set `env.wasm.wasmPaths` to an
   explicit `{ "ort-wasm-simd-threaded.asyncify.wasm": "/ort/..." }`
   map gated on a Capacitor-native runtime check.

---

## Tier 1 status (shipped 2026-05-04)

- **Item 1 (adaptive RMS gate)** — shipped. `usePitchDetection` now spends
  the first 2s of each session sampling the room's noise floor, then sets
  the gate to `clamp(noiseFloor × 3, 0.005, 0.025)`. A "Calibrating mic…"
  toast surfaces the calibration window. The win lands in the live mic
  flow for instrument modes — see RESULTS.md "adaptive floor" column for
  the magnitude (MDB RPA 55.5% → ~70%, NSynth +0.7 pts).
- **Item 2 (spectral fundamental check)** — shipped. Goertzel sub-octave
  probe at threshold 0.4 fires when half the detected frequency has ≥40%
  of the candidate's FFT magnitude. The targeted flute fix did not
  materialize (NSynth flute errors are octave-DOWN, not -UP — the probe
  never fires there) but it consistently lifts organ exact accuracy
  60.4% → 62.2% (+1.8 pts, -7 octave errors out of 502). MIR-1K 100-clip
  RPA holds at 89.0% (-0.1 vs baseline, well above the 88% floor); full
  1000-clip set is unchanged within noise (84.8% → 84.7%). Goertzel is
  also exposed as a public primitive (`goertzelMagnitude`) for future
  spectral checks.
- **Item 3 (per-mode threshold profiles)** — shipped. `MODE_CONFIGS`
  carries optional `rmsGate` and `clarityThreshold`:
  - **drums**: `rmsGate: 0.05` — skips adaptive; ambient bleed and
    fan noise should not register as percussive hits.
  - **vocals**: `rmsGate: 0.018, clarityThreshold: 0.65` — keeps the
    pre-adaptive gate so MIR-1K RPA stays at 89.1%; lower clarity lets
    breathy phrasing register.
  - **everything else**: inherits adaptive calibration; quiet rooms get
    the 0.005 floor and the MDB lift.

Constraints held: 635/637 unit tests passing (629 pre-existing + 6
Goertzel tests; same 2 B6 cases still failing). MIR-1K full-set RPA back
at the 89% baseline post-revert. The only thing the bench fully measures
is the legacy `rmsGate=0.018` path; the live adaptive lift requires
running with `--rms-gate 0.005` to simulate the quiet-room gate.

Bonus polish shipped alongside:
- **Tier 3 #9** — difficulty selector now displays the cents tolerance
  per option (e.g. "Easy any in-key", "Medium ±35¢", "Hard ±15¢").
- Bench scripts `bench:mdb` and `bench:mir1k` now accept `--rms-gate`
  and `--clarity` flags, so anyone can reproduce the adaptive-floor
  numbers without code changes.

---

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

**Status — shipped 2026-05-05 with measured numbers (flag-gated, model not bundled).**

Live + bench infrastructure:
- `lib/crepePitch.ts` (browser) and `bench/lib/crepeDetector.ts` (Node)
  are sibling wrappers around the same ONNX model — identical
  resample/normalize/post-process pipeline, different ORT runtimes
  (`onnxruntime-web` vs `onnxruntime-node`).
- `lib/featureFlags.ts` — opt-in store. URL `?crepe=1`, localStorage
  `toneflow.flags`, or `NEXT_PUBLIC_TONEFLOW_CREPE=1` at build time.
- `usePitchDetection` runs CREPE async per frame and falls through to
  NSDF when inference is in flight or fails — UI never freezes.
- ToneFlow gates the flag to instrument-pitch modes (guitar / bass /
  piano / free_play / full_performance). Vocals/drums/auto_detect skip
  CREPE because CREPE-tiny is *worse* than the autocorrelator on
  monophonic vocals (see numbers below).
- Bench scripts accept `--crepe`. Loads
  `public/models/crepe-tiny.onnx` once, runs inference per frame.

**Measured impact** (1.9 MB CREPE-tiny, the smallest variant):

| dataset | NSDF | CREPE-tiny | Δ |
|---|---:|---:|---:|
| NSynth full (4096 clips) | 66.1% exact | **73.4%** | **+7.3 pts** |
| NSynth octave-error rate | 12.9% | **6.9%** | almost halved |
| MDB-stem-synth (5-stem, 307k frames) | 61.4% RPA (default) / 70.0% (adaptive floor) | **93.4%** RPA | **+23–32 pts** |
| MIR-1K 100-clip vocals | 89.0% RPA | 86.2% RPA | **−2.8** (CREPE-tiny too small for vocals) |

Per-family NSynth wins: string +10.5, mallet +12.3, bass +10.6, guitar
+9.2. Flute is still capped (most flute clips are above the model's
2 kHz output ceiling — same structural cap as `maxFreq=2000`).

What's not done yet:
- Capacitor mobile builds load ORT WASM from a jsdelivr CDN (fine for
  web, broken offline). A postinstall copy of the WASM artifacts into
  `public/ort/` plus `env.wasm.wasmPaths = "/ort/"` would fix it.
- No on-screen toggle. Flag is set via URL/DevTools/env. Now that we
  know it works, a settings panel makes sense.
- CREPE inference is ~50× slower per frame than NSDF on CPU; full MDB
  (30 stems, 2.4 M frames) would take ~3 hours. The 5-stem prefix is
  representative but the published number should be the full set
  eventually.
- The model itself (`crepe-tiny.onnx`, 1.9 MB) is not in git. See
  [public/models/README.md](../public/models/README.md) for the
  conversion recipe.

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
| Lower RMS gate (0.018 → 0.002) on **NSynth** | +6% detected, +0% exact | Added detections are wrong notes |
| Lower clarity (0.78 → 0.5) | Same | Lets through low-confidence guesses |
| Sub-octave NSDF validation (check 2T) | 469 unit tests broke | Real fundamentals DO produce strong NSDF peaks at 2T |

The lesson: gate-lowering trades VR for VFA differently across datasets.
Lowering the gate to 0.005 is a clear win on **MDB** (real solo
performances with quiet decays — RPA 55.5% → ~70%) but a clear loss on
**MIR-1K** (vocals with breathy gaps — RPA 89.1% → 84.4% because breath
sounds become voiced false alarms). Per-mode profiles (item 3) plus
adaptive calibration (item 1) handle this asymmetry: vocals keep the
high gate explicitly; instruments inherit the adaptive floor.

---

## Constraints to respect

- **Unit tests must stay at 629/631 or better.** The 2 failing B6 tests
  are pre-existing and not worth fixing in isolation.
- **Vocals (MIR-1K right channel) must stay ≥ 88% RPA.** It's the one
  use case that currently works well — don't sacrifice it for instrument
  gains.
- **Production gates: per-mode** (post item 1). Vocals and
  full_performance keep `rmsGate=0.018` explicitly so MIR-1K stays
  at the YIN-class baseline; drums hard-codes 0.05; everything else
  inherits adaptive calibration with floor 0.005 / ceiling 0.025. The
  asymmetry is the actual fix — there is no single gate that wins on
  both vocals (where breath gaps cause VFA at low gates) and quiet
  instrument decays.
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
