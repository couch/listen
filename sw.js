const CACHE = 'muxtape-bf999e0d';

// Resources to pre-cache on install (the HTML shell + bundled assets)
const PRECACHE = ["/","/config.js","/assets/admin-CYMK5Ljs.css","/assets/main-7lOxHyoJ.css","/assets/admin-BRtsp4fF.js","/assets/main-BpEOPMzc.js","/assets/ids-CNKnrzPe.js","/assets/pride-canvas-K0KFr0V9.js","/assets/rain-DhpqPOri.js","/assets/aurora-BvmAJdz5.js","/assets/ink-BYAmqE4j.js","/assets/incense-CHjlh9YB.js","/assets/scope-DHdmko1B.js","/assets/stars-q912TddG.js","/assets/topo-CyNuF8j4.js","/assets/caustics-C2c1R5ow.js","/assets/kaleido-C0ZmyZE2.js","/assets/disco-BH19BT5r.js","/admin.html","/embed.html"];

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
