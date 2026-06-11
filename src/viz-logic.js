// Pure logic for the WebGL visualizer — palette math, bloom ring buffer,
// gesture classification, canvas sizing. No DOM, no GL; fully unit-testable.

import { hexToHsl, hslToHex, smootherstep } from './utils.js';

export const VIZ_PALETTE_SLOTS = 9;   // fixed uniform array size in the shader
export const VIZ_BLOOM_SLOTS = 12;    // fixed bloom uniform array size

export const PRIDE_COLORS_VIZ = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];

// Mesh-gradient palette derived from the playlist background color.
// Slot 0 is the input hex verbatim — it tracks the live drifting --bg so the
// visualizer is color-continuous with the page behind it. The rest span a
// wide luminance range (deep shadow to near-white glow); same-lightness hue
// variants are what made the old field read as uniform mid-tone lava.
export function buildVizPalette(bgHex) {
  const [h, s] = hexToHsl(bgHex);
  return [
    bgHex,                                        // anchor: live background
    hslToHex(h - 30, Math.min(s * 1.1, 85), 14),  // deep dark
    hslToHex(h - 55, Math.min(s * 1.15, 85), 42), // mid cool
    hslToHex(h + 25, Math.min(s * 1.2, 88), 52),  // mid warm
    hslToHex(h + 60, Math.min(s * 1.3, 90), 48),  // saturated accent
    hslToHex(h + 10, 14, 88),                     // near-white highlight
  ];
}

// Roles by palette slot (6-color derived palette only)
export const SITE_DARK = 1;
export const SITE_HIGHLIGHT = 5;

// Gaussian falloff per site: tighter = smaller, more defined region.
// Too broad and the normalized blend averages everything into one flat wash.
export const FALLOFF_COLOR = 9;
export const FALLOFF_HIGHLIGHT = 13;
export const FALLOFF_DARK = 5.5;

// Site motion. All periods divide 3600 so the hourly shader-clock wrap in
// vizTime() is seamless; pairwise-distinct periods never phase-lock.
export const SITE_PERIODS = [60, 48, 45, 40, 36, 30, 72, 90, 120];
export const EPI_PERIODS = [12, 10, 9, 8, 15, 18, 20, 24, 16];
export const AMP_PRIMARY = 0.3;
export const AMP_EPI = 0.06;
export const TILT_GAIN = 0.18;

const TAU_JS = Math.PI * 2;
const fract = v => v - Math.floor(v);

// Per-frame site positions: seeded golden-ratio scatter + two incommensurate
// orbits (slow primary, fast epicycle) + tilt offset with per-site parallax
// depth so layers slide unequally, like liquid of different weights.
// Returns/fills Float32Array of vec3(x, y, falloff) in aspect-space.
export function computeSites(tSec, seed, count, aspect, tiltX = 0, tiltY = 0, out = null) {
  const data = out || new Float32Array(VIZ_PALETTE_SLOTS * 3);
  const n = Math.min(count, VIZ_PALETTE_SLOTS);
  const derived = count === 6; // 6-color palette has dark/highlight roles
  for (let i = 0; i < n; i++) {
    // Stable scattered base layout
    let bx = 0.15 + 0.7 * fract(seed * 0.618034 + i * 0.618034);
    let by = 0.15 + 0.7 * fract(seed * 0.754878 + i * 0.754878);
    if (derived && i === SITE_HIGHLIGHT) { bx = 0.55 + 0.25 * bx; by = 0.55 + 0.25 * by; } // glow sits upper-center-right
    const ph1 = fract(seed * 0.291 + i * 0.391) * TAU_JS;
    const ph2 = fract(seed * 0.137 + i * 0.831) * TAU_JS;
    const px = SITE_PERIODS[i % SITE_PERIODS.length];
    const py = SITE_PERIODS[(i + 3) % SITE_PERIODS.length];
    const pe = EPI_PERIODS[i % EPI_PERIODS.length];
    const depth = 0.6 + 0.5 * fract(seed * 0.317 + i * 0.829);
    let x = bx * aspect
      + AMP_PRIMARY * Math.sin(TAU_JS * tSec / px + ph1)
      + AMP_EPI * Math.sin(TAU_JS * tSec / pe + ph2)
      + tiltX * TILT_GAIN * depth;
    let y = by
      + AMP_PRIMARY * Math.cos(TAU_JS * tSec / py + ph2)
      + AMP_EPI * Math.cos(TAU_JS * tSec / pe + ph1)
      + tiltY * TILT_GAIN * depth;
    data[i * 3] = x;
    data[i * 3 + 1] = y;
    data[i * 3 + 2] = derived && i === SITE_HIGHLIGHT ? FALLOFF_HIGHLIGHT
      : derived && i === SITE_DARK ? FALLOFF_DARK
      : FALLOFF_COLOR;
  }
  for (let i = n * 3; i < data.length; i++) data[i] = 0;
  return data;
}

// ── Tilt physics ──────────────────────────────────────────────────────────
// Under-damped spring chasing the device's deviation from a slow-adapting
// baseline (the resting pose). Hold the device still and the baseline catches
// up, the target decays to zero, and — because tilt is purely additive to the
// autonomous orbits — the field organically resumes its own drift. Heavy
// stiffness + sub-critical damping give the thick-gel overshoot.
export const TILT_STIFFNESS = 14;
export const TILT_DAMPING = 6;
export const TILT_BASE_TAU = 3.5;

export function createTiltState() {
  return { x: 0, y: 0, vx: 0, vy: 0, baseX: 0, baseY: 0, rawX: 0, rawY: 0, hasInput: false };
}

export function setTiltInput(state, nx, ny) {
  state.rawX = nx;
  state.rawY = ny;
  state.hasInput = true;
}

const clamp1 = v => Math.max(-1, Math.min(1, v));

export function stepTilt(state, dtSec) {
  if (!state.hasInput) return state;
  const dt = Math.min(Math.max(dtSec, 0), 0.05); // stability clamp for stalled frames
  const a = 1 - Math.exp(-dt / TILT_BASE_TAU);
  state.baseX += (state.rawX - state.baseX) * a;
  state.baseY += (state.rawY - state.baseY) * a;
  const tx = clamp1(state.rawX - state.baseX);
  const ty = clamp1(state.rawY - state.baseY);
  state.vx += (TILT_STIFFNESS * (tx - state.x) - TILT_DAMPING * state.vx) * dt;
  state.vy += (TILT_STIFFNESS * (ty - state.y) - TILT_DAMPING * state.vy) * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  return state;
}

// Map deviceorientation beta/gamma (degrees) to screen-space tilt, ±1 at
// ±45°, remapped for the current screen.orientation.angle.
export function normalizeTilt(beta, gamma, orientationAngle = 0) {
  const b = clamp1((beta || 0) / 45);
  const g = clamp1((gamma || 0) / 45);
  switch (((orientationAngle % 360) + 360) % 360) {
    case 90: return [b, g];
    case 180: return [-g, b];
    case 270: return [-b, -g];
    default: return [g, -b]; // portrait: gamma rolls left/right, beta pitches
  }
}

// sRGB hex → linear-light RGB floats. The shader mixes colors in linear
// space (then re-encodes), which avoids muddy gradient midpoints.
export function hexToLinearRgb(hex) {
  const h = hex.trim().replace('#', '');
  return [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map(ch => {
    const c = parseInt(ch, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
}

// Pack palette hexes into a fixed-size vec3 uniform array (zero-padded).
export function paletteToUniform(hexes) {
  const data = new Float32Array(VIZ_PALETTE_SLOTS * 3);
  const count = Math.min(hexes.length, VIZ_PALETTE_SLOTS);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = hexToLinearRgb(hexes[i]);
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  return { data, count };
}

// Bloom ring buffer: each slot is vec4(x, y, startTime, paletteSeed).
// startTime = -1 marks an inactive slot; oldest blooms are overwritten.
export function createBloomState(capacity = VIZ_BLOOM_SLOTS) {
  const data = new Float32Array(capacity * 4);
  for (let i = 0; i < capacity; i++) data[i * 4 + 2] = -1;
  return { data, cursor: 0, capacity };
}

export function addBloom(state, x, y, timeSec, seed) {
  const o = state.cursor * 4;
  state.data[o] = x;
  state.data[o + 1] = y;
  state.data[o + 2] = timeSec;
  state.data[o + 3] = seed;
  state.cursor = (state.cursor + 1) % state.capacity;
}

export function resetBlooms(state) {
  for (let i = 0; i < state.capacity; i++) state.data[i * 4 + 2] = -1;
  state.cursor = 0;
}

// Clamped playback ratio for the metadata progress ring.
export function progressRatio(currentTime, duration) {
  return duration > 0 ? Math.min(currentTime / duration, 1) : 0;
}

// Idle self-play: a generative bloom is due when nothing has bloomed lately.
export function autoBloomDue(lastBloomTime, nowSec, intervalSec) {
  return nowSec - lastBloomTime >= intervalSec;
}

// Render at 0.6× of (DPR-capped) CSS resolution — the content is all soft
// gradients, so the downscale is invisible and fragments cost ~3× less.
export function computeCanvasSize(cssW, cssH, dpr) {
  const scale = Math.min(dpr || 1, 2) * 0.6;
  return {
    w: Math.max(1, Math.round(cssW * scale)),
    h: Math.max(1, Math.round(cssH * scale)),
  };
}

// Classify a pointer down→up pair: a quick small-movement tap spawns a
// bloom, anything else is ignored. No fullscreen navigation gestures —
// swipes over the open field must never trigger a UI change.
export function tapGesture(downX, downY, upX, upY, durationMs) {
  const dx = upX - downX;
  const dy = upY - downY;
  if (Math.hypot(dx, dy) < 12 && durationMs < 500) return 'bloom';
  return null;
}

// Horizontal swipe scoped to the metadata block: left = next track,
// right = previous (content follows the finger).
export const SKIP_MIN_DX = 60;
export const SKIP_MAX_DY = 40;
export const SKIP_MAX_MS = 600;

export function skipGesture(downX, downY, upX, upY, durationMs) {
  const dx = upX - downX;
  const dy = upY - downY;
  if (durationMs > SKIP_MAX_MS || Math.abs(dy) > SKIP_MAX_DY || Math.abs(dx) < SKIP_MIN_DX) return null;
  return dx < 0 ? 'next' : 'prev';
}

// ── Visualization switching ───────────────────────────────────────────────

export const VIZ_FADE_MS = 600;

// Eased 0→1 progress of a visualization crossfade.
export function crossfadeAlpha(elapsedMs, durationMs = VIZ_FADE_MS) {
  if (durationMs <= 0) return 1;
  return smootherstep(Math.max(0, Math.min(elapsedMs / durationMs, 1)));
}

// Selection priority: listener override (localStorage) > author default
// (TAPE.viz) > mesh. Unknown ids fall through at each level.
export function resolveVizSelection(storedId, tapeViz, validIds, fallback = 'mesh') {
  if (validIds.includes(storedId)) return storedId;
  if (validIds.includes(tapeViz)) return tapeViz;
  return fallback;
}

// Desktop picker reveal: pointer hovering in the bottom quarter of the screen.
export function pickerRevealZone(clientY, innerHeight) {
  return clientY >= innerHeight * 0.75;
}
