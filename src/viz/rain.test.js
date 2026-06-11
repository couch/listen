import { describe, it, expect } from 'vitest';
import rain, {
  computeBokehLights, gravityFromTilt, rainRate, stepRainPhases,
  BOKEH_COUNT, BOKEH_PERIODS, RAIN_LAYER_SCALES, RAIN_SPEEDS,
  RAIN_GRAV_GAIN, RAIN_RATE_GAIN,
} from './rain.js';
import { PRIDE_COLORS_VIZ } from '../viz-logic.js';

const SEED = 42.7;
const ASPECT = 1.5;

describe('rain periods', () => {
  it('bokeh periods divide 3600', () => {
    expect(BOKEH_PERIODS.every(p => 3600 % p === 0)).toBe(true);
  });
  it('fall speeds wrap cleanly at the hourly clock (3600·s integer)', () => {
    expect(RAIN_SPEEDS.every(s => Number.isInteger(3600 * s))).toBe(true);
  });
});

describe('computeBokehLights', () => {
  it('fills vec4(x, y, r, slot) for all lights, deterministically', () => {
    const a = computeBokehLights(33, SEED, ASPECT, 6);
    const b = computeBokehLights(33, SEED, ASPECT, 6);
    expect(a).toEqual(b);
    expect(a).toHaveLength(BOKEH_COUNT * 4);
  });
  it('keeps lights on screen with sane radii', () => {
    for (const t of [0, 500, 3599]) {
      const d = computeBokehLights(t, SEED, ASPECT, 6);
      for (let i = 0; i < BOKEH_COUNT; i++) {
        expect(d[i * 4]).toBeGreaterThanOrEqual(0);
        expect(d[i * 4]).toBeLessThanOrEqual(ASPECT);
        expect(d[i * 4 + 1]).toBeGreaterThanOrEqual(0);
        expect(d[i * 4 + 1]).toBeLessThanOrEqual(1);
        expect(d[i * 4 + 2]).toBeGreaterThan(0.05);
        expect(d[i * 4 + 2]).toBeLessThan(0.25);
      }
    }
  });
  it('is seamless across the hourly wrap', () => {
    const a = Array.from(computeBokehLights(3599.9, SEED, ASPECT, 6));
    const b = Array.from(computeBokehLights(-0.1, SEED, ASPECT, 6));
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
  });
  it('drifts slowly: visible but bounded travel over 2 seconds', () => {
    const a = computeBokehLights(100, SEED, ASPECT, 6);
    const b = computeBokehLights(102, SEED, ASPECT, 6);
    let total = 0;
    for (let i = 0; i < BOKEH_COUNT; i++) {
      const d = Math.hypot(b[i * 4] - a[i * 4], b[i * 4 + 1] - a[i * 4 + 1]);
      expect(d).toBeLessThan(0.2);
      total += d;
    }
    expect(total).toBeGreaterThan(0.005);
  });
  it('uses bokeh slots 2-4 normally and pride slots 1..8 in pride mode', () => {
    const normal = computeBokehLights(10, SEED, ASPECT, 6);
    for (let i = 0; i < BOKEH_COUNT; i++) expect([2, 3, 4]).toContain(normal[i * 4 + 3]);
    const pride = computeBokehLights(10, SEED, ASPECT, 9);
    for (let i = 0; i < BOKEH_COUNT; i++) {
      expect(pride[i * 4 + 3]).toBeGreaterThanOrEqual(1);
      expect(pride[i * 4 + 3]).toBeLessThanOrEqual(8);
    }
  });
});

describe('gravityFromTilt', () => {
  it('points straight down at rest and is always unit length', () => {
    expect(gravityFromTilt(0)).toEqual([0, -1]);
    for (const tx of [-2, -0.5, 0.3, 1, 5]) {
      const [x, y] = gravityFromTilt(tx);
      expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    }
  });
  it('leans with the tilt and clamps at the gain', () => {
    const [x] = gravityFromTilt(0.5);
    expect(x).toBeCloseTo(Math.sin(0.5 * RAIN_GRAV_GAIN), 6);
    expect(gravityFromTilt(50)[0]).toBeCloseTo(Math.sin(RAIN_GRAV_GAIN), 6);
  });
});

describe('rainRate', () => {
  it('is 1 at rest and grows with forward lean, clamped', () => {
    expect(rainRate(0)).toBe(1);
    expect(rainRate(0.5)).toBeCloseTo(1 + RAIN_RATE_GAIN * 0.5, 6);
    expect(rainRate(-3)).toBe(1 + RAIN_RATE_GAIN);
  });
});

describe('stepRainPhases', () => {
  it('advances each layer by dt·speed·rate, wrapped to [0,1)', () => {
    const phases = new Float32Array([0.9, 0.5, 0.99]);
    stepRainPhases(phases, 0.1, 1);
    expect(phases[0]).toBeCloseTo((0.9 + 0.1 * RAIN_SPEEDS[0]) % 1, 5);
    expect(phases[1]).toBeCloseTo(0.5 + 0.1 * RAIN_SPEEDS[1], 5);
    expect(phases[2]).toBeLessThan(1);
  });
  it('clamps a resume-from-hidden dt spike', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    stepRainPhases(a, 30, 1);   // huge frame gap
    stepRainPhases(b, 0.1, 1);  // the clamp value
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('rain frame()', () => {
  const ctx = (t, dt = 1 / 60) => ({
    t, dt, aspect: ASPECT, tiltX: 0, tiltY: 0,
    blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 6,
  });
  it('seeds phases from the first frame time, then integrates', () => {
    const state = rain.initState(SEED);
    rain.frame(state, ctx(40));
    expect(state.phases[0]).toBeCloseTo((40 * RAIN_SPEEDS[0]) % 1, 5);
    const p0 = state.phases[0];
    rain.frame(state, ctx(40.016));
    expect(state.phases[0]).toBeGreaterThan(p0);
  });
});

describe('rain palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(rain.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(rain.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('pride palette carries the fixed spectrum beyond slot 0', () => {
    expect(rain.buildPalette('#1a4a8a', true).slice(1)).toEqual(PRIDE_COLORS_VIZ.slice(1));
  });
  it('normal palette: 6 valid hexes', () => {
    const p = rain.buildPalette('#c1440e', false);
    expect(p).toHaveLength(6);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
