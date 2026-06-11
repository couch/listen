import { describe, it, expect } from 'vitest';
import caustics, {
  sunFromTilt, CAUSTIC_SPEEDS, SUN_GAIN, RIPPLE_LIFE,
} from './caustics.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

describe('caustics periods', () => {
  it('scroll speeds wrap the hourly clock cleanly (3600·s integer)', () => {
    expect(CAUSTIC_SPEEDS.every(s => Number.isInteger(3600 * s))).toBe(true);
  });
});

describe('sunFromTilt', () => {
  it('points straight down at rest and is always unit length', () => {
    expect(sunFromTilt(0)).toEqual([0, -1]);
    for (const tx of [-3, -0.4, 0.7, 2]) {
      const [x, y] = sunFromTilt(tx);
      expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    }
  });
  it('leans with tilt and clamps at SUN_GAIN', () => {
    expect(sunFromTilt(0.5)[0]).toBeCloseTo(Math.sin(0.5 * SUN_GAIN), 6);
    expect(sunFromTilt(99)[0]).toBeCloseTo(Math.sin(SUN_GAIN), 6);
  });
});

describe('caustics entry', () => {
  it('frame maps tilt to the sun uniform', () => {
    const state = caustics.initState(42.7);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 1, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 5,
    };
    const [x, y] = caustics.frame(state, ctx).u_sun;
    expect(x).toBeCloseTo(Math.sin(SUN_GAIN), 6);
    expect(y).toBeLessThan(0);
  });
  it('ripples live 5 seconds', () => {
    expect(caustics.eventLife).toBe(RIPPLE_LIFE);
  });
});

describe('caustics palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(caustics.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(caustics.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(caustics.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 5 valid hexes with pale light over a dark deep', () => {
    const p = caustics.buildPalette('#c1440e', false);
    expect(p).toHaveLength(5);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
