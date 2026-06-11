// Lava lamp — metaball wax blobs rising and falling through the live-bg
// "liquid". Tilt sloshes the wax toward gravity; a tap heats the nearest
// blob (it swells and drifts up) or splits a big one into a rising
// satellite; blooms render as faint heat-ripple rings.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const LAVA_BLOBS = 5;        // primary wax blobs
export const LAVA_SATS = 2;         // transient split-off slots
export const LAVA_SLOTS = LAVA_BLOBS + LAVA_SATS;
export const LAVA_R_BASE = 0.15;

// All periods divide 3600 (hourly shader-clock wrap)
export const LAVA_RISE_PERIODS = [120, 90, 144, 180, 72];
export const LAVA_X_PERIODS = [60, 80, 48, 90, 72];
export const LAVA_R_PERIODS = [30, 36, 40, 45, 60];

export const LAVA_HEAT_SWELL = 0.35; // radius gain at full heat
export const LAVA_HEAT_TAU = 3;      // seconds for the heat to dissipate
export const LAVA_HEAT_RISE = 0.25;  // upward drift of a heated blob
export const LAVA_SPLIT_R = 0.18;    // heated blobs above this split on tap
export const LAVA_SAT_LIFE = 8;      // satellite lifetime, seconds
export const LAVA_SAT_RISE = 0.05;   // satellite rise speed (units/s)
export const LAVA_TILT_GAIN = 0.25;

const TAU_JS = Math.PI * 2;
const fract = v => v - Math.floor(v);

// Heat decays exponentially; negative age (pre-heat or hourly wrap) = cold.
export function lavaHeatBoost(age) {
  return age < 0 ? 0 : Math.exp(-age / LAVA_HEAT_TAU);
}

// Nearest primary blob to (px, py) in aspect-space, within `reach` × its
// radius; -1 when nothing is close enough.
export function nearestBlob(blobs, px, py, reach = 2.5) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < LAVA_BLOBS; i++) {
    const r = blobs[i * 4 + 2];
    if (r <= 0) continue;
    const d = Math.hypot(px - blobs[i * 4], py - blobs[i * 4 + 1]);
    if (d <= r * reach && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Per-frame blob positions: slow sinusoidal rise/fall + lateral sway +
// radius breathing, squashed near the top/bottom, sloshed by tilt with
// per-blob parallax depth. Satellites rise from their split point and fade.
// Fills Float32Array of vec4(x, y, r, paletteSlot); r = 0 marks inactive.
export function computeLavaBlobs(t, seed, aspect, tiltX, tiltY, paletteCount, state, out) {
  const data = out || new Float32Array(LAVA_SLOTS * 4);
  const pride = paletteCount >= 9;
  for (let i = 0; i < LAVA_BLOBS; i++) {
    const ph1 = fract(seed * 0.317 + i * 0.618034) * TAU_JS;
    const ph2 = fract(seed * 0.731 + i * 0.754878) * TAU_JS;
    const depth = 0.7 + 0.5 * fract(seed * 0.521 + i * 0.829);
    const bx = 0.12 + 0.76 * fract(seed * 0.618034 + i * 0.618034);
    let y = 0.5 + 0.42 * Math.sin(TAU_JS * t / LAVA_RISE_PERIODS[i] + ph1);
    let x = bx * aspect + 0.08 * Math.sin(TAU_JS * t / LAVA_X_PERIODS[i] + ph2);
    let r = LAVA_R_BASE + 0.04 * Math.sin(TAU_JS * t / LAVA_R_PERIODS[i] + ph2);
    const boost = lavaHeatBoost(t - state.heat[i]);
    r *= 1 + LAVA_HEAT_SWELL * boost;
    y += Math.min(LAVA_HEAT_RISE, LAVA_HEAT_RISE * (t - state.heat[i])) * boost;
    x += tiltX * LAVA_TILT_GAIN * depth;
    y += tiltY * 0.12 * depth;
    r *= 1 - 0.2 * Math.min(Math.abs(y - 0.5) * 2, 1); // squash at extremes
    data[i * 4] = x;
    data[i * 4 + 1] = y;
    data[i * 4 + 2] = r;
    data[i * 4 + 3] = pride ? 1 + ((i * 3 + Math.floor(seed)) % 8) : 2 + (i % 2);
  }
  for (let k = 0; k < LAVA_SATS; k++) {
    const s = state.sats[k];
    const age = t - s.born;
    const o = (LAVA_BLOBS + k) * 4;
    if (s.born < 0 || age < 0 || age > LAVA_SAT_LIFE) {
      data[o + 2] = 0;
      continue;
    }
    data[o] = s.x + 0.03 * Math.sin(TAU_JS * age / 4) + tiltX * LAVA_TILT_GAIN;
    data[o + 1] = s.y + age * LAVA_SAT_RISE + tiltY * 0.12;
    // grow in fast, melt away over the last 2 seconds
    data[o + 2] = 0.07 * Math.min(1, age * 2) * Math.min(1, (LAVA_SAT_LIFE - age) / 2);
    data[o + 3] = s.slot;
  }
  return data;
}

const frag = PRELUDE + `
#define LAVA_SLOTS ${LAVA_SLOTS}

uniform vec4 u_blobs[LAVA_SLOTS]; // xy = aspect-space pos, z = radius, w = palette slot

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Faint heat shimmer warps the sample position
  vec2 sh = vec2(fbm(p * 3.0 + u_seed + u_time * 0.08),
                 fbm(p * 3.0 + u_seed + 4.7 - u_time * 0.08));
  vec2 sp = p + 0.015 * (sh - 0.5);

  // Metaball field; wax color = field-weighted blend of per-blob colors,
  // so merging blobs smear their hues into each other
  float f = 0.0;
  vec3 waxAcc = vec3(0.0);
  for (int i = 0; i < LAVA_SLOTS; i++) {
    vec4 b = u_blobs[i];
    if (b.z <= 0.0) continue;
    vec2 d = sp - b.xy;
    float c = b.z * b.z / (dot(d, d) + 1e-4);
    f += c;
    waxAcc += paletteAt(b.w) * c;
  }
  vec3 waxCol = waxAcc / max(f, 1e-4);

  // Liquid: the live bg, shaded darker toward the lamp's base
  vec3 col = u_palette[0] * mix(0.85, 1.05, uv.y);

  // Wax body with depth shading and a bright inner core
  float body = smoothstep(1.0, 1.18, f);
  vec3 wax = waxCol * mix(0.8, 1.3, smoothstep(1.0, 2.6, f));
  col = mix(col, wax, body);

  // Rim light hugging the surface threshold
  float rim = smoothstep(1.0, 1.06, f) - smoothstep(1.06, 1.3, f);
  col += mix(waxCol, vec3(1.0), 0.55) * rim * 0.45;

  // Heat-ripple rings (shared blooms, faint)
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > 8.0) continue;
    float d = length((uv - b.xy) * asp);
    float r = 0.05 + age * 0.08;
    float w = 0.02 + age * 0.02;
    float band = smoothstep(w, 0.0, abs(d - r));
    col += paletteAt(min(b.w, u_paletteCount - 1.0)) * band * 0.4 * exp(-age * 0.45);
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'lava',
  name: 'Lava',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_blobs: '4fv' },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Blob slots cycle the pride spectrum (set in computeLavaBlobs)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                          // liquid: live background
      hslToHex(h, Math.min(s * 0.9, 80), 10),         // deep shade (bloom tint)
      hslToHex(h + 25, Math.min(s * 1.2, 90), 38),    // wax, deep
      hslToHex(h + 40, 90, 60),                       // wax, bright
    ];
  },
  initState(seed) {
    return {
      seed,
      aspect: 1,
      heat: new Float64Array(LAVA_BLOBS).fill(-1e9),
      sats: Array.from({ length: LAVA_SATS }, () => ({ born: -1, x: 0, y: 0, slot: 3 })),
      blobs: new Float32Array(LAVA_SLOTS * 4),
    };
  },
  frame(state, ctx) {
    state.aspect = ctx.aspect;
    computeLavaBlobs(ctx.t, state.seed, ctx.aspect, ctx.tiltX, ctx.tiltY, ctx.paletteCount, state, state.blobs);
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_blobs: state.blobs,
    };
  },
  // Heat the blob under the finger; a big heated blob splits instead
  tap(state, x, y, t) {
    const i = nearestBlob(state.blobs, x * state.aspect, y);
    if (i < 0) return;
    if (state.blobs[i * 4 + 2] > LAVA_SPLIT_R) {
      const free = state.sats.find(s => s.born < 0 || t - s.born > LAVA_SAT_LIFE || t < s.born);
      if (free) {
        free.born = t;
        free.x = state.blobs[i * 4];
        free.y = state.blobs[i * 4 + 1];
        free.slot = state.blobs[i * 4 + 3];
        return;
      }
    }
    state.heat[i] = t;
  },
  // A new track stokes the biggest blob
  trackEvent(state, t) {
    let big = 0;
    for (let i = 1; i < LAVA_BLOBS; i++) {
      if (state.blobs[i * 4 + 2] > state.blobs[big * 4 + 2]) big = i;
    }
    state.heat[big] = t;
  },
  eventLife: 8,
};
