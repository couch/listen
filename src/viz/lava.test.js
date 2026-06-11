import { describe, it, expect } from 'vitest';
import lava, {
  computeLavaBlobs, lavaHeatBoost, nearestBlob,
  LAVA_BLOBS, LAVA_SATS, LAVA_SLOTS, LAVA_R_BASE,
  LAVA_RISE_PERIODS, LAVA_X_PERIODS, LAVA_R_PERIODS,
  LAVA_HEAT_SWELL, LAVA_SPLIT_R, LAVA_SAT_LIFE, LAVA_TILT_GAIN,
} from './lava.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;
const ASPECT = 1.5;

function blobsAt(t, state, { tiltX = 0, tiltY = 0, count = 4 } = {}) {
  return computeLavaBlobs(t, SEED, ASPECT, tiltX, tiltY, count, state, state.blobs);
}

describe('lava periods', () => {
  it('all divide 3600 (hourly shader-clock wrap)', () => {
    for (const ps of [LAVA_RISE_PERIODS, LAVA_X_PERIODS, LAVA_R_PERIODS]) {
      expect(ps.every(p => 3600 % p === 0)).toBe(true);
    }
  });
});

describe('lavaHeatBoost', () => {
  it('is full immediately after the tap and gone after ~10s', () => {
    expect(lavaHeatBoost(0)).toBe(1);
    expect(lavaHeatBoost(10)).toBeLessThan(0.04);
  });
  it('treats negative age (hour wrap / never heated) as cold', () => {
    expect(lavaHeatBoost(-5)).toBe(0);
  });
});

describe('computeLavaBlobs', () => {
  it('fills vec4(x, y, r, slot) for all slots, deterministically', () => {
    const s1 = lava.initState(SEED);
    const s2 = lava.initState(SEED);
    expect(blobsAt(33, s1)).toEqual(blobsAt(33, s2));
    expect(s1.blobs).toHaveLength(LAVA_SLOTS * 4);
  });
  it('keeps primary blobs on screen with sane radii', () => {
    const state = lava.initState(SEED);
    for (const t of [0, 100, 1234, 3599]) {
      blobsAt(t, state);
      for (let i = 0; i < LAVA_BLOBS; i++) {
        expect(state.blobs[i * 4]).toBeGreaterThan(-0.2);
        expect(state.blobs[i * 4]).toBeLessThan(ASPECT + 0.2);
        expect(state.blobs[i * 4 + 1]).toBeGreaterThan(-0.05);
        expect(state.blobs[i * 4 + 1]).toBeLessThan(1.05);
        expect(state.blobs[i * 4 + 2]).toBeGreaterThan(0.05);
        expect(state.blobs[i * 4 + 2]).toBeLessThan(0.3);
      }
    }
  });
  it('rises and falls: vertical travel over a quarter rise-period', () => {
    const state = lava.initState(SEED);
    blobsAt(0, state);
    const y0 = state.blobs[1];
    blobsAt(LAVA_RISE_PERIODS[0] / 4, state);
    expect(Math.abs(state.blobs[1] - y0)).toBeGreaterThan(0.1);
  });
  it('is seamless across the hourly wrap', () => {
    const state = lava.initState(SEED);
    const a = Array.from(blobsAt(3599.9, state));
    const b = Array.from(blobsAt(-0.1, state));
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
  });
  it('tilt sloshes every blob toward gravity with parallax depth', () => {
    const flat = lava.initState(SEED);
    const tilted = lava.initState(SEED);
    blobsAt(50, flat);
    blobsAt(50, tilted, { tiltX: 1 });
    const shifts = [];
    for (let i = 0; i < LAVA_BLOBS; i++) {
      const dx = tilted.blobs[i * 4] - flat.blobs[i * 4];
      expect(dx).toBeGreaterThan(0.1);
      expect(dx).toBeLessThanOrEqual(LAVA_TILT_GAIN * 1.2 + 1e-6);
      shifts.push(dx);
    }
    expect(new Set(shifts.map(v => v.toFixed(5))).size).toBeGreaterThan(1);
  });
  it('heat swells the blob and lifts it', () => {
    const cold = lava.initState(SEED);
    const hot = lava.initState(SEED);
    hot.heat[2] = 49; // heated 1s ago
    blobsAt(50, cold);
    blobsAt(50, hot);
    expect(hot.blobs[2 * 4 + 2]).toBeGreaterThan(cold.blobs[2 * 4 + 2] * 1.1);
    expect(hot.blobs[2 * 4 + 1]).toBeGreaterThan(cold.blobs[2 * 4 + 1]);
  });
  it('uses wax slots 2/3 normally and cycles pride slots 1..8 in pride mode', () => {
    const state = lava.initState(SEED);
    blobsAt(10, state, { count: 4 });
    for (let i = 0; i < LAVA_BLOBS; i++) expect([2, 3]).toContain(state.blobs[i * 4 + 3]);
    blobsAt(10, state, { count: 9 });
    for (let i = 0; i < LAVA_BLOBS; i++) {
      expect(state.blobs[i * 4 + 3]).toBeGreaterThanOrEqual(1);
      expect(state.blobs[i * 4 + 3]).toBeLessThanOrEqual(8);
    }
  });
});

describe('nearestBlob', () => {
  const blobs = new Float32Array(LAVA_SLOTS * 4);
  blobs.set([0.3, 0.5, 0.15, 2], 0);
  blobs.set([1.0, 0.5, 0.15, 3], 4);
  it('picks the blob under the point', () => {
    expect(nearestBlob(blobs, 0.32, 0.52)).toBe(0);
    expect(nearestBlob(blobs, 1.0, 0.45)).toBe(1);
  });
  it('returns -1 when nothing is within reach', () => {
    expect(nearestBlob(blobs, 0.65, 0.95)).toBe(-1);
  });
});

describe('tap / split / trackEvent', () => {
  it('tap heats the nearest blob', () => {
    const state = lava.initState(SEED);
    blobsAt(50, state);
    const x = state.blobs[0] / ASPECT;
    const y = state.blobs[1];
    lava.tap(state, x, y, 50);
    expect(state.heat[0]).toBe(50);
  });
  it('tap on a big blob splits a satellite instead of heating', () => {
    const state = lava.initState(SEED);
    blobsAt(50, state);
    state.blobs[2] = LAVA_SPLIT_R + 0.03; // force it big
    lava.tap(state, state.blobs[0] / ASPECT, state.blobs[1], 50);
    expect(state.sats[0].born).toBe(50);
    expect(state.heat[0]).toBe(-1e9); // not heated
  });
  it('satellite grows, rises, and dies after LAVA_SAT_LIFE', () => {
    const state = lava.initState(SEED);
    state.sats[0] = { born: 50, x: 0.7, y: 0.4, slot: 3 };
    blobsAt(51, state);
    const o = LAVA_BLOBS * 4;
    expect(state.blobs[o + 2]).toBeGreaterThan(0.05);
    const y1 = state.blobs[o + 1];
    blobsAt(54, state);
    expect(state.blobs[o + 1]).toBeGreaterThan(y1); // rising
    blobsAt(50 + LAVA_SAT_LIFE + 0.1, state);
    expect(state.blobs[o + 2]).toBe(0); // gone
  });
  it('a track change stokes the biggest blob', () => {
    const state = lava.initState(SEED);
    blobsAt(50, state);
    let big = 0;
    for (let i = 1; i < LAVA_BLOBS; i++) {
      if (state.blobs[i * 4 + 2] > state.blobs[big * 4 + 2]) big = i;
    }
    lava.trackEvent(state, 50);
    expect(state.heat[big]).toBe(50);
  });
});

describe('lava palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(lava.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(lava.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(lava.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 4 valid hexes with wax brighter than the shade', () => {
    const p = lava.buildPalette('#c1440e', false);
    expect(p).toHaveLength(4);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
