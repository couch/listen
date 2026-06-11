// Starfield warp — four parallax shells of stars streaming outward from a
// vanishing point, over a nebula wash tinted with the live bg (the field's
// dominant chroma, invariant 1). Tilt steers the camera by moving the
// vanishing point; a tap launches a comet along its outward ray.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

export const STAR_LAYER_SCALES = [8, 12, 18, 26];
// Shell recycle periods divide 3600 — fract(t/P) wraps seamlessly
export const STAR_LAYER_PERIODS = [90, 60, 45, 36];
export const VP_GAIN = 0.3;      // vanishing-point travel at full tilt
export const COMET_SPEED = 0.3;  // units/s along the outward ray
export const COMET_LIFE = 4;

// Camera steering: the vanishing point leans with the device.
export function vpFromTilt(tiltX, tiltY, aspect) {
  const c = v => Math.max(-1, Math.min(v, 1));
  return [aspect * 0.5 + c(tiltX) * VP_GAIN, 0.5 + c(tiltY) * VP_GAIN];
}

const frag = PRELUDE + `
uniform vec2 u_vp; // vanishing point, aspect-space

// One shell of stars: a grid in direction-space (q = offset/zoom) whose
// zoom cycles outward; star positions jitter within cells, sizes grow and
// streaks lengthen as the shell approaches.
vec3 shell(vec2 p, float scale, float period, float seedOff) {
  float z = fract(u_time / period + seedOff);
  float zoom = mix(0.12, 2.2, z);
  vec2 off = p - u_vp;
  vec2 q = off / zoom;
  vec2 cell = floor(q * scale);
  float hp = hash(cell + seedOff * 17.0);
  if (hp < 0.86) return vec3(0.0); // empty cell

  // Jitter and radius are cell-relative and kept small enough that the
  // streaked gaussian dies out before the cell boundary (no square cuts)
  vec2 sc = (cell + 0.5 + 0.3 * (vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5)) / scale;
  vec2 d = off - sc * zoom; // screen-space offset from the star
  float r = zoom * (0.035 + 0.045 * hash(cell + 7.7)) / scale;

  // Radial streak: stretch the along-ray axis as the shell speeds up
  vec2 rad = normalize(sc + 1e-5);
  float along = dot(d, rad) / (1.0 + 2.0 * z);
  float perp = dot(d, vec2(-rad.y, rad.x));
  float glow = exp(-(along * along + perp * perp) / (r * r));

  // Fade in at the far end, out as the shell recycles
  float fade = smoothstep(0.0, 0.2, z) * smoothstep(1.0, 0.72, z);
  vec3 starCol = mix(mix(vec3(0.95), paletteAt(2.0), 0.25),
                     paletteAt(3.0), step(0.93, hash(cell + 11.3)));
  return starCol * glow * fade * (0.7 + 0.5 * hp);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Deep space + nebula wash tinted by the live bg
  vec3 col = u_palette[1];
  col += u_palette[0] * fbm(p * 1.2 + u_seed + u_time / 180.0) * 0.4;

  col += shell(p, ${STAR_LAYER_SCALES[0].toFixed(1)}, ${STAR_LAYER_PERIODS[0].toFixed(1)}, 0.13);
  col += shell(p, ${STAR_LAYER_SCALES[1].toFixed(1)}, ${STAR_LAYER_PERIODS[1].toFixed(1)}, 0.41);
  col += shell(p, ${STAR_LAYER_SCALES[2].toFixed(1)}, ${STAR_LAYER_PERIODS[2].toFixed(1)}, 0.67);
  col += shell(p, ${STAR_LAYER_SCALES[3].toFixed(1)}, ${STAR_LAYER_PERIODS[3].toFixed(1)}, 0.89);

  // Comets (shared blooms): bright head + tapering tail along the ray
  // from the vanishing point through the event
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${COMET_LIFE.toFixed(1)}) continue;
    vec2 tp = vec2(b.x * aspect, b.y);
    vec2 dir = normalize(tp - u_vp + 1e-4);
    vec2 head = tp + dir * age * ${COMET_SPEED.toFixed(2)};
    vec2 e = -dir * (0.08 + 0.12 * age); // tail behind the head
    vec2 w = p - head;
    float h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float dist = length(w - e * h);
    float taper = 1.0 - h * 0.85;
    float decay = exp(-age * 0.9);
    col += vec3(1.0) * exp(-dist * dist * 9000.0) * taper * decay;
    col += mix(paletteAt(4.0), vec3(1.0), 0.3) * exp(-dist * dist * 1200.0) * taper * decay * 0.5;
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
  id: 'stars',
  name: 'Stars',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_vp: '2f' },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Nebula stays the live bg; star/comet tints sample the spectrum
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // nebula tint: live background
      hslToHex(h, Math.min(s * 0.7, 40), 7),       // deep space
      hslToHex(h, 8, 95),                          // star white
      hslToHex(h + 30, 40, 80),                    // warm star
      hslToHex(h + 45, 90, 65),                    // comet
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
      u_vp: vpFromTilt(ctx.tiltX, ctx.tiltY, ctx.aspect),
    };
  },
  eventLife: COMET_LIFE,
};
