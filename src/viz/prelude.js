// Shared GLSL ES 1.00 prelude for every visualization's fragment shader:
// the uniforms common to all of them plus the helper library (hash, value
// noise, fbm, palette lookup, sRGB encode, IGN dither). Each visualization's
// `frag` is PRELUDE + its own body, and must end with
// `gl_FragColor = vec4(outCol, u_fade);` so crossfade blending works.

import { VIZ_PALETTE_SLOTS, VIZ_BLOOM_SLOTS } from '../viz-logic.js';

// Uniforms every visualization receives. `u_resolution` and `u_fade` are
// owned by viz-gl (set per render call) and are NOT part of this spec —
// frame() must return values for exactly these keys plus any per-viz extras.
export const COMMON_UNIFORM_SPEC = {
  u_time: '1f',
  u_seed: '1f',
  u_palette: '3fv',
  u_paletteCount: '1f',
  u_blooms: '4fv',
};

export const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define TAU 6.2831853
#define PALETTE_SLOTS ${VIZ_PALETTE_SLOTS}
#define BLOOM_SLOTS ${VIZ_BLOOM_SLOTS}

uniform vec2 u_resolution;
uniform float u_fade;
uniform float u_time;
uniform float u_seed;
uniform vec3 u_palette[PALETTE_SLOTS];
uniform float u_paletteCount;
uniform vec4 u_blooms[BLOOM_SLOTS];
varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Value noise with quintic interpolation
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v / 0.9375; // normalize octave sum to ~0..1
}

// GLSL ES 1.00 forbids dynamic array indexing — constant-bound loop lookup
vec3 paletteAt(float j) {
  vec3 c = u_palette[0];
  for (int i = 1; i < PALETTE_SLOTS; i++) {
    if (float(i) == j) c = u_palette[i];
  }
  return c;
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

// Interleaved gradient noise: kills banding; amp ~1.5 adds subtle film grain
vec3 dither(vec3 c, float amp) {
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return c + (ign - 0.5) * amp / 255.0;
}
`;
