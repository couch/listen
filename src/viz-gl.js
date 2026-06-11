// WebGL plumbing for the visualizer: one fullscreen triangle, one fragment
// shader. GLSL ES 1.00 so the same source runs on webgl2 and webgl1.
//
// The shader is the whole effect: a mesh gradient — moving color sites
// (positions animated in JS, see computeSites) blended with normalized
// Gaussian weights over a domain-warped field, mixed in linear RGB — plus
// additive expanding bloom rings (Eno Bloom) and interleaved-gradient-noise
// dithering after the sRGB encode. Gaussian blending + linear mixing +
// dithering is what keeps the field free of hard edges and banding.

import { VIZ_PALETTE_SLOTS, VIZ_BLOOM_SLOTS } from './viz-logic.js';

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define TAU 6.2831853
#define PALETTE_SLOTS ${VIZ_PALETTE_SLOTS}
#define BLOOM_SLOTS ${VIZ_BLOOM_SLOTS}

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform vec3 u_palette[PALETTE_SLOTS];
uniform float u_paletteCount;
uniform vec4 u_blooms[BLOOM_SLOTS];
uniform vec3 u_sites[PALETTE_SLOTS]; // xy = position (aspect-space), z = falloff
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

  vec3 outCol = toSrgb(col);

  // Interleaved gradient noise: kills banding and adds the subtle film grain
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  outCol += (ign - 0.5) * 1.5 / 255.0;

  gl_FragColor = vec4(outCol, 1.0);
}
`;

function compile(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('viz shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createVizGL(canvas) {
  const opts = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;

  let program = null;
  let loc = null;
  let lost = false;
  let lostCb = null;
  let restoredCb = null;

  // Cached so state survives a context restore
  let paletteData = new Float32Array(VIZ_PALETTE_SLOTS * 3);
  let paletteCount = 1;
  let width = canvas.width;
  let height = canvas.height;

  function setup() {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('viz program link failed:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    loc = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      seed: gl.getUniformLocation(program, 'u_seed'),
      palette: gl.getUniformLocation(program, 'u_palette'),
      paletteCount: gl.getUniformLocation(program, 'u_paletteCount'),
      blooms: gl.getUniformLocation(program, 'u_blooms'),
      sites: gl.getUniformLocation(program, 'u_sites'),
    };

    gl.uniform3fv(loc.palette, paletteData);
    gl.uniform1f(loc.paletteCount, paletteCount);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(loc.resolution, width, height);
    return true;
  }

  if (!setup()) return null;

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    lost = true;
    if (lostCb) lostCb();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (setup()) {
      lost = false;
      if (restoredCb) restoredCb();
    }
  });

  return {
    resize(w, h) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      if (lost) return;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.resolution, w, h);
    },
    setPalette(data, count) {
      paletteData = data;
      paletteCount = count;
      if (lost) return;
      gl.uniform3fv(loc.palette, data);
      gl.uniform1f(loc.paletteCount, count);
    },
    render({ time, seed, blooms, sites }) {
      if (lost) return;
      gl.uniform1f(loc.time, time);
      gl.uniform1f(loc.seed, seed);
      gl.uniform4fv(loc.blooms, blooms);
      gl.uniform3fv(loc.sites, sites);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    onLost(cb) { lostCb = cb; },
    onRestored(cb) { restoredCb = cb; },
  };
}
