// Keeps the game's pictures and code on the phone (director: 'please wait' too long). Built files under assets/ carry a
// content hash in their name, so a cached copy is always right: serve it from the phone and never ask the server again.
// The page itself (index.html) always comes from the network, so a new version shows at once.
const CACHE = 'mc-assets-1', MAX = 1200;   // more entries than ~3 versions of the game: start the cache over
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin || !u.pathname.includes('/assets/')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req); if (hit) return hit;
    const r = await fetch(req);
    if (r.ok && r.type === 'basic') {
      const copy = r.clone();
      c.keys().then(k => k.length > MAX ? caches.delete(CACHE) : c.put(req, copy)).catch(() => {});
    }
    return r;
  }));
});
