// Paper topography — hand-drawn contour lines of a slowly remolding
// landscape on live-bg paper. Tilt parallaxes by elevation (high ground
// shifts more — a 2.5D pop); a tap raises a new peak that grows and
// erodes, its contour rings blooming outward.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const TOPO_DRIFT_PERIODS = [180, 240]; // divide 3600
export const TOPO_DRIFT_AMP = 0.15;
export const TOPO_CONTOURS = 12;     // contour bands per unit elevation
export const TOPO_TILT_GAIN = 0.08;  // parallax shift at full tilt × elevation
export const PEAK_LIFE = 12;
export const PEAK_HEIGHT = 0.45;     // in elevation units
export const PEAK_SIGMA = 0.16;

const TAU_JS = Math.PI * 2;

// The landscape slowly remolds: the elevation field's sample offset drifts
// on two slow sines.
export function topoDriftOffsets(t, seed, out = null) {
  const data = out || new Float32Array(2);
  data[0] = TOPO_DRIFT_AMP * Math.sin(TAU_JS * t / TOPO_DRIFT_PERIODS[0] + seed * 1.3);
  data[1] = TOPO_DRIFT_AMP * Math.sin(TAU_JS * t / TOPO_DRIFT_PERIODS[1] + seed * 2.7);
  return data;
}

// A tapped peak grows in, then erodes away: 0 at birth and at PEAK_LIFE.
export function peakEnvelope(age) {
  if (age <= 0 || age >= PEAK_LIFE) return 0;
  const grow = Math.min(age / 4, 1);
  const erode = Math.min((PEAK_LIFE - age) / 4, 1);
  return grow * grow * (3 - 2 * grow) * erode * erode * (3 - 2 * erode);
}

const frag = PRELUDE + `
uniform vec2 u_drift;
uniform vec2 u_tilt;

// Elevation: drifting fbm landscape + transient tapped peaks (the blooms)
float elevation(vec2 p) {
  float e = fbm(p * 2.0 + u_seed + u_drift);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${PEAK_LIFE.toFixed(1)}) continue;
    float grow = smoothstep(0.0, 4.0, age);
    float erode = smoothstep(0.0, 4.0, ${PEAK_LIFE.toFixed(1)} - age);
    vec2 d = (vec2(p.x, p.y) - vec2(b.x * (u_resolution.x / u_resolution.y), b.y));
    e += ${PEAK_HEIGHT.toFixed(2)} * grow * erode
       * exp(-dot(d, d) / (${PEAK_SIGMA.toFixed(2)} * ${PEAK_SIGMA.toFixed(2)}));
  }
  return e;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Tilt parallax: high ground shifts more (2.5D pop). The base elevation
  // decides the shift, then the shifted field is what gets drawn.
  float e0 = elevation(p);
  float e = elevation(p + u_tilt * ${TOPO_TILT_GAIN.toFixed(2)} * e0);

  // Paper: the live bg verbatim + fiber grain
  vec3 col = u_palette[0];
  col *= 1.0 + 0.02 * (fbm(p * 30.0 + u_seed) - 0.5) * 2.0;

  // Hypsometric tint, very subtle (pride: bands cycle the spectrum slots 3-8)
  bool pride = u_paletteCount > 8.5;
  if (pride) {
    col = mix(col, paletteAt(3.0 + mod(floor(e * 6.0), 6.0)), 0.06);
  } else {
    col = mix(col, mix(paletteAt(3.0), paletteAt(4.0), clamp(e, 0.0, 1.0)), 0.08);
  }

  // Contour lines: fixed-width bands of the fractional elevation —
  // hand-drawn look, no derivatives extension needed
  float band = abs(fract(e * ${TOPO_CONTOURS.toFixed(1)}) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.0, 0.09, band);
  float bandIdx = abs(fract(e * ${TOPO_CONTOURS.toFixed(1)} / 5.0) - 0.5) * 2.0;
  float index = 1.0 - smoothstep(0.0, 0.035, bandIdx);

  col = mix(col, paletteAt(1.0), line * 0.45);
  col = mix(col, paletteAt(2.0), index * 0.55);

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  // Heavier grain dither: paper tooth
  vec3 outCol = dither(toSrgb(col), 2.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'topo',
  name: 'Topo',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_drift: '2f', u_tilt: '2f' },
  buildPalette(bgHex, isPride) {
    const [h, s, l] = hexToHsl(bgHex);
    if (isPride) {
      // Inks stay bg-derived so the map reads; hypsometric band slots 3-8
      // carry six pride colors (cycled in-shader)
      return [
        bgHex,
        hslToHex(h, Math.min(s, 35), Math.max(l - 35, 12)),
        hslToHex(h, Math.min(s, 40), Math.max(l - 45, 8)),
        ...PRIDE_COLORS_VIZ.slice(1, 7),
      ];
    }
    return [
      bgHex,                                                  // paper: live background
      hslToHex(h, Math.min(s, 35), Math.max(l - 35, 12)),     // contour ink
      hslToHex(h, Math.min(s, 40), Math.max(l - 45, 8)),      // index-line ink
      hslToHex(h - 20, 25, Math.min(l + 6, 90)),              // low tint
      hslToHex(h + 20, 30, Math.min(l + 12, 92)),             // high tint
    ];
  },
  initState(seed) {
    return { seed, drift: new Float32Array(2) };
  },
  frame(state, ctx) {
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_drift: topoDriftOffsets(ctx.t, state.seed, state.drift),
      u_tilt: [ctx.tiltX, ctx.tiltY],
    };
  },
  eventLife: PEAK_LIFE,
};
