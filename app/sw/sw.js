const BUILD = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const CACHE = `stingr-${BUILD}`;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  // No skipWaiting here: a new version waits until the app says no form is open.
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hub')) return; // always network
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(r => r || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
