import { describe, it, expect } from 'vitest';
import aurora, {
  auroraPhases, computeAuroraWind,
  AURORA_LAYERS, AURORA_FLOW, WIND_PERIOD, WIND_AMP, AURORA_TILT_GAIN,
} from './aurora.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;

describe('aurora periods', () => {
  it('flow and wind periods divide 3600', () => {
    expect(AURORA_FLOW.every(p => 3600 % p === 0)).toBe(true);
    expect(3600 % WIND_PERIOD).toBe(0);
  });
});

describe('auroraPhases', () => {
  it('returns one advancing phase per layer, layers distinct', () => {
    const a = auroraPhases(10, SEED);
    const b = auroraPhases(20, SEED);
    expect(a).toHaveLength(AURORA_LAYERS);
    for (let i = 0; i < AURORA_LAYERS; i++) {
      expect(b[i]).toBeGreaterThan(a[i]);
    }
    expect(new Set(Array.from(a).map(v => v.toFixed(5))).size).toBe(AURORA_LAYERS);
  });
  it('advances at different rates per layer (depth variety)', () => {
    const a = auroraPhases(0, SEED);
    const b = auroraPhases(100, SEED);
    const rates = Array.from(b).map((v, i) => v - a[i]);
    expect(new Set(rates.map(r => r.toFixed(5))).size).toBe(AURORA_LAYERS);
  });
});

describe('computeAuroraWind', () => {
  it('sways periodically with WIND_PERIOD', () => {
    expect(computeAuroraWind(17, 0)).toBeCloseTo(computeAuroraWind(17 + WIND_PERIOD, 0), 6);
  });
  it('is bounded by WIND_AMP without tilt', () => {
    for (const t of [0, 10, 23, 45, 59]) {
      expect(Math.abs(computeAuroraWind(t, 0))).toBeLessThanOrEqual(WIND_AMP + 1e-9);
    }
  });
  it('tilt adds linearly at AURORA_TILT_GAIN', () => {
    const base = computeAuroraWind(30, 0);
    expect(computeAuroraWind(30, 1) - base).toBeCloseTo(AURORA_TILT_GAIN, 6);
    expect(computeAuroraWind(30, -0.5) - base).toBeCloseTo(-0.5 * AURORA_TILT_GAIN, 6);
  });
});

describe('aurora frame()', () => {
  it('maps tiltY to the lift uniform', () => {
    const state = aurora.initState(SEED);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 0, tiltY: 0.5,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
    };
    const u = aurora.frame(state, ctx);
    expect(u.u_lift).toBeCloseTo(0.5 * 0.15, 6);
    expect(u.u_phase).toBe(state.phases); // reuses the state buffer
  });
});

describe('aurora palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(aurora.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(aurora.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(aurora.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 6 valid hexes with a dark dusk sky', () => {
    const p = aurora.buildPalette('#c1440e', false);
    expect(p).toHaveLength(6);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
