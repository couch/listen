// Visualization metadata only — no shader code, no GL. Safe to import from
// admin.js (picker chips) and main.js without pulling any visualization
// chunk into the bundle. Names are stylistic titles and stay untranslated,
// like track titles; only the picker's group label is localized.

export const VIZ_IDS = ['mesh', 'rain', 'aurora', 'ink', 'incense', 'scope', 'stars', 'topo', 'caustics', 'kaleido'];

// Archived ids — modules kept in src/viz/ but unregistered (no loader, not
// bundled). Never reuse an archived id: stored references (playlist `viz`,
// localStorage overrides) resolve to the default at runtime.
// - 'lava' (Lava lamp, archived 2026-06)

export const VIZ_NAMES = {
  mesh: 'Bloom',
  rain: 'Rain',
  aurora: 'Aurora',
  ink: 'Ink',
  incense: 'Incense',
  scope: 'Scope',
  stars: 'Stars',
  topo: 'Topo',
  caustics: 'Caustics',
  kaleido: 'Kaleido',
};

export const DEFAULT_VIZ_ID = 'mesh';

export function resolveVizId(id) {
  return VIZ_IDS.includes(id) ? id : DEFAULT_VIZ_ID;
}
