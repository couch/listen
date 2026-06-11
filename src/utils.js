export const PALETTE = [
  "#a83232","#c1440e","#9c6b1a","#4a7a2e","#2e7a6e",
  "#2e4a7a","#5c2e7a","#7a2e5c","#4a5f6e","#7a6b2e"
];

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

export function buildConfig(playlist) {
  if (!playlist) return "";
  let extra = '';
  if (playlist.id) extra += `\n  id: ${JSON.stringify(playlist.id)},`;
  if (playlist.created) extra += `\n  created: ${JSON.stringify(playlist.created)},`;
  if (playlist.lastEdited) extra += `\n  lastEdited: ${JSON.stringify(playlist.lastEdited)},`;
  if (playlist.viz) extra += `\n  viz: ${JSON.stringify(playlist.viz)},`;
  if (playlist.location) extra += `\n  location: ${JSON.stringify(playlist.location)},`;
  const lines = playlist.tracks
    .map(t => `    { id: ${JSON.stringify(t.id)}, title: ${JSON.stringify(t.title)}, artist: ${JSON.stringify(t.artist)} }`)
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
