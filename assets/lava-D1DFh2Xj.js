import{C as V,P as E,a as O}from"./main-B2Dk9lik.js";import{h as I,i as v}from"./ids-v0r2gKiX.js";const f=5,L=2,S=f+L,C=.15,R=[120,90,144,180,72],P=[60,80,48,90,72],B=[30,36,40,45,60],D=.35,F=3,M=.25,z=.18,d=8,U=.05,x=.25,h=Math.PI*2,A=o=>o-Math.floor(o);function H(o){return o<0?0:Math.exp(-o/F)}function k(o,t,i,a=2.5){let l=-1,r=1/0;for(let n=0;n<f;n++){const _=o[n*4+2];if(_<=0)continue;const s=Math.hypot(t-o[n*4],i-o[n*4+1]);s<=_*a&&s<r&&(r=s,l=n)}return l}function N(o,t,i,a,l,r,n,_){const s=_||new Float32Array(S*4),y=r>=9;for(let e=0;e<f;e++){const u=A(t*.317+e*.618034)*h,c=A(t*.731+e*.754878)*h,b=.7+.5*A(t*.521+e*.829),T=.12+.76*A(t*.618034+e*.618034);let p=.5+.42*Math.sin(h*o/R[e]+u),g=T*i+.08*Math.sin(h*o/P[e]+c),m=C+.04*Math.sin(h*o/B[e]+c);const w=H(o-n.heat[e]);m*=1+D*w,p+=Math.min(M,M*(o-n.heat[e]))*w,g+=a*x*b,p+=l*.12*b,m*=1-.2*Math.min(Math.abs(p-.5)*2,1),s[e*4]=g,s[e*4+1]=p,s[e*4+2]=m,s[e*4+3]=y?1+(e*3+Math.floor(t))%8:2+e%2}for(let e=0;e<L;e++){const u=n.sats[e],c=o-u.born,b=(f+e)*4;if(u.born<0||c<0||c>d){s[b+2]=0;continue}s[b]=u.x+.03*Math.sin(h*c/4)+a*x,s[b+1]=u.y+c*U+l*.12,s[b+2]=.07*Math.min(1,c*2)*Math.min(1,(d-c)/2),s[b+3]=u.slot}return s}const W=O+`
#define LAVA_SLOTS ${S}

uniform vec4 u_blobs[LAVA_SLOTS]; // xy = aspect-space pos, z = radius, w = palette slot

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Faint heat shimmer warps the sample position
  vec2 sh = vec2(fbm(p * 3.0 + u_seed + u_time * 0.08),
                 fbm(p * 3.0 + u_seed + 4.7 - u_time * 0.08));
  vec2 sp = p + 0.015 * (sh - 0.5);

  // Metaball field; wax color = field-weighted blend of per-blob colors,
  // so merging blobs smear their hues into each other
  float f = 0.0;
  vec3 waxAcc = vec3(0.0);
  for (int i = 0; i < LAVA_SLOTS; i++) {
    vec4 b = u_blobs[i];
    if (b.z <= 0.0) continue;
    vec2 d = sp - b.xy;
    float c = b.z * b.z / (dot(d, d) + 1e-4);
    f += c;
    waxAcc += paletteAt(b.w) * c;
  }
  vec3 waxCol = waxAcc / max(f, 1e-4);

  // Liquid: the live bg, shaded darker toward the lamp's base
  vec3 col = u_palette[0] * mix(0.85, 1.05, uv.y);

  // Wax body with depth shading and a bright inner core
  float body = smoothstep(1.0, 1.18, f);
  vec3 wax = waxCol * mix(0.8, 1.3, smoothstep(1.0, 2.6, f));
  col = mix(col, wax, body);

  // Rim light hugging the surface threshold
  float rim = smoothstep(1.0, 1.06, f) - smoothstep(1.06, 1.3, f);
  col += mix(waxCol, vec3(1.0), 0.55) * rim * 0.45;

  // Heat-ripple rings (shared blooms, faint)
  vec2 asp = vec2(aspect, 1.0);
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > 8.0) continue;
    float d = length((uv - b.xy) * asp);
    float r = 0.05 + age * 0.08;
    float w = 0.02 + age * 0.02;
    float band = smoothstep(w, 0.0, abs(d - r));
    col += paletteAt(min(b.w, u_paletteCount - 1.0)) * band * 0.4 * exp(-age * 0.45);
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * asp;
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,J={id:"lava",name:"Lava",frag:W,uniformSpec:{...V,u_blobs:"4fv"},buildPalette(o,t){if(t)return[o,...E.slice(1)];const[i,a]=I(o);return[o,v(i,Math.min(a*.9,80),10),v(i+25,Math.min(a*1.2,90),38),v(i+40,90,60)]},initState(o){return{seed:o,aspect:1,heat:new Float64Array(f).fill(-1e9),sats:Array.from({length:L},()=>({born:-1,x:0,y:0,slot:3})),blobs:new Float32Array(S*4)}},frame(o,t){return o.aspect=t.aspect,N(t.t,o.seed,t.aspect,t.tiltX,t.tiltY,t.paletteCount,o,o.blobs),{u_time:t.t,u_seed:o.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_blobs:o.blobs}},tap(o,t,i,a){const l=k(o.blobs,t*o.aspect,i);if(!(l<0)){if(o.blobs[l*4+2]>z){const r=o.sats.find(n=>n.born<0||a-n.born>d||a<n.born);if(r){r.born=a,r.x=o.blobs[l*4],r.y=o.blobs[l*4+1],r.slot=o.blobs[l*4+3];return}}o.heat[l]=a}},trackEvent(o,t){let i=0;for(let a=1;a<f;a++)o.blobs[a*4+2]>o.blobs[i*4+2]&&(i=a);o.heat[i]=t},eventLife:8};export{f as LAVA_BLOBS,M as LAVA_HEAT_RISE,D as LAVA_HEAT_SWELL,F as LAVA_HEAT_TAU,R as LAVA_RISE_PERIODS,C as LAVA_R_BASE,B as LAVA_R_PERIODS,L as LAVA_SATS,d as LAVA_SAT_LIFE,U as LAVA_SAT_RISE,S as LAVA_SLOTS,z as LAVA_SPLIT_R,x as LAVA_TILT_GAIN,P as LAVA_X_PERIODS,N as computeLavaBlobs,J as default,H as lavaHeatBoost,k as nearestBlob};
