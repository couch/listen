export const PALETTE = [
  "#a83232","#c1440e","#9c6b1a","#4a7a2e","#2e7a6e",
  "#2e4a7a","#5c2e7a","#7a2e5c","#4a5f6e","#7a6b2e"
];

export function extractId(raw) {
  raw = raw.trim();
  let m;
  if ((m = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/embed\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return null;
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

export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
