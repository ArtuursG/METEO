const CACHE = 'prognoze-v11';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './style.css?v=11',
  './js/i18n.js',
  './js/pure.js',
  './js/core.js',
  './js/weather.js',
  './js/charts.js',
  './js/climate.js',
  './js/data.js',
  './js/locations.js',
  './js/radar.js',
  './js/app.js',
  './js/forecast-range.js',
  './js/forecast-controls.js',
  './js/map-controls.js',
  './js/radar-timeline.js',
  './favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('prognoze-') && k !== CACHE).map(k => caches.delete(k)))
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
          // Clone synchronously before caches.open() - body can't be cloned after respondWith streams it
          if (r.ok) { const clone = r.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
          return r;
        })
        .catch(async () => (await caches.match(e.request)) || (await caches.match(new URL('./index.html',self.registration.scope).href)) || Response.error())
    );
    return;
  }

  // JS/CSS: stale-while-revalidate - serve cache, update in background
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
