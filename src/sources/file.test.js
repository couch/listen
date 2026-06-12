// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STATE } from './ids.js';
import { mapMediaEvent, normalizeDuration, createFileSource } from './file.js';

describe('mapMediaEvent', () => {
  const live = { paused: false, ended: false };
  it('playing → PLAYING', () => expect(mapMediaEvent('playing', live)).toBe(STATE.PLAYING));
  it('pause → PAUSED', () => expect(mapMediaEvent('pause', { paused: true, ended: false })).toBe(STATE.PAUSED));
  it('suppresses the pause that precedes ended, so ENDED fires next() once', () => {
    expect(mapMediaEvent('pause', { paused: true, ended: true })).toBeNull();
  });
  it('ended → ENDED', () => expect(mapMediaEvent('ended', { paused: true, ended: true })).toBe(STATE.ENDED));
  it('waiting/stalled while playing → BUFFERING', () => {
    expect(mapMediaEvent('waiting', live)).toBe(STATE.BUFFERING);
    expect(mapMediaEvent('stalled', live)).toBe(STATE.BUFFERING);
  });
  it('ignores waiting/stalled while paused (Safari paused-seek noise)', () => {
    expect(mapMediaEvent('waiting', { paused: true, ended: false })).toBeNull();
    expect(mapMediaEvent('stalled', { paused: true, ended: false })).toBeNull();
  });
  it('ignores unknown events', () => expect(mapMediaEvent('seeked', live)).toBeNull());
});

describe('normalizeDuration', () => {
  it('passes a finite positive duration through', () => expect(normalizeDuration(184.2)).toBe(184.2));
  it('normalizes Infinity (live streams) to 0', () => expect(normalizeDuration(Infinity)).toBe(0));
  it('normalizes NaN/undefined/0 to 0', () => {
    expect(normalizeDuration(NaN)).toBe(0);
    expect(normalizeDuration(undefined)).toBe(0);
    expect(normalizeDuration(0)).toBe(0);
  });
});

describe('createFileSource', () => {
  const TRACK = { source: 'file', url: 'https://example.com/a.mp3', title: 'T', artist: 'A' };
  let callbacks, source, audio;

  function make(playImpl) {
    callbacks = { onReady: vi.fn(), onState: vi.fn(), onError: vi.fn() };
    source = createFileSource(callbacks);
    audio = document.body.querySelector('audio:last-of-type');
    audio.play = vi.fn(playImpl ?? (() => Promise.resolve()));
    audio.pause = vi.fn();
    audio.load = vi.fn();
  }

  beforeEach(() => { document.body.replaceChildren(); });

  it('mounts one hidden audio element and is ready immediately', async () => {
    make();
    expect(audio.hidden).toBe(true);
    expect(source.isReady()).toBe(true);
    expect(callbacks.onReady).not.toHaveBeenCalled(); // microtask, not sync
    await Promise.resolve();
    expect(callbacks.onReady).toHaveBeenCalledOnce();
  });

  it('load() sets src and plays synchronously (gesture-context rule)', () => {
    make();
    source.load(TRACK, {});
    expect(audio.getAttribute('src')).toBe(TRACK.url);
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('cue load defers: no play, seek + CUED on loadedmetadata', () => {
    make();
    source.load(TRACK, { startSeconds: 42, cue: true });
    expect(audio.play).not.toHaveBeenCalled();
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(42);
    expect(callbacks.onState).toHaveBeenCalledWith(STATE.CUED);
  });

  it('loadedmetadata without a pending cue emits nothing', () => {
    make();
    source.load(TRACK, {});
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(callbacks.onState).not.toHaveBeenCalledWith(STATE.CUED);
  });

  it('autoplay rejection (NotAllowedError) → blocked, never unplayable', async () => {
    make(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    source.load(TRACK, {});
    await Promise.resolve();
    expect(callbacks.onError).toHaveBeenCalledWith('blocked');
  });

  it('AbortError from a superseded play() is ignored', async () => {
    make(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    source.load(TRACK, {});
    await Promise.resolve();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('other play() rejections → unplayable', async () => {
    make(() => Promise.reject(new DOMException('bad', 'NotSupportedError')));
    source.load(TRACK, {});
    await Promise.resolve();
    expect(callbacks.onError).toHaveBeenCalledWith('unplayable');
  });

  it('media error events with a src → unplayable', () => {
    make();
    source.load(TRACK, {});
    audio.dispatchEvent(new Event('error'));
    expect(callbacks.onError).toHaveBeenCalledWith('unplayable');
  });

  it('a dead resource reports unplayable once, not once per failure signal', async () => {
    // the error event AND the play() rejection both fire for the same dead
    // URL — double-reporting would skip two tracks
    make(() => Promise.reject(new DOMException('bad', 'NotSupportedError')));
    source.load(TRACK, {});
    audio.dispatchEvent(new Event('error'));
    await Promise.resolve();
    expect(callbacks.onError).toHaveBeenCalledOnce();
  });

  it('a rejection from a superseded load() is dropped', async () => {
    let reject;
    make(() => new Promise((_, r) => { reject = r; }));
    source.load(TRACK, {});
    const firstReject = reject;
    source.load({ ...TRACK, url: 'https://example.com/b.mp3' }, {});
    firstReject(new DOMException('bad', 'NotSupportedError'));
    await Promise.resolve();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('the error fired by emptying src in stop() is not fatal', () => {
    make();
    source.load(TRACK, {});
    source.stop();
    audio.dispatchEvent(new Event('error'));
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('stop() pauses, clears src, and releases the connection', () => {
    make();
    source.load(TRACK, {});
    source.stop();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.getAttribute('src')).toBeNull();
    expect(audio.load).toHaveBeenCalled();
    expect(source.getState()).toBe(STATE.UNSTARTED);
  });

  it('event wiring routes through mapMediaEvent (ended drives ENDED)', () => {
    make();
    source.load(TRACK, {});
    Object.defineProperty(audio, 'ended', { value: true, configurable: true });
    audio.dispatchEvent(new Event('pause'));   // pause-before-ended: suppressed
    audio.dispatchEvent(new Event('ended'));
    const states = callbacks.onState.mock.calls.map(c => c[0]);
    expect(states).not.toContain(STATE.PAUSED);
    expect(states).toContain(STATE.ENDED);
  });

  it('getDuration normalizes the element duration', () => {
    make();
    source.load(TRACK, {});
    Object.defineProperty(audio, 'duration', { value: Infinity, configurable: true });
    expect(source.getDuration()).toBe(0);
    Object.defineProperty(audio, 'duration', { value: 184.2, configurable: true });
    expect(source.getDuration()).toBe(184.2);
  });

  it('seekTo clamps to a known duration', () => {
    make();
    source.load(TRACK, {});
    Object.defineProperty(audio, 'duration', { value: 100, configurable: true });
    source.seekTo(500);
    expect(audio.currentTime).toBe(100);
  });
});
