# listen

A minimalist web music player that streams curated playlists from YouTube. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

Live at [listen.couch.studio](https://listen.couch.studio)

## Features

**Playback**
- Streams audio from YouTube video IDs — no ads, no distractions
- Scrubber with seek support and elapsed/total time display
- Player bar slides in from the bottom on first play; scrubber resets to zero immediately on track change
- Background color slowly drifts through a warm palette while music plays
- Per-playlist color themes — fixed hex or randomly chosen each load
- Full keyboard navigation (arrows, space, enter, tab)
- MediaSession API integration for lock screen controls on mobile

**Peek drawer**
- A hidden metadata panel that reveals from the bottom of the screen via a physical gesture
- On mobile: tilt the phone between 45° and 75° past vertical to peek; panel lifts the playback bar as it rises
- On desktop: slide the cursor toward the bottom edge of the viewport
- Shows track count, created date, last edited date, and listener distance
- Distance is computed from where the playlist was last saved versus the viewer's approximate IP location, displayed as "listening from X miles away" (or km outside English locales)
- iOS requires opt-in: a π button (bottom-right corner) prompts for motion access; disappears once granted and skips entirely if permission was already given in a prior session

**Playlist location**
- Each playlist stores the city and approximate coordinates of where it was last saved
- Coordinates are fuzzed within a ~1-mile radius before storage — the exact location is never written to disk
- City is derived via reverse geocoding (OpenStreetMap Nominatim) from the precise position before fuzzing

**Localization**
- UI, accessibility labels, and VoiceOver strings auto-detect the browser locale
- Supported: English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi
- CJK locales use native date formats (`YYYY年M月DD日` / `YYYY년 M월 DD일`) and artist–title ordering
- Distance unit switches to km for all non-English locales
- Russian uses full grammatical plural forms

**Accessibility**
- ARIA roles and live region announcements throughout
- All labels localized to the active language
- Track list labels use locale-appropriate "by" connectors (e.g. *par*, *von*, *di*, *de*)
- Scrubber `aria-valuetext` reads elapsed/total in the correct locale pattern

**Admin (`admin.html`)**
- Create, edit, reorder, and delete playlists without touching JSON
- Drag-to-reorder tracks via SortableJS
- Fetch track title and artist automatically from YouTube oEmbed
- Set the playlist's location with one button tap — uses the browser Geolocation API
- Promote any playlist to live; `config.js` regenerates on every save
- All admin UI strings are fully localized across the same 11 languages

**General**
- No build step, no framework, no dependencies in the player (SortableJS only in admin)
- Hosted on GitHub Pages; push to `main` and it's live

## Structure

```
index.html          # Player UI — all JS and CSS inline
admin.html          # Admin UI — create and manage playlists
config.js           # Active playlist as TAPE const — what the player reads
server.py           # Local dev server with POST endpoints for admin saves
playlists/
  index.json        # Active playlist pointer + list of all IDs
  {id}.json         # Individual playlists (timestamp-based IDs)
CNAME               # Custom domain for GitHub Pages
```

### Playlist schema

```json
{
  "id": "1748649600000",
  "created": "2026-05-31",
  "lastEdited": "2026-06-06",
  "title": "my playlist",
  "color": "random",
  "location": { "city": "Portland", "lat": 45.523, "lng": -122.676 },
  "tracks": [
    { "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up", "artist": "Rick Astley" }
  ]
}
```

`color` is `"random"` or a hex value like `"#c1440e"`. Track `id` is the YouTube video ID. Maximum 12 tracks per playlist. `location` is set via the admin UI and is optional.

### `playlists/index.json`

```json
{ "active": "1748649600000", "ids": ["1748649600000"] }
```

### `config.js`

Generated automatically when saving from admin. The player reads this file, not the playlist JSON directly.

```js
const TAPE = {
  title: "my playlist",
  color: "random",
  created: "2026-05-31",
  lastEdited: "2026-06-06",
  location: { "city": "Portland", "lat": 45.523, "lng": -122.676 },
  tracks: [
    { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  ]
};
```

## Running Locally

The YouTube IFrame API requires HTTP — `file://` won't work.

```bash
python3 server.py
# open http://localhost:8080 for player
# open http://localhost:8080/admin.html for admin
```

### Testing on iOS (tilt peek)

iOS requires HTTPS for device orientation permission. Use a Cloudflare quick tunnel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8080
# open the printed https://....trycloudflare.com URL on your phone
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move focus up/down the track list |
| `←` / `→` | Aliases for up/down |
| `Enter` / `Space` | Play focused track |
| `Space` (no focus) | Play/pause current track |
| `Tab` | Standard focus navigation |

## Deployment

Hosted on GitHub Pages. Push to `main` and it's live — no build required.

---

## Changelog

### 2026-06-06 — `50b3471`
- **Peek drawer** — tilt (mobile) or cursor-to-bottom (desktop) reveals a metadata panel showing track count, dates, and listener distance; panel physically pushes the playback bar upward
- **Playlist location** — admin can stamp a fuzzy location (±1 mile) on each playlist; viewer sees "listening from X miles away" derived from IP geolocation
- **Created / last edited dates** — playlists store both dates; displayed in the peek drawer
- **π button** — opt-in motion access on iOS via a subtle bottom-right button, a nod to *The Net* (1995); auto-skips if permission was already granted
- **Scrubber reset** — zeroes immediately on track change rather than waiting for the YouTube API
- **Localization** — all visible strings, ARIA labels, VoiceOver announcements, and date formats localized across English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, and Marathi

### 2026-05-31 — `a9b87f9`
- Remove Saman from aufguss playlist

### 2026-05-31 — `83d2ab4`
- Update README: add config.js to structure, new features, playlist limit note

### 2026-05-31 — `cf5a4b0`
- Generative background color drift during playback

### 2026-05-31 — `3be7911`
- Publish aufguss as live playlist, archive s/s 26

### 2026-05-31 — `b83a1b7`
- Slide player bar in from bottom on first track play

### Earlier
- Admin UI with drag-to-reorder, YouTube oEmbed fetch, color picker, playlist management
- VoiceOver / screen reader accessibility with ARIA roles and live announcements
- Keyboard navigation (arrows, space, enter, tab with wrapping)
- Per-playlist JSON files; timestamp-based IDs
- MediaSession API for lock screen controls
- YouTube attribution link shown only when a track is active
- Initial player and muxtape-style aesthetic
