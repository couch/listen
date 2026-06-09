# listen

A minimalist web music player that streams curated playlists from YouTube. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

An instance of this runs at [listen.couch.studio](https://listen.couch.studio).

## Features

**Player**
- Streams audio from YouTube video IDs — no ads, no video
- Scrubber with seek, live timestamps, and per-track progress bar
- Autoadvances through the playlist; player bar slides up on first play
- Full keyboard navigation — arrows to move focus, space/enter to play
- MediaSession API: lock screen controls, album artwork, and scrubber position state
- Wake Lock: screen stays on while playing; released on pause, tab hide, or going offline
- Web Share: `↑` button in the playlist footer opens the native share sheet (where supported)
- Service worker caches the shell; playlist data always fetched fresh
- Playback persistence: last track and seek position saved in `sessionStorage` per playlist; resumes on reload without autoplay
- Offline indicator when the browser loses network — background dims, tracks disable, bar hides
- Embeddable via `embed.html` — stripped-down player for iframe integration (e.g. Ghost CMS)
- Respects `prefers-reduced-motion`: background color drift skipped; decorative transitions removed

**Playlist management (admin)**
- Create, edit, reorder (drag), and delete playlists without touching JSON
- Fetch track title and artist automatically from YouTube oEmbed
- Import an entire YouTube playlist by URL — requires a YouTube Data API v3 key (stored in `localStorage`, never sent anywhere except Google)
- 5-second undo after deleting a track
- Color picker: fixed hex, random-per-load, or Pride rainbow
- Set a playlist's geographic location with one tap
- Promote any playlist to live; `config.js` regenerates on every save
- Password-gated; accessible from any device
- Remote saves commit directly to `main` via the GitHub API — no server required, deploy triggers automatically (~60 seconds to live)

**Localization**
- All UI strings, ARIA labels, and date formats auto-detect from `navigator.language`
- 11 languages: English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi
- CJK locales use native date formats and artist–title ordering; distance switches to km; Russian has full grammatical plural forms

**Accessibility**
- ARIA roles and live region announcements throughout, fully localized
- Locale-appropriate "by" connectors in track labels (*par*, *von*, *di*, *de*, …)
- Scrubber `aria-valuetext` reads elapsed/total in the correct locale pattern
- Hover states restricted to `@media (hover: hover)` — touch devices never retain a highlight

**Mobile**
- Quick wrist-flick left/right (>250°/s on `rotationRate.gamma`) skips tracks
- Haptic feedback on each track change (Android Chrome; Vibration API not supported on iOS)
- Currently playing track always scrolls into view above the player bar

---

**Visual and behavioral details**
- Background color slowly drifts through a warm palette while music plays (skipped when `prefers-reduced-motion` is set)
- Per-playlist color themes — fixed hex, random on each load, or Pride rainbow
- Pride mode: each track row gets a color from the Progress Pride flag; background drifts through the spectrum during playback
- Playlist footer: track count, created/edited dates, and listener distance shown below the track list; scroll to reveal
- Playlist location: stores city and fuzzed coordinates (±1 mile — exact location never persisted) reverse-geocoded via OpenStreetMap Nominatim; distance shown using the viewer's device GPS, not IP
- π button: on iOS, tapping it requests DeviceMotion permission (required for wrist-flick); on Android, wrist-flick works without permission and π only appears when the playlist has a location set; in both cases, also prompts for device GPS to show listener distance; hidden until needed

## Structure

```
index.html              # Player entry point
embed.html              # Stripped-down player for iframe embedding
admin.html              # Admin entry point (password-gated)
config.js               # Active playlist — loaded by the player at parse time
server.py               # Local dev server (handles admin file writes)
src/
  main.js               # Player logic (shared by index.html and embed.html)
  style.css             # Player styles
  strings.js            # Shared i18n strings, lang detection, fmtDate
  utils.js              # Pure utilities: extractId, buildConfig, buildSaveFiles, color helpers, haversine, fuzzyCoord, fmt, sha256
  auth.js               # PBKDF2 password hashing and verification
  github.js             # GitHub git-tree commit and file-delete operations
  schema.js             # Runtime validation: validateTrack, validatePlaylist, validateIndex
  admin.js              # Admin logic: auth, playlist CRUD, save dispatch
  admin.css             # Admin styles
  admin-strings.js      # Admin i18n strings
playlists/
  index.json            # { active: id, ids: [id, …] }
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
    { "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up", "artist": "Rick Astley" }
  ]
}
```

`color` is `"random"`, a hex string like `"#c1440e"`, or `"pride"`. Track `id` is the YouTube video ID. Maximum 12 tracks per playlist. `location` is optional.

**`playlists/index.json`**
```json
{ "active": "1748649600000", "ids": ["1748649600000"] }
```

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

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move focus up/down the track list |
| `←` / `→` | Aliases for up/down |
| `Enter` / `Space` | Play focused track |
| `Space` (no focus) | Play/pause current track |
| `Tab` | Standard focus navigation |
