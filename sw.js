/* Offline cache — stale-while-revalidate: serves from cache instantly, then
 * refreshes in the background. Bump CACHE together with version.json + APP_VERSION. */
const CACHE = 'cbt-v4';
const ASSETS = [
  './', './index.html', './style.css',
  './js/storage.js', './js/game.js', './js/stats.js', './js/ready.js', './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if (new URL(e.request.url).pathname.endsWith('/version.json')) return; // network-only
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request);
    const fetching = fetch(e.request).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || fetching;
  }));
});
