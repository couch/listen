const CACHE = 'muxtape-34e7948e';

// Resources to pre-cache on install (the HTML shell + bundled assets)
const PRECACHE = ["/","/config.js","/assets/admin-CvZ0XNs_.css","/assets/main-DEWPGw-M.css","/assets/admin-C_V4sjOB.js","/assets/main-CI7Q_N02.js","/assets/ids-C-tL2VXR.js","/assets/pride-canvas-BI52h9dE.js","/assets/rain-DlyBeqlC.js","/assets/aurora-nt2K5NFn.js","/assets/ink-CItkSfc3.js","/assets/incense-6XGL4kTy.js","/assets/scope-BDK-vtEB.js","/assets/stars-0tySgQtg.js","/assets/topo-MINfC4Gc.js","/assets/caustics-CKPfbqkf.js","/assets/kaleido-D9iQv-6J.js","/assets/disco-BXvYA4gI.js","/embed.html","/admin.html"];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first: config.js and playlists/ (always want fresh data)
  if (url.pathname === '/config.js' || url.pathname.startsWith('/playlists/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first: JS/CSS bundles and other static assets (sw.js excluded — must be fetched fresh for updates)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // HTML shell — network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
});
