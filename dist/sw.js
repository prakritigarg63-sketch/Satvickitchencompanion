// Satvic Kitchen Companion: offline support.
// Bump VERSION whenever the precache list changes; old caches are cleared on activate.
const VERSION = 'satvic-v4';
const SHELL = [
  './', 'index.html', 'style.css', 'editorial.css', 'sprout.css', 'cursor.css', 'app.js', 'masthead.js', 'sprout.js', 'credits.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'assets/cursor/leaf-cursor.png', 'assets/cursor/leaf-cursor@2x.png',
  'assets/sprout/body.png', 'assets/sprout/arm.png', 'assets/sprout/leaves.png', 'assets/sprout/eye-left.png', 'assets/sprout/eye-right.png', 'assets/sprout/full.png',
  // The hero and the default three meals, so the first screen works offline right away.
  'assets/hero.jpg', 'assets/khichdi.jpg', 'assets/chickpea.jpg', 'assets/soup.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === location.origin) {
    // Photos rarely change: serve from cache, and keep each one the first time it is seen.
    if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) event.respondWith(cacheFirst(request));
    // Pages, styles and scripts: always try for the latest, fall back to the saved copy offline.
    else event.respondWith(networkFirst(request));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
