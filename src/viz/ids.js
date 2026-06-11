// Visualization metadata only — no shader code, no GL. Safe to import from
// admin.js (picker chips) and main.js without pulling any visualization
// chunk into the bundle. Names are stylistic titles and stay untranslated,
// like track titles; only the picker's group label is localized.

export const VIZ_IDS = ['mesh', 'lava', 'rain', 'aurora'];

export const VIZ_NAMES = {
  mesh: 'Mesh',
  lava: 'Lava',
  rain: 'Rain',
  aurora: 'Aurora',
};

export const DEFAULT_VIZ_ID = 'mesh';

export function resolveVizId(id) {
  return VIZ_IDS.includes(id) ? id : DEFAULT_VIZ_ID;
}
