import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { computeCacheVersion, buildPrecacheList, patchServiceWorker } from './src/sw-build.js';
import { buildLocalTape, localAudioType } from './src/local-tape.js';

// Custom plugin: during dev, serve /config.js and /playlists/* from the project root
// (they live there because server.py writes to them and are not in public/)
function serveRootFiles() {
  return {
    name: 'serve-root-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];

        // /config.js
        if (url === '/config.js') {
          const filePath = path.resolve(__dirname, 'config.js');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }

        // /playlists/...
        if (url.startsWith('/playlists/')) {
          const filePath = path.resolve(__dirname, url.slice(1));
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }

        next();
      });
    },
  };
}

// Dev-only local tape: drop audio files into local-audio/ (gitignored) and
// open /?tape=local. The playlist JSON is generated from the directory
// listing; the files are served with Range support (without 206 responses
// browsers treat media as unseekable). Registered after serveRootFiles so a
// real playlists/local.json on disk would win.
function serveLocalTape() {
  const dir = path.resolve(__dirname, 'local-audio');
  return {
    name: 'serve-local-tape',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let url;
        try { url = decodeURIComponent(req.url.split('?')[0]); } catch { next(); return; }

        if (url === '/playlists/local.json') {
          const names = fs.existsSync(dir)
            ? fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name)
            : [];
          const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
          const tape = buildLocalTape(names, origin);
          if (!tape.tracks.length) { next(); return; } // empty dir → ordinary 404, player keeps its tape
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(tape));
          return;
        }

        if (url.startsWith('/local-audio/')) {
          const filePath = path.join(dir, url.slice('/local-audio/'.length));
          // stay inside the directory (no traversal), files only
          if (path.dirname(filePath) !== dir || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            next();
            return;
          }
          const size = fs.statSync(filePath).size;
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', localAudioType(filePath));
          const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
          if (m) {
            const start = Number(m[1]);
            const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', end - start + 1);
            fs.createReadStream(filePath, { start, end }).pipe(res);
          } else {
            res.setHeader('Content-Length', size);
            fs.createReadStream(filePath).pipe(res);
          }
          return;
        }

        next();
      });
    },
  };
}

function swCacheVersion() {
  return {
    name: 'sw-cache-version',
    writeBundle(options, bundle) {
      const keys = Object.keys(bundle);
      const version = computeCacheVersion(keys);
      const precache = buildPrecacheList(keys);
      const swPath = path.join(options.dir, 'sw.js');
      if (fs.existsSync(swPath)) {
        const patched = patchServiceWorker(fs.readFileSync(swPath, 'utf-8'), version, precache);
        fs.writeFileSync(swPath, patched);
      }
    },
  };
}

export default defineConfig(/** @type {import('vitest/config').UserConfig} */ ({
  plugins: [serveRootFiles(), serveLocalTape(), swCacheVersion()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/save-config': 'http://localhost:8080',
      '/save-index': 'http://localhost:8080',
      '/save-playlist': 'http://localhost:8080',
      '/delete-playlist': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        embed: 'embed.html',
      },
    },
  },
  test: {
    environment: 'node',
  },
}));
