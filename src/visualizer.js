// Fullscreen James Turrell / Brian Eno Bloom style visualizer.
// DOM/lifecycle owner for the visualization registry (src/viz/): overlay,
// entry button, rAF loop, gestures, crossfade between visualizations —
// works as a fidget toy, including while playback is buffering.
// Shared pure logic lives in viz-logic.js; per-visualization logic in src/viz/.

import { createVizGL } from './viz-gl.js';
import {
  paletteToUniform,
  createBloomState, addBloom, resetBlooms, autoBloomDue,
  computeCanvasSize, tapGesture, skipGesture, progressRatio,
  createTiltState, setTiltInput, stepTilt, normalizeTilt,
  crossfadeAlpha, resolveVizSelection, pickerRevealZone,
  updateDue, reopenDue,
} from './viz-logic.js';
import { getDefaultViz, getViz } from './viz/registry.js';
import { VIZ_IDS, VIZ_NAMES } from './viz/ids.js';
import { createVizPicker } from './viz-picker.js';
import { L } from './strings.js';

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
let vizOpts = {};
let isOpen = false;
let vizStartTime = null;
let entryFadeId = null;
let entryFallbackId = null;
// Auto-close when a lost WebGL context isn't restored in time
const CTX_LOSS_CLOSE_MS = 3500;
let ctxLossTimer = null;
// Set when the GPU context dies while the overlay is open (an OS reclaim,
// not a user choice) — eligibility for auto-reopen. Cleared when the
// context recovers in place, on any open, and on explicit user exits.
let sysClosedAt = null;

// Playback state — updated from main ticker
let vizCurrentTime = 0;
let vizDuration = 0;

// Active visualization (registry entry) + per-open state and packed palette.
// During a crossfade the outgoing viz stays in active* while pending* fades in.
let activeViz = null;
let activeState = null;
let activePal = { data: new Float32Array(27), count: 1 };
let pendingViz = null;
let pendingState = null;
let pendingPal = null;
let transitionStart = 0;
const registered = new Set();
const loadedEntries = new Map([[getDefaultViz().id, getDefaultViz()]]);

// Selection: listener override (localStorage, per playlist) > TAPE.viz > mesh
const VIZ_PREF_KEY = 'muxtape-viz';
let vizTapeKey = '_';
let vizSelection = getDefaultViz().id;
let picker = null;
let allWarmed = false;

function readVizPref(tapeKey) {
  try {
    const map = JSON.parse(localStorage.getItem(VIZ_PREF_KEY) || '{}');
    return map && typeof map === 'object' ? map[tapeKey] : undefined;
  } catch { return undefined; }
}

function writeVizPref(tapeKey, id) {
  try {
    let map;
    try { map = JSON.parse(localStorage.getItem(VIZ_PREF_KEY) || '{}'); } catch { map = null; }
    if (!map || typeof map !== 'object') map = {};
    map[tapeKey] = id;
    localStorage.setItem(VIZ_PREF_KEY, JSON.stringify(map));
  } catch {}
}

// Shared event state (every visualization reinterprets the bloom buffer)
let vizSeed = 0;
const bloomState = createBloomState();
let lastBloomAt = 0;
let autoBloomInterval = 12;

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

// A shared event always writes the bloom buffer (each visualization renders
// it in its own vocabulary); the per-viz hooks add visualization state —
// tap() for pointer events, trackEvent() on track changes.
function spawnEvent(x, y, t, isTrackChange = false) {
  addBloom(bloomState, x, y, t, Math.floor(Math.random() * activePal.count));
  if (isTrackChange && activeViz.trackEvent) activeViz.trackEvent(activeState, t);
  else activeViz.tap?.(activeState, x, y, t);
  lastBloomAt = t;
  autoBloomInterval = 10 + Math.random() * 5;
}

function paletteFor(viz, bgHex) {
  return paletteToUniform(viz.buildPalette(bgHex, vizIsPride));
}

// Rebuild palettes from a bg hex. Each visualization derives its own; slot 0
// always tracks the live bg for entry/exit continuity (pride included).
function applyPalette(bgHex) {
  activePal = paletteFor(activeViz, bgHex);
  if (pendingViz) pendingPal = paletteFor(pendingViz, bgHex);
  lastAppliedBgHex = bgHex;
}

function frameContext(t, dt, pal) {
  return {
    t, dt,
    aspect: window.innerWidth / window.innerHeight,
    tiltX: tiltState.x, tiltY: tiltState.y,
    blooms: bloomState.data,
    paletteData: pal.data, paletteCount: pal.count,
  };
}

function promotePending() {
  activeViz = pendingViz;
  activeState = pendingState;
  activePal = pendingPal;
  pendingViz = null;
  pendingState = null;
  pendingPal = null;
}

function drawVizFrame(now) {
  if (!vizGL || !activeViz) return;
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
  // Generative self-play: an occasional event when nothing has happened lately
  if (!vizReducedMotion && autoBloomDue(lastBloomAt, t, autoBloomInterval)) {
    spawnEvent(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6, t);
  }
  vizGL.render(activeViz.id, activeViz.frame(activeState, frameContext(t, dt, activePal)), 1, false);
  if (pendingViz) {
    // Crossfade: incoming visualization alpha-blends over the outgoing one
    const k = crossfadeAlpha(now - transitionStart);
    vizGL.render(pendingViz.id, pendingViz.frame(pendingState, frameContext(t, dt, pendingPal)), k, true);
    if (k >= 1) promotePending();
  }
}

function vizTick(now) {
  // Draw at 30fps regardless of display rAF rate — the fields move slowly,
  // and halving (or quartering, on 120Hz) the GPU work keeps phones cool.
  if (updateDue(lastFrameNow, now)) {
    try {
      drawVizFrame(now);
    } catch (err) {
      // A throwing frame() would strand the overlay over a dead canvas —
      // close so the player UI comes back (no auto-reopen: our bug, not the OS).
      console.warn('visualizer frame failed, closing:', err);
      closeVisualizer();
      return;
    }
  }
  if (isOpen) vizFrame = requestAnimationFrame(vizTick);
}

function stopFrame() {
  if (vizFrame) { cancelAnimationFrame(vizFrame); vizFrame = null; }
}

function ensureRegistered(viz) {
  if (!registered.has(viz.id)) {
    vizGL.registerProgram(viz.id, viz.frag, viz.uniformSpec, { feedback: !!viz.feedback });
    registered.add(viz.id);
  }
}

// Load a visualization's chunk and remember the entry for sync access
function ensureLoaded(id) {
  return getViz(id).then(entry => {
    loadedEntries.set(entry.id, entry);
    return entry;
  });
}

// Warm every visualization chunk — fired on first picker reveal, so the
// menu selects instantly.
function warmAll() {
  if (allWarmed) return;
  allWarmed = true;
  VIZ_IDS.forEach(id => ensureLoaded(id).catch(() => {}));
}

// User picked a visualization: persist it, load its chunk if needed, and
// crossfade. If its shader won't compile on this GPU, revert to what runs.
function selectVisualization(id) {
  vizSelection = id;
  writeVizPref(vizTapeKey, id);
  picker?.setActive(id);
  if (!isOpen || id === activeViz?.id) return;
  ensureLoaded(id).then(entry => {
    if (!isOpen || vizSelection !== id || entry.id === activeViz.id) return;
    if (!beginTransition(entry)) revertSelection();
  }).catch(revertSelection);
}

function revertSelection() {
  vizSelection = activeViz?.id || getDefaultViz().id;
  writeVizPref(vizTapeKey, vizSelection);
  picker?.setActive(vizSelection);
}

// Crossfade to another visualization. Returns false if its shader doesn't
// compile on this GPU — the current one keeps running.
function beginTransition(entry) {
  if (!vizGL || !isOpen || entry.id === activeViz.id) return false;
  ensureRegistered(entry);
  if (!vizGL.use(entry.id)) return false;
  if (pendingViz) promotePending(); // a switch mid-fade lands the old fade first
  pendingViz = entry;
  pendingState = entry.initState(Math.random() * 100);
  pendingPal = paletteFor(entry, vizBgHex);
  resetBlooms(bloomState);
  lastBloomAt = vizTime(performance.now());
  transitionStart = performance.now();
  if (vizReducedMotion) {
    promotePending();
    drawVizFrame(performance.now());
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initVisualizer(reducedMotion, isPride = false, opts = {}) {
  vizReducedMotion = reducedMotion;
  vizIsPride = isPride;
  vizOpts = opts;
  vizTapeKey = opts.tapeId || '_';
  vizSelection = resolveVizSelection(readVizPref(vizTapeKey), opts.defaultViz, VIZ_IDS, getDefaultViz().id);

  vizCanvas = document.createElement('canvas');
  vizCanvas.id = 'viz-canvas';
  sizeCanvas();
  vizGL = createVizGL(vizCanvas);
  if (!vizGL) return; // no WebGL: no overlay, no ⊙ button — feature absent

  // The default visualization must compile, or the feature is absent —
  // same contract as having no WebGL at all.
  ensureRegistered(getDefaultViz());
  if (!vizGL.use(getDefaultViz().id)) { vizGL = null; return; }

  vizGL.onLost(() => {
    stopFrame();
    if (isOpen) {
      // An OS reclaim, not a user choice — remember it so the overlay can
      // reinstate itself once the context and playback recover. The pause
      // that follows a GPU-process kill closes the overlay through the
      // ordinary pause path, so eligibility is recorded here, at the loss.
      sysClosedAt = performance.now();
      // If the GPU never gives the context back, close so the player UI
      // isn't stranded behind a blank overlay.
      if (!ctxLossTimer) {
        ctxLossTimer = setTimeout(() => { ctxLossTimer = null; closeVisualizer(); }, CTX_LOSS_CLOSE_MS);
      }
    }
  });
  vizGL.onRestored(() => {
    if (ctxLossTimer) { clearTimeout(ctxLossTimer); ctxLossTimer = null; }
    if (isOpen) {
      sysClosedAt = null; // recovered in place, nothing to reinstate
      if (vizReducedMotion) drawVizFrame(performance.now());
      else if (!document.hidden && !vizFrame) vizFrame = requestAnimationFrame(vizTick);
    } else {
      maybeReopenVisualizer();
    }
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

  // Horizontal swipe (touch) over the metadata block skips tracks — scoped
  // to this element so the open field itself stays navigation-free.
  let skipDown = null;
  vizTextEl.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    skipDown = { x: e.clientX, y: e.clientY, at: performance.now() };
  });
  vizTextEl.addEventListener('pointerup', e => {
    if (!skipDown || e.pointerType !== 'touch') { skipDown = null; return; }
    const dir = skipGesture(skipDown.x, skipDown.y, e.clientX, e.clientY, performance.now() - skipDown.at);
    skipDown = null;
    if (dir && isOpen) vizOpts.onTrackSkip?.(dir === 'next' ? 1 : -1);
  });

  const vizExitBtn = document.createElement('button');
  vizExitBtn.id = 'viz-exit';
  vizExitBtn.setAttribute('aria-label', 'Exit visualizer');
  vizExitBtn.textContent = '×';
  vizExitBtn.addEventListener('click', userClose);

  picker = createVizPicker({
    entries: VIZ_IDS.map(id => ({ id, name: VIZ_NAMES[id] })),
    activeId: vizSelection,
    onSelect: selectVisualization,
    onReveal: warmAll,
    groupLabel: L.vz,
  });

  // Hover-capable pointers: reveal the picker while the mouse is in the
  // bottom quarter of the screen, hide it shortly after leaving
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let pickerHideTimer = null;
    vizOverlay.addEventListener('pointermove', e => {
      if (!isOpen) return;
      if (pickerRevealZone(e.clientY, window.innerHeight)) {
        warmAll();
        if (pickerHideTimer) { clearTimeout(pickerHideTimer); pickerHideTimer = null; }
        picker.root.classList.add('picker-reveal');
      } else if (picker.root.classList.contains('picker-reveal') && !pickerHideTimer) {
        pickerHideTimer = setTimeout(() => {
          pickerHideTimer = null;
          picker.root.classList.remove('picker-reveal');
        }, 400);
      }
    });
  }

  // A quick tap blooms — the fidget interaction. Swipes are deliberately
  // inert: no fullscreen navigation gestures over the field.
  let ptrDown = null;
  const inControl = e => e.target.closest('#viz-exit') || e.target.closest('#viz-text') || e.target.closest('#viz-picker');
  vizOverlay.addEventListener('pointerdown', e => {
    if (inControl(e)) return;
    if (picker.isShown()) picker.setOpen(false); // outside tap closes the menu
    ptrDown = { x: e.clientX, y: e.clientY, at: performance.now() };
  });
  vizOverlay.addEventListener('pointerup', e => {
    if (!ptrDown || inControl(e)) { ptrDown = null; return; }
    const gesture = tapGesture(ptrDown.x, ptrDown.y, e.clientX, e.clientY, performance.now() - ptrDown.at);
    ptrDown = null;
    if (!isOpen) return;
    if (gesture === 'bloom') {
      const now = performance.now();
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight; // GL origin is bottom-left
      if (vizReducedMotion) {
        // Static mode: place the event mid-life so the single frame shows it
        spawnEvent(x, y, Math.max(0, vizTime(now) - 2));
        drawVizFrame(now);
      } else {
        spawnEvent(x, y, vizTime(now));
      }
    }
  });

  vizOverlay.append(vizCanvas, vizTextEl, vizExitBtn, picker.root);
  document.body.appendChild(vizOverlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) userClose();
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
    btnViz.addEventListener('click', openFromPlayer);
    controls.insertBefore(btnViz, timeEl);
  }
}

// Open with the player's current state (⊙ button and auto-reopen)
function openFromPlayer() {
  const bgHex = document.documentElement.style.getPropertyValue('--bg').trim() || '#c1440e';
  const title = document.getElementById('np-title')?.querySelector('span')?.textContent || '';
  const artist = document.getElementById('np-artist')?.querySelector('span')?.textContent || '';
  openVisualizer({ bgColor: bgHex, title, artist });
}

// Explicit exit (×, Escape): never auto-reopen afterwards.
function userClose() {
  sysClosedAt = null;
  closeVisualizer();
}

// Reinstate the overlay after a system-caused close (the OS reclaimed the
// GPU context mid-playback) — called on context restore and when playback
// (re)starts. A user's explicit exit never sets eligibility, so it never
// reopens uninvited.
export function maybeReopenVisualizer() {
  if (isOpen || !vizGL || vizGL.isLost()) return;
  if (!reopenDue(sysClosedAt, performance.now())) return;
  if (!vizOpts.isPlaying?.()) return;
  openFromPlayer();
}

export function openVisualizer({ bgColor, title, artist }) {
  if (isOpen || !vizGL) return;
  isOpen = true;
  sysClosedAt = null; // any open consumes reopen eligibility
  vizOpts.onOpenChange?.(true);

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
  vizSeed = Math.random() * 100;
  // Open with the selected visualization if its chunk is warm and compiles;
  // otherwise open with mesh and crossfade over when the selection arrives.
  let entry = loadedEntries.get(vizSelection) || getDefaultViz();
  ensureRegistered(entry);
  if (entry !== getDefaultViz() && !vizGL.use(entry.id)) entry = getDefaultViz();
  activeViz = entry;
  activeState = activeViz.initState(vizSeed);
  pendingViz = null;
  pendingState = null;
  pendingPal = null;
  applyPalette(vizBgHex);
  if (activeViz.id !== vizSelection) {
    const wanted = vizSelection;
    ensureLoaded(wanted).then(e => {
      if (isOpen && vizSelection === wanted) beginTransition(e);
    }).catch(() => {});
  }
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
  vizOpts.onOpenChange?.(false);

  stopFrame();
  document.body.classList.remove('viz-active');
  if (entryFadeId) { clearTimeout(entryFadeId); entryFadeId = null; }
  if (entryFallbackId) { clearTimeout(entryFallbackId); entryFallbackId = null; }
  if (ctxLossTimer) { clearTimeout(ctxLossTimer); ctxLossTimer = null; }

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
    spawnEvent(0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, vizTime(performance.now()), true);
  }
}

// Live --bg drift color from main.js — palette slot 0 follows it (throttled)
export function setVizBgColor(hex) {
  if (hex) vizBgHex = hex;
}

// Warm the saved selection's chunk once playback starts (intent is proven —
// the ⊙ button just appeared), so opening the visualizer doesn't wait on it.
export function preloadVizSelection() {
  if (vizSelection !== getDefaultViz().id) {
    ensureLoaded(vizSelection).catch(() => {});
  }
}

// Device orientation → tilt spring input. The colors lean with the device
// like thick liquid; when it stabilizes the autonomous drift takes back over.
export function setVizOrientation(beta, gamma) {
  if (!isOpen || vizReducedMotion) return;
  const [nx, ny] = normalizeTilt(beta, gamma, screen.orientation?.angle ?? 0);
  setTiltInput(tiltState, nx, ny);
}
