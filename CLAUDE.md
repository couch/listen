# listen (muxtape)

Minimalist audio player and tape-sharing tool (YouTube or direct audio URLs, per track). Deployed to GitHub Pages via GitHub Actions on push to `main`.

## Stack

- Vanilla JS ES modules, no framework
- Vite 6 for bundling (3 entry points: `index.html`, `admin.html`, `embed.html`)
- Vitest for tests
- GitHub API (git tree operations) as the only backend
- Service worker for offline/caching

## Key modules

| File | Purpose |
|------|---------|
| `src/main.js` | Player: playback state machine, UI, gestures, geolocation, tape hot-swap (`applyTape`/`switchTape`) |
| `src/sources/` | Audio-source seam: `ids.js` (pure metadata/caps), `registry.js`, `youtube.js`, `file.js` — see "Audio sources" |
| `src/library.js` | Pure tape-library logic: `resolveTapeParam`, `drawerEntries`, `drawerEligible`, `spineColor`, `spineTextColor`, `tapeUrl`, `shelfOrder`, `reorderPublished` |
| `src/drawer.js` | Library drawer DOM: ≣ button, cassette-spine shelf, open/close |
| `src/admin.js` | Admin: auth, playlist CRUD, spine shelf (published-first, drag reorders `published`), publish toggle, save dispatch |
| `src/shared.css` | Tokens (`--ease`), reset, `[hidden]` guard, `.section-label`, `.spine` component — `@import`ed first by `style.css` and `admin.css` |
| `src/auth.js` | PBKDF2 password hashing and verification |
| `src/github.js` | GitHub git-tree commit and file-delete operations |
| `src/schema.js` | Runtime validation: `validateTrack`, `validatePlaylist`, `validateIndex` |
| `src/utils.js` | Pure utilities: `extractId`, `parseTrackInput`, `buildConfig`, `haversine`, `fuzzyCoord`, etc. |
| `src/strings.js` | i18n: 11 languages, locale detection, pluralization rules |

## Tests

Run with `npm test` (or `npx vitest run`). CI runs on every push and PR via `.github/workflows/test.yml`.

Test files live alongside source: `src/utils.test.js`, `src/strings.test.js`, `src/admin.test.js`, `src/viz-logic.test.js`, `src/viz/*.test.js`.

**When modifying code, update or add tests accordingly:**

- Changing a utility function in `utils.js` → update `utils.test.js`
- Changing auth logic (`auth.js`) → update the auth section of `admin.test.js`
- Changing GitHub API logic (`github.js`) → update the GitHub API section of `admin.test.js`
- Changing schema rules (`schema.js`) → update the schema section of `admin.test.js`
- Changing an audio source (`src/sources/*.js`) → update its test file (`sources.test.js` for ids.js metadata, `youtube.test.js`/`file.test.js` for the pure mappers and the jsdom-driven `<audio>` behavior)
- Changing the local dev tape helpers (`local-tape.js`, node-side like `sw-build.js`) → update `local-tape.test.js`
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
- `src/viz-gl.js` — WebGL1/2 plumbing: one fullscreen triangle + one program per registered visualization. `registerProgram(id, frag, uniformSpec, opts)` stores source only; compile/link is lazy on first `use(id)`/`render(id, …)` (`use` returns false on compile failure → caller falls back to mesh, which is validated at init — failure there removes the feature like missing WebGL). Uniform upload is generic via spec type tags (`'1f' | '2f' | '2fv' | '3fv' | '4fv' | 'tex'`); **all uniforms upload every frame, all state lives in JS**, so context restore just marks programs stale and recompiles lazily. `render(id, uniforms, fade, blend)` — blend path enables `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` for the crossfade.
- **Frame feedback** (`opts: { feedback: true }`, entry field `feedback: true` — kaleido): render becomes FBO ping-pong — two lazily allocated RGBA/UNSIGNED_BYTE textures + FBOs at canvas size (LINEAR, CLAMP_TO_EDGE, no mips — NPOT-safe on webgl1); the viz pass draws into the write FBO with `u_prevFrame` = read texture (spec tag `'tex'`, texture unit 0) at `u_fade` 1, then a shared present program blits to the screen applying the real fade/blend + IGN dither (the stored field stays clean), then read/write swap. Crossfade therefore works unchanged. `resize` and context restore drop the textures (lazily reallocated; the image re-converges in under a second).
- `src/viz-logic.js` — cross-viz pure logic only (tilt spring, bloom buffer, palette packing, gestures, sizing, crossfade easing, selection resolution, render cadence `updateDue`/`VIZ_FRAME_MS`, reopen eligibility `reopenDue`/`VIZ_REOPEN_MAX_MS`). Per-visualization motion/palette logic lives in its `src/viz/` module. New shared behavior goes here first.
- `src/visualizer.js` — DOM/lifecycle owner: overlay, ⊙ entry button, entry/exit fade (400 ms), gestures, rAF loop, track metadata corner, active/pending visualization state. Opens only during playback; closes on ×, Escape, a real pause, going offline, or playlist end — the transient PAUSED that YouTube fires inside `loadVideoById` during a track change does *not* close it (main.js keeps a transition marker `trackLoadAt`, set in `load()`, consumed by the first PAUSED, cleared on PLAYING/CUED/error, 5 s max age via `isTransientPause` in utils.js; the `offline` handler closes the overlay explicitly since its pause can race the marker). Self-healing: a WebGL context lost and not restored within 3.5 s (`CTX_LOSS_CLOSE_MS`), or a visualization `frame()` throwing (the rAF loop is try/catch-guarded), auto-closes the overlay so the player UI is never stranded behind a dead canvas. A context loss while open also records reopen eligibility (`sysClosedAt` — the OS reclaimed the GPU process, not a user choice; the pause that follows a GPU kill closes through the ordinary pause path, so eligibility is recorded at the loss itself): `maybeReopenVisualizer()` (called on context restore and on every PLAYING) reinstates the overlay within `VIZ_REOPEN_MAX_MS` (10 min) if playback is on and the context is back. Explicit exits (×, Escape → `userClose`) clear eligibility and never auto-reopen; a frame-crash close doesn't set it (our bug, not the OS). Restore-in-place (context back while still open) clears it too. No fullscreen navigation gestures — swipes over the field are inert (taps bloom). The one navigation gesture is element-scoped: a horizontal touch swipe over the lower-left metadata block (`#viz-text`, enlarged hit area, `skipGesture`: ≥60 px travel, ≤40 px vertical drift, ≤600 ms) skips next (left) / previous (right) via the `onTrackSkip(dir)` callback `main.js` passes to `initVisualizer(reducedMotion, isPride, opts)` — same moves as the viz-open arrow keys. `frame(state, ctx)` receives `ctx = { t, dt, aspect, tiltX, tiltY, blooms, paletteData, paletteCount }` and returns the uniform values for its spec.
- **Crossfade between visualizations**: 600 ms (`VIZ_FADE_MS`), eased by `crossfadeAlpha`; outgoing viz renders opaque, incoming alpha-blends on top; both states step and both palettes follow the bg drift during the fade; outside transitions exactly one program runs. The incoming viz gets a fresh `initState(seed)` and a reset bloom buffer. Reduced motion: instant swap.
- **Shared event machinery** (visualizer.js, invariant 2 enforced centrally): `spawnEvent` always writes the `u_blooms[12]` ring buffer — each shader *reinterprets* those records in its own vocabulary — then calls the per-viz `tap()` hook (or `trackEvent()` on track change). `eventLife` = max bloom age the shader honors.
- **Picker** (`src/viz-picker.js`, DOM only): `#viz-picker` in the overlay's bottom-right corner — an always-visible faint `⁘` toggle (`aria-expanded`, localized `L.vz` label) pinned to the corner; the `role="radiogroup"` menu of visualization names **accordion-expands upward out of it** (`#viz-picker-menu-wrap` animates `grid-template-rows` 0fr→1fr to intrinsic height — no max-height magic number; the menu inside is `min-height: 0; overflow: hidden`; the container is `column-reverse` because the wrap participates in layout, so growth extends upward; `prefers-reduced-motion` drops the transition). **One state class `.picker-open`, set only by `setOpen()`** — desktop hover, touch tap, and keyboard all go through it, so `aria-expanded` always tracks. Hover-fine pointers: open on root `pointerenter`, close after `PICKER_LEAVE_GRACE_MS` (400 ms) on `pointerleave` — both guarded `e.pointerType === 'mouse'` (on hybrid touch+hover devices a tap fires pointerenter before click and would open-then-toggle-closed); no idle timer (it would collapse the menu mid-hover). Touch: tap toggles, 6 s idle close, outside tap closes (overlay pointerdown). Keyboard: `focusin` (`:focus-visible` only) opens, `focusout` beyond the root closes. First reveal (toggle click, hover enter, or focus) calls `warmAll()` (preloads every viz chunk). Selecting calls `selectVisualization(id)`: persist → `ensureLoaded` → `beginTransition` crossfade; a failed chunk load or shader compile reverts the selection to what's running. Overlay tap/bloom gestures ignore `#viz-picker` (and `#viz-text`/`#viz-exit`). **Hit-testing rule**: interactive overlay children must get `pointer-events: auto` only under `.viz-open` (`#viz-overlay.viz-open #viz-text` in CSS) or `.picker-open` (the menu), and `closeVisualizer` calls `picker.setOpen(false)` — an unconditional auto (or a surviving class) keeps invisible blocks hit-testable over the playback drawer when the overlay is closed.
- **Persistence**: selection priority is localStorage override > `TAPE.viz` (author default, set in the admin's chip picker) > `mesh` (`resolveVizSelection`; unknown ids fall through). The override lives in localStorage `muxtape-viz`, a JSON map `{ [playlistId]: vizId }` (key `'_'` when `TAPE.id` is absent), written on picker selection; all access is try/catch. `main.js` passes `tapeId`/`defaultViz` into `initVisualizer` and calls `preloadVizSelection()` when playback starts so a non-mesh selection's chunk is warm before the overlay opens; if it isn't (or its shader fails), the overlay opens with mesh and crossfades over when ready. On a library tape switch, `applyTape` (main.js) calls `setVizTape(tapeId, defaultViz, isPride)` — it re-targets the persistence key, re-resolves the selection for the new tape, updates the picker, clears reopen eligibility, and forces a palette rebuild; the switch closes the overlay first, so there's no live-render race.
- Wiring in `main.js`: `tickDrift` writes `--bg`/theme-color/`setVizBgColor(hex)` at 10 Hz (`DRIFT_WRITE_MS` throttle via `updateDue` — invisible on a 45 s ramp, avoids per-frame style invalidation); `enableMotionListeners()` feeds `deviceorientation` → `setVizOrientation(beta, gamma)`; on iOS the grant comes from the ⊙ click via the `onUserOpen` opt (`requestVizOrientation` — invoked synchronously in the click handler, the gesture context iOS requires; auto-reopen never calls it; orientation only, π keeps geolocation and stays as the motion fallback, hidden after a grant when the playlist has no location). `initVisualizer` opts also carry `isPlaying()` (gates auto-reopen) and `onOpenChange(open)` (main.js stops the ambient orbs / pride canvas while the opaque overlay hides them, resumes on close if playing; the PLAYING branch gates `startAmbient`/`startPrideCanvas` on `!isVisualizerOpen()` for the same reason).
- Performance: canvas renders at 0.6× of DPR-capped (≤2) CSS resolution (`computeCanvasSize`); the rAF loop draws at 30 fps regardless of display refresh (`updateDue`/`VIZ_FRAME_MS` — half the GPU work at 60 Hz, a quarter on 120 Hz); `powerPreference: 'low-power'`; rAF paused when tab hidden; decorative layers behind the overlay paused while open (`onOpenChange`).
- Reduced motion: a single static frame at synthetic t=30 s; taps place a mid-life event and redraw once.

**Invariants every visualization must keep:**
1. *Color continuity*: the live `--bg` drift color is always a dominant color of the field (palette slot 0, kept verbatim by `buildPalette` — pride mode included), so entering/exiting is seamless and `theme-color` (written by the bg drift in `main.js`, which always runs during playback) is always a color present on screen. The visualizer itself never writes `theme-color`.
2. Tap = an Eno-bloom equivalent in the visualization's own vocabulary (ring, splat, shimmer, …) driven by the shared bloom buffer; idle auto-event every 10–15 s; one event on track change.
3. Any time-periodic JS motion must use periods that divide 3600 — the shader clock wraps hourly (`vizTime`).

### Visualizations

#### 1. Mesh gradient (default — `src/viz/mesh.js`, display name "Bloom")

iOS-wallpaper-style soft color field. No hard edges by construction.

- **Rendering** (fragment shader in `mesh.js`): N color sites — `u_sites[9]` vec3 (x, y in aspect-space, z = Gaussian falloff) — blended with normalized Gaussian weights `exp(-d²·z)` in **linear RGB**, then sRGB-encoded + IGN-dithered (×1.5 for film grain). A mild FBM domain warp (`t = u_time * 0.05`, amplitude 0.35) keeps regions organic. Tiny ambient weight on slot 0 prevents far-field underflow to black. Breathing luminance (47 s/31 s sines) + faint vignette (mix 0.15). Site positions come from JS each frame — never from in-shader trig.
- **Palette** (`buildVizPalette` in `mesh.js`): 6 roles from the bg hue — slot 0 anchor (live bg, verbatim hex), 1 deep dark (l=14, broad falloff 5.5), 2 mid cool (h−55), 3 mid warm (h+25), 4 saturated accent (h+60), 5 near-white highlight (l=88, s=14, tight falloff 13, biased upper-center-right). Color falloff 9. Pride mode: fixed `PRIDE_COLORS_VIZ` (9 colors, uniform falloff) with slot 0 overwritten by live bg. Palette re-derived from live bg at most every 250 ms (throttle in `drawVizFrame`). Hue evolution rate = bg drift rate (45 s per transition, endless, non-repeating).
- **Motion** (`computeSites` in `mesh.js`): seeded golden-ratio base scatter + primary orbit (periods {60,48,45,40,36,30,72,90,120} s, amp 0.30) + epicycle ({12,10,9,8,15,18,20,24,16} s, amp 0.06). Visible change in 2–3 s; full reconfiguration ~40–60 s.
- **Tilt** (`createTiltState`/`stepTilt`/`normalizeTilt` in `viz-logic.js` — shared): under-damped spring (stiffness 14, damping 6 ≈ 0.8× critical — gel overshoot) chasing the deviation from a slow-adapting baseline (τ = 3.5 s = the resting pose). Output ±1 → site offset × `TILT_GAIN` 0.18 × per-site parallax depth (0.6–1.1), applied inside `computeSites` (JS-side, no `u_tilt`). Holding still → deviation decays → autonomous drift resumes automatically; tilt is purely additive, no mode switch. `normalizeTilt` remaps beta/gamma per `screen.orientation.angle`, ±45° → ±1.
- **Tuning knobs** (exported constants in `mesh.js`): `FALLOFF_*` (region size — too low and the normalized blend averages to a flat wash), `AMP_PRIMARY`/`AMP_EPI` (travel), `SITE_PERIODS`/`EPI_PERIODS` (speed), `TILT_GAIN`. Tune from headless screenshots (see Visual verification).

#### 2. Rain on glass (`src/viz/rain.js`)

Bokeh lights behind a pane; beaded drops refract them as they run down. The gyro showcase.

- **Rendering**: re-sampleable `bgcol(p)` = slot 0 → slot 1 vertical dusk + `u_lights[6]` vec4(x, y, r, slot) Gaussian discs ×0.55. Three drop layers (`RAIN_LAYER_SCALES` [6, 9, 14]) in **gravity-rotated space**: per column, one falling drop cycles down (`fract(hash·13.7 − phase)`) with a sine wobble; in-drop refraction `off = d·RAIN_REFRACT(−1.6)·inside` re-samples `bgcol` inverted; specular dot upper-left; a `RAIN_TRAIL`(0.35)-long trail of shrinking static beads above the mover; static micro-droplets (scale 16) respawn on a 20 s hash era. **Each layer evaluates its two neighbor columns too — drops wobble wider than their cell and get sliced by the column boundary otherwise.** Guard degenerate `smoothstep(0,0,x)` when trail radii hit zero (NaN rectangles on some GPUs). Blooms = splats: expanding refractive ring + near-white rim sparkle, life `SPLAT_LIFE` 3 s. Wet areas brighten ×1.3; specular stays near-white via `mix(vec3(1), slot5, 0.4)` (pride slot 5 is dark). House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h, s·0.8, 12) night, hsl(h+30, 80, 55), hsl(h−50, 70, 50), hsl(h+70, 85, 60) bokeh trio, hsl(h+10, 15, 85) specular]`; light slots 2–4. Pride: `[bg, …PRIDE_COLORS_VIZ[1..]]`, light slots cycle 1–8.
- **Motion**: `computeBokehLights` — Lissajous drift, periods `BOKEH_PERIODS` [90, 72, 120, 144, 60, 180] (x uses i, y uses i+2), radius breathing 45/36 s. **Fall phases integrate in JS** (`stepRainPhases`, dt clamped to 0.1 s) rather than deriving from `u_time`, so a changing tilt rate accelerates smoothly instead of teleporting drops; `RAIN_SPEEDS` [1/20, 1/12, 1/8] (×3600 all integer — wrap-safe).
- **Tilt**: `gravityFromTilt(tiltX)` → unit `u_gravity`, ±`RAIN_GRAV_GAIN` 0.6 rad off vertical — the whole drop field rotates so streaks run along gravity; `rainRate(tiltY)` = 1 + 0.5·|tiltY| multiplies fall speed (lean forward, rain runs faster).
- **Interaction**: tap/auto/track = splat via the shared bloom buffer only (no per-viz hooks).
- **Tuning knobs**: `RAIN_LAYER_SCALES`/`RAIN_SPEEDS` (density/speed), `RAIN_REFRACT` (lens strength), `RAIN_TRAIL`, `RAIN_GRAV_GAIN`/`RAIN_RATE_GAIN`, bokeh count/periods, dry-column threshold 0.22 and drop-size range in the shader.

#### 3. Aurora (`src/viz/aurora.js`)

Light curtains rippling over a dusk sky; the horizon glow is the live bg. Grand, ambient.

- **Rendering**: dusk gradient `mix(slot0, slot1, smoothstep(0.12, 0.75, y))` — slot 0 dominates the lower ~40% (invariant 1). Stars: 1/90 hash grid, threshold 0.985, **round soft points at jittered cell positions** (`exp(−d²·6)` in cell units — flat cell fills look like square confetti), twinkle on a 4 s hash era, upper-sky fade-in. Three additive curtain layers: centerline `h = 0.42 + i·0.12 + 0.22·(fbm(xs·1.6) − 0.5) + u_lift`, where `xs = x·1.5 + phase_i + wind·depth_i`; asymmetric band `exp(−dy²·200)` below / `exp(−dy²·25)` above (crisp base, long upward glow); fold/gap mask `0.1 + 0.9·vnoise(xs·1.1)²` (squared for contrast — without it the layers fuse into a fog wall); fine ray striations `0.5 + 0.5·vnoise(xs·26, y·2)`; layer gains 0.5/0.375/0.25. Blooms = **shimmer pulses**: gaussian patch (σx 0.12, σy 0.18) whose center rises at `SHIMMER_RISE` 0.25/s, ×(1+2·pulse) on curtain intensity, life `SHIMMER_LIFE` 6 s. House breathing/vignette/dither.
- **Palette**: `[bg horizon, hsl(h−30, ≤60, 9) dusk, hsl(h+90, 75, 55) curtain base, hsl(h+140, 65, 45) mid, hsl(h+60, 55, 70) fringe, hsl(h, 12, 92) stars]`; color climbs base→mid with height above the centerline + fringe ×0.5 higher. Pride (in-shader, `u_paletteCount > 8.5`): curtain hue cycles pride slots 1–8 along `xs·1.2 + t/45`, smooth-stepped between neighbors.
- **Motion**: `auroraPhases` — per-layer flow `seed·k_i + t/FLOW_i`, `AURORA_FLOW` [120, 90, 144] (hourly seam accepted, mesh-precedent). Wind `computeAuroraWind` = `WIND_AMP` 0.3 · sin(TAU·t/`WIND_PERIOD` 60) + tilt.
- **Tilt**: tiltX → wind sway (`AURORA_TILT_GAIN` 0.5, applied per layer ×depth 0.6/0.9/1.2); tiltY → `u_lift` = tiltY·`AURORA_LIFT_GAIN` 0.15 raises/lowers the curtains.
- **Interaction**: tap/auto/track = shimmer pulse via the shared bloom buffer (no per-viz hooks).
- **Tuning knobs**: `AURORA_FLOW` (ripple speed), band ks 200/25 (edge crispness/glow length), fold-mask floor 0.1 (gap depth), ray frequency 26, layer spacing 0.12, star grid/threshold, `WIND_*`/`AURORA_*` gains.

#### 4. Ink in water (`src/viz/ink.js`)

Dark plumes billowing up through live-bg water. Late-night, sparse.

- **Rendering**: water = slot 0 × vertical shade (0.96→1.04) with slow dilute wisps (`fbm(p·1.6 + t·{0.013, −0.008})`, thresholded, ×0.18 absorption) so the field is alive before any drop falls. **The shared bloom buffer IS the ink** (`eventLife: INK_LIFE` 25 s): per active drop, plume-local `q = (uv − b.xy)·asp` minus the risen/leaned path (`age·INK_RISE` 0.04/s); spatial early-out at 3σ; curl = value-noise pair (scale 2.4, seeded by b.w) warping `q` by `min(age·0.09, 0.9)` — this is what makes tendrils instead of a blob; envelope = gaussian(σ = `INK_SIGMA0` 0.05·(1+min(age,1)) + `INK_SPREAD` 0.02·age) × dilution exp(−age/`INK_DILUTE_TAU` 18) × fade-in (age·3) × fade-out (smoothstep 25→20); density = `smoothstep(0.18, 0.62, fbm(q·4))·env`. **Absorption compositing**: `col *= mix(vec3(1), inkCol·1.1, dens·1.8)` — order-independent, multiple plumes multiply. House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h+180, 70, 22) ink, hsl(h+150, 60, 32) mid, hsl(h+180, 40, 55) dilute]`; ink color = `mix(dilute, ink, dens·1.5)`. Pride (in-shader `u_paletteCount > 8.5`): each drop's ink = `paletteAt(max(b.w, 1))`.
- **Motion**: none beyond plume age — no JS periodic motion (no period constants to check). Wisps use raw `u_time` (mesh-precedent hourly seam).
- **Tilt** (`inkLean`, clamped ±1 input × `INK_TILT_GAIN` 0.5): x bends the rise sideways (×2 in-shader), y speeds/slows the climb.
- **Interaction**: tap = drop at touch, auto/track = drop at random position — all via the shared buffer, no per-viz hooks.
- **Tuning knobs**: `INK_LIFE`/`INK_DILUTE_TAU` (persistence), `INK_RISE`/`INK_SPREAD`/`INK_SIGMA0` (plume shape), curl warp 0.09/0.9 and density thresholds 0.18/0.62 in the shader (tendril character), wisp gain 0.18.

#### 5. Incense ribbon (`src/viz/incense.js`)

One luminous smoke line rising from an ember. Piano/sparse, contemplative.

- **Rendering**: room = `mix(slot0, slot1, smoothstep(0.35, 1.1, |cuv|)·0.6)` (live bg, dim corners). Centerline `ribbonX(y)` = 0.5·aspect + Σ₃ `RIBBON_AMPS`·(0.2 + y²)·sin(phase_k + y·`RIBBON_WINDS` [2.5, 4, 7]) + turbulent fbm jitter 0.06·y² (drifting with raw `u_time` — mesh-precedent seam) + `u_draft`·y². Glow `exp(−dx²·K)`, K = mix(4000, 250, y) (thin base → dispersed top), brightness ×(1−0.6y), faint second filament at +0.012, smoke gated above the ember (`smoothstep(0.02, 0.1, y)`). Ember at `ribbonX(0.04)`: palette[4] gaussian (k 1500) + warm-white core (k 9000), throbbing at `EMBER_PULSE` 6 s. Blooms = smoke rings: ellipse annuli (y×1.6 flattened) climbing `RING_RISE` 0.12/s, radius 0.03+0.02·age, life `RING_LIFE` 6 s, at the bloom's position (random for auto/track — rings anywhere in the room, accepted simplification of "from the ember"). House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h, ≤60, 8) corners, hsl(h, 15, 75) pale smoke, hsl(h−20, 20, 55) mid smoke, hsl(h+25, 85, 55) ember]`; smoke color ember-warm → pale with height. Pride (in-shader): smoke hue cycles pride slots along `(y + t/45)·3`, blended 35% toward grey to stay smoky.
- **Motion**: `ribbonPhases` — TAU·t/`RIBBON_PERIODS` [45, 30, 20] + seed offsets; amplitude grows with height (laminar base, lively top).
- **Tilt**: `incenseDraft(tiltX)` (clamped, ×`DRAFT_GAIN` 0.5) bends the ribbon ×y² — the top sways, the base barely.
- **Interaction**: tap/auto/track = smoke ring via the shared buffer (no per-viz hooks).
- **Tuning knobs**: `RIBBON_PERIODS`/`RIBBON_AMPS`/`RIBBON_WINDS` (sway character), K range 4000/250 (dispersion), jitter 0.06 (turbulence), `DRAFT_GAIN`, ember ks/throb, ring shape.

#### 6. Neon Lissajous scope (`src/viz/scope.js`)

A phosphor beam tracing generative Lissajous figures. **The beam IS the live bg color** (invariant 1). Electronic.

- **Rendering**: the polyline (`SCOPE_SEGMENTS` 80 + 1 points) is computed in JS per frame (`scopePoints`, house pattern — no in-shader trig) and uploaded via the `'2fv'` spec tag (added to viz-gl for this). Shader shading is a hybrid: **geometry from the minimum segment distance** (one smooth line, no seam double-counts) but **brightness from a distance-weighted average** (`wgt = exp(−d²·400)`) over nearby segments — a plain nearest-branch brightness flips visibly where strands pass close, and plain additive per-segment glow beads at the seams; the normalized average avoids both. Beam = `exp(−d²·2600)·br·1.1` + halo `exp(−d²·60)·0.22` in the beam color over field `slot1 + beam·0.12`; white-hot core `smoothstep(0.55, 1, glow·br)` in `mix(white, slot4, 0.3)`. Phosphor: head loops every `HEAD_PERIOD` 12 s, brightness `0.25 + 0.75·exp(−behind·5)`. Blooms = pulses racing along the trace from `s0 = fract(b.x + b.y·3.7)` at `PULSE_SPEED` 0.15 rev/s, life 3 s (inner 12-bloom loop guarded by the d² early-out). House breathing/vignette/dither.
- **Palette**: `[bg beam, hsl(h, ≤30, 6) tube field, hsl(h, ≤60, 30) afterglow reserve, hsl(h+60, 90, 65) accent reserve, hsl(h, 5, 95) core]`. Pride: beam = `paletteAt(u_beamSlot)` cycling slots 1–8 per figure index (JS-side).
- **Motion**: figures = coprime pairs `SCOPE_PAIRS` {(1,2),(2,3),(3,4),(3,5),(4,5),(5,6)} via `pickLissajousPair(seed, idx)` (modulo-6, negative-safe → continuous across the hourly wrap); new figure every `FIGURE_HOLD` 30 s with a `FIGURE_MORPH` 4 s 1−cos point-blend (`figureMorph`); phase δ from seed; depth `z = sin(2s + 1.7δ)`.
- **Tilt**: pseudo-3D skew — each point offsets by `z·tilt·SCOPE_TILT_GAIN` 0.13 (in `scopePoints`).
- **Interaction**: tap = traveling pulse (shared buffer); `trackEvent` increments `state.figureOffset` — each track gets the next figure.
- **Tuning knobs**: `SCOPE_SEGMENTS` (smoothness vs cost), glow/halo ks 2600/60, brightness-average kernel 400, persistence decay 5, `FIGURE_HOLD`/`FIGURE_MORPH`, `HEAD_PERIOD`, `PULSE_*`, figure scale 0.36.

#### 7. Starfield warp (`src/viz/stars.js`)

Four parallax shells of stars streaming out of a vanishing point over a live-bg nebula. Soundtracks, momentum.

- **Rendering**: space = slot 1 + **nebula `slot0 · fbm(p·1.2 + t/180) · 0.4`** (the dominant chroma, invariant 1). Per shell: zoom `mix(0.12, 2.2, fract(t/P + seedOff))` expands a direction-space star grid (`q = (p − u_vp)/zoom`, cell grid × scale) outward; star presence hash > 0.86; **jitter ±0.15 cell and radius `zoom·(0.035 + 0.045·hash)/scale` kept small enough that the streaked gaussian dies before the cell edge** (no neighbor-cell pass needed, unlike rain); radial streak stretches the along-ray axis ×(1 + 2z); shells fade in at z<0.2 and out past 0.72 so the `fract` recycle never pops. Star color = `mix(mix(white, slot2, 0.25), slot3 warm, step(0.93, hash))`. Blooms = **comets**: bright white head + `mix(slot4, white, 0.3)` tail tapering along the outward ray through the event, head travels `COMET_SPEED` 0.3/s, life `COMET_LIFE` 4 s. House breathing/vignette/dither.
- **Palette**: `[bg nebula, hsl(h, ≤40, 7) space, hsl(h, 8, 95) star, hsl(h+30, 40, 80) warm star, hsl(h+45, 90, 65) comet]`. Pride: nebula = live bg; star/comet tints sample the spectrum slots.
- **Motion**: shell recycle `STAR_LAYER_PERIODS` [90, 60, 45, 36] (all divide 3600), grids `STAR_LAYER_SCALES` [8, 12, 18, 26] — finer grids cycle faster (near layers scream past).
- **Tilt** (`vpFromTilt`, clamped ±1 × `VP_GAIN` 0.3): the vanishing point leans with the device — tilt steers the camera through the field.
- **Interaction**: tap/auto/track = comet via the shared buffer (no per-viz hooks).
- **Tuning knobs**: `STAR_LAYER_*` (depth/speed), presence threshold 0.86 (density), radius/jitter constants (size vs cell-cut safety), streak factor 2.0, `VP_GAIN`, `COMET_*`.

#### 8. Paper topography (`src/viz/topo.js`)

Hand-drawn contour lines of a slowly remolding landscape on live-bg paper. Folk, quiet.

- **Rendering**: paper = **slot 0 verbatim** × fiber grain (fbm scale 30, amp 0.02) + heavier dither (2.5 — paper tooth). `elevation(p)` = `fbm(p·2 + seed + u_drift)` + Σ bloom peaks (gaussian σ `PEAK_SIGMA` 0.16, height `PEAK_HEIGHT` 0.45, grow/erode smoothsteps over 4 s each — `peakEnvelope` is the tested JS twin). Contours: `1 − smoothstep(0, 0.09, |fract(e·TOPO_CONTOURS 12) − 0.5|·2)` — fixed width, so lines fatten where the field flattens (pooled-ink, hand-drawn); every 5th is an index line (tighter 0.035, darker ink slot 2 at 0.55); regular lines slot 1 at 0.45. Hypsometric tint 8% `mix(slot3, slot4, e)`. House breathing/vignette.
- **Palette**: `[bg paper, bg-derived ink (l−35), index ink (l−45), hsl(h−20, 25, l+6) low, hsl(h+20, 30, l+12) high]`. Pride: inks stay bg-derived (legibility), slots 3–8 carry six pride colors and the tint band cycles them (`paletteAt(3 + mod(floor(e·6), 6))` at 6%).
- **Motion**: `topoDriftOffsets` — two sines, periods `TOPO_DRIFT_PERIODS` [180, 240], amp 0.15; the landscape remolds over minutes.
- **Tilt**: 2.5D parallax — base elevation `e0` decides a sample shift `p + u_tilt·TOPO_TILT_GAIN 0.08·e0`, then the shifted field is drawn (elevation evaluated twice; high ground slides more).
- **Interaction**: tap = new peak via the shared buffer (`eventLife: PEAK_LIFE` 12) — contour rings bloom outward as it grows, then erode away; auto/track = peak at random position.
- **Tuning knobs**: `TOPO_CONTOURS` (line density), line widths 0.09/0.035 and alphas, `PEAK_*`, `TOPO_DRIFT_*`, `TOPO_TILT_GAIN`, grain amp.

#### 9. Underwater caustics (`src/viz/caustics.js`)

Refracted-light web over sunlit live-bg water, god rays slanting from the surface. Chill.

- **Rendering**: water = `mix(slot1 deep, slot0, smoothstep(0, 0.75, y))` — slot 0 dominates the sunlit upper. Web = product of two ridged-noise layers `ridged(q) = pow(1 − |2·vnoise(q) − 1|, RIDGE_POW 3)` at `CAUSTIC_SCALE` 3.5 / ×1.3, **each sampled in a rotated frame (~17° / ~−40°) — unrotated value noise leaves axis-aligned ridges and the web turns rectilinear**; product ×2.5, dimmed ×(1 − 0.6·(1−y)) with depth. Scrolls at `CAUSTIC_SPEEDS` [1/45, 1/60] (3600·s integer — wrap-safe) along sun-dependent directions. God rays: `pow(vnoise(across·7, t·0.05), 2)` along the sun's perpendicular, fading below `smoothstep(0.35, 1, y)`, slot 3 ×0.3. Blooms = **ripple rings**: expanding band (0.04 + 0.11·age) that radially displaces the caustic sampling (×0.05) + bright rim ×0.3, life `RIPPLE_LIFE` 5 s. Sampling also bends with depth: `cp = p + u_sun·(1−y)·0.1`. House breathing (the swell)/vignette/dither.
- **Palette**: `[bg water, hsl(h+15, ≤70, 12) deep, hsl(h, 25, 85) caustic, hsl(h+10, 20, 75) ray, hsl(h+50, 60, 60) glint reserve]`. Pride (in-shader): caustic tint drifts through the spectrum slots over 90 s, blended 55% toward pale.
- **Motion**: scroll only (raw `u_time`, wrap-safe speeds); the house breathing doubles as swell.
- **Tilt**: `sunFromTilt(tiltX)` — unit sun vector, ±`SUN_GAIN` 0.4 rad; moves ray direction, scroll lean, and the depth-bend skew together.
- **Interaction**: tap/auto/track = ripple ring via the shared buffer (no per-viz hooks).
- **Tuning knobs**: `CAUSTIC_SCALE`/`RIDGE_POW` (web fineness/contrast), `CAUSTIC_SPEEDS`, layer rotation angles, depth dim 0.6, `SUN_GAIN`, ripple band/displacement.

#### 10. Kaleidoscope mandala (`src/viz/kaleido.js`)

The one **feedback** visualization (`feedback: true` on the entry → viz-gl's FBO ping-pong path). Pop/funk, hypnotic.

- **Rendering** (feedback pass; the present pass dithers): fold the previous frame — `r = |c|/1.01` (outward zoom), angle − precession, mirror-fold into `TAU/u_k`, rotate back, sample `u_prevFrame`. Decay toward a bg-tinted floor `toSrgb(slot0)·0.18` at `KALEIDO_DECAY` 0.985, with a rim damp `smoothstep(0.8, 0.55, |c|)` so edge-clamp smears die. **Live-bg halo `toSrgb(slot0)·0.5·smoothstep(0.78, 1.0, |c|)` surrounds the mandala — it sits outside the damp zone, so re-adding it per frame is stable; any additive term inside the loop compounds by 1/(1−decay)** (invariant 1 holds via floor + halo). Sparks: up to `SPARK_SLOTS` 6 additive gaussians from `computeKaleidoSparks` — the fold replicates them k-fold within a frame. Procedural radial-fbm flower, **self-regulating** (`× smoothstep(0.22, 0.04, lum(prev))`): visible only where the feedback field is empty — first frames, and the single reduced-motion frame (no separate fallback shader needed). **No breathing or dither inside the loop — anything multiplied in compounds frame over frame**; palette colors are converted with `toSrgb` since the loop runs in display space.
- **Palette**: `[bg floor/halo, deep reserve, hsl(h+40, 85, 60), hsl(h−40, 75, 55), hsl(h+90, 70, 65), hsl(h+10, 10, 90)]` — sparks cycle slots 2–5. Pride: sparks cycle slots 1–8 (set in `computeKaleidoSparks`).
- **Motion**: precession `TAU·t/PRECESS_PERIOD 240 + tiltX·KALEIDO_TILT_GAIN 0.3`; spark schedule — per-slot cycles `SPARK_PERIODS` [1.2, 1.6, 2.0] (3600/p integer), hash angles, radius orbiting on `SPARK_ORBIT` 45 s, alive the first half of each cycle.
- **Tilt**: tiltX precesses the symmetry axis (the whole mandala swings).
- **Interaction**: `tap` **re-seeds** — `RESEED_DECAY` 0.8 for `RESEED_T` 0.5 s (fast clear) + a 3-spark burst at the tap's radius/angle (mirrored k-fold automatically); `trackEvent` steps the symmetry order through `KALEIDO_KS` [6, 8, 10, 12] + bursts. Stale future timestamps from the hourly wrap are dropped in `frame()`.
- **Tuning knobs**: `KALEIDO_DECAY`/`RESEED_*` (trail length/clear feel), zoom 1.01 (expansion speed), `KALEIDO_KS`, `SPARK_*` (seeding density/size), floor 0.18 / halo 0.5, flower thresholds.

#### 11. Disco ball (`src/viz/disco.js`)

A faceted mirror ball near the top of a live-bg room, slowly turning; its light spots sweep the walls. Restrained — slow drift, a few glints at a time, never a strobe.

- **Rendering**: room = `mix(slot1 shadow, slot0, clamp(0.55 + 0.5·pool, 0, 1))`, `pool = exp(−|p−ball|·1.2) + 0.15·(fbm−0.5)` — bg-colored wall wash dominates (invariant 1). **Spots**: polar grid around `u_ball` — spoke coord `su = (θ/TAU + u_rot/TAU)·SPOKES` (θ from straight down), ring `sv = r·RINGS`; cell hashes use `mod(spoke, SPOKES)` so they're invariant when `u_rot`'s fract wraps each revolution (**both angular hashes — spokes and ball facets — must be taken mod their count, or everything re-rolls at the wrap**). Per cell (full 3×3 neighborhood — radial σ outgrows the ring pitch and jitter wanders): presence hash > 0.62, center jittered ±0.2 cell, anisotropic gaussian in screen units (tangential = arc length, radial = ring pitch), σt `DISCO_SPOT_R`·(0.5+r), σr ×(1+`DISCO_ELONG`·r); brightness `(0.4+0.6·h)·exp(−r·1.1)` × ±15% twinkle (20 s); masked inside 1.5–2.4× ball radius. **Ball**: disc SDF (`DISCO_BALL_R` 0.13, fixed-width AA), hemisphere `lat = asin(clamp(y, ±0.985))` / `lon = atan(x, max(z, 0.05)) + u_rot` (pole/rim NaN guards), facet grid at `TAU/DISCO_FACETS` (24), flat-shaded from the facet-center normal (hard mirror-tile edges intended, bounded in the disc), grout lines, per-facet hash variation; **glints**: facet flares slot-4 when `fract(gh·7.3 + u_glint) < window` (0.05 — a few at a time). Thin slot-1 rod; faint slot-2 halo outside the rim. Blooms = **sparkle bursts**: pulse `smoothstep(0,0.15,age)·exp(−age·1.1)`; a gaussian patch boosts spot brightness ×(1+2·pulse), Σpulses widen the glint window ×(1+2·Σ) (the ball answers), plus fine `pow(vnoise(p·18),6)` shimmer ×0.25. House breathing/vignette/dither.
- **Palette**: `[bg wall wash, hsl(h, ≤50, 8) shadow/rod, hsl(h+15, 25, 82) spot light, hsl(h, 8, 60) facet silver, hsl(h+30, 15, 93) glint]`. Pride (in-shader): per-spot tint `paletteAt(1 + mod(floor(h·8), 8))` mixed 45% toward pale; ball stays silver, glints near-white.
- **Motion**: `discoRot(t)` = TAU·fract(t/`DISCO_ROT_PERIOD` 48); sway `DISCO_SWAY_AMP` 0.015 on `DISCO_SWAY_PERIOD` 18; glint era `GLINT_PERIOD` 12; twinkle 20 (in-shader, u_time). All divide 3600; all phases arrive as JS uniforms (`u_ball '2f'`, `u_rot '1f'`, `u_glint '1f'`).
- **Tilt** (`discoBallPos`, clamped ±1): tiltX leans the pendulum ×`DISCO_TILT_GAIN` 0.08, tiltY bobs the hang height ×`DISCO_BOB` 0.04 — the spot grid is ball-centered, so the whole light field swings with the ball.
- **Interaction**: tap/auto/track = sparkle burst via the shared bloom buffer (no per-viz hooks). `eventLife: DISCO_FLASH_LIFE` 4.
- **Tuning knobs**: `DISCO_ROT_PERIOD`/`DISCO_SWAY_*`/`GLINT_PERIOD` (tempo), `DISCO_BALL_R`/`DISCO_BALL_Y`/`DISCO_FACETS` (the ball), `DISCO_SPOKES`/`DISCO_RINGS`/presence 0.62/`DISCO_SPOT_R`/`DISCO_ELONG`/`DISCO_SPOT_GAIN` (spot field), glint window 0.05, `DISCO_TILT_GAIN`/`DISCO_BOB`, `DISCO_FLASH_LIFE`.

### Archived visualizations

Unregistered, not bundled: the module and its test stay in `src/viz/` (kept green), but there is no loader in registry.js and no id in ids.js, so Vite never imports it. **Never reuse an archived id** — stored references (`viz` in playlists, localStorage overrides) resolve to the default at runtime, and the schema deliberately accepts any string so saved playlists stay valid. To reinstate: re-add the loader + id/name entries and move the subsection back up.

#### Lava lamp (`src/viz/lava.js`)

Metaball wax in live-bg liquid. Playful, physical.

- **Rendering**: `u_blobs[7]` vec4 (x, y aspect-space, radius, palette slot) — 5 primary + 2 satellite slots (r = 0 inactive). Metaball field `f = Σ r²/(d²+1e-4)`; wax color = field-weighted blend of per-blob `paletteAt(slot)` colors so merging blobs smear hues; body `smoothstep(1.0, 1.18, f)` with inner-depth brightening (`mix(0.8, 1.3, smoothstep(1.0, 2.6, f))`); rim light band `smoothstep(1.0,1.06,f) − smoothstep(1.06,1.3,f)` in `mix(waxCol, white, 0.55)` × 0.45. Liquid = slot 0 verbatim × vertical shade (0.85→1.05). Heat-shimmer fbm warp (amp 0.015, t·0.08). Blooms = mesh-style rings at 0.4 gain (heat ripples). House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h, s·0.9, 10) shade, hsl(h+25, ≤90, 38) wax deep, hsl(h+40, 90, 60) wax bright]`; blob slots alternate 2/3. Pride: `[bg, …PRIDE_COLORS_VIZ[1..]]`, blob slots cycle 1–8 (chosen in `computeLavaBlobs` by `paletteCount ≥ 9`).
- **Motion** (`computeLavaBlobs(t, seed, aspect, tiltX, tiltY, paletteCount, state, out)`): rise/fall `y = 0.5 + 0.42·sin(TAU·t/RISE_i)`, RISE = [120, 90, 144, 180, 72]; sway amp 0.08, XP = [60, 80, 48, 90, 72]; radius breathe ±0.04 around `LAVA_R_BASE` 0.15, RP = [30, 36, 40, 45, 60]; squash ×(1−0.2·|y−0.5|·2) near extremes.
- **Tilt**: gravity slosh — `x += tiltX·LAVA_TILT_GAIN(0.25)·depth`, `y += tiltY·0.12·depth`, depth 0.7–1.2 seeded per blob.
- **Interaction**: tap → `nearestBlob` within 2.5r gets `heat[i] = t`; `lavaHeatBoost(age) = exp(−age/3)` swells radius ×(1+0.35·boost) and lifts (`LAVA_HEAT_RISE` 0.25). A heated blob over `LAVA_SPLIT_R` 0.18 **splits** instead: a satellite slot (r 0.07, parent's color) rises at `LAVA_SAT_RISE` 0.05/s and melts away over `LAVA_SAT_LIFE` 8 s. Track change (`trackEvent`) stokes the biggest blob. Taps in open liquid just ripple (shared bloom). `state.aspect` is cached in `frame()` for tap coordinate conversion.
- **Tuning knobs**: `LAVA_R_BASE` (wax amount), `LAVA_*_PERIODS` (speed), `LAVA_HEAT_*`/`LAVA_SPLIT_R`/`LAVA_SAT_*` (interaction feel), `LAVA_TILT_GAIN`, field thresholds 1.0/1.18 in the shader (wax surface tension).

### Adding a visualization

The standard recipe: file under `src/viz/<id>.js` + loader in `registry.js` + id/name in `ids.js` + `src/viz/<id>.test.js` (periods divide 3600, palette slot-0 verbatim normal AND pride, motion bounds/tilt monotonicity) + headless screenshot acceptance + its own subsection above, all in one commit. Hard-won shader lessons: guard degenerate `smoothstep(e0, e1, x)` when a radius can reach 0 (NaN rectangles); anything cell/grid-based whose feature can cross its cell boundary must evaluate neighbor cells (rain) or bound the feature inside the cell (stars); point features need jittered centers + radial falloff, never flat cell fills; integrate phases in JS when a tilt-driven rate multiplies a time-derived `fract()` (else features teleport); unrotated value noise leaves axis-aligned ridges (rotate layered samples); for curve glow, shade geometry from min segment distance but brightness from a distance-weighted average (plain nearest flips at branch midlines, plain additive beads at seams); in a feedback loop, never multiply periodic gains or dither in (they compound — present-pass only), and additive terms are only stable where the loop's damp is zero.

## Audio sources

**Maintenance rule: like the visualizer section, this is the source of truth for the audio-source seam. Any change to `src/sources/` or its wiring in `main.js` must update this section in the same commit.**

### The seam

Each track resolves to a source family via `sourceOf(track)` (`src/sources/ids.js`): `track.source` omitted = `youtube` (every pre-source playlist works unmigrated; unknown values also fall back, failing soft at runtime while the schema rejects them at save time). main.js keeps **one persistent controller per family** (`controllers` map, created lazily by `controllerFor`, cached for the page lifetime) and drives the current track through `active`. A pure-file tape never instantiates the YT iframe.

- `src/sources/ids.js` — pure metadata, no DOM/SDK (safe for admin.js and tests): `SOURCE_IDS`, `STATE` (normalized `'unstarted'|'cued'|'buffering'|'playing'|'paused'|'ended'` — main.js's `handleState` switches on these, never on provider constants), `sourceOf`, `capsOf`, `attributionFor(track)` (→ `{ href, label }`; label null = stock `L.au`, else `L.auf(label)`), `artworkFor(track)` (MediaSession artwork array or null to omit — file tracks have none).
- **Capability flags** (`CAPS`): `needsTransientPauseGuard` (YT fires a spurious PAUSED inside `loadVideoById`; `load()` arms `trackLoadAt` only when true — a real pause on a file track closes the visualizer immediately, correctly), `hiddenPlayback` (false ⇒ the UI must mount a visible widget — reserved for licensed embeds, see below), `fullPlayback` (false ⇒ preview-only unless logged in), `cueable` (false ⇒ saved-position restore degrades to index-only).
- `src/sources/registry.js` — **static imports, deliberately unlike the viz registry**: `load()` must stay synchronously reachable inside the click gesture or iOS blocks autoplay, and both sources are tiny. A future SDK-backed source adds an eager `prepare()` at startup instead (the old `loadYouTubeAPI` trick). `sourceFactory(id)` falls back to the default for unregistered ids.
- **Controller contract** (`createXSource({ onReady, onState, onError }) → SourcePlayer`): `isReady()`, `load(track, { startSeconds, cue })` (cue = load-without-play for saved-position restore; **must be callable synchronously in a gesture — never await before play**), `play/pause/stop`, `seekTo(s)`, `getCurrentTime/getDuration` (0 when unknown), `getState()`. Errors normalize to `'unplayable'` (fatal for this track → main.js skips via `next()`, unless `lastLoadWasCue`) or `'blocked'` (autoplay denied → paused UI, never skip).
- **Wiring in main.js**: `warmControllers()` instantiates a controller per family present in the tape, at startup and in `applyTape` (gesture-context rule). `load()` checks `isReady()` (not-ready → `pendingTrackIndex`, flushed by `onSourceReady`), then hands off: sets `activeSourceId` *before* stopping the outgoing controller — the **stale-event guard** (`onState`/`onError` filtered on `sid === activeSourceId`) is what keeps a stopped controller's late PAUSED from stomping the incoming track's UI on mixed tapes. `resetPlaybackUI` nulls `active`/`activeSourceId`. Saved-position restore: `maybeRestoreSavedPosition()` runs once (guarded by `savedRestoreDone`, set by any explicit `load`) from whichever `onSourceReady` arrives with the saved track's source ready. The buffering watchdog re-checks `active?.getState()`.

### youtube (`src/sources/youtube.js`)

Extraction of the old inline code: IFrame API script load at construction, `YT.Player` on the `#yt-player` div, pure `mapYouTubeState` (−1/0/1/2/3/5 → STATE) and `mapYouTubeError` (every error code is fatal → `'unplayable'`, matching pre-seam behavior). `cue` → `cueVideoById({ videoId, startSeconds })`, else `loadVideoById`.

### file (`src/sources/file.js`)

One hidden in-document `<audio preload="auto" playsinline>`; plays any http(s) URL (`track.url`). The subtleties, all unit-tested:

- `mapMediaEvent` (pure): `pause` while `ended` is suppressed (browsers fire pause-before-ended; ENDED must drive `next()` exactly once); `waiting`/`stalled` only count as BUFFERING while not paused (Safari fires waiting on paused seeks); `canplay` while unpaused re-emits PLAYING (clears the buffering banner after a mid-play seek).
- **One fatal report per load**: a dead URL fails twice (the `error` event AND the `play()` rejection) — `fatalReported` dedupes, else one dead track skips two; a `gen` counter drops rejections from superseded loads; `AbortError` is ignored; `NotAllowedError` → `'blocked'`.
- `normalizeDuration`: Infinity (live streams) → 0, or the ticker paints NaN.
- Cue path: `src` set, seek applied on `loadedmetadata`, then CUED (paints the restored scrubber like YT's cue).
- `stop()` empties `src` + `load()` to release the connection; the error event that emptying fires is filtered by the no-src guard.
- Same-origin self-hosted audio belongs under `public/` (deploys outside `/assets/`, so the SW's cache-first branch never eats its Range requests).
- **Hosted-file requirements** (documented in the README and surfaced as the admin's `T.fileHint` when a file URL is pasted — keep all three in sync): the uploader must hold sharing rights (own work / licensed / public domain — the repo is publicly fetchable); `url` must be https in production (mixed content; schema accepts http for dev), publicly fetchable, on a host answering Range requests with 206 (seeking; Safari may refuse without it). Formats: MP3, M4A/AAC, FLAC, WAV play everywhere; Ogg Vorbis/Opus/WebM lack older-Safari support; live streams play with duration 0 (`normalizeDuration`).
- **Local dev tape**: drop audio files into `local-audio/` (gitignored) and open `?tape=local` — `serveLocalTape()` in vite.config.js generates `/playlists/local.json` from the directory listing (absolute URLs from the request Host, so tunnels work) and serves `/local-audio/*` with 206 Range support. Pure helpers (`buildLocalTape`, `trackMetaFromFilename` — `Artist - Title.ext` convention, leading track numbers stripped — `isLocalAudioFile`, `localAudioType`) live in `src/local-tape.js`, node-side like `sw-build.js`. First 12 files (schema cap), natural sort; empty dir falls through to the ordinary failed-fetch path (player keeps its tape). Dev only — builds never see it, and the player needs no special casing because `?tape=local` is just a tape fetch.

### Adding a source (incl. the licensed-embed family)

New file under `src/sources/` implementing the contract + entry in `registry.js` + id/caps in `ids.js` + tests + this section, one commit. For Spotify iframe / Apple MusicKit later: caps `{ hiddenPlayback: false, fullPlayback: false, cueable: false, needsTransientPauseGuard: false }` — `hiddenPlayback: false` means main.js must reveal a visible widget container (mount it next to `#bar`; their ToS forbid hiding, which is exactly the YouTube gray area this seam de-risks); `fullPlayback: false` drives a preview badge in the now-playing area; progress arrives as SDK callbacks, so the controller caches the last event to keep `getCurrentTime()` a sync read; the SDK loads via an eager `prepare()` at startup. Track shape `{ source: 'spotify', id: <provider-native id> }` — which is why file tracks use `url`, never `id`.

## Data model

- `playlists/index.json` — `{ active: string, ids: string[], published?: string[] }` (`published` = the library drawer's tapes in display order, each id also in `ids`; editorial curation only — every playlist JSON is deployed and publicly fetchable regardless)
- `playlists/{id}.json` — `{ title, color, tracks, created?, lastEdited?, viz?, location? }` (`viz` = visualization id; omitted when it's the default `mesh`). Track: `{ id, title, artist }` (YouTube — `source` omitted) or `{ source: "file", url, title, artist }`; sources mix freely. `buildConfig` emits all-YouTube tapes byte-identically to pre-source builds.
- `config.js` — generated from active playlist by `buildConfig()`; loaded at parse-time as `window.TAPE` (the baked-in tape; main.js may hot-swap the *displayed* tape from `playlists/{id}.json` via the drawer or `?tape=<id>`)

## Auth

PBKDF2, 200k iterations, random 16-byte salt per user. Stored as `muxtape-admin-salt` + `muxtape-admin-hash` in localStorage. GitHub token in sessionStorage only (lost on tab close). Legacy SHA-256 hashes (no salt) are automatically migrated to re-setup on next login.

## Constraints

- Max 12 tracks per playlist (enforced in admin UI and schema validation)
- No TypeScript — use JSDoc if type clarity is needed
- No additional runtime dependencies without good reason
