# listen

A minimalist web music player that streams curated playlists from YouTube or any direct audio URL. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

An instance of this runs at [listen.couch.studio](https://listen.couch.studio).

## Features

**Player**
- Streams audio from YouTube video IDs — no ads, no video — or from direct audio-file URLs (self-hosted MP3s, Audius/Internet Archive streams); sources mix freely per track within a tape, and the now-playing attribution names whichever host the track came from
- Scrubber with seek, live timestamps, and per-track progress bar
- Autoadvances through the playlist; player bar slides up on first play; unplayable tracks (deleted, embed-restricted, region-blocked) auto-skip to the next track
- Playing track shows a bright left-bar indicator; paused state returns to the plain active background
- Full keyboard navigation — arrows to move focus, space/enter to play
- MediaSession API: lock screen controls, album artwork, and scrubber position state
- Wake Lock: screen stays on while playing; released on pause, tab hide, or going offline
- Web Share: `↑` button in the header beside the library button opens the native share sheet (where supported; the slot stays reserved elsewhere so the header never shifts)
- Tape library: a `≣` button left of the tape title — hugging the edge its drawer slides out from — opens a left drawer of published tapes, drawn as cassette spines in their playlist colors (the playing tape sits pulled off the shelf); picking one hot-swaps the whole player in place — track list, color, visualizer default, metadata — with no reload, and back/forward navigate the history. Every tape is also deep-linkable at `?tape=<id>` (a bad id falls back to the live tape). The button only appears when more than one tape is published (its slot stays reserved either way, so the title never shifts); publishing is editorial curation, not privacy — playlist JSON stays publicly fetchable either way, and share previews (OG tags) always describe the live tape
- Service worker caches the shell; playlist data always fetched fresh
- Tab title updates to "Track — Artist | tape name" while playing; reverts to the tape name when the playlist ends
- Playback persistence: last track and seek position saved in `sessionStorage` per playlist — every tape keeps its own slot for the session, so switching away and back via the library returns to where you left off; resumes on reload without autoplay
- Offline indicator when the browser loses network — background dims, tracks disable, bar hides
- Weak-connection handling: after 4 seconds of buffering a banner appears and the play button becomes a spinning buffering icon, with a ⏭︎ button to skip ahead; after 90 seconds total it offers retry instead
- Embeddable via `embed.html` — stripped-down player for iframe integration (e.g. Ghost CMS)
- Respects `prefers-reduced-motion`: background color drift skipped; decorative transitions removed

**Playlist management (admin)**
- Styled like the player it edits: the page background live-previews the edited tape's color, playlists sit on a cassette-spine shelf (published first, in drawer order; unpublished spines are dimmed with a dashed edge; the edited tape sits pulled off the shelf), and track rows carry the player's type and spacing
- Create, edit, reorder (drag), and delete playlists without touching JSON
- Fetch track title and artist automatically from YouTube oEmbed; pasting any other http(s) URL adds it as a direct-audio track (manual title/artist — file tracks wear a hostname badge in the track list, and a hint spells out the rights, https/Range, and format requirements for hosted audio)
- Import an entire YouTube playlist by URL — requires a YouTube Data API v3 key (stored in `localStorage`, never sent anywhere except Google)
- 5-second undo after deleting a track
- Color picker: fixed hex, random-per-load, or Pride rainbow
- Set a playlist's geographic location with one tap
- Publish/unpublish any playlist to the player's tape library (newly published tapes append to the drawer order); drag published spines to reorder the drawer
- Promote any playlist to live; `config.js` regenerates on every save
- Password-gated; accessible from any device
- Remote saves commit directly to `main` via the GitHub API — no server required, deploy triggers automatically (~60 seconds to live); save status shows live progress ("connecting…" → "uploading files…" → "pushing…")
- Conflict detection: if a concurrent save wins the race, a clear message prompts a reload rather than a raw GitHub error

**Localization**
- All UI strings, ARIA labels, and date formats auto-detect from `navigator.language`
- 11 languages: English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi
- CJK locales use native date formats and artist–title ordering; distance switches to km; Russian has full grammatical plural forms

**Accessibility**
- ARIA roles and live region announcements throughout, fully localized
- Locale-appropriate "by" connectors in track labels (*par*, *von*, *di*, *de*, …)
- Scrubber `aria-valuetext` reads elapsed/total in the correct locale pattern
- Hover states restricted to `@media (hover: hover)` — touch devices never retain a highlight
- Responds to iOS Dynamic Type: all font sizes scale with the system text size setting

**Mobile**
- Quick wrist-flick left/right (>250°/s on `rotationRate.gamma`) skips tracks
- Haptic feedback on each track change (Android Chrome; Vibration API not supported on iOS)
- Currently playing track always scrolls into view above the player bar

---

**Visual and behavioral details**
- Background color slowly drifts through a warm palette while music plays (skipped when `prefers-reduced-motion` is set)
- Visualizer: ⊙ button (visible while playing) opens a fullscreen WebGL visualization — by default "Bloom", a mesh gradient of large soft color regions (deep shadow to near-white glow) derived from the playlist color, drifting organically with no hard edges (Pride palette in pride mode); a quiet picker in the lower-right corner (the ⁘ toggle is always faintly visible; its menu accordions out on hover on desktop, on tap on touch screens) switches visualizations with a crossfade — also rain running down glass over bokeh lights, aurora curtains over a dusk horizon, ink plumes curling through water, an incense ribbon rising from an ember, a phosphor Lissajous scope whose beam is the background color, a starfield warp steered by tilt, contour-map topography where taps raise mountains, underwater caustics with a tilt-steered sun, a feedback-loop kaleidoscope whose symmetry steps with each track, and a mirror disco ball whose light spots sweep a darkened room — remembering the choice per playlist in the browser, with the playlist's own default coming from the admin; one dominant color always tracks the live background drift color, so entering/exiting stays color-continuous and the iOS status-bar color keeps matching; on mobile with motion access granted (iOS prompts when the visualizer opens, since grants expire each session), tilting the device pours the colors like thick gel — hold still and they resume their own drift; minimal track metadata with a small progress ring sits in the lower-left corner — on touch screens, swiping left/right across it skips to the next/previous track; tap or click spawns expanding color blooms, it blooms on its own when idle, and each track change blooms once; keeps running (taps included) while playback buffers; space toggles playback and arrows skip tracks; close with × or Escape — pausing, going offline, or playlist end also closes it (track changes don't, so skipping by swipe, shake, or arrow keys stays inside the visualizer); renders at a capped 30fps and pauses the page's decorative layers behind it, so long sessions stay cool and battery-friendly; if the OS reclaims the graphics context mid-set (memory or thermal pressure) the player UI returns, and the visualizer reinstates itself once the system recovers and playback resumes — only an explicit × or Escape keeps it closed; swipes over the field itself are deliberately inert; `prefers-reduced-motion` shows a still field; requires WebGL (the button doesn't appear without it)
- Per-playlist color themes — fixed hex, random on each load, or Pride rainbow
- Per-playlist default visualization, chosen in the admin's "visualization" chip row
- Pride mode: each track row gets a color from the Progress Pride flag; background drifts through the spectrum during playback
- Long track titles and artist names scroll horizontally (marquee) rather than truncating — in both the track list and the now-playing bar
- Playlist footer: track count, created/edited dates, and listener distance shown below the track list; scroll to reveal
- Playlist location: stores city and fuzzed coordinates (±1 mile — exact location never persisted) reverse-geocoded via OpenStreetMap Nominatim; distance shown using the viewer's device GPS, not IP
- π button: on iOS, tapping it requests DeviceMotion permission (a fallback — opening the visualizer also prompts for it) plus device GPS for listener distance; on Android, wrist-flick works without permission and π only appears when the playlist has a location set (tapping prompts for GPS); hidden until needed, and hidden once motion is granted unless the playlist has a location

## Structure

```
index.html              # Player entry point
embed.html              # Stripped-down player for iframe embedding
admin.html              # Admin entry point (password-gated)
config.js               # Active playlist — loaded by the player at parse time
server.py               # Local dev server (handles admin file writes)
src/
  main.js               # Player logic (shared by index.html and embed.html)
  sources/              # Audio-source seam: ids.js (metadata/caps), registry.js, youtube.js, file.js
  library.js            # Pure tape-library logic: ?tape= params, drawer order, spine colors
  drawer.js             # Library drawer DOM: ≣ button, cassette-spine shelf
  visualizer.js         # Fullscreen WebGL visualizer (+ viz-gl.js GL plumbing, viz-logic.js pure logic)
  viz/                  # Visualization registry: ids.js, registry.js, prelude.js, one module per visualization
  viz-picker.js         # Lower-right visualization picker (accordion from the ⁘ toggle)
  shared.css            # Tokens, reset, and the cassette-spine component shared by both pages
  style.css             # Player styles
  strings.js            # Shared i18n strings, lang detection, fmtDate
  utils.js              # Pure utilities: extractId, parseTrackInput, buildConfig, buildSaveFiles, color helpers, haversine, fuzzyCoord, fmt
  auth.js               # PBKDF2 password hashing and verification
  github.js             # GitHub git-tree commit and file-delete operations
  schema.js             # Runtime validation: validateTrack, validatePlaylist, validateIndex
  admin-auth.js         # Auth gate, GitHub repo config, credential storage
  admin.js              # Admin: playlist CRUD, track management, save dispatch
  admin.css             # Admin styles
  admin-strings.js      # Admin i18n strings
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

`color` is `"random"`, a hex string like `"#c1440e"`, or `"pride"`. Each track carries a `source`: omitted means `"youtube"` (so older playlists need no migration) with `id` as the YouTube video ID; `"file"` plays `url` — any http(s) audio URL — through a plain `<audio>` element. Sources mix freely within a tape. Maximum 12 tracks per playlist. `location` is optional. `viz` (optional) sets the playlist's default visualization by id; it's omitted when set to the default (`"mesh"`), and listeners can override it per playlist from the visualizer (stored in their browser's localStorage as `muxtape-viz`).

To self-host audio files in this repo, put them under `public/` (e.g. `public/audio/song.mp3`, served at `/audio/song.mp3`). They deploy outside `/assets/`, so the service worker's cache-first handling never touches them and the Range requests audio seeking needs pass straight through. GitHub limits repo files to 100 MB; for larger libraries point `url` at any static host with Range support (object storage, Internet Archive, an Audius stream endpoint, …).

Requirements for hosted audio, wherever it lives:

- **Rights** — only host audio you're entitled to share: your own work, recordings licensed for redistribution (e.g. Creative Commons, with attribution where required), or public domain. Buying a track does not grant redistribution rights; this repo is publicly fetchable.
- **HTTPS** — the deployed site is https, so http `url`s are blocked as mixed content (the admin accepts http for local development only). The URL must be publicly fetchable without auth or cookies.
- **Range requests** — the host should answer `Range` requests with `206`; without them seeking breaks and Safari may refuse to play at all. Object storage, GitHub Pages, and the Internet Archive all support this.
- **Formats** — MP3, M4A/AAC, FLAC, and WAV play in every current browser. Ogg Vorbis/Opus and WebM lack support in older Safari; live streams (Icecast etc.) play but show no duration.

**`playlists/index.json`**
```json
{ "active": "1748649600000", "ids": ["1748649600000"], "published": ["1748649600000"] }
```

`published` (optional) lists the tapes shown in the player's library drawer, in display order; every entry must also be in `ids`. The live tape always appears in the drawer even when unlisted. Unpublished tapes are hidden from the drawer but still publicly fetchable at `playlists/{id}.json` and viewable via `?tape=<id>` — curation, not privacy.

**`config.js`** — regenerated by the admin on every save; the player reads this directly.
```js
const TAPE = {
  title: "my playlist",
  color: "random",
  id: "1748649600000",
  created: "2026-05-31",
  lastEdited: "2026-06-07",
  location: { "city": "Portland", "lat": 45.523, "lng": -122.676 },
  tracks: [
    { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  ]
};
```

`id` matches the playlist file's timestamp-based ID and keys session playback persistence.

## Setting Up Your Own Instance

### Prerequisites

- Node.js 18+
- Python 3 (for local admin saves)
- A GitHub repository (fork this one)
- A GitHub **fine-grained** personal access token scoped only to this repository with **Contents: Read and Write**

### 1. Fork and configure

Fork this repository. Create `config.js` in the project root with your first playlist:

```js
const TAPE = {
  title: "my playlist",
  color: "random",   // or a hex like "#c1440e", or "pride"
  tracks: [
    { id: "VIDEO_ID", title: "Track Title", artist: "Artist Name" },
  ]
};
```

Create `playlists/index.json` and a matching playlist file:

```json
// playlists/index.json
{ "active": "1", "ids": ["1"] }

// playlists/1.json
{ "id": "1", "title": "my playlist", "color": "random", "tracks": [] }
```

### 2. Deploy to GitHub Pages

Go to **Settings → Pages** and set the source to the `gh-pages` branch. Push to `main` — GitHub Actions will build and deploy automatically. Set a custom domain via a `CNAME` file in the project root if desired.

### 3. Use the admin

**Locally:** `npm run dev` starts both Vite and `server.py` via `concurrently`. Vite proxies admin POST endpoints to `server.py` on port 8080. Open the admin page in your browser — changes save to disk, push to deploy.

**Remotely:** open the admin on your deployed site from any browser. On first visit you'll be prompted for:
- A password (hashed with PBKDF2 and stored in `localStorage`)
- Your GitHub token (stored in `sessionStorage` only — cleared when the tab closes)
- Your GitHub **owner** and **repo** (required — no defaults are assumed)

Subsequent visits on the same device only ask for the password.

### 4. Test on iOS (tilt, gestures, location)

iOS requires HTTPS for device orientation and geolocation. Use a Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://….trycloudflare.com` URL on your phone and tap π to grant permissions.

## Development

```bash
npm install       # install dependencies
npm run dev       # Vite dev server at http://localhost:5173
npm test          # run tests (Vitest)
npm run build     # production build → dist/
```

`config.js` and `playlists/` are served from the project root by a custom Vite middleware. The admin requires `python3 server.py` running alongside for local file saves.

### Local audio files

To exercise the file source against real audio during development, drop files into `local-audio/` (gitignored, create it at the repo root) and open `http://localhost:5173/?tape=local`. The dev server generates the playlist from the directory listing — filenames following `Artist - Title.mp3` (an optional leading track number is stripped) fill in the track metadata — and serves the files with Range support. Accepted extensions: mp3, m4a, aac, flac, wav, ogg, oga, opus, webm; first 12 files in natural sort order. Dev only: production builds know nothing about `local-audio/`, and `?tape=local` on the deployed site is an ordinary missing tape (the player keeps its current tape).

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move focus up/down the track list |
| `←` / `→` | Aliases for up/down |
| `Enter` / `Space` | Play focused track |
| `Space` (no focus) | Play/pause current track |
| `←` / `→` (visualizer open) | Previous / next track |
| `Esc` | Close the visualizer or the library drawer |
| `Tab` | Standard focus navigation |
