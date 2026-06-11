// Rain on glass — soft bokeh lights drifting behind a pane, beaded drops
// refracting them as they run down the glass. Tilt leans the streak
// direction toward gravity and leaning forward speeds the rain; a tap is a
// splat (refractive ring); blooms render as splats too.
//
// Single-pass technique adapted from the classic grid-cell falling-drop
// approach: per layer, one drop per column cycles down-screen with a sine
// wobble and a trail of shrinking static beads; the in-drop offset
// re-samples the background upside-down (negative refraction).

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const BOKEH_COUNT = 6;
// x/y drift and radius-breath periods all divide 3600
export const BOKEH_PERIODS = [90, 72, 120, 144, 60, 180];

export const RAIN_LAYER_SCALES = [6, 9, 14];
export const RAIN_SPEEDS = [1 / 20, 1 / 12, 1 / 8]; // screens per second
export const RAIN_REFRACT = -1.6;
export const RAIN_TRAIL = 0.35;
export const RAIN_GRAV_GAIN = 0.6;  // radians of streak lean at full tilt
export const RAIN_RATE_GAIN = 0.5;  // fall-speed boost at full forward lean
export const SPLAT_LIFE = 3;

const TAU_JS = Math.PI * 2;
const fract = v => v - Math.floor(v);

// 6 bokeh lights on slow Lissajous drifts behind the glass.
// vec4(x, y aspect-space, radius, palette slot)
export function computeBokehLights(t, seed, aspect, paletteCount, out) {
  const data = out || new Float32Array(BOKEH_COUNT * 4);
  const pride = paletteCount >= 9;
  for (let i = 0; i < BOKEH_COUNT; i++) {
    const px = BOKEH_PERIODS[i];
    const py = BOKEH_PERIODS[(i + 2) % BOKEH_COUNT];
    const ph1 = fract(seed * 0.371 + i * 0.618034) * TAU_JS;
    const ph2 = fract(seed * 0.611 + i * 0.754878) * TAU_JS;
    data[i * 4] = aspect * (0.5 + 0.4 * Math.sin(TAU_JS * t / px + ph1));
    data[i * 4 + 1] = 0.5 + 0.42 * Math.cos(TAU_JS * t / py + ph2);
    data[i * 4 + 2] = 0.14 + 0.05 * Math.sin(TAU_JS * t / (i % 2 ? 45 : 36) + ph1);
    data[i * 4 + 3] = pride ? 1 + (i % 8) : 2 + (i % 3);
  }
  return data;
}

// Streak direction: unit gravity vector, straight down at rest, leaning
// up to ±RAIN_GRAV_GAIN radians with sideways tilt.
export function gravityFromTilt(tiltX) {
  const a = Math.max(-RAIN_GRAV_GAIN, Math.min(tiltX * RAIN_GRAV_GAIN, RAIN_GRAV_GAIN));
  return [Math.sin(a), -Math.cos(a)];
}

export function rainRate(tiltY) {
  return 1 + RAIN_RATE_GAIN * Math.min(Math.abs(tiltY), 1);
}

// Fall phases are integrated in JS (not derived from u_time) so a changing
// tilt rate speeds the rain up smoothly instead of teleporting the drops.
export function stepRainPhases(phases, dt, rate) {
  const d = Math.min(Math.max(dt, 0), 0.1); // resume-from-hidden clamp
  for (let i = 0; i < phases.length; i++) {
    phases[i] = fract(phases[i] + d * RAIN_SPEEDS[i] * rate);
  }
  return phases;
}

const frag = PRELUDE + `
uniform vec4 u_lights[${BOKEH_COUNT}]; // xy = pos (aspect-space), z = radius, w = palette slot
uniform vec2 u_gravity;                // unit vector, (0,-1) at rest
uniform vec3 u_phase;                  // per-layer fall phase, 0..1

// The world behind the glass: vertical dusk gradient anchored on the live
// bg + big soft light discs. Re-sampleable so drops can refract it.
vec3 bgcol(vec2 p) {
  vec3 c = u_palette[0] * mix(1.0, 0.8, smoothstep(0.4, 1.1, p.y));
  c = mix(c, u_palette[1], smoothstep(0.45, 1.2, p.y) * 0.6);
  for (int i = 0; i < ${BOKEH_COUNT}; i++) {
    vec4 l = u_lights[i];
    vec2 d = p - l.xy;
    c += paletteAt(l.w) * exp(-dot(d, d) / (l.z * l.z)) * 0.55;
  }
  return c;
}

// One drop layer in gravity-rotated space. Returns refraction offset (xy),
// specular highlight (z), and wet-mask (w). The falling drop wobbles wider
// than its own grid column, so the two neighbor columns are evaluated too —
// otherwise drops get sliced by hard column boundaries.
vec4 dropLayer(vec2 rp, float scale, float phase, float seedOff) {
  vec4 acc = vec4(0.0);
  float col0 = floor(rp.x * scale);
  for (int n = -1; n <= 1; n++) {
    float colId = col0 + float(n);
    float hx = hash(vec2(colId * 0.123 + seedOff, seedOff));
    if (hx < 0.22) continue; // dry column

    // The falling drop: cycles down the column with a sine wobble
    float yPos = fract(hx * 13.7 - phase);
    float dropX = (colId + 0.5 + 0.3 * sin(yPos * TAU * 2.0 + hx * TAU)) / scale;
    vec2 c = vec2(dropX, yPos);
    vec2 d = rp - c;
    float r = (0.22 + 0.18 * hx) / scale;
    float inside = smoothstep(r, r * 0.55, length(d));

    vec2 off = d * ${RAIN_REFRACT.toFixed(2)} * inside;
    // Specular dot toward the upper-left of the bead
    vec2 sd = d / r - vec2(-0.35, 0.4);
    float spec = inside * exp(-dot(sd, sd) * 6.0);
    float tIn = 0.0;

    if (n == 0) {
      // Trail: shrinking static beads at the column center (never cross
      // the boundary, so only the home column needs them)
      float above = rp.y - yPos;
      float tEnv = smoothstep(${RAIN_TRAIL.toFixed(2)}, 0.0, above) * step(0.0, above);
      vec2 tc = vec2((colId + 0.5) / scale, (floor(rp.y * scale * 3.0) + 0.5) / (scale * 3.0));
      vec2 td = rp - tc;
      float tr = r * 0.45 * tEnv * (0.4 + 0.6 * hash(vec2(tc.y * 91.7, colId)));
      // step() guard: smoothstep(0, 0, x) is undefined when the trail dies out
      tIn = smoothstep(max(tr, 1e-4), tr * 0.4, length(td)) * step(1e-4, tr);
      off += td * ${RAIN_REFRACT.toFixed(2)} * tIn;
    }

    acc += vec4(off, spec, max(inside, tIn));
  }
  return acc;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Gravity-aligned space: streaks run along the tilt vector
  float ga = atan(u_gravity.x, -u_gravity.y);
  float cs = cos(ga);
  float sn = sin(ga);
  vec2 ctr = vec2(aspect * 0.5, 0.5);
  vec2 rp = mat2(cs, -sn, sn, cs) * (p - ctr) + ctr;

  vec4 acc = vec4(0.0);
  acc += dropLayer(rp, ${RAIN_LAYER_SCALES[0].toFixed(1)}, u_phase.x, 1.3);
  acc += dropLayer(rp, ${RAIN_LAYER_SCALES[1].toFixed(1)}, u_phase.y, 5.7);
  acc += dropLayer(rp, ${RAIN_LAYER_SCALES[2].toFixed(1)}, u_phase.z, 9.1);

  // Static micro-droplets that slowly evaporate and respawn
  float era = floor(u_time / 20.0);
  vec2 mg = rp * 16.0;
  vec2 mCell = floor(mg);
  float mh = hash(mCell * 0.137 + era * 0.731 + u_seed * 0.01);
  if (mh > 0.55) {
    vec2 mc = (mCell + 0.5 + 0.5 * (vec2(hash(mCell + 7.0), hash(mCell + 13.0)) - 0.5)) / 16.0;
    vec2 md = rp - mc;
    float mr = (0.05 + 0.1 * mh) / 16.0;
    float mIn = smoothstep(mr, mr * 0.4, length(md));
    acc.xy += md * ${RAIN_REFRACT.toFixed(2)} * mIn;
    acc.w = max(acc.w, mIn * 0.7);
  }

  // Rotate refraction offsets back to screen space
  vec2 off = mat2(cs, sn, -sn, cs) * acc.xy;

  // Splats (shared blooms): expanding refractive ring + bright rim
  float splat = 0.0;
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${SPLAT_LIFE.toFixed(1)}) continue;
    vec2 bd = (uv - b.xy) * asp;
    float dist = length(bd);
    float rr = 0.03 + age * 0.09;
    float band = smoothstep(0.02, 0.0, abs(dist - rr)) * exp(-age * 1.2);
    off += normalize(bd + 1e-5) * band * 0.05;
    splat += band;
  }

  vec3 col = bgcol(p + off);
  col *= mix(1.0, 1.3, acc.w);             // wet beads catch more light
  // Specular stays near-white even when slot 5 is a deep pride color
  vec3 specCol = mix(vec3(1.0), paletteAt(5.0), 0.4);
  col += specCol * acc.z * 0.6;            // glints on the beads
  col += specCol * splat * 0.25;           // splat rim sparkle

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
  id: 'rain',
  name: 'Rain',
  frag,
  uniformSpec: {
    ...COMMON_UNIFORM_SPEC,
    u_lights: '4fv',
    u_gravity: '2f',
    u_phase: '3fv',
  },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Bokeh lights cycle the pride spectrum (slots set in computeBokehLights)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // glass-lit air: live background
      hslToHex(h, Math.min(s * 0.8, 70), 12),      // night above
      hslToHex(h + 30, 80, 55),                    // bokeh warm
      hslToHex(h - 50, 70, 50),                    // bokeh cool
      hslToHex(h + 70, 85, 60),                    // bokeh accent
      hslToHex(h + 10, 15, 85),                    // specular
    ];
  },
  initState(seed) {
    return {
      seed,
      lights: new Float32Array(BOKEH_COUNT * 4),
      phases: null, // lazily seeded from the first frame's t
    };
  },
  frame(state, ctx) {
    const rate = rainRate(ctx.tiltY);
    if (state.phases === null) {
      state.phases = new Float32Array(RAIN_SPEEDS.map(s => fract(ctx.t * s)));
    } else {
      stepRainPhases(state.phases, ctx.dt, rate);
    }
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_lights: computeBokehLights(ctx.t, state.seed, ctx.aspect, ctx.paletteCount, state.lights),
      u_gravity: gravityFromTilt(ctx.tiltX),
      u_phase: state.phases,
    };
  },
  eventLife: SPLAT_LIFE,
};
