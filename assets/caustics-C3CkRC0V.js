import{C as n,P as c,a as d}from"./main-DplLC4XF.js";import{u as p,w as o}from"./ids-C-tL2VXR.js";const s=[1/45,1/60],r=3.5,v=3,a=.4,l=5;function m(t){const e=Math.max(-a,Math.min(t*a,a));return[Math.sin(e),-Math.cos(e)]}const f=d+`
uniform vec2 u_sun; // unit vector, (0,-1) at rest

float ridged(vec2 q) {
  return pow(1.0 - abs(2.0 * vnoise(q) - 1.0), ${v.toFixed(1)});
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
    if (b.z < 0.0 || age < 0.0 || age > ${l.toFixed(1)}) continue;
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
  vec2 drift1 = u_time * ${s[0].toFixed(5)} * vec2(u_sun.x * 2.0 + 0.6, -1.0);
  vec2 drift2 = u_time * ${s[1].toFixed(5)} * vec2(u_sun.x * 2.0 - 0.8, 1.0);
  vec2 q1 = mat2(0.955, -0.296, 0.296, 0.955) * cp;  // ~17°
  vec2 q2 = mat2(0.765, 0.644, -0.644, 0.765) * cp;  // ~-40°
  float c1 = ridged(q1 * ${r.toFixed(1)} + u_seed + drift1);
  float c2 = ridged(q2 * ${r.toFixed(1)} * 1.3 + u_seed * 1.7 + drift2);
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
`,b={id:"caustics",name:"Caustics",frag:f,uniformSpec:{...n,u_sun:"2f"},buildPalette(t,e){if(e)return[t,...c.slice(1)];const[i,u]=p(t);return[t,o(i+15,Math.min(u*.9,70),12),o(i,25,85),o(i+10,20,75),o(i+50,60,60)]},initState(t){return{seed:t}},frame(t,e){return{u_time:e.t,u_seed:t.seed,u_palette:e.paletteData,u_paletteCount:e.paletteCount,u_blooms:e.blooms,u_sun:m(e.tiltX)}},eventLife:l};export{r as CAUSTIC_SCALE,s as CAUSTIC_SPEEDS,v as RIDGE_POW,l as RIPPLE_LIFE,a as SUN_GAIN,b as default,m as sunFromTilt};
