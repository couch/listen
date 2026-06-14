import './style.css';
import { L, lang, fmtDate } from './strings.js';
import { PALETTE, resolveBg, positionState, parsePositions, positionFor, tapeSwitchAction, haversine, fmt, hexToRgb, rgbToHex, smootherstep, dimColor, pickDriftTarget, isTransientPause, shouldResumeOnForeground } from './utils.js';
import { validatePlaylist } from './schema.js';
import { STATE, sourceOf, sameTrack, capsOf, attributionFor, artworkFor } from './sources/ids.js';
import { sourceFactory } from './sources/registry.js';
import { resolveTapeParam, tapeUrl } from './library.js';
import { initDrawer } from './drawer.js';
import { createOfflineUI } from './offline-ui.js';
import { initAmbient, startAmbient, stopAmbient } from './ambient.js';
// pride-canvas is loaded lazily — only when the playlist uses pride mode
let initPrideCanvas = () => {}, startPrideCanvas = () => {}, stopPrideCanvas = () => {};
import { initVisualizer, openVisualizer, closeVisualizer, isVisualizerOpen, maybeReopenVisualizer, updateVisualizer, updateVisualizerTrack, setVizBgColor, setVizOrientation, setVizTape, preloadVizSelection } from './visualizer.js';
import { updateDue } from './viz-logic.js';

const isEmbed = window !== window.top;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!isEmbed && location.protocol === 'file:') {
  document.getElementById('file-warning').style.display = 'block';
}

// Progress Pride flag colors in spectral order — every adjacent pair is harmonious,
// and the cycle wraps (pink→brown→red) within the warm family.
const PRIDE_COLORS = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];
// The displayed tape — hot-swappable via the library drawer / ?tape= deep
// links. config.js declares `const TAPE` (a non-reassignable lexical global),
// so every per-tape read goes through this local instead.
let tape = TAPE;
const originalTape = TAPE; // baked-in active tape — switching back needs no fetch
const BAKED_ID = TAPE.id;

let isPride, prideStartIdx, trackPrideColors;
function computePrideState() {
  isPride = tape.color === 'pride';
  // Random entry point into the spectrum — adjacent tracks always see adjacent hues
  prideStartIdx = isPride ? Math.floor(Math.random() * PRIDE_COLORS.length) : 0;
  trackPrideColors = tape.tracks.map((_, i) =>
    PRIDE_COLORS[(prideStartIdx + i) % PRIDE_COLORS.length]
  );
}
computePrideState();

const bg = resolveBg(tape.color, PALETTE);
document.documentElement.style.setProperty("--bg", bg);
document.documentElement.lang = lang;


// ── Wake Lock ──────────────────────────────────────────────────────────────
let wakeLock = null;
let lastPositionSave = 0;
let bufferingWatchdog = null;
let bufferingEscalation = null;
let bufferingBannerActive = false;
let goOffline = () => {};
let goOnline = () => {};
function clearBufferingWatchdog() {
  if (bufferingWatchdog) { clearTimeout(bufferingWatchdog); bufferingWatchdog = null; }
  if (bufferingEscalation) { clearTimeout(bufferingEscalation); bufferingEscalation = null; }
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || isEmbed || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {}
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
themeColorMeta.setAttribute('content', bg);
document.title = tape.title;
document.getElementById("tape-title").textContent = tape.title;
document.getElementById("attribution").textContent = L.au;
document.getElementById("tape").setAttribute("aria-label", L.pl);
document.getElementById("bar").setAttribute("aria-label", L.pc);
document.getElementById("scrubber").setAttribute("aria-label", L.pp);
document.getElementById("btn-play").setAttribute("aria-label", L.play);
document.getElementById("share-btn")?.setAttribute("aria-label", L.sh);

// Share button — revealed only where native share is available; the slot
// keeps its width either way (visibility, not display) so the library
// button beside it never shifts
if (!isEmbed && navigator.share) {
  const shareBtnEl = document.getElementById('share-btn');
  shareBtnEl.style.visibility = 'visible';
  shareBtnEl.addEventListener('click', async () => {
    try { await navigator.share({ title: tape.title, url: location.href }); } catch {}
  });
}


// Build track list — re-run on tape switch
const list = document.getElementById("track-list");
const trackEls = [];
function buildTrackList(tracks) {
  // Mutate trackEls in place — createOfflineUI captures this array reference
  trackEls.length = 0;
  list.replaceChildren();
  tracks.forEach((track, i) => {
  const li = document.createElement("li");
  li.className = "track";
  li.dataset.i = i;
  li.setAttribute("tabindex", "0");
  li.setAttribute("aria-label", L.by(track.title, track.artist));
  li.setAttribute("role", "button");
  li.setAttribute("aria-pressed", "false");
  li.addEventListener("focus", () => {
    if (focusedIndex === i) return; // already set by setFocused, avoid loop
    document.querySelectorAll(".track.kb-focused").forEach(el => el.classList.remove("kb-focused"));
    focusedIndex = i;
    li.classList.add("kb-focused");
  });
  li.addEventListener("blur", e => {
    if (!e.relatedTarget?.classList.contains("track")) {
      li.classList.remove("kb-focused");
      focusedIndex = -1;
    }
  });

  const num = document.createElement("span");
  num.className = "track-num";
  num.textContent = i + 1;

  const info = document.createElement("div");
  info.className = "track-info";

  const title = document.createElement("div");
  title.className = "track-title";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = track.title;
  title.appendChild(titleSpan);

  const artist = document.createElement("div");
  artist.className = "track-artist";
  const artistSpan = document.createElement("span");
  artistSpan.textContent = track.artist;
  artist.appendChild(artistSpan);

  const progress = document.createElement("div");
  progress.className = "track-progress";

  // Resume-timecode chip — filled by renderResumeIndicator on a tape that
  // isn't the one playing
  const resume = document.createElement("span");
  resume.className = "track-resume";

  info.append(title, artist);
  li.append(progress, num, info, resume);
  li.addEventListener("click", () => onTrackClick(i));
  trackEls.push(li);
  list.appendChild(li);
  });
}
buildTrackList(tape.tracks);

if (!isEmbed) {
  const footer = document.createElement('div');
  footer.id = 'playlist-footer';
  const metaEl = document.createElement('ul');
  metaEl.id = 'playlist-meta';
  footer.appendChild(metaEl);
  list.after(footer);
}

// Player state — one persistent controller per source family (created
// lazily, cached for the page lifetime); `active` is the controller driving
// the current track. A pure-file tape never instantiates the YT iframe.
const controllers = {};
let active = null;
let activeSourceId = null;
// The bar is global: playingTape is the tape object owning the loaded track
// (null = bar idle), decoupled from the displayed `tape` so a library switch
// never interrupts playback. currentIndex indexes playingTape.tracks. All
// row-coupled DOM work gates on isLinked() — every path that makes a tape
// playing assigns the same object, so identity is the whole check.
let playingTape = null;
const isLinked = () => playingTape !== null && playingTape === tape;
// A queued load whose source controller wasn't ready yet — carries its tape
// and resume offset so a flush after a tape switch still loads the right track
let pendingLoad = null;
let currentIndex = -1;
let playing = false;
// Mirror `playing` onto the document root so CSS can freeze the now-playing
// equalizer (.eq) whenever audio is paused — the bars mark *active* playback,
// not just a loaded track. Single source of truth: every write goes through here.
function setPlaying(v) {
  playing = v;
  document.documentElement.classList.toggle('audio-playing', v);
}
// A PLAYING has occurred since the last load — distinguishes a paused
// mid-track bar (survives a tape switch) from an untouched startup cue
// (doesn't); lastLoadWasCue goes stale after cue→play so it can't serve.
let started = false;
let ticker = null;
let focusedIndex = -1;
// Track transition in flight: performance.now() of the last load(). The
// transient PAUSED that loadVideoById fires mid-transition (mobile) must not
// count as a real pause; consumed by the first PAUSED, cleared on
// PLAYING/CUED/error. Only armed for sources whose caps demand it.
let trackLoadAt = null;
let lastLoadWasCue = false;

// ── Playback persistence ──
const POS_KEY = 'muxtape-pos';

function savePosition(overrideTime) {
  if (currentIndex < 0 || !playingTape?.id) return;
  try {
    const map = parsePositions(sessionStorage.getItem(POS_KEY));
    map[playingTape.id] = {
      index: currentIndex,
      time: overrideTime !== undefined ? overrideTime : (active ? Math.floor(active.getCurrentTime()) : 0),
    };
    sessionStorage.setItem(POS_KEY, JSON.stringify(map));
  } catch {}
}

function clearSavedPosition(tapeId) {
  if (!tapeId) return;
  try {
    const map = parsePositions(sessionStorage.getItem(POS_KEY));
    delete map[tapeId];
    sessionStorage.setItem(POS_KEY, JSON.stringify(map));
  } catch {}
}

// The displayed tape's slot — startup restore, the idle auto-cue on a tape
// switch, and the resume chip on a non-playing tape's last-played row
function getSavedPosition() {
  try {
    return positionFor(parsePositions(sessionStorage.getItem(POS_KEY)), tape.id, tape.tracks.length);
  } catch {}
  return null;
}

// When we were backgrounded mid-playback (performance.now() at hide; null when
// not playing then). On mobile the OS pauses media on hide, so a quick return
// resumes — see shouldResumeOnForeground.
let bgHiddenAt = null;
// After a foreground resume, a PAUSED arriving within this window is the OS's
// delayed background pause racing past the visibility event (the YouTube iframe
// is frozen while hidden and delivers its PAUSED only once we're visible
// again) — resume through it rather than tearing the UI down.
const RESUME_RACE_MS = 2000;
let resumeRaceUntil = 0;

// iOS may background Safari via the bfcache (pagehide/pageshow) and/or
// visibilitychange, and the order isn't guaranteed — capture the playing
// state on whichever fires first while we're still playing.
function noteBackgrounded() {
  if (bgHiddenAt === null && playing) bgHiddenAt = performance.now();
  savePosition();
  wakeLock = null; // browser auto-releases it; clear our reference
}

function onForeground() {
  const within = isMobile &&
    shouldResumeOnForeground(bgHiddenAt !== null, bgHiddenAt, performance.now());
  bgHiddenAt = null;
  if (within) {
    // Arm the race guard either way: if the OS pause already landed we resume
    // now; if it's still queued behind the visibility event, the PAUSED branch
    // catches it. A blocked gesture-less resume surfaces 'blocked' (paused UI,
    // no skip) — worst case is "stayed paused".
    resumeRaceUntil = performance.now() + RESUME_RACE_MS;
    if (active && !playing) active.play();
  } else if (playing) {
    acquireWakeLock();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) noteBackgrounded();
  else onForeground();
});
window.addEventListener('pageshow', onForeground);

window.addEventListener('pagehide', () => {
  noteBackgrounded();
  stopTicker();
  stopColorDrift();
  if (isPride) stopPrideCanvas();
  closeVisualizer();
  releaseWakeLock();
});

function controllerFor(sid) {
  if (!controllers[sid]) {
    controllers[sid] = sourceFactory(sid)({
      onReady: () => onSourceReady(sid),
      // Stale-event guard: a stopped outgoing controller still emits a
      // PAUSED — only the active track's source may drive the state machine.
      onState: s => { if (sid === activeSourceId) handleState(s); },
      onError: k => { if (sid === activeSourceId) handleSourceError(k); },
    });
  }
  return controllers[sid];
}

// Warm a controller for every source family in the tape eagerly — creating
// one from an async callback later would lose the user-gesture context on
// iOS, preventing autoplay on the first track click.
function warmControllers() {
  new Set(tape.tracks.map(sourceOf)).forEach(controllerFor);
}

function onSourceReady(sid) {
  if (pendingLoad) {
    if (sourceOf(pendingLoad.from.tracks[pendingLoad.index]) !== sid) return;
    const p = pendingLoad;
    pendingLoad = null;
    updateBtn();
    load(p.index, p);
  } else {
    maybeRestoreSavedPosition();
  }
}

// Cue the saved spot once at startup, as soon as its track's source is
// ready; any explicit load() (user click, pending flush) supersedes it.
let savedRestoreDone = false;
function maybeRestoreSavedPosition() {
  if (savedRestoreDone) return;
  const saved = getSavedPosition();
  if (!saved) { savedRestoreDone = true; return; }
  if (!controllerFor(sourceOf(tape.tracks[saved.index])).isReady()) return; // its onReady comes back here
  load(saved.index, { startSeconds: saved.time, cue: true, silent: true });
}

// Every 'unplayable' is fatal for this track (the YT codes — invalid id,
// removed/private, embed-restricted — and dead file URLs alike), so skip it.
// 'blocked' is the browser denying autoplay: show paused, never skip.
function handleSourceError(kind) {
  console.warn('player error', activeSourceId, kind);
  if (kind === 'blocked') { handleState(STATE.PAUSED); return; }
  clearBufferingWatchdog();
  hideBufferingBanner();
  trackLoadAt = null; // next() → load() arms a fresh transition marker
  // A dead cued track (saved-position restore) must not autoplay-skip on
  // page load — the user's first play press recovers from there.
  if (lastLoadWasCue) return;
  next();
}

function showBufferingBanner(withRetry = false) {
  if (isEmbed || document.body.classList.contains('is-offline')) return;
  bufferingBannerActive = true;
  const el = document.getElementById('offline-indicator');
  el.textContent = '';
  const msg = document.createElement('span');
  msg.textContent = L.buf;
  el.appendChild(msg);
  if (withRetry) {
    const btn = document.createElement('button');
    btn.className = 'banner-action';
    btn.textContent = '↺';
    btn.setAttribute('aria-label', 'retry');
    btn.addEventListener('click', () => { clearBufferingWatchdog(); hideBufferingBanner(); load(currentIndex, { from: playingTape }); });
    el.appendChild(btn);
  } else if (playingTape && currentIndex + 1 < playingTape.tracks.length) {
    const btn = document.createElement('button');
    btn.className = 'banner-action';
    btn.textContent = '⏭︎';
    btn.setAttribute('aria-label', 'skip');
    btn.addEventListener('click', () => { clearBufferingWatchdog(); hideBufferingBanner(); next(); });
    el.appendChild(btn);
  }
  el.removeAttribute('hidden');
  void el.offsetHeight;
  el.classList.add('banner-visible');
  updateBtn();
}

function hideBufferingBanner() {
  if (!bufferingBannerActive) return;
  bufferingBannerActive = false;
  const el = document.getElementById('offline-indicator');
  el.classList.remove('banner-visible');
  el.addEventListener('transitionend', () => {
    if (!el.classList.contains('banner-visible')) el.hidden = true;
  }, { once: true });
  updateBtn();
}

function handleState(state) {
  if (state === STATE.PLAYING) {
    trackLoadAt = null;
    resumeRaceUntil = 0; // resumed cleanly — disarm the race guard
    clearBufferingWatchdog();
    hideBufferingBanner();
    if (document.body.classList.contains('is-offline')) goOnline();
    setPlaying(true);
    started = true;
    updateBtn();
    startTicker();
    updateMediaSession();
    startColorDrift();
    maybeReopenVisualizer(); // reinstate after an OS-caused close, never a user exit
    // The opaque viz canvas hides the page — don't animate layers behind it
    if (!isVisualizerOpen()) {
      startAmbient();
      if (isPride) startPrideCanvas();
    }
    document.getElementById('btn-viz')?.removeAttribute('hidden');
    preloadVizSelection();
    acquireWakeLock();
    drawer?.markPlaying(); // refresh the live-color marker if the drawer is open
    if (isLinked()) {
      trackEls[currentIndex]?.classList.remove('paused');
      trackEls[currentIndex]?.classList.add('playing');
    }
  } else if (state === STATE.PAUSED) {
    // A pause landing right after a foreground resume is the OS's delayed
    // background pause racing past the visibility event — replay through it
    // instead of tearing the UI down (see onForeground / RESUME_RACE_MS).
    if (resumeRaceUntil && performance.now() < resumeRaceUntil && active && !document.hidden) {
      resumeRaceUntil = 0;
      active.play();
      return;
    }
    // First PAUSED inside a track transition is loadVideoById's transient
    // pause, not the user's — consume the marker so the next pause is real.
    const transientPause = isTransientPause(trackLoadAt, performance.now());
    trackLoadAt = null;
    clearBufferingWatchdog();
    hideBufferingBanner();
    setPlaying(false);
    updateBtn();
    stopTicker();
    savePosition();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    stopColorDrift();
    stopAmbient();
    if (isPride) stopPrideCanvas();
    document.getElementById('btn-viz')?.setAttribute('hidden', '');
    if (!transientPause && isVisualizerOpen()) closeVisualizer();
    releaseWakeLock();
    if (isLinked()) {
      trackEls[currentIndex]?.classList.remove('playing');
      trackEls[currentIndex]?.classList.add('paused');
    }
  } else if (state === STATE.BUFFERING) {
    clearBufferingWatchdog();
    bufferingWatchdog = setTimeout(() => {
      if (active?.getState() === STATE.BUFFERING) {
        showBufferingBanner(false);
        bufferingEscalation = setTimeout(() => {
          if (active?.getState() === STATE.BUFFERING) {
            showBufferingBanner(true);
          }
        }, 70000);
      }
    }, 4000);
  } else if (state === STATE.ENDED) {
    clearBufferingWatchdog();
    next();
  } else if (state === STATE.CUED) {
    trackLoadAt = null; // load() arms the marker on the cue path too
    clearBufferingWatchdog();
    setPlaying(false);
    updateBtn();
    const cur = active.getCurrentTime();
    const dur = active.getDuration();
    if (dur > 0) {
      const ratio = cur / dur;
      const pct = `${ratio * 100}%`;
      const scrubFill = document.getElementById("scrubber-fill");
      scrubFill.style.transition = "none";
      scrubFill.style.width = pct;
      document.getElementById("time").textContent = `${fmt(cur)} / ${fmt(dur)}`;
      const scrub = document.getElementById("scrubber");
      scrub.setAttribute("aria-valuenow", Math.round(ratio * 100));
      scrub.setAttribute("aria-valuetext", L.of(fmt(cur), fmt(dur)));
      setMediaPosition(dur, cur);
      const p = isLinked() ? trackEls[currentIndex]?.querySelector(".track-progress") : null;
      if (p) { p.style.transition = "none"; p.style.width = pct; }
      requestAnimationFrame(() => {
        scrubFill.style.transition = "";
        if (p) p.style.transition = "";
      });
    }
  }
}

function onTrackClick(i) {
  const t = tape.tracks[i];
  if (!t) return; // empty tape, or an index from a stale handler
  if (isLinked() && i === currentIndex) {
    playing ? active.pause() : active.play();
    return;
  }
  // On a tape that isn't the one playing, its last-played row resumes at the
  // saved timecode — with playback, unlike the idle cue restore
  const saved = isLinked() ? null : getSavedPosition();
  load(i, saved && saved.index === i ? { startSeconds: saved.time } : undefined);
}

// cue = load without playing (saved-position restore); startSeconds without
// cue = start playback from that offset (a resume-row click). `from` is the
// tape the index belongs to — the displayed tape for user clicks, playingTape
// for next/prev/retry so they advance the playing tape even when another is
// displayed.
function load(i, { startSeconds, cue = false, silent = false, from = tape } = {}) {
  const t = from.tracks[i];
  if (!t) return; // empty tape, or an index from a stale handler
  const sid = sourceOf(t);
  const c = controllerFor(sid);
  if (!c.isReady()) {
    pendingLoad = { index: i, startSeconds, cue, silent, from };
    document.getElementById("btn-play").textContent = "·";
    return;
  }
  savedRestoreDone = true; // an explicit load supersedes the startup restore
  if (!silent && !isEmbed) navigator.vibrate?.(30);
  clearActive();
  playingTape = from;
  started = false;
  const linked = isLinked();
  barEl.classList.add("bar-visible");
  measureBar();
  const scrubFill = document.getElementById("scrubber-fill");
  scrubFill.style.transition = "none";
  scrubFill.style.width = "0%";
  requestAnimationFrame(() => { scrubFill.style.transition = ""; });
  const scrub = document.getElementById("scrubber");
  scrub.setAttribute("aria-valuenow", "0");
  scrub.setAttribute("aria-valuetext", "0:00");
  document.getElementById("time").textContent = "";
  // Source handoff — point the event filter at the new source before
  // stopping the old controller, so its stop-induced PAUSED is ignored
  activeSourceId = sid;
  const prev = active;
  active = c;
  if (prev && prev !== c) { try { prev.stop(); } catch {} }
  currentIndex = i;
  trackLoadAt = capsOf(sid).needsTransientPauseGuard ? performance.now() : null;
  lastLoadWasCue = cue;
  updateMediaSession("paused");
  if (isPride && linked) {
    // Per-track pride colors belong to the displayed tape's spectrum
    prideColorIdx = (prideStartIdx + i) % PRIDE_COLORS.length;
    stopColorDrift();
    document.documentElement.style.setProperty("--bg", trackPrideColors[i]);
  }
  document.title = `${t.title} — ${t.artist} | ${from.title}`;
  c.load(t, { startSeconds, cue });
  const npTitle = document.getElementById("np-title");
  const npArtist = document.getElementById("np-artist");
  npTitle.querySelector("span").textContent = t.title;
  npArtist.querySelector("span").textContent = t.artist;
  const attr = document.getElementById("attribution");
  const a = attributionFor(t);
  attr.href = a.href;
  attr.textContent = a.label ? L.auf(a.label) : L.au;
  attr.style.display = "block";
  if (linked) {
    clearResumeIndicator(); // the live active row replaces the chip
    const el = trackEls[i];
    el.classList.add("active");
    el.setAttribute("aria-pressed", "true");
    scrollTrackIntoView(el);
    startMarquee(el.querySelector(".track-title"));
    startMarquee(el.querySelector(".track-artist"));
  }
  announce(L.np(t.title, t.artist));
  if (isVisualizerOpen()) updateVisualizerTrack(t.title, t.artist);
  startMarquee(npTitle);
  startMarquee(npArtist);
  updateNowPlayingChip();
}

function next() {
  if (playingTape && currentIndex + 1 < playingTape.tracks.length) {
    load(currentIndex + 1, { from: playingTape });
  } else {
    const endedId = playingTape?.id;
    resetPlaybackUI();
    document.title = tape.title;
    clearSavedPosition(endedId); // this tape finished — other tapes keep their spots
    announce(L.pe);
  }
}

// Lock-screen position cosmetics must never break playback or a tape
// switch: WebKit enforces MediaPositionState strictly (duration required and
// finite, position <= duration) and throws TypeError where Chrome forgives —
// an unguarded call inside applyTape silently killed tape switching on iOS.
function setMediaPosition(dur, pos) {
  try {
    if (!navigator.mediaSession?.setPositionState) return;
    if (dur === undefined) { navigator.mediaSession.setPositionState(); return; } // clear
    const state = positionState(dur, pos);
    if (state) navigator.mediaSession.setPositionState(state);
  } catch {}
}

// Return all playback UI to the idle state — shared by the end-of-playlist
// branch of next() and the library tape switch (which runs it against the
// outgoing tape's DOM before rebuilding).
function resetPlaybackUI() {
  clearActive();
  setPlaying(false);
  updateBtn();
  stopTicker();
  stopColorDrift();
  clearBufferingWatchdog();
  hideBufferingBanner();
  if (isPride) stopPrideCanvas();
  if (isVisualizerOpen()) closeVisualizer();
  releaseWakeLock();
  setMediaPosition(); // clear
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  currentIndex = -1;
  pendingLoad = null;
  playingTape = null;
  started = false;
  trackLoadAt = null;
  // Detach the source so any late events from a stopped controller are
  // filtered out by the activeSourceId guard
  active = null;
  activeSourceId = null;
  updateNowPlayingChip();
  barEl.classList.remove("bar-visible");
  document.documentElement.style.setProperty('--bar-h', '0px');
  document.getElementById("scrubber-fill").style.width = "0%";
  const npTitle = document.getElementById("np-title");
  const npArtist = document.getElementById("np-artist");
  stopMarquee(npTitle);
  stopMarquee(npArtist);
  npTitle.querySelector("span").textContent = "";
  npArtist.querySelector("span").textContent = "";
  document.getElementById("time").textContent = "";
  document.getElementById("attribution").style.display = "none";
  const s = document.getElementById("scrubber");
  s.setAttribute("aria-valuenow", "0");
  s.setAttribute("aria-valuetext", "0:00");
}

function clearActive() {
  const progEls = [];
  trackEls.forEach(el => {
    el.classList.remove("active", "playing", "paused");
    el.setAttribute("aria-pressed", "false");
    stopMarquee(el.querySelector(".track-title"));
    stopMarquee(el.querySelector(".track-artist"));
    const p = el.querySelector(".track-progress");
    if (p) { p.style.transition = "none"; p.style.width = "0%"; progEls.push(p); }
  });
  if (progEls.length) requestAnimationFrame(() => progEls.forEach(p => { p.style.transition = ""; }));
}

function setFocused(i) {
  document.querySelectorAll(".track.kb-focused").forEach(el => el.classList.remove("kb-focused"));
  focusedIndex = i;
  if (i < 0) return;
  const el = trackEls[i];
  if (el) {
    el.classList.add("kb-focused");
    el.focus({ preventScroll: true }); // moves real browser focus so Tab stays in sync
    if (!isVisualizerOpen()) scrollTrackIntoView(el);
  }
}

document.addEventListener("keydown", e => {
  if (document.body.classList.contains('is-offline')) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (isVisualizerOpen()) {
    // Visualizer mode: space toggles playback, arrows skip tracks.
    // The list-focus logic below targets the hidden playlist — skip it.
    if (e.key === " ") {
      e.preventDefault();
      if (active) playing ? active.pause() : active.play();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (currentIndex > 0) load(currentIndex - 1, { from: playingTape });
    }
    return;
  }
  const n = tape.tracks.length;
  if (!n) return;
  if (e.key === " ") {
    // Let viz-open / viz-exit buttons handle their own Space/click natively
    if (e.target.tagName === "BUTTON" && e.target.id !== "btn-play") return;
    e.preventDefault();
    // onTrackClick handles a not-yet-ready source (pends the track)
    if (focusedIndex >= 0) {
      onTrackClick(focusedIndex);
    } else if (currentIndex === -1) {
      onTrackClick(0);
    } else if (active) {
      playing ? active.pause() : active.play();
    }
  } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    // currentIndex indexes the playing tape — only a valid list seed when linked
    setFocused(focusedIndex < 0 ? (isLinked() && currentIndex >= 0 ? currentIndex : 0) : (focusedIndex + 1) % n);
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    setFocused(focusedIndex < 0 ? (isLinked() && currentIndex >= 0 ? currentIndex : 0) : (focusedIndex - 1 + n) % n);
  } else if (e.key === "Enter" && focusedIndex >= 0) {
    onTrackClick(focusedIndex);
  } else if (e.key === "Tab" && !e.shiftKey && document.activeElement?.id === "attribution") {
    e.preventDefault();
    setFocused(0);
  }
});

function updateBtn() {
  const btn = document.getElementById("btn-play");
  if (bufferingBannerActive) {
    btn.textContent = "↻";
    btn.setAttribute("aria-label", L.buf);
    btn.classList.add("buffering");
    return;
  }
  btn.classList.remove("buffering");
  btn.textContent = playing ? "⏸︎" : "▶︎";
  btn.setAttribute("aria-label", playing ? L.pause : L.play);
}

document.getElementById("btn-play").addEventListener("click", () => {
  if (currentIndex === -1) { onTrackClick(0); return; }
  if (!active) return;
  playing ? active.pause() : active.play();
});

// Scrubber — mouse
document.getElementById("scrubber").addEventListener("click", seek);

// Scrubber — touch
const scrubEl = document.getElementById("scrubber");
let pendingScrubPct = null;
scrubEl.addEventListener("touchstart", e => {
  if (!active || currentIndex === -1) return;
  const touch = e.touches[0];
  const r = scrubEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
  const dur = active.getDuration();
  if (dur) { active.seekTo(pct * dur); snapSeek(pct); }
}, { passive: true });
scrubEl.addEventListener("touchmove", e => {
  if (!active || currentIndex === -1) return;
  const touch = e.touches[0];
  const r = scrubEl.getBoundingClientRect();
  pendingScrubPct = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
  snapSeek(pendingScrubPct);
}, { passive: true });
scrubEl.addEventListener("touchend", () => {
  if (pendingScrubPct === null) return;
  const dur = active?.getDuration();
  if (dur) {
    const t = pendingScrubPct * dur;
    active.seekTo(t);
    setMediaPosition(dur, t);
  }
  pendingScrubPct = null;
}, { passive: true });

function snapSeek(pct) {
  const w = `${pct * 100}%`;
  // Scrubber fill — bypasses the 500ms ticker delay
  document.getElementById("scrubber-fill").style.width = w;
  // Track progress — disable transition for instant snap, restore for playback
  const p = isLinked() ? trackEls[currentIndex]?.querySelector(".track-progress") : null;
  if (p) {
    p.style.transition = "none";
    p.style.width = w;
    requestAnimationFrame(() => { p.style.transition = ""; });
  }
}

function seek(e) {
  if (!active || currentIndex === -1) return;
  const r = scrubEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const dur = active.getDuration();
  if (dur) {
    const t = pct * dur;
    active.seekTo(t);
    snapSeek(pct);
    setMediaPosition(dur, t);
  }
}

function startTicker() {
  stopTicker();
  let lastSlowUpdate = 0;
  function tick(now) {
    if (!active) return;
    const cur = active.getCurrentTime();
    const dur = active.getDuration();
    if (!dur) { ticker = requestAnimationFrame(tick); return; }
    const ratio = cur / dur;
    const pct = `${ratio * 100}%`;
    document.getElementById("scrubber-fill").style.width = pct;
    document.getElementById("time").textContent = `${fmt(cur)} / ${fmt(dur)}`;
    if (now - lastSlowUpdate >= 500) {
      const first = lastSlowUpdate === 0;
      lastSlowUpdate = now;
      const p = isLinked() ? trackEls[currentIndex]?.querySelector(".track-progress") : null;
      if (p) {
        if (first) {
          p.style.transition = "none";
          p.style.width = pct;
          requestAnimationFrame(() => { const q = isLinked() ? trackEls[currentIndex]?.querySelector(".track-progress") : null; if (q) q.style.transition = ""; });
        } else {
          p.style.width = pct;
        }
      }
      const s = document.getElementById("scrubber");
      s.setAttribute("aria-valuenow", Math.round(ratio * 100));
      s.setAttribute("aria-valuetext", L.of(fmt(cur), fmt(dur)));
      setMediaPosition(dur, cur);
      if (now - lastPositionSave >= 30000) { lastPositionSave = now; savePosition(); }
      if (isVisualizerOpen()) updateVisualizer(cur, dur, playingTape?.tracks[currentIndex]?.title, playingTape?.tracks[currentIndex]?.artist);
    }
    ticker = requestAnimationFrame(tick);
  }
  ticker = requestAnimationFrame(tick);
}

function stopTicker() {
  if (ticker) { cancelAnimationFrame(ticker); ticker = null; }
}

let announceFrame = null;
function announce(msg) {
  const el = document.getElementById("a11y-announce");
  if (announceFrame) cancelAnimationFrame(announceFrame);
  el.textContent = "";
  announceFrame = requestAnimationFrame(() => { el.textContent = msg; announceFrame = null; });
}

// ── Generative background color drift ─────────────────────────────────────
// Interpolates slowly between palette colors while playing.
// smootherstep keeps the first few seconds nearly imperceptible.
const DRIFT_MS = 45000;
// Style writes at 10Hz, not per rAF — a 100ms step on a 45s smootherstep
// ramp is invisible, and it avoids invalidating page styles every frame
const DRIFT_WRITE_MS = 100;
let driftFrame = null, driftFrom, driftTo, driftToHex, driftStart;
let lastDriftWrite = null;
let prideColorIdx = 0;


function startColorDrift() {
  if (driftFrame || reducedMotion) return;
  lastDriftWrite = null;
  const cur = document.documentElement.style.getPropertyValue("--bg").trim() || PALETTE[0];
  driftFrom = hexToRgb(cur);
  driftToHex = isPride
    ? PRIDE_COLORS[(prideColorIdx + 1) % PRIDE_COLORS.length]
    : pickDriftTarget(cur);
  driftTo = hexToRgb(driftToHex);
  driftStart = performance.now();
  driftFrame = requestAnimationFrame(tickDrift);
}

function tickDrift(now) {
  const t = Math.min((now - driftStart) / DRIFT_MS, 1);
  if (updateDue(lastDriftWrite, now, DRIFT_WRITE_MS) || t >= 1) {
    lastDriftWrite = now;
    const rgb = driftFrom.map((v,i) => v + (driftTo[i] - v) * smootherstep(t));
    const hex = rgbToHex(rgb);
    document.documentElement.style.setProperty("--bg", hex);
    themeColorMeta.setAttribute('content', hex);
    setVizBgColor(hex); // visualizer palette slot 0 tracks the drift
  }
  if (t < 1) {
    driftFrame = requestAnimationFrame(tickDrift);
  } else {
    driftFrom = driftTo;
    const prev = driftToHex;
    if (isPride) {
      prideColorIdx = (prideColorIdx + 1) % PRIDE_COLORS.length;
      driftToHex = PRIDE_COLORS[(prideColorIdx + 1) % PRIDE_COLORS.length];
    } else {
      driftToHex = pickDriftTarget(prev);
    }
    driftTo = hexToRgb(driftToHex);
    driftStart = now;
    driftFrame = requestAnimationFrame(tickDrift);
  }
}

function stopColorDrift() {
  if (driftFrame) { cancelAnimationFrame(driftFrame); driftFrame = null; }
}

const barEl = document.getElementById('bar');
const isMobile = isEmbed ? false : window.matchMedia('(hover: none) and (pointer: coarse)').matches;
initAmbient(reducedMotion);
// Pride canvas loads lazily on first need — at startup, or when a tape
// switch lands on a pride tape mid-session
let prideCanvasRequested = false;
function ensurePrideCanvas() {
  if (!isPride || isEmbed || prideCanvasRequested) return;
  prideCanvasRequested = true;
  import('./pride-canvas.js').then(m => {
    ({ initPrideCanvas, startPrideCanvas, stopPrideCanvas } = m);
    initPrideCanvas(reducedMotion);
  });
}
ensurePrideCanvas();
if (!isEmbed) initVisualizer(reducedMotion, isPride, {
  tapeId: tape.id,
  defaultViz: tape.viz,
  // Horizontal swipe over the visualizer's metadata block — same moves as
  // the viz-open arrow keys
  onTrackSkip(dir) {
    if (dir > 0) next();
    else if (currentIndex > 0) load(currentIndex - 1, { from: playingTape });
  },
  isPlaying: () => playing,
  // ⊙ click (user gesture): iOS orientation permission prompt
  onUserOpen: requestVizOrientation,
  // The opaque viz canvas hides the page — pause the decorative layers
  // behind it while the overlay is open, resume them on close
  onOpenChange(open) {
    if (open) {
      stopAmbient();
      if (isPride) stopPrideCanvas();
    } else if (playing) {
      startAmbient();
      if (isPride) startPrideCanvas();
    }
  },
});
let geoRequested = false;
let cachedBarH = 0;

if (!isEmbed) {
  ({ goOffline, goOnline } = createOfflineUI({
    offlineEl: document.getElementById('offline-indicator'),
    barEl,
    trackEls,
    themeColorMeta,
    bg,
    dimColor,
    offlineText: L.offline,
    getPlaying: () => playing,
    getPlayer: () => active,
    getCurrentIndex: () => currentIndex,
    releaseWakeLock,
    stopColorDrift,
    savePosition,
    updateBtn,
    setCachedBarH: h => { cachedBarH = h; },
  }));
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', () => {
    clearBufferingWatchdog();
    hideBufferingBanner();
    // Offline pauses playback; that pause may race the track-transition
    // marker, so close the visualizer explicitly rather than via PAUSED.
    if (isVisualizerOpen()) closeVisualizer();
    goOffline();
  });
  setTimeout(() => { if (!navigator.onLine) goOffline(); }, 0);
}

window.addEventListener('resize', () => {
  if (barEl.classList.contains('bar-visible')) {
    cachedBarH = barEl.offsetHeight;
    document.documentElement.style.setProperty('--bar-h', `${cachedBarH}px`);
  }
});

function measureBar() {
  requestAnimationFrame(() => {
    cachedBarH = barEl.offsetHeight;
    document.documentElement.style.setProperty('--bar-h', `${cachedBarH}px`);
  });
}

// ── Global player bar ──────────────────────────────────────────────────────
// When the displayed tape isn't the one playing (unlinked), the now-playing
// block grows a source-tape chip and taps back to that tape; the displayed
// tape's last-played row carries a resume-timecode chip instead of the
// auto-cue. Both are inert while linked.

const npTapeBtn = document.getElementById('np-tape');

function updateNowPlayingChip() {
  if (!npTapeBtn) return;
  const unlinked = !isLinked() && !!playingTape?.id;
  npTapeBtn.hidden = !unlinked;
  barEl.classList.toggle('np-unlinked', unlinked);
  if (unlinked) {
    npTapeBtn.querySelector('.np-tape-title').textContent = playingTape.title;
    npTapeBtn.setAttribute('aria-label', L.bk(playingTape.title));
  }
  // The chip adds/removes a bar line — keep scroll clearance in sync
  if (barEl.classList.contains('bar-visible')) measureBar();
}

document.getElementById('now-playing').addEventListener('click', () => {
  if (!isLinked() && playingTape?.id) switchTape(playingTape.id);
});

function clearResumeIndicator() {
  trackEls.forEach(el => {
    if (!el.classList.contains('resumable')) return;
    el.classList.remove('resumable');
    const r = el.querySelector('.track-resume');
    if (r) r.textContent = '';
    const i = +el.dataset.i;
    const t = tape.tracks[i];
    if (t) el.setAttribute('aria-label', L.by(t.title, t.artist));
  });
}

function renderResumeIndicator(saved) {
  clearResumeIndicator();
  if (!saved) return;
  const el = trackEls[saved.index];
  const r = el?.querySelector('.track-resume');
  if (!r) return;
  el.classList.add('resumable');
  r.textContent = `⏵ ${fmt(saved.time)}`;
  const t = tape.tracks[saved.index];
  el.setAttribute('aria-label', `${L.by(t.title, t.artist)} · ${L.rs(fmt(saved.time))}`);
}

// Re-couple the rebuilt track list to live playback after switching back to
// the playing tape — no state event will re-fire to paint these.
function relinkRows() {
  const el = trackEls[currentIndex];
  if (!el) return;
  el.classList.add('active', playing ? 'playing' : 'paused');
  el.setAttribute('aria-pressed', 'true');
  startMarquee(el.querySelector('.track-title'));
  startMarquee(el.querySelector('.track-artist'));
  const dur = active?.getDuration();
  if (dur > 0) {
    const p = el.querySelector('.track-progress');
    p.style.transition = 'none';
    p.style.width = `${(active.getCurrentTime() / dur) * 100}%`;
    requestAnimationFrame(() => { p.style.transition = ''; });
  }
}

// Footer metadata: each line wears an outline glyph tied to its meaning (sprout
// = created, cycle arrows = edited, pin = the distance line) in the track-number
// column, with the text aligned to the track-title column of the grid (no track
// count — the track list is already numbered). Each line is its own <li>, so a
// populating distance line can't reflow the dates. Glyphs are decorative (the
// lines carry their own words), so they're aria-hidden; stroke/fill come from CSS.
const META_SVG_NS = 'http://www.w3.org/2000/svg';
const META_ICONS = {
  // sprout / seedling: curved stem with a leaf splayed to each side (Lucide sprout)
  created: ['M7 20h10', 'M10 20c5.5-2.5.8-6.4 3-10', 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z', 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z'],
  // refresh / cycle arrows (Feather refresh-cw)
  edited: ['M23 4 V10 H17', 'M1 20 V14 H7', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  // map pin (Feather map-pin)
  location: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
};
function metaIcon(type) {
  const svg = document.createElementNS(META_SVG_NS, 'svg');
  svg.setAttribute('class', 'meta-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of META_ICONS[type]) {
    const p = document.createElementNS(META_SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function metaLine(text, glyph) {
  const li = document.createElement('li');
  li.className = 'meta-line';
  li.appendChild(metaIcon(glyph));
  const span = document.createElement('span');
  span.textContent = text;
  li.appendChild(span);
  return li;
}

function initPlaylistMeta() {
  if (isEmbed) return;
  const el = document.getElementById('playlist-meta');
  if (!el) return;
  el.replaceChildren();
  const created = tape.created;
  const lastEdited = tape.lastEdited || created;
  if (created) {
    el.appendChild(metaLine(`${L.cr} ${fmtDate(created)}`, 'created'));
    if (lastEdited && lastEdited !== created) el.appendChild(metaLine(`${L.ed} ${fmtDate(lastEdited)}`, 'edited'));
  }
  initLocationLine();
}

// Viewer coords are cached so a tape switch can re-derive the distance line for
// the new tape's location without another permission round-trip.
let viewerCoords = null;
const locLine = () => document.getElementById('playlist-loc');

function clearLocInteractive(line) {
  line.className = 'meta-line meta-loc';
  line.onclick = null;
  line.onkeydown = null;
  line.removeAttribute('role');
  line.removeAttribute('tabindex');
}

// Resting state on a located tape: a tappable invitation rather than an
// unprompted geolocation request (which reads as a grab, and whose denial
// sticks). The tap is the gesture the prompt wants; curiosity precedes it.
function renderLocTeaser(line) {
  line.className = 'meta-line meta-loc meta-loc-cta';
  const body = document.createElement('span');
  body.className = 'meta-loc-body';
  const hook = document.createElement('span');
  hook.className = 'meta-loc-hook';
  hook.textContent = L.lh;
  const note = document.createElement('span');
  note.className = 'meta-loc-note';
  note.textContent = L.lp;
  body.append(hook, note);
  line.replaceChildren(metaIcon('location'), body);
  line.setAttribute('role', 'button');
  line.setAttribute('tabindex', '0');
  line.onclick = requestViewerGeo;
  line.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestViewerGeo(); } };
}

// Only tapes with their own coordinates get a distance line. The viewer's coords
// are reused for the session (set once, every located tape resolves instantly).
// The Permissions API lets prior grantors skip the tap; everyone else taps.
function initLocationLine() {
  const meta = document.getElementById('playlist-meta');
  if (!meta || !tape.location?.lat || !navigator.geolocation) return;
  const line = document.createElement('li');
  line.className = 'meta-line meta-loc';
  line.id = 'playlist-loc';
  meta.appendChild(line);

  if (viewerCoords) { applyViewerLocation(...viewerCoords); return; }

  const perms = navigator.permissions?.query?.({ name: 'geolocation' });
  if (!perms) { renderLocTeaser(line); return; } // older Safari — no Permissions API
  perms.then(status => {
    const l = locLine();
    if (!l) return;
    if (status.state === 'granted') requestViewerGeo();   // silent upgrade — no tap
    else if (status.state === 'prompt') renderLocTeaser(l);
    else l.remove();                                       // denied → dates only, no nag
  }).catch(() => { const l = locLine(); if (l) renderLocTeaser(l); });
}

function applyViewerLocation(lat, lng) {
  if (!tape.location?.lat) return;
  const line = locLine();
  if (!line) return;
  const distKm = haversine(tape.location.lat, tape.location.lng, lat, lng);
  const dist = L.mi ? Math.round(distKm * 0.621371) : Math.round(distKm);
  clearLocInteractive(line);
  const span = document.createElement('span');
  span.textContent = distKm < 24 ? L.nb : L.fa(dist);
  line.replaceChildren(metaIcon('location'), span);
}

function requestViewerGeo() {
  if (!tape.location?.lat || !navigator.geolocation || geoRequested) return;
  geoRequested = true;
  const line = locLine();
  if (line) { // "locating…"
    clearLocInteractive(line);
    const span = document.createElement('span');
    span.textContent = L.ll;
    line.replaceChildren(metaIcon('location'), span);
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      viewerCoords = [pos.coords.latitude, pos.coords.longitude];
      applyViewerLocation(...viewerCoords);
    },
    () => {
      // Denied or unavailable — re-offer the tap (manual retry only, so a
      // granted-but-unavailable position can't spin in a silent retry loop).
      geoRequested = false;
      const l = locLine();
      if (l) renderLocTeaser(l);
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}
initPlaylistMeta(); // after the helpers above are defined (initLocationLine reads viewerCoords)

// Mobile: quick left/right roll → previous/next track
function scrollTrackIntoView(el) {
  if (!el) return;
  const barH = barEl.classList.contains('bar-visible') ? cachedBarH : 0;
  const bottomClearance = barH + 12;
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight;
  if (rect.top < 60) {
    window.scrollBy({ top: rect.top - 72, behavior: 'smooth' });
  } else if (rect.bottom > viewH - bottomClearance) {
    window.scrollBy({ top: rect.bottom - (viewH - bottomClearance), behavior: 'smooth' });
  }
}

let flickCooldown = false;
function handleMotion(e) {
  if (flickCooldown || !active) return;
  const rate = e.rotationRate?.gamma;
  if (!rate) return;
  if (rate > 250 && currentIndex > 0) {
    flickCooldown = true;
    setTimeout(() => { flickCooldown = false; }, 800);
    load(currentIndex - 1, { from: playingTape });
  } else if (rate < -250 && currentIndex >= 0 && playingTape && currentIndex < playingTape.tracks.length - 1) {
    flickCooldown = true;
    setTimeout(() => { flickCooldown = false; }, 800);
    load(currentIndex + 1, { from: playingTape });
  }
}

let motionListenersEnabled = false;
function enableMotionListeners() {
  if (motionListenersEnabled) return;
  motionListenersEnabled = true;
  window.addEventListener('devicemotion', handleMotion);
  // Tilt feeds the visualizer's liquid-gel color motion (no-op while closed)
  window.addEventListener('deviceorientation', e => setVizOrientation(e.beta, e.gamma));
}

// iOS 13+ gates device orientation behind a user-gesture permission. The only
// place tilt matters is the visualizer, so that grant is requested from the ⊙
// button (onUserOpen → requestVizOrientation) — there is no separate startup
// button. Android/desktop fire orientation without a prompt, so listeners attach
// at startup. Geolocation is handled entirely by the footer's tap-to-reveal line.
const isIOSMotionGate = typeof DeviceOrientationEvent !== 'undefined'
  && typeof DeviceOrientationEvent.requestPermission === 'function';

function requestVizOrientation() {
  if (!isMobile || motionListenersEnabled || !isIOSMotionGate) return;
  DeviceOrientationEvent.requestPermission().then(result => {
    if (result === 'granted') enableMotionListeners();
  }).catch(() => {});
}

if (!isEmbed) {
// Android fires orientation/motion without permission — attach now. iOS waits
// for the ⊙ grant (requestVizOrientation).
if (isMobile && !isIOSMotionGate) enableMotionListeners();

// Fade-in for playlist metadata when scrolled into view
const _metaEl = document.getElementById('playlist-meta');
if (_metaEl) {
  function revealMeta() {
    if (_metaEl.classList.contains('visible')) return;
    const rect = _metaEl.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      _metaEl.classList.add('visible');
      window.removeEventListener('scroll', revealMeta);
      window.removeEventListener('touchmove', revealMeta);
    }
  }
  window.addEventListener('scroll', revealMeta, { passive: true });
  window.addEventListener('touchmove', revealMeta, { passive: true });
  revealMeta();
}
} // end !isEmbed

const marqueeResizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => {
      for (const entry of entries) {
        const container = entry.target.parentElement;
        if (!container?.classList.contains('marquee-active')) continue;
        const overflow = container.scrollWidth - container.clientWidth;
        if (overflow <= 1) {
          stopMarquee(container);
        } else {
          container.style.setProperty('--marquee-offset', `-${overflow}px`);
          container.style.setProperty('--marquee-dur', `${Math.max(4, overflow / 10).toFixed(2)}s`);
        }
      }
    })
  : null;

function stopMarquee(el) {
  if (!el) return;
  const span = el.querySelector('span');
  if (span && marqueeResizeObserver) marqueeResizeObserver.unobserve(span);
  el.classList.remove('marquee-active');
  el.style.removeProperty('--marquee-offset');
  el.style.removeProperty('--marquee-dur');
}

function startMarquee(el) {
  if (!el) return;
  stopMarquee(el);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 1) return;
    const dur = Math.max(4, overflow / 10).toFixed(2);
    el.style.setProperty('--marquee-offset', `-${overflow}px`);
    el.style.setProperty('--marquee-dur', `${dur}s`);
    el.classList.add('marquee-active');
    const span = el.querySelector('span');
    if (span && marqueeResizeObserver) marqueeResizeObserver.observe(span);
  });
}

// MediaSession API — lock screen controls on mobile
function updateMediaSession(state = "playing") {
  if (!("mediaSession" in navigator)) return;
  const t = playingTape?.tracks[currentIndex];
  if (!t) return;
  const artwork = artworkFor(t);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    ...(artwork ? { artwork } : {}),
  });
  navigator.mediaSession.playbackState = state;
  navigator.mediaSession.setActionHandler("play", () => active?.play());
  navigator.mediaSession.setActionHandler("pause", () => active?.pause());
  navigator.mediaSession.setActionHandler("nexttrack",
    currentIndex + 1 < playingTape.tracks.length ? () => next() : null
  );
  navigator.mediaSession.setActionHandler("previoustrack",
    currentIndex > 0 ? () => load(currentIndex - 1, { from: playingTape }) : null
  );
  navigator.mediaSession.setActionHandler("seekforward", ({ seekOffset } = {}) => {
    const off = seekOffset || 10;
    const cur = active?.getCurrentTime() || 0;
    const dur = active?.getDuration() || 0;
    if (!dur) return;
    const t = Math.min(cur + off, dur);
    active.seekTo(t);
    setMediaPosition(dur, t);
  });
  navigator.mediaSession.setActionHandler("seekbackward", ({ seekOffset } = {}) => {
    const off = seekOffset || 10;
    const cur = active?.getCurrentTime() || 0;
    const dur = active?.getDuration() || 0;
    if (!dur) return;
    const t = Math.max(cur - off, 0);
    active.seekTo(t);
    setMediaPosition(dur, t);
  });
}

// ── Library tape switching ─────────────────────────────────────────────────
// Hot-swaps the displayed tape in place: ?tape=<id> deep links on load,
// drawer selections, and back/forward via history state. The baked-in tape
// needs no fetch; anything else is fetched and validated, failing soft (the
// current tape stays) on any error.

function applyTape(nextTape) {
  savePosition(); // a same-session return to the outgoing tape restores
  // The bar is global — a started track (playing or paused mid-way) survives
  // the switch; only an idle bar (nothing loaded, or an untouched startup
  // cue) lets the incoming tape's saved spot take over.
  const occupied = !!playingTape && (playing || started);
  const sameId = occupied && !!nextTape.id && nextTape.id === playingTape.id;
  const action = tapeSwitchAction(occupied, sameId,
    sameId && sameTrack(playingTape.tracks[currentIndex], nextTape.tracks[currentIndex]));

  if (action === 'reset') {
    try { active?.stop(); } catch {}
    resetPlaybackUI(); // runs against the outgoing tape's DOM — order matters
  } else {
    // Playback continues; the overlay still closes before setVizTape (the
    // documented no-live-render-race rule) and the outgoing tape's
    // decorative layers stop, restarted against the new bg below.
    if (isVisualizerOpen()) closeVisualizer();
    stopColorDrift();
    if (isPride) stopPrideCanvas();
  }
  stopAmbient();
  if (action === 'reset' || !playing) document.getElementById('btn-viz')?.setAttribute('hidden', '');

  tape = nextTape;
  computePrideState();
  warmControllers();

  const newBg = resolveBg(tape.color, PALETTE);
  document.documentElement.style.setProperty('--bg', newBg);
  themeColorMeta.setAttribute('content', newBg);
  setVizBgColor(newBg);
  ensurePrideCanvas();

  buildTrackList(tape.tracks);
  if (action === 'reset') document.title = tape.title; // else the playing track keeps it
  document.getElementById('tape-title').textContent = tape.title;
  initPlaylistMeta(); // rebuilds the date lines and re-resolves the location line

  setVizTape(tape.id, tape.viz, isPride);
  preloadVizSelection();

  if (action === 'relink') {
    // Back to the playing tape: adopt the fresh object (isLinked() holds
    // again) and re-couple the rebuilt rows to live playback
    playingTape = nextTape;
    if (isPride) prideColorIdx = (prideStartIdx + currentIndex) % PRIDE_COLORS.length;
    relinkRows();
  } else if (action === 'detach') {
    renderResumeIndicator(getSavedPosition());
  }
  updateNowPlayingChip();
  if (action !== 'reset' && playing) {
    // No PLAYING event will re-fire to restart these for the new tape
    startColorDrift();
    if (!isVisualizerOpen()) {
      startAmbient();
      if (isPride) startPrideCanvas();
    }
  }

  if (action === 'reset') {
    // Same-session position for this tape — every tape keeps its own slot in
    // the position map, so A→B→A returns to A's spot
    const saved = getSavedPosition();
    if (saved && controllerFor(sourceOf(tape.tracks[saved.index])).isReady()) {
      load(saved.index, { startSeconds: saved.time, cue: true, silent: true });
    }
  }

  drawer?.markActive(tape.id);
  window.scrollTo({ top: 0 });
  if (action === 'relink') scrollTrackIntoView(trackEls[currentIndex]);
  announce(tape.title);
}

let switchingTo = null;
async function switchTape(id, { pushUrl = true } = {}) {
  if (!id || id === tape.id || switchingTo === id) return;
  switchingTo = id;
  try {
    let pl;
    if (id === BAKED_ID) {
      pl = originalTape;
    } else {
      const res = await fetch(`/playlists/${encodeURIComponent(id)}.json`);
      if (!res.ok) throw new Error(`playlist fetch failed (${res.status})`);
      pl = await res.json();
      validatePlaylist(pl);
      if (!pl.id) pl.id = id;
    }
    if (switchingTo !== id) return; // superseded by a newer switch — last one wins
    applyTape(pl);
    if (pushUrl) history.pushState({ tape: id }, '', tapeUrl(id, BAKED_ID, location.pathname));
  } catch (e) {
    console.warn('tape switch failed', e);
  } finally {
    if (switchingTo === id) switchingTo = null;
  }
}

let drawer = null;
if (!isEmbed) {
  drawer = initDrawer({
    bakedTape: originalTape,
    getCurrentTapeId: () => tape.id,
    // The tape being heard (may differ from the displayed one when detached);
    // `started` gates out an untouched startup cue, so the live drift color
    // only marks a tape playback has actually driven --bg for.
    getPlayingTapeId: () => started ? playingTape?.id ?? null : null,
    onSelect: id => switchTape(id),
  });

  const tapeParam = resolveTapeParam(location.search, BAKED_ID);
  history.replaceState({ tape: tapeParam ?? BAKED_ID }, '', location.href);
  // Deep link: the baked tape renders instantly, the linked tape swaps in
  // when its JSON arrives (a failed fetch leaves the baked tape up)
  if (tapeParam) switchTape(tapeParam, { pushUrl: false });
  window.addEventListener('popstate', e => {
    const id = e.state?.tape ?? resolveTapeParam(location.search, BAKED_ID) ?? BAKED_ID;
    if (id !== tape.id) switchTape(id, { pushUrl: false });
  });
}

// Register service worker
if (!isEmbed && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Warm the tape's source controllers eagerly so they're ready before the
// first track click — see warmControllers (iOS gesture-context rule).
warmControllers();
