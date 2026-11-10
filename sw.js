const CACHE = 'prognoze-v54';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './style.css?v=54',
  './js/i18n.js',
  './js/pure.js',
  './js/chart-time.js',
  './js/core.js',
  './js/weather.js',
  './js/charts.js',
  './js/model-skill.js',
  './js/climate.js',
  './js/forecast-summary.js',
  './js/road-ice.js',
  './js/forecast-change.js',
  './js/today.js',
  './js/forecast-sync.js',
  './js/data.js',
  './js/locations.js',
  './js/radar.js',
  './js/app.js',
  './js/data-cache.js',
  './js/environment.js',
  './js/marine.js',
  './js/wind-map.js',
  './js/local-warnings.js',
  './js/forecast-range.js',
  './js/forecast-controls.js',
  './js/map-utils.js',
  './js/timeline.js',
  './js/cloud-map.js',
  './favicon.svg',
  // Libraries and the font from the site's own folder, so the page opens without a network
  './vendor/chart.umd.js?v=4.4.1',
  './vendor/leaflet.js?v=1.9.4',
  './vendor/leaflet.css?v=1.9.4',
  './vendor/fonts/plex-mono-latin-400.woff2',
  './vendor/fonts/plex-mono-latin-500.woff2',
  './vendor/fonts/plex-mono-latin-600.woff2',
  './vendor/fonts/plex-mono-latin-ext-400.woff2',
  './vendor/fonts/plex-mono-latin-ext-500.woff2',
  './vendor/fonts/plex-mono-latin-ext-600.woff2',
].map(path=>path.startsWith('./js/')?path+'?v=54':path);

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
  // Let provider embeds and cross-origin resources use their native loading flow.
  if(e.request.destination==='iframe'||new URL(url).origin!==self.location.origin)return;

  // Bypass cache entirely for API calls
  if (url.includes('api.open-meteo.com') ||
      url.includes('geocoding-api.open-meteo.com') ||
      url.includes('nominatim.openstreetmap.org')) {
    return;
  }

  // HTML: network-first so new deploys load immediately. Saved once per page, without the
  // query (?lat=..&city=..), so visiting many places does not pile up copies of the same page
  if (e.request.mode === 'navigate') {
    const page = new URL(url); page.search = ''; page.hash = '';
    e.respondWith(
      fetch(e.request)
        .then(r => {
          // Clone synchronously before caches.open() - body can't be cloned after respondWith streams it
          if (r.ok) { const clone = r.clone(); caches.open(CACHE).then(c => c.put(page.href, clone)); }
          return r;
        })
        .catch(async () => (await caches.match(page.href)) || (await caches.match(new URL('./index.html',self.registration.scope).href)) || Response.error())
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
