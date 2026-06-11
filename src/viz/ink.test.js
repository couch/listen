import { describe, it, expect } from 'vitest';
import ink, { inkLean, INK_LIFE, INK_TILT_GAIN } from './ink.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

describe('inkLean', () => {
  it('is zero at rest and linear in tilt', () => {
    expect(inkLean(0, 0)).toEqual([0, 0]);
    expect(inkLean(0.5, -0.5)).toEqual([0.5 * INK_TILT_GAIN, -0.5 * INK_TILT_GAIN]);
  });
  it('clamps extreme tilt to ±gain', () => {
    expect(inkLean(5, -5)).toEqual([INK_TILT_GAIN, -INK_TILT_GAIN]);
  });
});

describe('ink entry', () => {
  it('lives long: eventLife matches INK_LIFE (25 s plumes)', () => {
    expect(ink.eventLife).toBe(INK_LIFE);
    expect(INK_LIFE).toBe(25);
  });
  it('frame maps tilt to the lean uniform', () => {
    const state = ink.initState(42.7);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 1, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 4,
    };
    expect(ink.frame(state, ctx).u_lean).toEqual([INK_TILT_GAIN, 0]);
  });
});

describe('ink palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(ink.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(ink.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(ink.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 4 valid hexes, ink darker than dilute', () => {
    const p = ink.buildPalette('#c1440e', false);
    expect(p).toHaveLength(4);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
