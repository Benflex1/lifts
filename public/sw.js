// PROD-06: postprocess-web-export.mjs fills these with a content-versioned
// snapshot of the public export, including HTML and every lazy bundle asset.
const CACHE_PREFIX = 'lifts-shell-';
const CACHE_VERSION = 'lifts-shell-unbuilt';
const PRECACHE_URLS = [];
const SHELL_URL = '/index.html';

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      if (!PRECACHE_URLS.includes(SHELL_URL))
        throw new Error('Missing web export precache manifest');
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll(
          PRECACHE_URLS.map(
            path => new Request(new URL(path, self.location.origin), { cache: 'reload' }),
          ),
        );
      } catch (error) {
        await caches.delete(CACHE_VERSION);
        throw error;
      }
      // Keep updates waiting until existing clients close. Replacing a running
      // client's shell/cache would mix assets from different releases.
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map(key => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only handle the app entry points and the exported public assets. API and
  // other origin data never enter the shell cache.
  const shellNavigation =
    request.mode === 'navigate' && (url.pathname === '/' || url.pathname === SHELL_URL);
  const path = shellNavigation ? SHELL_URL : url.pathname;
  if (!shellNavigation && (url.search || !PRECACHE_URLS.includes(path))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(path);
      // Serve the HTML and assets from the same completed install. Fetching
      // newer HTML here could reference chunks absent from this release.
      return cached || fetch(request);
    })(),
  );
});
