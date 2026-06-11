// Pure logic shared by every visualization — palette packing, bloom ring
// buffer, tilt physics, gesture classification, canvas sizing, selection
// resolution. No DOM, no GL; fully unit-testable. Per-visualization logic
// (palette derivation, motion models) lives with each entry in src/viz/.

import { smootherstep } from './utils.js';

export const VIZ_PALETTE_SLOTS = 9;   // fixed uniform array size in the shader
export const VIZ_BLOOM_SLOTS = 12;    // fixed bloom uniform array size

export const PRIDE_COLORS_VIZ = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];

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
