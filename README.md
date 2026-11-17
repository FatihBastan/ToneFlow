# ToneFlow

Real-time music detection and performance tracking app. Sing or play an instrument near your device — ToneFlow identifies the song, syncs lyrics karaoke-style, and scores your playing with a Guitar Hero-style streak system.

<!-- TODO: add a short demo GIF here, e.g. docs/demo.gif (song detected → colors → lyrics → streak) -->

## Highlights

- **Two pitch detectors, picked per mode.** A hand-written NSDF autocorrelation pipeline (high-pass → Hann window → NSDF → spectral sub-octave guard → median smoothing → octave-jump correction) and **CREPE-tiny** (deep-learning pitch tracker, 1.9 MB ONNX) running in the browser with ONNX Runtime Web. CREPE is used for instruments, NSDF for vocals, because the benchmarks below say so.
- **Benchmarked on real datasets**, not just synthetic tones — the harness in [`bench/`](bench/) runs the exact production detector on NSynth, MDB-stem-synth and MIR-1K.
- **Song recognition and lyrics sync**: ACRCloud audio fingerprinting gives the song and play offset; LRCLIB / Musixmatch lyrics are synced word-by-word from that offset.
- **Runs on Android** through Capacitor, with the ONNX Runtime WASM bundled locally.

### Benchmark summary

| Dataset | Metric | NSDF | CREPE-tiny |
|---|---|---:|---:|
| NSynth-test (4,096 single notes, all instrument families) | exact MIDI match | 66.1% | **73.4%** |
| MDB-stem-synth (real solo stems, 5-stem subset) | raw pitch accuracy | 61.4% | **93.4%** |
| MIR-1K (singing, 100-clip subset) | raw pitch accuracy | **89.0%** | 86.2% |

Full tables, per-instrument breakdowns and failure analysis (e.g. why flute lands an octave high): [`bench/RESULTS.md`](bench/RESULTS.md).

## How it works

```
mic ──► Web Audio API ──► pitch detector (NSDF or CREPE-tiny) ──► MIDI note ──► streak / note track
  │
  └──► 5–10 s WAV clip ──► /api/recognize (ACRCloud, HMAC-signed server-side)
                              └─► song + play offset ──► /api/spotify (album art → color palette → animated background)
                                                     └─► /api/lyrics (LRCLIB / Musixmatch → word-level karaoke)
```

API keys stay on the server: the browser only talks to the Next.js routes in `app/api/`.

## Features

- **Song Detection** — Identifies songs via microphone using ACRCloud audio fingerprinting
- **Album Color Theming** — Background animates with colors extracted from the album artwork
- **Synced Lyrics** — Word-by-word karaoke display that appears when vocals are detected
- **Streak System** — Guitar Hero-style streak counter with tiers (Warming Up → On Fire → Blazing → Legendary)
- **Pitch Detection** — Real-time note detection (NSDF autocorrelation or CREPE-tiny, per mode)
- **Multiple Modes** — Vocal, instrument, drum, free play, and full performance sessions

## Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Framer Motion

## Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/FatihBastan/ToneFlow.git
   cd ToneFlow
   npm install
   ```

2. **Configure API keys** — `cp .env.local.example .env.local` and fill in:
   ```
   ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com
   ACRCLOUD_ACCESS_KEY=your_key
   ACRCLOUD_ACCESS_SECRET=your_secret

   SPOTIFY_CLIENT_ID=your_id
   SPOTIFY_CLIENT_SECRET=your_secret

   MUSIXMATCH_API_KEY=your_key          # optional
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   - **ACRCloud** — Sign up at [acrcloud.com](https://www.acrcloud.com/) (free trial)
   - **Spotify** — Create an app at [developer.spotify.com](https://developer.spotify.com/dashboard)
   - **Musixmatch** — Optional, for word-level lyrics ([developer.musixmatch.com](https://developer.musixmatch.com/))

3. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and allow microphone access.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run test` | Run the unit tests (Vitest) |
| `npm run bench:smoke` | Check the benchmark harness on tiny synthetic fixtures (no download) |
| `npm run bench:nsynth` / `bench:mdb` / `bench:mir1k` | Real-dataset benchmarks — see [`bench/README.md`](bench/README.md) |
| `npm run mobile` | Build and open in Android Studio |

## Android (Capacitor)

ToneFlow can run as a native Android app via Capacitor.

1. **Deploy the web app to Vercel first** (the mobile app calls your hosted API routes)
2. Update the `NEXT_PUBLIC_API_URL` in `package.json`'s `build:mobile` script with your Vercel URL
3. Run:
   ```bash
   npm run mobile
   ```
4. Android Studio opens — build and run on a device/emulator
5. To generate a signed APK for the Play Store, use **Build > Generate Signed Bundle / APK** in Android Studio

**Requirements:** [Android Studio](https://developer.android.com/studio) with SDK 22+

## Credits

- [CREPE](https://github.com/marl/crepe) — Kim, Salamon, Li, Bello, *CREPE: A Convolutional Representation for Pitch Estimation*, ICASSP 2018. The tiny checkpoint is converted to ONNX; see [`public/models/README.md`](public/models/README.md).
- Benchmark datasets: [NSynth](https://magenta.tensorflow.org/datasets/nsynth), [MDB-stem-synth](https://zenodo.org/records/1481172), [MIR-1K](https://zenodo.org/records/3532216).

## License

ISC
