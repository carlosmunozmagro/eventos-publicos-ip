// Service worker.
//  - Páginas (navegación): red primero, caché solo sin conexión → el HTML siempre es el último publicado.
//  - CSS/JS/imágenes: stale-while-revalidate. index.html los pide con ?v=VERSION, así un HTML nuevo nunca
//    se combina con CSS/JS antiguos. Al publicar cambios en CSS/JS sube VERSION aquí y el ?v= de index.html.
//  - data/*.json: red primero (con respaldo offline).
const VERSION = 'v12';
const STATIC = `ipes-static-${VERSION}`;
const DATA = 'ipes-data';
const ASSETS = [
  './', 'manifest.webmanifest',
  `assets/css/styles.css?v=${VERSION.slice(1)}`, `assets/js/app.js?v=${VERSION.slice(1)}`, `assets/js/informe.js?v=${VERSION.slice(1)}`,
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/brand/logo-pons-ip.svg',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita que se guarden copias viejas de la caché HTTP del navegador
  e.waitUntil(
    caches.open(STATIC)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())   // app.js recarga la página al detectar el cambio de versión
  );
});

const redPrimero = (req, cache) =>
  fetch(req, { cache: 'no-cache' })
    .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(cache).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then((hit) => hit || caches.match('./')));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (e.request.mode === 'navigate') return e.respondWith(redPrimero(e.request, STATIC));
  if (url.pathname.includes('/data/')) return e.respondWith(redPrimero(e.request, DATA));

  // stale-while-revalidate: respuesta inmediata desde caché y actualización en segundo plano
  e.respondWith(
    caches.open(STATIC).then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});
