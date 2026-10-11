// Service worker — makes the app installable and lets its shell (HTML/JS/CSS/fonts)
// load instantly and survive a flaky connection. School data is never cached here:
// /api/ requests always go straight to the network, so nobody sees stale fees or
// attendance, and nothing about students is left on the device.

// Bumping this name makes the next activation delete every older cache. v1
// cached /icons/ cache-first under fixed filenames, so devices kept showing an
// icon after it was replaced — icons are no longer cached here at all.
const CACHE = 'madrasah-shell-v3';
// Shown on the Madaaris page's notifications card, to tell which copy a phone is running.
const VERSION = 'v4';
// A note of the last notification message this phone received (read by the notifications card).
const LOG = 'suhuf-push-log';

// Saving the home page is a nice-to-have: if it fails (a weak signal), the update still goes
// ahead — otherwise the phone would stay on the old copy of this file.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add('/')).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('message', event => {
  if (event.data === 'version' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== LOG).map(k => caches.delete(k))))
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

// Notifications for the platform owner (a madrasah signed up — server/notify.js). Tapping one
// opens the page it's about (the Madaaris page), reusing an open app window if there is one.
// A notification must always be shown, or Chrome puts up its own empty one instead.
const logPush = entry => caches.open(LOG)
  .then(c => c.put('/__push-log', new Response(JSON.stringify({ at: new Date().toISOString(), ...entry }))))
  .catch(() => {});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { try { data = { body: event.data.text() }; } catch { data = {}; } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Suhuf', {
      body: data.body || '', icon: '/icons/book-192.png', data: { url: data.url || '/madaaris' },
      tag: 'suhuf-signup', renotify: true, vibrate: [200, 100, 200],
    })
      .then(() => logPush({ shown: true, title: data.title || '' }))
      .catch(err => logPush({ shown: false, error: String(err && err.message || err) })
        .then(() => self.registration.showNotification('Suhuf', { body: data.body || '' })))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
