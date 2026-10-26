/* digiovanni.dev offline cache.
   Stale-while-revalidate for same-origin files: after one visit the site opens
   instantly from the device, even on poor signal, and refreshes in the background.
   Bump VERSION when shipping changes so old caches are cleared. */
const VERSION = 'ocean-v3';
const CORE = [
  './', 'index.html', 'css/ocean.css', 'js/main.js', 'js/water.js', 'js/life.js',
  'assets/img/favicon-48.png', 'assets/img/qr.svg', 'assets/anthony-di-giovanni.vcf',
  'assets/img/gallaudet.png', 'assets/img/cad.png', 'assets/img/dwave.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    if (cached) { event.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
