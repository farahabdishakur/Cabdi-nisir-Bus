/*
 * Cabdinasir Bus — service worker (offline).
 * - /_next/static/* : cache-first (faylal aan isbeddelin)
 * - bogagga (navigation): network-first → haddii internet-ku go'o, nuqulkii ugu dambeeyay
 * - /api/* : WEligiis lama kaydiyo (xog lacageed — had iyo jeer server-ka)
 */
const VERSION = 'cb-v2';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(['/', '/parcels/new', '/offline']).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }

  // RSC payload (bogag la dhex maro client-side) — network-first, offline: nuqulkii hore
  if (url.searchParams.has('_rsc') || e.request.headers.get('RSC') === '1') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(e.request)) || Response.error()),
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(e.request)) || (await caches.match('/offline')) || Response.error()),
    );
  }
});
