import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';
import { githubCommit, githubDeleteFile } from './github.js';
import { validateTrack, validatePlaylist, validateIndex } from './schema.js';

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('hashPassword', () => {
  it('returns a salt and hash', async () => {
    const result = await hashPassword('secret');
    expect(result).toHaveProperty('salt');
    expect(result).toHaveProperty('hash');
  });

  it('salt is a 32-char hex string (16 bytes)', async () => {
    const { salt } = await hashPassword('secret');
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hash is a 64-char hex string (256 bits)', async () => {
    const { hash } = await hashPassword('secret');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different salts on each call', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret');
    expect(a.salt).not.toBe(b.salt);
  });

  it('same password with different salts yields different hashes', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret');
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const { salt, hash } = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', salt, hash)).toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const { salt, hash } = await hashPassword('correct-horse');
    expect(await verifyPassword('wrong-horse', salt, hash)).toBe(false);
  });

  it('is case-sensitive', async () => {
    const { salt, hash } = await hashPassword('Secret');
    expect(await verifyPassword('secret', salt, hash)).toBe(false);
  });

  it('rejects an empty password against a hashed non-empty one', async () => {
    const { salt, hash } = await hashPassword('something');
    expect(await verifyPassword('', salt, hash)).toBe(false);
  });

  it('round-trips consistently with the same salt', async () => {
    const { salt, hash } = await hashPassword('consistency');
    expect(await verifyPassword('consistency', salt, hash)).toBe(true);
    expect(await verifyPassword('consistency', salt, hash)).toBe(true);
  });
});

// ── GitHub API ────────────────────────────────────────────────────────────────

const GH = { token: 'ghp_test', owner: 'testowner', repo: 'testrepo', branch: 'main' };

function makeFetchResponses(responses) {
  let call = 0;
  return vi.fn(async (_url, _opts) => {
    const r = responses[call++];
    return {
      ok: r.ok ?? true,
      json: async () => r.data ?? {},
    };
  });
}

describe('githubCommit', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('calls GitHub API in the correct sequence', async () => {
    const fetchMock = makeFetchResponses([
      { data: { object: { sha: 'ref-sha' } } },             // GET refs/heads/main
      { data: { tree: { sha: 'tree-sha' } } },              // GET commits/ref-sha
      { data: { sha: 'blob-sha-1' } },                       // POST blobs (file 1)
      { data: { sha: 'new-tree-sha' } },                     // POST trees
      { data: { sha: 'new-commit-sha' } },                   // POST commits
      { data: {} },                                           // PATCH refs/heads/main
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await githubCommit([{ path: 'config.js', content: 'const x = 1;' }], 'test commit', GH);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const urls = fetchMock.mock.calls.map(c => c[0]);
    expect(urls[0]).toContain('/git/refs/heads/main');
    expect(urls[1]).toContain('/git/commits/ref-sha');
    expect(urls[2]).toContain('/git/blobs');
    expect(urls[3]).toContain('/git/trees');
    expect(urls[4]).toContain('/git/commits');
    expect(urls[5]).toContain('/git/refs/heads/main');
  });

  it('creates one blob per file', async () => {
    const fetchMock = makeFetchResponses([
      { data: { object: { sha: 'ref-sha' } } },
      { data: { tree: { sha: 'tree-sha' } } },
      { data: { sha: 'blob-1' } },
      { data: { sha: 'blob-2' } },
      { data: { sha: 'new-tree-sha' } },
      { data: { sha: 'new-commit-sha' } },
      { data: {} },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await githubCommit(
      [{ path: 'a.json', content: '{}' }, { path: 'b.json', content: '{}' }],
      'two files',
      GH
    );

    const blobCalls = fetchMock.mock.calls.filter(c => c[0].includes('/git/blobs'));
    expect(blobCalls).toHaveLength(2);
  });

  it('sends Authorization header with the token', async () => {
    const fetchMock = makeFetchResponses([
      { data: { object: { sha: 's' } } },
      { data: { tree: { sha: 't' } } },
      { data: { sha: 'b' } },
      { data: { sha: 'nt' } },
      { data: { sha: 'nc' } },
      { data: {} },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await githubCommit([{ path: 'f', content: 'x' }], 'msg', GH);

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer ghp_test');
  });

  it('throws when GitHub returns a non-OK response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ message: 'Bad credentials' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      githubCommit([{ path: 'f', content: 'x' }], 'msg', GH)
    ).rejects.toThrow('Bad credentials');
  });

  it('uses correct repo path in URL', async () => {
    const fetchMock = makeFetchResponses([
      { data: { object: { sha: 's' } } },
      { data: { tree: { sha: 't' } } },
      { data: { sha: 'b' } },
      { data: { sha: 'nt' } },
      { data: { sha: 'nc' } },
      { data: {} },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await githubCommit([{ path: 'f', content: 'x' }], 'msg', GH);

    expect(fetchMock.mock.calls[0][0]).toContain('/repos/testowner/testrepo/');
  });
});

describe('githubDeleteFile', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('does nothing when the file does not exist (404)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await githubDeleteFile('playlists/gone.json', 'delete', GH);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches file SHA then sends DELETE', async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_url, opts) => {
      call++;
      if (call === 1) return { ok: true, json: async () => ({ sha: 'file-sha' }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await githubDeleteFile('playlists/old.json', 'remove old', GH);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, deleteOpts] = fetchMock.mock.calls[1];
    expect(deleteOpts.method).toBe('DELETE');
    const body = JSON.parse(deleteOpts.body);
    expect(body.sha).toBe('file-sha');
    expect(body.branch).toBe('main');
  });
});

// ── Schema validation ─────────────────────────────────────────────────────────

const VALID_TRACK = { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley' };
const VALID_PLAYLIST = { title: 'My Tape', color: '#a83232', tracks: [VALID_TRACK] };
const VALID_INDEX = { active: '123', ids: ['123', '456'] };

describe('validateTrack', () => {
  it('accepts a valid track', () => expect(() => validateTrack(VALID_TRACK)).not.toThrow());
  it('rejects null', () => expect(() => validateTrack(null)).toThrow());
  it('rejects a non-object', () => expect(() => validateTrack('string')).toThrow());
  it('rejects a 10-char id', () => expect(() => validateTrack({ ...VALID_TRACK, id: '1234567890' })).toThrow(/11-char/));
  it('rejects a 12-char id', () => expect(() => validateTrack({ ...VALID_TRACK, id: '123456789012' })).toThrow(/11-char/));
  it('rejects id with illegal chars', () => expect(() => validateTrack({ ...VALID_TRACK, id: 'dQw4w9WgX!Q' })).toThrow(/11-char/));
  it('rejects non-string title', () => expect(() => validateTrack({ ...VALID_TRACK, title: 42 })).toThrow(/title/));
  it('rejects non-string artist', () => expect(() => validateTrack({ ...VALID_TRACK, artist: null })).toThrow(/artist/));
  it('accepts empty string title', () => expect(() => validateTrack({ ...VALID_TRACK, title: '' })).not.toThrow());
  it('accepts id with underscores and hyphens', () => expect(() => validateTrack({ ...VALID_TRACK, id: 'dQw4w9Wg-cQ' })).not.toThrow());
});

describe('validatePlaylist', () => {
  it('accepts a valid playlist', () => expect(() => validatePlaylist(VALID_PLAYLIST)).not.toThrow());
  it('rejects null', () => expect(() => validatePlaylist(null)).toThrow());
  it('rejects non-string title', () => expect(() => validatePlaylist({ ...VALID_PLAYLIST, title: 1 })).toThrow(/title/));
  it('rejects non-string color', () => expect(() => validatePlaylist({ ...VALID_PLAYLIST, color: true })).toThrow(/color/));
  it('rejects non-array tracks', () => expect(() => validatePlaylist({ ...VALID_PLAYLIST, tracks: 'oops' })).toThrow(/tracks/));
  it('rejects more than 12 tracks', () => {
    const tracks = Array.from({ length: 13 }, (_, i) => ({ ...VALID_TRACK, id: `dQw4w9WgXc${i % 10}` }));
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, tracks })).toThrow(/12/);
  });
  it('propagates inner track errors with index', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, tracks: [{ id: 'bad', title: '', artist: '' }] }))
      .toThrow(/track\[0\]/);
  });
  it('accepts optional created as string', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, created: '2026-01-01' })).not.toThrow();
  });
  it('rejects non-string created', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, created: 20260101 })).toThrow(/created/);
  });
  it('accepts optional location with lat/lng numbers', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, location: { lat: 45.5, lng: -122.6 } })).not.toThrow();
  });
  it('rejects location with non-numeric lat', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, location: { lat: '45', lng: -122.6 } })).toThrow(/lat/);
  });
  it('rejects location with missing lng', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, location: { lat: 45.5 } })).toThrow(/lng/);
  });
  it('accepts empty tracks array', () => {
    expect(() => validatePlaylist({ ...VALID_PLAYLIST, tracks: [] })).not.toThrow();
  });
});

describe('validateIndex', () => {
  it('accepts a valid index', () => expect(() => validateIndex(VALID_INDEX)).not.toThrow());
  it('rejects null', () => expect(() => validateIndex(null)).toThrow());
  it('rejects non-string active', () => expect(() => validateIndex({ active: 1, ids: [] })).toThrow(/active/));
  it('rejects non-array ids', () => expect(() => validateIndex({ active: '1', ids: '[]' })).toThrow(/ids/));
  it('rejects ids array containing a non-string', () => {
    expect(() => validateIndex({ active: '1', ids: ['a', 2, 'b'] })).toThrow(/ids\[1\]/);
  });
  it('accepts empty ids array', () => expect(() => validateIndex({ active: '', ids: [] })).not.toThrow());
});
