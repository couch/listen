import { describe, it, expect, vi } from 'vitest';
import { PALETTE, extractId, haversine, fuzzyCoord, fmt, sha256 } from './utils.js';

describe('PALETTE', () => {
  it('has 10 entries', () => expect(PALETTE).toHaveLength(10));
  it('every entry is a valid hex color', () => {
    PALETTE.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('extractId', () => {
  it('accepts a bare 11-char ID', () => expect(extractId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('extracts from a standard watch URL', () => expect(extractId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('extracts from a short youtu.be URL', () => expect(extractId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('extracts from an embed URL', () => expect(extractId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('ignores extra query params', () => expect(extractId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ'));
  it('trims surrounding whitespace', () => expect(extractId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ'));
  it('returns null for empty string', () => expect(extractId('')).toBeNull());
  it('returns null for non-YouTube URL', () => expect(extractId('https://vimeo.com/123456789')).toBeNull());
  it('returns null for a 10-char string', () => expect(extractId('dQw4w9WgXc')).toBeNull());
  it('returns null for a 12-char string', () => expect(extractId('dQw4w9WgXcQQ')).toBeNull());
});

describe('fmt', () => {
  it('formats zero as 0:00', () => expect(fmt(0)).toBe('0:00'));
  it('pads single-digit seconds', () => expect(fmt(9)).toBe('0:09'));
  it('formats one minute five seconds', () => expect(fmt(65)).toBe('1:05'));
  it('formats exact minutes', () => expect(fmt(120)).toBe('2:00'));
  it('floors fractional seconds', () => expect(fmt(90.9)).toBe('1:30'));
  it('handles durations over an hour', () => expect(fmt(3661)).toBe('61:01'));
});

describe('haversine', () => {
  it('returns 0 for the same point', () => expect(haversine(0, 0, 0, 0)).toBe(0));
  it('is symmetric', () => {
    expect(haversine(45.5, -122.7, 40.7, -74.0)).toBeCloseTo(haversine(40.7, -74.0, 45.5, -122.7), 5);
  });
  it('returns a non-negative distance', () => {
    expect(haversine(51.5, -0.1, 48.9, 2.3)).toBeGreaterThanOrEqual(0);
  });
  it('approximates New York to London (~5570 km)', () => {
    const km = haversine(40.7128, -74.006, 51.5074, -0.1278);
    expect(km).toBeGreaterThan(5550);
    expect(km).toBeLessThan(5600);
  });
});

describe('fuzzyCoord', () => {
  it('returns an object with lat and lng', () => {
    const result = fuzzyCoord(45.523, -122.676);
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lng');
  });
  it('stays within ~2 km of the input', () => {
    for (let i = 0; i < 20; i++) {
      const { lat, lng } = fuzzyCoord(45.523, -122.676);
      expect(haversine(45.523, -122.676, lat, lng)).toBeLessThan(2);
    }
  });
  it('rounds to at most 3 decimal places', () => {
    const { lat, lng } = fuzzyCoord(45.523, -122.676);
    const latDecimals = String(lat).split('.')[1]?.length ?? 0;
    const lngDecimals = String(lng).split('.')[1]?.length ?? 0;
    expect(latDecimals).toBeLessThanOrEqual(3);
    expect(lngDecimals).toBeLessThanOrEqual(3);
  });
  it('produces a deterministic result given a fixed Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = fuzzyCoord(45.523, -122.676);
    const b = fuzzyCoord(45.523, -122.676);
    expect(a).toEqual(b);
    vi.restoreAllMocks();
  });
});

describe('sha256', () => {
  it('hashes the empty string correctly', async () => {
    expect(await sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('hashes "hello" correctly', async () => {
    expect(await sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
  it('is deterministic', async () => {
    expect(await sha256('test')).toBe(await sha256('test'));
  });
  it('produces different hashes for different inputs', async () => {
    expect(await sha256('foo')).not.toBe(await sha256('bar'));
  });
});
