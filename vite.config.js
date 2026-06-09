import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { computeCacheVersion, buildPrecacheList, patchServiceWorker } from './src/sw-build.js';

const SERVER_PORT = process.env.VITE_SERVER_PORT || '8080';
const SERVER_TARGET = `http://localhost:${SERVER_PORT}`;

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
          const examplePath = path.resolve(__dirname, 'config.example.js');
          if (fs.existsSync(examplePath)) {
            console.warn('[listen] config.js not found — serving config.example.js. Copy it to config.js to get started.');
            res.setHeader('Content-Type', 'application/javascript');
            res.end(fs.readFileSync(examplePath));
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
  plugins: [serveRootFiles(), swCacheVersion()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/save-config': SERVER_TARGET,
      '/save-index': SERVER_TARGET,
      '/save-playlist': SERVER_TARGET,
      '/delete-playlist': SERVER_TARGET,
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
