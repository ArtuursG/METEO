const CACHE = 'prognoze-v3';
const SHELL = [
  '/METEO/',
  '/METEO/index.html',
  '/METEO/style.css',
  '/METEO/app.js',
  '/METEO/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Bypass cache entirely for API calls
  if (url.includes('api.open-meteo.com') ||
      url.includes('geocoding-api.open-meteo.com') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    return;
  }

  // HTML: network-first so new deploys load immediately
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // JS/CSS: stale-while-revalidate — serve cache, update in background
  if (url.endsWith('.js') || url.endsWith('.css')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Other shell assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
