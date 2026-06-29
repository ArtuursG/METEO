const CACHE = 'prognoze-v2';
const SHELL = [
  '/METEO/',
  '/METEO/index.html',
  '/METEO/style.css',
  '/METEO/app.js',
  '/METEO/favicon.svg',
];

// Cache the app shell on install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API calls bypass the cache — handled by localStorage in app.js
  const url = e.request.url;
  if (url.includes('api.open-meteo.com') ||
      url.includes('geocoding-api.open-meteo.com') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    return;
  }
  // App shell: cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
