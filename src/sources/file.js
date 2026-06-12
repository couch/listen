import { STATE } from './ids.js';

// Media-event → state decisions, extracted pure for tests (null = ignore):
// - 'pause' while ended is the browser's pause-before-ended; suppress it so
//   ENDED drives next() exactly once
// - 'waiting'/'stalled' while paused are seek/idle noise, not buffering
//   (Safari fires waiting on paused seeks; stalled fires spuriously)
export function mapMediaEvent(type, { paused, ended }) {
  switch (type) {
    case 'playing': return STATE.PLAYING;
    case 'pause': return ended ? null : STATE.PAUSED;
    case 'ended': return STATE.ENDED;
    case 'waiting':
    case 'stalled': return paused ? null : STATE.BUFFERING;
    default: return null;
  }
}

// Live/Icecast streams report Infinity — cur/Infinity would paint NaN in
// the ticker, so unknown and non-finite durations both normalize to 0.
export function normalizeDuration(d) {
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Direct-stream source: one hidden in-document <audio> plays any http(s)
 * audio URL (track shape { source: 'file', url }). load() runs synchronously
 * inside the click gesture — never await before play(), or iOS blocks it.
 *
 * @param {{ onReady: () => void,
 *           onState: (state: string) => void,
 *           onError: (kind: 'unplayable'|'blocked') => void }} callbacks
 */
export function createFileSource({ onReady, onState, onError }) {
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.hidden = true;
  document.body.appendChild(audio);

  // startSeconds awaiting loadedmetadata (currentTime can't be set before
  // metadata); cueRequested distinguishes a cue (emit CUED once seeked) from
  // a play-from-offset (already playing — a CUED would flip the UI to paused)
  let seekPending = null;
  let cueRequested = false;
  // A dead resource fails twice — the 'error' event and the play() promise
  // rejection — but must report 'unplayable' once, or one dead track skips
  // two. gen staleness also drops rejections from a superseded load().
  let gen = 0;
  let fatalReported = false;

  const emit = type => {
    const s = mapMediaEvent(type, { paused: audio.paused, ended: audio.ended });
    if (s) onState(s);
  };
  ['playing', 'pause', 'ended', 'waiting', 'stalled'].forEach(t =>
    audio.addEventListener(t, () => emit(t)));
  // Buffering resolved without a fresh 'playing' (e.g. a mid-play seek) —
  // clears the watchdog through the ordinary PLAYING branch
  audio.addEventListener('canplay', () => { if (!audio.paused) onState(STATE.PLAYING); });
  audio.addEventListener('loadedmetadata', () => {
    if (seekPending === null) return;
    try { audio.currentTime = seekPending; } catch {}
    seekPending = null;
    if (cueRequested) onState(STATE.CUED); // paints the restored scrubber, same as YT's cue path
  });
  function reportFatal() {
    if (fatalReported) return;
    fatalReported = true;
    onError('unplayable');
  }

  audio.addEventListener('error', () => {
    // stop() empties src, which some browsers report as an error — not fatal
    if (!audio.getAttribute('src')) return;
    console.warn('audio error', audio.error?.code, audio.currentSrc);
    reportFatal();
  });

  function tryPlay() {
    const g = gen;
    const p = audio.play();
    p?.catch?.(err => {
      if (g !== gen) return; // a newer load() superseded this play
      // NotAllowedError = autoplay denied (show paused, never skip);
      // AbortError = interrupted by a new load — already handled
      if (err?.name === 'AbortError') return;
      if (err?.name === 'NotAllowedError') onError('blocked');
      else reportFatal();
    });
  }

  // Ready immediately — the microtask keeps the onReady wiring uniform with
  // sources that become ready asynchronously
  queueMicrotask(onReady);

  return {
    isReady: () => true,
    load(track, { startSeconds, cue } = {}) {
      gen++;
      fatalReported = false;
      seekPending = cue ? (startSeconds ?? 0) : (startSeconds ?? null);
      cueRequested = !!cue;
      audio.src = track.url;
      // Synchronous play inside the gesture (iOS rule); the seek lands on
      // loadedmetadata, so a slow host may play a beat from 0:00 first
      if (!cue) tryPlay();
    },
    play: () => tryPlay(),
    pause: () => audio.pause(),
    stop() {
      seekPending = null;
      cueRequested = false;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch {} // release the network connection
    },
    seekTo(s) {
      const d = normalizeDuration(audio.duration);
      try { audio.currentTime = d ? Math.min(s, d) : s; } catch {}
    },
    getCurrentTime: () => audio.currentTime || 0,
    getDuration: () => normalizeDuration(audio.duration),
    getState() {
      if (!audio.getAttribute('src')) return STATE.UNSTARTED;
      if (audio.ended) return STATE.ENDED;
      // Playing but starved = buffering (the watchdog's re-check)
      if (!audio.paused) return audio.readyState < 3 ? STATE.BUFFERING : STATE.PLAYING;
      return STATE.PAUSED;
    },
  };
}
