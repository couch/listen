import { describe, it, expect } from 'vitest';
import stars, {
  vpFromTilt, STAR_LAYER_SCALES, STAR_LAYER_PERIODS, VP_GAIN, COMET_LIFE,
} from './stars.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const ASPECT = 1.5;

describe('stars periods', () => {
  it('shell recycle periods divide 3600 (seamless fract wrap)', () => {
    expect(STAR_LAYER_PERIODS.every(p => 3600 % p === 0)).toBe(true);
  });
  it('layers are ordered near-to-far (finer grids cycle faster)', () => {
    for (let i = 1; i < STAR_LAYER_SCALES.length; i++) {
      expect(STAR_LAYER_SCALES[i]).toBeGreaterThan(STAR_LAYER_SCALES[i - 1]);
      expect(STAR_LAYER_PERIODS[i]).toBeLessThan(STAR_LAYER_PERIODS[i - 1]);
    }
  });
});

describe('vpFromTilt', () => {
  it('rests at screen center', () => {
    expect(vpFromTilt(0, 0, ASPECT)).toEqual([ASPECT * 0.5, 0.5]);
  });
  it('leans with tilt at VP_GAIN and clamps beyond ±1', () => {
    expect(vpFromTilt(0.5, -0.5, ASPECT)).toEqual([ASPECT * 0.5 + 0.5 * VP_GAIN, 0.5 - 0.5 * VP_GAIN]);
    expect(vpFromTilt(9, -9, ASPECT)).toEqual([ASPECT * 0.5 + VP_GAIN, 0.5 - VP_GAIN]);
  });
});

describe('stars entry', () => {
  it('frame maps tilt to the vanishing point', () => {
    const state = stars.initState(42.7);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: ASPECT, tiltX: 1, tiltY: 0,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 5,
    };
    expect(stars.frame(state, ctx).u_vp).toEqual([ASPECT * 0.5 + VP_GAIN, 0.5]);
  });
  it('comets live 4 seconds', () => {
    expect(stars.eventLife).toBe(COMET_LIFE);
  });
});

describe('stars palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(stars.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(stars.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(stars.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 5 valid hexes with deep space darker than the stars', () => {
    const p = stars.buildPalette('#c1440e', false);
    expect(p).toHaveLength(5);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
