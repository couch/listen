# listen (muxtape)

Minimalist YouTube audio player and tape-sharing tool. Deployed to GitHub Pages via GitHub Actions on push to `main`.

## Stack

- Vanilla JS ES modules, no framework
- Vite 6 for bundling (3 entry points: `index.html`, `admin.html`, `embed.html`)
- Vitest for tests
- GitHub API (git tree operations) as the only backend
- Service worker for offline/caching

## Key modules

| File | Purpose |
|------|---------|
| `src/main.js` | Player: playback, UI, gestures, geolocation |
| `src/admin.js` | Admin: auth, playlist CRUD, save dispatch |
| `src/auth.js` | PBKDF2 password hashing and verification |
| `src/github.js` | GitHub git-tree commit and file-delete operations |
| `src/schema.js` | Runtime validation: `validateTrack`, `validatePlaylist`, `validateIndex` |
| `src/utils.js` | Pure utilities: `extractId`, `buildConfig`, `haversine`, `fuzzyCoord`, etc. |
| `src/strings.js` | i18n: 11 languages, locale detection, pluralization rules |

## Tests

Run with `npm test` (or `npx vitest run`). CI runs on every push and PR via `.github/workflows/test.yml`.

Test files live alongside source: `src/utils.test.js`, `src/strings.test.js`, `src/admin.test.js`.

**When modifying code, update or add tests accordingly:**

- Changing a utility function in `utils.js` → update `utils.test.js`
- Changing auth logic (`auth.js`) → update the auth section of `admin.test.js`
- Changing GitHub API logic (`github.js`) → update the GitHub API section of `admin.test.js`
- Changing schema rules (`schema.js`) → update the schema section of `admin.test.js`
- Adding a new pure function → add a `describe` block in the appropriate test file
- New behavior in `main.js` that has extractable pure logic → extract and test it

After any code change, run `npm test` to confirm all tests still pass before committing.

## Visual verification (visualizer / ambient / pride canvas)

When changing anything visual (`viz-gl.js`, `viz-logic.js`, `visualizer.js`, `ambient.js`, `pride-canvas.js`, CSS), verify with headless screenshots — unit tests can't judge the rendered look. In the Claude Code cloud environment the Playwright/Chrome CDNs are blocked by the network allowlist, so get Chromium from the npm registry instead:

1. `mkdir /tmp/vizshot && cd /tmp/vizshot && npm init -y && npm i @sparticuz/chromium playwright-core` (temp dir — never add these to the repo's deps)
2. Serve with `npx vite --port 5173` (not `npm run dev`, which also wants python)
3. Launch via `playwright-core`: `chromium.launch({ executablePath: await sparticuz.executablePath(), args: [...sparticuz.args, '--enable-unsafe-swiftshader'] })` — note `require('@sparticuz/chromium').default`; the swiftshader flag enables software WebGL
4. Drive the **real UI**, not dynamic module imports: click `#btn-viz` to open the visualizer, dispatch `PointerEvent`s on `#viz-overlay` for taps/blooms, dispatch `DeviceOrientationEvent`s on `window` for tilt (desktop Chromium has no permission gate, so main.js's listener is already attached). Importing `/src/visualizer.js` from `page.evaluate` breaks after any source edit — Vite's HMR timestamps give you a second module instance that was never initialized.
5. Screenshot a few seconds apart (motion check), then read the PNGs to judge — no hard color edges, full luminance range, blooms/tilt behavior.

## README

`README.md` documents the application as it actually behaves. When modifying the app, update the README to match — with the same concision and specificity already present in the file. Don't pad or over-explain; don't leave stale descriptions. A feature that changes behavior, a new constraint, a renamed module, a new keyboard shortcut, a changed data format — any of these warrants a targeted update to the relevant section. The README is a living spec, not release notes.

## Data model

- `playlists/index.json` — `{ active: string, ids: string[] }`
- `playlists/{id}.json` — `{ title, color, tracks, created?, lastEdited?, location? }`
- `config.js` — generated from active playlist by `buildConfig()`; loaded at parse-time as `window.TAPE`

## Auth

PBKDF2, 200k iterations, random 16-byte salt per user. Stored as `muxtape-admin-salt` + `muxtape-admin-hash` in localStorage. GitHub token in sessionStorage only (lost on tab close). Legacy SHA-256 hashes (no salt) are automatically migrated to re-setup on next login.

## Constraints

- Max 12 tracks per playlist (enforced in admin UI and schema validation)
- No TypeScript — use JSDoc if type clarity is needed
- No additional runtime dependencies without good reason
