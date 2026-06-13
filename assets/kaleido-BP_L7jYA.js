import{C as w,P as I,a as M}from"./main-DplLC4XF.js";import{u as D,w as i}from"./ids-C-tL2VXR.js";const u=[6,8,10,12],C=240,P=.985,O=.8,v=.5,R=.3,d=6,T=45,k=[1.2,1.6,2],g=Math.PI*2,A=e=>e-Math.floor(e),S=e=>A(Math.sin(e*12.9898)*43758.5453);function x(e){return u[(e%u.length+u.length)%u.length]}function F(e,t){return g*e/C+t*R}function K(e,t,a,n,p,E=null){const s=E||new Float32Array(d*4),y=n>=9;for(let o=0;o<d;o++){const f=k[o%k.length],l=Math.floor(e/f+o*.37),m=A(e/f+o*.37),h=Math.sin(Math.PI*Math.min(m*2,1)),_=S(l+t*7.13+o*71.7),r=S(_*117.31+o),c=.09+.3*(.5+.5*Math.sin(g*e/T+o*1.05)),b=g*_;s[o*4]=c*Math.cos(b),s[o*4+1]=c*Math.sin(b),s[o*4+2]=(.018+.022*r)*h,s[o*4+3]=y?1+(l+o)%8:2+(l+o)%4}if(p){const o=e-p.at;if(o>=0&&o<v){const f=1-o/v,l=(p.x-.5)*a,m=p.y-.5,h=Math.hypot(l,m),_=Math.atan2(m,l);for(let r=0;r<3;r++){const c=_+(r-1)*.45;s[r*4]=h*Math.cos(c),s[r*4+1]=h*Math.sin(c),s[r*4+2]=.05*f,s[r*4+3]=y?1+r*3:2+r}}}return s}const L=M+`
uniform sampler2D u_prevFrame;
uniform float u_k;       // wedge count (symmetry order)
uniform float u_decay;   // 0.985 normally, 0.8 briefly after a re-seed
uniform float u_precess; // symmetry-axis rotation
uniform vec4 u_sparks[${d}];

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 cp = vec2(0.5 * aspect, 0.5);
  vec2 c = vec2(uv.x * aspect, uv.y) - cp;

  // Fold the previous frame: slight outward zoom, rotate into the wedge
  // frame, mirror-fold the angle, rotate back, sample
  float r = length(c) / 1.01;
  float ang = atan(c.y, c.x) - u_precess;
  float w = TAU / u_k;
  float a = mod(ang, w);
  if (a > w * 0.5) a = w - a;
  float sa = a + u_precess;
  vec2 sp = cp + r * vec2(cos(sa), sin(sa));
  vec3 prev = texture2D(u_prevFrame, vec2(sp.x / aspect, sp.y)).rgb;

  // Decay toward a bg-tinted floor (never black — invariant 1), with an
  // extra rim damp so edge-clamp smears die out
  vec3 floorCol = toSrgb(u_palette[0]) * 0.18;
  vec3 col = mix(floorCol, prev, u_decay * smoothstep(0.8, 0.55, length(c)));

  // Live-bg halo around the mandala. It sits OUTSIDE the feedback damp
  // zone (damp = 0 past r 0.8), so re-adding it each frame is stable —
  // any additive term inside the loop would compound by 1/(1−decay).
  col += toSrgb(u_palette[0]) * 0.5 * smoothstep(0.78, 1.0, length(c));

  // Sparks: the seeds the fold replicates into symmetry
  for (int j = 0; j < ${d}; j++) {
    vec4 s = u_sparks[j];
    if (s.z < 0.002) continue;
    vec2 d = c - s.xy;
    col += toSrgb(paletteAt(s.w)) * exp(-dot(d, d) / (s.z * s.z)) * 0.8;
  }

  // Procedural mandala base, self-regulating: visible only where the
  // feedback field is still empty — first frames after open/re-seed, and
  // the single reduced-motion frame (which never accumulates)
  float lum = dot(prev, vec3(0.333));
  float flower = smoothstep(0.45, 0.8, fbm(vec2(r * 5.0, a * 6.0 + u_seed)))
               * smoothstep(0.7, 0.25, r);
  vec3 flowerCol = mix(paletteAt(2.0), paletteAt(4.0), 0.5 + 0.5 * sin(r * 9.0 + u_seed));
  col += toSrgb(flowerCol) * flower * 0.55 * smoothstep(0.22, 0.04, lum);

  // No breathing/dither here: anything multiplied into the feedback loop
  // compounds frame over frame. The present pass dithers.
  gl_FragColor = vec4(col, u_fade);
}
`,U={id:"kaleido",name:"Kaleido",frag:L,feedback:!0,uniformSpec:{...w,u_prevFrame:"tex",u_k:"1f",u_decay:"1f",u_precess:"1f",u_sparks:"4fv"},buildPalette(e,t){if(t)return[e,...I.slice(1)];const[a,n]=D(e);return[e,i(a,Math.min(n*.8,60),12),i(a+40,85,60),i(a-40,75,55),i(a+90,70,65),i(a+10,10,90)]},initState(e){return{seed:e,kIdx:Math.floor(e)%u.length,reseedAt:-1e9,burst:null,sparks:new Float32Array(d*4)}},frame(e,t){t.t<e.reseedAt&&(e.reseedAt=-1e9),e.burst&&t.t<e.burst.at&&(e.burst=null);const a=t.t-e.reseedAt<v;return{u_time:t.t,u_seed:e.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_k:x(e.kIdx),u_decay:a?O:P,u_precess:F(t.t,t.tiltX),u_sparks:K(t.t,e.seed,t.aspect,t.paletteCount,e.burst,e.sparks)}},tap(e,t,a,n){e.reseedAt=n,e.burst={at:n,x:t,y:a}},trackEvent(e,t){e.kIdx+=1,e.burst={at:t,x:.58,y:.6}},eventLife:8};export{P as KALEIDO_DECAY,u as KALEIDO_KS,R as KALEIDO_TILT_GAIN,C as PRECESS_PERIOD,O as RESEED_DECAY,v as RESEED_T,T as SPARK_ORBIT,k as SPARK_PERIODS,d as SPARK_SLOTS,K as computeKaleidoSparks,U as default,x as kForIndex,F as kaleidoPrecession};
