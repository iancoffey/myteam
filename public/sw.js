// Offline support: pages are network-first with a cached fallback, so a page opened once
// (the team's field mode, say) still loads at a field with no signal. Build assets are cache-first.
const CACHE = 'myteam-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
            return res
          }),
      ),
    )
    return
  }

  const isPage = req.mode === 'navigate'
  const isRsc = req.headers.get('RSC') === '1'
  if (!isPage && !isRsc) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            new Response('<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px"><h1>No signal</h1><p>Open this page once while online and it will work offline after that.</p>', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
        ),
      ),
  )
})
