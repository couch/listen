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
- `src/visualizer.js` — DOM/lifecycle owner: overlay, ⊙ entry button, entry/exit fade (400 ms), gestures, rAF loop, track metadata corner, active/pending visualization state. Opens only during playback; closes on ×, Escape, pause, or playlist end. No fullscreen navigation gestures — swipes over the field are inert (taps bloom). The one navigation gesture is element-scoped: a horizontal touch swipe over the lower-left metadata block (`#viz-text`, enlarged hit area, `skipGesture`: ≥60 px travel, ≤40 px vertical drift, ≤600 ms) skips next (left) / previous (right) via the `onTrackSkip(dir)` callback `main.js` passes to `initVisualizer(reducedMotion, isPride, opts)` — same moves as the viz-open arrow keys. `frame(state, ctx)` receives `ctx = { t, dt, aspect, tiltX, tiltY, blooms, paletteData, paletteCount }` and returns the uniform values for its spec.
- **Crossfade between visualizations**: 600 ms (`VIZ_FADE_MS`), eased by `crossfadeAlpha`; outgoing viz renders opaque, incoming alpha-blends on top; both states step and both palettes follow the bg drift during the fade; outside transitions exactly one program runs. The incoming viz gets a fresh `initState(seed)` and a reset bloom buffer. Reduced motion: instant swap.
- **Shared event machinery** (visualizer.js, invariant 2 enforced centrally): `spawnEvent` always writes the `u_blooms[12]` ring buffer — each shader *reinterprets* those records in its own vocabulary — then calls the per-viz `tap()` hook (or `trackEvent()` on track change). `eventLife` = max bloom age the shader honors.
- **Picker** (`src/viz-picker.js`, DOM only): `#viz-picker` in the overlay's lower-right — a faint `⁘` toggle (`aria-expanded`, localized `L.vz` label) above a `role="radiogroup"` menu of visualization names (active = `●` + `aria-checked`). Hover-capable pointers: everything is hidden until the mouse enters the bottom-quarter reveal zone (`pickerRevealZone`, overlay `pointermove` adds `.picker-reveal`; 400 ms grace on leave; also visible on `:focus-within`). Touch: the toggle is always faintly present; the menu auto-hides after 6 s idle or an outside tap. First reveal calls `warmAll()` (preloads every viz chunk). Selecting calls `selectVisualization(id)`: persist → `ensureLoaded` → `beginTransition` crossfade; a failed chunk load or shader compile reverts the selection to what's running. Overlay tap/bloom gestures ignore `#viz-picker` (and `#viz-text`/`#viz-exit`).
- **Persistence**: selection priority is localStorage override > `TAPE.viz` (author default, set in the admin's chip picker) > `mesh` (`resolveVizSelection`; unknown ids fall through). The override lives in localStorage `muxtape-viz`, a JSON map `{ [playlistId]: vizId }` (key `'_'` when `TAPE.id` is absent), written on picker selection; all access is try/catch. `main.js` passes `tapeId`/`defaultViz` into `initVisualizer` and calls `preloadVizSelection()` when playback starts so a non-mesh selection's chunk is warm before the overlay opens; if it isn't (or its shader fails), the overlay opens with mesh and crossfades over when ready.
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

#### 2. Lava lamp (`src/viz/lava.js`)

Metaball wax in live-bg liquid. Playful, physical.

- **Rendering**: `u_blobs[7]` vec4 (x, y aspect-space, radius, palette slot) — 5 primary + 2 satellite slots (r = 0 inactive). Metaball field `f = Σ r²/(d²+1e-4)`; wax color = field-weighted blend of per-blob `paletteAt(slot)` colors so merging blobs smear hues; body `smoothstep(1.0, 1.18, f)` with inner-depth brightening (`mix(0.8, 1.3, smoothstep(1.0, 2.6, f))`); rim light band `smoothstep(1.0,1.06,f) − smoothstep(1.06,1.3,f)` in `mix(waxCol, white, 0.55)` × 0.45. Liquid = slot 0 verbatim × vertical shade (0.85→1.05). Heat-shimmer fbm warp (amp 0.015, t·0.08). Blooms = mesh-style rings at 0.4 gain (heat ripples). House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h, s·0.9, 10) shade, hsl(h+25, ≤90, 38) wax deep, hsl(h+40, 90, 60) wax bright]`; blob slots alternate 2/3. Pride: `[bg, …PRIDE_COLORS_VIZ[1..]]`, blob slots cycle 1–8 (chosen in `computeLavaBlobs` by `paletteCount ≥ 9`).
- **Motion** (`computeLavaBlobs(t, seed, aspect, tiltX, tiltY, paletteCount, state, out)`): rise/fall `y = 0.5 + 0.42·sin(TAU·t/RISE_i)`, RISE = [120, 90, 144, 180, 72]; sway amp 0.08, XP = [60, 80, 48, 90, 72]; radius breathe ±0.04 around `LAVA_R_BASE` 0.15, RP = [30, 36, 40, 45, 60]; squash ×(1−0.2·|y−0.5|·2) near extremes.
- **Tilt**: gravity slosh — `x += tiltX·LAVA_TILT_GAIN(0.25)·depth`, `y += tiltY·0.12·depth`, depth 0.7–1.2 seeded per blob.
- **Interaction**: tap → `nearestBlob` within 2.5r gets `heat[i] = t`; `lavaHeatBoost(age) = exp(−age/3)` swells radius ×(1+0.35·boost) and lifts (`LAVA_HEAT_RISE` 0.25). A heated blob over `LAVA_SPLIT_R` 0.18 **splits** instead: a satellite slot (r 0.07, parent's color) rises at `LAVA_SAT_RISE` 0.05/s and melts away over `LAVA_SAT_LIFE` 8 s. Track change (`trackEvent`) stokes the biggest blob. Taps in open liquid just ripple (shared bloom). `state.aspect` is cached in `frame()` for tap coordinate conversion.
- **Tuning knobs**: `LAVA_R_BASE` (wax amount), `LAVA_*_PERIODS` (speed), `LAVA_HEAT_*`/`LAVA_SPLIT_R`/`LAVA_SAT_*` (interaction feel), `LAVA_TILT_GAIN`, field thresholds 1.0/1.18 in the shader (wax surface tension).

#### 3. Rain on glass (`src/viz/rain.js`)

Bokeh lights behind a pane; beaded drops refract them as they run down. The gyro showcase.

- **Rendering**: re-sampleable `bgcol(p)` = slot 0 → slot 1 vertical dusk + `u_lights[6]` vec4(x, y, r, slot) Gaussian discs ×0.55. Three drop layers (`RAIN_LAYER_SCALES` [6, 9, 14]) in **gravity-rotated space**: per column, one falling drop cycles down (`fract(hash·13.7 − phase)`) with a sine wobble; in-drop refraction `off = d·RAIN_REFRACT(−1.6)·inside` re-samples `bgcol` inverted; specular dot upper-left; a `RAIN_TRAIL`(0.35)-long trail of shrinking static beads above the mover; static micro-droplets (scale 16) respawn on a 20 s hash era. **Each layer evaluates its two neighbor columns too — drops wobble wider than their cell and get sliced by the column boundary otherwise.** Guard degenerate `smoothstep(0,0,x)` when trail radii hit zero (NaN rectangles on some GPUs). Blooms = splats: expanding refractive ring + near-white rim sparkle, life `SPLAT_LIFE` 3 s. Wet areas brighten ×1.3; specular stays near-white via `mix(vec3(1), slot5, 0.4)` (pride slot 5 is dark). House breathing/vignette/dither.
- **Palette**: `[bg, hsl(h, s·0.8, 12) night, hsl(h+30, 80, 55), hsl(h−50, 70, 50), hsl(h+70, 85, 60) bokeh trio, hsl(h+10, 15, 85) specular]`; light slots 2–4. Pride: `[bg, …PRIDE_COLORS_VIZ[1..]]`, light slots cycle 1–8.
- **Motion**: `computeBokehLights` — Lissajous drift, periods `BOKEH_PERIODS` [90, 72, 120, 144, 60, 180] (x uses i, y uses i+2), radius breathing 45/36 s. **Fall phases integrate in JS** (`stepRainPhases`, dt clamped to 0.1 s) rather than deriving from `u_time`, so a changing tilt rate accelerates smoothly instead of teleporting drops; `RAIN_SPEEDS` [1/20, 1/12, 1/8] (×3600 all integer — wrap-safe).
- **Tilt**: `gravityFromTilt(tiltX)` → unit `u_gravity`, ±`RAIN_GRAV_GAIN` 0.6 rad off vertical — the whole drop field rotates so streaks run along gravity; `rainRate(tiltY)` = 1 + 0.5·|tiltY| multiplies fall speed (lean forward, rain runs faster).
- **Interaction**: tap/auto/track = splat via the shared bloom buffer only (no per-viz hooks).
- **Tuning knobs**: `RAIN_LAYER_SCALES`/`RAIN_SPEEDS` (density/speed), `RAIN_REFRACT` (lens strength), `RAIN_TRAIL`, `RAIN_GRAV_GAIN`/`RAIN_RATE_GAIN`, bokeh count/periods, dry-column threshold 0.22 and drop-size range in the shader.

#### 4. Aurora (`src/viz/aurora.js`)

Light curtains rippling over a dusk sky; the horizon glow is the live bg. Grand, ambient.

- **Rendering**: dusk gradient `mix(slot0, slot1, smoothstep(0.12, 0.75, y))` — slot 0 dominates the lower ~40% (invariant 1). Stars: 1/90 hash grid, threshold 0.985, **round soft points at jittered cell positions** (`exp(−d²·6)` in cell units — flat cell fills look like square confetti), twinkle on a 4 s hash era, upper-sky fade-in. Three additive curtain layers: centerline `h = 0.42 + i·0.12 + 0.22·(fbm(xs·1.6) − 0.5) + u_lift`, where `xs = x·1.5 + phase_i + wind·depth_i`; asymmetric band `exp(−dy²·200)` below / `exp(−dy²·25)` above (crisp base, long upward glow); fold/gap mask `0.1 + 0.9·vnoise(xs·1.1)²` (squared for contrast — without it the layers fuse into a fog wall); fine ray striations `0.5 + 0.5·vnoise(xs·26, y·2)`; layer gains 0.5/0.375/0.25. Blooms = **shimmer pulses**: gaussian patch (σx 0.12, σy 0.18) whose center rises at `SHIMMER_RISE` 0.25/s, ×(1+2·pulse) on curtain intensity, life `SHIMMER_LIFE` 6 s. House breathing/vignette/dither.
- **Palette**: `[bg horizon, hsl(h−30, ≤60, 9) dusk, hsl(h+90, 75, 55) curtain base, hsl(h+140, 65, 45) mid, hsl(h+60, 55, 70) fringe, hsl(h, 12, 92) stars]`; color climbs base→mid with height above the centerline + fringe ×0.5 higher. Pride (in-shader, `u_paletteCount > 8.5`): curtain hue cycles pride slots 1–8 along `xs·1.2 + t/45`, smooth-stepped between neighbors.
- **Motion**: `auroraPhases` — per-layer flow `seed·k_i + t/FLOW_i`, `AURORA_FLOW` [120, 90, 144] (hourly seam accepted, mesh-precedent). Wind `computeAuroraWind` = `WIND_AMP` 0.3 · sin(TAU·t/`WIND_PERIOD` 60) + tilt.
- **Tilt**: tiltX → wind sway (`AURORA_TILT_GAIN` 0.5, applied per layer ×depth 0.6/0.9/1.2); tiltY → `u_lift` = tiltY·`AURORA_LIFT_GAIN` 0.15 raises/lowers the curtains.
- **Interaction**: tap/auto/track = shimmer pulse via the shared bloom buffer (no per-viz hooks).
- **Tuning knobs**: `AURORA_FLOW` (ripple speed), band ks 200/25 (edge crispness/glow length), fold-mask floor 0.1 (gap depth), ray frequency 26, layer spacing 0.12, star grid/threshold, `WIND_*`/`AURORA_*` gains.

### Planned visualizations (Phase B — implement from these specs)

Each follows the standard recipe: file under `src/viz/<id>.js` + loader in `registry.js` + id/name in `ids.js` + `src/viz/<id>.test.js` (periods divide 3600, palette slot-0 verbatim normal AND pride, motion bounds/tilt monotonicity) + headless screenshot acceptance + its own subsection above, in one commit. Hard-won shader lessons that apply to all of them: guard degenerate `smoothstep(e0, e1, x)` when a radius can reach 0 (NaN rectangles); anything cell/grid-based whose feature can cross its cell boundary must evaluate neighbor cells; point features need jittered centers + radial falloff, never flat cell fills; integrate phases in JS when a tilt-driven rate multiplies a time-derived `fract()` (else features teleport).

- **Ink in water (`ink`)** — jazz/late-night. Bg = slot 0 + vignette. The shared bloom buffer IS the ink (`eventLife: 25`): per drop, plume density = fbm sampled along a rising curling path (`q = p − b.xy; q.y −= age·0.04; q += 0.2·age·curl` where curl = rotated pair of offset fbm reads), envelope widens (σ = 0.05 + 0.02·age) and dilutes (×exp(−age/18)); ink composites **multiplicatively** (absorption), `mix(palette[3] dilute, palette[1] ink, d)`. Palette: ink = hsl(h+180, 70, 22), dilute = hsl(h+180, 40, 55); pride: drop color = `paletteAt(b.w)`. Tap = drop at touch; auto/track = drop in the upper third. Tilt: `u_lean` vec2 (gain 0.4) added to the rise direction. Pure fns: lean mapping, age envelope (bounds, monotone dilution).
- **Incense ribbon (`incense`)** — piano/sparse. Bg slot 0, edges darkened toward slot 1; ember glow palette[4] at (0.5·aspect, 0.06). Ribbon centerline `cx(y) = 0.5·aspect + Σ₃ a_k·(0.2 + y²)·sin(TAU·t/P_k + y·w_k + seed)`, P = [45, 30, 20], a = [0.06, 0.04, 0.025], + fbm jitter (amp 0.02·y); glow `exp(−(x−cx)²·K(y))`, K 4000 (base) → 250 (top), brightness ×(1−0.6y), color ember-warm palette[4] → pale smoke palette[2] with height; faint second filament at +0.01. Tilt = draft: `cx += tiltX·0.5·y²` (top sways most). Tap = rising smoke ring: bloom rendered as soft ellipse annulus climbing 0.12/s, life 6 s; auto/track ring from the ember. Pure fns: phase array, draft (monotone in y).
- **Neon Lissajous (`scope`)** — electronic. Near-black palette[1] washed 12% slot 0; **the beam IS slot 0** (invariant 1) + slot-0 halo. Curve `0.5 + 0.38·(sin(a·s + δ), sin(b·s))`, depth `z = sin(c·s + φ)` modulates width/brightness; min-distance via a 48-segment constant loop; glow `exp(−d²·900)` + halo `exp(−d²·40)·0.25`; white-hot core where glow > 0.7; phosphor persistence falls off along s behind `u_head` (head loops every 12 s). Figures: coprime (a,b) ∈ {(1,2),(2,3),(3,4),(3,5),(4,5),(5,6)} via `pickLissajousPair(seed, idx)`; morph every 30 s with a 4 s 1−cos phase crossfade (`figureMorph(t)` → {pairA, pairB, mix}). Tilt: `u_rot` (gain 0.35): `x += z·rotX, y += z·rotY` (3D-ish parallax by depth). Tap = brightness pulse traveling along the trace from the tap angle (0.15 rev/s, life 3 s); track change advances the figure. Pure fns: coprimality, morph continuity at boundaries, head period.
- **Starfield warp (`stars`)** — soundtracks. Space = palette[1] + **nebula fbm wash tinted slot 0** (amp 0.35, scale 1.2, drift t/180) as the dominant chroma. 4 parallax layers (grid scales [8, 12, 18, 26]) recycling outward from vanishing point `u_vp` via shell zoom `fract(t/P_i)`, P = [90, 60, 45, 36] (all ×3600 integer); stars = soft points + radial streaks ×(1 + 3·layerSpeed); some warm-tinted palette[3]. Tilt **steers the camera**: `u_vp = center + tilt·0.3·halfscreen` (`vpFromTilt`, clamped). Tap = comet: bright head + tapering tail along the outward ray through the tap, travels 0.3/s, life 4 s, palette[4]; auto/track = comet. Pure fns: vpFromTilt bounds, shell-wrap continuity.
- **Paper topography (`topo`)** — folk. Paper = **slot 0 verbatim** + grain (IGN ×2.5 + fiber fbm scale 30, amp 0.02). Elevation `e = fbm(p·2 + u_drift) + Σ bloom hills`; contour lines `1 − smoothstep(0, 0.045, |fract(e·12) − 0.5|·2)` (fixed width — hand-drawn look, no derivatives ext), every 5th an index line ×1.8 darker; ink palette[1]/[2] at 0.55 alpha; hypsometric tint `mix(palette[3], palette[4], e)` at 8%. Drift `topoDriftOffsets(t, seed)`: two sine components, periods 180/240, amp 0.15 — the landscape slowly remolds. Tilt = 2.5D parallax: `p += u_tilt·0.08·e` (high ground shifts more). Tap = **new peak**: gaussian hill with grow-then-erode envelope over 12 s (`peakEnvelope(age)`: 0 at both ends) — contour rings bloom outward as it grows. Pure fns: drift periodicity, peak envelope shape.
- **Underwater caustics (`caustics`)** — chill. Water = slot 0 (sunlit upper, dominant) → palette[1] deep at bottom. Caustic web = product of two ridged-noise layers `pow(1 − |2·vnoise(p·3.5·k_i + scroll_i·t) − 1|, 3)`, ×2.5, scroll speeds **1/45 and 1/60** (×3600 integer — 1/56 et al. are wrap-unsafe), depth-attenuated ×(1 − 0.6·(1−y)); pale palette[2], additive. God rays along sun direction `u_sun` in palette[3], fading toward the bottom. Swell breathing 31/47 s (house periods). Tilt moves the sun: `sunFromTilt(tiltX)` ±0.4 rad off vertical; sampling skews `p += sun·(1−y)·0.1` (light bends with depth). Tap = ripple ring: expanding ring that radially displaces caustic sampling + bright rim, life 5 s. Pure fns: sun rest position/clamp.
- **Kaleidoscope mandala (`kaleido`)** — pop/funk. **Needs the frame-feedback extension below; build it last.** Feedback pass: `col = mix(palette[0]·0.12, sample(u_prevFrame, wedgeMirror(rotate(zoom(p, 1.01), precess))), 0.985) + sparks` — the decay floor is **bg-tinted, not black** (invariant 1). `wedgeMirror` folds the angle into TAU/k and mirrors; k ∈ {6, 8, 10, 12}, stepped per track (`kFor(trackIdx)`); precession = TAU·t/240 + tiltX·0.3 (tilt precesses the symmetry axis). Sparks: 2–4/s additive gaussian dots at scheduled radius/angle (`sparkSchedule(t, seed)`, radius orbit period 45 s), colors palette[2..5] / pride cycle. Tap **re-seeds**: 0.5 s at decay 0.80 (fast clear) + 12-spark burst at the tap radius (k-fold mirrored automatically); auto = spark burst. Reduced motion: feedback disabled — single-pass k-fold mirrored radial fbm flower at t=30. Pure fns: schedule determinism, kFor membership, precession period.

**Frame-feedback extension to viz-gl (for kaleido; design settled, not yet built):** `registerProgram(id, frag, spec, { feedback: true })`. When the active program has it: lazily allocate two RGBA/UNSIGNED_BYTE textures + FBOs at canvas size (LINEAR, CLAMP_TO_EDGE, no mips — NPOT-safe on webgl1) and one shared "present" program (blit + IGN dither). Render becomes: viz pass into the write-FBO with `u_prevFrame` = read texture (new spec tag `'tex'` → `uniform1i(loc, 0)`), swap, then present to the default framebuffer — `u_fade`/blend apply at the present draw, so **crossfade works unchanged**. `resize` reallocates (image re-converges in <1 s); context restore drops and lazily reallocates. The Phase A API needs no rework.

## Data model

- `playlists/index.json` — `{ active: string, ids: string[] }`
- `playlists/{id}.json` — `{ title, color, tracks, created?, lastEdited?, viz?, location? }` (`viz` = visualization id; omitted when it's the default `mesh`)
- `config.js` — generated from active playlist by `buildConfig()`; loaded at parse-time as `window.TAPE`

## Auth

PBKDF2, 200k iterations, random 16-byte salt per user. Stored as `muxtape-admin-salt` + `muxtape-admin-hash` in localStorage. GitHub token in sessionStorage only (lost on tab close). Legacy SHA-256 hashes (no salt) are automatically migrated to re-setup on next login.

## Constraints

- Max 12 tracks per playlist (enforced in admin UI and schema validation)
- No TypeScript — use JSDoc if type clarity is needed
- No additional runtime dependencies without good reason
