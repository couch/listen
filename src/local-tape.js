// Dev-only local tape: pure helpers behind the serveLocalTape() Vite plugin
// (vite.config.js). Node-side like sw-build.js — never imported by the app.
// Drop audio files into local-audio/ (gitignored) and open /?tape=local; the
// playlist is generated from the directory listing, so the player exercises
// the real file source against real local files without touching any
// committed playlist.

// The formats the dev tape picks up — the same set the docs recommend for
// hosted files (MP3/M4A/AAC/FLAC/WAV everywhere; Ogg/Opus/WebM lack older-
// Safari support but are fine for local development).
export const LOCAL_AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'webm'];

const MIME = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  webm: 'audio/webm',
};

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isLocalAudioFile(name) {
  return !name.startsWith('.') && LOCAL_AUDIO_EXTS.includes(extOf(name));
}

export function localAudioType(name) {
  return MIME[extOf(name)] || 'application/octet-stream';
}

// Filename → { title, artist }, by convention only (no tag parsing — that
// would need a dependency): strip the extension and any leading track number
// ("01 - ", "01. ", "01_"), then "Artist - Title" splits on the first " - ".
export function trackMetaFromFilename(name) {
  let base = name.replace(/\.[a-z0-9]+$/i, '').replace(/^\d{1,3}[\s._-]+/, '').trim();
  const sep = base.indexOf(' - ');
  if (sep > 0) {
    return { title: base.slice(sep + 3).trim(), artist: base.slice(0, sep).trim() };
  }
  return { title: base || name, artist: '' };
}

// Directory listing → playlist object (passes validatePlaylist: absolute
// http(s) URLs, ≤12 tracks). origin comes from the dev request's Host header
// so the URLs work through tunnels too.
export function buildLocalTape(filenames, origin) {
  const files = filenames
    .filter(isLocalAudioFile)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return {
    title: 'local files',
    color: 'random',
    id: 'local',
    tracks: files.slice(0, 12).map(name => ({
      source: 'file',
      url: `${origin}/local-audio/${encodeURIComponent(name)}`,
      ...trackMetaFromFilename(name),
    })),
  };
}
