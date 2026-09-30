// Service worker — makes the app installable and lets its shell (HTML/JS/CSS/fonts)
// load instantly and survive a flaky connection. School data is never cached here:
// /api/ requests always go straight to the network, so nobody sees stale fees or
// attendance, and nothing about students is left on the device.

// Bumping this name makes the next activation delete every older cache. v1
// cached /icons/ cache-first under fixed filenames, so devices kept showing an
// icon after it was replaced — icons are no longer cached here at all.
const CACHE = 'madrasah-shell-v2';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Page loads: network first so a new deploy shows up straight away, falling back
  // to the cached shell when offline (every route is the same SPA index.html).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return res; })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Build assets (content-hashed filenames, so a cached copy is never stale),
  // fonts and Google Fonts: cache first, fill the cache on first use. Icons are
  // left to the network — they can change under the same URL.
  const cacheable =
    (url.origin === self.location.origin && /^\/(static|fonts)\//.test(url.pathname)) ||
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
