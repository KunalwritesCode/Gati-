/* Gati service worker. The precache list and version are filled in by scripts/postbuild.mjs. */
const VERSION = '__GATI_VERSION__';
const PRECACHE = '__GATI_PRECACHE__';
const SHELL = `gati-shell-${VERSION}`;
const DATA = 'gati-data';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gati-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // AI answers are never cached

  // Timetable JSON: network first so updates arrive, cached copy when offline.
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(DATA).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || Response.error())),
    );
    return;
  }

  // App navigation: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true }).then((r) => r || caches.match('./', { ignoreVary: true }))),
    );
    return;
  }

  // Hashed assets, icons, fonts: cache first.
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./#/');
    }),
  );
});
