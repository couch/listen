import { describe, it, expect, vi } from 'vitest';
import { PALETTE, extractId, haversine, fuzzyCoord, fmt, buildConfig, hexToRgb, rgbToHex, hexToHsl, hslToHex, smootherstep, dimColor, pickDriftTarget, buildSaveFiles } from './utils.js';

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
  it('extracts from a Shorts URL', () => expect(extractId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
  it('extracts from a Music URL', () => expect(extractId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ'));
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

describe('buildConfig', () => {
  const playlist = {
    title: 'Test Tape',
    color: 'random',
    tracks: [{ id: 'abc123defgh', title: 'Song One', artist: 'Artist A' }],
  };

  it('generates a TAPE declaration', () => {
    const result = buildConfig(playlist);
    expect(result).toContain('const TAPE = {');
    expect(result).toContain('"Test Tape"');
    expect(result).toContain('"random"');
    expect(result).toContain('"abc123defgh"');
    expect(result).toContain('"Song One"');
    expect(result).toContain('"Artist A"');
  });
  it('includes optional fields when present', () => {
    const p = { ...playlist, created: '2026-01-01', lastEdited: '2026-06-07', location: { city: 'Portland', lat: 45.523, lng: -122.676 } };
    const result = buildConfig(p);
    expect(result).toContain('created: "2026-01-01"');
    expect(result).toContain('lastEdited: "2026-06-07"');
    expect(result).toContain('"Portland"');
  });
  it('omits optional fields when absent', () => {
    const result = buildConfig(playlist);
    expect(result).not.toContain('created');
    expect(result).not.toContain('location');
    expect(result).not.toContain('viz');
  });
  it('includes the viz field when set', () => {
    expect(buildConfig({ ...playlist, viz: 'rain' })).toContain('viz: "rain"');
  });
  it('returns empty string for null/undefined', () => {
    expect(buildConfig(null)).toBe('');
    expect(buildConfig(undefined)).toBe('');
  });
  it('JSON-escapes special characters in strings', () => {
    const p = { ...playlist, tracks: [{ id: 'abc123defgh', title: 'Song "Quoted"', artist: "Artist's" }] };
    const result = buildConfig(p);
    expect(result).toContain('\\"Quoted\\"');
    expect(result).toContain("Artist's");
  });
});


describe('hexToRgb', () => {
  it('parses a known red', () => expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]));
  it('parses a known green', () => expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]));
  it('parses a known blue', () => expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]));
  it('parses black', () => expect(hexToRgb('#000000')).toEqual([0, 0, 0]));
  it('parses white', () => expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]));
  it('ignores a leading hash', () => expect(hexToRgb('#a83232')).toEqual([168, 50, 50]));
  it('handles leading whitespace', () => expect(hexToRgb(' #ff0000')).toEqual([255, 0, 0]));
});

describe('rgbToHex', () => {
  it('encodes red', () => expect(rgbToHex([255, 0, 0])).toBe('#ff0000'));
  it('encodes white', () => expect(rgbToHex([255, 255, 255])).toBe('#ffffff'));
  it('encodes black', () => expect(rgbToHex([0, 0, 0])).toBe('#000000'));
  it('rounds fractional values', () => expect(rgbToHex([254.6, 0, 0])).toBe('#ff0000'));
  it('clamps below 0', () => expect(rgbToHex([-1, 0, 0])).toBe('#000000'));
  it('clamps above 255', () => expect(rgbToHex([256, 0, 0])).toBe('#ff0000'));
  it('round-trips with hexToRgb', () => {
    PALETTE.forEach(c => expect(rgbToHex(hexToRgb(c))).toBe(c));
  });
});

describe('hexToHsl', () => {
  it('returns [0, 0, 100] for white', () => {
    const [h, s, l] = hexToHsl('#ffffff');
    expect(s).toBeCloseTo(0);
    expect(l).toBeCloseTo(100);
  });
  it('returns [0, 0, 0] for black', () => {
    const [h, s, l] = hexToHsl('#000000');
    expect(s).toBeCloseTo(0);
    expect(l).toBeCloseTo(0);
  });
  it('returns hue ~0 for pure red', () => {
    const [h, s, l] = hexToHsl('#ff0000');
    expect(h).toBeCloseTo(0);
    expect(s).toBeCloseTo(100);
    expect(l).toBeCloseTo(50);
  });
  it('returns hue ~120 for pure green', () => {
    const [h] = hexToHsl('#00ff00');
    expect(h).toBeCloseTo(120);
  });
  it('returns hue ~240 for pure blue', () => {
    const [h] = hexToHsl('#0000ff');
    expect(h).toBeCloseTo(240);
  });
  it('returns h in [0, 360)', () => {
    PALETTE.forEach(c => {
      const [h] = hexToHsl(c);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    });
  });
  it('returns s in [0, 100]', () => {
    PALETTE.forEach(c => {
      const [, s] = hexToHsl(c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });
  });
  it('returns l in [0, 100]', () => {
    PALETTE.forEach(c => {
      const [,, l] = hexToHsl(c);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(100);
    });
  });
});

describe('hslToHex', () => {
  it('returns #ffffff for white (any hue, s=0, l=100)', () => {
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });
  it('returns #000000 for black (any hue, s=0, l=0)', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });
  it('returns #ff0000 for pure red (h=0, s=100, l=50)', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
  });
  it('returns #00ff00 for pure green (h=120, s=100, l=50)', () => {
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });
  it('returns #0000ff for pure blue (h=240, s=100, l=50)', () => {
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });
  it('wraps hue — 360 equals 0', () => {
    expect(hslToHex(360, 100, 50)).toBe(hslToHex(0, 100, 50));
  });
  it('wraps negative hue — -60 equals 300', () => {
    expect(hslToHex(-60, 100, 50)).toBe(hslToHex(300, 100, 50));
  });
  it('returns a valid 7-char hex string', () => {
    expect(hslToHex(200, 50, 40)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('hexToHsl / hslToHex round-trip', () => {
  it('round-trips all PALETTE colors within 1 unit', () => {
    PALETTE.forEach(c => {
      const [h, s, l] = hexToHsl(c);
      const result = hslToHex(h, s, l);
      const orig = hexToRgb(c);
      const back = hexToRgb(result);
      orig.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 0));
    });
  });
  it('shifting hue by 30° and back returns the original', () => {
    PALETTE.forEach(c => {
      const [h, s, l] = hexToHsl(c);
      const shifted = hexToHsl(hslToHex(h + 30, s, l));
      expect(shifted[0]).toBeCloseTo((h + 30) % 360, 0);
    });
  });
});

describe('smootherstep', () => {
  it('returns 0 at t=0', () => expect(smootherstep(0)).toBe(0));
  it('returns 1 at t=1', () => expect(smootherstep(1)).toBe(1));
  it('returns 0.5 at t=0.5', () => expect(smootherstep(0.5)).toBeCloseTo(0.5));
  it('is monotonically increasing', () => {
    for (let t = 0; t < 1; t += 0.1) {
      expect(smootherstep(t + 0.1)).toBeGreaterThan(smootherstep(t));
    }
  });
  it('has near-zero slope at t=0', () => {
    expect(smootherstep(0.01)).toBeLessThan(0.001);
  });
  it('has near-zero slope at t=1', () => {
    expect(smootherstep(0.99)).toBeGreaterThan(0.999);
  });
});

describe('dimColor', () => {
  it('returns a valid hex string', () => expect(dimColor('#a83232')).toMatch(/^#[0-9a-f]{6}$/));
  it('dims a color to a lower brightness', () => {
    const [r1, g1, b1] = hexToRgb('#a83232');
    const [r2, g2, b2] = hexToRgb(dimColor('#a83232'));
    expect(r2).toBeLessThan(r1);
    expect(g2).toBeLessThanOrEqual(g1);
    expect(b2).toBeLessThanOrEqual(b1);
  });
  it('dims white to a grey', () => {
    const [r, g, b] = hexToRgb(dimColor('#ffffff'));
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(255);
  });
  it('produces consistent output for the same input', () => {
    expect(dimColor('#c1440e')).toBe(dimColor('#c1440e'));
  });
});

describe('pickDriftTarget', () => {
  it('never returns the avoided color', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickDriftTarget(PALETTE[0])).not.toBe(PALETTE[0]);
    }
  });
  it('returns a color from PALETTE', () => {
    expect(PALETTE).toContain(pickDriftTarget(PALETTE[0]));
  });
  it('returns the only remaining option when avoiding all but one', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickDriftTarget(PALETTE[0])).toBe(PALETTE[1]);
    vi.restoreAllMocks();
  });
});

describe('buildSaveFiles', () => {
  const track = { id: 'dQw4w9WgXcQ', title: 'Song', artist: 'Artist' };
  const playlist = { id: '100', title: 'My Tape', color: 'random', tracks: [track] };
  const playlists = { '100': playlist };
  const idx = { active: '100', ids: ['100'] };

  it('always includes the current playlist file', () => {
    const files = buildSaveFiles('100', playlists, idx);
    expect(files.some(f => f.path === 'playlists/100.json')).toBe(true);
  });

  it('always includes index.json', () => {
    const files = buildSaveFiles('100', playlists, idx);
    expect(files.some(f => f.path === 'playlists/index.json')).toBe(true);
  });

  it('always includes config.js', () => {
    const files = buildSaveFiles('100', playlists, idx);
    expect(files.some(f => f.path === 'config.js')).toBe(true);
  });

  it('config.js content is generated from the active playlist', () => {
    const files = buildSaveFiles('100', playlists, idx);
    const config = files.find(f => f.path === 'config.js');
    expect(config.content).toContain('My Tape');
    expect(config.content).toContain('dQw4w9WgXcQ');
  });

  it('playlist file content is valid JSON matching the playlist', () => {
    const files = buildSaveFiles('100', playlists, idx);
    const pf = files.find(f => f.path === 'playlists/100.json');
    expect(JSON.parse(pf.content)).toEqual(playlist);
  });

  it('does not duplicate the active playlist when current === active', () => {
    const files = buildSaveFiles('100', playlists, idx);
    const playlistFiles = files.filter(f => f.path.startsWith('playlists/') && f.path.endsWith('.json') && f.path !== 'playlists/index.json');
    expect(playlistFiles).toHaveLength(1);
  });

  it('includes both current and active playlist files when they differ', () => {
    const active = { id: '200', title: 'Active Tape', color: '#c1440e', tracks: [] };
    const twoPlaylists = { '100': playlist, '200': active };
    const twoIdx = { active: '200', ids: ['100', '200'] };
    const files = buildSaveFiles('100', twoPlaylists, twoIdx);
    expect(files.some(f => f.path === 'playlists/100.json')).toBe(true);
    expect(files.some(f => f.path === 'playlists/200.json')).toBe(true);
  });

  it('config.js uses the active playlist, not the current one, when they differ', () => {
    const active = { id: '200', title: 'Active Tape', color: '#c1440e', tracks: [] };
    const twoPlaylists = { '100': playlist, '200': active };
    const twoIdx = { active: '200', ids: ['100', '200'] };
    const files = buildSaveFiles('100', twoPlaylists, twoIdx);
    const config = files.find(f => f.path === 'config.js');
    expect(config.content).toContain('Active Tape');
    expect(config.content).not.toContain('My Tape');
  });
});
