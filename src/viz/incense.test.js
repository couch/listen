import { describe, it, expect } from 'vitest';
import incense, {
  ribbonPhases, incenseDraft,
  RIBBON_PERIODS, RIBBON_AMPS, DRAFT_GAIN, EMBER_PULSE,
} from './incense.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;

describe('incense periods', () => {
  it('sway and ember periods divide 3600', () => {
    expect(RIBBON_PERIODS.every(p => 3600 % p === 0)).toBe(true);
    expect(3600 % EMBER_PULSE).toBe(0);
  });
  it('sway amplitude shrinks with each faster component', () => {
    for (let i = 1; i < RIBBON_AMPS.length; i++) {
      expect(RIBBON_AMPS[i]).toBeLessThan(RIBBON_AMPS[i - 1]);
    }
  });
});

describe('ribbonPhases', () => {
  it('is periodic per component', () => {
    const a = ribbonPhases(17, SEED);
    const b = ribbonPhases(17 + RIBBON_PERIODS[0], SEED);
    expect(b[0] - a[0]).toBeCloseTo(Math.PI * 2, 5);
  });
  it('components advance at distinct rates and are seed-offset', () => {
    const a = ribbonPhases(0, SEED);
    const b = ribbonPhases(10, SEED);
    const rates = Array.from(b).map((v, i) => v - a[i]);
    expect(new Set(rates.map(r => r.toFixed(5))).size).toBe(RIBBON_PERIODS.length);
    expect(new Set(Array.from(a).map(v => v.toFixed(5))).size).toBe(RIBBON_PERIODS.length);
  });
});

describe('incenseDraft', () => {
  it('is zero at rest, linear at DRAFT_GAIN, clamped beyond ±1', () => {
    expect(incenseDraft(0)).toBe(0);
    expect(incenseDraft(0.4)).toBeCloseTo(0.4 * DRAFT_GAIN, 6);
    expect(incenseDraft(7)).toBe(DRAFT_GAIN);
    expect(incenseDraft(-7)).toBe(-DRAFT_GAIN);
  });
});

describe('incense frame()', () => {
  it('returns the spec uniforms, reusing the phase buffer', () => {
    const state = incense.initState(SEED);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 0.5, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 5,
    };
    const u = incense.frame(state, ctx);
    expect(u.u_phase).toBe(state.phases);
    expect(u.u_draft).toBeCloseTo(0.25, 6);
  });
});

describe('incense palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(incense.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(incense.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(incense.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 5 valid hexes', () => {
    const p = incense.buildPalette('#c1440e', false);
    expect(p).toHaveLength(5);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
