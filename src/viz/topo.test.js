import { describe, it, expect } from 'vitest';
import topo, {
  topoDriftOffsets, peakEnvelope,
  TOPO_DRIFT_PERIODS, TOPO_DRIFT_AMP, TOPO_TILT_GAIN, PEAK_LIFE,
} from './topo.js';

const SEED = 42.7;

describe('topo periods', () => {
  it('drift periods divide 3600', () => {
    expect(TOPO_DRIFT_PERIODS.every(p => 3600 % p === 0)).toBe(true);
  });
});

describe('topoDriftOffsets', () => {
  it('is bounded by the amplitude and periodic per component', () => {
    for (const t of [0, 100, 1000, 3599]) {
      const d = topoDriftOffsets(t, SEED);
      expect(Math.abs(d[0])).toBeLessThanOrEqual(TOPO_DRIFT_AMP + 1e-9);
      expect(Math.abs(d[1])).toBeLessThanOrEqual(TOPO_DRIFT_AMP + 1e-9);
    }
    const a = topoDriftOffsets(17, SEED);
    const b = topoDriftOffsets(17 + TOPO_DRIFT_PERIODS[0], SEED);
    expect(b[0]).toBeCloseTo(a[0], 5);
  });
  it('actually remolds: offsets change over a minute', () => {
    const a = topoDriftOffsets(0, SEED);
    const b = topoDriftOffsets(60, SEED);
    expect(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])).toBeGreaterThan(0.02);
  });
});

describe('peakEnvelope', () => {
  it('is zero at birth and at PEAK_LIFE', () => {
    expect(peakEnvelope(0)).toBe(0);
    expect(peakEnvelope(PEAK_LIFE)).toBe(0);
    expect(peakEnvelope(-1)).toBe(0);
    expect(peakEnvelope(PEAK_LIFE + 1)).toBe(0);
  });
  it('peaks fully grown mid-life', () => {
    expect(peakEnvelope(PEAK_LIFE / 2)).toBe(1);
    expect(peakEnvelope(2)).toBeGreaterThan(0.3);
    expect(peakEnvelope(2)).toBeLessThan(1);
  });
});

describe('topo entry', () => {
  it('frame maps tilt straight through (gain lives in the shader)', () => {
    const state = topo.initState(SEED);
    const ctx = {
      t: 30, dt: 1 / 60, aspect: 1.5, tiltX: 0.4, tiltY: -0.2,
      blooms: new Float32Array(48), paletteData: new Float32Array(27), paletteCount: 5,
    };
    const u = topo.frame(state, ctx);
    expect(u.u_tilt).toEqual([0.4, -0.2]);
    expect(u.u_drift).toBe(state.drift);
    expect(TOPO_TILT_GAIN).toBeLessThan(0.2); // parallax, not displacement
  });
  it('peaks live 12 seconds', () => {
    expect(topo.eventLife).toBe(PEAK_LIFE);
  });
});

describe('topo palette', () => {
  it('keeps slot 0 verbatim, normal and pride', () => {
    expect(topo.buildPalette('#1a4a8a', false)[0]).toBe('#1a4a8a');
    expect(topo.buildPalette('#1a4a8a', true)[0]).toBe('#1a4a8a');
  });
  it('inks stay bg-derived in pride mode (legible map)', () => {
    const normal = topo.buildPalette('#1a4a8a', false);
    const pride = topo.buildPalette('#1a4a8a', true);
    expect(pride[1]).toBe(normal[1]);
    expect(pride[2]).toBe(normal[2]);
    expect(pride).toHaveLength(9);
  });
  it('normal palette: 5 valid hexes', () => {
    const p = topo.buildPalette('#c1440e', false);
    expect(p).toHaveLength(5);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
