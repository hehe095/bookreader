/* BookReader service worker — cache everything on install so the app works
   offline (and without the Mac) from the second launch onward. */
const CACHE = 'bookreader-v2';
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

/* The app is one self-contained HTML file, so its freshness is the whole app's
   freshness: network first, cache only when the network fails. A cache-first
   shell would pin the installed app to whatever was deployed the day it was
   installed — which is exactly how a shipped fix never reaches a phone. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

/* Everything else — icons, the ONNX runtime from the CDN, the model files in a
   dev build — is immutable or huge, so serve it from cache and quietly refresh
   it in the background for next time. */
async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) {
    fetch(request).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
    }).catch(() => {});
    return hit;
  }
  const res = await fetch(request);
  if (res && res.ok) {
    const c = await caches.open(CACHE);
    c.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req));
    return;
  }
  const url = new URL(req.url);
  if (url.origin === self.location.origin || url.hostname.endsWith('jsdelivr.net')) {
    event.respondWith(cacheFirst(req).catch(() => caches.match('./index.html')));
  }
});
