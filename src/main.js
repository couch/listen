import './style.css';
import { L, lang, fmtDate } from './strings.js';
import { PALETTE, resolveBg, haversine, fmt, hexToRgb, rgbToHex, smootherstep, dimColor, pickDriftTarget, isTransientPause } from './utils.js';
import { validatePlaylist } from './schema.js';
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
document.getElementById("pi-btn")?.setAttribute("aria-label", L.pi);
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

  info.append(title, artist);
  li.append(progress, num, info);
  li.addEventListener("click", () => onTrackClick(i));
  trackEls.push(li);
  list.appendChild(li);
  });
}
buildTrackList(tape.tracks);

if (!isEmbed) {
  const footer = document.createElement('div');
  footer.id = 'playlist-footer';
  const metaEl = document.createElement('div');
  metaEl.id = 'playlist-meta';
  footer.appendChild(metaEl);
  const piEl = document.getElementById('pi-btn');
  if (piEl) footer.appendChild(piEl);
  list.after(footer);
}

// Player state
let player = null;
let ytApiLoading = false;
let ytApiReady = false;
let pendingTrackIndex = -1;
let currentIndex = -1;
let playing = false;
let ticker = null;
let focusedIndex = -1;
// Track transition in flight: performance.now() of the last load(). The
// transient PAUSED that loadVideoById fires mid-transition (mobile) must not
// count as a real pause; consumed by the first PAUSED, cleared on
// PLAYING/CUED/error.
let trackLoadAt = null;
let lastLoadWasCue = false;

// ── Playback persistence ──
const POS_KEY = 'muxtape-pos';

function savePosition(overrideTime) {
  if (currentIndex < 0) return;
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({
      id: tape.id,
      index: currentIndex,
      time: overrideTime !== undefined ? overrideTime : (player?.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0),
    }));
  } catch {}
}

function getSavedPosition() {
  try {
    const s = JSON.parse(sessionStorage.getItem(POS_KEY) || '');
    if (tape.id && s?.id === tape.id && s.index >= 0 && s.index < tape.tracks.length) return s;
  } catch {}
  return null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    savePosition();
    wakeLock = null; // browser auto-releases it; clear our reference
  } else if (playing) {
    acquireWakeLock();
  }
});

window.addEventListener('pagehide', () => {
  savePosition();
  stopTicker();
  stopColorDrift();
  if (isPride) stopPrideCanvas();
  closeVisualizer();
  releaseWakeLock();
});

function loadYouTubeAPI() {
  if (ytApiLoading || ytApiReady) return;
  ytApiLoading = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = () => {
  ytApiReady = true;
  ytApiLoading = false;
  player = new YT.Player("yt-player", {
    width: "1", height: "1",
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1,
      fs: 0, iv_load_policy: 3, rel: 0,
      modestbranding: 1, playsinline: 1,
    },
    events: {
      onReady(e) {
        e.target.getIframe().setAttribute(
          "allow", "autoplay; encrypted-media; picture-in-picture"
        );
        if (pendingTrackIndex >= 0) {
          const idx = pendingTrackIndex;
          pendingTrackIndex = -1;
          updateBtn();
          load(idx);
        } else {
          const saved = getSavedPosition();
          if (saved) load(saved.index, saved.time, true);
        }
      },
      onStateChange: onState,
      onError: onPlayerError,
    }
  });
};

// YT error codes: 2 invalid id, 5 HTML5 player error, 100 removed/private,
// 101/150 embed-restricted — all fatal for this video, so skip it.
function onPlayerError(e) {
  console.warn('YouTube player error', e?.data);
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
    btn.addEventListener('click', () => { clearBufferingWatchdog(); hideBufferingBanner(); load(currentIndex); });
    el.appendChild(btn);
  } else if (currentIndex + 1 < tape.tracks.length) {
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

function onState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    trackLoadAt = null;
    clearBufferingWatchdog();
    hideBufferingBanner();
    if (document.body.classList.contains('is-offline')) goOnline();
    playing = true;
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
    trackEls[currentIndex]?.classList.remove('paused');
    trackEls[currentIndex]?.classList.add('playing');
  } else if (e.data === YT.PlayerState.PAUSED) {
    // First PAUSED inside a track transition is loadVideoById's transient
    // pause, not the user's — consume the marker so the next pause is real.
    const transientPause = isTransientPause(trackLoadAt, performance.now());
    trackLoadAt = null;
    clearBufferingWatchdog();
    hideBufferingBanner();
    playing = false;
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
    trackEls[currentIndex]?.classList.remove('playing');
    trackEls[currentIndex]?.classList.add('paused');
  } else if (e.data === YT.PlayerState.BUFFERING) {
    clearBufferingWatchdog();
    bufferingWatchdog = setTimeout(() => {
      if (player?.getPlayerState() === YT.PlayerState.BUFFERING) {
        showBufferingBanner(false);
        bufferingEscalation = setTimeout(() => {
          if (player?.getPlayerState() === YT.PlayerState.BUFFERING) {
            showBufferingBanner(true);
          }
        }, 70000);
      }
    }, 4000);
  } else if (e.data === YT.PlayerState.ENDED) {
    clearBufferingWatchdog();
    next();
  } else if (e.data === YT.PlayerState.CUED) {
    trackLoadAt = null; // load() arms the marker on the cue path too
    clearBufferingWatchdog();
    playing = false;
    updateBtn();
    const cur = player.getCurrentTime();
    const dur = player.getDuration();
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
      navigator.mediaSession?.setPositionState?.({ duration: dur, position: cur, playbackRate: 1 });
      const p = trackEls[currentIndex]?.querySelector(".track-progress");
      if (p) { p.style.transition = "none"; p.style.width = pct; }
      requestAnimationFrame(() => {
        scrubFill.style.transition = "";
        if (p) p.style.transition = "";
      });
    }
  }
}

function onTrackClick(i) {
  if (!tape.tracks[i]) return; // empty tape, or an index from a stale handler
  if (!ytApiReady) {
    pendingTrackIndex = i;
    document.getElementById("btn-play").textContent = "·";
    return;
  }
  if (!player || !player.loadVideoById) return;
  if (i === currentIndex) {
    playing ? player.pauseVideo() : player.playVideo();
  } else {
    load(i);
  }
}

function load(i, startSeconds, silent = false) {
  const t = tape.tracks[i];
  if (!t) return; // empty tape, or an index from a stale handler
  if (!silent && !isEmbed) navigator.vibrate?.(30);
  clearActive();
  barEl.classList.add("bar-visible");
  requestAnimationFrame(() => {
    cachedBarH = barEl.offsetHeight;
    document.documentElement.style.setProperty('--bar-h', `${cachedBarH}px`);
  });
  const scrubFill = document.getElementById("scrubber-fill");
  scrubFill.style.transition = "none";
  scrubFill.style.width = "0%";
  requestAnimationFrame(() => { scrubFill.style.transition = ""; });
  const scrub = document.getElementById("scrubber");
  scrub.setAttribute("aria-valuenow", "0");
  scrub.setAttribute("aria-valuetext", "0:00");
  document.getElementById("time").textContent = "";
  currentIndex = i;
  trackLoadAt = performance.now();
  lastLoadWasCue = startSeconds !== undefined;
  updateMediaSession("paused");
  if (isPride) {
    prideColorIdx = (prideStartIdx + i) % PRIDE_COLORS.length;
    stopColorDrift();
    document.documentElement.style.setProperty("--bg", trackPrideColors[i]);
  }
  document.title = `${t.title} — ${t.artist} | ${tape.title}`;
  if (startSeconds !== undefined) {
    player.cueVideoById({ videoId: t.id, startSeconds });
  } else {
    player.loadVideoById(t.id);
  }
  const npTitle = document.getElementById("np-title");
  const npArtist = document.getElementById("np-artist");
  npTitle.querySelector("span").textContent = t.title;
  npArtist.querySelector("span").textContent = t.artist;
  const attr = document.getElementById("attribution");
  attr.href = `https://www.youtube.com/watch?v=${t.id}`;
  attr.style.display = "block";
  const el = trackEls[i];
  el.classList.add("active");
  el.setAttribute("aria-pressed", "true");
  announce(L.np(t.title, t.artist));
  if (isVisualizerOpen()) updateVisualizerTrack(t.title, t.artist);
  scrollTrackIntoView(el);
  startMarquee(npTitle);
  startMarquee(npArtist);
  startMarquee(el.querySelector(".track-title"));
  startMarquee(el.querySelector(".track-artist"));
}

function next() {
  if (currentIndex + 1 < tape.tracks.length) {
    load(currentIndex + 1);
  } else {
    resetPlaybackUI();
    document.title = tape.title;
    try { sessionStorage.removeItem(POS_KEY); } catch {}
    announce(L.pe);
  }
}

// Return all playback UI to the idle state — shared by the end-of-playlist
// branch of next() and the library tape switch (which runs it against the
// outgoing tape's DOM before rebuilding).
function resetPlaybackUI() {
  clearActive();
  playing = false;
  updateBtn();
  stopTicker();
  stopColorDrift();
  clearBufferingWatchdog();
  hideBufferingBanner();
  if (isPride) stopPrideCanvas();
  if (isVisualizerOpen()) closeVisualizer();
  releaseWakeLock();
  navigator.mediaSession?.setPositionState?.({});
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  currentIndex = -1;
  pendingTrackIndex = -1;
  trackLoadAt = null;
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
      if (player) playing ? player.pauseVideo() : player.playVideo();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (currentIndex > 0) load(currentIndex - 1);
    }
    return;
  }
  const n = tape.tracks.length;
  if (!n) return;
  if (e.key === " ") {
    // Let viz-open / viz-exit buttons handle their own Space/click natively
    if (e.target.tagName === "BUTTON" && e.target.id !== "btn-play") return;
    e.preventDefault();
    if (!ytApiReady) {
      if (focusedIndex >= 0) {
        onTrackClick(focusedIndex);
      } else {
        onTrackClick(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }
    if (!player) return;
    if (focusedIndex >= 0) {
      onTrackClick(focusedIndex);
    } else if (currentIndex === -1) {
      load(0);
    } else {
      playing ? player.pauseVideo() : player.playVideo();
    }
  } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    setFocused(focusedIndex < 0 ? (currentIndex >= 0 ? currentIndex : 0) : (focusedIndex + 1) % n);
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    setFocused(focusedIndex < 0 ? (currentIndex >= 0 ? currentIndex : 0) : (focusedIndex - 1 + n) % n);
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
  if (!ytApiReady) {
    const idx = currentIndex >= 0 ? currentIndex : 0;
    onTrackClick(idx);
    return;
  }
  if (!player) return;
  if (currentIndex === -1) { load(0); return; }
  playing ? player.pauseVideo() : player.playVideo();
});

// Scrubber — mouse
document.getElementById("scrubber").addEventListener("click", seek);

// Scrubber — touch
const scrubEl = document.getElementById("scrubber");
let pendingScrubPct = null;
scrubEl.addEventListener("touchstart", e => {
  if (!player || currentIndex === -1) return;
  const touch = e.touches[0];
  const r = scrubEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
  const dur = player.getDuration();
  if (dur) { player.seekTo(pct * dur, true); snapSeek(pct); }
}, { passive: true });
scrubEl.addEventListener("touchmove", e => {
  if (!player || currentIndex === -1) return;
  const touch = e.touches[0];
  const r = scrubEl.getBoundingClientRect();
  pendingScrubPct = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
  snapSeek(pendingScrubPct);
}, { passive: true });
scrubEl.addEventListener("touchend", () => {
  if (pendingScrubPct === null) return;
  const dur = player?.getDuration();
  if (dur) {
    const t = pendingScrubPct * dur;
    player.seekTo(t, true);
    navigator.mediaSession?.setPositionState?.({ duration: dur, position: t, playbackRate: 1 });
  }
  pendingScrubPct = null;
}, { passive: true });

function snapSeek(pct) {
  const w = `${pct * 100}%`;
  // Scrubber fill — bypasses the 500ms ticker delay
  document.getElementById("scrubber-fill").style.width = w;
  // Track progress — disable transition for instant snap, restore for playback
  const p = trackEls[currentIndex]?.querySelector(".track-progress");
  if (p) {
    p.style.transition = "none";
    p.style.width = w;
    requestAnimationFrame(() => { p.style.transition = ""; });
  }
}

function seek(e) {
  if (!player || currentIndex === -1) return;
  const r = scrubEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const dur = player.getDuration();
  if (dur) {
    const t = pct * dur;
    player.seekTo(t, true);
    snapSeek(pct);
    navigator.mediaSession?.setPositionState?.({ duration: dur, position: t, playbackRate: 1 });
  }
}

function startTicker() {
  stopTicker();
  let lastSlowUpdate = 0;
  function tick(now) {
    if (!player || !player.getCurrentTime) return;
    const cur = player.getCurrentTime();
    const dur = player.getDuration();
    if (!dur) { ticker = requestAnimationFrame(tick); return; }
    const ratio = cur / dur;
    const pct = `${ratio * 100}%`;
    document.getElementById("scrubber-fill").style.width = pct;
    document.getElementById("time").textContent = `${fmt(cur)} / ${fmt(dur)}`;
    if (now - lastSlowUpdate >= 500) {
      const first = lastSlowUpdate === 0;
      lastSlowUpdate = now;
      const p = trackEls[currentIndex]?.querySelector(".track-progress");
      if (p) {
        if (first) {
          p.style.transition = "none";
          p.style.width = pct;
          requestAnimationFrame(() => { const q = trackEls[currentIndex]?.querySelector(".track-progress"); if (q) q.style.transition = ""; });
        } else {
          p.style.width = pct;
        }
      }
      const s = document.getElementById("scrubber");
      s.setAttribute("aria-valuenow", Math.round(ratio * 100));
      s.setAttribute("aria-valuetext", L.of(fmt(cur), fmt(dur)));
      navigator.mediaSession?.setPositionState?.({ duration: dur, position: cur, playbackRate: 1 });
      if (now - lastPositionSave >= 30000) { lastPositionSave = now; savePosition(); }
      if (isVisualizerOpen()) updateVisualizer(cur, dur, tape.tracks[currentIndex]?.title, tape.tracks[currentIndex]?.artist);
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
    else if (currentIndex > 0) load(currentIndex - 1);
  },
  isPlaying: () => playing,
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
    getPlayer: () => player,
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

function initPlaylistMeta() {
  if (isEmbed) return;
  const count = tape.tracks?.length ?? 0;
  let meta = L.tr(count);
  const created = tape.created;
  const lastEdited = tape.lastEdited || created;
  if (created) {
    meta += ` · ${L.cr} ${fmtDate(created)}`;
    if (lastEdited && lastEdited !== created) meta += ` · ${L.ed} ${fmtDate(lastEdited)}`;
  }
  const el = document.getElementById('playlist-meta');
  if (el) { el.dataset.base = meta; el.textContent = meta; }
}
initPlaylistMeta();

// Viewer coords are cached so a tape switch can re-derive the distance line
// for the new tape's location without another permission round-trip
let viewerCoords = null;

function applyViewerLocation(lat, lng) {
  if (!tape.location?.lat) return;
  const distKm = haversine(tape.location.lat, tape.location.lng, lat, lng);
  const dist = L.mi ? Math.round(distKm * 0.621371) : Math.round(distKm);
  const el = document.getElementById('playlist-meta');
  if (!el) return;
  const distText = distKm < 24 ? L.nb : L.fa(dist);
  el.textContent = (el.dataset.base || '') + ' · ' + distText;
}

function requestViewerGeo() {
  if (!tape.location?.lat || !navigator.geolocation || geoRequested) return;
  geoRequested = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      viewerCoords = [pos.coords.latitude, pos.coords.longitude];
      applyViewerLocation(...viewerCoords);
    },
    () => {},
    { timeout: 10000, maximumAge: 300000 }
  );
}

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
  if (flickCooldown || !player) return;
  const rate = e.rotationRate?.gamma;
  if (!rate) return;
  if (rate > 250 && currentIndex > 0) {
    flickCooldown = true;
    setTimeout(() => { flickCooldown = false; }, 800);
    load(currentIndex - 1);
  } else if (rate < -250 && currentIndex >= 0 && currentIndex < tape.tracks.length - 1) {
    flickCooldown = true;
    setTimeout(() => { flickCooldown = false; }, 800);
    load(currentIndex + 1);
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

// iOS 13+ gates device orientation behind a user-gesture permission — there
// π doubles as that permission probe and its visibility is decided once at
// startup. Everywhere else π is purely the location opt-in, so its
// visibility depends on the current tape and re-evaluates on tape switch.
const isIOSMotionGate = typeof DeviceOrientationEvent !== 'undefined'
  && typeof DeviceOrientationEvent.requestPermission === 'function';

function updatePiVisibility() {
  if (isEmbed || (isMobile && isIOSMotionGate)) return;
  const piBtnEl = document.getElementById('pi-btn');
  if (piBtnEl) piBtnEl.hidden = !(tape.location?.lat && !geoRequested);
}

if (!isEmbed) {
// π button: opt-in to orientation + device location. embed.html has no π —
// loaded top-level (outside an iframe) isEmbed is false there, so guard.
const piBtnEl = document.getElementById('pi-btn');

if (!piBtnEl) {
  if (isMobile && !isIOSMotionGate) enableMotionListeners();
} else if (isMobile && isIOSMotionGate) {
  // iOS 13+: probe for existing orientation permission
  let resolved = false;
  const earlyCheck = () => {
    if (resolved) return;
    resolved = true;
    window.removeEventListener('deviceorientation', earlyCheck);
    enableMotionListeners();
    // Orientation already granted — probe geo (silent if previously granted)
    requestViewerGeo();
    // π stays hidden
  };
  window.addEventListener('deviceorientation', earlyCheck);
  setTimeout(() => {
    if (resolved) return;
    resolved = true;
    window.removeEventListener('deviceorientation', earlyCheck);
    piBtnEl.hidden = false;
  }, 500);

  piBtnEl.addEventListener('click', async () => {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') enableMotionListeners();
    } catch {
      enableMotionListeners();
    }
    piBtnEl.hidden = true;
    requestViewerGeo();
  });
} else {
  // Android: orientation fires without permission — set up immediately
  if (isMobile) enableMotionListeners();
  piBtnEl.addEventListener('click', () => {
    piBtnEl.hidden = true;
    requestViewerGeo();
  });
  updatePiVisibility();
}

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
  const t = tape.tracks[currentIndex];
  if (!t) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    artwork: [{ src: `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }],
  });
  navigator.mediaSession.playbackState = state;
  navigator.mediaSession.setActionHandler("play", () => player.playVideo());
  navigator.mediaSession.setActionHandler("pause", () => player.pauseVideo());
  navigator.mediaSession.setActionHandler("nexttrack",
    currentIndex + 1 < tape.tracks.length ? () => next() : null
  );
  navigator.mediaSession.setActionHandler("previoustrack",
    currentIndex > 0 ? () => load(currentIndex - 1) : null
  );
  navigator.mediaSession.setActionHandler("seekforward", ({ seekOffset } = {}) => {
    const off = seekOffset || 10;
    const cur = player?.getCurrentTime?.() || 0;
    const dur = player?.getDuration?.() || 0;
    if (!dur) return;
    const t = Math.min(cur + off, dur);
    player.seekTo(t, true);
    navigator.mediaSession?.setPositionState?.({ duration: dur, position: t, playbackRate: 1 });
  });
  navigator.mediaSession.setActionHandler("seekbackward", ({ seekOffset } = {}) => {
    const off = seekOffset || 10;
    const cur = player?.getCurrentTime?.() || 0;
    const dur = player?.getDuration?.() || 0;
    if (!dur) return;
    const t = Math.max(cur - off, 0);
    player.seekTo(t, true);
    navigator.mediaSession?.setPositionState?.({ duration: dur, position: t, playbackRate: 1 });
  });
}

// ── Library tape switching ─────────────────────────────────────────────────
// Hot-swaps the displayed tape in place: ?tape=<id> deep links on load,
// drawer selections, and back/forward via history state. The baked-in tape
// needs no fetch; anything else is fetched and validated, failing soft (the
// current tape stays) on any error.

function applyTape(nextTape) {
  savePosition(); // a same-session return to the outgoing tape restores
  try { player?.stopVideo?.(); } catch {}
  resetPlaybackUI(); // runs against the outgoing tape's DOM — order matters
  stopAmbient();
  document.getElementById('btn-viz')?.setAttribute('hidden', '');

  tape = nextTape;
  computePrideState();

  const newBg = resolveBg(tape.color, PALETTE);
  document.documentElement.style.setProperty('--bg', newBg);
  themeColorMeta.setAttribute('content', newBg);
  setVizBgColor(newBg);
  ensurePrideCanvas();

  buildTrackList(tape.tracks);
  document.title = tape.title;
  document.getElementById('tape-title').textContent = tape.title;
  initPlaylistMeta();
  if (viewerCoords) applyViewerLocation(...viewerCoords);
  updatePiVisibility();

  setVizTape(tape.id, tape.viz, isPride);
  preloadVizSelection();

  // Same-session position for this tape (single sessionStorage slot — only
  // the most recently saved tape restores)
  const saved = getSavedPosition();
  if (saved && player?.cueVideoById) load(saved.index, saved.time, true);

  drawer?.markActive(tape.id);
  window.scrollTo({ top: 0 });
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

// Load YouTube API eagerly so it's ready before the first track click —
// calling loadVideoById from an async callback (onReady) loses the user gesture
// context on iOS, preventing autoplay.
loadYouTubeAPI();
