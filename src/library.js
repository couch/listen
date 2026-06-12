// Pure logic for the published-tape library: URL params, drawer ordering,
// cassette-spine colors. DOM lives in drawer.js; orchestration in main.js.
import { hexToRgb } from './utils.js';

// The ?tape=<id> param when it names a different tape than the baked-in one;
// null means no switch is needed.
export function resolveTapeParam(search, bakedId) {
  let id = null;
  try { id = new URLSearchParams(search).get('tape'); } catch {}
  return id && id !== bakedId ? id : null;
}

// Drawer display order: the curated published order, with the baked-in active
// tape prepended when it isn't curated — after a hot swap the drawer is the
// only in-app way back to it.
export function drawerEntries(index, activeId) {
  const published = Array.isArray(index?.published) ? [...index.published] : [];
  if (activeId && !published.includes(activeId)) published.unshift(activeId);
  return published;
}

// Deterministic display color for a tape spine. "random" tapes pick a stable
// palette color from the id (same tape, same spine every visit); "pride" is
// a sentinel the CSS renders as a rainbow gradient. FNV-1a — tape ids are
// near-identical timestamp strings, which collide badly under weaker hashes.
export function spineColor(color, id, palette) {
  if (color === 'pride') return 'pride';
  if (!color || color === 'random') {
    let h = 2166136261;
    const s = String(id ?? '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return palette[h % palette.length];
  }
  return color;
}

// Light or dark spine text from the background's relative luminance — the
// 0.179 cut is where contrast against black overtakes contrast against white.
export function spineTextColor(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? 'dark' : 'light';
}

// History URL for a tape: a query param for swapped tapes, the bare path for
// the baked-in default.
export function tapeUrl(id, bakedId, pathname) {
  return id === bakedId ? pathname : `${pathname}?tape=${encodeURIComponent(id)}`;
}
