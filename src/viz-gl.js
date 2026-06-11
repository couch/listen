// WebGL plumbing for the visualizer: one fullscreen triangle shared by all
// visualization programs. Each visualization registers its fragment shader
// source and uniform spec; compilation is lazy (first use), and all uniform
// state lives in JS and is uploaded every frame — so context restore is just
// "mark programs stale and recompile on next render". GLSL ES 1.00 so the
// same source runs on webgl2 and webgl1.
//
// During a visualization crossfade two programs render back-to-back: the
// outgoing one opaque, the incoming one alpha-blended at the fade level
// (every fragment shader ends with `gl_FragColor = vec4(outCol, u_fade)`).
//
// Programs registered with { feedback: true } render via FBO ping-pong:
// the viz pass draws into a write texture sampling the previous frame
// (`u_prevFrame`, spec tag 'tex'), then a shared present pass blits to the
// screen, applying the crossfade alpha and IGN dither there — so feedback
// visualizations crossfade exactly like single-pass ones.

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Present pass for feedback programs: blit the freshly written texture to
// the screen, dithering here (the stored field stays clean — dither in the
// loop would accumulate) and carrying the crossfade alpha.
const PRESENT_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_fade;
varying vec2 v_uv;
void main() {
  vec3 c = texture2D(u_tex, v_uv).rgb;
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  c += (ign - 0.5) * 1.5 / 255.0;
  gl_FragColor = vec4(c, u_fade);
}
`;

function compile(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('viz shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createVizGL(canvas) {
  const opts = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;

  // id → { src, spec, opts, program, loc } — program null until first use/restore
  const programs = new Map();
  let buf = null;
  let lost = false;
  let lostCb = null;
  let restoredCb = null;
  let width = canvas.width;
  let height = canvas.height;

  // Feedback ping-pong resources (allocated lazily for feedback programs)
  let feedback = null; // { texs: [2], fbos: [2], read, w, h }
  let present = null;  // { program, locTex, locFade }

  function dropFeedback() {
    if (!feedback) return;
    if (!lost) {
      feedback.texs.forEach(t => gl.deleteTexture(t));
      feedback.fbos.forEach(f => gl.deleteFramebuffer(f));
    }
    feedback = null;
  }

  function ensureFeedback() {
    if (feedback && feedback.w === width && feedback.h === height) return true;
    dropFeedback();
    const texs = [];
    const fbos = [];
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      // LINEAR + CLAMP_TO_EDGE, no mips — NPOT-safe on webgl1
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      texs.push(tex);
      fbos.push(fbo);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    feedback = { texs, fbos, read: 0, w: width, h: height };
    return true;
  }

  function ensurePresent() {
    if (present) return true;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, PRESENT_FRAG);
    if (!vs || !fs) return false;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    present = {
      program,
      locTex: gl.getUniformLocation(program, 'u_tex'),
      locFade: gl.getUniformLocation(program, 'u_fade'),
    };
    return true;
  }

  function ensureBuffer() {
    if (buf) return true;
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // a_pos is bound to location 0 in every program (bindAttribLocation),
    // so one attrib setup serves them all — no per-program vertex state.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return true;
  }

  function ensureProgram(entry) {
    if (entry.program) return true;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, entry.src);
    if (!vs || !fs) return false;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('viz program link failed:', gl.getProgramInfoLog(program));
      return false;
    }
    entry.program = program;
    entry.loc = {
      u_resolution: gl.getUniformLocation(program, 'u_resolution'),
      u_fade: gl.getUniformLocation(program, 'u_fade'),
    };
    for (const name of Object.keys(entry.spec)) {
      entry.loc[name] = gl.getUniformLocation(program, name);
    }
    return true;
  }

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    lost = true;
    if (lostCb) lostCb();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // All GL objects are gone; uniform state lives in JS, so recompiling
    // lazily on the next render fully restores the active program.
    for (const entry of programs.values()) { entry.program = null; entry.loc = null; }
    buf = null;
    feedback = null;
    present = null;
    lost = false;
    if (restoredCb) restoredCb();
  });

  return {
    registerProgram(id, fragSource, uniformSpec, opts = {}) {
      if (!programs.has(id)) {
        programs.set(id, { src: fragSource, spec: uniformSpec, opts, program: null, loc: null });
      }
    },
    // Lazy compile+link; false on failure (caller falls back to the default)
    use(id) {
      const entry = programs.get(id);
      if (!entry || lost) return false;
      return ensureProgram(entry);
    },
    resize(w, h) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    },
    render(id, uniforms, fade = 1, blend = false) {
      const entry = programs.get(id);
      if (!entry || lost || !ensureProgram(entry) || !ensureBuffer()) return false;
      const fb = entry.opts.feedback;
      let write = 0;
      if (fb) {
        if (!ensureFeedback() || !ensurePresent()) return false;
        write = 1 - feedback.read;
        gl.bindFramebuffer(gl.FRAMEBUFFER, feedback.fbos[write]);
      }
      gl.useProgram(entry.program);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(entry.loc.u_resolution, width, height);
      // Feedback pass writes at full opacity; the fade applies at present
      gl.uniform1f(entry.loc.u_fade, fb ? 1 : fade);
      for (const [name, type] of Object.entries(entry.spec)) {
        const loc = entry.loc[name];
        if (loc === null) continue;
        if (type === 'tex') {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, feedback.texs[feedback.read]);
          gl.uniform1i(loc, 0);
          continue;
        }
        const v = uniforms[name];
        if (v === undefined) continue;
        if (type === '1f') gl.uniform1f(loc, v);
        else if (type === '2f') gl.uniform2f(loc, v[0], v[1]);
        else if (type === '2fv') gl.uniform2fv(loc, v);
        else if (type === '3fv') gl.uniform3fv(loc, v);
        else if (type === '4fv') gl.uniform4fv(loc, v);
      }
      const screenBlend = blend && !fb;
      if (screenBlend) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (screenBlend) gl.disable(gl.BLEND);
      if (fb) {
        // Present the freshly written field to the screen with the real fade
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(present.program);
        gl.viewport(0, 0, width, height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, feedback.texs[write]);
        gl.uniform1i(present.locTex, 0);
        gl.uniform1f(present.locFade, fade);
        if (blend) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (blend) gl.disable(gl.BLEND);
        feedback.read = write;
      }
      return true;
    },
    onLost(cb) { lostCb = cb; },
    onRestored(cb) { restoredCb = cb; },
  };
}
