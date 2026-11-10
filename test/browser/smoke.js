// Browser check of the whole site: node --test test/browser/smoke.js
// Serves the repository, answers every outside request with a small stand-in (no real network),
// and walks through the pages in headless Chromium. It catches what the unit tests cannot see:
// a script or style the Content-Security-Policy blocks, a script error on a tab, the header
// layout, the UTC switch, the page opening with no network, and link text running as code.
// Needs Playwright (CI installs it, see .github/workflows/ci.yml). SHOTS=<dir> saves screenshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const NOW = Date.now(), H = 3600000, RIGA_OFFSET = 2 * H;
const iso = ms => new Date(ms).toISOString();
const local = ms => new Date(ms + RIGA_OFFSET).toISOString().slice(0, 16);
// The cloud map library comes from a CDN on demand; the test serves it from node_modules when
// it is installed there, so its workers and WebAssembly run under the policy too
const CLOUD_LIB = (() => {
  for (const dir of require.resolve.paths('playwright') || []) {
    const file = path.join(dir, '@openmeteo', 'weather-map-layer', 'dist', 'index.js');
    if (fs.existsSync(file)) return file;
  }
  return null;
})();

// ─── Stand-ins for the outside services ─────────────────────────────────────
function forecast(q) {
  const models = (q.get('models') || 'ecmwf_ifs025').split(',');
  const hv = (q.get('hourly') || '').split(',').filter(Boolean), dv = (q.get('daily') || '').split(',').filter(Boolean);
  const d = new Date(NOW + RIGA_OFFSET), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - RIGA_OFFSET;
  const days = +(q.get('forecast_days') || 16), past = +(q.get('past_days') || 0);
  const time = Array.from({ length: (days + past) * 24 }, (_, i) => local(day0 - past * 24 * H + i * H));
  const dtime = Array.from({ length: days + past }, (_, k) => local(day0 + (k - past) * 24 * H).slice(0, 10));
  const sfx = (v, m) => models.length > 1 ? v + '_' + m : v;
  const hourly = { time }, daily = { time: dtime };
  models.forEach((m, mi) => {
    // Precipitation every hour and varying snowfall, so every precipitation type shows
    const pr = i => +(1.2 + Math.sin(i / 5)).toFixed(1), tp = i => +(1 + 4 * Math.sin(i / 9 + mi * 0.3)).toFixed(1);
    hv.forEach(v => { hourly[sfx(v, m)] = time.map((_, i) => v === 'weather_code' ? 3 : v === 'precipitation' ? pr(i) : v === 'temperature_2m' ? tp(i) : v === 'snowfall' ? [pr(i) * 0.7, pr(i) * 0.3, 0][Math.floor(i / 6) % 3] : +(5 + 4 * Math.sin(i / 4 + mi)).toFixed(1)); });
    dv.forEach(v => { daily[sfx(v, m)] = dtime.map(day => v === 'sunrise' ? day + 'T07:31' : v === 'sunset' ? day + 'T16:42' : v === 'weather_code' ? 3 : 8); });
  });
  const out = { utc_offset_seconds: RIGA_OFFSET / 1000, timezone: 'Europe/Riga', hourly, daily };
  if (q.get('current')) out.current = Object.fromEntries(q.get('current').split(',').map(v => [v, v === 'weather_code' ? 3 : 5]));
  return out;
}
const hourStart = Math.floor(NOW / H) * H;
const lvc = Array.from({ length: 6 }, (_, i) => ({ id: 'L' + i, name: 'A' + i + ' Stacija', lat: 56.9 + i * 0.05, lon: 24.0 + i * 0.05, time: iso(NOW - 10 * 60000), airTemp: 5 + i, surfaceTemp: 4, roadCondition: 'dry', windSpeed: 3, windDir: 200, nightMin: 1, dayMax: 9 }));
// Hourly LVĢMC history, pressure falling 0.6 hPa an hour: 1.8 hPa in 3 h
const history = Array.from({ length: 48 }, (_, h) => ({ time: local(hourStart - (47 - h) * H) + ':00', airTemp: +(5 + Math.sin(h / 4)).toFixed(1), minTemp: 4, maxTemp: 6, windSpeed: 3, windDir: 180, humidity: 80, pressure: +(1040 - h * 0.6).toFixed(1) }));
const lvgmc = Array.from({ length: 4 }, (_, i) => ({ id: 'G' + i, name: 'Stacija ' + i, lat: 56.95 + i * 0.1, lon: 24.1 + i * 0.1, history }));
const ring = [[56.7, 23.6], [57.3, 23.6], [57.3, 24.8], [56.7, 24.8], [56.7, 23.6]];
const warnings = { fetchedAt: iso(NOW), ok: true, alerts: [{ identifier: 'w1', areaDesc: 'Riga', event: 'Yellow Wind Warning', severity: 'Moderate', onset: iso(NOW - H), expires: iso(NOW + 9 * H), polygons: [ring] }] };
const runs = { fetchedAt: iso(NOW), ok: true, models: { ecmwf_ifs025: Math.floor((NOW - 2 * H) / 1000) }, inits: { ecmwf_ifs025: Math.floor((NOW - 8 * H) / 1000) } };
const home = { ok: true, updated: iso(NOW), next: iso(NOW + 15 * 60000), lvc: { updated: iso(NOW), stations: lvc }, lvgmc: { fetchedAt: iso(NOW), ok: true, stations: lvgmc }, warnings, runs };
const hydro = { fetchedAt: iso(NOW), ok: true, parameters: { LIMEN: { lv: 'Līmenis', en: 'Level', unit: 'cm' } }, stations: [{ id: 'H1', name: 'Upe', lat: 56.9, lon: 24.2, series: { LIMEN: [[iso(NOW - H), 100], [iso(NOW), 101]] } }] };
const marine = kind => ({ fetchedAt: iso(NOW), ok: true, kind, points: [{ lat: 57.1, lon: 24.0, series: [[iso(NOW), 0.5], [iso(NOW + H), 0.6]] }, { lat: 57.3, lon: 23.5, series: [[iso(NOW), 0.4], [iso(NOW + H), 0.5]] }] });
const aurora = { fetchedAt: iso(NOW), ok: true, readings: Array.from({ length: 8 }, (_, i) => ({ time: iso(NOW - (8 - i) * 3 * H), kp: 2 + i % 3 })) };

// Every host the pages may talk to (the same list as in their Content-Security-Policy)
const TILE_HOSTS = /(^|\.)rainviewer\.com$|^server\.arcgisonline\.com$|\.tile\.openstreetmap\.org$|\.tile\.opentopomap\.org$/;
function answer(u) {
  const url = new URL(u), q = url.searchParams, h = url.hostname;
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  if (h === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@openmeteo/')) return CLOUD_LIB ? { path: CLOUD_LIB, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } } : { status: 404, body: '' };
  if (h === 'api.open-meteo.com') return json(forecast(q));
  if (h === 'air-quality-api.open-meteo.com') { const t = Array.from({ length: 96 }, (_, i) => Math.floor(NOW / 1000) + i * 3600); return json({ hourly: Object.fromEntries([['time', t], ...(q.get('hourly') || '').split(',').map(v => [v, t.map(() => 12)])]) }); }
  if (h === 'archive-api.open-meteo.com') { const t = Array.from({ length: 800 }, (_, i) => new Date(Date.UTC(1990, 0, 1) + i * 86400000 * 15).toISOString().slice(0, 10)); return json({ daily: { time: t, temperature_2m_mean: t.map((_, i) => 6 + Math.sin(i)) } }); }
  if (h === 'geocoding-api.open-meteo.com') return json({ results: [{ name: 'Rīga', latitude: 56.95, longitude: 24.1, country: 'Latvija', admin1: 'Rīga' }] });
  if (h === 'nominatim.openstreetmap.org') return json({ address: { city: 'Rīga', country: 'Latvija' } });
  if (h === 'lvc-meteo-proxy.jkedainis.workers.dev') {
    const d = q.get('data');
    if (d === 'home') return json(home);
    if (d === 'lvgmc') return json({ fetchedAt: iso(NOW), ok: true, stations: lvgmc });
    if (d === 'warnings') return json(warnings);
    if (d === 'hydro') return json(hydro);
    if (d === 'aurora') return json(aurora);
    if (d && d.startsWith('marine-')) return json(marine(d.slice(7)));
    if (q.get('station')) return json({ station: q.get('station'), history: Array.from({ length: 96 }, (_, k) => ({ time: iso(NOW - (95 - k) * 900000), airTemp: 5, surfaceTemp: 4, windSpeed: 3 })) });
    return json({ updated: iso(NOW), stations: lvc });
  }
  if (h === 'api.rainviewer.com') { const t = Math.floor(NOW / 600000) * 600; return json({ version: '2.0', generated: t, host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 4 }, (_, i) => ({ time: t - (3 - i) * 600, path: '/v2/radar/' + (t - (3 - i) * 600) })) } }); }
  if (h === 'openmeteo.s3.amazonaws.com') return json({ reference_time: iso(NOW - 3 * H), valid_times: Array.from({ length: 6 }, (_, i) => iso(NOW + i * H)), variables: ['cloud_cover'] });
  if (h === 'view.eumetsat.int') return q.get('request') === 'GetCapabilities'
    ? { status: 200, contentType: 'text/xml', body: '<WMS_Capabilities><Layer><Name>msg_fes:ir108</Name><Dimension name="time">' + iso(NOW - H) + '/' + iso(NOW) + '/PT15M</Dimension></Layer></WMS_Capabilities>' }
    : { status: 200, contentType: 'image/png', body: PNG };
  if (h === 'embed.windy.com' || h === 'embed.ventusky.com') return { status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title><p>embed</p>' };
  if (TILE_HOSTS.test(h)) return { status: 200, contentType: 'image/png', body: PNG };
  return null;
}

// ─── The site itself, from the repository ───────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  res.end(fs.readFileSync(file));
});

let browser, base;
test.before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + server.address().port;
  browser = await chromium.launch();
});
test.after(async () => { await browser?.close(); server.close(); });

// A fresh browser profile with the stand-ins in place; collects what went wrong on its pages
async function profile({ width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, geolocation: { latitude: 56.9496487, longitude: 24.1051846 }, permissions: ['geolocation'] });
  const seen = { csp: [], errors: [], injected: [], unknownHosts: new Set(), offline: false, exactPosition: false };
  await ctx.addInitScript(() => {
    window.__csp = []; window.__workers = 0;
    const W = window.Worker; window.Worker = function (...a) { window.__workers++; return new W(...a); }; window.Worker.prototype = W.prototype;
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.effectiveDirective + ' ' + (e.blockedURI || 'inline')));
  });
  await ctx.route(u => !u.href.startsWith(base), route => {
    // The stand-ins answer without a network, so "offline" has to cut them off too
    if (seen.offline) return route.abort('internetdisconnected');
    if (/56\.9496|24\.1051/.test(route.request().url())) seen.exactPosition = true;
    const reply = answer(route.request().url());
    if (!reply) { seen.unknownHosts.add(new URL(route.request().url()).host); return route.fulfill({ status: 404, body: '' }); }
    return route.fulfill(reply);
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => seen.errors.push(e.message));
  page.on('console', m => { if (m.text().includes('INJECTED')) seen.injected.push(m.text()); });
  page.on('popup', p => p.close());
  // Violations are kept per document: collect them before leaving a page
  const collect = async () => { seen.csp.push(...await page.evaluate(() => window.__csp.splice(0))); };
  const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
  return { ctx, page, seen, collect, shot, wait: ms => page.waitForTimeout(ms) };
}
const HOME = '/index.html?lat=56.95&lon=24.1&city=R%C4%ABga&country=Latvija';
const forecastReady = page => page.waitForFunction(() => typeof S !== 'undefined' && Object.keys(S.data).length > 0 && !!document.getElementById('heroSun')?.textContent.trim(), null, { timeout: 15000 });

test('every view loads: no script errors, nothing blocked by the policy, no unknown hosts', async () => {
  const { ctx, page, seen, collect, shot, wait } = await profile();
  await page.goto(base + HOME);
  await forecastReady(page);
  for (const tab of ['temp', 'precip', 'wind', 'cloud', 'uv', 'table', 'climate', 'about', 'radar', 'environment']) {
    await page.evaluate(t => switchTab(t), tab);
    await wait(700);
  }
  for (const kind of ['air', 'warnings', 'hydro', 'marine', 'aurora']) { await page.evaluate(k => document.querySelector(`[data-env="${k}"]`)?.click(), kind); await wait(700); }
  await page.evaluate(() => { switchTab('wind'); document.getElementById('windMapToggle')?.click(); });
  await wait(700);
  assert.match(await page.evaluate(() => document.querySelector('#windMapEmbed iframe')?.getAttribute('sandbox') || ''), /allow-scripts/, 'the wind map frame is sandboxed');
  // The cloud model map starts workers and WebAssembly from the CDN library
  if (CLOUD_LIB) {
    await page.evaluate(() => { switchTab('cloud'); document.getElementById('cloudMapToggle')?.click(); });
    await wait(1500);
    await page.evaluate(() => document.getElementById('cloudForecast')?.click());
    await page.waitForFunction(() => window.__workers > 0, null, { timeout: 15000 });
  }
  await page.evaluate(() => switchTab('today'));
  await page.fill('#cityInput', 'Rīg');
  await page.click('#searchBtn');
  await wait(800);
  await page.click('#locateBtn');
  // The exact position (56.9496487, 24.1051846) stays in the browser: about 1 km goes out
  await page.waitForFunction(() => new URLSearchParams(location.search).get('lon') === '24.11', null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('lat')), '56.95', 'rounded position in the address');
  assert.equal(seen.exactPosition, false, 'the exact position was sent to another server');
  await shot('today');
  await collect();
  for (const p of ['/stacija.html?id=L0&lat=56.95&lon=24.1&name=A0', '/stacija-lvgmc.html?id=G0&lat=56.95&lon=24.1&name=Stacija']) {
    await page.goto(base + p);
    await wait(1500);
    await shot(p.split('?')[0].slice(1));
    await collect();
  }
  assert.deepEqual(seen.errors, [], 'script errors');
  assert.deepEqual(seen.csp, [], 'blocked by the Content-Security-Policy');
  assert.deepEqual([...seen.unknownHosts], [], 'requests to hosts the site does not use');
  await ctx.close();
});

test('the policy blocks an injected handler and a request to an unlisted host', async () => {
  const { ctx, page, seen, collect, wait } = await profile();
  await page.goto(base + HOME);
  await forecastReady(page);
  await collect();
  seen.csp.length = 0;
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:image/png;base64,iVBORw0KGgo=" onerror="console.log(\'INJECTED control\')">';
    document.body.append(d);
    fetch('https://not-allowed.example/x').catch(() => {});
  });
  await wait(600);
  await collect();
  assert.deepEqual(seen.injected, [], 'the injected handler must not run');
  assert.ok(seen.csp.some(v => v.startsWith('script-src')), 'inline handler reported: ' + seen.csp);
  assert.ok(seen.csp.some(v => v.startsWith('connect-src')), 'unlisted host reported: ' + seen.csp);
  await ctx.close();
});

test('names from a shared link are shown as text, never run', async () => {
  const { ctx, page, seen, wait } = await profile();
  const evil = encodeURIComponent('<img src=x onerror="console.log(\'INJECTED name\')">');
  await page.goto(base + '/index.html?lat=56.95&lon=24.1&country=Latvija&city=' + evil);
  await forecastReady(page);
  await page.evaluate(() => { switchTab('environment'); document.querySelector('[data-env="warnings"]')?.click(); });
  await wait(1200);
  await page.evaluate(() => environmentMap?.eachLayer(l => { if (l.getTooltip && l.getTooltip()) l.openTooltip(); }));
  await page.evaluate(() => switchTab('radar'));
  await wait(800);
  for (const p of ['/stacija.html?id=L0&lat=56.95&lon=24.1&name=', '/stacija-lvgmc.html?id=G0&lat=56.95&lon=24.1&name=']) {
    await page.goto(base + p + evil);
    await wait(1500);
    await page.evaluate(() => _miniMap?.eachLayer(l => { if (l.getTooltip && l.getTooltip()) l.openTooltip(); }));
    assert.equal(await page.evaluate(() => document.querySelectorAll('img[src="x"]').length), 0, 'the name became an element on ' + p);
  }
  assert.deepEqual(seen.injected, []);
  await ctx.close();
});

test('header buttons stay together at the right edge; UTC switches the clock times', async () => {
  for (const width of [1920, 1280, 390]) {
    const { ctx, page, shot } = await profile({ width, height: 800 });
    for (const p of [HOME, '/stacija-lvgmc.html?id=G0&lat=56.95&lon=24.1&name=Stacija']) {
      await page.goto(base + p);
      await page.waitForSelector('#utcToggle');
      const box = await page.evaluate(() => {
        const r = id => document.getElementById(id).getBoundingClientRect();
        return { utc: r('utcToggle'), lang: r('langToggle'), theme: r('themeToggle'), width: innerWidth, scroll: document.documentElement.scrollWidth };
      });
      const where = `${p.split('?')[0]} at ${width}px`;
      assert.ok(box.width - box.theme.right <= 32, 'theme button at the right edge, ' + where);
      assert.ok(box.lang.left - box.utc.right <= 16 && box.theme.left - box.lang.right <= 16, 'the three buttons side by side, ' + where);
      assert.ok(Math.abs(box.utc.top - box.theme.top) < 2, 'on one line, ' + where);
      assert.ok(box.scroll <= box.width, 'no sideways scroll, ' + where);
    }
    if (width === 390) await shot('header-390');
    await ctx.close();
  }
  const { ctx, page } = await profile();
  await page.goto(base + HOME);
  await forecastReady(page);
  const sun = () => page.evaluate(() => document.getElementById('heroSun').textContent);
  const localSun = await sun();
  await page.click('#utcToggle');
  await page.waitForFunction(() => document.getElementById('utcToggle').getAttribute('aria-pressed') === 'true');
  const utcSun = await sun();
  assert.notEqual(utcSun, localSun, 'sunrise and sunset change with the UTC button');
  assert.match(utcSun, /05:31/, 'Riga 07:31 is 05:31 UTC');
  await ctx.close();
});

test('station pressure with its 3 h tendency, and warning areas on the radar map', async () => {
  const { ctx, page, seen, shot, wait } = await profile();
  await page.goto(base + HOME);
  await forecastReady(page);
  await page.waitForFunction(() => !document.getElementById('nowStation').hidden);
  assert.match(await page.evaluate(() => document.getElementById('nowStation').textContent), /hPa \(krītas\)/, 'nearest station line names the tendency');
  await page.evaluate(() => switchTab('radar'));
  await page.waitForFunction(() => typeof R !== 'undefined' && R.warnCount === 1 && document.querySelectorAll('#stBody tr').length > 0, null, { timeout: 15000 });
  const state = await page.evaluate(() => ({
    warnButton: !document.getElementById('radarToggleWarn').hidden,
    areas: R.warnLayer.getLayers().length,
    presColumn: getComputedStyle(document.querySelector('#stationTable .st-col-pres')).display !== 'none',
    presCell: [...document.querySelectorAll('#stBody tr')].find(tr => tr.dataset.key.startsWith('lvgmc:'))?.querySelector('.st-c-pres')?.textContent || '',
    presArrow: !!document.querySelector('#stBody .st-c-pres .st-trend.is-down'),
  }));
  assert.deepEqual({ warnButton: state.warnButton, areas: state.areas, presColumn: state.presColumn, presArrow: state.presArrow }, { warnButton: true, areas: 1, presColumn: true, presArrow: true });
  assert.match(state.presCell, /^1\d{3}[.,]\d$/, 'pressure in the table: ' + state.presCell);
  await shot('radar');
  // Pressure on the map, then the warnings layer off
  await page.click('#radarMetric [data-metric="pres"]');
  await wait(400);
  assert.ok(await page.evaluate(() => !!document.querySelector('.st-marker.is-lvgmc .st-badge .st-tend.is-down')), 'falling pressure arrow on a station badge');
  await shot('radar-pressure');
  await page.click('#radarToggleWarn');
  assert.equal(await page.evaluate(() => _rMap.hasLayer(R.warnLayer)), false);
  // Only LVĢMC stations: the road columns go
  await page.click('#radarToggleLvc');
  await wait(300);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#stationTable .st-col-road')).display), 'none');
  await shot('radar-lvgmc-only');
  await page.goto(base + '/stacija-lvgmc.html?id=G0&lat=56.95&lon=24.1&name=Stacija');
  await page.waitForFunction(() => /hPa/.test(document.getElementById('dPresTend')?.textContent || ''));
  assert.match(await page.evaluate(() => document.getElementById('dPresTend').textContent), /1[.,]8 hPa, krītas/);
  assert.deepEqual(seen.errors, []);
  await ctx.close();
  // On a phone the map buttons stay inside the map
  const phone = await profile({ width: 390, height: 844 });
  await phone.page.goto(base + HOME + '#tab-radar');
  await phone.page.waitForFunction(() => typeof R !== 'undefined' && R.warnCount === 1, null, { timeout: 15000 });
  const bar = await phone.page.evaluate(() => {
    // Nothing may reach under the zoom buttons at the top right
    const zoom = document.querySelector('#radarMap .leaflet-control-zoom').getBoundingClientRect();
    return [...document.querySelectorAll('#radarBar button:not([hidden])')].filter(b => b.getBoundingClientRect().right > zoom.left - 2).map(b => b.textContent.trim());
  });
  if (SHOTS) await phone.page.locator('#radarStage').screenshot({ path: path.join(SHOTS, 'radar-390.png') });
  assert.deepEqual(bar, [], 'map buttons under the zoom buttons on a phone');
  await phone.ctx.close();
});

test('with no network the page opens from the saved copy and shows the last forecast', async () => {
  const { ctx, page, seen, shot } = await profile();
  await page.goto(base + HOME);
  await forecastReady(page);
  // The service worker has saved the page, its scripts, the libraries and the font
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  // Two hours pass: the saved forecast is due for a refresh, which now fails
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(k => k.startsWith('wx10_'))) {
      const c = JSON.parse(localStorage.getItem(key));
      if (!c || !c.models) continue;
      for (const m of Object.values(c.models)) m.at -= 2 * 3600000;
      if (c.now) c.now.at -= 2 * 3600000;
      localStorage.setItem(key, JSON.stringify(c));
    }
  });
  seen.offline = true;
  await ctx.setOffline(true);
  await page.reload();
  await forecastReady(page);
  const state = await page.evaluate(() => ({
    chart: typeof Chart === 'function', map: typeof L === 'object',
    toast: document.getElementById('toast')?.textContent || '',
    font: [...document.fonts].some(f => f.family.includes('IBM Plex Mono') && f.status === 'loaded'),
  }));
  assert.deepEqual({ chart: state.chart, map: state.map, font: state.font }, { chart: true, map: true, font: true });
  assert.match(state.toast, /Nav savienojuma\. Rāda prognozi, kas saglabāta pirms 2 h/);
  await page.evaluate(() => switchTab('temp'));
  await page.waitForFunction(() => !!Chart.getChart('cT'));
  await shot('offline');
  assert.deepEqual(seen.errors, []);
  await ctx.close();
});
