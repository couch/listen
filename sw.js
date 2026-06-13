const CACHE = 'muxtape-3d55f50e';

// Resources to pre-cache on install (the HTML shell + bundled assets)
const PRECACHE = ["/","/config.js","/assets/admin-4uJWwwo8.css","/assets/main-DEiA-UN2.css","/assets/admin-8d5Kt5Xd.js","/assets/main-DplLC4XF.js","/assets/ids-C-tL2VXR.js","/assets/pride-canvas-BI52h9dE.js","/assets/rain-OpMoUnOJ.js","/assets/aurora-CHEeoXJt.js","/assets/ink-DGLi3VgA.js","/assets/incense-CyopPsb9.js","/assets/scope-CwHh5itw.js","/assets/stars-yiKG1n58.js","/assets/topo-E8OBtAhe.js","/assets/caustics-C3CkRC0V.js","/assets/kaleido-BP_L7jYA.js","/assets/disco-C4WuTdSN.js","/embed.html","/admin.html"];

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
