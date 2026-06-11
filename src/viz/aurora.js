// Aurora — vertical light curtains rippling over a dusk gradient whose
// horizon band is the live bg. Tilt is wind (sideways sway, layered) and
// lift (raise/lower the curtains); a tap sends a shimmer pulse rising
// through the curtains from the touch point.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const AURORA_LAYERS = 3;
// Curtain flow periods divide 3600. The fbm phase advances as t/FLOW —
// like the mesh's domain-warp clock, the hourly wrap seam is accepted
// (sessions restart the clock on every open).
export const AURORA_FLOW = [120, 90, 144];
export const WIND_PERIOD = 60;
export const WIND_AMP = 0.3;
export const AURORA_TILT_GAIN = 0.5;  // wind from sideways tilt
export const AURORA_LIFT_GAIN = 0.15; // curtain height from forward tilt
export const SHIMMER_RISE = 0.25;     // pulse climb speed, units/s
export const SHIMMER_LIFE = 6;

const TAU_JS = Math.PI * 2;

// Per-layer fbm phases for the curtain centerlines.
export function auroraPhases(t, seed, out = null) {
  const data = out || new Float32Array(AURORA_LAYERS);
  for (let i = 0; i < AURORA_LAYERS; i++) {
    data[i] = seed * (1.7 + i * 0.93) + t / AURORA_FLOW[i];
  }
  return data;
}

// Wind: slow autonomous sway plus tilt, layered in the shader by depth.
export function computeAuroraWind(t, tiltX) {
  return WIND_AMP * Math.sin(TAU_JS * t / WIND_PERIOD) + tiltX * AURORA_TILT_GAIN;
}

const frag = PRELUDE + `
uniform vec3 u_phase;  // per-layer curtain flow phase
uniform float u_wind;  // sway offset (autonomous + tilt)
uniform float u_lift;  // curtain height offset from forward tilt

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Dusk: deep slot 1 sky settling into a live-bg horizon glow
  vec3 col = mix(u_palette[0], u_palette[1], smoothstep(0.12, 0.75, uv.y));

  // Sparse twinkling stars in the upper sky — soft round points at
  // jittered cell positions, not flat cell squares
  vec2 sg = floor(p * 90.0);
  float sh = hash(sg + u_seed);
  vec2 sc = (sg + 0.5 + 0.6 * (vec2(hash(sg + 1.7), hash(sg + 3.1)) - 0.5)) / 90.0;
  float sd = length(p - sc) * 90.0;
  float twinkle = 0.4 + 0.6 * hash(sg + floor(u_time / 4.0));
  float star = step(0.985, sh) * twinkle * exp(-sd * sd * 6.0) * smoothstep(0.45, 0.75, uv.y);
  col += mix(vec3(1.0), paletteAt(5.0), 0.6) * star * 0.6;

  // Shimmer pulses (shared blooms): bright patches rising from the tap
  float pulse = 0.0;
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${SHIMMER_LIFE.toFixed(1)}) continue;
    vec2 d = vec2((uv.x - b.x) * aspect / 0.12, (uv.y - (b.y + age * ${SHIMMER_RISE.toFixed(2)})) / 0.18);
    pulse += exp(-dot(d, d)) * exp(-age * 0.5);
  }

  // Three curtain layers, additive, back to front
  bool pride = u_paletteCount > 8.5;
  for (int i = 0; i < ${AURORA_LAYERS}; i++) {
    float fi = float(i);
    float phase = i == 0 ? u_phase.x : (i == 1 ? u_phase.y : u_phase.z);
    float depth = 0.6 + 0.3 * fi;
    float xs = p.x * 1.5 + phase + u_wind * depth;

    // Curtain centerline: deep rippling height, layers well separated
    float h = 0.42 + fi * 0.12 + 0.22 * (fbm(vec2(xs * 1.6, fi * 7.3)) - 0.5) + u_lift;

    // Asymmetric band: crisp lower edge, glow fading upward
    float dy = uv.y - h;
    float band = dy < 0.0 ? exp(-dy * dy * 200.0) : exp(-dy * dy * 25.0);

    // Folds and gaps along the curtain (squared for contrast), then rays
    float fold = vnoise(vec2(xs * 1.1, fi * 3.7));
    band *= 0.1 + 0.9 * fold * fold;
    band *= 0.5 + 0.5 * vnoise(vec2(xs * 26.0, uv.y * 2.0));
    band *= 1.0 + 2.0 * pulse;

    // Color climbs from base to fringe with height above the centerline
    vec3 cc;
    if (pride) {
      float idx = xs * 1.2 + u_time / 45.0;
      float i0 = mod(floor(idx), 8.0);
      float i1 = mod(i0 + 1.0, 8.0);
      cc = mix(paletteAt(1.0 + i0), paletteAt(1.0 + i1), smoothstep(0.25, 0.75, fract(idx)));
    } else {
      cc = mix(paletteAt(2.0), paletteAt(3.0), smoothstep(0.0, 0.25, dy));
      cc += paletteAt(4.0) * smoothstep(0.1, 0.3, dy) * 0.5;
    }
    col += cc * band * (0.5 - 0.125 * fi);
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
  id: 'aurora',
  name: 'Aurora',
  frag,
  uniformSpec: {
    ...COMMON_UNIFORM_SPEC,
    u_phase: '3fv',
    u_wind: '1f',
    u_lift: '1f',
  },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Curtain color cycles the pride spectrum along x (in-shader)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // horizon glow: live background
      hslToHex(h - 30, Math.min(s * 0.9, 60), 9),  // dusk sky
      hslToHex(h + 90, 75, 55),                    // curtain base
      hslToHex(h + 140, 65, 45),                   // curtain mid
      hslToHex(h + 60, 55, 70),                    // top fringe
      hslToHex(h, 12, 92),                         // stars
    ];
  },
  initState(seed) {
    return { seed, phases: new Float32Array(AURORA_LAYERS) };
  },
  frame(state, ctx) {
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_phase: auroraPhases(ctx.t, state.seed, state.phases),
      u_wind: computeAuroraWind(ctx.t, ctx.tiltX),
      u_lift: ctx.tiltY * AURORA_LIFT_GAIN,
    };
  },
  eventLife: SHIMMER_LIFE,
};
