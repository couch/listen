import { describe, it, expect } from 'vitest';
import { SOURCE_IDS, DEFAULT_SOURCE_ID, STATE, sourceOf, CAPS, capsOf, attributionFor, artworkFor } from './ids.js';

const YT_TRACK = { id: 'dQw4w9WgXcQ', title: 'Song', artist: 'Artist' };
const FILE_TRACK = { source: 'file', url: 'https://www.archive.org/track.mp3', title: 'Song', artist: 'Artist' };

describe('SOURCE_IDS', () => {
  it('starts with the default source', () => expect(SOURCE_IDS[0]).toBe(DEFAULT_SOURCE_ID));
  it('every id has a caps entry', () => SOURCE_IDS.forEach(id => expect(CAPS).toHaveProperty(id)));
});

describe('STATE', () => {
  it('values are unique strings', () => {
    const vals = Object.values(STATE);
    expect(new Set(vals).size).toBe(vals.length);
    vals.forEach(v => expect(typeof v).toBe('string'));
  });
});

describe('sourceOf', () => {
  it('defaults an omitted source to youtube', () => expect(sourceOf(YT_TRACK)).toBe('youtube'));
  it('passes a known source through', () => expect(sourceOf(FILE_TRACK)).toBe('file'));
  it('falls back to youtube for unknown sources and bad input', () => {
    expect(sourceOf({ ...YT_TRACK, source: 'spotify' })).toBe('youtube');
    expect(sourceOf(null)).toBe('youtube');
    expect(sourceOf(undefined)).toBe('youtube');
  });
});

describe('capsOf', () => {
  it('youtube needs the transient-pause guard', () => expect(capsOf('youtube').needsTransientPauseGuard).toBe(true));
  it('file does not', () => expect(capsOf('file').needsTransientPauseGuard).toBe(false));
  it('falls back to the default caps for unknown ids', () => expect(capsOf('banana')).toBe(CAPS[DEFAULT_SOURCE_ID]));
  it('every caps entry has the full flag set', () => {
    SOURCE_IDS.forEach(id => {
      const caps = capsOf(id);
      ['needsTransientPauseGuard', 'hiddenPlayback', 'fullPlayback', 'cueable'].forEach(k =>
        expect(typeof caps[k], `${id}.${k}`).toBe('boolean'));
    });
  });
});

describe('attributionFor', () => {
  it('youtube tracks link to the watch page with a null label', () => {
    expect(attributionFor(YT_TRACK)).toEqual({ href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: null });
  });
  it('file tracks link to the url with the hostname as label', () => {
    expect(attributionFor(FILE_TRACK)).toEqual({ href: FILE_TRACK.url, label: 'archive.org' });
  });
  it('strips only a leading www.', () => {
    expect(attributionFor({ ...FILE_TRACK, url: 'https://wwwhost.example/a.mp3' }).label).toBe('wwwhost.example');
  });
  it('tolerates an unparseable url with an empty label', () => {
    expect(attributionFor({ ...FILE_TRACK, url: 'not a url' }).label).toBe('');
  });
});

describe('artworkFor', () => {
  it('youtube tracks use the thumbnail CDN', () => {
    expect(artworkFor(YT_TRACK)[0].src).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
  it('file tracks return null so the artwork field is omitted', () => {
    expect(artworkFor(FILE_TRACK)).toBeNull();
  });
});
