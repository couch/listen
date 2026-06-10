import { describe, it, expect } from 'vitest';
import {
  PRIDE_COLORS_VIZ, VIZ_PALETTE_SLOTS, VIZ_BLOOM_SLOTS,
  buildVizPalette, hexToLinearRgb, paletteToUniform,
  createBloomState, addBloom, resetBlooms, autoBloomDue,
  computeCanvasSize, tapGesture, progressRatio,
} from './viz-logic.js';
import { hexToHsl } from './utils.js';

describe('PRIDE_COLORS_VIZ', () => {
  it('has 9 entries, all valid hex colors', () => {
    expect(PRIDE_COLORS_VIZ).toHaveLength(9);
    PRIDE_COLORS_VIZ.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('buildVizPalette', () => {
  it('returns 7 valid hex colors', () => {
    const p = buildVizPalette('#c1440e');
    expect(p).toHaveLength(7);
    p.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
  it('produces distinct colors for a saturated input', () => {
    const p = buildVizPalette('#c1440e');
    expect(new Set(p).size).toBeGreaterThan(4);
  });
  it('clamps lightness to 30-65 for black input', () => {
    buildVizPalette('#000000').forEach(c => {
      const [, , l] = hexToHsl(c);
      expect(l).toBeGreaterThanOrEqual(29);
      expect(l).toBeLessThanOrEqual(66);
    });
  });
  it('clamps lightness to 30-65 for white input', () => {
    buildVizPalette('#ffffff').forEach(c => {
      const [, , l] = hexToHsl(c);
      expect(l).toBeGreaterThanOrEqual(29);
      expect(l).toBeLessThanOrEqual(66);
    });
  });
});

describe('hexToLinearRgb', () => {
  it('maps white to [1,1,1]', () => {
    hexToLinearRgb('#ffffff').forEach(v => expect(v).toBeCloseTo(1, 5));
  });
  it('maps black to [0,0,0]', () => {
    hexToLinearRgb('#000000').forEach(v => expect(v).toBe(0));
  });
  it('applies the sRGB EOTF to mid grey', () => {
    hexToLinearRgb('#808080').forEach(v => expect(v).toBeCloseTo(0.2158, 3));
  });
  it('handles the linear segment near black', () => {
    // 0x05 / 255 ≈ 0.0196 ≤ 0.04045 → divide by 12.92
    hexToLinearRgb('#050505').forEach(v => expect(v).toBeCloseTo((5 / 255) / 12.92, 6));
  });
});

describe('paletteToUniform', () => {
  it('packs into 9 vec3 slots (27 floats)', () => {
    const { data } = paletteToUniform(buildVizPalette('#c1440e'));
    expect(data).toBeInstanceOf(Float32Array);
    expect(data).toHaveLength(VIZ_PALETTE_SLOTS * 3);
  });
  it('reports count and zero-pads unused slots', () => {
    const { data, count } = paletteToUniform(['#ffffff', '#000000']);
    expect(count).toBe(2);
    expect(data[0]).toBeCloseTo(1, 5);
    for (let i = 6; i < data.length; i++) expect(data[i]).toBe(0);
  });
  it('fills all 9 slots for the pride palette', () => {
    const { count } = paletteToUniform(PRIDE_COLORS_VIZ);
    expect(count).toBe(9);
  });
});

describe('bloom ring buffer', () => {
  it('initializes all slots inactive (t0 = -1)', () => {
    const s = createBloomState();
    expect(s.capacity).toBe(VIZ_BLOOM_SLOTS);
    for (let i = 0; i < s.capacity; i++) expect(s.data[i * 4 + 2]).toBe(-1);
  });
  it('writes vec4(x, y, t0, seed) at the cursor', () => {
    const s = createBloomState();
    addBloom(s, 0.25, 0.75, 12.5, 3);
    expect(Array.from(s.data.slice(0, 4))).toEqual([0.25, 0.75, 12.5, 3]);
    expect(s.cursor).toBe(1);
  });
  it('wraps and overwrites the oldest slot past capacity', () => {
    const s = createBloomState(12);
    for (let i = 0; i < 13; i++) addBloom(s, i / 100, 0, i, 0);
    expect(s.data[0]).toBeCloseTo(0.12, 5); // 13th bloom landed in slot 0
    expect(s.cursor).toBe(1);
  });
  it('resetBlooms deactivates every slot and rewinds the cursor', () => {
    const s = createBloomState();
    for (let i = 0; i < 5; i++) addBloom(s, 0.5, 0.5, i, 0);
    resetBlooms(s);
    expect(s.cursor).toBe(0);
    for (let i = 0; i < s.capacity; i++) expect(s.data[i * 4 + 2]).toBe(-1);
  });
});

describe('progressRatio', () => {
  it('returns the playback fraction', () => expect(progressRatio(45, 180)).toBeCloseTo(0.25, 5));
  it('clamps to 1 past the end', () => expect(progressRatio(200, 180)).toBe(1));
  it('returns 0 for zero duration', () => expect(progressRatio(10, 0)).toBe(0));
  it('returns 0 for unknown duration', () => expect(progressRatio(0, undefined)).toBe(0));
});

describe('autoBloomDue', () => {
  it('is due once the interval has elapsed', () => {
    expect(autoBloomDue(10, 22, 12)).toBe(true);
  });
  it('is not due before the interval', () => {
    expect(autoBloomDue(10, 21.9, 12)).toBe(false);
  });
});

describe('computeCanvasSize', () => {
  it('renders at 0.6× for dpr 1', () => {
    expect(computeCanvasSize(1000, 500, 1)).toEqual({ w: 600, h: 300 });
  });
  it('caps dpr at 2 (0.6× of capped → 1.2×)', () => {
    expect(computeCanvasSize(1000, 500, 3)).toEqual({ w: 1200, h: 600 });
  });
  it('never collapses to zero', () => {
    expect(computeCanvasSize(1, 1, 1)).toEqual({ w: 1, h: 1 });
  });
});

describe('tapGesture', () => {
  it('classifies a downward swipe >80px as close', () => {
    expect(tapGesture(100, 100, 105, 200, 300)).toBe('close');
  });
  it('swipe-down wins even when fast', () => {
    expect(tapGesture(100, 100, 100, 181, 100)).toBe('close');
  });
  it('classifies a quick small-movement tap as bloom', () => {
    expect(tapGesture(100, 100, 104, 103, 120)).toBe('bloom');
  });
  it('tolerates sub-12px jitter', () => {
    expect(tapGesture(100, 100, 107, 107, 200)).toBe('bloom');
  });
  it('ignores a slow press (>500ms)', () => {
    expect(tapGesture(100, 100, 100, 100, 600)).toBeNull();
  });
  it('ignores a horizontal swipe', () => {
    expect(tapGesture(100, 100, 200, 100, 200)).toBeNull();
  });
  it('ignores an upward swipe', () => {
    expect(tapGesture(100, 200, 100, 80, 200)).toBeNull();
  });
});
