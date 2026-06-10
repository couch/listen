// Fullscreen James Turrell / Brian Eno Bloom style visualizer.
// Slow drifting light fields, meditative color shifts derived from the playlist color.
// Entry: CSS 3D perspective "camera through text wall" transition.
// Exit: reverse pull-back, or swipe down on mobile.

import { hexToRgb, hexToHsl, hslToHex } from './utils.js';

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
let vizIsPride = false;
let isOpen = false;
let vizStartTime = null;
let entryFadeId = null;
let entryFallbackId = null;

// Playback state — updated from main ticker
let vizCurrentTime = 0;
let vizDuration = 0;

let layers = [];

// ── Palette builders ──────────────────────────────────────────────────────────

const PRIDE_COLORS_VIZ = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];

// Same oscillation physics as pride-canvas.js BLOBS; larger radii for immersive fill
function derivePridePalette() {
  return PRIDE_COLORS_VIZ.map((hex, i) => ({
    hex,
    xPeriod: 41 + i * 7,
    yPeriod: 37 + i * 11,
    xPhase: (i / PRIDE_COLORS_VIZ.length) * Math.PI * 2,
    yPhase: (i / PRIDE_COLORS_VIZ.length) * Math.PI * 2 + Math.PI / 5,
    xAmp: 0.28 + (i % 3) * 0.04,
    yAmp: 0.25 + (i % 4) * 0.04,
    radiusFactor: 0.80 + (i % 3) * 0.15,
    opacityPeriod: 19 + i * 5,
    opacityPhase: (i / PRIDE_COLORS_VIZ.length) * Math.PI * 2,
    opacityMin: 0.22,
    opacityMax: 0.52,
  }));
}

function derivePalette(bgHex) {
  const [h, s, l] = hexToHsl(bgHex);
  const offsets = [-25, -15, -5, 0, 10, 20, 30];
  return offsets.map((offset, i) => ({
    hex: hslToHex(h + offset, Math.min(s * 1.15, 85), Math.max(30, Math.min(l + (i % 3 - 1) * 10, 65))),
    xPeriod: 67 + i * 13,
    yPeriod: 71 + i * 17,
    xPhase: (i / 7) * Math.PI * 2,
    yPhase: (i / 7) * Math.PI * 2 + Math.PI / 4,
    xAmp: 0.22 + (i % 3) * 0.10,
    yAmp: 0.20 + (i % 4) * 0.09,
    radiusFactor: 0.68 + (i % 3) * 0.18,
    opacityPeriod: 19 + i * 6,
    opacityPhase: (i / 7) * Math.PI * 2,
    opacityMin: 0.18,
    opacityMax: 0.48,
  }));
}

// ── Canvas sizing ─────────────────────────────────────────────────────────────

function sizeCanvas() {
  if (!vizCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  vizCanvas.width = Math.round(window.innerWidth * dpr);
  vizCanvas.height = Math.round(window.innerHeight * dpr);
  // Draw in physical pixels — no setTransform, avoids blur/transform interaction artifacts
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawVizFrame(now) {
  if (!vizCtx || !vizCanvas) return;

  const pw = vizCanvas.width;
  const ph = vizCanvas.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const t = (now - vizStartTime) / 1000;
  const tau = 2 * Math.PI;
  const minDim = Math.min(pw, ph);

  // Slightly darken each frame — older light fades slowly, creating pooling/accumulation
  vizCtx.globalCompositeOperation = 'source-over';
  vizCtx.globalAlpha = 1;
  vizCtx.fillStyle = 'rgba(0,0,0,0.035)';
  vizCtx.fillRect(0, 0, pw, ph);

  const blurPx = SUPPORTS_CTX_FILTER ? Math.round(minDim * 0.11) : 0;

  layers.forEach(layer => {
    const cx = pw * (0.5 + layer.xAmp * Math.sin(tau * t / layer.xPeriod + layer.xPhase));
    const cy = ph * (0.5 + layer.yAmp * Math.sin(tau * t / layer.yPeriod + layer.yPhase));
    const r = minDim * layer.radiusFactor;
    const opacity = layer.opacityMin + (layer.opacityMax - layer.opacityMin) *
      (0.5 + 0.5 * Math.sin(tau * t / layer.opacityPeriod + layer.opacityPhase));

    const [red, green, blue] = hexToRgb(layer.hex);

    if (SUPPORTS_CTX_FILTER) vizCtx.filter = `blur(${blurPx}px)`;
    vizCtx.globalAlpha = opacity;
    vizCtx.globalCompositeOperation = 'source-over';

    const grad = vizCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   `rgba(${red},${green},${blue},1)`);
    grad.addColorStop(0.45,`rgba(${red},${green},${blue},0.55)`);
    grad.addColorStop(1,   `rgba(${red},${green},${blue},0)`);

    vizCtx.fillStyle = grad;
    // Oversized rect prevents blur from sampling outside canvas boundary (edge artifacts)
    vizCtx.fillRect(-blurPx, -blurPx, pw + blurPx * 2, ph + blurPx * 2);
  });

  // Progress arc — crisp, no blur, drawn over light field
  if (SUPPORTS_CTX_FILTER) vizCtx.filter = 'none';
  vizCtx.globalCompositeOperation = 'source-over';
  vizCtx.globalAlpha = 1;

  const progress = vizDuration > 0 ? Math.min(vizCurrentTime / vizDuration, 1) : 0;
  if (progress > 0.001) {
    const arcR = minDim * 0.34;
    vizCtx.beginPath();
    vizCtx.arc(pw / 2, ph / 2, arcR, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
    vizCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    vizCtx.lineWidth = dpr;
    vizCtx.globalAlpha = 0.10 + progress * 0.06;
    vizCtx.stroke();
  }

  vizCtx.globalAlpha = 1;
}

function vizTick(now) {
  drawVizFrame(now);
  if (isOpen) vizFrame = requestAnimationFrame(vizTick);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initVisualizer(reducedMotion, isPride = false) {
  vizReducedMotion = reducedMotion;
  vizIsPride = isPride;

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

  let touchStartY = 0;
  vizOverlay.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  vizOverlay.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchStartY > 80) closeVisualizer();
  }, { passive: true });

  vizOverlay.append(vizCanvas, vizTextEl, vizExitBtn);
  document.body.appendChild(vizOverlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeVisualizer();
  });

  const ro = new ResizeObserver(() => {
    clearTimeout(ro._debounce);
    ro._debounce = setTimeout(sizeCanvas, 200);
  });
  ro.observe(document.body);

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
      const title = document.getElementById('np-title')?.querySelector('span')?.textContent || '';
      const artist = document.getElementById('np-artist')?.querySelector('span')?.textContent || '';
      openVisualizer({ bgColor: bgHex, title, artist });
    });
    controls.insertBefore(btnViz, timeEl);
  }
}

export function openVisualizer({ bgColor, title, artist }) {
  if (isOpen) return;
  isOpen = true;

  if (vizTitleEl) vizTitleEl.textContent = title || '';
  if (vizArtistEl) vizArtistEl.textContent = artist || '';
  vizOverlay.setAttribute('aria-hidden', 'false');

  // Refresh canvas size in case layout changed since init
  sizeCanvas();

  layers = vizIsPride ? derivePridePalette() : derivePalette(bgColor || '#c1440e');
  vizStartTime = performance.now();

  if (!vizReducedMotion) {
    vizFrame = requestAnimationFrame(vizTick);
  } else {
    drawVizFrame(vizStartTime);
  }

  // Move focus away from the trigger button so Space/arrows control playback
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
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

  entryFadeId = setTimeout(() => {
    entryFadeId = null;
    vizOverlay.style.transition = 'opacity 0.55s ease';
    vizOverlay.style.opacity = '1';
  }, 450);

  const doEntryCleanup = () => {
    if (!isOpen) return;
    document.body.classList.remove('viz-entering');
    document.body.classList.add('viz-open');
    if (tape) tape.style.visibility = 'hidden';
    vizOverlay.classList.add('viz-open');
    if (bar) bar.style.pointerEvents = '';
  };

  if (tape) {
    // Must check animationName — child marquee animations bubble animationend to #tape
    let fallback = null;
    const onAnimEnd = (e) => {
      if (e?.animationName !== 'viz-enter-tape') return;
      tape.removeEventListener('animationend', onAnimEnd);
      clearTimeout(fallback);
      clearTimeout(entryFallbackId);
      entryFallbackId = null;
      doEntryCleanup();
    };
    tape.addEventListener('animationend', onAnimEnd);
    fallback = setTimeout(() => {
      tape.removeEventListener('animationend', onAnimEnd);
      doEntryCleanup();
    }, 1000);
    entryFallbackId = fallback;
  } else {
    entryFallbackId = setTimeout(doEntryCleanup, 500);
  }
}

export function closeVisualizer() {
  if (!isOpen) return;
  isOpen = false;

  if (vizFrame) { cancelAnimationFrame(vizFrame); vizFrame = null; }
  if (entryFadeId) { clearTimeout(entryFadeId); entryFadeId = null; }
  if (entryFallbackId) { clearTimeout(entryFallbackId); entryFallbackId = null; }

  document.body.classList.remove('viz-entering', 'viz-open');

  const tape = document.getElementById('tape');
  const bar = document.getElementById('bar');

  if (vizReducedMotion) {
    vizOverlay.style.transition = 'opacity 0.4s ease';
    vizOverlay.style.opacity = '0';
    vizOverlay.classList.remove('viz-open');
    vizOverlay.setAttribute('aria-hidden', 'true');
    if (tape) tape.style.visibility = '';
    if (btnViz && !btnViz.hidden) btnViz.focus({ preventScroll: true });
    return;
  }

  vizOverlay.classList.remove('viz-open');
  vizOverlay.style.transition = 'opacity 0.4s ease';
  vizOverlay.style.opacity = '0';

  if (tape) tape.style.visibility = '';
  if (bar) bar.style.pointerEvents = 'none';
  document.body.classList.add('viz-exiting');

  const doExitCleanup = () => {
    document.body.classList.remove('viz-exiting');
    if (bar) bar.style.pointerEvents = '';
    vizOverlay.setAttribute('aria-hidden', 'true');
    if (btnViz && !btnViz.hidden) btnViz.focus({ preventScroll: true });
  };

  if (tape) {
    let fallback = null;
    const onAnimEnd = (e) => {
      if (e?.animationName !== 'viz-exit-tape') return;
      tape.removeEventListener('animationend', onAnimEnd);
      clearTimeout(fallback);
      doExitCleanup();
    };
    tape.addEventListener('animationend', onAnimEnd);
    fallback = setTimeout(() => {
      tape.removeEventListener('animationend', onAnimEnd);
      doExitCleanup();
    }, 1000);
  } else {
    setTimeout(doExitCleanup, 900);
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
