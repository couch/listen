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

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
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

  // id → { src, spec, program, loc } — program null until first use/restore
  const programs = new Map();
  let buf = null;
  let lost = false;
  let lostCb = null;
  let restoredCb = null;
  let width = canvas.width;
  let height = canvas.height;

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
    lost = false;
    if (restoredCb) restoredCb();
  });

  return {
    registerProgram(id, fragSource, uniformSpec) {
      if (!programs.has(id)) {
        programs.set(id, { src: fragSource, spec: uniformSpec, program: null, loc: null });
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
      gl.useProgram(entry.program);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(entry.loc.u_resolution, width, height);
      gl.uniform1f(entry.loc.u_fade, fade);
      for (const [name, type] of Object.entries(entry.spec)) {
        const loc = entry.loc[name];
        const v = uniforms[name];
        if (loc === null || v === undefined) continue;
        if (type === '1f') gl.uniform1f(loc, v);
        else if (type === '2f') gl.uniform2f(loc, v[0], v[1]);
        else if (type === '2fv') gl.uniform2fv(loc, v);
        else if (type === '3fv') gl.uniform3fv(loc, v);
        else if (type === '4fv') gl.uniform4fv(loc, v);
      }
      if (blend) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (blend) gl.disable(gl.BLEND);
      return true;
    },
    onLost(cb) { lostCb = cb; },
    onRestored(cb) { restoredCb = cb; },
  };
}
