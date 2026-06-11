import { describe, it, expect } from 'vitest';
import { VIZ_IDS, VIZ_NAMES, DEFAULT_VIZ_ID, resolveVizId } from './ids.js';
import { getViz, getDefaultViz, preloadAll } from './registry.js';

// Every registry entry, loaded up front (non-default entries are dynamic
// imports in the app; here we just await them all).
const entries = await Promise.all(VIZ_IDS.map(id => getViz(id)));

describe('viz ids', () => {
  it('ids are unique and mesh is the default', () => {
    expect(new Set(VIZ_IDS).size).toBe(VIZ_IDS.length);
    expect(VIZ_IDS).toContain(DEFAULT_VIZ_ID);
    expect(DEFAULT_VIZ_ID).toBe('mesh');
  });
  it('every id has a display name', () => {
    VIZ_IDS.forEach(id => expect(typeof VIZ_NAMES[id]).toBe('string'));
  });
  it('resolveVizId falls back to the default for unknown ids', () => {
    expect(resolveVizId('mesh')).toBe('mesh');
    expect(resolveVizId('wormhole')).toBe(DEFAULT_VIZ_ID);
    expect(resolveVizId(undefined)).toBe(DEFAULT_VIZ_ID);
  });
});

describe('registry', () => {
  it('getDefaultViz is the mesh entry, synchronously', () => {
    expect(getDefaultViz().id).toBe('mesh');
  });
  it('getViz resolves every listed id to its entry', () => {
    entries.forEach((e, i) => expect(e.id).toBe(VIZ_IDS[i]));
  });
  it('getViz caches: repeated calls return the same promise', () => {
    expect(getViz('mesh')).toBe(getViz('mesh'));
  });
  it('getViz falls back to the default for unknown ids', async () => {
    expect((await getViz('wormhole')).id).toBe(DEFAULT_VIZ_ID);
  });
  it('preloadAll does not throw', () => {
    expect(() => preloadAll()).not.toThrow();
  });
});

describe('entry contract', () => {
  for (const entry of entries) {
    describe(entry.id, () => {
      it('has the required fields', () => {
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.frag).toBe('string');
        expect(typeof entry.uniformSpec).toBe('object');
        expect(typeof entry.buildPalette).toBe('function');
        expect(typeof entry.initState).toBe('function');
        expect(typeof entry.frame).toBe('function');
        expect(typeof entry.eventLife).toBe('number');
      });
      it('shader ends with the crossfade-compatible output', () => {
        expect(entry.frag).toMatch(/gl_FragColor\s*=\s*vec4\([^;]*,\s*u_fade\s*\)\s*;/);
      });
      it('uniformSpec covers the common uniforms and only known types', () => {
        for (const key of ['u_time', 'u_seed', 'u_palette', 'u_paletteCount', 'u_blooms']) {
          expect(entry.uniformSpec[key]).toBeDefined();
        }
        // u_resolution and u_fade are owned by viz-gl, never in the spec
        expect(entry.uniformSpec.u_resolution).toBeUndefined();
        expect(entry.uniformSpec.u_fade).toBeUndefined();
        Object.values(entry.uniformSpec).forEach(t => expect(['1f', '2f', '3fv', '4fv']).toContain(t));
      });
      it('buildPalette keeps slot 0 verbatim — normal and pride (invariant 1)', () => {
        expect(entry.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
        expect(entry.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
      });
      it('buildPalette fits the shader palette slots', () => {
        expect(entry.buildPalette('#c1440e', false).length).toBeLessThanOrEqual(9);
        expect(entry.buildPalette('#c1440e', true).length).toBeLessThanOrEqual(9);
      });
      it('frame() returns exactly the uniformSpec keys', () => {
        const state = entry.initState(42.7);
        const ctx = {
          t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 0.2, tiltY: -0.1,
          blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
        };
        const uniforms = entry.frame(state, ctx);
        expect(Object.keys(uniforms).sort()).toEqual(Object.keys(entry.uniformSpec).sort());
      });
    });
  }
});
