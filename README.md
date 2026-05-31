# listen

A minimalist web music player that streams curated playlists from YouTube. Inspired by the original [Muxtape](https://en.wikipedia.org/wiki/Muxtape) — a simple, no-frills tape-sharing aesthetic.

Live at [listen.couch.studio](https://listen.couch.studio)

## Features

- Streams audio from YouTube video IDs — no ads, no distractions
- Per-playlist color themes (fixed or randomly chosen from a warm palette)
- Scrubber bar with seek support, elapsed/total time display
- Full keyboard navigation (arrows, space, enter, tab)
- Screen reader accessible with ARIA roles and live announcements
- MediaSession API integration for lock screen controls on mobile
- No build step, no framework, no dependencies — just HTML, CSS, and vanilla JS

## Structure

```
index.html          # Player UI and all JS/CSS
playlists/
  index.json        # Active playlist pointer and list of all playlist IDs
  {id}.json         # Individual playlist files (timestamp-based IDs)
CNAME               # Custom domain config for GitHub Pages
```

## Adding a Playlist

Create a new file in `playlists/` with a timestamp as the filename (e.g. `1748649600000.json`):

```json
{
  "id": "1748649600000",
  "created": "2026-05-31",
  "title": "my playlist",
  "color": "random",
  "tracks": [
    { "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up", "artist": "Rick Astley" }
  ]
}
```

`color` can be `"random"` or a hex value like `"#c1440e"`. Track `id` is the YouTube video ID.

Then update `playlists/index.json` to point to it:

```json
{
  "active": "1748649600000",
  "ids": ["1748649600000"]
}
```

## Running Locally

The YouTube IFrame API requires HTTP — open via `file://` won't work.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move focus up/down the track list |
| `←` / `→` | Same as up/down (aliases) |
| `Enter` / `Space` | Play focused track |
| `Space` (no focus) | Play/pause current track |
| `Tab` | Standard focus navigation |

## Deployment

Hosted on GitHub Pages. Push to `main` and it's live — no build required.
