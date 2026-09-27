// Service worker: estáticos stale-while-revalidate, datos network-first (con respaldo offline).
const VERSION = 'v3';
const STATIC = `ipes-static-${VERSION}`;
const DATA = 'ipes-data';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/styles.css', 'assets/js/app.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/brand/logo-pons-ip.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(DATA).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // stale-while-revalidate: respuesta inmediata desde caché y actualización en segundo plano
  e.respondWith(
    caches.open(STATIC).then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});
