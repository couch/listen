// Swirling paint-blob canvas for Pride mode background.
// Replaces per-track backgroundColor with large gaussian-blurred blobs
// that drift on incommensurate sine paths — colors stay distinct via
// source-over compositing (alpha tapers to transparent at edges).

const PRIDE_COLORS = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];

const SUPPORTS_CTX_FILTER = typeof CanvasRenderingContext2D !== 'undefined' &&
  'filter' in CanvasRenderingContext2D.prototype;

let canvas = null;
let ctx = null;
let enabled = false;
let prideFrame = null;
let startTime = null;
let lastTick = 0;
let targetOpacity = 0;
let currentOpacity = 0;
const FADE_RATE = 1 / 60;

// Incommensurate periods prevent exact repetition across the session
const BLOBS = PRIDE_COLORS.map((color, i) => ({
  color,
  xPeriod: 41 + i * 7,
  yPeriod: 37 + i * 11,
  xPhase: (i / PRIDE_COLORS.length) * Math.PI * 2,
  yPhase: (i / PRIDE_COLORS.length) * Math.PI * 2 + Math.PI / 5,
  xAmp: 0.28 + (i % 3) * 0.04,
  yAmp: 0.25 + (i % 4) * 0.04,
}));

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1,3), 16),
    parseInt(hex.slice(3,5), 16),
    parseInt(hex.slice(5,7), 16),
  ];
}

function sizeCanvas() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFrame(t) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const minDim = Math.min(w, h);
  const tau = 2 * Math.PI;

  ctx.clearRect(0, 0, w, h);

  BLOBS.forEach(blob => {
    const cx = w * (0.5 + blob.xAmp * Math.sin(tau * t / blob.xPeriod + blob.xPhase));
    const cy = h * (0.5 + blob.yAmp * Math.sin(tau * t / blob.yPeriod + blob.yPhase));
    const r = SUPPORTS_CTX_FILTER ? minDim * 0.55 : minDim * 0.85;
    const [red, green, blue] = hexToRgb(blob.color);

    if (SUPPORTS_CTX_FILTER) {
      ctx.filter = `blur(${Math.round(minDim * 0.07)}px)`;
    }

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,    `rgba(${red},${green},${blue},0.72)`);
    grad.addColorStop(0.35, `rgba(${red},${green},${blue},0.38)`);
    grad.addColorStop(0.7,  `rgba(${red},${green},${blue},0.10)`);
    grad.addColorStop(1,    `rgba(${red},${green},${blue},0)`);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  if (SUPPORTS_CTX_FILTER) ctx.filter = 'none';
}

export function initPrideCanvas(reducedMotion) {
  canvas = document.createElement('canvas');
  canvas.id = 'pride-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  ctx = canvas.getContext('2d');
  sizeCanvas();

  const ro = new ResizeObserver(() => {
    clearTimeout(ro._debounce);
    ro._debounce = setTimeout(sizeCanvas, 200);
  });
  ro.observe(document.body);

  if (reducedMotion) {
    drawFrame(0);
    canvas.style.opacity = '1';
    return;
  }
  enabled = true;
}

export function startPrideCanvas() {
  if (!enabled) return;
  targetOpacity = 1;
  if (!prideFrame) {
    startTime = performance.now();
    prideFrame = requestAnimationFrame(tick);
  }
}

export function stopPrideCanvas() {
  targetOpacity = 0;
  // RAF continues until fade drains to 0 then self-cancels
}

function tick(now) {
  if (currentOpacity < targetOpacity) {
    currentOpacity = Math.min(targetOpacity, currentOpacity + FADE_RATE);
  } else if (currentOpacity > targetOpacity) {
    currentOpacity = Math.max(targetOpacity, currentOpacity - FADE_RATE);
  }
  canvas.style.opacity = currentOpacity.toFixed(4);

  if (now - lastTick >= 50) { // ~20fps
    lastTick = now;
    drawFrame((now - startTime) / 1000);
  }

  if (currentOpacity > 0 || targetOpacity > 0) {
    prideFrame = requestAnimationFrame(tick);
  } else {
    prideFrame = null;
  }
}
