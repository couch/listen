import { describe, it, expect } from 'vitest';
import scope, {
  pickLissajousPair, figureMorph, scopePoints,
  SCOPE_PAIRS, SCOPE_SEGMENTS, FIGURE_HOLD, FIGURE_MORPH, HEAD_PERIOD, SCOPE_TILT_GAIN,
} from './scope.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;
const ASPECT = 1.5;

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

describe('scope periods', () => {
  it('figure hold and head period divide 3600', () => {
    expect(3600 % FIGURE_HOLD).toBe(0);
    expect(3600 % HEAD_PERIOD).toBe(0);
  });
});

describe('pickLissajousPair', () => {
  it('every pair is coprime (closed figures)', () => {
    SCOPE_PAIRS.forEach(([a, b]) => expect(gcd(a, b)).toBe(1));
  });
  it('is deterministic and cycles all six pairs', () => {
    const seen = new Set();
    for (let i = 0; i < 6; i++) seen.add(pickLissajousPair(SEED, i).join(','));
    expect(seen.size).toBe(6);
    expect(pickLissajousPair(SEED, 3)).toBe(pickLissajousPair(SEED, 3));
  });
  it('handles negative indices (hourly wrap continuity)', () => {
    expect(pickLissajousPair(SEED, -1)).toBe(pickLissajousPair(SEED, 5));
  });
});

describe('figureMorph', () => {
  it('is continuous across a figure boundary', () => {
    const before = figureMorph(FIGURE_HOLD - 0.01, SEED);
    const after = figureMorph(FIGURE_HOLD + 0.01, SEED);
    expect(before.mix).toBe(1);
    expect(after.mix).toBeCloseTo(0, 2);
    expect(after.pairA).toBe(before.pairB); // morphs FROM what was showing
  });
  it('completes the morph after FIGURE_MORPH seconds', () => {
    expect(figureMorph(FIGURE_HOLD + FIGURE_MORPH, SEED).mix).toBe(1);
    const mid = figureMorph(FIGURE_HOLD + FIGURE_MORPH / 2, SEED).mix;
    expect(mid).toBeCloseTo(0.5, 5);
  });
  it('a track-change offset advances the figure', () => {
    expect(figureMorph(10, SEED, 1).pairB).toBe(figureMorph(10 + FIGURE_HOLD, SEED, 0).pairB);
  });
});

describe('scopePoints', () => {
  it('returns a closed polyline of SEGMENTS+1 points on screen', () => {
    const pts = scopePoints(100, SEED, ASPECT, 0, 0, 0);
    expect(pts).toHaveLength((SCOPE_SEGMENTS + 1) * 2);
    for (let i = 0; i <= SCOPE_SEGMENTS; i++) {
      expect(pts[i * 2]).toBeGreaterThanOrEqual(0);
      expect(pts[i * 2]).toBeLessThanOrEqual(ASPECT);
      expect(pts[i * 2 + 1]).toBeGreaterThanOrEqual(0);
      expect(pts[i * 2 + 1]).toBeLessThanOrEqual(1);
    }
    // closed: first and last points coincide
    expect(pts[0]).toBeCloseTo(pts[SCOPE_SEGMENTS * 2], 5);
    expect(pts[1]).toBeCloseTo(pts[SCOPE_SEGMENTS * 2 + 1], 5);
  });
  it('tilt skews points by their depth, bounded by the gain', () => {
    const flat = scopePoints(100, SEED, ASPECT, 0, 0, 0);
    const tilted = scopePoints(100, SEED, ASPECT, 1, 0, 0);
    let moved = 0;
    for (let i = 0; i <= SCOPE_SEGMENTS; i++) {
      const dx = Math.abs(tilted[i * 2] - flat[i * 2]);
      expect(dx).toBeLessThanOrEqual(SCOPE_TILT_GAIN + 1e-6);
      if (dx > 0.01) moved++;
    }
    expect(moved).toBeGreaterThan(SCOPE_SEGMENTS / 3); // most of the curve responds
  });
  it('writes into the provided buffer', () => {
    const buf = new Float32Array((SCOPE_SEGMENTS + 1) * 2);
    expect(scopePoints(5, SEED, ASPECT, 0, 0, 0, buf)).toBe(buf);
  });
});

describe('scope entry', () => {
  const ctx = (count = 5) => ({
    t: 40, dt: 1 / 60, aspect: ASPECT, tiltX: 0, tiltY: 0,
    blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: count,
  });
  it('trackEvent advances the figure offset', () => {
    const state = scope.initState(SEED);
    const before = Array.from(scope.frame(state, ctx()).u_curve); // snapshot — frame() reuses the buffer
    scope.trackEvent(state, 40);
    const after = Array.from(scope.frame(state, ctx()).u_curve);
    expect(state.figureOffset).toBe(1);
    expect(after).not.toEqual(before);
  });
  it('beam slot is 0 normally, cycles pride slots 1..8 in pride mode', () => {
    const state = scope.initState(SEED);
    expect(scope.frame(state, ctx(5)).u_beamSlot).toBe(0);
    const slot = scope.frame(state, ctx(9)).u_beamSlot;
    expect(slot).toBeGreaterThanOrEqual(1);
    expect(slot).toBeLessThanOrEqual(8);
  });
});

describe('scope palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(scope.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(scope.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(scope.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 5 valid hexes with a near-black field', () => {
    const p = scope.buildPalette('#c1440e', false);
    expect(p).toHaveLength(5);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
