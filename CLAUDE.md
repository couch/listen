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

Test files live alongside source: `src/utils.test.js`, `src/strings.test.js`, `src/admin.test.js`, `src/viz-logic.test.js`, `src/viz/*.test.js`.

**When modifying code, update or add tests accordingly:**

- Changing a utility function in `utils.js` → update `utils.test.js`
- Changing auth logic (`auth.js`) → update the auth section of `admin.test.js`
- Changing GitHub API logic (`github.js`) → update the GitHub API section of `admin.test.js`
- Changing schema rules (`schema.js`) → update the schema section of `admin.test.js`
- Changing shared visualizer logic (`viz-logic.js`) → update `viz-logic.test.js`
- Adding or changing a visualization (`src/viz/<id>.js`) → update `src/viz/<id>.test.js`; the entry contract is asserted for every registered id in `src/viz/registry.test.js`
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

## Visualizer model

**Maintenance rule: this section is the source of truth for how the visualizer works. Any change to `viz-gl.js`, `viz-logic.js`, `visualizer.js`, or their wiring in `main.js` must update this section in the same commit — future sessions should be able to modify a visualization from this description alone, without re-investigating the codebase.** Multiple visualization options are planned; document each as its own subsection under "Visualizations" with the same structure (rendering, palette, motion, interaction).

### Architecture (shared by all visualizations)

**Registry** (`src/viz/`): each visualization is one module with a default-export entry:
`{ id, name, frag, uniformSpec, buildPalette(bgHex, isPride), initState(seed), frame(state, ctx), tap?(state, x, y, t), trackEvent?(state, t), eventLife }`.
All entry functions are pure (no DOM/GL) and unit-tested alongside (`src/viz/<id>.test.js`).

- `src/viz/prelude.js` — shared GLSL ES 1.00 prelude: common uniforms (`u_resolution`, `u_fade`, `u_time`, `u_seed`, `u_palette[9]`, `u_paletteCount`, `u_blooms[12]`, `v_uv`) + helpers (hash, vnoise, fbm, paletteAt, toSrgb, dither). `frag` = `PRELUDE` + body, and **must end** `gl_FragColor = vec4(outCol, u_fade);` (crossfade blending reads that alpha). `COMMON_UNIFORM_SPEC` lists the uniforms `frame()` must return; `u_resolution`/`u_fade` are owned by viz-gl and never appear in a spec.
- `src/viz/ids.js` — `VIZ_IDS`, `VIZ_NAMES`, `DEFAULT_VIZ_ID`, `resolveVizId`. Metadata only, no shader imports — safe for admin.js/main.js. Names are stylistic titles, untranslated by design (like track titles).
- `src/viz/registry.js` — **lazy loading**: mesh (the default) is statically imported; every other visualization is a dynamic `import()` (one Vite chunk each, in `LOADERS`) so the player bundle never grows with new visualizations. `getViz(id)` → cached Promise (unknown id → default); `getDefaultViz()` sync; `preloadViz`/`preloadAll` fire on intent. New visualizations MUST follow this: file under `src/viz/`, loader entry in registry.js, id appended to `ids.js`.
- `src/viz-gl.js` — WebGL1/2 plumbing: one fullscreen triangle + one program per registered visualization. `registerProgram(id, frag, uniformSpec)` stores source only; compile/link is lazy on first `use(id)`/`render(id, …)` (`use` returns false on compile failure → caller falls back to mesh, which is validated at init — failure there removes the feature like missing WebGL). Uniform upload is generic via spec type tags (`'1f' | '2f' | '3fv' | '4fv'`); **all uniforms upload every frame, all state lives in JS**, so context restore just marks programs stale and recompiles lazily. `render(id, uniforms, fade, blend)` — blend path enables `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` for the crossfade.
- `src/viz-logic.js` — cross-viz pure logic only (tilt spring, bloom buffer, palette packing, gestures, sizing, crossfade easing, selection resolution). Per-visualization motion/palette logic lives in its `src/viz/` module. New shared behavior goes here first.
- `src/visualizer.js` — DOM/lifecycle owner: overlay, ⊙ entry button, entry/exit fade (400 ms), gestures, rAF loop, track metadata corner, active/pending visualization state. Opens only during playback; closes on ×, Escape, pause, or playlist end. No fullscreen navigation gestures — swipes over the field are inert (taps bloom). `frame(state, ctx)` receives `ctx = { t, dt, aspect, tiltX, tiltY, blooms, paletteData, paletteCount }` and returns the uniform values for its spec.
- **Crossfade between visualizations**: 600 ms (`VIZ_FADE_MS`), eased by `crossfadeAlpha`; outgoing viz renders opaque, incoming alpha-blends on top; both states step and both palettes follow the bg drift during the fade; outside transitions exactly one program runs. The incoming viz gets a fresh `initState(seed)` and a reset bloom buffer. Reduced motion: instant swap.
- **Shared event machinery** (visualizer.js, invariant 2 enforced centrally): `spawnEvent` always writes the `u_blooms[12]` ring buffer — each shader *reinterprets* those records in its own vocabulary — then calls the per-viz `tap()` hook (or `trackEvent()` on track change). `eventLife` = max bloom age the shader honors.
- Wiring in `main.js`: `tickDrift` calls `setVizBgColor(hex)` each frame; `enableMotionListeners()` (behind the iOS π-button permission flow) feeds `deviceorientation` → `setVizOrientation(beta, gamma)`.
- Performance: canvas renders at 0.6× of DPR-capped (≤2) CSS resolution (`computeCanvasSize`); `powerPreference: 'low-power'`; rAF paused when tab hidden.
- Reduced motion: a single static frame at synthetic t=30 s; taps place a mid-life event and redraw once.

**Invariants every visualization must keep:**
1. *Color continuity*: the live `--bg` drift color is always a dominant color of the field (palette slot 0, kept verbatim by `buildPalette` — pride mode included), so entering/exiting is seamless and `theme-color` (written by the bg drift in `main.js`, which always runs during playback) is always a color present on screen. The visualizer itself never writes `theme-color`.
2. Tap = an Eno-bloom equivalent in the visualization's own vocabulary (ring, splat, shimmer, …) driven by the shared bloom buffer; idle auto-event every 10–15 s; one event on track change.
3. Any time-periodic JS motion must use periods that divide 3600 — the shader clock wraps hourly (`vizTime`).

### Visualizations

#### 1. Mesh gradient (default — `src/viz/mesh.js`)

iOS-wallpaper-style soft color field. No hard edges by construction.

- **Rendering** (fragment shader in `mesh.js`): N color sites — `u_sites[9]` vec3 (x, y in aspect-space, z = Gaussian falloff) — blended with normalized Gaussian weights `exp(-d²·z)` in **linear RGB**, then sRGB-encoded + IGN-dithered (×1.5 for film grain). A mild FBM domain warp (`t = u_time * 0.05`, amplitude 0.35) keeps regions organic. Tiny ambient weight on slot 0 prevents far-field underflow to black. Breathing luminance (47 s/31 s sines) + faint vignette (mix 0.15). Site positions come from JS each frame — never from in-shader trig.
- **Palette** (`buildVizPalette` in `mesh.js`): 6 roles from the bg hue — slot 0 anchor (live bg, verbatim hex), 1 deep dark (l=14, broad falloff 5.5), 2 mid cool (h−55), 3 mid warm (h+25), 4 saturated accent (h+60), 5 near-white highlight (l=88, s=14, tight falloff 13, biased upper-center-right). Color falloff 9. Pride mode: fixed `PRIDE_COLORS_VIZ` (9 colors, uniform falloff) with slot 0 overwritten by live bg. Palette re-derived from live bg at most every 250 ms (throttle in `drawVizFrame`). Hue evolution rate = bg drift rate (45 s per transition, endless, non-repeating).
- **Motion** (`computeSites` in `mesh.js`): seeded golden-ratio base scatter + primary orbit (periods {60,48,45,40,36,30,72,90,120} s, amp 0.30) + epicycle ({12,10,9,8,15,18,20,24,16} s, amp 0.06). Visible change in 2–3 s; full reconfiguration ~40–60 s.
- **Tilt** (`createTiltState`/`stepTilt`/`normalizeTilt` in `viz-logic.js` — shared): under-damped spring (stiffness 14, damping 6 ≈ 0.8× critical — gel overshoot) chasing the deviation from a slow-adapting baseline (τ = 3.5 s = the resting pose). Output ±1 → site offset × `TILT_GAIN` 0.18 × per-site parallax depth (0.6–1.1), applied inside `computeSites` (JS-side, no `u_tilt`). Holding still → deviation decays → autonomous drift resumes automatically; tilt is purely additive, no mode switch. `normalizeTilt` remaps beta/gamma per `screen.orientation.angle`, ±45° → ±1.
- **Tuning knobs** (exported constants in `mesh.js`): `FALLOFF_*` (region size — too low and the normalized blend averages to a flat wash), `AMP_PRIMARY`/`AMP_EPI` (travel), `SITE_PERIODS`/`EPI_PERIODS` (speed), `TILT_GAIN`. Tune from headless screenshots (see Visual verification).

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
