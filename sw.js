/* BookReader service worker — cache everything on install so the app works
   offline (and without the Mac) from the second launch onward. */
const CACHE = 'bookreader-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-512.png',
  // dev-build only; the single-file build embeds these in index.html and
  // these URLs 404 — add individually so one miss cannot fail the install.
  'models/det.onnx',
  'models/rec.onnx',
  'models/dict.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const asset of ASSETS) {
        try { await cache.add(asset); } catch (e) { /* optional asset */ }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Cache-first for everything we ship; network-first for the CDN runtime so
   updates can land, but the cached copy keeps the app alive offline. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      }))
    );
    return;
  }

  // onnxruntime-web CDN files
  if (url.hostname.endsWith('jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      }).catch(() => hit))
    );
  }
});
