import { describe, it, expect } from 'vitest';
import { STATE } from './ids.js';
import { mapYouTubeState, mapYouTubeError, loadCommand } from './youtube.js';

describe('mapYouTubeState', () => {
  it('maps every documented YT.PlayerState code', () => {
    expect(mapYouTubeState(-1)).toBe(STATE.UNSTARTED);
    expect(mapYouTubeState(0)).toBe(STATE.ENDED);
    expect(mapYouTubeState(1)).toBe(STATE.PLAYING);
    expect(mapYouTubeState(2)).toBe(STATE.PAUSED);
    expect(mapYouTubeState(3)).toBe(STATE.BUFFERING);
    expect(mapYouTubeState(5)).toBe(STATE.CUED);
  });
  it('returns null for unknown codes so they are ignored', () => {
    expect(mapYouTubeState(4)).toBeNull();
    expect(mapYouTubeState(undefined)).toBeNull();
  });
});

describe('mapYouTubeError', () => {
  it('every documented error code is fatal for the video', () => {
    // 2 invalid id, 5 HTML5 error, 100 removed/private, 101/150 embed-restricted
    [2, 5, 100, 101, 150].forEach(code => expect(mapYouTubeError(code)).toBe('unplayable'));
  });
  it('unknown codes are fatal too (matches the pre-seam behavior)', () => {
    expect(mapYouTubeError(undefined)).toBe('unplayable');
  });
});

describe('loadCommand', () => {
  const TRACK = { id: 'dQw4w9WgXcQ' };
  it('cue maps to cueVideoById with the object form', () => {
    expect(loadCommand(TRACK, { startSeconds: 42, cue: true }))
      .toEqual({ method: 'cueVideoById', arg: { videoId: 'dQw4w9WgXcQ', startSeconds: 42 } });
  });
  it('cue without startSeconds still uses the object form', () => {
    expect(loadCommand(TRACK, { cue: true }))
      .toEqual({ method: 'cueVideoById', arg: { videoId: 'dQw4w9WgXcQ', startSeconds: undefined } });
  });
  it('play with startSeconds maps to loadVideoById with the object form', () => {
    expect(loadCommand(TRACK, { startSeconds: 42 }))
      .toEqual({ method: 'loadVideoById', arg: { videoId: 'dQw4w9WgXcQ', startSeconds: 42 } });
  });
  it('plain play keeps the bare-id call shape', () => {
    expect(loadCommand(TRACK)).toEqual({ method: 'loadVideoById', arg: 'dQw4w9WgXcQ' });
    expect(loadCommand(TRACK, {})).toEqual({ method: 'loadVideoById', arg: 'dQw4w9WgXcQ' });
  });
});
