# ToneFlow pitch-detection benchmarks

Real-dataset benchmarks for the pitch detector. The unit tests in `tests/`
prove the algorithm is mathematically correct against synthetic tones; these
benchmarks measure how it actually behaves on real instrument and vocal
recordings.

The detector under test mirrors the production microphone hook exactly:
high-pass filter → Hann window → NSDF autocorrelation → 5-frame median →
octave-jump correction.

---

## Quick smoke test (no download required)

```bash
npm run bench:smoke
```

Generates a tiny synthetic fixture for each dataset format and runs the
three runners to confirm the harness works on your machine.

---

## 1. NSynth-test  —  instruments, single notes  (~525 MB)

The single best dataset for "does the detector identify the right MIDI
note for instrument X". Each example is a 4-second isolated note with a
labeled pitch and instrument family (acoustic_bass, electric_guitar,
etc.).

### Get the data

```bash
# from https://magenta.tensorflow.org/datasets/nsynth
curl -L -o nsynth-test.jsonwav.tar.gz \
  https://storage.googleapis.com/magentadata/datasets/nsynth/nsynth-test.jsonwav.tar.gz
tar xzf nsynth-test.jsonwav.tar.gz
# extracts to ./nsynth-test/
```

### Run

```bash
# Full run (~4096 clips, a few minutes)
npm run bench:nsynth -- ./nsynth-test

# Quick smoke run (50 clips)
npm run bench:nsynth -- ./nsynth-test --limit 50

# Single instrument family
npm run bench:nsynth -- ./nsynth-test --family guitar
```

Reports exact-MIDI-match %, chroma-correct % (ignores octave), octave-error
rate, and undetected %, broken down per instrument family.

---

## 2. MDB-stem-synth  —  realistic solo instrument performances  (~3 GB)

Closest available proxy for "someone playing a song's guitar/bass/violin
part". Real solo stems from MedleyDB resynthesized so the f0 ground truth
is sample-perfect. Includes guitar, bass, violin, cello, piano, vocals,
horns, etc.

### Get the data

```bash
# from https://zenodo.org/records/1481172
curl -L -o MDB-stem-synth.tar.gz \
  https://zenodo.org/records/1481172/files/MDB-stem-synth.tar.gz
tar xzf MDB-stem-synth.tar.gz
```

### Run

```bash
npm run bench:mdb -- ./MDB-stem-synth
npm run bench:mdb -- ./MDB-stem-synth --limit 20
npm run bench:mdb -- ./MDB-stem-synth --instrument guitar
```

Reports MIREX metrics (RPA, RCA, VR, VFA, OA) per instrument and overall.

---

## 3. MIR-1K  —  vocals  (~133 MB)

The standard monophonic singing dataset. 1000 short Chinese karaoke clips
with accompaniment in the LEFT channel and clean vocals in the RIGHT
channel — useful for measuring both ceiling (clean vox) and realistic
("phone mic in the room") performance.

### Get the data

```bash
# Mirror — original was on a Sun Yat-sen University server that is now flaky.
# A current mirror is on Zenodo:
curl -L -o MIR-1K.zip https://zenodo.org/records/3532216/files/MIR-1K.zip
unzip MIR-1K.zip
```

### Run

```bash
# Clean vocals (right channel only) — ceiling for the algorithm
npm run bench:mir1k -- ./MIR-1K

# Mixed stereo — realistic open-mic conditions (vocals + accompaniment)
npm run bench:mir1k -- ./MIR-1K --channel mix

# Quick check
npm run bench:mir1k -- ./MIR-1K --limit 50
```

---

## Metric definitions (MIREX-standard)

- **RPA** — Raw Pitch Accuracy. % of voiced frames where the detected f0 is within ±50 cents of the reference. The headline number.
- **RCA** — Raw Chroma Accuracy. Same as RPA but ignores octave errors. `RCA - RPA` is the octave-error rate.
- **VR**  — Voicing Recall. Of frames the reference says are voiced, what fraction did we detect anything for.
- **VFA** — Voicing False Alarm. Of frames the reference says are unvoiced (silence), what fraction did we falsely flag as voiced.
- **OA**  — Overall Accuracy. Combined pitch+voicing single number.

For context — published results on these datasets (real, not synthetic):

| Algorithm | NSynth-test (exact) | MDB-stem-synth (RPA) | MIR-1K (RPA) |
|---|---|---|---|
| YIN / pYIN (classical) | ~85–92% | ~80–88% | ~75–85% |
| CREPE (deep learning, SOTA) | ~95–98% | ~92–95% | ~88–92% |
| ToneFlow (this autocorrelator) | run the bench to find out |

---

## Notes

- Runs are CPU-bound and serial. Full MDB-stem-synth (NSDF) on a laptop is ~10–15 minutes; CREPE-tiny on the same set is ~3 hours of CPU.
- Use `--limit N` while iterating on detector changes; full runs only for final numbers.
- The scripts print a single trailing line per stem; pipe to `tee bench.log` to keep output.
- All three runners share `bench/lib/detector.ts` so changes to the production hook automatically flow through.
- For the long CREPE run, see [colab/](./colab/) — a one-click notebook that runs the full bench on free-tier Google Colab CPU.
