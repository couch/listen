// Pure logic for the WebGL visualizer — palette math, bloom ring buffer,
// gesture classification, canvas sizing. No DOM, no GL; fully unit-testable.

import { hexToHsl, hslToHex } from './utils.js';

export const VIZ_PALETTE_SLOTS = 9;   // fixed uniform array size in the shader
export const VIZ_BLOOM_SLOTS = 12;    // fixed bloom uniform array size

export const PRIDE_COLORS_VIZ = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];

// Hue-spread palette derived from the playlist background color.
export function buildVizPalette(bgHex) {
  const [h, s, l] = hexToHsl(bgHex);
  const offsets = [-25, -15, -5, 0, 10, 20, 30];
  return offsets.map((offset, i) =>
    hslToHex(h + offset, Math.min(s * 1.15, 85), Math.max(30, Math.min(l + (i % 3 - 1) * 10, 65)))
  );
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

// Classify a pointer down→up pair: downward swipe closes the visualizer,
// a quick small-movement tap spawns a bloom, anything else is ignored.
export function tapGesture(downX, downY, upX, upY, durationMs) {
  if (upY - downY > 80) return 'close';
  const dx = upX - downX;
  const dy = upY - downY;
  if (Math.hypot(dx, dy) < 12 && durationMs < 500) return 'bloom';
  return null;
}
