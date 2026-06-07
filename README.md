# listen

A minimalist web music player that streams curated playlists from YouTube. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

Live at [listen.couch.studio](https://listen.couch.studio)

## Features

**Playback**
- Streams audio from YouTube video IDs — no ads, no distractions
- Scrubber with seek support; fill and track progress bar snap immediately on seek or track change
- Player bar slides in from the bottom on first play
- Background color slowly drifts through a warm palette while music plays
- Per-playlist color themes — fixed hex, randomly chosen each load, or Pride rainbow (see below)
- Full keyboard navigation (arrows, space, enter, tab)
- MediaSession API integration for lock screen controls on mobile

**Pride color mode**
- Setting `color: "pride"` gives each track row its own full-width color from the Progress Pride flag
- 9 colors covering the flag's spectrum: red, orange, amber, green, teal, blue, violet, pink, brown
- On each page load a random entry point into the spectral sequence is chosen — adjacent tracks are always harmonious regardless of where the sequence starts
- The page background drifts through the pride spectrum during playback, advancing one color per 45-second cycle

**Peek drawer**
- A hidden metadata panel that reveals from the bottom of the screen via a physical gesture
- On mobile: tilt the phone to between 45° and 75° past your natural hold position (calibrated on the first orientation event) — panel rises and physically lifts the player bar with it
- On desktop: slide the cursor toward the bottom edge of the viewport — only active after the π button has been clicked
- Shows track count, created date, last edited date, and listener distance
- Both panels share the same frosted glass surface with an engraved dividing line between them

**Gesture navigation (mobile)**
- Quick left/right wrist roll (>250 deg/s on `rotationRate.gamma`) skips tracks: roll right → previous, roll left → next
- Navigated track scrolls into view, accounting for the combined height of both bottom panels
- Same device motion permission as orientation — no additional prompt required

**π button**
- Bottom-right corner on mobile and desktop (when playlist has a location set)
- A nod to *The Net* (1995)
- On iOS: probes for existing orientation permission silently on load; shows π only if not yet granted
- Tapping π requests device orientation + device location (Geolocation API) in a single gesture
- Once granted, π disappears; returns only if permissions are revoked
- On Android: orientation starts automatically; π appears solely to request location
- On desktop: π requests location and enables the cursor-drift peek reveal

**Playlist location**
- Each playlist stores the city and fuzzed coordinates of where it was last saved (±1 mile radius, 3 decimal places — exact location never written to disk)
- City is reverse-geocoded from the precise position before fuzzing via OpenStreetMap Nominatim
- Distance displayed in the peek drawer as "listening from X miles away" — derived from the viewer's device GPS (via π opt-in), not IP lookup

**Localization**
- All visible strings, ARIA labels, VoiceOver announcements, and date formats auto-detect from `navigator.language`
- Supported: English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi
- CJK locales use native date formats (`YYYY年M月DD日` / `YYYY년 M월 DD일`) and artist–title ordering
- Distance unit switches to km for all non-English locales
- Russian uses full grammatical plural forms

**Accessibility**
- ARIA roles and live region announcements throughout, all localized
- Track list labels use locale-appropriate "by" connectors (e.g. *par*, *von*, *di*, *de*)
- Scrubber `aria-valuetext` reads elapsed/total in the correct locale pattern
- Mobile hover state uses `@media (hover: hover)` so touch devices never retain a lingering highlight

**Admin (`admin.html`)**
- Create, edit, reorder (drag), and delete playlists without touching JSON
- Fetch track title and artist automatically from YouTube oEmbed
- Color picker includes fixed hex, random, custom, and Pride rainbow swatches
- Set the playlist's location with one tap — uses the browser Geolocation API
- Promote any playlist to live; `config.js` regenerates on every save
- All UI strings fully localized across all 11 supported languages

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
  "lastEdited": "2026-06-07",
  "title": "my playlist",
  "color": "random",
  "location": { "city": "Portland", "lat": 45.523, "lng": -122.676 },
  "tracks": [
    { "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up", "artist": "Rick Astley" }
  ]
}
```

`color` is `"random"`, a hex value like `"#c1440e"`, or `"pride"` for the rainbow mode. Track `id` is the YouTube video ID. Maximum 12 tracks per playlist. `location` is optional and set via the admin UI.

### `playlists/index.json`

```json
{ "active": "1748649600000", "ids": ["1748649600000"] }
```

### `config.js`

Generated automatically when saving from admin. The player reads this file, not the playlist JSON directly.

```js
const TAPE = {
  title: "my playlist",

  // A hex color like "#c1440e", "random" to pick each load, or "pride" for rainbow
  color: "random",

  created: "2026-05-31",
  lastEdited: "2026-06-07",
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

### Testing on iOS (tilt, gestures, location)

iOS requires HTTPS for device orientation and geolocation permission. Use a Cloudflare quick tunnel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8080
# open the printed https://....trycloudflare.com URL on your phone
```

On first visit, tap the π button to grant orientation and location access. On subsequent visits the player probes silently and π stays hidden if permissions are still active.

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

### 2026-06-07 — `e9f9203`
- **Pride color mode** — each track row shows its own full-width color from the Progress Pride flag; spectral order from a random entry point ensures adjacent rows are always harmonious; background drifts through the pride spectrum during playback
- **Gesture navigation** — quick left/right wrist roll skips tracks; navigated track scrolls into view above both panels
- **π button expanded** — now requests device orientation + device location in a single tap; replaces IP geolocation with GPS; desktop shows π when playlist has a location and uses it to gate cursor-drift peek; iOS silently probes both permissions on load and skips π if already granted
- **Tilt calibration** — natural hold position captured on first orientation event; reveal range is 30° from that baseline rather than fixed absolute angles
- **Engraved divider** — 2px groove between peek and player panels; anchored to the bar's bottom edge as one compositing unit to eliminate flicker; visible only once playback starts
- **Mobile hover fix** — track row hover style restricted to `@media (hover: hover)` so touch devices never retain a highlight after a track finishes

### 2026-06-06 — `7ad222e`
- **Peek drawer** — tilt (mobile) or cursor-to-bottom (desktop) reveals a metadata panel showing track count, dates, and listener distance; panel physically pushes the playback bar upward
- **Playlist location** — admin stamps a fuzzy ±1mi location on each playlist; viewer sees "listening from X miles away"
- **Created / last edited dates** — stored on playlists; shown in peek drawer
- **π button** — opt-in motion access on iOS; auto-skips if permission already granted
- **Scrubber reset** — zeroes immediately on track change
- **Localization** — all visible strings, ARIA labels, VoiceOver announcements, and date formats across English, Spanish, Italian, German, French, Chinese, Japanese, Korean, Russian, Hindi, Marathi

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
