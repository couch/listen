import { describe, it, expect } from 'vitest';
import kaleido, {
  kForIndex, kaleidoPrecession, computeKaleidoSparks,
  KALEIDO_KS, PRECESS_PERIOD, KALEIDO_DECAY, RESEED_DECAY, RESEED_T,
  SPARK_SLOTS, SPARK_ORBIT, SPARK_PERIODS, KALEIDO_TILT_GAIN,
} from './kaleido.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;
const ASPECT = 1.5;

const ctx = (t, over = {}) => ({
  t, dt: 1 / 60, aspect: ASPECT, tiltX: 0, tiltY: 0,
  blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
  ...over,
});

describe('kaleido periods', () => {
  it('precession, spark orbit, and spark cycles wrap the hourly clock', () => {
    expect(3600 % PRECESS_PERIOD).toBe(0);
    expect(3600 % SPARK_ORBIT).toBe(0);
    expect(SPARK_PERIODS.every(p => Number.isInteger(3600 / p))).toBe(true);
  });
});

describe('kForIndex', () => {
  it('always returns an allowed symmetry order, including negatives', () => {
    for (const i of [-2, 0, 1, 5, 117]) {
      expect(KALEIDO_KS).toContain(kForIndex(i));
    }
  });
  it('steps through the orders', () => {
    expect(kForIndex(1)).not.toBe(kForIndex(0));
  });
});

describe('kaleidoPrecession', () => {
  it('rotates a full turn per PRECESS_PERIOD and adds tilt linearly', () => {
    expect(kaleidoPrecession(PRECESS_PERIOD, 0) - kaleidoPrecession(0, 0)).toBeCloseTo(Math.PI * 2, 6);
    expect(kaleidoPrecession(10, 1) - kaleidoPrecession(10, 0)).toBeCloseTo(KALEIDO_TILT_GAIN, 6);
  });
});

describe('computeKaleidoSparks', () => {
  it('is deterministic and fills vec4(dx, dy, size, slot) per slot', () => {
    const a = computeKaleidoSparks(33, SEED, ASPECT, 6, null);
    const b = computeKaleidoSparks(33, SEED, ASPECT, 6, null);
    expect(a).toEqual(b);
    expect(a).toHaveLength(SPARK_SLOTS * 4);
  });
  it('keeps sparks within the mandala radius with sane sizes', () => {
    for (const t of [0, 7.3, 100, 3599]) {
      const d = computeKaleidoSparks(t, SEED, ASPECT, 6, null);
      for (let j = 0; j < SPARK_SLOTS; j++) {
        expect(Math.hypot(d[j * 4], d[j * 4 + 1])).toBeLessThanOrEqual(0.4);
        expect(d[j * 4 + 2]).toBeGreaterThanOrEqual(0);
        expect(d[j * 4 + 2]).toBeLessThan(0.06);
      }
    }
  });
  it('uses palette slots 2-5 normally and 1-8 in pride mode', () => {
    const normal = computeKaleidoSparks(10, SEED, ASPECT, 6, null);
    const pride = computeKaleidoSparks(10, SEED, ASPECT, 9, null);
    for (let j = 0; j < SPARK_SLOTS; j++) {
      expect(normal[j * 4 + 3]).toBeGreaterThanOrEqual(2);
      expect(normal[j * 4 + 3]).toBeLessThanOrEqual(5);
      expect(pride[j * 4 + 3]).toBeGreaterThanOrEqual(1);
      expect(pride[j * 4 + 3]).toBeLessThanOrEqual(8);
    }
  });
  it('a fresh burst takes over the first slots at the event position', () => {
    const burst = { at: 50, x: 0.75, y: 0.5 };
    const d = computeKaleidoSparks(50.1, SEED, ASPECT, 6, burst);
    // middle burst spark sits on the tap's ray
    expect(d[4]).toBeCloseTo((0.75 - 0.5) * ASPECT, 1);
    expect(d[6]).toBeGreaterThan(0.03); // big seed
    const later = computeKaleidoSparks(50 + RESEED_T + 0.1, SEED, ASPECT, 6, burst);
    expect(later[6]).toBeLessThan(0.06); // expired burst → back to schedule
  });
});

describe('kaleido entry', () => {
  it('is the feedback visualization and declares u_prevFrame as a texture', () => {
    expect(kaleido.feedback).toBe(true);
    expect(kaleido.uniformSpec.u_prevFrame).toBe('tex');
  });
  it('tap re-seeds: fast decay for RESEED_T, then back to normal', () => {
    const state = kaleido.initState(SEED);
    expect(kaleido.frame(state, ctx(40)).u_decay).toBe(KALEIDO_DECAY);
    kaleido.tap(state, 0.3, 0.6, 40);
    expect(kaleido.frame(state, ctx(40.1)).u_decay).toBe(RESEED_DECAY);
    expect(kaleido.frame(state, ctx(40 + RESEED_T + 0.01)).u_decay).toBe(KALEIDO_DECAY);
  });
  it('a track change steps the symmetry order', () => {
    const state = kaleido.initState(SEED);
    const k0 = kaleido.frame(state, ctx(40)).u_k;
    kaleido.trackEvent(state, 40);
    expect(kaleido.frame(state, ctx(40)).u_k).not.toBe(k0);
    expect(KALEIDO_KS).toContain(kaleido.frame(state, ctx(40)).u_k);
  });
  it('survives the hourly clock wrap (stale future timestamps dropped)', () => {
    const state = kaleido.initState(SEED);
    kaleido.tap(state, 0.5, 0.5, 3599);
    expect(kaleido.frame(state, ctx(2)).u_decay).toBe(KALEIDO_DECAY);
    expect(state.burst).toBeNull();
  });
});

describe('kaleido palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(kaleido.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(kaleido.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(kaleido.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 6 valid hexes', () => {
    const p = kaleido.buildPalette('#c1440e', false);
    expect(p).toHaveLength(6);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
