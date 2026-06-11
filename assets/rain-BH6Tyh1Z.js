import{C as I,P as w,a as A}from"./main-B2Dk9lik.js";import{h as R,i as n}from"./ids-v0r2gKiX.js";const l=6,m=[90,72,120,144,60,180],h=[6,9,14],v=[1/20,1/12,1/8],d=-1.6,C=.35,f=.6,M=.5,g=3,i=Math.PI*2,p=e=>e-Math.floor(e);function S(e,t,o,s,c){const r=c||new Float32Array(l*4),_=s>=9;for(let a=0;a<l;a++){const y=m[a],b=m[(a+2)%l],u=p(t*.371+a*.618034)*i,x=p(t*.611+a*.754878)*i;r[a*4]=o*(.5+.4*Math.sin(i*e/y+u)),r[a*4+1]=.5+.42*Math.cos(i*e/b+x),r[a*4+2]=.14+.05*Math.sin(i*e/(a%2?45:36)+u),r[a*4+3]=_?1+a%8:2+a%3}return r}function T(e){const t=Math.max(-f,Math.min(e*f,f));return[Math.sin(t),-Math.cos(t)]}function E(e){return 1+M*Math.min(Math.abs(e),1)}function F(e,t,o){const s=Math.min(Math.max(t,0),.1);for(let c=0;c<e.length;c++)e[c]=p(e[c]+s*v[c]*o);return e}const O=A+`
uniform vec4 u_lights[${l}]; // xy = pos (aspect-space), z = radius, w = palette slot
uniform vec2 u_gravity;                // unit vector, (0,-1) at rest
uniform vec3 u_phase;                  // per-layer fall phase, 0..1

// The world behind the glass: vertical dusk gradient anchored on the live
// bg + big soft light discs. Re-sampleable so drops can refract it.
vec3 bgcol(vec2 p) {
  vec3 c = u_palette[0] * mix(1.0, 0.8, smoothstep(0.4, 1.1, p.y));
  c = mix(c, u_palette[1], smoothstep(0.45, 1.2, p.y) * 0.6);
  for (int i = 0; i < ${l}; i++) {
    vec4 l = u_lights[i];
    vec2 d = p - l.xy;
    c += paletteAt(l.w) * exp(-dot(d, d) / (l.z * l.z)) * 0.55;
  }
  return c;
}

// One drop layer in gravity-rotated space. Returns refraction offset (xy),
// specular highlight (z), and wet-mask (w). The falling drop wobbles wider
// than its own grid column, so the two neighbor columns are evaluated too —
// otherwise drops get sliced by hard column boundaries.
vec4 dropLayer(vec2 rp, float scale, float phase, float seedOff) {
  vec4 acc = vec4(0.0);
  float col0 = floor(rp.x * scale);
  for (int n = -1; n <= 1; n++) {
    float colId = col0 + float(n);
    float hx = hash(vec2(colId * 0.123 + seedOff, seedOff));
    if (hx < 0.22) continue; // dry column

    // The falling drop: cycles down the column with a sine wobble
    float yPos = fract(hx * 13.7 - phase);
    float dropX = (colId + 0.5 + 0.3 * sin(yPos * TAU * 2.0 + hx * TAU)) / scale;
    vec2 c = vec2(dropX, yPos);
    vec2 d = rp - c;
    float r = (0.22 + 0.18 * hx) / scale;
    float inside = smoothstep(r, r * 0.55, length(d));

    vec2 off = d * ${d.toFixed(2)} * inside;
    // Specular dot toward the upper-left of the bead
    vec2 sd = d / r - vec2(-0.35, 0.4);
    float spec = inside * exp(-dot(sd, sd) * 6.0);
    float tIn = 0.0;

    if (n == 0) {
      // Trail: shrinking static beads at the column center (never cross
      // the boundary, so only the home column needs them)
      float above = rp.y - yPos;
      float tEnv = smoothstep(${C.toFixed(2)}, 0.0, above) * step(0.0, above);
      vec2 tc = vec2((colId + 0.5) / scale, (floor(rp.y * scale * 3.0) + 0.5) / (scale * 3.0));
      vec2 td = rp - tc;
      float tr = r * 0.45 * tEnv * (0.4 + 0.6 * hash(vec2(tc.y * 91.7, colId)));
      // step() guard: smoothstep(0, 0, x) is undefined when the trail dies out
      tIn = smoothstep(max(tr, 1e-4), tr * 0.4, length(td)) * step(1e-4, tr);
      off += td * ${d.toFixed(2)} * tIn;
    }

    acc += vec4(off, spec, max(inside, tIn));
  }
  return acc;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Gravity-aligned space: streaks run along the tilt vector
  float ga = atan(u_gravity.x, -u_gravity.y);
  float cs = cos(ga);
  float sn = sin(ga);
  vec2 ctr = vec2(aspect * 0.5, 0.5);
  vec2 rp = mat2(cs, -sn, sn, cs) * (p - ctr) + ctr;

  vec4 acc = vec4(0.0);
  acc += dropLayer(rp, ${h[0].toFixed(1)}, u_phase.x, 1.3);
  acc += dropLayer(rp, ${h[1].toFixed(1)}, u_phase.y, 5.7);
  acc += dropLayer(rp, ${h[2].toFixed(1)}, u_phase.z, 9.1);

  // Static micro-droplets that slowly evaporate and respawn
  float era = floor(u_time / 20.0);
  vec2 mg = rp * 16.0;
  vec2 mCell = floor(mg);
  float mh = hash(mCell * 0.137 + era * 0.731 + u_seed * 0.01);
  if (mh > 0.55) {
    vec2 mc = (mCell + 0.5 + 0.5 * (vec2(hash(mCell + 7.0), hash(mCell + 13.0)) - 0.5)) / 16.0;
    vec2 md = rp - mc;
    float mr = (0.05 + 0.1 * mh) / 16.0;
    float mIn = smoothstep(mr, mr * 0.4, length(md));
    acc.xy += md * ${d.toFixed(2)} * mIn;
    acc.w = max(acc.w, mIn * 0.7);
  }

  // Rotate refraction offsets back to screen space
  vec2 off = mat2(cs, sn, -sn, cs) * acc.xy;

  // Splats (shared blooms): expanding refractive ring + bright rim
  float splat = 0.0;
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${g.toFixed(1)}) continue;
    vec2 bd = (uv - b.xy) * asp;
    float dist = length(bd);
    float rr = 0.03 + age * 0.09;
    float band = smoothstep(0.02, 0.0, abs(dist - rr)) * exp(-age * 1.2);
    off += normalize(bd + 1e-5) * band * 0.05;
    splat += band;
  }

  vec3 col = bgcol(p + off);
  col *= mix(1.0, 1.3, acc.w);             // wet beads catch more light
  // Specular stays near-white even when slot 5 is a deep pride color
  vec3 specCol = mix(vec3(1.0), paletteAt(5.0), 0.4);
  col += specCol * acc.z * 0.6;            // glints on the beads
  col += specCol * splat * 0.25;           // splat rim sparkle

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,N={id:"rain",name:"Rain",frag:O,uniformSpec:{...I,u_lights:"4fv",u_gravity:"2f",u_phase:"3fv"},buildPalette(e,t){if(t)return[e,...w.slice(1)];const[o,s]=R(e);return[e,n(o,Math.min(s*.8,70),12),n(o+30,80,55),n(o-50,70,50),n(o+70,85,60),n(o+10,15,85)]},initState(e){return{seed:e,lights:new Float32Array(l*4),phases:null}},frame(e,t){const o=E(t.tiltY);return e.phases===null?e.phases=new Float32Array(v.map(s=>p(t.t*s))):F(e.phases,t.dt,o),{u_time:t.t,u_seed:e.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_lights:S(t.t,e.seed,t.aspect,t.paletteCount,e.lights),u_gravity:T(t.tiltX),u_phase:e.phases}},eventLife:g};export{l as BOKEH_COUNT,m as BOKEH_PERIODS,f as RAIN_GRAV_GAIN,h as RAIN_LAYER_SCALES,M as RAIN_RATE_GAIN,d as RAIN_REFRACT,v as RAIN_SPEEDS,C as RAIN_TRAIL,g as SPLAT_LIFE,S as computeBokehLights,N as default,T as gravityFromTilt,E as rainRate,F as stepRainPhases};
