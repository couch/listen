import{C as c,P as p,a as m}from"./main-hIPNpFcd.js";import{q as h,t as n}from"./ids-CJuwb7jW.js";const r=[180,240],s=.15,u=12,_=.08,l=12,v=.45,d=.16,f=Math.PI*2;function b(t,e,o=null){const i=o||new Float32Array(2);return i[0]=s*Math.sin(f*t/r[0]+e*1.3),i[1]=s*Math.sin(f*t/r[1]+e*2.7),i}function g(t){if(t<=0||t>=l)return 0;const e=Math.min(t/4,1),o=Math.min((l-t)/4,1);return e*e*(3-2*e)*o*o*(3-2*o)}const x=m+`
uniform vec2 u_drift;
uniform vec2 u_tilt;

// Elevation: drifting fbm landscape + transient tapped peaks (the blooms)
float elevation(vec2 p) {
  float e = fbm(p * 2.0 + u_seed + u_drift);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${l.toFixed(1)}) continue;
    float grow = smoothstep(0.0, 4.0, age);
    float erode = smoothstep(0.0, 4.0, ${l.toFixed(1)} - age);
    vec2 d = (vec2(p.x, p.y) - vec2(b.x * (u_resolution.x / u_resolution.y), b.y));
    e += ${v.toFixed(2)} * grow * erode
       * exp(-dot(d, d) / (${d.toFixed(2)} * ${d.toFixed(2)}));
  }
  return e;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Tilt parallax: high ground shifts more (2.5D pop). The base elevation
  // decides the shift, then the shifted field is what gets drawn.
  float e0 = elevation(p);
  float e = elevation(p + u_tilt * ${_.toFixed(2)} * e0);

  // Paper: the live bg verbatim + fiber grain
  vec3 col = u_palette[0];
  col *= 1.0 + 0.02 * (fbm(p * 30.0 + u_seed) - 0.5) * 2.0;

  // Hypsometric tint, very subtle (pride: bands cycle the spectrum slots 3-8)
  bool pride = u_paletteCount > 8.5;
  if (pride) {
    col = mix(col, paletteAt(3.0 + mod(floor(e * 6.0), 6.0)), 0.06);
  } else {
    col = mix(col, mix(paletteAt(3.0), paletteAt(4.0), clamp(e, 0.0, 1.0)), 0.08);
  }

  // Contour lines: fixed-width bands of the fractional elevation —
  // hand-drawn look, no derivatives extension needed
  float band = abs(fract(e * ${u.toFixed(1)}) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.0, 0.09, band);
  float bandIdx = abs(fract(e * ${u.toFixed(1)} / 5.0) - 0.5) * 2.0;
  float index = 1.0 - smoothstep(0.0, 0.035, bandIdx);

  col = mix(col, paletteAt(1.0), line * 0.45);
  col = mix(col, paletteAt(2.0), index * 0.55);

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  // Heavier grain dither: paper tooth
  vec3 outCol = dither(toSrgb(col), 2.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,T={id:"topo",name:"Topo",frag:x,uniformSpec:{...c,u_drift:"2f",u_tilt:"2f"},buildPalette(t,e){const[o,i,a]=h(t);return e?[t,n(o,Math.min(i,35),Math.max(a-35,12)),n(o,Math.min(i,40),Math.max(a-45,8)),...p.slice(1,7)]:[t,n(o,Math.min(i,35),Math.max(a-35,12)),n(o,Math.min(i,40),Math.max(a-45,8)),n(o-20,25,Math.min(a+6,90)),n(o+20,30,Math.min(a+12,92))]},initState(t){return{seed:t,drift:new Float32Array(2)}},frame(t,e){return{u_time:e.t,u_seed:t.seed,u_palette:e.paletteData,u_paletteCount:e.paletteCount,u_blooms:e.blooms,u_drift:b(e.t,t.seed,t.drift),u_tilt:[e.tiltX,e.tiltY]}},eventLife:l};export{v as PEAK_HEIGHT,l as PEAK_LIFE,d as PEAK_SIGMA,u as TOPO_CONTOURS,s as TOPO_DRIFT_AMP,r as TOPO_DRIFT_PERIODS,_ as TOPO_TILT_GAIN,T as default,g as peakEnvelope,b as topoDriftOffsets};
