// PROD-06: runtime-caching service worker for the exported web shell.
//
// - Navigations are network-first with a cached index.html fallback, so a
//   previously opened app reloads offline.
// - Hashed Metro bundle assets are cache-first (their names change per build).
// - Only same-origin GET requests are handled.
//
// Bump CACHE_VERSION when the caching strategy changes; old caches are removed
// on activate.

const CACHE_VERSION = 'lifts-shell-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(SHELL_URL, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(SHELL_URL);
          if (cached) return cached;
          throw new Error('Offline and no cached app shell');
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
