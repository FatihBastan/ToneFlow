# Run the MDB bench on Google Colab

Free-tier CPU is fast enough for the full 30-stem run (~3.5 h end-to-end).
You don't need a GPU — `onnxruntime-node` runs CREPE-tiny in WASM.

## One-click open

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/FatihBastan/ToneFlow/blob/main/bench/colab/mdb_bench.ipynb)

The notebook walks through: install Node 20 → clone repo → download
MDB-stem-synth (~3 GB from Zenodo) → run NSDF baseline → run CREPE-tiny
→ tail the headline numbers → optionally copy logs to Drive.

## What you should see

| Detector | RPA on full 30 stems | Per-stem |
|---|---:|---:|
| NSDF (`--rms-gate 0.005`) | ~70 % (target) | ~30–60 s each |
| CREPE-tiny (`--crepe`)    | ~93 % (hypothesis) | ~5–8 min each |

If the CREPE number lands within ±2 pts of the 5-stem 93.4 %, the
extrapolation is confirmed. If it diverges materially, that's signal
worth investigating — paste the per-stem table back here.

## Gotchas

- **Don't close the tab.** Colab disconnects ≈ 90 min after the *last*
  cell finishes; while a bench cell is running it's fine, but a closed
  tab kills it.
- **Retry the Zenodo download** if it stalls partway. Zenodo throttles
  unauthenticated traffic.
- **Check Runtime → Change runtime type → CPU.** GPU/TPU runtimes give
  no speedup and burn your free-tier compute units.
