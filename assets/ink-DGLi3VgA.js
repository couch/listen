import{C as u,P as r,a as c}from"./main-DplLC4XF.js";import{u as m,w as a}from"./ids-C-tL2VXR.js";const o=25,n=.04,d=.02,v=.05,_=18,l=.5;function p(t,e){const i=s=>Math.max(-1,Math.min(s,1));return[i(t)*l,i(e)*l]}const f=c+`
uniform vec2 u_lean;

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;

  // Still water: the live bg, faintly brighter toward the surface, with
  // slow dilute wisps drifting through so the field is alive before any
  // drop has fallen
  vec3 col = u_palette[0] * mix(0.96, 1.04, uv.y);
  vec2 wp = vec2(uv.x * aspect, uv.y);
  float wisp = smoothstep(0.55, 0.95, fbm(wp * 1.6 + u_seed + vec2(u_time * 0.013, -u_time * 0.008)));
  col *= mix(vec3(1.0), u_palette[3] * 1.3, wisp * 0.18);

  bool pride = u_paletteCount > 8.5;
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${o.toFixed(1)}) continue;

    // Plume-local coordinates: subtract the risen, leaned path
    vec2 q = (uv - b.xy) * vec2(aspect, 1.0);
    q -= age * vec2(u_lean.x * ${n.toFixed(3)} * 2.0,
                    ${n.toFixed(3)} * (1.0 + 0.5 * u_lean.y));

    float sigma = ${v.toFixed(3)} * (1.0 + min(age, 1.0)) + ${d.toFixed(3)} * age;
    float r2 = dot(q, q);
    if (r2 > sigma * sigma * 9.0) continue; // spatial early-out

    // Curl: value-noise swirl bends the plume into tendrils as it climbs
    vec2 cw = vec2(vnoise(q * 2.4 + b.w * 7.3 + 3.7),
                   vnoise(q * 2.4 + b.w * 7.3 + 8.1)) - 0.5;
    q += min(age * 0.09, 0.9) * cw;

    // Billowy density: clumped fbm inside a widening, diluting envelope
    float env = exp(-dot(q, q) / (sigma * sigma))
              * exp(-age / ${_.toFixed(1)})
              * min(1.0, age * 3.0)
              * smoothstep(${o.toFixed(1)}, ${(o-5).toFixed(1)}, age);
    float dens = smoothstep(0.18, 0.62, fbm(q * 4.0 + b.w * 11.0 + u_seed)) * env;

    // Absorption: ink multiplies the light away (order-independent)
    vec3 inkCol = pride
      ? paletteAt(max(b.w, 1.0))
      : mix(u_palette[3], u_palette[1], min(dens * 1.6, 1.0));
    col *= mix(vec3(1.0), inkCol * 1.1, min(dens * 1.8, 1.0));
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,b={id:"ink",name:"Ink",frag:f,uniformSpec:{...u,u_lean:"2f"},buildPalette(t,e){if(e)return[t,...r.slice(1)];const[i]=m(t);return[t,a(i+180,70,22),a(i+150,60,32),a(i+180,40,55)]},initState(t){return{seed:t}},frame(t,e){return{u_time:e.t,u_seed:t.seed,u_palette:e.paletteData,u_paletteCount:e.paletteCount,u_blooms:e.blooms,u_lean:p(e.tiltX,e.tiltY)}},eventLife:o};export{_ as INK_DILUTE_TAU,o as INK_LIFE,n as INK_RISE,v as INK_SIGMA0,d as INK_SPREAD,l as INK_TILT_GAIN,b as default,p as inkLean};
