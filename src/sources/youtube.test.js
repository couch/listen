import { describe, it, expect } from 'vitest';
import { STATE } from './ids.js';
import { mapYouTubeState, mapYouTubeError } from './youtube.js';

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
