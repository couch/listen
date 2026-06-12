import{C as c,P as d,a as p}from"./main-BjUTBfvI.js";import{u as f,w as s}from"./ids-Bf9IBoiG.js";const l=[45,30,20],n=[.06,.04,.025],r=[2.5,4,7],h=.5,m=6,b=.12,u=6,x=Math.PI*2;function _(e,t,o=null){const i=o||new Float32Array(l.length);for(let a=0;a<l.length;a++)i[a]=x*e/l[a]+t*(2.3+a*1.7);return i}function v(e){return Math.max(-1,Math.min(e,1))*h}const g=p+`
uniform vec3 u_phase;  // ribbon sway phases
uniform float u_draft; // tilt draft, applied ×y²

// Ribbon centerline x at height y
float ribbonX(float y, float aspect) {
  float cx = 0.5 * aspect;
  cx += ${n[0].toFixed(3)} * (0.2 + y * y) * sin(u_phase.x + y * ${r[0].toFixed(1)});
  cx += ${n[1].toFixed(3)} * (0.2 + y * y) * sin(u_phase.y + y * ${r[1].toFixed(1)});
  cx += ${n[2].toFixed(3)} * (0.2 + y * y) * sin(u_phase.z + y * ${r[2].toFixed(1)});
  cx += 0.06 * y * y * (fbm(vec2(y * 4.0 + u_seed - u_time * 0.06, u_time * 0.1)) - 0.5);
  cx += u_draft * y * y;
  return cx;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);

  // Dim room: live bg, settling toward slot 1 at the edges
  vec3 col = mix(u_palette[0], u_palette[1], smoothstep(0.35, 1.1, length(cuv)) * 0.6);

  bool pride = u_paletteCount > 8.5;

  // The ribbon: thin/bright at the base, wide/faint at the top, doubled
  // by a faint second filament
  float cx = ribbonX(uv.y, aspect);
  float k = mix(4000.0, 250.0, uv.y);          // sharpness falls with height
  float bright = 1.0 - 0.6 * uv.y;
  float dx = p.x - cx;
  float glow = exp(-dx * dx * k);
  float dx2 = p.x - cx - 0.012 - 0.006 * sin(u_phase.x * 1.3);
  glow += 0.5 * exp(-dx2 * dx2 * k * 1.4);
  // Smoke only exists above the ember
  glow *= smoothstep(0.02, 0.1, uv.y);

  vec3 smokeCol;
  if (pride) {
    float idx = (uv.y + u_time / 45.0) * 3.0;
    float i0 = mod(floor(idx), 8.0);
    float i1 = mod(i0 + 1.0, 8.0);
    smokeCol = mix(paletteAt(1.0 + i0), paletteAt(1.0 + i1), smoothstep(0.25, 0.75, fract(idx)));
    smokeCol = mix(smokeCol, vec3(0.85), 0.35); // keep it smoky, not neon
  } else {
    smokeCol = mix(paletteAt(4.0), paletteAt(2.0), smoothstep(0.0, 0.7, uv.y));
  }
  col += smokeCol * glow * bright * 0.8;

  // The ember: a small throbbing coal at the ribbon's base
  vec2 ed = (p - vec2(ribbonX(0.04, aspect), 0.045)) * vec2(1.0, 1.4);
  float throb = 0.75 + 0.25 * sin(u_time * TAU / ${m.toFixed(1)});
  col += paletteAt(4.0) * exp(-dot(ed, ed) * 1500.0) * throb;
  col += vec3(1.0, 0.9, 0.7) * exp(-dot(ed, ed) * 9000.0) * throb * 0.6;

  // Smoke rings (shared blooms): soft ellipse annuli drifting up
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${u.toFixed(1)}) continue;
    vec2 rc = vec2(b.x * aspect, b.y + age * ${b.toFixed(2)});
    vec2 rd = (p - rc) * vec2(1.0, 1.6); // flattened ring, seen at an angle
    float dist = length(rd);
    float rr = 0.03 + age * 0.02;
    float band = smoothstep(0.014, 0.0, abs(dist - rr)) * exp(-age * 0.55);
    col += mix(paletteAt(2.0), vec3(0.8), 0.4) * band * 0.5;
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,A={id:"incense",name:"Incense",frag:g,uniformSpec:{...c,u_phase:"3fv",u_draft:"1f"},buildPalette(e,t){if(t)return[e,...d.slice(1)];const[o,i]=f(e);return[e,s(o,Math.min(i*.8,60),8),s(o,15,75),s(o-20,20,55),s(o+25,85,55)]},initState(e){return{seed:e,phases:new Float32Array(l.length)}},frame(e,t){return{u_time:t.t,u_seed:e.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_phase:_(t.t,e.seed,e.phases),u_draft:v(t.tiltX)}},eventLife:u};export{h as DRAFT_GAIN,m as EMBER_PULSE,n as RIBBON_AMPS,l as RIBBON_PERIODS,r as RIBBON_WINDS,u as RING_LIFE,b as RING_RISE,A as default,v as incenseDraft,_ as ribbonPhases};
