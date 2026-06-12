const CACHE = 'muxtape-a11ab0b8';

// Resources to pre-cache on install (the HTML shell + bundled assets)
const PRECACHE = ["/","/config.js","/assets/admin-BOng-muC.css","/assets/main-7lOxHyoJ.css","/assets/admin-C7GeHkes.js","/assets/main-BjUTBfvI.js","/assets/ids-Bf9IBoiG.js","/assets/pride-canvas-C3sgW9gv.js","/assets/rain-CIrjRL2j.js","/assets/aurora-SAHP__iG.js","/assets/ink-BDKfwBfs.js","/assets/incense-YeCWnuYi.js","/assets/scope-CLsYFuRl.js","/assets/stars-Ctv8pnCb.js","/assets/topo-BO8cwHHx.js","/assets/caustics-CYqboYMO.js","/assets/kaleido-eTm1BPjZ.js","/assets/disco-gLM6FIGr.js","/admin.html","/embed.html"];

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
