import{C as u,P as p,a as m}from"./main-eSDnRovZ.js";import{q as _,t as l}from"./ids-Dw-4tPH1.js";const f=Math.PI*2,g=48,v=18,b=.015,x=12,e=.13,S=.84,r=24,i=28,n=9,C=.016,A=.7,O=.6,w=.08,F=.04,h=4,c=o=>Math.max(-1,Math.min(1,o));function I(o){const t=o/g;return f*(t-Math.floor(t))}function T(o){const t=o/x;return t-Math.floor(t)}function D(o,t,a,s){const d=b*Math.sin(f*o/v)+c(a)*w;return[t*.5+d,S-c(s)*F]}const $=m+`
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
    if (b.z < 0.0 || age < 0.0 || age > ${h.toFixed(1)}) continue;
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
  float su = (theta / TAU + u_rot / TAU) * ${i.toFixed(1)};
  float sv = r * ${n.toFixed(1)};
  vec3 spotAcc = vec3(0.0);
  bool pride = u_paletteCount > 8.5;
  // Radial sigma outgrows its cell pitch and jitter wanders — evaluate the
  // full 3x3 neighborhood so no spot is sliced at a cell boundary
  for (int du = -1; du <= 1; du++) {
    for (int dv = -1; dv <= 1; dv++) {
      float spoke = floor(su) + float(du);
      float ring = floor(sv) + float(dv);
      if (ring < 0.0) continue;
      vec2 cell = vec2(mod(spoke, ${i.toFixed(1)}), ring);
      float h1 = hash(cell + u_seed);
      if (h1 < 0.62) continue;
      float h2 = hash(cell * 1.7 + u_seed + 3.1);
      float h3 = hash(cell * 2.3 + u_seed + 7.7);
      // Jittered center (±0.2 cell), distances in screen units: tangential
      // = arc length, radial = ring pitch
      float cu = spoke + 0.5 + (h2 - 0.5) * 0.4;
      float cv = ring + 0.5 + (h3 - 0.5) * 0.4;
      float rc = max((cv + 0.0) / ${n.toFixed(1)}, 0.05);
      float dt = (su - cu) * (TAU / ${i.toFixed(1)}) * rc;
      float dr = (sv - cv) / ${n.toFixed(1)};
      float st = ${C.toFixed(3)} * (0.5 + rc);
      float sr = st * (1.0 + ${A.toFixed(1)} * rc);
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
  float spotMask = smoothstep(${(e*1.5).toFixed(3)}, ${(e*2.4).toFixed(3)}, r);
  col += spotAcc * spotMask * ${O.toFixed(2)} * (1.0 + 2.0 * burstLocal);
  col += paletteAt(4.0) * shimmer * 0.25;

  // Hanging rod
  float rod = smoothstep(0.004, 0.0015, abs(p.x - u_ball.x))
    * smoothstep(u_ball.y + ${(e*.9).toFixed(3)}, u_ball.y + ${(e*1.1).toFixed(3)}, p.y);
  col = mix(col, paletteAt(1.0) * 0.8, rod * 0.7);

  // The ball: facet grid on the visible hemisphere, flat-shaded from the
  // facet-center normal (hard mirror-tile edges are the point — bounded
  // inside the disc). asin clamp + atan z-floor guard the pole/rim NaNs.
  float d = length(q);
  float disc = smoothstep(${e.toFixed(3)} + 0.004, ${e.toFixed(3)} - 0.004, d);
  vec2 s = q / ${e.toFixed(3)};
  float zz = sqrt(max(1.0 - dot(s, s), 0.0));
  float lat = asin(clamp(s.y, -0.985, 0.985));
  float lon = atan(s.x, max(zz, 0.05)) + u_rot;
  float pitch = TAU / ${r.toFixed(1)};
  vec2 fc = floor(vec2(lon, lat) / pitch);
  // mod-FACETS keeps facet hashes stable across u_rot's wrap (TAU/pitch is
  // exactly DISCO_FACETS, so the wrap shifts fc.x by a full period)
  float gh = hash(vec2(mod(fc.x, ${r.toFixed(1)}), fc.y) + u_seed * 0.7);
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
  float ho = max(d - ${e.toFixed(3)}, 0.0);
  col += paletteAt(2.0) * exp(-ho * ho * 90.0) * (1.0 - disc) * 0.12;

  // House breathing + faint vignette
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,P={id:"disco",name:"Disco",frag:$,uniformSpec:{...u,u_ball:"2f",u_rot:"1f",u_glint:"1f"},buildPalette(o,t){if(t)return[o,...p.slice(1)];const[a,s]=_(o);return[o,l(a,Math.min(s,50),8),l(a+15,25,82),l(a,8,60),l(a+30,15,93)]},initState(o){return{seed:o}},frame(o,t){return{u_time:t.t,u_seed:o.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_ball:D(t.t,t.aspect,t.tiltX,t.tiltY),u_rot:I(t.t),u_glint:T(t.t)}},eventLife:h};export{e as DISCO_BALL_R,S as DISCO_BALL_Y,F as DISCO_BOB,A as DISCO_ELONG,r as DISCO_FACETS,h as DISCO_FLASH_LIFE,n as DISCO_RINGS,g as DISCO_ROT_PERIOD,i as DISCO_SPOKES,O as DISCO_SPOT_GAIN,C as DISCO_SPOT_R,b as DISCO_SWAY_AMP,v as DISCO_SWAY_PERIOD,w as DISCO_TILT_GAIN,x as GLINT_PERIOD,P as default,D as discoBallPos,T as discoGlintPhase,I as discoRot};
