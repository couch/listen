// Underwater caustics — a bright refracted-light web playing over sunlit
// live-bg water, with god rays slanting down from the surface. Tilt moves
// the sun (rays and caustics lean and bend with depth); a tap drops a
// ripple ring that warps the web outward.

import { PRELUDE, COMMON_UNIFORM_SPEC } from './prelude.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl, hslToHex } from '../utils.js';

// Scroll speeds: 3600·s is an integer for both, so the raw u_time scroll
// wraps the hourly clock seamlessly
export const CAUSTIC_SPEEDS = [1 / 45, 1 / 60];
export const CAUSTIC_SCALE = 3.5;
export const RIDGE_POW = 3;
export const SUN_GAIN = 0.4;    // radians of sun lean at full tilt
export const RIPPLE_LIFE = 5;

// Sun direction: straight down at rest, leaning with sideways tilt.
export function sunFromTilt(tiltX) {
  const a = Math.max(-SUN_GAIN, Math.min(tiltX * SUN_GAIN, SUN_GAIN));
  return [Math.sin(a), -Math.cos(a)];
}

const frag = PRELUDE + `
uniform vec2 u_sun; // unit vector, (0,-1) at rest

float ridged(vec2 q) {
  return pow(1.0 - abs(2.0 * vnoise(q) - 1.0), ${RIDGE_POW.toFixed(1)});
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Water body: sunlit live bg near the surface, deepening below
  vec3 col = mix(u_palette[1], u_palette[0], smoothstep(0.0, 0.75, uv.y));

  // Ripple rings (shared blooms) radially displace the caustic sampling
  vec2 disp = vec2(0.0);
  float rim = 0.0;
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${RIPPLE_LIFE.toFixed(1)}) continue;
    vec2 bd = (uv - b.xy) * asp;
    float dist = length(bd);
    float rr = 0.04 + age * 0.11;
    float band = smoothstep(0.045, 0.0, abs(dist - rr)) * exp(-age * 0.7);
    disp += normalize(bd + 1e-5) * band * 0.05;
    rim += band;
  }

  // Light bends with depth: deeper water samples lean along the sun
  vec2 cp = p + u_sun * (1.0 - uv.y) * 0.1 + disp;

  // Caustic web: product of two ridged-noise layers scrolling along the
  // sun. Each layer samples in a rotated frame — unrotated value noise
  // leaves axis-aligned ridges and the web turns rectilinear.
  vec2 drift1 = u_time * ${CAUSTIC_SPEEDS[0].toFixed(5)} * vec2(u_sun.x * 2.0 + 0.6, -1.0);
  vec2 drift2 = u_time * ${CAUSTIC_SPEEDS[1].toFixed(5)} * vec2(u_sun.x * 2.0 - 0.8, 1.0);
  vec2 q1 = mat2(0.955, -0.296, 0.296, 0.955) * cp;  // ~17°
  vec2 q2 = mat2(0.765, 0.644, -0.644, 0.765) * cp;  // ~-40°
  float c1 = ridged(q1 * ${CAUSTIC_SCALE.toFixed(1)} + u_seed + drift1);
  float c2 = ridged(q2 * ${CAUSTIC_SCALE.toFixed(1)} * 1.3 + u_seed * 1.7 + drift2);
  float web = c1 * c2 * 2.5;
  web *= 1.0 - 0.6 * (1.0 - uv.y); // dimmer with depth

  bool pride = u_paletteCount > 8.5;
  vec3 webCol;
  if (pride) {
    // Caustic tint drifts slowly through the spectrum (period 90 s)
    float idx = u_time / 90.0 * 8.0;
    float i0 = mod(floor(idx), 8.0);
    float i1 = mod(i0 + 1.0, 8.0);
    vec3 tint = mix(paletteAt(1.0 + i0), paletteAt(1.0 + i1), smoothstep(0.3, 0.7, fract(idx)));
    webCol = mix(vec3(0.85), tint, 0.45);
  } else {
    webCol = paletteAt(2.0);
  }
  col += webCol * web * 0.5;
  col += webCol * rim * 0.3; // bright ripple rim

  // God rays: streaks along the sun direction, fading with depth
  vec2 perp = vec2(-u_sun.y, u_sun.x);
  float across = dot(p - vec2(0.5 * aspect, 1.0), perp);
  float ray = vnoise(vec2(across * 7.0 + u_seed * 3.1, u_time * 0.05));
  ray = pow(ray, 2.0) * smoothstep(0.35, 1.0, uv.y);
  col += paletteAt(3.0) * ray * 0.3;

  // Swell breathing + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`;

export default {
  id: 'caustics',
  name: 'Caustics',
  frag,
  uniformSpec: { ...COMMON_UNIFORM_SPEC, u_sun: '2f' },
  buildPalette(bgHex, isPride) {
    if (isPride) {
      // Caustic tint cycles the pride spectrum slowly (in-shader)
      return [bgHex, ...PRIDE_COLORS_VIZ.slice(1)];
    }
    const [h, s] = hexToHsl(bgHex);
    return [
      bgHex,                                       // sunlit water: live background
      hslToHex(h + 15, Math.min(s * 0.9, 70), 12), // the deep
      hslToHex(h, 25, 85),                         // caustic light
      hslToHex(h + 10, 20, 75),                    // god ray
      hslToHex(h + 50, 60, 60),                    // glint reserve
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
      u_sun: sunFromTilt(ctx.tiltX),
    };
  },
  eventLife: RIPPLE_LIFE,
};
