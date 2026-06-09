import { describe, it, expect } from 'vitest';
import { computeCacheVersion, buildPrecacheList, patchServiceWorker } from './sw-build.js';

describe('computeCacheVersion', () => {
  it('returns an 8-char hex string', () => {
    expect(computeCacheVersion(['assets/main-abc.js'])).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same input', () => {
    const keys = ['assets/main-abc.js', 'assets/utils-def.js'];
    expect(computeCacheVersion(keys)).toBe(computeCacheVersion(keys));
  });

  it('is order-independent (sorts before hashing)', () => {
    const a = computeCacheVersion(['assets/main.js', 'assets/utils.js']);
    const b = computeCacheVersion(['assets/utils.js', 'assets/main.js']);
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeCacheVersion(['assets/main-abc.js']);
    const b = computeCacheVersion(['assets/main-xyz.js']);
    expect(a).not.toBe(b);
  });
});

describe('buildPrecacheList', () => {
  const bundle = [
    'index.html',
    'admin.html',
    'embed.html',
    'assets/main-abc.js',
    'assets/utils-def.js',
    'assets/main-ghi.css',
    'sw.js',
    'CNAME',
  ];

  it('always includes the root URL', () => {
    expect(buildPrecacheList(bundle)).toContain('/');
  });

  it('includes all assets/ entries with leading slash', () => {
    const list = buildPrecacheList(bundle);
    expect(list).toContain('/assets/main-abc.js');
    expect(list).toContain('/assets/utils-def.js');
    expect(list).toContain('/assets/main-ghi.css');
  });

  it('includes admin.html and embed.html', () => {
    const list = buildPrecacheList(bundle);
    expect(list).toContain('/admin.html');
    expect(list).toContain('/embed.html');
  });

  it('excludes index.html (covered by /)', () => {
    expect(buildPrecacheList(bundle)).not.toContain('/index.html');
  });

  it('excludes sw.js', () => {
    expect(buildPrecacheList(bundle)).not.toContain('/sw.js');
  });

  it('excludes CNAME', () => {
    expect(buildPrecacheList(bundle)).not.toContain('/CNAME');
  });

  it('returns at least the root when bundle is empty', () => {
    expect(buildPrecacheList([])).toEqual(['/']);
  });
});

describe('patchServiceWorker', () => {
  const template = [
    "const CACHE = 'muxtape-__CACHE_VERSION__';",
    "// Resources to pre-cache on install (the HTML shell + bundled assets)",
    "const PRECACHE = ['/'];",
  ].join('\n');

  it('replaces __CACHE_VERSION__ with the given hash', () => {
    const result = patchServiceWorker(template, 'abc12345', ['/']);
    expect(result).toContain("'muxtape-abc12345'");
    expect(result).not.toContain('__CACHE_VERSION__');
  });

  it('replaces PRECACHE with the full list', () => {
    const precache = ['/', '/assets/main-abc.js', '/assets/utils-def.js'];
    const result = patchServiceWorker(template, 'abc12345', precache);
    expect(result).toContain(JSON.stringify(precache));
    expect(result).not.toContain("const PRECACHE = ['/'];");
  });

  it('produced output is valid JS containing all precache entries', () => {
    const precache = ['/', '/assets/main-abc.js'];
    const result = patchServiceWorker(template, 'deadbeef', precache);
    expect(result).toContain('/assets/main-abc.js');
  });

  it('leaves unrecognised content untouched', () => {
    const result = patchServiceWorker(template, 'abc12345', ['/']);
    expect(result).toContain('// Resources to pre-cache on install');
  });
});
