import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

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

export default defineConfig(/** @type {import('vitest/config').UserConfig} */ ({
  plugins: [serveRootFiles()],
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
