import { describe, it, expect } from 'vitest';
import { isLocalAudioFile, localAudioType, trackMetaFromFilename, buildLocalTape, LOCAL_AUDIO_EXTS } from './local-tape.js';
import { validatePlaylist } from './schema.js';

describe('isLocalAudioFile', () => {
  it('accepts every documented extension, case-insensitively', () => {
    for (const ext of LOCAL_AUDIO_EXTS) {
      expect(isLocalAudioFile(`song.${ext}`)).toBe(true);
      expect(isLocalAudioFile(`SONG.${ext.toUpperCase()}`)).toBe(true);
    }
  });
  it('rejects non-audio files, dotfiles, and extensionless names', () => {
    expect(isLocalAudioFile('cover.jpg')).toBe(false);
    expect(isLocalAudioFile('notes.txt')).toBe(false);
    expect(isLocalAudioFile('.DS_Store')).toBe(false);
    expect(isLocalAudioFile('.hidden.mp3')).toBe(false);
    expect(isLocalAudioFile('README')).toBe(false);
  });
});

describe('localAudioType', () => {
  it('maps known extensions to audio MIME types', () => {
    expect(localAudioType('a.mp3')).toBe('audio/mpeg');
    expect(localAudioType('a.m4a')).toBe('audio/mp4');
    expect(localAudioType('a.flac')).toBe('audio/flac');
    expect(localAudioType('a.opus')).toBe('audio/ogg');
  });
  it('falls back to octet-stream for unknown extensions', () => {
    expect(localAudioType('a.xyz')).toBe('application/octet-stream');
  });
});

describe('trackMetaFromFilename', () => {
  it('splits "Artist - Title" on the first separator', () => {
    expect(trackMetaFromFilename('Nina Simone - Sinnerman.mp3'))
      .toEqual({ title: 'Sinnerman', artist: 'Nina Simone' });
    expect(trackMetaFromFilename('A - B - C.flac'))
      .toEqual({ title: 'B - C', artist: 'A' });
  });
  it('strips leading track numbers', () => {
    expect(trackMetaFromFilename('01 - Artist - Song.mp3'))
      .toEqual({ title: 'Song', artist: 'Artist' });
    expect(trackMetaFromFilename('02. Just A Title.m4a'))
      .toEqual({ title: 'Just A Title', artist: '' });
    expect(trackMetaFromFilename('3_Tone.wav'))
      .toEqual({ title: 'Tone', artist: '' });
  });
  it('uses the whole basename as title when there is no separator', () => {
    expect(trackMetaFromFilename('fieldrecording.wav'))
      .toEqual({ title: 'fieldrecording', artist: '' });
  });
});

describe('buildLocalTape', () => {
  const origin = 'http://localhost:5173';

  it('builds a playlist that passes schema validation', () => {
    const tape = buildLocalTape(['b.mp3', 'a.flac', 'cover.jpg'], origin);
    expect(() => validatePlaylist(tape)).not.toThrow();
    expect(tape.id).toBe('local');
    expect(tape.tracks).toHaveLength(2);
    expect(tape.tracks.every(t => t.source === 'file')).toBe(true);
  });

  it('sorts numerically and URL-encodes filenames into absolute URLs', () => {
    const tape = buildLocalTape(['10 - Z.mp3', '2 - A.mp3', 'my song #1.mp3'], origin);
    expect(tape.tracks.map(t => t.title)).toEqual(['A', 'Z', 'my song #1']);
    expect(tape.tracks[2].url).toBe(`${origin}/local-audio/my%20song%20%231.mp3`);
    expect(tape.tracks.every(t => new URL(t.url).origin === origin)).toBe(true);
  });

  it('caps at the 12-track schema limit', () => {
    const names = Array.from({ length: 20 }, (_, i) => `${i + 1} - t.mp3`);
    const tape = buildLocalTape(names, origin);
    expect(tape.tracks).toHaveLength(12);
    expect(() => validatePlaylist(tape)).not.toThrow();
  });
});
