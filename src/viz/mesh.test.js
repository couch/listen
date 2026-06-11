import { describe, it, expect } from 'vitest';
import mesh, {
  buildVizPalette, computeSites, SITE_HIGHLIGHT, SITE_DARK,
  FALLOFF_COLOR, FALLOFF_HIGHLIGHT, FALLOFF_DARK,
  SITE_PERIODS, EPI_PERIODS, AMP_PRIMARY, AMP_EPI, TILT_GAIN,
} from './mesh.js';
import { VIZ_PALETTE_SLOTS, PRIDE_COLORS_VIZ } from '../viz-logic.js';
import { hexToHsl } from '../utils.js';

describe('buildVizPalette', () => {
  it('returns 6 valid hex colors', () => {
    const p = buildVizPalette('#c1440e');
    expect(p).toHaveLength(6);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
  it('keeps the input hex verbatim in slot 0 (live-bg continuity)', () => {
    expect(buildVizPalette('#1a4a8a')[0]).toBe('#1a4a8a');
  });
  it('spans a wide luminance range: a near-white and a deep dark', () => {
    const ls = buildVizPalette('#c1440e').map(c => hexToHsl(c)[2]);
    expect(Math.max(...ls)).toBeGreaterThanOrEqual(80);
    expect(Math.min(...ls)).toBeLessThanOrEqual(20);
  });
  it('produces distinct colors for a saturated input', () => {
    const p = buildVizPalette('#c1440e');
    expect(new Set(p).size).toBeGreaterThan(4);
  });
  it('still yields valid colors for black and white inputs', () => {
    for (const input of ['#000000', '#ffffff']) {
      const p = buildVizPalette(input);
      expect(p).toHaveLength(6);
      p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    }
  });
});

describe('mesh entry buildPalette', () => {
  it('keeps slot 0 verbatim in normal and pride mode', () => {
    expect(mesh.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(mesh.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('uses the fixed pride spectrum beyond slot 0 in pride mode', () => {
    expect(mesh.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
});

describe('computeSites', () => {
  const COUNT = 6, ASPECT = 0.5, SEED = 42.7;

  it('fills vec3(x, y, falloff) per site and zero-pads unused slots', () => {
    const s = computeSites(10, SEED, COUNT, ASPECT);
    expect(s).toHaveLength(VIZ_PALETTE_SLOTS * 3);
    for (let i = COUNT * 3; i < s.length; i++) expect(s[i]).toBe(0);
  });
  it('is deterministic for the same inputs', () => {
    expect(computeSites(33, SEED, COUNT, ASPECT)).toEqual(computeSites(33, SEED, COUNT, ASPECT));
  });
  it('assigns role falloffs in a 6-color palette', () => {
    const s = computeSites(0, SEED, COUNT, ASPECT);
    expect(s[SITE_DARK * 3 + 2]).toBe(FALLOFF_DARK);
    expect(s[SITE_HIGHLIGHT * 3 + 2]).toBe(FALLOFF_HIGHLIGHT);
    expect(s[2]).toBe(FALLOFF_COLOR);
  });
  it('uses the uniform color falloff for a 9-color (pride) palette', () => {
    const s = computeSites(0, SEED, 9, ASPECT);
    for (let i = 0; i < 9; i++) expect(s[i * 3 + 2]).toBe(FALLOFF_COLOR);
  });
  it('keeps sites within the orbit envelope around the screen', () => {
    const margin = AMP_PRIMARY + AMP_EPI + TILT_GAIN * 1.1 + 0.01;
    for (const t of [0, 17, 1234]) {
      const s = computeSites(t, SEED, COUNT, ASPECT, 1, -1);
      for (let i = 0; i < COUNT; i++) {
        expect(s[i * 3]).toBeGreaterThan(-margin);
        expect(s[i * 3]).toBeLessThan(ASPECT + margin);
        expect(s[i * 3 + 1]).toBeGreaterThan(-margin);
        expect(s[i * 3 + 1]).toBeLessThan(1 + margin);
      }
    }
  });
  it('moves visibly but ambiently over 2 seconds', () => {
    const a = computeSites(100, SEED, COUNT, ASPECT);
    const b = computeSites(102, SEED, COUNT, ASPECT);
    let total = 0;
    for (let i = 0; i < COUNT; i++) {
      const d = Math.hypot(b[i * 3] - a[i * 3], b[i * 3 + 1] - a[i * 3 + 1]);
      expect(d).toBeLessThan(0.4); // ambient, not frantic
      total += d;
    }
    expect(total).toBeGreaterThan(0.02); // but clearly in motion
  });
  it('is seamless across the hourly shader-clock wrap', () => {
    expect(SITE_PERIODS.every(p => 3600 % p === 0)).toBe(true);
    expect(EPI_PERIODS.every(p => 3600 % p === 0)).toBe(true);
    const a = computeSites(3599.9, SEED, COUNT, ASPECT);
    const b = computeSites(3599.9 - 3600, SEED, COUNT, ASPECT);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
  });
  it('tilt shifts every site in the tilt direction with parallax depth', () => {
    const flat = computeSites(50, SEED, COUNT, ASPECT);
    const tilted = computeSites(50, SEED, COUNT, ASPECT, 1, 0);
    const shifts = [];
    for (let i = 0; i < COUNT; i++) {
      const dx = tilted[i * 3] - flat[i * 3];
      expect(dx).toBeGreaterThan(0);
      expect(tilted[i * 3 + 1]).toBe(flat[i * 3 + 1]); // y untouched by x tilt
      shifts.push(dx);
    }
    expect(new Set(shifts.map(s => s.toFixed(5))).size).toBeGreaterThan(1);
  });
  it('writes into a provided output buffer without allocating', () => {
    const buf = new Float32Array(VIZ_PALETTE_SLOTS * 3);
    expect(computeSites(5, SEED, COUNT, ASPECT, 0, 0, buf)).toBe(buf);
  });
});

describe('mesh frame()', () => {
  it('returns exactly the uniformSpec keys (minus viz-gl-owned ones)', () => {
    const state = mesh.initState(42.7);
    const ctx = {
      t: 10, dt: 1 / 60, aspect: 1.5, tiltX: 0, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
    };
    const uniforms = mesh.frame(state, ctx);
    expect(Object.keys(uniforms).sort()).toEqual(Object.keys(mesh.uniformSpec).sort());
  });
  it('reuses the state sites buffer across frames (no per-frame allocation)', () => {
    const state = mesh.initState(1);
    const ctx = {
      t: 10, dt: 1 / 60, aspect: 1.5, tiltX: 0, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
    };
    expect(mesh.frame(state, ctx).u_sites).toBe(mesh.frame(state, { ...ctx, t: 11 }).u_sites);
  });
});
