import { describe, it, expect } from 'vitest';
import {
  PRIDE_COLORS_VIZ, VIZ_PALETTE_SLOTS, VIZ_BLOOM_SLOTS,
  hexToLinearRgb, paletteToUniform,
  createBloomState, addBloom, resetBlooms, autoBloomDue,
  computeCanvasSize, tapGesture, progressRatio,
  createTiltState, setTiltInput, stepTilt, normalizeTilt,
  skipGesture, SKIP_MIN_DX, SKIP_MAX_DY, SKIP_MAX_MS,
  crossfadeAlpha, VIZ_FADE_MS, resolveVizSelection,
  updateDue, VIZ_FRAME_MS, reopenDue, VIZ_REOPEN_MAX_MS,
} from './viz-logic.js';

describe('PRIDE_COLORS_VIZ', () => {
  it('has 9 entries, all valid hex colors', () => {
    expect(PRIDE_COLORS_VIZ).toHaveLength(9);
    PRIDE_COLORS_VIZ.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('tilt spring', () => {
  const run = (state, seconds, fps = 60) => {
    for (let i = 0; i < seconds * fps; i++) stepTilt(state, 1 / fps);
    return state;
  };

  it('stays at rest with no input', () => {
    const s = run(createTiltState(), 2);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });
  it('responds strongly to a fresh tilt within a second', () => {
    const s = createTiltState();
    setTiltInput(s, 1, 0);
    run(s, 1);
    expect(Math.abs(s.x)).toBeGreaterThan(0.3);
  });
  it('overshoots like a heavy gel (velocity reverses)', () => {
    const s = createTiltState();
    setTiltInput(s, 1, 0);
    let sawPositive = false, reversed = false;
    for (let i = 0; i < 300; i++) {
      stepTilt(s, 1 / 60);
      if (s.vx > 0.01) sawPositive = true;
      if (sawPositive && s.vx < -0.01) reversed = true;
    }
    expect(reversed).toBe(true);
  });
  it('hands back to autonomous drift when the device stabilizes', () => {
    const s = createTiltState();
    setTiltInput(s, 1, 0.5);
    run(s, 12); // input held constant — baseline absorbs it
    expect(Math.abs(s.x)).toBeLessThan(0.06);
    expect(Math.abs(s.y)).toBeLessThan(0.06);
  });
  it('stays bounded under a stalled-frame dt', () => {
    const s = createTiltState();
    setTiltInput(s, 1, 1);
    for (let i = 0; i < 100; i++) stepTilt(s, 0.5);
    expect(Math.abs(s.x)).toBeLessThan(1.5);
    expect(Math.abs(s.vx)).toBeLessThan(10);
  });
});

describe('normalizeTilt', () => {
  it('normalizes ±45° to ±1 and clamps beyond', () => {
    const [x] = normalizeTilt(0, 45, 0);
    expect(x).toBe(1);
    const [x2] = normalizeTilt(0, 90, 0);
    expect(x2).toBe(1);
  });
  it('maps gamma to x and beta to y in portrait', () => {
    expect(normalizeTilt(45, 22.5, 0)).toEqual([0.5, -1]);
  });
  it('remaps axes at 90° (landscape)', () => {
    expect(normalizeTilt(45, 22.5, 90)).toEqual([1, 0.5]);
  });
  it('remaps axes at 180 and 270', () => {
    expect(normalizeTilt(45, 22.5, 180)).toEqual([-0.5, 1]);
    expect(normalizeTilt(45, 22.5, 270)).toEqual([-1, -0.5]);
  });
  it('treats null sensor values as zero', () => {
    expect(normalizeTilt(null, null, 0)).toEqual([0, -0]);
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
    const { data } = paletteToUniform(['#c1440e', '#3a1505', '#2e7a6e', '#d4742e', '#e0c020', '#e8e2dc']);
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
  it('ignores a large downward swipe (no fullscreen navigation gestures)', () => {
    expect(tapGesture(100, 100, 105, 200, 300)).toBeNull();
    expect(tapGesture(100, 100, 100, 181, 100)).toBeNull();
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

describe('skipGesture', () => {
  it('classifies a swipe left as next (content follows the finger)', () => {
    expect(skipGesture(200, 100, 100, 105, 300)).toBe('next');
  });
  it('classifies a swipe right as prev', () => {
    expect(skipGesture(100, 100, 200, 95, 300)).toBe('prev');
  });
  it('ignores a swipe shorter than the minimum travel', () => {
    expect(skipGesture(100, 100, 100 + SKIP_MIN_DX - 1, 100, 300)).toBeNull();
    expect(skipGesture(100, 100, 100 + SKIP_MIN_DX, 100, 300)).toBe('prev');
  });
  it('ignores a diagonal swipe with too much vertical drift', () => {
    expect(skipGesture(100, 100, 220, 100 + SKIP_MAX_DY + 1, 300)).toBeNull();
    expect(skipGesture(100, 100, 220, 100 - SKIP_MAX_DY - 1, 300)).toBeNull();
  });
  it('ignores a slow drag', () => {
    expect(skipGesture(200, 100, 100, 100, SKIP_MAX_MS + 1)).toBeNull();
  });
});

describe('crossfadeAlpha', () => {
  it('starts at 0 and ends at 1', () => {
    expect(crossfadeAlpha(0)).toBe(0);
    expect(crossfadeAlpha(VIZ_FADE_MS)).toBe(1);
  });
  it('clamps beyond the duration and below zero', () => {
    expect(crossfadeAlpha(VIZ_FADE_MS * 3)).toBe(1);
    expect(crossfadeAlpha(-50)).toBe(0);
  });
  it('eases: midpoint is 0.5 but quarter-point lags linear', () => {
    expect(crossfadeAlpha(VIZ_FADE_MS / 2)).toBeCloseTo(0.5, 5);
    expect(crossfadeAlpha(VIZ_FADE_MS / 4)).toBeLessThan(0.25);
  });
  it('treats a zero duration as instantly complete', () => {
    expect(crossfadeAlpha(0, 0)).toBe(1);
  });
});

describe('resolveVizSelection', () => {
  const IDS = ['mesh', 'topo', 'rain', 'aurora'];
  it('prefers the stored listener override', () => {
    expect(resolveVizSelection('rain', 'topo', IDS)).toBe('rain');
  });
  it('falls back to the playlist default when the override is unknown', () => {
    expect(resolveVizSelection('plasma', 'topo', IDS)).toBe('topo');
    expect(resolveVizSelection(null, 'topo', IDS)).toBe('topo');
  });
  it('falls back to mesh when both are unknown or missing', () => {
    expect(resolveVizSelection('plasma', 'wormhole', IDS)).toBe('mesh');
    expect(resolveVizSelection(null, undefined, IDS)).toBe('mesh');
  });
});

describe('updateDue', () => {
  it('targets 30fps by default', () => {
    expect(VIZ_FRAME_MS).toBeCloseTo(1000 / 30);
  });
  it('is due on the first call', () => {
    expect(updateDue(null, 0)).toBe(true);
  });
  it('is not due before the interval', () => {
    expect(updateDue(0, 10)).toBe(false);
  });
  it('is due at the interval', () => {
    expect(updateDue(0, VIZ_FRAME_MS)).toBe(true);
  });
  it('allows rAF-jitter slack just under the interval', () => {
    expect(updateDue(0, VIZ_FRAME_MS - 3)).toBe(true);
    expect(updateDue(0, VIZ_FRAME_MS - 10)).toBe(false);
  });
  it('draws every 2nd tick of a 60Hz rAF, every 4th of 120Hz', () => {
    expect(updateDue(0, 16.67)).toBe(false);
    expect(updateDue(0, 33.33)).toBe(true);
    expect(updateDue(0, 8.33 * 3)).toBe(false);
    expect(updateDue(0, 8.33 * 4)).toBe(true);
  });
  it('honors a custom interval', () => {
    expect(updateDue(0, 95, 100)).toBe(false);
    expect(updateDue(0, 96, 100)).toBe(true);
  });
});

describe('reopenDue', () => {
  it('is false when no system close is pending', () => {
    expect(reopenDue(null, 1000)).toBe(false);
  });
  it('is true right after a system close', () => {
    expect(reopenDue(1000, 1001)).toBe(true);
  });
  it('is true just inside the window', () => {
    expect(reopenDue(0, VIZ_REOPEN_MAX_MS - 1)).toBe(true);
  });
  it('expires at and beyond the window', () => {
    expect(reopenDue(0, VIZ_REOPEN_MAX_MS)).toBe(false);
    expect(reopenDue(0, VIZ_REOPEN_MAX_MS * 2)).toBe(false);
  });
  it('honors a custom window', () => {
    expect(reopenDue(0, 150, 100)).toBe(false);
    expect(reopenDue(0, 50, 100)).toBe(true);
  });
});
