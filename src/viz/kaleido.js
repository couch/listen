// Kaleidoscope mandala — the one feedback visualization: every frame folds
// the previous frame into a k-fold mirrored wedge, zooms it slightly
// outward, decays it toward a bg-tinted floor, and seeds it with scheduled
// sparks. The fold replicates anything drawn into full symmetry within a
// frame; over seconds the sparks trail into a precessing mandala.
// A tap re-seeds (brief fast decay + a burst at the tap); a track change
// steps the symmetry order. Tilt precesses the symmetry axis.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const KALEIDO_KS = [6, 8, 10, 12]; // symmetry orders, stepped per track
export const PRECESS_PERIOD = 240;        // divides 3600
export const KALEIDO_DECAY = 0.985;
export const RESEED_DECAY = 0.8;          // fast clear after a tap
export const RESEED_T = 0.5;              // seconds of fast clear
export const KALEIDO_TILT_GAIN = 0.3;     // axis precession from tilt
export const SPARK_SLOTS = 6;
export const SPARK_ORBIT = 45;            // spark radius breathing (divides 3600)
// Per-slot firing periods; 3600·(1/p) is integer for each (wrap-safe fract)
export const SPARK_PERIODS = [1.2, 1.6, 2.0];

const TAU_JS = Math.PI * 2;
const fract = v => v - Math.floor(v);
const hash1 = v => fract(Math.sin(v * 12.9898) * 43758.5453);

export function kForIndex(i) {
  return KALEIDO_KS[((i % KALEIDO_KS.length) + KALEIDO_KS.length) % KALEIDO_KS.length];
}

export function kaleidoPrecession(t, tiltX) {
  return TAU_JS * t / PRECESS_PERIOD + tiltX * KALEIDO_TILT_GAIN;
}

// The spark schedule: each slot fires on its own cycle at a hash angle and
// a slowly orbiting radius, popping in and out within the first half of
// its cycle. A recent burst (tap/track change) takes over the first three
// slots at the event's position. Fills vec4(dx, dy, size, paletteSlot),
// offsets relative to the screen center in aspect units.
export function computeKaleidoSparks(t, seed, aspect, paletteCount, burst, out = null) {
  const data = out || new Float32Array(SPARK_SLOTS * 4);
  const pride = paletteCount >= 9;
  for (let j = 0; j < SPARK_SLOTS; j++) {
    const period = SPARK_PERIODS[j % SPARK_PERIODS.length];
    const cycle = Math.floor(t / period + j * 0.37);
    const ph = fract(t / period + j * 0.37);
    const env = Math.sin(Math.PI * Math.min(ph * 2, 1)); // alive first half
    const h1 = hash1(cycle + seed * 7.13 + j * 71.7);
    const h2 = hash1(h1 * 117.31 + j);
    const radius = 0.09 + 0.3 * (0.5 + 0.5 * Math.sin(TAU_JS * t / SPARK_ORBIT + j * 1.05));
    const angle = TAU_JS * h1;
    data[j * 4] = radius * Math.cos(angle);
    data[j * 4 + 1] = radius * Math.sin(angle);
    data[j * 4 + 2] = (0.018 + 0.022 * h2) * env;
    data[j * 4 + 3] = pride ? 1 + ((cycle + j) % 8) : 2 + ((cycle + j) % 4);
  }
  if (burst) {
    const age = t - burst.at;
    if (age >= 0 && age < RESEED_T) {
      const k = 1 - age / RESEED_T;
      const bx = (burst.x - 0.5) * aspect;
      const by = burst.y - 0.5;
      const br = Math.hypot(bx, by);
      const ba = Math.atan2(by, bx);
      for (let j = 0; j < 3; j++) {
        const a = ba + (j - 1) * 0.45;
        data[j * 4] = br * Math.cos(a);
        data[j * 4 + 1] = br * Math.sin(a);
        data[j * 4 + 2] = 0.05 * k;
        data[j * 4 + 3] = pride ? 1 + j * 3 : 2 + j;
      }
    }
  }
  return data;
}

const frag = PRELUDE + `
uniform sampler2D u_prevFrame;
uniform float u_k;       // wedge count (symmetry order)
uniform float u_decay;   // 0.985 normally, 0.8 briefly after a re-seed
uniform float u_precess; // symmetry-axis rotation
uniform vec4 u_sparks[${SPARK_SLOTS}];

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 cp = vec2(0.5 * aspect, 0.5);
  vec2 c = vec2(uv.x * aspect, uv.y) - cp;

  // Fold the previous frame: slight outward zoom, rotate into the wedge
  // frame, mirror-fold the angle, rotate back, sample
  float r = length(c) / 1.01;
  float ang = atan(c.y, c.x) - u_precess;
  float w = TAU / u_k;
  float a = mod(ang, w);
  if (a > w * 0.5) a = w - a;
  float sa = a + u_precess;
  vec2 sp = cp + r * vec2(cos(sa), sin(sa));
  vec3 prev = texture2D(u_prevFrame, vec2(sp.x / aspect, sp.y)).rgb;

  // Decay toward a bg-tinted floor (never black — invariant 1), with an
  // extra rim damp so edge-clamp smears die out
  vec3 floorCol = toSrgb(u_palette[0]) * 0.18;
  vec3 col = mix(floorCol, prev, u_decay * smoothstep(0.8, 0.55, length(c)));

  // Live-bg halo around the mandala. It sits OUTSIDE the feedback damp
  // zone (damp = 0 past r 0.8), so re-adding it each frame is stable —
  // any additive term inside the loop would compound by 1/(1−decay).
  col += toSrgb(u_palette[0]) * 0.5 * smoothstep(0.78, 1.0, length(c));

  // Sparks: the seeds the fold replicates into symmetry
  for (int j = 0; j < ${SPARK_SLOTS}; j++) {
    vec4 s = u_sparks[j];
    if (s.z < 0.002) continue;
    vec2 d = c - s.xy;
    col += toSrgb(paletteAt(s.w)) * exp(-dot(d, d) / (s.z * s.z)) * 0.8;
  }

  // Procedural mandala base, self-regulating: visible only where the
  // feedback field is still empty — first frames after open/re-seed, and
  // the single reduced-motion frame (which never accumulates)
  float lum = dot(prev, vec3(0.333));
  float flower = smoothstep(0.45, 0.8, fbm(vec2(r * 5.0, a * 6.0 + u_seed)))
               * smoothstep(0.7, 0.25, r);
  vec3 flowerCol = mix(paletteAt(2.0), paletteAt(4.0), 0.5 + 0.5 * sin(r * 9.0 + u_seed));
  col += toSrgb(flowerCol) * flower * 0.55 * smoothstep(0.22, 0.04, lum);

  // No breathing/dither here: anything multiplied into the feedback loop
  // compounds frame over frame. The present pass dithers.
  gl_FragColor = vec4(col, u_fade);
}
`;

export default {
  id: 'kaleido',
  name: 'Kaleido',
  frag,
  feedback: true, // FBO ping-pong path in viz-gl
  uniformSpec: {
    ...COMMON_UNIFORM_SPEC,
    u_prevFrame: 'tex',
    u_k: '1f',
    u_decay: '1f',
    u_precess: '1f',
    u_sparks: '4fv',
  },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Sparks cycle the pride spectrum (slots set in computeKaleidoSparks)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // decay floor tint: live background
      hslToHex(h, Math.min(s * 0.8, 60), 12),      // deep reserve
      hslToHex(h + 40, 85, 60),                    // spark warm
      hslToHex(h - 40, 75, 55),                    // spark cool
      hslToHex(h + 90, 70, 65),                    // spark accent
      hslToHex(h + 10, 10, 90),                    // spark bright
    ];
  },
  initState(seed) {
    return {
      seed,
      kIdx: Math.floor(seed) % KALEIDO_KS.length,
      reseedAt: -1e9,
      burst: null,
      sparks: new Float32Array(SPARK_SLOTS * 4),
    };
  },
  frame(state, ctx) {
    // Hourly clock wrap: forget stale future timestamps
    if (ctx.t < state.reseedAt) state.reseedAt = -1e9;
    if (state.burst && ctx.t < state.burst.at) state.burst = null;
    const reseeding = ctx.t - state.reseedAt < RESEED_T;
    return {
      u_time: ctx.t,
      u_seed: state.seed,
      u_palette: ctx.paletteData,
      u_paletteCount: ctx.paletteCount,
      u_blooms: ctx.blooms,
      u_k: kForIndex(state.kIdx),
      u_decay: reseeding ? RESEED_DECAY : KALEIDO_DECAY,
      u_precess: kaleidoPrecession(ctx.t, ctx.tiltX),
      u_sparks: computeKaleidoSparks(ctx.t, state.seed, ctx.aspect, ctx.paletteCount, state.burst, state.sparks),
    };
  },
  // Tap re-seeds: fast clear + a burst at the tap, mirrored k-fold by the
  // feedback within a frame
  tap(state, x, y, t) {
    state.reseedAt = t;
    state.burst = { at: t, x, y };
  },
  // A new track steps the symmetry order and bursts
  trackEvent(state, t) {
    state.kIdx += 1;
    state.burst = { at: t, x: 0.58, y: 0.6 };
  },
  eventLife: 8,
};
