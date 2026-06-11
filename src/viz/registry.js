// Visualization registry. Mesh ships in the main bundle — it's the default,
// guaranteed-available visualization. Every other visualization is a dynamic
// import (one Vite chunk each) loaded on intent: the saved selection preloads
// when playback starts, revealing the picker preloads everything, and
// selecting an unloaded one awaits its chunk before the crossfade.

import mesh from './mesh.js';
import { VIZ_IDS, DEFAULT_VIZ_ID } from './ids.js';

// One loader per non-default visualization; Vite code-splits each import().
const LOADERS = {
  lava: () => import('./lava.js'),
  rain: () => import('./rain.js'),
  aurora: () => import('./aurora.js'),
};

const cache = new Map([[DEFAULT_VIZ_ID, Promise.resolve(mesh)]]);

// Always-resolved sync access to the default — the fallback for unknown ids,
// failed chunk loads, and failed shader compiles.
export function getDefaultViz() {
  return mesh;
}

export function getViz(id) {
  if (!cache.has(id)) {
    const loader = LOADERS[id];
    if (!loader) return cache.get(DEFAULT_VIZ_ID);
    cache.set(id, loader().then(m => m.default));
  }
  return cache.get(id);
}

export function preloadViz(id) {
  if (LOADERS[id]) getViz(id).catch(() => {});
}

export function preloadAll() {
  for (const id of VIZ_IDS) preloadViz(id);
}
