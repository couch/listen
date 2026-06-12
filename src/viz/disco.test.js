import { describe, it, expect } from 'vitest';
import disco, {
  DISCO_ROT_PERIOD, DISCO_SWAY_PERIOD, GLINT_PERIOD,
  DISCO_SWAY_AMP, DISCO_TILT_GAIN, DISCO_BOB,
  DISCO_BALL_Y, DISCO_FLASH_LIFE,
  discoRot, discoGlintPhase, discoBallPos,
} from './disco.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const TAU = Math.PI * 2;

describe('disco periods', () => {
  it('all divide 3600 (hourly shader clock wrap)', () => {
    for (const p of [DISCO_ROT_PERIOD, DISCO_SWAY_PERIOD, GLINT_PERIOD]) {
      expect(Number.isInteger(3600 / p)).toBe(true);
    }
  });
});

describe('discoRot', () => {
  it('stays in [0, TAU)', () => {
    for (let t = 0; t < 200; t += 7.3) {
      const r = discoRot(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(TAU);
    }
  });
  it('is monotonic within a period', () => {
    expect(discoRot(10)).toBeGreaterThan(discoRot(5));
  });
  it('wraps seamlessly at the hourly clock wrap', () => {
    expect(discoRot(3600)).toBeCloseTo(discoRot(0), 10);
    expect(discoRot(3599.9)).toBeCloseTo(TAU * (1 - 0.1 / DISCO_ROT_PERIOD), 6);
  });
});

describe('discoGlintPhase', () => {
  it('stays in [0, 1) and wraps at 3600', () => {
    for (let t = 0; t < 100; t += 3.7) {
      const g = discoGlintPhase(t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(1);
    }
    expect(discoGlintPhase(3600)).toBeCloseTo(discoGlintPhase(0), 10);
  });
});

describe('discoBallPos', () => {
  it('hangs centered at rest (sway zero-crossing, no tilt)', () => {
    const [x, y] = discoBallPos(0, 1.5, 0, 0);
    expect(x).toBeCloseTo(1.5 / 2, 10);
    expect(y).toBeCloseTo(DISCO_BALL_Y, 10);
  });
  it('stays within sway + tilt bounds for any time and tilt', () => {
    for (let t = 0; t < 60; t += 1.7) {
      for (const tilt of [-3, -1, 0, 0.5, 1, 3]) {
        const [x, y] = discoBallPos(t, 2, tilt, tilt);
        expect(Math.abs(x - 1)).toBeLessThanOrEqual(DISCO_SWAY_AMP + DISCO_TILT_GAIN + 1e-9);
        expect(Math.abs(y - DISCO_BALL_Y)).toBeLessThanOrEqual(DISCO_BOB + 1e-9);
      }
    }
  });
  it('leans monotonically with tiltX and clamps beyond ±1', () => {
    const x = tilt => discoBallPos(0, 2, tilt, 0)[0];
    expect(x(1)).toBeGreaterThan(x(0));
    expect(x(0)).toBeGreaterThan(x(-1));
    expect(x(5)).toBe(x(1));
    expect(x(-5)).toBe(x(-1));
  });
  it('bobs with tiltY by at most DISCO_BOB', () => {
    const y = tilt => discoBallPos(0, 2, 0, tilt)[1];
    expect(Math.abs(y(1) - y(0))).toBeCloseTo(DISCO_BOB, 10);
    expect(y(9)).toBe(y(1));
  });
});

describe('disco palette', () => {
  it('keeps slot 0 verbatim — normal and pride (invariant 1)', () => {
    expect(disco.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(disco.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the spectrum after the bg anchor', () => {
    expect(disco.buildPalette('#c1440e', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette is five valid hex colors', () => {
    const pal = disco.buildPalette('#c1440e', false);
    expect(pal).toHaveLength(5);
    pal.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('disco entry', () => {
  it('maps time and tilt into the rotation/ball uniforms', () => {
    const state = disco.initState(42.7);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 0.5, tiltY: -0.25,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 5,
    };
    const u = disco.frame(state, ctx);
    expect(u.u_rot).toBeCloseTo(TAU * ((30 / DISCO_ROT_PERIOD) % 1), 10);
    expect(u.u_glint).toBeCloseTo((30 / GLINT_PERIOD) % 1, 10);
    expect(u.u_ball).toEqual(discoBallPos(30, 1.5, 0.5, -0.25));
  });
  it('honors the flash life as eventLife', () => {
    expect(disco.eventLife).toBe(DISCO_FLASH_LIFE);
  });
});
