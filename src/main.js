import './style.css';
import { L, lang, fmtDate } from './strings.js';
import { PALETTE, haversine, fmt } from './utils.js';

const isEmbed = window !== window.top;

if (!isEmbed && location.protocol === 'file:') {
  document.getElementById('file-warning').style.display = 'block';
}

// Progress Pride flag colors in spectral order — every adjacent pair is harmonious,
// and the cycle wraps (pink→brown→red) within the warm family.
const PRIDE_COLORS = [
  "#b33030","#c25a10","#9a7a10","#2a7a30",
  "#1e7a7a","#1a4a8a","#5a2080","#9e2a60","#6b3318"
];
const isPride = TAPE.color === 'pride';
// Random entry point into the spectrum — adjacent tracks always see adjacent hues
const prideStartIdx = isPride ? Math.floor(Math.random() * PRIDE_COLORS.length) : 0;
const trackPrideColors = TAPE.tracks.map((_, i) =>
  PRIDE_COLORS[(prideStartIdx + i) % PRIDE_COLORS.length]
);

const bg = (!TAPE.color || TAPE.color === "random" || isPride)
  ? PALETTE[Math.floor(Math.random() * PALETTE.length)]
  : TAPE.color;
document.documentElement.style.setProperty("--bg", bg);
document.documentElement.lang = lang;

// ── Offline indicator ──
if (!isEmbed) {
  const offlineEl = document.getElementById('offline-indicator');
  offlineEl.textContent = L.offline;
  const updateOnlineStatus = () => { offlineEl.hidden = navigator.onLine; };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
themeColorMeta.setAttribute('content', bg);
document.title = TAPE.title;
document.getElementById("tape-title").textContent = TAPE.title;
document.getElementById("attribution").textContent = L.au;
document.getElementById("tape").setAttribute("aria-label", L.pl);
document.getElementById("bar").setAttribute("aria-label", L.pc);
document.getElementById("scrubber").setAttribute("aria-label", L.pp);
document.getElementById("btn-play").setAttribute("aria-label", L.play);
document.getElementById("pi-btn")?.setAttribute("aria-label", L.pi);

// Build track list
const list = document.getElementById("track-list");
const trackEls = [];
TAPE.tracks.forEach((track, i) => {
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
  title.textContent = track.title;

  const artist = document.createElement("div");
  artist.className = "track-artist";
  artist.textContent = track.artist;

  const progress = document.createElement("div");
  progress.className = "track-progress";
  if (isPride) {
    li.style.backgroundColor = trackPrideColors[i];
    li.dataset.prideColor = trackPrideColors[i];
  }

  info.append(title, artist);
  li.append(progress, num, info);
  li.addEventListener("click", () => onTrackClick(i));
  trackEls.push(li);
  list.appendChild(li);
});

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

// ── Playback persistence ──
const POS_KEY = 'muxtape-pos';

function savePosition(overrideTime) {
  if (currentIndex < 0) return;
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({
      id: TAPE.id,
      index: currentIndex,
      time: overrideTime !== undefined ? overrideTime : (player?.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0),
    }));
  } catch {}
}

function getSavedPosition() {
  try {
    const s = JSON.parse(sessionStorage.getItem(POS_KEY) || '');
    if (TAPE.id && s?.id === TAPE.id && s.index >= 0 && s.index < TAPE.tracks.length) return s;
  } catch {}
  return null;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) savePosition(); });

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
          if (saved) load(saved.index, saved.time);
        }
      },
      onStateChange: onState,
    }
  });
};

function onState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    playing = true;
    updateBtn();
    startTicker();
    updateMediaSession();
    startColorDrift();
  } else if (e.data === YT.PlayerState.PAUSED) {
    playing = false;
    updateBtn();
    stopTicker();
    savePosition();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    stopColorDrift();
  } else if (e.data === YT.PlayerState.ENDED) {
    next();
  } else if (e.data === YT.PlayerState.CUED) {
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

function load(i, startSeconds) {
  clearActive();
  barEl.classList.add("bar-visible");
  requestAnimationFrame(() => { cachedBarH = barEl.offsetHeight; });
  const scrubFill = document.getElementById("scrubber-fill");
  scrubFill.style.transition = "none";
  scrubFill.style.width = "0%";
  requestAnimationFrame(() => { scrubFill.style.transition = ""; });
  const scrub = document.getElementById("scrubber");
  scrub.setAttribute("aria-valuenow", "0");
  scrub.setAttribute("aria-valuetext", "0:00");
  document.getElementById("time").textContent = "";
  currentIndex = i;
  if (isPride) {
    prideColorIdx = (prideStartIdx + i) % PRIDE_COLORS.length;
    stopColorDrift();
    document.documentElement.style.setProperty("--bg", trackPrideColors[i]);
  }
  const t = TAPE.tracks[i];
  if (startSeconds !== undefined) {
    player.cueVideoById({ videoId: t.id, startSeconds });
  } else {
    player.loadVideoById(t.id);
  }
  document.getElementById("np-title").textContent = t.title;
  document.getElementById("np-artist").textContent = t.artist;
  const attr = document.getElementById("attribution");
  attr.href = `https://www.youtube.com/watch?v=${t.id}`;
  attr.style.display = "block";
  const el = trackEls[i];
  el.classList.add("active");
  if (el.dataset.prideColor) {
    el.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.18),rgba(0,0,0,0.18))';
  }
  el.setAttribute("aria-pressed", "true");
  announce(L.np(t.title, t.artist));
  scrollTrackIntoView(el);
}

function next() {
  if (currentIndex + 1 < TAPE.tracks.length) {
    load(currentIndex + 1);
  } else {
    clearActive();
    playing = false;
    updateBtn();
    stopTicker();
    stopColorDrift();
    currentIndex = -1;
    barEl.classList.remove("bar-visible");
    document.getElementById("scrubber-fill").style.width = "0%";
    document.getElementById("np-title").textContent = "";
    document.getElementById("np-artist").textContent = "";
    document.getElementById("time").textContent = "";
    document.getElementById("attribution").style.display = "none";
    const s = document.getElementById("scrubber");
    s.setAttribute("aria-valuenow", "0");
    s.setAttribute("aria-valuetext", "0:00");
    try { sessionStorage.removeItem(POS_KEY); } catch {}
    announce(L.pe);
  }
}

function clearActive() {
  const progEls = [];
  trackEls.forEach(el => {
    el.classList.remove("active", "playing", "paused");
    el.setAttribute("aria-pressed", "false");
    if (el.dataset.prideColor) el.style.backgroundImage = '';
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
    scrollTrackIntoView(el);
  }
}

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const n = TAPE.tracks.length;
  if (e.key === " ") {
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
  if (dur) player.seekTo(pendingScrubPct * dur, true);
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
  if (dur) { player.seekTo(pct * dur, true); snapSeek(pct); }
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
let driftFrame = null, driftFrom, driftTo, driftToHex, driftStart;
let prideColorIdx = 0;

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function rgbToHex([r,g,b]) {
  return "#" + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}

function smootherstep(t) { return t*t*t*(t*(t*6-15)+10); }

function pickDriftTarget(avoidHex) {
  const opts = PALETTE.filter(c => c !== avoidHex);
  return opts[Math.floor(Math.random() * opts.length)];
}

function startColorDrift() {
  if (driftFrame) return;
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
  const rgb = driftFrom.map((v,i) => v + (driftTo[i] - v) * smootherstep(t));
  const hex = rgbToHex(rgb);
  document.documentElement.style.setProperty("--bg", hex);
  themeColorMeta.setAttribute('content', hex);
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
let geoRequested = false;
let cachedBarH = 0;

window.addEventListener('resize', () => {
  if (barEl.classList.contains('bar-visible')) cachedBarH = barEl.offsetHeight;
});

if (!isEmbed) (function initPlaylistMeta() {
  const count = TAPE.tracks?.length ?? 0;
  let meta = L.tr(count);
  const created = TAPE.created;
  const lastEdited = TAPE.lastEdited || created;
  if (created) {
    meta += ` · ${L.cr} ${fmtDate(created)}`;
    if (lastEdited && lastEdited !== created) meta += ` · ${L.ed} ${fmtDate(lastEdited)}`;
  }
  const el = document.getElementById('playlist-meta');
  if (el) { el.dataset.base = meta; el.textContent = meta; }
})();

function applyViewerLocation(lat, lng) {
  if (!TAPE.location?.lat) return;
  const distKm = haversine(TAPE.location.lat, TAPE.location.lng, lat, lng);
  const dist = L.mi ? Math.round(distKm * 0.621371) : Math.round(distKm);
  const el = document.getElementById('playlist-meta');
  if (!el) return;
  const distText = distKm < 24 ? L.nb : L.fa(dist);
  el.textContent = (el.dataset.base || '') + ' · ' + distText;
}

function requestViewerGeo() {
  if (!TAPE.location?.lat || !navigator.geolocation || geoRequested) return;
  geoRequested = true;
  navigator.geolocation.getCurrentPosition(
    pos => applyViewerLocation(pos.coords.latitude, pos.coords.longitude),
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
  } else if (rate < -250 && currentIndex >= 0 && currentIndex < TAPE.tracks.length - 1) {
    flickCooldown = true;
    setTimeout(() => { flickCooldown = false; }, 800);
    load(currentIndex + 1);
  }
}

function enableMotionListeners() {
  window.addEventListener('devicemotion', handleMotion);
}

if (!isEmbed) {
// π button: opt-in to orientation + device location (mobile only)
const piBtnEl = document.getElementById('pi-btn');
const hasPlaylistLoc = !!TAPE.location?.lat;

if (isMobile) {
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
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
    enableMotionListeners();
    if (hasPlaylistLoc) {
      // Show π to request device location
      piBtnEl.hidden = false;
      piBtnEl.addEventListener('click', () => {
        piBtnEl.hidden = true;
        requestViewerGeo();
      });
    }
  }
}

if (!isMobile) {
  if (hasPlaylistLoc) {
    piBtnEl.hidden = false;
    piBtnEl.addEventListener('click', () => {
      piBtnEl.hidden = true;
      requestViewerGeo();
    });
  }
}

// Fade-in for playlist metadata when scrolled into view
const _metaEl = document.getElementById('playlist-meta');
if (_metaEl) {
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { _metaEl.classList.add('visible'); io.disconnect(); }
  }, { threshold: 0 });
  io.observe(_metaEl);
}
} // end !isEmbed

// MediaSession API — lock screen controls on mobile
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = TAPE.tracks[currentIndex];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
  });
  navigator.mediaSession.playbackState = "playing";
  navigator.mediaSession.setActionHandler("play", () => player.playVideo());
  navigator.mediaSession.setActionHandler("pause", () => player.pauseVideo());
  navigator.mediaSession.setActionHandler("nexttrack",
    currentIndex + 1 < TAPE.tracks.length ? () => next() : null
  );
  navigator.mediaSession.setActionHandler("previoustrack",
    currentIndex > 0 ? () => load(currentIndex - 1) : null
  );
}

// Register service worker
if (!isEmbed && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Load YouTube API eagerly so it's ready before the first track click —
// calling loadVideoById from an async callback (onReady) loses the user gesture
// context on iOS, preventing autoplay.
loadYouTubeAPI();
