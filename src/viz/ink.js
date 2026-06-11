// Ink in water — dark plumes billowing up through live-bg water. The shared
// bloom buffer IS the ink: each event is a drop whose plume rises, curls,
// widens, and dilutes over 25 seconds, compositing multiplicatively
// (absorption) over the field. Tilt leans the plumes; no per-viz hooks.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const INK_LIFE = 25;        // plume lifetime (eventLife)
export const INK_RISE = 0.04;      // plume climb, units/s
export const INK_SPREAD = 0.02;    // sigma growth, units/s
export const INK_SIGMA0 = 0.05;    // initial plume radius
export const INK_DILUTE_TAU = 18;  // absorption decay
export const INK_TILT_GAIN = 0.5;  // lean from tilt

// Tilt → plume lean. x bends the rise sideways, y stretches/squashes it.
export function inkLean(tiltX, tiltY) {
  const c = v => Math.max(-1, Math.min(v, 1));
  return [c(tiltX) * INK_TILT_GAIN, c(tiltY) * INK_TILT_GAIN];
}

const frag = PRELUDE + `
uniform vec2 u_lean;

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;

  // Still water: the live bg, faintly brighter toward the surface, with
  // slow dilute wisps drifting through so the field is alive before any
  // drop has fallen
  vec3 col = u_palette[0] * mix(0.96, 1.04, uv.y);
  vec2 wp = vec2(uv.x * aspect, uv.y);
  float wisp = smoothstep(0.55, 0.95, fbm(wp * 1.6 + u_seed + vec2(u_time * 0.013, -u_time * 0.008)));
  col *= mix(vec3(1.0), u_palette[3] * 1.3, wisp * 0.18);

  bool pride = u_paletteCount > 8.5;
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${INK_LIFE.toFixed(1)}) continue;

    // Plume-local coordinates: subtract the risen, leaned path
    vec2 q = (uv - b.xy) * vec2(aspect, 1.0);
    q -= age * vec2(u_lean.x * ${INK_RISE.toFixed(3)} * 2.0,
                    ${INK_RISE.toFixed(3)} * (1.0 + 0.5 * u_lean.y));

    float sigma = ${INK_SIGMA0.toFixed(3)} * (1.0 + min(age, 1.0)) + ${INK_SPREAD.toFixed(3)} * age;
    float r2 = dot(q, q);
    if (r2 > sigma * sigma * 9.0) continue; // spatial early-out

    // Curl: value-noise swirl bends the plume into tendrils as it climbs
    vec2 cw = vec2(vnoise(q * 2.4 + b.w * 7.3 + 3.7),
                   vnoise(q * 2.4 + b.w * 7.3 + 8.1)) - 0.5;
    q += min(age * 0.09, 0.9) * cw;

    // Billowy density: clumped fbm inside a widening, diluting envelope
    float env = exp(-dot(q, q) / (sigma * sigma))
              * exp(-age / ${INK_DILUTE_TAU.toFixed(1)})
              * min(1.0, age * 3.0)
              * smoothstep(${INK_LIFE.toFixed(1)}, ${(INK_LIFE - 5).toFixed(1)}, age);
    float dens = smoothstep(0.22, 0.7, fbm(q * 4.0 + b.w * 11.0 + u_seed)) * env;

    // Absorption: ink multiplies the light away (order-independent)
    vec3 inkCol = pride
      ? paletteAt(max(b.w, 1.0))
      : mix(u_palette[3], u_palette[1], min(dens * 1.5, 1.0));
    col *= mix(vec3(1.0), inkCol * 1.25, min(dens * 1.4, 1.0));
  }

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
  id: 'ink',
  name: 'Ink',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_lean: '2f' },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Each drop's ink takes a pride color via its bloom seed
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // water: live background
      hslToHex(h + 180, 70, 22),                   // ink, concentrated
      hslToHex(h + 150, 60, 32),                   // ink, mid
      hslToHex(h + 180, 40, 55),                   // ink, dilute
    ];
  },
  initState(seed) {
    return { seed };
  },
  frame(state, ctx) {
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_lean: inkLean(ctx.tiltX, ctx.tiltY),
    };
  },
  eventLife: INK_LIFE,
};
