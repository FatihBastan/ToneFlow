# ToneFlow

Real-time music detection and performance tracking app. Sing or play an instrument near your device — ToneFlow identifies the song, syncs lyrics karaoke-style, and tracks your performance with a Guitar Hero-inspired streak system.

## Features

- **Song Detection** — Identifies songs via microphone using ACRCloud audio fingerprinting
- **Album Color Theming** — Background animates with colors extracted from the album artwork
- **Synced Lyrics** — Word-by-word karaoke display that appears when vocals are detected
- **Streak System** — Guitar Hero-style streak counter with tiers (Warming Up → On Fire → Blazing → Legendary)
- **Pitch Detection** — Real-time note detection using Web Audio API autocorrelation
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

2. **Configure API keys** — Copy `.env.local.example` or create `.env.local`:
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
| `npm run test` | Run tests |

## License

ISC
