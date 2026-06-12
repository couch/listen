import { DEFAULT_SOURCE_ID } from './ids.js';
import { createYouTubeSource } from './youtube.js';
import { createFileSource } from './file.js';

// Static imports on purpose — no viz-style lazy registry. load() must stay
// synchronously reachable inside the click gesture (iOS autoplay), and both
// sources are tiny. A future SDK-backed source (Spotify embed, Apple
// MusicKit) instead adds an eager prepare() called at startup for the
// families present in the tape — the same trick loadYouTubeAPI used.
export const SOURCES = {
  youtube: createYouTubeSource,
  file: createFileSource,
};

export function sourceFactory(sourceId) {
  return SOURCES[sourceId] || SOURCES[DEFAULT_SOURCE_ID];
}
