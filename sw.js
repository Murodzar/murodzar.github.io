const CACHE = 'murodgold-v1';
const SHELL = [
  '/',
  '/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Supabase va Telegram API ga cache qilmaymiz
  if (url.hostname.includes('supabase') ||
      url.hostname.includes('telegram') ||
      url.hostname.includes('googleapis') ||
      e.request.method !== 'GET') {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Admin panelni yangilash
        if (res.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
