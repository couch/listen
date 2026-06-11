// Fullscreen James Turrell / Brian Eno Bloom style visualizer.
// WebGL fragment shader (viz-gl.js): a domain-warped noise color field that
// drifts over minutes, plus tap-spawned bloom rings — works as a fidget toy,
// including while playback is buffering. Pure logic lives in viz-logic.js.

import { createVizGL } from './viz-gl.js';
import {
  PRIDE_COLORS_VIZ, VIZ_PALETTE_SLOTS, buildVizPalette, paletteToUniform,
  createBloomState, addBloom, resetBlooms, autoBloomDue,
  computeCanvasSize, tapGesture, progressRatio,
  computeSites, createTiltState, setTiltInput, stepTilt, normalizeTilt,
} from './viz-logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 6.5;
const RING_C = 2 * Math.PI * RING_R;

let vizOverlay = null;
let vizCanvas = null;
let vizGL = null;
let vizTextEl = null;
let vizTitleEl = null;
let vizArtistEl = null;
let vizRingEl = null;
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
const sitesBuf = new Float32Array(VIZ_PALETTE_SLOTS * 3);

// Live background color (the drifting --bg) — palette slot 0 tracks it so
// the field is color-continuous with the page on entry and exit
let vizBgHex = '#c1440e';
let lastAppliedBgHex = null;
let lastPaletteAt = 0;

// Device tilt: spring-damped "thick gel" offset added to the site orbits
let tiltState = createTiltState();
let lastFrameNow = null;

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

// Rebuild the palette from a bg hex and upload it. Pride keeps its fixed
// spectrum but slot 0 still tracks the live bg for entry/exit continuity.
function applyPalette(bgHex) {
  const palette = vizIsPride ? [bgHex, ...PRIDE_COLORS_VIZ.slice(1)] : buildVizPalette(bgHex);
  const { data, count } = paletteToUniform(palette);
  vizGL.setPalette(data, count);
  vizPaletteCount = count;
  lastAppliedBgHex = bgHex;
}

function drawVizFrame(now) {
  if (!vizGL) return;
  const t = vizTime(now);
  const dt = lastFrameNow === null ? 1 / 60 : (now - lastFrameNow) / 1000;
  lastFrameNow = now;
  stepTilt(tiltState, dt);
  // Follow the drifting --bg; throttled — a 250ms step on a 45s drift ramp
  // is invisible
  if (vizBgHex !== lastAppliedBgHex && now - lastPaletteAt > 250) {
    applyPalette(vizBgHex);
    lastPaletteAt = now;
  }
  if (t < lastBloomAt) lastBloomAt = 0; // hourly clock wrap
  // Generative self-play: an occasional bloom when nothing has bloomed lately
  if (!vizReducedMotion && autoBloomDue(lastBloomAt, t, autoBloomInterval)) {
    spawnBloom(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6, t);
  }
  const aspect = window.innerWidth / window.innerHeight;
  const sites = computeSites(t, vizSeed, vizPaletteCount, aspect, tiltState.x, tiltState.y, sitesBuf);
  vizGL.render({ time: t, seed: vizSeed, blooms: bloomState.data, sites });
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

  // Minimal metadata in the lower-left: small progress ring + title/artist
  vizTextEl = document.createElement('div');
  vizTextEl.id = 'viz-text';

  const ringSvg = document.createElementNS(SVG_NS, 'svg');
  ringSvg.id = 'viz-progress';
  ringSvg.setAttribute('viewBox', '0 0 16 16');
  ringSvg.setAttribute('aria-hidden', 'true');
  const ringBg = document.createElementNS(SVG_NS, 'circle');
  const ringFg = document.createElementNS(SVG_NS, 'circle');
  for (const c of [ringBg, ringFg]) {
    c.setAttribute('cx', '8');
    c.setAttribute('cy', '8');
    c.setAttribute('r', String(RING_R));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '1.5');
  }
  ringBg.setAttribute('stroke', 'rgba(255,255,255,0.15)');
  ringFg.setAttribute('stroke', 'rgba(255,255,255,0.6)');
  ringFg.setAttribute('stroke-linecap', 'round');
  ringFg.setAttribute('stroke-dasharray', `0 ${RING_C}`);
  ringSvg.append(ringBg, ringFg);
  vizRingEl = ringFg;

  const meta = document.createElement('div');
  meta.id = 'viz-meta';
  vizTitleEl = document.createElement('div');
  vizTitleEl.id = 'viz-title';
  vizArtistEl = document.createElement('div');
  vizArtistEl.id = 'viz-artist';
  meta.append(vizTitleEl, vizArtistEl);
  vizTextEl.append(ringSvg, meta);

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
  if (vizRingEl) {
    vizRingEl.setAttribute('stroke-dasharray', `${progressRatio(vizCurrentTime, vizDuration) * RING_C} ${RING_C}`);
  }
  vizOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('viz-active'); // suppress the playlist scrollbar behind the overlay

  // Refresh canvas size in case layout changed since init
  sizeCanvas();

  // While open, the theme-color meta needs no extra writes: the bg drift in
  // main.js keeps writing it, and that drift color is always palette slot 0.
  vizBgHex = bgColor || '#c1440e';
  applyPalette(vizBgHex);
  vizSeed = Math.random() * 100;
  resetBlooms(bloomState);
  lastBloomAt = 0;
  autoBloomInterval = 10 + Math.random() * 5;
  tiltState = createTiltState();
  lastFrameNow = null;

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
  document.body.classList.remove('viz-active');
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
  if (vizRingEl) {
    vizRingEl.setAttribute('stroke-dasharray', `${progressRatio(currentTime, duration) * RING_C} ${RING_C}`);
  }
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
  // A new track is the one real musical event we can see — mark it
  if (isOpen && !vizReducedMotion) {
    spawnBloom(0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, vizTime(performance.now()));
  }
}

// Live --bg drift color from main.js — palette slot 0 follows it (throttled)
export function setVizBgColor(hex) {
  if (hex) vizBgHex = hex;
}

// Device orientation → tilt spring input. The colors lean with the device
// like thick liquid; when it stabilizes the autonomous drift takes back over.
export function setVizOrientation(beta, gamma) {
  if (!isOpen || vizReducedMotion) return;
  const [nx, ny] = normalizeTilt(beta, gamma, screen.orientation?.angle ?? 0);
  setTiltInput(tiltState, nx, ny);
}
