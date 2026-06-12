// Audio-source metadata only — no DOM, no SDK imports. Safe for admin.js,
// schema-adjacent code, and tests. The controller implementations live in
// sibling modules (youtube.js, file.js) behind registry.js.

export const SOURCE_IDS = ['youtube', 'file'];
export const DEFAULT_SOURCE_ID = 'youtube';

// Normalized player states shared by every source — main.js's state machine
// switches on these instead of YT.PlayerState integers.
/** @typedef {'unstarted'|'cued'|'buffering'|'playing'|'paused'|'ended'} SourceState */
export const STATE = {
  UNSTARTED: 'unstarted',
  CUED: 'cued',
  BUFFERING: 'buffering',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ENDED: 'ended',
};

// A track's source family; omitted = youtube so every pre-existing playlist
// JSON resolves without migration. Unknown values also fall back to youtube —
// the schema rejects them at save time, but a fetched tape fails soft.
export function sourceOf(track) {
  const s = track?.source;
  return SOURCE_IDS.includes(s) ? s : DEFAULT_SOURCE_ID;
}

// Same logical track across tape objects (a refetched playlist JSON is a new
// object). Family-aware identity: YT tracks compare ids, file tracks compare
// urls — the other field is undefined on both sides, so one expression covers
// every family.
export function sameTrack(a, b) {
  return !!a && !!b && sourceOf(a) === sourceOf(b) && a.id === b.id && a.url === b.url;
}

/**
 * @typedef {Object} SourceCaps
 * @property {boolean} needsTransientPauseGuard  YT fires a spurious PAUSED
 *   inside loadVideoById (mobile); main.js arms trackLoadAt only when true.
 * @property {boolean} hiddenPlayback  false ⇒ the UI must mount a visible
 *   widget (a future Spotify/Apple embed source — their ToS forbid hiding).
 * @property {boolean} fullPlayback  false ⇒ preview-only unless the listener
 *   is logged in (future licensed embeds); the UI would badge the track.
 * @property {boolean} cueable  supports load-without-play (saved-position
 *   restore); false ⇒ restore degrades to track index only.
 */
export const CAPS = {
  youtube: { needsTransientPauseGuard: true, hiddenPlayback: true, fullPlayback: true, cueable: true },
  file: { needsTransientPauseGuard: false, hiddenPlayback: true, fullPlayback: true, cueable: true },
};

/** @returns {SourceCaps} */
export function capsOf(sourceId) {
  return CAPS[sourceId] || CAPS[DEFAULT_SOURCE_ID];
}

// The now-playing attribution line: href to the canonical page, label for
// L.auf(label) — null label means the caller uses the stock L.au string.
export function attributionFor(track) {
  if (sourceOf(track) === 'file') {
    let host = '';
    try { host = new URL(track.url).hostname.replace(/^www\./, ''); } catch {}
    return { href: track.url, label: host };
  }
  return { href: `https://www.youtube.com/watch?v=${track.id}`, label: null };
}

// MediaSession artwork entries, or null to omit the field (file tracks have
// no canonical image; MediaMetadata accepts a missing artwork array).
export function artworkFor(track) {
  if (sourceOf(track) === 'file') return null;
  return [{ src: `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }];
}
