// Fullscreen James Turrell / Brian Eno Bloom style visualizer.
// Slow drifting light fields, meditative color shifts derived from the playlist color.
// Entry: CSS 3D perspective "camera through text wall" transition.
// Exit: reverse pull-back, or swipe down on mobile.

import { hexToRgb } from './utils.js';

const SUPPORTS_CTX_FILTER = typeof CanvasRenderingContext2D !== 'undefined' &&
  'filter' in CanvasRenderingContext2D.prototype;

let vizOverlay = null;
let vizCanvas = null;
let vizCtx = null;
let vizTextEl = null;
let vizTitleEl = null;
let vizArtistEl = null;
let btnViz = null;
let vizFrame = null;
let vizReducedMotion = false;
let isOpen = false;
let vizStartTime = null;

// Playback state — updated from outside each tick
let vizCurrentTime = 0;
let vizDuration = 0;

// 7 light layers with independent motion
let layers = [];

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (l > 0.5 ? 2 - max - min : max + min);
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function derivePalette(bgHex) {
  const [h, s, l] = hexToHsl(bgHex);
  // 7 hue offsets spanning ±30° around base; varied lightness for depth
  const offsets = [-25, -15, -5, 0, 10, 20, 30];
  return offsets.map((offset, i) => ({
    hex: hslToHex(h + offset, Math.min(s * 1.15, 85), Math.max(28, Math.min(l + (i % 3 - 1) * 9, 68))),
    xPeriod: 67 + i * 13,
    yPeriod: 71 + i * 17,
    xPhase: (i / 7) * Math.PI * 2,
    yPhase: (i / 7) * Math.PI * 2 + Math.PI / 4,
    xAmp: 0.18 + (i % 3) * 0.09,
    yAmp: 0.16 + (i % 4) * 0.08,
    radiusFactor: 0.52 + (i % 3) * 0.14,
    opacityPeriod: 19 + i * 6,
    opacityPhase: (i / 7) * Math.PI * 2,
    opacityMin: 0.10,
    opacityMax: 0.38,
  }));
}

// ── Canvas sizing ─────────────────────────────────────────────────────────────

function sizeCanvas() {
  if (!vizCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  vizCanvas.width = Math.round(window.innerWidth * dpr);
  vizCanvas.height = Math.round(window.innerHeight * dpr);
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawVizFrame(now) {
  if (!vizCtx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const t = (now - vizStartTime) / 1000;
  const tau = 2 * Math.PI;
  const minDim = Math.min(w, h);

  // Partial fill darkens each frame — creates slow fade/ghosting of previous light
  vizCtx.globalCompositeOperation = 'source-over';
  vizCtx.globalAlpha = 1;
  vizCtx.fillStyle = 'rgba(0,0,0,0.04)';
  vizCtx.fillRect(0, 0, w, h);

  // Draw light layers
  layers.forEach(layer => {
    const cx = w * (0.5 + layer.xAmp * Math.sin(tau * t / layer.xPeriod + layer.xPhase));
    const cy = h * (0.5 + layer.yAmp * Math.sin(tau * t / layer.yPeriod + layer.yPhase));
    const r = minDim * layer.radiusFactor * (SUPPORTS_CTX_FILTER ? 1 : 1.8);
    const opacity = layer.opacityMin + (layer.opacityMax - layer.opacityMin) *
      (0.5 + 0.5 * Math.sin(tau * t / layer.opacityPeriod + layer.opacityPhase));

    const [red, green, blue] = hexToRgb(layer.hex);

    if (SUPPORTS_CTX_FILTER) {
      vizCtx.filter = `blur(${Math.round(minDim * 0.09)}px)`;
    }
    vizCtx.globalAlpha = opacity;
    vizCtx.globalCompositeOperation = 'lighter'; // additive: light sources add together

    const grad = vizCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   `rgba(${red},${green},${blue},1)`);
    grad.addColorStop(0.4, `rgba(${red},${green},${blue},0.5)`);
    grad.addColorStop(1,   `rgba(${red},${green},${blue},0)`);

    vizCtx.fillStyle = grad;
    vizCtx.fillRect(0, 0, w, h);
  });

  // Progress arc — drawn crisp over the light field
  if (SUPPORTS_CTX_FILTER) vizCtx.filter = 'none';
  vizCtx.globalCompositeOperation = 'source-over';
  vizCtx.globalAlpha = 1;

  const progress = vizDuration > 0 ? Math.min(vizCurrentTime / vizDuration, 1) : 0;
  if (progress > 0.001) {
    const arcR = Math.min(w, h) * 0.36;
    vizCtx.beginPath();
    vizCtx.arc(w / 2, h / 2, arcR, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
    vizCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    vizCtx.lineWidth = 1;
    vizCtx.globalAlpha = 0.10 + progress * 0.06; // subtle brightening as track nears end
    vizCtx.stroke();
  }

  vizCtx.globalAlpha = 1;
}

function vizTick(now) {
  drawVizFrame(now);
  if (isOpen) vizFrame = requestAnimationFrame(vizTick);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initVisualizer(reducedMotion) {
  vizReducedMotion = reducedMotion;

  // Build overlay DOM
  vizOverlay = document.createElement('div');
  vizOverlay.id = 'viz-overlay';
  vizOverlay.setAttribute('aria-hidden', 'true');

  vizCanvas = document.createElement('canvas');
  vizCanvas.id = 'viz-canvas';
  vizCtx = vizCanvas.getContext('2d');
  sizeCanvas();

  vizTextEl = document.createElement('div');
  vizTextEl.id = 'viz-text';
  vizTitleEl = document.createElement('div');
  vizTitleEl.id = 'viz-title';
  vizArtistEl = document.createElement('div');
  vizArtistEl.id = 'viz-artist';
  vizTextEl.append(vizTitleEl, vizArtistEl);

  const vizExitBtn = document.createElement('button');
  vizExitBtn.id = 'viz-exit';
  vizExitBtn.setAttribute('aria-label', 'Exit visualizer');
  vizExitBtn.textContent = '×';
  vizExitBtn.addEventListener('click', closeVisualizer);

  // Swipe down to close on touch devices
  let touchStartY = 0;
  vizOverlay.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  vizOverlay.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchStartY > 80) closeVisualizer();
  }, { passive: true });

  vizOverlay.append(vizCanvas, vizTextEl, vizExitBtn);
  document.body.appendChild(vizOverlay);

  // Escape key to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeVisualizer();
  });

  // Canvas resize
  const ro = new ResizeObserver(() => {
    clearTimeout(ro._debounce);
    ro._debounce = setTimeout(sizeCanvas, 200);
  });
  ro.observe(document.body);

  // Inject ⊙ button into #controls before #time
  const controls = document.getElementById('controls');
  const timeEl = document.getElementById('time');
  if (controls && timeEl) {
    btnViz = document.createElement('button');
    btnViz.id = 'btn-viz';
    btnViz.setAttribute('aria-label', 'Open visualizer');
    btnViz.setAttribute('hidden', '');
    btnViz.textContent = '⊙';
    btnViz.addEventListener('click', () => {
      const bgHex = document.documentElement.style.getPropertyValue('--bg').trim() || '#c1440e';
      openVisualizer({ bgColor: bgHex });
    });
    controls.insertBefore(btnViz, timeEl);
  }
}

export function openVisualizer({ bgColor }) {
  if (isOpen) return;
  isOpen = true;

  // Update title/artist text
  vizTitleEl.textContent = vizTitleEl.dataset.pending || vizTitleEl.textContent;
  vizOverlay.setAttribute('aria-hidden', 'false');

  // Build light palette from current background color
  layers = derivePalette(bgColor || '#c1440e');
  vizStartTime = performance.now();

  if (!vizReducedMotion) {
    vizFrame = requestAnimationFrame(vizTick);
  } else {
    drawVizFrame(vizStartTime);
  }

  const tape = document.getElementById('tape');
  const bar = document.getElementById('bar');

  if (vizReducedMotion) {
    vizOverlay.style.transition = 'opacity 0.5s ease';
    vizOverlay.style.opacity = '1';
    vizOverlay.classList.add('viz-open');
    if (tape) tape.style.visibility = 'hidden';
    return;
  }

  if (bar) bar.style.pointerEvents = 'none';
  document.body.classList.add('viz-entering');
  vizOverlay.style.opacity = '0';
  vizOverlay.style.transition = '';

  // Fade in visualizer as the wall-pass completes (~450ms in)
  setTimeout(() => {
    vizOverlay.style.transition = 'opacity 0.55s ease';
    vizOverlay.style.opacity = '1';
  }, 450);

  const onAnimEnd = () => {
    document.body.classList.remove('viz-entering');
    document.body.classList.add('viz-open');
    if (tape) tape.style.visibility = 'hidden';
    vizOverlay.classList.add('viz-open');
    if (bar) bar.style.pointerEvents = '';
  };

  if (tape) {
    tape.addEventListener('animationend', onAnimEnd, { once: true });
    // Fallback if animationend never fires (e.g., element not animating)
    setTimeout(onAnimEnd, 1000);
  } else {
    setTimeout(onAnimEnd, 500);
  }
}

export function closeVisualizer() {
  if (!isOpen) return;
  isOpen = false;

  if (vizFrame) { cancelAnimationFrame(vizFrame); vizFrame = null; }

  const tape = document.getElementById('tape');
  const bar = document.getElementById('bar');

  if (vizReducedMotion) {
    vizOverlay.style.transition = 'opacity 0.4s ease';
    vizOverlay.style.opacity = '0';
    vizOverlay.classList.remove('viz-open');
    vizOverlay.setAttribute('aria-hidden', 'true');
    if (tape) tape.style.visibility = '';
    return;
  }

  document.body.classList.remove('viz-open');
  vizOverlay.classList.remove('viz-open');
  vizOverlay.style.transition = 'opacity 0.4s ease';
  vizOverlay.style.opacity = '0';

  if (tape) tape.style.visibility = '';
  if (bar) bar.style.pointerEvents = 'none';
  document.body.classList.add('viz-exiting');

  const onAnimEnd = () => {
    document.body.classList.remove('viz-exiting');
    if (bar) bar.style.pointerEvents = '';
    vizOverlay.setAttribute('aria-hidden', 'true');
  };

  if (tape) {
    tape.addEventListener('animationend', onAnimEnd, { once: true });
    setTimeout(onAnimEnd, 1000);
  } else {
    setTimeout(onAnimEnd, 900);
  }
}

export function isVisualizerOpen() {
  return isOpen;
}

export function updateVisualizer(currentTime, duration, title, artist) {
  vizCurrentTime = currentTime;
  vizDuration = duration;
  if (vizTitleEl && vizTitleEl.textContent !== (title || '')) {
    vizTitleEl.textContent = title || '';
  }
  if (vizArtistEl && vizArtistEl.textContent !== (artist || '')) {
    vizArtistEl.textContent = artist || '';
  }
}

export function updateVisualizerTrack(title, artist) {
  if (!vizTextEl) return;
  vizTextEl.style.transition = 'opacity 0.3s ease';
  vizTextEl.style.opacity = '0';
  setTimeout(() => {
    if (vizTitleEl) vizTitleEl.textContent = title || '';
    if (vizArtistEl) vizArtistEl.textContent = artist || '';
    vizTextEl.style.opacity = '1';
  }, 300);
}
