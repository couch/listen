// Disco ball — a faceted mirror ball hanging near the top of a dark room
// washed in the live bg, slowly turning; its grid of light spots sweeps the
// walls. Tilt swings the ball (and the whole light field with it); a tap is
// a sparkle burst — spots flare in a patch and the ball's glints answer.
// Elegant and restrained: slow drift, a few facets glinting at a time,
// never a strobe.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

const TAU = Math.PI * 2;

// Tempo — all periods divide 3600 (hourly clock wrap)
export const DISCO_ROT_PERIOD = 48;   // s per revolution
export const DISCO_SWAY_PERIOD = 18;  // pendulum sway
export const DISCO_SWAY_AMP = 0.015;
export const GLINT_PERIOD = 12;       // facet-flare era
// The ball
export const DISCO_BALL_R = 0.13;
export const DISCO_BALL_Y = 0.84;
export const DISCO_FACETS = 24;       // angular facet pitch = TAU / this
// The spot field
export const DISCO_SPOKES = 28;
export const DISCO_RINGS = 9;
export const DISCO_SPOT_R = 0.016;
export const DISCO_ELONG = 0.7;       // radial stretch per unit distance
export const DISCO_SPOT_GAIN = 0.6;
// Interaction
export const DISCO_TILT_GAIN = 0.08;  // pendulum lean at full sideways tilt
export const DISCO_BOB = 0.04;        // hang-height bob at full forward tilt
export const DISCO_FLASH_LIFE = 4;

const clamp1 = v => Math.max(-1, Math.min(1, v));

// Rotation phase in [0, TAU). DISCO_ROT_PERIOD divides 3600, so the fract
// wraps seamlessly with the hourly shader clock.
export function discoRot(t) {
  const f = t / DISCO_ROT_PERIOD;
  return TAU * (f - Math.floor(f));
}

// Glint era phase in [0, 1).
export function discoGlintPhase(t) {
  const f = t / GLINT_PERIOD;
  return f - Math.floor(f);
}

// Ball center in aspect-space: pendulum sway + tilt lean (x), hang bob (y).
export function discoBallPos(t, aspect, tiltX, tiltY) {
  const sway = DISCO_SWAY_AMP * Math.sin(TAU * t / DISCO_SWAY_PERIOD)
    + clamp1(tiltX) * DISCO_TILT_GAIN;
  return [aspect * 0.5 + sway, DISCO_BALL_Y - clamp1(tiltY) * DISCO_BOB];
}

const frag = PRELUDE + `
uniform vec2 u_ball;   // aspect-space ball center
uniform float u_rot;   // rotation phase [0, TAU)
uniform float u_glint; // glint era phase [0, 1)

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 asp = vec2(aspect, 1.0);
  vec2 p = uv * asp;

  // Room: live-bg wall wash, brightest in the pool of light around the
  // ball, shading toward the deep corners (slot 0 dominates — invariant 1)
  vec2 pq = (p - u_ball) * vec2(1.0, 0.8);
  float pool = exp(-length(pq) * 1.2) + 0.15 * (fbm(p * 2.0 + u_seed) - 0.5);
  vec3 col = mix(paletteAt(1.0), u_palette[0], clamp(0.55 + 0.5 * pool, 0.0, 1.0));

  // Sparkle bursts (shared blooms): a local patch boost for the spots, a
  // global widening of the facet-glint window, and a fine shimmer grain
  float burstLocal = 0.0;
  float burstGlobal = 0.0;
  float shimmer = 0.0;
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${DISCO_FLASH_LIFE.toFixed(1)}) continue;
    float pulse = smoothstep(0.0, 0.15, age) * exp(-age * 1.1);
    vec2 bd = (uv - b.xy) * asp;
    float patch = exp(-dot(bd, bd) * 12.0);
    burstLocal += pulse * patch;
    burstGlobal += pulse;
    shimmer += pow(vnoise(p * 18.0 + age * 3.0 + b.w * 9.0), 6.0) * patch * pulse;
  }

  // Light spots: polar grid around the ball. The spoke coordinate carries
  // u_rot so spots translate continuously around the room; hashes use the
  // mod-SPOKES index, which is invariant when u_rot's fract wraps (no pop).
  vec2 q = p - u_ball;
  float r = length(q);
  float theta = atan(q.x, -q.y); // angle from straight down
  float su = (theta / TAU + u_rot / TAU) * ${DISCO_SPOKES.toFixed(1)};
  float sv = r * ${DISCO_RINGS.toFixed(1)};
  vec3 spotAcc = vec3(0.0);
  bool pride = u_paletteCount > 8.5;
  // Radial sigma outgrows its cell pitch and jitter wanders — evaluate the
  // full 3x3 neighborhood so no spot is sliced at a cell boundary
  for (int du = -1; du <= 1; du++) {
    for (int dv = -1; dv <= 1; dv++) {
      float spoke = floor(su) + float(du);
      float ring = floor(sv) + float(dv);
      if (ring < 0.0) continue;
      vec2 cell = vec2(mod(spoke, ${DISCO_SPOKES.toFixed(1)}), ring);
      float h1 = hash(cell + u_seed);
      if (h1 < 0.62) continue;
      float h2 = hash(cell * 1.7 + u_seed + 3.1);
      float h3 = hash(cell * 2.3 + u_seed + 7.7);
      // Jittered center (±0.2 cell), distances in screen units: tangential
      // = arc length, radial = ring pitch
      float cu = spoke + 0.5 + (h2 - 0.5) * 0.4;
      float cv = ring + 0.5 + (h3 - 0.5) * 0.4;
      float rc = max((cv + 0.0) / ${DISCO_RINGS.toFixed(1)}, 0.05);
      float dt = (su - cu) * (TAU / ${DISCO_SPOKES.toFixed(1)}) * rc;
      float dr = (sv - cv) / ${DISCO_RINGS.toFixed(1)};
      float st = ${DISCO_SPOT_R.toFixed(3)} * (0.5 + rc);
      float sr = st * (1.0 + ${DISCO_ELONG.toFixed(1)} * rc);
      float g = exp(-(dt * dt / (2.0 * st * st) + dr * dr / (2.0 * sr * sr)));
      float twinkle = 1.0 + 0.15 * sin(u_time * TAU / 20.0 + h3 * TAU);
      float bright = (0.4 + 0.6 * h2) * exp(-rc * 1.1) * twinkle;
      vec3 tint;
      if (pride) {
        tint = mix(paletteAt(1.0 + mod(floor(h3 * 8.0), 8.0)), vec3(0.9), 0.45);
      } else {
        tint = paletteAt(2.0);
      }
      spotAcc += tint * g * bright;
    }
  }
  float spotMask = smoothstep(${(DISCO_BALL_R * 1.5).toFixed(3)}, ${(DISCO_BALL_R * 2.4).toFixed(3)}, r);
  col += spotAcc * spotMask * ${DISCO_SPOT_GAIN.toFixed(2)} * (1.0 + 2.0 * burstLocal);
  col += paletteAt(4.0) * shimmer * 0.25;

  // Hanging rod
  float rod = smoothstep(0.004, 0.0015, abs(p.x - u_ball.x))
    * smoothstep(u_ball.y + ${(DISCO_BALL_R * 0.9).toFixed(3)}, u_ball.y + ${(DISCO_BALL_R * 1.1).toFixed(3)}, p.y);
  col = mix(col, paletteAt(1.0) * 0.8, rod * 0.7);

  // The ball: facet grid on the visible hemisphere, flat-shaded from the
  // facet-center normal (hard mirror-tile edges are the point — bounded
  // inside the disc). asin clamp + atan z-floor guard the pole/rim NaNs.
  float d = length(q);
  float disc = smoothstep(${DISCO_BALL_R.toFixed(3)} + 0.004, ${DISCO_BALL_R.toFixed(3)} - 0.004, d);
  vec2 s = q / ${DISCO_BALL_R.toFixed(3)};
  float zz = sqrt(max(1.0 - dot(s, s), 0.0));
  float lat = asin(clamp(s.y, -0.985, 0.985));
  float lon = atan(s.x, max(zz, 0.05)) + u_rot;
  float pitch = TAU / ${DISCO_FACETS.toFixed(1)};
  vec2 fc = floor(vec2(lon, lat) / pitch);
  // mod-FACETS keeps facet hashes stable across u_rot's wrap (TAU/pitch is
  // exactly DISCO_FACETS, so the wrap shifts fc.x by a full period)
  float gh = hash(vec2(mod(fc.x, ${DISCO_FACETS.toFixed(1)}), fc.y) + u_seed * 0.7);
  float latC = (fc.y + 0.5) * pitch;
  float lonV = (fc.x + 0.5) * pitch - u_rot;
  vec3 n = normalize(vec3(cos(latC) * sin(lonV), sin(latC), max(cos(latC) * cos(lonV), 0.05)));
  float lam = clamp(dot(n, normalize(vec3(-0.5, 0.6, 0.7))), 0.0, 1.0);
  vec2 ff = fract(vec2(lon, lat) / pitch);
  float grout = smoothstep(0.0, 0.07, ff.x) * smoothstep(1.0, 0.93, ff.x)
    * smoothstep(0.0, 0.07, ff.y) * smoothstep(1.0, 0.93, ff.y);
  vec3 ballCol = paletteAt(3.0) * (0.22 + 0.95 * lam) * (0.85 + 0.3 * gh) * (0.7 + 0.3 * grout);
  // A few facets flare at a time; bursts widen the window so the ball
  // answers taps and track changes
  float gt = fract(gh * 7.3 + u_glint);
  float window = 0.05 * (1.0 + 2.0 * min(burstGlobal, 1.5));
  float flare = smoothstep(window, window * 0.4, gt) * smoothstep(0.0, window * 0.15, gt);
  ballCol += paletteAt(4.0) * flare * (0.6 + 0.6 * lam);
  col = mix(col, ballCol, disc);

  // Faint halo just outside the rim
  float ho = max(d - ${DISCO_BALL_R.toFixed(3)}, 0.0);
  col += paletteAt(2.0) * exp(-ho * ho * 90.0) * (1.0 - disc) * 0.12;

  // House breathing + faint vignette
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'disco',
  name: 'Disco',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_ball: '2f', u_rot: '1f', u_glint: '1f' },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Per-spot tints cycle the spectrum (in-shader); ball stays silver
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                      // wall wash: live background
      hslToHex(h, Math.min(s, 50), 8),            // room shadow / rod
      hslToHex(h + 15, 25, 82),                   // spot light
      hslToHex(h, 8, 60),                         // facet silver
      hslToHex(h + 30, 15, 93),                   // glint / sparkle
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
      u_ball: discoBallPos(ctx.t, ctx.aspect, ctx.tiltX, ctx.tiltY),
      u_rot: discoRot(ctx.t),
      u_glint: discoGlintPhase(ctx.t),
    };
  },
  eventLife: DISCO_FLASH_LIFE,
};
