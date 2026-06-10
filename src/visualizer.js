// Fullscreen James Turrell / Brian Eno Bloom style visualizer.
// WebGL fragment shader (viz-gl.js): a domain-warped noise color field that
// drifts over minutes, plus tap-spawned bloom rings — works as a fidget toy,
// including while playback is buffering. Pure logic lives in viz-logic.js.

import { createVizGL } from './viz-gl.js';
import {
  PRIDE_COLORS_VIZ, buildVizPalette, paletteToUniform,
  createBloomState, addBloom, resetBlooms, autoBloomDue,
  computeCanvasSize, tapGesture,
} from './viz-logic.js';

let vizOverlay = null;
let vizCanvas = null;
let vizGL = null;
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

// Shader state
let vizSeed = 0;
let vizPaletteCount = 1;
const bloomState = createBloomState();
let lastBloomAt = 0;
let autoBloomInterval = 12;

// ── Canvas sizing ─────────────────────────────────────────────────────────────

function sizeCanvas() {
  if (!vizCanvas) return;
  const { w, h } = computeCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  if (vizGL) {
    vizGL.resize(w, h);
    if (isOpen && vizReducedMotion) drawVizFrame(performance.now());
  } else {
    vizCanvas.width = w;
    vizCanvas.height = h;
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// Shader time in seconds, wrapped hourly to keep float precision
function vizTime(now) {
  return ((now - vizStartTime) / 1000) % 3600;
}

function spawnBloom(x, y, t) {
  addBloom(bloomState, x, y, t, Math.floor(Math.random() * vizPaletteCount));
  lastBloomAt = t;
  autoBloomInterval = 10 + Math.random() * 5;
}

function drawVizFrame(now) {
  if (!vizGL) return;
  const t = vizTime(now);
  if (t < lastBloomAt) lastBloomAt = 0; // hourly clock wrap
  // Generative self-play: an occasional bloom when nothing has bloomed lately
  if (!vizReducedMotion && autoBloomDue(lastBloomAt, t, autoBloomInterval)) {
    spawnBloom(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6, t);
  }
  const progress = vizDuration > 0 ? Math.min(vizCurrentTime / vizDuration, 1) : 0;
  vizGL.render({ time: t, seed: vizSeed, progress, blooms: bloomState.data });
}

function vizTick(now) {
  drawVizFrame(now);
  if (isOpen) vizFrame = requestAnimationFrame(vizTick);
}

function stopFrame() {
  if (vizFrame) { cancelAnimationFrame(vizFrame); vizFrame = null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initVisualizer(reducedMotion, isPride = false) {
  vizReducedMotion = reducedMotion;
  vizIsPride = isPride;

  vizCanvas = document.createElement('canvas');
  vizCanvas.id = 'viz-canvas';
  sizeCanvas();
  vizGL = createVizGL(vizCanvas);
  if (!vizGL) return; // no WebGL: no overlay, no ⊙ button — feature absent

  vizGL.onLost(stopFrame);
  vizGL.onRestored(() => {
    if (!isOpen) return;
    if (vizReducedMotion) drawVizFrame(performance.now());
    else if (!document.hidden && !vizFrame) vizFrame = requestAnimationFrame(vizTick);
  });

  vizOverlay = document.createElement('div');
  vizOverlay.id = 'viz-overlay';
  vizOverlay.setAttribute('aria-hidden', 'true');

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

  // Swipe down (touch) closes; a quick tap blooms — the fidget interaction
  let ptrDown = null;
  vizOverlay.addEventListener('pointerdown', e => {
    if (e.target.closest('#viz-exit')) return;
    ptrDown = { x: e.clientX, y: e.clientY, at: performance.now() };
  });
  vizOverlay.addEventListener('pointerup', e => {
    if (!ptrDown || e.target.closest('#viz-exit')) { ptrDown = null; return; }
    const gesture = tapGesture(ptrDown.x, ptrDown.y, e.clientX, e.clientY, performance.now() - ptrDown.at);
    ptrDown = null;
    if (!isOpen) return;
    if (gesture === 'close' && e.pointerType === 'touch') {
      closeVisualizer();
    } else if (gesture === 'bloom') {
      const now = performance.now();
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight; // GL origin is bottom-left
      if (vizReducedMotion) {
        // Static mode: place the bloom mid-life so the single frame shows it
        addBloom(bloomState, x, y, Math.max(0, vizTime(now) - 2), Math.floor(Math.random() * vizPaletteCount));
        drawVizFrame(now);
      } else {
        spawnBloom(x, y, vizTime(now));
      }
    }
  });

  vizOverlay.append(vizCanvas, vizTextEl, vizExitBtn);
  document.body.appendChild(vizOverlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeVisualizer();
  });

  document.addEventListener('visibilitychange', () => {
    if (!isOpen || vizReducedMotion) return;
    if (document.hidden) stopFrame();
    else if (!vizFrame) vizFrame = requestAnimationFrame(vizTick);
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
  if (isOpen || !vizGL) return;
  isOpen = true;

  if (vizTitleEl) vizTitleEl.textContent = title || '';
  if (vizArtistEl) vizArtistEl.textContent = artist || '';
  vizOverlay.setAttribute('aria-hidden', 'false');

  // Refresh canvas size in case layout changed since init
  sizeCanvas();

  const palette = vizIsPride ? PRIDE_COLORS_VIZ : buildVizPalette(bgColor || '#c1440e');
  const { data, count } = paletteToUniform(palette);
  vizGL.setPalette(data, count);
  vizPaletteCount = count;
  vizSeed = Math.random() * 100;
  resetBlooms(bloomState);
  lastBloomAt = 0;
  autoBloomInterval = 10 + Math.random() * 5;

  if (!vizReducedMotion) {
    vizStartTime = performance.now();
    vizFrame = requestAnimationFrame(vizTick);
  } else {
    // Static frame at t=30s — the field has texture without animating
    vizStartTime = performance.now() - 30000;
    drawVizFrame(performance.now());
  }

  // Move focus away from the trigger button so Space/arrows control playback
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }

  const tape = document.getElementById('tape');
  const bar = document.getElementById('bar');
  const FADE = vizReducedMotion ? 0 : 400;

  // Fade tape out, then hide it and reveal the visualizer overlay
  if (tape) {
    tape.style.transition = FADE ? `opacity ${FADE}ms ease` : '';
    tape.style.opacity = '0';
  }
  if (bar) bar.style.pointerEvents = 'none';

  // Fade viz in roughly halfway through the tape fade
  entryFadeId = setTimeout(() => {
    entryFadeId = null;
    vizOverlay.style.transition = `opacity ${FADE ? FADE + 100 : 0}ms ease`;
    vizOverlay.style.opacity = '1';
  }, FADE ? 200 : 0);

  entryFallbackId = setTimeout(() => {
    entryFallbackId = null;
    if (!isOpen) return;
    if (tape) { tape.style.visibility = 'hidden'; tape.style.opacity = ''; tape.style.transition = ''; }
    vizOverlay.classList.add('viz-open');
    if (bar) bar.style.pointerEvents = '';
  }, FADE + 120);
}

export function closeVisualizer() {
  if (!isOpen) return;
  isOpen = false;

  stopFrame();
  if (entryFadeId) { clearTimeout(entryFadeId); entryFadeId = null; }
  if (entryFallbackId) { clearTimeout(entryFallbackId); entryFallbackId = null; }

  const tape = document.getElementById('tape');
  const bar = document.getElementById('bar');
  const FADE = vizReducedMotion ? 0 : 400;

  vizOverlay.classList.remove('viz-open');
  vizOverlay.style.transition = `opacity ${FADE ? FADE : 0}ms ease`;
  vizOverlay.style.opacity = '0';

  // Restore tape: make visible at opacity 0, then fade in
  if (tape) {
    tape.style.visibility = '';
    tape.style.opacity = '0';
    tape.style.transition = '';
  }

  // Start tape fade-in shortly after viz begins fading out
  setTimeout(() => {
    if (tape) {
      tape.style.transition = FADE ? `opacity ${FADE}ms ease` : '';
      tape.style.opacity = '1';
    }
  }, FADE ? 150 : 0);

  setTimeout(() => {
    if (tape) { tape.style.opacity = ''; tape.style.transition = ''; }
    if (bar) bar.style.pointerEvents = '';
    vizOverlay.setAttribute('aria-hidden', 'true');
    if (btnViz && !btnViz.hidden) btnViz.focus({ preventScroll: true });
  }, FADE + 120);
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
