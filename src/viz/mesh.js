// Mesh gradient — the default visualization. iOS-wallpaper-style soft color
// field: moving color sites blended with normalized Gaussian weights over a
// domain-warped field, mixed in linear RGB, plus additive expanding bloom
// rings (Eno Bloom). Gaussian blending + linear mixing + dithering keep the
// field free of hard edges and banding.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ, VIZ_PALETTE_SLOTS } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

// Palette derived from the playlist background color. Slot 0 is the input
// hex verbatim — it tracks the live drifting --bg so the visualizer is
// color-continuous with the page behind it. The rest span a wide luminance
// range (deep shadow to near-white glow); same-lightness hue variants are
// what made the old field read as uniform mid-tone lava.
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

const frag = PRELUDE + `
uniform vec3 u_sites[PALETTE_SLOTS]; // xy = position (aspect-space), z = falloff

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Mild domain warp keeps the color regions organic, not circular blobs
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.4 + u_seed + t * 0.31), fbm(p * 1.4 + u_seed + 7.3 - t * 0.27));
  vec2 wp = p + 0.35 * (q - 0.5);

  // Mesh gradient: normalized Gaussian blend over moving color sites, mixed
  // in linear RGB. Smooth everywhere — no level-set contours, no hard edges.
  // A tiny ambient weight on the anchor color keeps the far field on the
  // live page background instead of underflowing to black.
  vec3 acc = u_palette[0] * 1e-4;
  float wsum = 1e-4;
  for (int i = 0; i < PALETTE_SLOTS; i++) {
    if (float(i) >= u_paletteCount) break;
    vec2 d = wp - u_sites[i].xy;
    float w = exp(-min(dot(d, d) * u_sites[i].z, 16.0));
    acc += u_palette[i] * w;
    wsum += w;
  }
  vec3 col = acc / wsum;

  // Bloom rings: expanding, decaying, additive
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > 8.0) continue;
    float d = length((uv - b.xy) * asp);
    float r = 0.05 + age * 0.08;
    float w = 0.02 + age * 0.02;
    float band = smoothstep(w, 0.0, abs(d - r));
    float fill = smoothstep(r, 0.0, d) * 0.25;
    col += paletteAt(min(b.w, u_paletteCount - 1.0)) * (band + fill) * exp(-age * 0.45);
  }

  // Breathing luminance + faint vignette — the field stays bright to the edges
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'mesh', // the id is persisted (localStorage, playlist viz field) — only the display name is Bloom
  name: 'Bloom',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_sites: '3fv' },
  // Pride keeps its fixed spectrum but slot 0 still tracks the live bg
  buildPalette(bgHex, isPride) {
    return isPride ? [bgHex, ...PRIDE_COLORS_VIZ.slice(1)] : buildVizPalette(bgHex);
  },
  initState(seed) {
    return { seed, sites: new Float32Array(VIZ_PALETTE_SLOTS * 3) };
  },
  frame(state, ctx) {
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_sites: computeSites(ctx.t, state.seed, ctx.paletteCount, ctx.aspect, ctx.tiltX, ctx.tiltY, state.sites),
    };
  },
  eventLife: 8,
};
