export const PALETTE = [
  "#a83232","#c1440e","#9c6b1a","#4a7a2e","#2e7a6e",
  "#2e4a7a","#5c2e7a","#7a2e5c","#4a5f6e","#7a6b2e"
];

// Resolve a playlist color to a concrete starting hex — "random" and "pride"
// both start from a random palette pick (pride's per-track colors take over
// once playback starts), a hex passes through.
export function resolveBg(color, palette = PALETTE, rng = Math.random) {
  if (!color || color === 'random' || color === 'pride') {
    return palette[Math.floor(rng() * palette.length)];
  }
  return color;
}

// A MediaPositionState WebKit will accept, or null when there's nothing
// valid to report. Safari enforces the dictionary strictly — duration must
// be a finite non-negative number and position must not exceed it — and
// throws TypeError where Chrome forgives, so the clamping lives here.
export function positionState(dur, pos) {
  if (!Number.isFinite(dur) || dur < 0) return null;
  const p = Number.isFinite(pos) ? Math.min(Math.max(pos, 0), dur) : 0;
  return { duration: dur, position: p, playbackRate: 1 };
}

// Session playback positions, one slot per tape: { [tapeId]: { index, time } }.
// Earlier builds stored a single { id, index, time } object — fold it in so a
// mid-session deploy doesn't lose the listening spot.
export function parsePositions(raw) {
  let v;
  try { v = JSON.parse(raw || '{}'); } catch { return {}; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  if (typeof v.id === 'string') return { [v.id]: { index: v.index, time: v.time } };
  return v;
}

// The saved slot for a tape, when it's usable against the current track list.
export function positionFor(map, tapeId, trackCount) {
  const s = tapeId ? map?.[tapeId] : null;
  if (!s || !Number.isInteger(s.index) || s.index < 0 || s.index >= trackCount) return null;
  return { index: s.index, time: Number.isFinite(s.time) ? s.time : 0 };
}

// What a tape switch does to the player bar. The bar is global: a started
// track (playing or paused mid-way) survives the switch.
// - 'reset'  — bar idle (or relink impossible): stop, rebuild, auto-cue the
//   incoming tape's saved spot — the pre-global behavior
// - 'relink' — switching back to the playing tape and its track list still
//   matches: re-couple the rebuilt rows to live playback
// - 'detach' — a different tape while the bar is occupied: playback continues,
//   the track list shows the incoming tape's resume chip instead
export function tapeSwitchAction(occupied, sameId, trackMatches) {
  if (!occupied) return 'reset';
  if (!sameId) return 'detach';
  return trackMatches ? 'relink' : 'reset';
}

export function extractPlaylistId(raw) {
  const m = raw.trim().match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function extractId(raw) {
  raw = raw.trim();
  let m;
  if ((m = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/\/shorts\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/embed\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return null;
}

// What a pasted admin input means: a YouTube video, a YouTube playlist
// import, or a direct audio-file URL. YouTube forms are consumed first, so
// any other http(s) URL is unambiguously a file track (no extension
// allowlist — Audius/Internet Archive stream URLs are extensionless).
export function parseTrackInput(raw) {
  const id = extractId(raw);
  if (id) return { kind: 'youtube', id };
  const listId = extractPlaylistId(raw);
  if (listId) return { kind: 'ytPlaylist', listId };
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return { kind: 'file', url: u.href };
  } catch {}
  return null;
}

export function buildConfig(playlist) {
  if (!playlist) return "";
  let extra = '';
  if (playlist.id) extra += `\n  id: ${JSON.stringify(playlist.id)},`;
  if (playlist.created) extra += `\n  created: ${JSON.stringify(playlist.created)},`;
  if (playlist.lastEdited) extra += `\n  lastEdited: ${JSON.stringify(playlist.lastEdited)},`;
  if (playlist.viz) extra += `\n  viz: ${JSON.stringify(playlist.viz)},`;
  if (playlist.location) extra += `\n  location: ${JSON.stringify(playlist.location)},`;
  const lines = playlist.tracks
    .map(t => {
      // Field order id, source, url — absent fields omitted, so all-YouTube
      // tapes produce byte-identical config.js output to pre-source builds
      let fields = '';
      if (t.id !== undefined) fields += `id: ${JSON.stringify(t.id)}, `;
      if (t.source !== undefined) fields += `source: ${JSON.stringify(t.source)}, `;
      if (t.url !== undefined) fields += `url: ${JSON.stringify(t.url)}, `;
      return `    { ${fields}title: ${JSON.stringify(t.title)}, artist: ${JSON.stringify(t.artist)} }`;
    })
    .join(",\n");
  return `const TAPE = {\n  title: ${JSON.stringify(playlist.title)},\n\n  // A hex color like "#c1440e", "random" to pick each load, or "pride" for rainbow\n  color: ${JSON.stringify(playlist.color)},${extra}\n\n  tracks: [\n${lines},\n  ]\n};\n`;
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const r = d => d * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fuzzyCoord(lat, lng) {
  const dist = Math.sqrt(Math.random()) / 69;
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: +(lat + dist * Math.cos(angle)).toFixed(3),
    lng: +(lng + dist * Math.sin(angle) / Math.cos(lat * Math.PI / 180)).toFixed(3),
  };
}

export function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ── Color utilities ──

export function hexToRgb(hex) {
  const h = hex.trim().replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

export function rgbToHex([r,g,b]) {
  return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (l > 0.5 ? 2 - max - min : max + min);
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function smootherstep(t) { return t*t*t*(t*(t*6-15)+10); }

export function dimColor(hex) {
  const [r,g,b] = hexToRgb(hex);
  const avg = (r+g+b)/3;
  return rgbToHex([
    (r+(avg-r)*0.65)*0.42,
    (g+(avg-g)*0.65)*0.42,
    (b+(avg-b)*0.65)*0.42,
  ]);
}

export function pickDriftTarget(avoidHex) {
  const opts = PALETTE.filter(c => c !== avoidHex);
  return opts[Math.floor(Math.random() * opts.length)];
}

// How long after load() a PAUSED player event may still be the transient
// pause YouTube fires inside loadVideoById (mobile), not a real user pause.
export const TRANSIENT_PAUSE_MAX_MS = 5000;

// True when a PAUSED event arriving at `now` belongs to a track transition
// started at `loadAt` (null = no transition in flight).
export function isTransientPause(loadAt, now, maxAgeMs = TRANSIENT_PAUSE_MAX_MS) {
  return loadAt !== null && now - loadAt < maxAgeMs;
}

// ── Save file list ──

export function buildSaveFiles(currentId, playlists, idx) {
  const files = [
    { path: `playlists/${currentId}.json`, content: JSON.stringify(playlists[currentId], null, 2) },
  ];
  if (idx.active !== currentId && playlists[idx.active]) {
    files.push({ path: `playlists/${idx.active}.json`, content: JSON.stringify(playlists[idx.active], null, 2) });
  }
  files.push({ path: 'playlists/index.json', content: JSON.stringify(idx, null, 2) });
  files.push({ path: 'config.js', content: buildConfig(playlists[idx.active]) });
  return files;
}
