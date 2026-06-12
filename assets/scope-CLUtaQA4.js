import{C as L,P as T,a as G}from"./main-DP0h6V2S.js";import{u as R,w as l}from"./ids-5mOaK_zc.js";const F=[[1,2],[2,3],[3,4],[3,5],[4,5],[5,6]],s=80,h=30,g=4,U=12,D=.15,w=3,S=.13,M=Math.PI*2,P=e=>e-Math.floor(e),j=e=>(e%6+6)%6;function E(e,t){return F[j(Math.floor(e*7.31)+t)]}function O(e,t,o=0){const a=Math.floor(e/h)+o,r=e-Math.floor(e/h)*h,c=r>=g?1:.5-.5*Math.cos(r/g*Math.PI);return{idx:a,pairA:E(t,a-1),pairB:E(t,a),mix:c}}function B(e,t,o,a,r,c,C=null){const u=C||new Float32Array((s+1)*2),{pairA:m,pairB:d,mix:p}=O(e,t,c),f=M*P(t*.37),y=.36*o,I=.36;for(let n=0;n<=s;n++){const i=M*n/s,b=Math.sin(m[0]*i+f),_=Math.sin(m[1]*i),A=Math.sin(d[0]*i+f),x=Math.sin(d[1]*i),v=Math.sin(2*i+f*1.7);u[n*2]=.5*o+y*(b+(A-b)*p)+v*a*S,u[n*2+1]=.5+I*(_+(x-_)*p)+v*r*S}return u}const N=G+`
#define SEGS ${s}

uniform vec2 u_curve[SEGS + 1]; // polyline in aspect-space (from JS)
uniform float u_head;           // beam head position along s, 0..1
uniform float u_beamSlot;       // palette slot of the beam (pride cycling)

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Geometry from the minimum segment distance (one smooth line, no seam
  // double-counts); brightness from a distance-weighted AVERAGE over nearby
  // segments — where strands cross or the nearest branch flips, the head/
  // pulse brightness blends instead of jumping.
  float dMin2 = 1e3;
  float wSum = 1e-6;
  float brSum = 0.0;
  for (int i = 1; i <= SEGS; i++) {
    vec2 a = u_curve[i - 1];
    vec2 e = u_curve[i] - a;
    vec2 w = p - a;
    float h = clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
    vec2 dv = w - e * h;
    float d2 = dot(dv, dv);
    dMin2 = min(dMin2, d2);
    if (d2 > 0.03) continue; // beyond glow influence

    // Phosphor persistence: bright at the sweeping head, decaying behind
    float sI = (float(i) - 1.0 + h) / float(SEGS);
    float behind = fract(u_head - sI);
    float br = 0.25 + 0.75 * exp(-behind * 5.0);

    // Tap pulses race along the trace
    for (int j = 0; j < BLOOM_SLOTS; j++) {
      vec4 b = u_blooms[j];
      float age = u_time - b.z;
      if (b.z < 0.0 || age < 0.0 || age > ${w.toFixed(1)}) continue;
      float s0 = fract(b.x + b.y * 3.7);
      float dd = abs(fract(sI - s0 - age * ${D.toFixed(2)} + 0.5) - 0.5);
      br += 2.5 * smoothstep(0.05, 0.0, dd) * exp(-age * 1.2);
    }

    float wgt = exp(-d2 * 400.0);
    wSum += wgt;
    brSum += wgt * br;
  }
  float br = brSum / wSum;

  // The tube: near-black field washed with the beam color
  vec3 beamCol = paletteAt(u_beamSlot);
  vec3 col = u_palette[1] + beamCol * 0.12;

  // Beam: tight core glow + wide halo, all in the beam color
  float glow = exp(-dMin2 * 2600.0);
  float halo = exp(-dMin2 * 60.0);
  col += beamCol * glow * br * 1.1;
  col += beamCol * halo * 0.22;
  // White-hot center where the beam is freshest (stays bright in pride)
  col += mix(vec3(1.0), paletteAt(4.0), 0.3) * smoothstep(0.55, 1.0, glow * br) * 0.7;

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,H={id:"scope",name:"Scope",frag:N,uniformSpec:{...L,u_curve:"2fv",u_head:"1f",u_beamSlot:"1f"},buildPalette(e,t){if(t)return[e,...T.slice(1)];const[o,a]=R(e);return[e,l(o,Math.min(a*.5,30),6),l(o,Math.min(a*.8,60),30),l(o+60,90,65),l(o,5,95)]},initState(e){return{seed:e,figureOffset:0,curve:new Float32Array((s+1)*2)}},frame(e,t){const o=t.paletteCount>=9,{idx:a}=O(t.t,e.seed,e.figureOffset);return{u_time:t.t,u_seed:e.seed,u_palette:t.paletteData,u_paletteCount:t.paletteCount,u_blooms:t.blooms,u_curve:B(t.t,e.seed,t.aspect,t.tiltX,t.tiltY,e.figureOffset,e.curve),u_head:P(t.t/U),u_beamSlot:o?1+(a%8+8)%8:0}},trackEvent(e,t){e.figureOffset+=1},eventLife:w};export{h as FIGURE_HOLD,g as FIGURE_MORPH,U as HEAD_PERIOD,w as PULSE_LIFE,D as PULSE_SPEED,F as SCOPE_PAIRS,s as SCOPE_SEGMENTS,S as SCOPE_TILT_GAIN,H as default,O as figureMorph,E as pickLissajousPair,B as scopePoints};
