# ToneFlow pitch detection — real-dataset benchmark results

Measured on three standard datasets using the production audio pipeline
(HPF → Hann window → NSDF autocorrelation → 5-frame median →
octave-jump correction). The detector is identical to what runs in the
microphone hook; the only difference is the input source (file instead of mic).

---

## NSynth-test  —  4,096 single notes, all instrument families

| | |
|---|---|
| **Exact MIDI match** | **66.0%** (2705 / 4096) |
| **Chroma-correct** (ignores octave) | **79.0%** (3236 / 4096) |
| Octave errors | 13.0% (531) |
| Undetected | 18.8% (769) |

### Per-instrument-family

| family | n | exact | chroma | octave-err | undetected |
|---|---:|---:|---:|---:|---:|
| reed | 235 | **86.8%** | 90.6% | 9 | 14 |
| string | 306 | **78.1%** | 89.5% | 35 | 25 |
| brass | 269 | 72.5% | 77.7% | 14 | 59 |
| keyboard | 766 | 69.2% | 80.4% | 86 | 142 |
| vocal | 141 | 68.8% | 83.0% | 20 | 18 |
| bass | 843 | 65.8% | 75.2% | 79 | 200 |
| guitar | 652 | 64.6% | 69.6% | 33 | 190 |
| organ | 502 | 60.4% | 84.3% | 120 | 59 |
| mallet | 202 | 55.0% | 68.8% | 28 | 40 |
| flute | 180 | **27.8%** | 87.2% | **107** | 22 |

The flute number is the most striking: 87% chroma but only 28% exact —
**45% of flute notes are detected at the wrong octave**. Flute has a weak
fundamental relative to its 2nd harmonic, so the "first peak above
threshold" rule lands on the harmonic period (= one octave too high).

Mallet (xylophone, marimba) has the fastest decay and the highest
undetected rate — many samples are essentially over by the time the
median smoother accumulates its history.

---

## MDB-stem-synth  —  30 real solo instrument/vocal stems  (2.4M frames analyzed)

This is the closest available proxy for "someone playing a song's
guitar/bass/violin part" — real solo performances from MedleyDB
resynthesized with sample-perfect f0 ground truth.

| Metric | Value |
|---|---:|
| **Raw Pitch Accuracy (RPA)** | **55.5%** |
| **Raw Chroma Accuracy (RCA)** | **57.5%** |
| Voicing Recall (VR) | 65.6% |
| Voicing False Alarm (VFA) | **0.4%** |
| Overall Accuracy (OA) | 77.1% |
| Octave-error rate | 2.9% |

The bottleneck is voicing recall: we only catch 66% of voiced frames.
Real solo performances have natural dynamics — quieter notes, decays,
breaths — that fall under our 0.018 RMS gate. False alarms are
essentially zero, which means the gates aren't letting noise through;
they're just clipping legitimate quiet notes.

---

## MIR-1K  —  100 vocal clips  (40k frames, clean right channel)

The standard monophonic singing benchmark.

| Metric | Value |
|---|---:|
| **Raw Pitch Accuracy (RPA)** | **89.1%** |
| **Raw Chroma Accuracy (RCA)** | **89.3%** |
| Voicing Recall (VR) | 99.4% |
| Voicing False Alarm (VFA) | 18.9% |
| Overall Accuracy (OA) | 86.9% |
| **Octave-error rate** | **0.2%** |

This is **at the published level for classical YIN/pYIN** on the same
dataset. Vocals are loud and continuous — the algorithm has no trouble.

### MIR-1K mix channel  —  vocals + accompaniment

| Metric | Value |
|---|---:|
| Raw Pitch Accuracy (RPA) | 32.7% |
| Raw Chroma Accuracy (RCA) | 35.4% |
| Voicing Recall (VR) | 93.3% |
| Voicing False Alarm (VFA) | 76.4% |

Drops dramatically when the accompaniment is mixed in — expected, since
this is a monophonic detector being fed polyphonic input. Real-world
"phone in the room while a song plays" sits closer to this number than
to the clean one.

---

## Comparison to published baselines

For monophonic pitch detection on these same datasets:

| Algorithm | NSynth (exact) | MDB-stem-synth (RPA) | MIR-1K (RPA, clean) |
|---|---:|---:|---:|
| YIN / pYIN (classical) | ~85–92% | ~80–88% | **~88%** |
| CREPE (deep learning, SOTA) | ~95–98% | ~92–95% | ~91% |
| **ToneFlow autocorrelator** | **66%** | **56%** | **89%** |

Vocal performance is at YIN-class baseline. Instrument performance
is below. The gap on instruments is two distinct failure modes:

1. **Octave errors (~13% on NSynth)** — concentrated on flute and organ.
   The "first NSDF peak above threshold" rule fails when the fundamental
   peak is significantly weaker than the second-harmonic peak. Tried
   lowering the threshold and a sub-octave validation heuristic — both
   either had no effect or destroyed accuracy elsewhere.

2. **Undetected (~19–34%)** — concentrated on mallet, bass, and quiet
   frames of MDB stems. The 0.018 RMS gate and 0.78 clarity threshold
   are tuned for noisy microphone input; they're too aggressive for
   clean recorded audio. Real users with a real mic *need* these gates
   to avoid false detections from fan noise, typing, etc.

---

## What we tried that didn't work

| Change | Result |
|---|---|
| Lower RMS gate (0.018 → 0.002) | Recovers ~6% detected, but added detections are wrong notes — no exact gain |
| Lower clarity threshold (0.78 → 0.5) | Same — more guesses, no better guesses |
| Lower PEAK_THRESHOLD (0.8 → 0.5) | Slightly *worse* across the board |
| Sub-octave peak validation | Catastrophic — broke 469 unit tests, NSynth dropped to 17% exact |

---

## What we shipped that *did* work

| Change | Effect |
|---|---|
| Peak-aware scoring window in NSynth bench | +3.7% exact, +6.2% chroma, -5.9% undetected |

This is a measurement fix, not an algorithm fix. It scores frames near
the energy peak (where users actually play) instead of a fixed 0.4–2.5s
window (which misses percussive instruments entirely).

---

## Promising next steps (not in this commit)

1. **Adaptive RMS gate** — measure noise floor at session start, set the
   gate to noise floor × 3. Would lift VR on MDB without adding false
   alarms in noisy environments.
2. **Spectral fundamental boost** — for instruments with weak fundamentals
   (flute, organ), check the FFT for energy at *half* the detected period
   before accepting an octave-up reading.
3. **Adopt CREPE or SPICE for offline analysis modes** — for guitar/bass
   modes where the user wants accurate per-note feedback, a small
   neural network would close the gap to the SOTA numbers above.

---

## How to reproduce

```bash
# Confirm the harness works
npm run bench:smoke

# Download the datasets (see bench/README.md for URLs)
# ~3.4 GB total

# Run
npm run bench:nsynth -- ./bench/datasets/nsynth-test
npm run bench:mir1k  -- ./bench/datasets/MIR-1K-extracted/MIR-1K
npm run bench:mdb    -- ./bench/datasets/MDB-stem-synth --limit 30
```
