function err(msg) { throw new TypeError(msg); }

export function validateTrack(obj) {
  if (typeof obj !== 'object' || obj === null) err('track must be an object');
  // source omitted = youtube, so every pre-source playlist stays valid
  const source = obj.source === undefined ? 'youtube' : obj.source;
  if (source === 'youtube') {
    if (typeof obj.id !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(obj.id)) err('track.id must be an 11-char YouTube ID');
  } else if (source === 'file') {
    if (typeof obj.url !== 'string') err('track.url must be a string');
    let u;
    try { u = new URL(obj.url); } catch { err('track.url must be a valid URL'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') err('track.url must be an http(s) URL');
  } else {
    err('track.source must be "youtube" or "file"');
  }
  if (typeof obj.title !== 'string') err('track.title must be a string');
  if (typeof obj.artist !== 'string') err('track.artist must be a string');
}

export function validatePlaylist(obj) {
  if (typeof obj !== 'object' || obj === null) err('playlist must be an object');
  if (typeof obj.title !== 'string') err('playlist.title must be a string');
  if (typeof obj.color !== 'string') err('playlist.color must be a string');
  if (!Array.isArray(obj.tracks)) err('playlist.tracks must be an array');
  if (obj.tracks.length > 12) err('playlist may not have more than 12 tracks');
  obj.tracks.forEach((t, i) => {
    try { validateTrack(t); } catch (e) { err(`track[${i}]: ${e.message}`); }
  });
  if (obj.created !== undefined && typeof obj.created !== 'string') err('playlist.created must be a string');
  if (obj.lastEdited !== undefined && typeof obj.lastEdited !== 'string') err('playlist.lastEdited must be a string');
  // Shape-only: unknown visualization ids fall back to the default at runtime
  if (obj.viz !== undefined && typeof obj.viz !== 'string') err('playlist.viz must be a string');
  if (obj.location !== undefined) {
    const loc = obj.location;
    if (typeof loc !== 'object' || loc === null) err('playlist.location must be an object');
    if (typeof loc.lat !== 'number') err('playlist.location.lat must be a number');
    if (typeof loc.lng !== 'number') err('playlist.location.lng must be a number');
  }
}

export function validateIndex(obj) {
  if (typeof obj !== 'object' || obj === null) err('index must be an object');
  if (typeof obj.active !== 'string') err('index.active must be a string');
  if (!Array.isArray(obj.ids)) err('index.ids must be an array');
  obj.ids.forEach((id, i) => {
    if (typeof id !== 'string') err(`index.ids[${i}] must be a string`);
  });
  // Editorial curation only — every playlist JSON is publicly fetchable regardless
  if (obj.published !== undefined) {
    if (!Array.isArray(obj.published)) err('index.published must be an array');
    obj.published.forEach((id, i) => {
      if (typeof id !== 'string') err(`index.published[${i}] must be a string`);
      if (!obj.ids.includes(id)) err(`index.published[${i}] is not in index.ids`);
    });
  }
}
