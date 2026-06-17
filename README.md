# listen

A minimalist web music player that streams curated playlists from YouTube or any direct audio URL. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

An instance runs at [listen.couch.studio](https://listen.couch.studio).

## Features

**Player**
- Streams from YouTube video IDs (no ads, no video) or from direct audio-file URLs (self-hosted MP3s, Internet Archive, Audius). Sources mix freely per track within a tape; the now-playing attribution names whichever host the track came from.
- Scrubber with seek, live timestamps, and a per-track progress bar. Autoadvances through the playlist; unplayable tracks (deleted, region-blocked, embed-restricted) auto-skip.
- Full keyboard navigation (see [Keyboard Controls](#keyboard-controls)), MediaSession lock-screen controls and artwork, Wake Lock while playing, and a native share sheet from the header `↑` button.
- **Tape library** (`≣` button, shown only when more than one tape is published): a left drawer of published tapes drawn as cassette spines. The tape you're viewing wears the live background color and sits pulled off the shelf; others desaturate; the playing tape carries a now-playing equalizer. Picking one hot-swaps the whole player in place — tracks, color, visualizer default, metadata — with no reload. Every tape is deep-linkable at `?tape=<id>`.
- **Global player bar**: a started track keeps playing across tape switches. While browsing another tape, the bar shows a chip back to the playing tape, and the browsed tape's last-played row offers a `⏵ timecode` chip to resume from there.
- Service worker caches the shell; playlist data is always fetched fresh.
- Per-playlist playback is saved to `sessionStorage` and resumes on reload without autoplay. On mobile, returning to the foreground within 30 s of backgrounding resumes the same track automatically.
- Offline indicator dims the UI and hides the bar; after a few seconds of buffering a banner and skip (⏭︎) button appear, with retry on a longer stall.
- Embeddable via `embed.html` for iframe integration. Respects `prefers-reduced-motion` (color drift and decorative transitions are dropped).

**Visualizer**
- The `⊙` button (shown while playing) opens a fullscreen WebGL visualization. Eleven are available — the default "Bloom" mesh gradient plus rain, aurora, ink, incense, a Lissajous scope, a starfield warp, contour topography, caustics, a feedback kaleidoscope, and a disco ball. A picker in the lower-right corner switches between them with a crossfade; the choice is remembered per playlist, and each playlist's default is set in the admin. See [docs/visualizations](docs/visualizations/README.md) for the gallery.
- One dominant color always tracks the live background drift, so entering and leaving stays color-continuous and the iOS status bar keeps matching. Tap/click spawns blooms; it blooms on its own when idle and once per track change; on mobile, tilting the device steers the motion (iOS prompts for orientation when the visualizer opens). Renders at a capped 30 fps and pauses decorative layers behind it. Closing on pause, offline, or playlist end; track changes stay inside it. Requires WebGL — the button is absent without it.

**Playlist management (admin)**
- Styled like the player it edits, on a cassette-spine shelf (published tapes first; unpublished dimmed with a dashed edge).
- Create, edit, reorder (drag), and delete playlists without touching JSON; 5-second undo after a track delete.
- Auto-fetches title and artist from YouTube oEmbed; pasting any other http(s) URL adds it as a direct-audio track (manual title/artist, with a hint spelling out the rights, HTTPS/Range, and format requirements). Import an entire YouTube playlist with a YouTube Data API v3 key (stored in `localStorage`, sent only to Google).
- Color picker (fixed hex, random-per-load, or Pride rainbow), per-playlist default visualization, and one-tap geographic location.
- Publish/unpublish to the library drawer and drag to reorder it; promote any playlist to live.
- Password-gated. Remote saves commit directly to `main` via the GitHub API — no server required — and the deploy triggers automatically (~60 s to live), with live save-status and conflict detection.

**Localization & accessibility**
- All UI strings, ARIA labels, and date formats auto-detect from `navigator.language` across 11 languages (English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi), with locale-appropriate date and artist–title ordering, km distances, and Russian plural forms.
- ARIA roles and localized live-region announcements throughout; scrubber `aria-valuetext` reads elapsed/total in the locale pattern; hover states limited to `@media (hover: hover)`; font sizes follow iOS Dynamic Type.

**Theming & ambiance**
- Per-playlist color: fixed hex, random on each load, or Pride rainbow (rows take Progress Pride colors; the background drifts the spectrum). Otherwise the background slowly drifts a warm palette while music plays.
- Long titles and artists marquee-scroll rather than truncate. A footer below the track list shows created/edited dates (scroll to reveal).
- **Location & distance**: a tape with a location stores its city and fuzzed coordinates (±1 mile — exact location never persisted), reverse-geocoded via OpenStreetMap Nominatim. The footer's last line is a tap-to-reveal "how far away are you?" invitation; the haversine distance is computed in-browser from the viewer's GPS and never transmitted or stored. Prior grantors skip the tap (Permissions API silent upgrade), and the coordinates are cached for the session.

**Mobile**
- A quick wrist-flick left/right (>250°/s) skips tracks; haptic feedback on each change (Android Chrome). The current track always scrolls into view above the bar.

## Structure

```
index.html              # Player entry point
embed.html              # Stripped-down player for iframe embedding
admin.html              # Admin entry point (password-gated)
config.js               # Active playlist — loaded by the player at parse time
vite.config.js          # Dev middleware: serves config.js/playlists/ from root, local-audio tape
src/
  main.js               # Player logic (shared by index.html and embed.html)
  sources/              # Audio-source seam: ids.js (metadata/caps), registry.js, youtube.js, file.js
  library.js            # Pure tape-library logic: ?tape= params, drawer order, spine colors
  drawer.js             # Library drawer DOM: ≣ button, cassette-spine shelf
  visualizer.js         # Fullscreen WebGL visualizer (+ viz-gl.js GL plumbing, viz-logic.js pure logic)
  viz/                  # Visualization registry: ids.js, registry.js, prelude.js, one module per visualization
  viz-picker.js         # Lower-right visualization picker
  shared.css            # Tokens, reset, and the cassette-spine component shared by both pages
  style.css             # Player styles
  strings.js            # Shared i18n strings, lang detection, fmtDate
  utils.js              # Pure utilities: extractId, parseTrackInput, buildConfig, color helpers, haversine, fuzzyCoord
  auth.js               # PBKDF2 password hashing and verification
  github.js             # GitHub git-tree commit and file-delete operations
  schema.js             # Runtime validation: validateTrack, validatePlaylist, validateIndex
  admin-auth.js         # Auth gate, GitHub repo config, credential storage
  admin.js              # Admin: playlist CRUD, track management, save dispatch
  admin.css / admin-strings.js
playlists/
  index.json            # { active: id, ids: [id, …], published: [id, …] }
  {id}.json             # Individual playlist files (timestamp-based IDs)
public/
  sw.js                 # Service worker
```

### Data formats

**`playlists/{id}.json`**
```json
{
  "id": "1748649600000",
  "created": "2026-05-31",
  "lastEdited": "2026-06-07",
  "title": "my playlist",
  "color": "random",
  "location": { "city": "Portland", "lat": 45.523, "lng": -122.676 },
  "tracks": [
    { "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up", "artist": "Rick Astley" },
    { "source": "file", "url": "https://example.com/song.mp3", "title": "Song", "artist": "Artist" }
  ]
}
```

`color` is `"random"`, a hex string, or `"pride"`. Each track carries a `source`: omitted means `"youtube"` (older playlists need no migration) with `id` as the video ID; `"file"` plays `url` — any http(s) audio URL — through a plain `<audio>` element. Maximum 12 tracks. `location` is optional. `viz` (optional) sets the default visualization by id, omitted when it's the default (`"mesh"`); listeners can override it per playlist from the picker.

**`playlists/index.json`** — `{ "active": id, "ids": [id, …], "published": [id, …] }`. `published` (optional) lists the tapes shown in the library drawer, in display order; every entry must also be in `ids`. The live tape always appears in the drawer. Unpublished tapes are hidden from the drawer but still publicly fetchable and viewable via `?tape=<id>` — curation, not privacy.

**`config.js`** — regenerated by the admin on every save and read directly by the player. Same shape as a playlist file; `id` keys session playback persistence.

### Hosting your own audio

Put files under `public/` (e.g. `public/audio/song.mp3`, served at `/audio/song.mp3`) — they deploy outside `/assets/`, so the service worker leaves them alone and Range requests pass through. GitHub caps repo files at 100 MB; for larger libraries point `url` at any static host with Range support. Wherever audio lives:

- **Rights** — host only audio you may share (your own work, redistribution-licensed, or public domain). This repo is publicly fetchable; buying a track does not grant redistribution rights.
- **HTTPS** — http `url`s are blocked as mixed content (the admin accepts http for local dev only); the URL must be publicly fetchable without auth.
- **Range requests** — the host should answer `Range` with `206`, or seeking breaks and Safari may refuse to play.
- **Formats** — MP3, M4A/AAC, FLAC, and WAV play everywhere; Ogg Vorbis/Opus and WebM lack older-Safari support; live streams play with no duration.

## Setting up your own instance

### Prerequisites

- Node.js 18+
- A GitHub repository (fork this one)
- A GitHub **fine-grained** personal access token scoped to that repository with **Contents: Read and Write**

### 1. Fork and configure

Fork the repo, then create `config.js` in the project root and a matching `playlists/` set:

```js
// config.js
const TAPE = {
  title: "my playlist",
  color: "random",   // or a hex like "#c1440e", or "pride"
  tracks: [
    { id: "VIDEO_ID", title: "Track Title", artist: "Artist Name" },
  ]
};
```

```json
// playlists/index.json
{ "active": "1", "ids": ["1"], "published": ["1"] }

// playlists/1.json
{ "id": "1", "title": "my playlist", "color": "random", "tracks": [] }
```

### 2. Deploy to GitHub Pages

The included Actions workflow (`.github/workflows/deploy.yml`) builds on every push to `main` and publishes to the `gh-pages` branch. In **Settings → Pages**, set the source to **Deploy from a branch → `gh-pages`**. For a custom domain, add a `CNAME` file in the project root.

### 3. Use the admin

Open `admin.html` on your deployed site. On first visit you're prompted for a password (hashed with PBKDF2, stored in `localStorage`), your GitHub token (stored in `sessionStorage` only, cleared when the tab closes), and your GitHub **owner** and **repo** (no defaults). Subsequent visits only ask for the password. Saves commit directly via the GitHub API — no backend — and the deploy triggers automatically.

### 4. Test on iOS (tilt, gestures, location)

iOS needs HTTPS for device orientation and geolocation. Run a quick tunnel over the dev server:

```bash
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://….trycloudflare.com` URL on your phone; open the visualizer (⊙) to grant device orientation, and tap the footer's distance line to grant geolocation.

## Development

```bash
npm install       # install dependencies
npm run dev       # Vite dev server at http://localhost:5173
npm test          # run tests (Vitest)
npm run build     # production build → dist/
```

`config.js` and `playlists/` are served from the project root by Vite middleware (`vite.config.js`). The remote admin (GitHub API) is the supported save path and needs no backend. `npm run dev` also starts a local save server (`server.py` on port 8080, proxied by Vite) for writing files to disk during development; that script is gitignored and not shipped, so forks should use the remote admin instead.

### Local audio files

To exercise the file source during development, drop files into `local-audio/` (gitignored; create it at the repo root) and open `http://localhost:5173/?tape=local`. The dev server builds the playlist from the directory listing — filenames following `Artist - Title.mp3` (an optional leading track number is stripped) fill in metadata — and serves the files with Range support. Accepted: mp3, m4a, aac, flac, wav, ogg, oga, opus, webm; first 12 in natural sort. Dev only — production builds know nothing about `local-audio/`, and `?tape=local` on the live site is just a missing tape.

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` (or `←` / `→`) | Move focus up/down the track list |
| `Enter` / `Space` | Play focused track |
| `Space` (no focus) | Play/pause current track |
| `←` / `→` (visualizer open) | Previous / next track |
| `Esc` | Close the visualizer or the library drawer |
| `Tab` | Standard focus navigation |
