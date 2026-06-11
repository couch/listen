import{C as p,P as h,a as d}from"./main-T0i9sRV-.js";import{h as u,i as l}from"./ids--mDhdjNR.js";const s=[8,12,18,26],i=[90,60,45,36],c=.3,f=.3,r=4;function v(t,e,a){const o=n=>Math.max(-1,Math.min(n,1));return[a*.5+o(t)*c,.5+o(e)*c]}const m=d+`
uniform vec2 u_vp; // vanishing point, aspect-space

// One shell of stars: a grid in direction-space (q = offset/zoom) whose
// zoom cycles outward; star positions jitter within cells, sizes grow and
// streaks lengthen as the shell approaches.
vec3 shell(vec2 p, float scale, float period, float seedOff) {
  float z = fract(u_time / period + seedOff);
  float zoom = mix(0.12, 2.2, z);
  vec2 off = p - u_vp;
  vec2 q = off / zoom;
  vec2 cell = floor(q * scale);
  float hp = hash(cell + seedOff * 17.0);
  if (hp < 0.86) return vec3(0.0); // empty cell

  // Jitter and radius are cell-relative and kept small enough that the
  // streaked gaussian dies out before the cell boundary (no square cuts)
  vec2 sc = (cell + 0.5 + 0.3 * (vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5)) / scale;
  vec2 d = off - sc * zoom; // screen-space offset from the star
  float r = zoom * (0.035 + 0.045 * hash(cell + 7.7)) / scale;

  // Radial streak: stretch the along-ray axis as the shell speeds up
  vec2 rad = normalize(sc + 1e-5);
  float along = dot(d, rad) / (1.0 + 2.0 * z);
  float perp = dot(d, vec2(-rad.y, rad.x));
  float glow = exp(-(along * along + perp * perp) / (r * r));

  // Fade in at the far end, out as the shell recycles
  float fade = smoothstep(0.0, 0.2, z) * smoothstep(1.0, 0.72, z);
  vec3 starCol = mix(mix(vec3(0.95), paletteAt(2.0), 0.25),
                     paletteAt(3.0), step(0.93, hash(cell + 11.3)));
  return starCol * glow * fade * (0.7 + 0.5 * hp);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_uv;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Deep space + nebula wash tinted by the live bg
  vec3 col = u_palette[1];
  col += u_palette[0] * fbm(p * 1.2 + u_seed + u_time / 180.0) * 0.4;

  col += shell(p, ${s[0].toFixed(1)}, ${i[0].toFixed(1)}, 0.13);
  col += shell(p, ${s[1].toFixed(1)}, ${i[1].toFixed(1)}, 0.41);
  col += shell(p, ${s[2].toFixed(1)}, ${i[2].toFixed(1)}, 0.67);
  col += shell(p, ${s[3].toFixed(1)}, ${i[3].toFixed(1)}, 0.89);

  // Comets (shared blooms): bright head + tapering tail along the ray
  // from the vanishing point through the event
  for (int i = 0; i < BLOOM_SLOTS; i++) {
    vec4 b = u_blooms[i];
    float age = u_time - b.z;
    if (b.z < 0.0 || age < 0.0 || age > ${r.toFixed(1)}) continue;
    vec2 tp = vec2(b.x * aspect, b.y);
    vec2 dir = normalize(tp - u_vp + 1e-4);
    vec2 head = tp + dir * age * ${f.toFixed(2)};
    vec2 e = -dir * (0.08 + 0.12 * age); // tail behind the head
    vec2 w = p - head;
    float h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float dist = length(w - e * h);
    float taper = 1.0 - h * 0.85;
    float decay = exp(-age * 0.9);
    col += vec3(1.0) * exp(-dist * dist * 9000.0) * taper * decay;
    col += mix(paletteAt(4.0), vec3(1.0), 0.3) * exp(-dist * dist * 1200.0) * taper * decay * 0.5;
  }

  // Breathing luminance + faint vignette (house style)
  float breathe = 1.0 + 0.05 * sin(u_time * TAU / 47.0) + 0.03 * sin(u_time * TAU / 31.0);
  vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = mix(1.0, smoothstep(1.4, 0.3, length(cuv)), 0.15);
  col *= breathe * vig;

  vec3 outCol = dither(toSrgb(col), 1.5);

  gl_FragColor = vec4(outCol, u_fade);
}
`,x={id:"stars",name:"Stars",frag:m,uniformSpec:{...p,u_vp:"2f"},buildPalette(t,e){if(e)return[t,...h.slice(1)];const[a,o]=u(t);return[t,l(a,Math.min(o*.7,40),7),l(a,8,95),l(a+30,40,80),l(a+45,90,65)]},initState(t){return{seed:t}},frame(t,e){return{u_time:e.t,u_seed:t.seed,u_palette:e.paletteData,u_paletteCount:e.paletteCount,u_blooms:e.blooms,u_vp:v(e.tiltX,e.tiltY,e.aspect)}},eventLife:r};export{r as COMET_LIFE,f as COMET_SPEED,i as STAR_LAYER_PERIODS,s as STAR_LAYER_SCALES,c as VP_GAIN,x as default,v as vpFromTilt};
