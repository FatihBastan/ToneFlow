# ToneFlow — Project Brief for Claude Code

## How to Use This File

1. Create your project folder: `mkdir toneflow && cd toneflow`
2. Open it in VS Code: `code .`
3. Save this file as `CLAUDE.md` in the project root (Claude Code reads this automatically)
4. Open Claude Code (Spark icon or terminal → `claude`)
5. Paste the prompt at the bottom of this file to kick things off

---

## Project Vision

ToneFlow is a real-time music detection and performance tracking web app. Here's what it does:

### Core Features

1. **Song Detection**: When you sing or play an instrument near your device, the app listens via your microphone and identifies the song using audio fingerprinting (like Shazam).

2. **Album Color Theming**: Once a song is detected, the app pulls the album artwork from Spotify and extracts its dominant colors. The entire background becomes an animated, blurred wash of those album colors — no text, no album art details, just the color atmosphere.

3. **Lyrics Reveal Mechanic**:
   - **Instrument only detected** → Background shows blurred album colors, lyrics are blurred/hidden
   - **Vocals/singing detected** → Lyrics fully appear with word-by-word tracking (the current word being sung is highlighted and the display follows in real-time like karaoke)

4. **Guitar Hero Streak System**:
   - The app tracks a "streak" of correctly matched notes while playing
   - Each correct note increases the streak counter
   - If the app detects a note that doesn't match the song's expected note sequence, the streak resets to 0
   - Streak tiers with multipliers:
     - 5+ notes: "Warming Up" (1.5x)
     - 15+ notes: "On Fire" (2x)
     - 30+ notes: "Blazing" (4x)
     - 50+ notes: "Legendary" (8x)
   - Visual feedback: glow effects, color changes, animations that intensify with streak

5. **Real-time Pitch Detection**: Using the Web Audio API with autocorrelation algorithm to detect musical notes from the microphone input, converting frequencies to MIDI note values.

---

## Technical Architecture

### Stack

- **Framework**: Next.js 14+ (App Router) with React
- **Styling**: Tailwind CSS + custom CSS for animations
- **Language**: TypeScript
- **Deployment**: Vercel (recommended) or any Node.js host

### Why Next.js?

We need server-side API routes to keep API secrets safe. The ACRCloud secret key and Spotify client secret must NEVER be exposed in browser code. Next.js API routes (`app/api/...`) handle this perfectly.

### Project Structure

```
toneflow/
├── CLAUDE.md                    # This file - project context for Claude Code
├── .env.local                   # API keys (NEVER commit this)
├── app/
│   ├── layout.tsx               # Root layout with fonts
│   ├── page.tsx                 # Main app page
│   ├── globals.css              # Global styles + Tailwind
│   └── api/
│       ├── recognize/route.ts   # ACRCloud song recognition endpoint
│       ├── lyrics/route.ts      # LRCLIB/Musixmatch lyrics endpoint
│       ├── spotify/
│       │   ├── token/route.ts   # Spotify OAuth token management
│       │   ├── track/route.ts   # Get track metadata + album art
│       │   └── search/route.ts  # Search tracks by name
│       └── health/route.ts      # Health check
├── components/
│   ├── ToneFlow.tsx            # Main app component (orchestrator)
│   ├── AudioListener.tsx        # Microphone + pitch detection logic
│   ├── SongDetector.tsx         # ACRCloud integration for song ID
│   ├── AnimatedBackground.tsx   # Album-color animated background (Canvas)
│   ├── LyricsDisplay.tsx        # Word-by-word synced lyrics
│   ├── StreakTracker.tsx         # Guitar Hero streak UI
│   ├── NoteTrack.tsx            # Expected vs detected note display
│   └── SongInfo.tsx             # Current song metadata display
├── hooks/
│   ├── useMicrophone.ts         # Mic access + audio analysis hook
│   ├── usePitchDetection.ts     # Autocorrelation pitch detection
│   ├── useSongRecognition.ts    # ACRCloud recognition hook
│   └── useColorExtraction.ts    # Extract colors from album art
├── lib/
│   ├── acrcloud.ts              # ACRCloud API helpers (server-side only)
│   ├── spotify.ts               # Spotify API helpers (server-side only)
│   ├── lyrics.ts                # LRCLIB + Musixmatch helpers
│   ├── pitch.ts                 # Pitch detection algorithms
│   ├── colorExtract.ts          # Color extraction from images
│   └── noteMapping.ts           # MIDI ↔ note name conversions
├── types/
│   └── index.ts                 # TypeScript type definitions
├── public/
│   └── ...                      # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## API Integration Details

### 1. ACRCloud — Song Recognition

**What it does**: Takes a short audio sample from the mic, sends it to ACRCloud, gets back the song title, artist, album, Spotify ID, etc.

**Setup**:
1. Go to https://www.acrcloud.com/ and sign up (14-day free trial, no credit card)
2. Create a project in the dashboard:
   - Audio Engine: "Audio Fingerprinting"
   - Audio Source: "Recorded Audio" (handles ambient noise)
   - Enable "3rd Party ID Integration" (to get Spotify/Deezer IDs)
3. Save the `host`, `access_key`, and `access_secret` from your project

**Env vars needed**:
```
ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com
ACRCLOUD_ACCESS_KEY=your_access_key
ACRCLOUD_ACCESS_SECRET=your_access_secret
```

**How recognition works in the app**:
1. Capture ~5-10 seconds of audio from the mic using Web Audio API
2. Convert the audio buffer to a WAV or raw PCM format
3. Send it to our Next.js API route `/api/recognize`
4. Server-side: sign the request with HMAC-SHA1 using the access secret, POST to ACRCloud
5. ACRCloud returns: song title, artist, album, duration, Spotify track ID, etc.
6. Use the Spotify ID to fetch album art and metadata

**ACRCloud API endpoint**: `POST https://{host}/v1/identify`

**Required form data**:
- `sample`: audio file (WAV/MP3)
- `sample_bytes`: size of audio
- `access_key`: your key
- `data_type`: "audio"
- `signature`: HMAC-SHA1 signature
- `signature_version`: "1"
- `timestamp`: current unix timestamp

**Response includes** (among other things):
```json
{
  "status": { "code": 0, "msg": "Success" },
  "metadata": {
    "music": [{
      "title": "Bohemian Rhapsody",
      "artists": [{ "name": "Queen" }],
      "album": { "name": "A Night at the Opera" },
      "external_metadata": {
        "spotify": { "track": { "id": "..." } }
      },
      "play_offset_ms": 30000,
      "duration_ms": 354000
    }]
  }
}
```

The `play_offset_ms` field is KEY — it tells us where in the song the detected audio is, which we need for lyric sync.

---

### 2. Spotify Web API — Album Art, Metadata, Colors

**What it does**: Gets album artwork (to extract colors), track metadata, and can search for songs.

**Setup**:
1. Go to https://developer.spotify.com/dashboard
2. Create an app
3. Get Client ID and Client Secret
4. For this app we only need the Client Credentials flow (no user login needed — we just need public metadata)

**Env vars needed**:
```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

**Auth flow** (Client Credentials — server-side only):
```
POST https://accounts.spotify.com/api/token
Body: grant_type=client_credentials
Header: Authorization: Basic base64(client_id:client_secret)
```

Returns an access token valid for 1 hour.

**Endpoints we'll use**:
- `GET /v1/tracks/{id}` — Get track details including album art URL
- `GET /v1/search?q={query}&type=track` — Search for tracks
- `GET /v1/albums/{id}` — Get album details

**Album art → Color extraction**:
Spotify returns album art URLs (640x640, 300x300, 64x64). We fetch the image and extract dominant colors using a client-side canvas color quantization algorithm (no extra API needed). Use the `node-vibrant` npm package for server-side extraction, or do it client-side with canvas.

**Important Spotify rules for Dev Mode**:
- Limited to 25 users (you + friends is fine)
- App owner must have Spotify Premium (you do)
- Don't store or cache Spotify content beyond what's needed for display
- Must show Spotify attribution

---

### 3. LRCLIB — Free Synced Lyrics (Primary)

**What it does**: Returns time-synced lyrics in LRC format. Completely free, no auth needed.

**Base URL**: `https://lrclib.net/api`

**Endpoints**:
- `GET /get?artist_name={artist}&track_name={track}&duration={seconds}` — Get lyrics for a specific track
- `GET /search?q={query}` — Search lyrics

**Response example**:
```json
{
  "id": 151738,
  "trackName": "The Chain",
  "artistName": "Fleetwood Mac",
  "albumName": "Rumours",
  "duration": 271,
  "syncedLyrics": "[00:27.93] Listen to the wind blow\n[00:30.88] Watch the sun rise...",
  "plainLyrics": "Listen to the wind blow\nWatch the sun rise..."
}
```

**LRC format parsing**: `[mm:ss.xx] Lyrics line` — parse these timestamps to sync with playback position from ACRCloud's `play_offset_ms`.

**Limitation**: LRCLIB provides LINE-level sync, not word-level. Each line has a timestamp but individual words within a line don't. For the word-by-word karaoke effect, we have two options:
1. **Estimate word timing**: Take the line duration (time between current and next line) and divide evenly across words — this gives a decent approximation
2. **Musixmatch word-synced lyrics**: Use Musixmatch as a fallback/upgrade source for true word-level timing (limited free tier: 50 req/day)

---

### 4. Musixmatch API — Word-Level Synced Lyrics (Optional/Upgrade)

**What it does**: Provides word-level synchronized lyrics where available.

**Setup**:
1. Go to https://developer.musixmatch.com/ and register
2. Get your API key

**Env var**:
```
MUSIXMATCH_API_KEY=your_api_key
```

**Free tier**: 50 requests/day — use it as an enhancement layer on top of LRCLIB, not the primary source.

**Endpoints**:
- `GET /ws/1.1/track.search?q_track={title}&q_artist={artist}&apikey={key}`
- `GET /ws/1.1/track.lyrics.get?track_id={id}&apikey={key}`
- `GET /ws/1.1/track.subtitle.get?track_id={id}&apikey={key}` — this returns synced lyrics

---

## .env.local Template

```
# ACRCloud — Song Recognition
ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com
ACRCLOUD_ACCESS_KEY=
ACRCLOUD_ACCESS_SECRET=

# Spotify — Album Art & Metadata
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Musixmatch — Word-Level Lyrics (optional, 50 req/day free)
MUSIXMATCH_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Key Technical Decisions

### Pitch Detection Algorithm
Use **autocorrelation** on raw audio data from the Web Audio API's `AnalyserNode`. This gives us the fundamental frequency which we convert to MIDI note numbers, then to note names (C4, D#3, etc.). The `AnalyserNode.fftSize` should be 2048 for good pitch resolution.

### Audio Capture for Song Recognition
The mic stream needs to be captured as a WAV buffer (PCM 16-bit, 44.1kHz mono) for ACRCloud. Use the `MediaRecorder` API or manually buffer from `ScriptProcessorNode` / `AudioWorkletNode`. Send 5-10 seconds of audio for best results.

### Color Extraction
Use the `node-vibrant` package (npm: `node-vibrant`) or a simple canvas-based median-cut algorithm to extract 4-6 dominant colors from the album art. These colors drive the animated background.

### Voice vs Instrument Detection
A simple heuristic: human voice typically has strong harmonics between 80Hz–1100Hz with specific formant patterns. For a simpler approach:
- If RMS volume is above a threshold AND pitch is detected in vocal range (80Hz–1100Hz for male, 160Hz–1600Hz for female) → likely vocals → show lyrics
- If pitch is detected outside typical vocal range OR lacks vocal formant characteristics → likely instrument → blur lyrics
- This can be refined later with ML, but the heuristic works for an MVP

### Streak Note Matching
- When ACRCloud identifies a song and returns the `play_offset_ms`, we know where in the song the user is
- We need a reference note sequence for each song — this can be approximated from MIDI files or pre-computed
- For MVP: compare the detected pitch to the song's key/scale. If the detected note is within the correct scale, increment streak. If it's a note outside the scale, reset streak.
- For advanced: use actual MIDI note data from sources like midi-db or Hooktheory

---

## Design Direction

### Aesthetic: "Concert Immersion"
- **Dark base** — near-black when idle
- **Album color washes** — animated blurred orbs that pulse with the music's intensity
- **Typography**: Use a modern sans-serif for lyrics (like "Outfit" or "Satoshi") and a tech font for streak/stats (like "Orbitron" or "JetBrains Mono")
- **Glassmorphism** for UI panels (backdrop-blur, subtle borders)
- **Animations**: Everything should feel alive — gentle pulsing when idle, reactive motion when music plays
- **The lyrics should feel like they're floating in the color wash**, not sitting in a text box

### Key Screens
1. **Idle/Home**: Minimal. Dark background with subtle animation. A single mic button or auto-listen indicator.
2. **Listening**: Animated waveform or ring that shows audio intensity. "Listening..." status.
3. **Song Detected (Instrument)**: Background floods with album colors. Blurred lyrics float. Note track shows expected vs detected. Streak counter active.
4. **Song Detected (Vocals)**: Lyrics unblur with word-by-word highlighting. Background still has album colors but slightly dimmed so lyrics are readable.

---

## Implementation Priority

### Phase 1 — Foundation (Do this first)
1. Set up Next.js project with TypeScript + Tailwind
2. Implement microphone access and pitch detection (Web Audio API)
3. Build the animated background component
4. Create the basic UI layout (idle → listening → detected states)

### Phase 2 — Song Recognition
5. Integrate ACRCloud API (server-side route + client hook)
6. Integrate Spotify API for metadata + album art
7. Color extraction from album art
8. Wire up: mic → record audio → send to ACRCloud → get song → fetch Spotify data → animate background with colors

### Phase 3 — Lyrics
9. Integrate LRCLIB for synced lyrics
10. Build the lyrics display component with word-by-word timing
11. Implement the blur/unblur mechanic based on voice detection
12. (Optional) Add Musixmatch for word-level sync upgrade

### Phase 4 — Streak System
13. Build the streak tracking logic
14. Implement note matching against song key/scale
15. Build the streak UI with tier effects
16. Add streak reset animation

### Phase 5 — Polish
17. Add transitions between states
18. Optimize performance (especially canvas animations)
19. Add error handling and edge cases
20. Mobile responsiveness
21. Spotify attribution

---

## NPM Packages to Install

```bash
# Core
npx create-next-app@latest toneflow --typescript --tailwind --app --src-dir=false

# Song recognition
npm install crypto-js                # For HMAC-SHA1 signing (ACRCloud)

# Color extraction
npm install node-vibrant             # Extract dominant colors from images

# Lyrics parsing
npm install lrc-parser               # Parse LRC format lyrics (or write custom parser)

# Audio
# (Web Audio API is built into browsers, no package needed)

# UI
npm install framer-motion            # Smooth animations
npm install @radix-ui/react-dialog   # Accessible modals if needed

# Dev
npm install -D @types/node @types/react
```

---

## Prompt to Kick Off Claude Code

Paste this as your FIRST message in Claude Code after saving this file as CLAUDE.md:

---

Read the CLAUDE.md file in this project root — it contains the complete project brief for ToneFlow, a real-time music detection app with lyrics tracking and guitar hero streak mechanics.

Start with Phase 1: Set up the Next.js project with TypeScript and Tailwind, then build the microphone access hook with pitch detection (autocorrelation algorithm using Web Audio API), the animated canvas background component, and the main app component with state management for idle → listening → song detected states. Create the .env.local template file too.

Make sure the pitch detection converts frequencies to MIDI note numbers and note names. The animated background should render colorful orbs on a canvas that pulse based on audio intensity. Use the project structure defined in CLAUDE.md.

After Phase 1 is solid, move to Phase 2: wire up ACRCloud song recognition through a Next.js API route (POST /api/recognize) and Spotify metadata fetching (GET /api/spotify/track). The ACRCloud route needs HMAC-SHA1 signing. The Spotify route uses Client Credentials auth flow. Extract album colors using node-vibrant and feed them to the background.

---
