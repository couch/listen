import{C as r,P as u,a as f}from"./main-CI7Q_N02.js";import{u as p,w as s}from"./ids-C-tL2VXR.js";const l=3,c=[120,90,144],d=60,h=.3,_=.5,m=.15,v=.25,n=6,g=Math.PI*2;function y(e,t,o=null){const i=o||new Float32Array(l);for(let a=0;a<l;a++)i[a]=t*(1.7+a*.93)+e/c[a];return i}function A(e,t){return h*Math.sin(g*e/d)+t*_}const b=f+`
uniform vec3 u_phase;  // per-layer curtain flow phase
uniform float u_wind;  // sway offset (autonomous + tilt)
uniform float u_lift;  // curtain height offset from forward tilt

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Dusk: deep slot 1 sky settling into a live-bg horizon glow
  vec3 col = mix(u_palette[0], u_palette[1], smoothstep(0.12, 0.75, uv.y));

  // Sparse twinkling stars in the upper sky — soft round points at
  // jittered cell positions, not flat cell squares
  vec2 sg = floor(p * 90.0);
  float sh = hash(sg + u_seed);
  vec2 sc = (sg + 0.5 + 0.6 * (vec2(hash(sg + 1.7), hash(sg + 3.1)) - 0.5)) / 90.0;
  float sd = length(p - sc) * 90.0;
  float twinkle = 0.4 + 0.6 * hash(sg + floor(u_time / 4.0));
  float star = step(0.985, sh) * twinkle * exp(-sd * sd * 6.0) * smoothstep(0.45, 0.75, uv.y);
  col += mix(vec3(1.0), paletteAt(5.0), 0.6) * star * 0.6;

  // Shimmer pulses (shared blooms): bright patches rising from the tap
  float pulse = 0.0;
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${n.toFixed(1)}) continue;
    vec2 d = vec2((uv.x - b.x) * aspect / 0.12, (uv.y - (b.y + age * ${v.toFixed(2)})) / 0.18);
    pulse += exp(-dot(d, d)) * exp(-age * 0.5);
  }

  // Three curtain layers, additive, back to front
  bool pride = u_paletteCount > 8.5;
  for (int i = 0; i < ${l}; i++) {
    float fi = float(i);
    float phase = i == 0 ? u_phase.x : (i == 1 ? u_phase.y : u_phase.z);
    float depth = 0.6 + 0.3 * fi;
    float xs = p.x * 1.5 + phase + u_wind * depth;

    // Curtain centerline: deep rippling height, layers well separated
    float h = 0.42 + fi * 0.12 + 0.22 * (fbm(vec2(xs * 1.6, fi * 7.3)) - 0.5) + u_lift;

    // Asymmetric band: crisp lower edge, glow fading upward
    float dy = uv.y - h;
    float band = dy < 0.0 ? exp(-dy * dy * 200.0) : exp(-dy * dy * 25.0);

    // Folds and gaps along the curtain (squared for contrast), then rays
    float fold = vnoise(vec2(xs * 1.1, fi * 3.7));
    band *= 0.1 + 0.9 * fold * fold;
    band *= 0.5 + 0.5 * vnoise(vec2(xs * 26.0, uv.y * 2.0));
    band *= 1.0 + 2.0 * pulse;

    // Color climbs from base to fringe with height above the centerline
    vec3 cc;
    if (pride) {
      float idx = xs * 1.2 + u_time / 45.0;
      float i0 = mod(floor(idx), 8.0);
      float i1 = mod(i0 + 1.0, 8.0);
      cc = mix(paletteAt(1.0 + i0), paletteAt(1.0 + i1), smoothstep(0.25, 0.75, fract(idx)));
    } else {
      cc = mix(paletteAt(2.0), paletteAt(3.0), smoothstep(0.0, 0.25, dy));
      cc += paletteAt(4.0) * smoothstep(0.1, 0.3, dy) * 0.5;
    }
    col += cc * band * (0.5 - 0.125 * fi);
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,R={id:"aurora",name:"Aurora",frag:b,uniformSpec:{...r,u_phase:"3fv",u_wind:"1f",u_lift:"1f"},buildPalette(e,t){if(t)return[e,...u.slice(1)];const[o,i]=p(e);return[e,s(o-30,Math.min(i*.9,60),9),s(o+90,75,55),s(o+140,65,45),s(o+60,55,70),s(o,12,92)]},initState(e){return{seed:e,phases:new Float32Array(l)}},frame(e,t){return{u_time:t.t,u_seed:e.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_phase:y(t.t,e.seed,e.phases),u_wind:A(t.t,t.tiltX),u_lift:t.tiltY*m}},eventLife:n};export{c as AURORA_FLOW,l as AURORA_LAYERS,m as AURORA_LIFT_GAIN,_ as AURORA_TILT_GAIN,n as SHIMMER_LIFE,v as SHIMMER_RISE,h as WIND_AMP,d as WIND_PERIOD,y as auroraPhases,A as computeAuroraWind,R as default};
