// Neon Lissajous scope — a phosphor beam tracing generative Lissajous
// figures on a dark tube. The beam IS the live bg color (invariant 1).
// Figures morph between coprime frequency pairs every 30 s; a track change
// advances the figure. Tilt skews the curve in pseudo-3D by each point's
// depth; a tap sends a brightness pulse traveling along the trace.
//
// The polyline is computed in JS each frame (house pattern: positions come
// from JS, never in-shader trig) and uploaded as a vec2 array — the shader
// only does segment distances.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const SCOPE_PAIRS = [[1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6]];
export const SCOPE_SEGMENTS = 80;
export const FIGURE_HOLD = 30;   // seconds per figure (divides 3600)
export const FIGURE_MORPH = 4;   // morph duration at each boundary
export const HEAD_PERIOD = 12;   // beam-head loop (divides 3600)
export const PULSE_SPEED = 0.15; // tap pulse, revolutions/s
export const PULSE_LIFE = 3;
export const SCOPE_TILT_GAIN = 0.13; // depth-skew offset at full tilt

const TAU_JS = Math.PI * 2;
const fract = v => v - Math.floor(v);
const mod6 = v => ((v % 6) + 6) % 6;

export function pickLissajousPair(seed, idx) {
  return SCOPE_PAIRS[mod6(Math.floor(seed * 7.31) + idx)];
}

// Which figure is showing at time t, and how far through the boundary
// morph we are (1-cos eased). Continuous across boundaries — and across
// the hourly clock wrap, since pickLissajousPair is periodic in idx.
export function figureMorph(t, seed, offset = 0) {
  const idx = Math.floor(t / FIGURE_HOLD) + offset;
  const u = t - Math.floor(t / FIGURE_HOLD) * FIGURE_HOLD;
  const mix = u >= FIGURE_MORPH ? 1 : 0.5 - 0.5 * Math.cos((u / FIGURE_MORPH) * Math.PI);
  return { idx, pairA: pickLissajousPair(seed, idx - 1), pairB: pickLissajousPair(seed, idx), mix };
}

// The figure polyline: SCOPE_SEGMENTS+1 screen-space points (aspect-space),
// morph-blended between the two frequency pairs and skewed by tilt through
// each point's depth z = sin(2s + δ).
export function scopePoints(t, seed, aspect, tiltX, tiltY, offset, out = null) {
  const data = out || new Float32Array((SCOPE_SEGMENTS + 1) * 2);
  const { pairA, pairB, mix } = figureMorph(t, seed, offset);
  const delta = TAU_JS * fract(seed * 0.37);
  const sx = 0.36 * aspect;
  const sy = 0.36;
  for (let i = 0; i <= SCOPE_SEGMENTS; i++) {
    const s = TAU_JS * i / SCOPE_SEGMENTS;
    const xa = Math.sin(pairA[0] * s + delta);
    const ya = Math.sin(pairA[1] * s);
    const xb = Math.sin(pairB[0] * s + delta);
    const yb = Math.sin(pairB[1] * s);
    const z = Math.sin(2 * s + delta * 1.7);
    data[i * 2] = 0.5 * aspect + sx * (xa + (xb - xa) * mix) + z * tiltX * SCOPE_TILT_GAIN;
    data[i * 2 + 1] = 0.5 + sy * (ya + (yb - ya) * mix) + z * tiltY * SCOPE_TILT_GAIN;
  }
  return data;
}

const frag = PRELUDE + `
#define SEGS ${SCOPE_SEGMENTS}

uniform vec2 u_curve[SEGS + 1]; // polyline in aspect-space (from JS)
uniform float u_head;           // beam head position along s, 0..1
uniform float u_beamSlot;       // palette slot of the beam (pride cycling)

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Geometry from the minimum segment distance (one smooth line, no seam
  // double-counts); brightness from a distance-weighted AVERAGE over nearby
  // segments — where strands cross or the nearest branch flips, the head/
  // pulse brightness blends instead of jumping.
  float dMin2 = 1e3;
  float wSum = 1e-6;
  float brSum = 0.0;
  for (int i = 1; i <= SEGS; i++) {
    vec2 a = u_curve[i - 1];
    vec2 e = u_curve[i] - a;
    vec2 w = p - a;
    float h = clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
    vec2 dv = w - e * h;
    float d2 = dot(dv, dv);
    dMin2 = min(dMin2, d2);
    if (d2 > 0.03) continue; // beyond glow influence

    // Phosphor persistence: bright at the sweeping head, decaying behind
    float sI = (float(i) - 1.0 + h) / float(SEGS);
    float behind = fract(u_head - sI);
    float br = 0.25 + 0.75 * exp(-behind * 5.0);

    // Tap pulses race along the trace
    for (int j = 0; j < BLOOM_SLOTS; j++) {
      vec4 b = u_blooms[j];
      float age = u_time - b.z;
      if (b.z < 0.0 || age < 0.0 || age > ${PULSE_LIFE.toFixed(1)}) continue;
      float s0 = fract(b.x + b.y * 3.7);
      float dd = abs(fract(sI - s0 - age * ${PULSE_SPEED.toFixed(2)} + 0.5) - 0.5);
      br += 2.5 * smoothstep(0.05, 0.0, dd) * exp(-age * 1.2);
    }

    float wgt = exp(-d2 * 400.0);
    wSum += wgt;
    brSum += wgt * br;
  }
  float br = brSum / wSum;

  // The tube: near-black field washed with the beam color
  vec3 beamCol = paletteAt(u_beamSlot);
  vec3 col = u_palette[1] + beamCol * 0.12;

  // Beam: tight core glow + wide halo, all in the beam color
  float glow = exp(-dMin2 * 2600.0);
  float halo = exp(-dMin2 * 60.0);
  col += beamCol * glow * br * 1.1;
  col += beamCol * halo * 0.22;
  // White-hot center where the beam is freshest (stays bright in pride)
  col += mix(vec3(1.0), paletteAt(4.0), 0.3) * smoothstep(0.55, 1.0, glow * br) * 0.7;

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'scope',
  name: 'Scope',
  frag,
  uniformSpec: {
    ...COMMON_UNIFORM_SPEC,
    u_curve: '2fv',
    u_head: '1f',
    u_beamSlot: '1f',
  },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // The beam cycles the pride spectrum per figure (u_beamSlot)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // the beam: live background
      hslToHex(h, Math.min(s * 0.5, 30), 6),       // tube field
      hslToHex(h, Math.min(s * 0.8, 60), 30),      // afterglow reserve
      hslToHex(h + 60, 90, 65),                    // pulse accent reserve
      hslToHex(h, 5, 95),                          // white-hot core
    ];
  },
  initState(seed) {
    return {
      seed,
      figureOffset: 0,
      curve: new Float32Array((SCOPE_SEGMENTS + 1) * 2),
    };
  },
  frame(state, ctx) {
    const pride = ctx.paletteCount >= 9;
    const { idx } = figureMorph(ctx.t, state.seed, state.figureOffset);
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_curve: scopePoints(ctx.t, state.seed, ctx.aspect, ctx.tiltX, ctx.tiltY, state.figureOffset, state.curve),
      u_head: fract(ctx.t / HEAD_PERIOD),
      u_beamSlot: pride ? 1 + (((idx % 8) + 8) % 8) : 0,
    };
  },
  // A new track advances to the next figure
  trackEvent(state, t) {
    state.figureOffset += 1;
  },
  eventLife: PULSE_LIFE,
};
