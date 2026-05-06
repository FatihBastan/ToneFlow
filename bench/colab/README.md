# Run the MDB bench on Google Colab

Free-tier CPU is fast enough for the full 30-stem run (~3.5 h end-to-end).
You don't need a GPU — `onnxruntime-node` runs CREPE-tiny in WASM regardless.

## Setup (one-time per session)

The repo is private, so we ship the source via Drive instead of cloning.

### 1. Pack the source locally

```bash
tar --exclude='./node_modules' --exclude='./.next' --exclude='./out' \
    --exclude='./bench/datasets' --exclude='./public/ort' --exclude='./.git' \
    --exclude='./.env*' --exclude='**/.DS_Store' --exclude='./.claude' \
    -czf toneflow-src.tar.gz .
```

Result: ~1.9 MB. Excludes secrets (`.env*`), build artifacts, and the
datasets that the notebook downloads fresh from Zenodo. Verify with
`tar tzf toneflow-src.tar.gz | grep -E '\.env|\.claude'` — should print
nothing.

### 2. Upload to Drive

Drag-drop `toneflow-src.tar.gz` into the Drive web UI at the root of
`MyDrive/`. The notebook expects it at exactly
`/content/drive/MyDrive/toneflow-src.tar.gz`.

### 3. Open the notebook in Colab

Two options:
- **Upload** — Colab → File → Upload notebook → pick `mdb_bench.ipynb`
  from `bench/colab/` in this repo.
- **Drive** — copy `mdb_bench.ipynb` to your Drive, then
  right-click → Open with → Google Colaboratory.

### 4. Set runtime + run

Runtime → Change runtime type → CPU. Then Runtime → Run all.
**Don't close the tab** — Colab disconnects ~90 min after the last cell
finishes. While a bench cell is running, idle disconnect won't fire.

## What you should see

| Detector | RPA on full 30 stems | Per-stem |
|---|---:|---:|
| NSDF (`--rms-gate 0.005`) | ~70 % (target) | ~30–60 s each |
| CREPE-tiny (`--crepe`)    | ~93 % (hypothesis) | ~5–8 min each |

If CREPE lands within ±2 pts of the 5-stem 93.4 %, the extrapolation is
confirmed. If it diverges materially, that's signal worth investigating —
paste the per-stem table back.

## Output

The final cell saves both logs back to
`/content/drive/MyDrive/toneflow-bench/`:
- `bench-mdb-nsdf.log` — NSDF baseline
- `bench-mdb-crepe.log` — CREPE-tiny

## Gotchas

- **Retry the Zenodo download** if it stalls partway.
- **Free-tier compute units** — keep the runtime on CPU. GPU/TPU burn
  units 5–10× faster with no benefit here.
- **If the runtime disconnects mid-bench**, the partial log is still in
  `/content/`, but you'll need to re-run from cell 4 (Zenodo download
  is the only step that's actually slow to repeat).
