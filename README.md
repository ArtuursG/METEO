# prognoze.lv - Weather Forecast Model Comparison

Free meteorological forecast site displaying **14 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

### Forecast charts
- Shared **48 h / 7 days / 14 days+** period switch above each chart, defaulting to 7 days. Hourly views begin at the current forecast-local hour; extended views use the available model horizon.
- **Model picker** on the temperature, precipitation and wind charts: chips for the models on the chart (they double as the legend, × removes one) and a "+N modeļi" panel listing every model with its organisation, resolution and horizon, plus Visi / Neviens / Noklusējums. The choice is remembered per chart; models outside their coverage for the chosen place are shown greyed out.

- **Temperature** - by default the median of all models (thick line), the spread band and two models (ECMWF IFS, ICON-EU); any of the 14 models can be added
- **Model spread band** - shaded range between the coldest and warmest of all models at each hour, drawn behind the lines; a verdict with a status dot next to the title ("Modeļi vienisprātis" / "daļēji atšķiras" / "Liela nenoteiktība", ± half the average spread over the next 48 h). Median and band are toggles in the picker, saved to localStorage
- **Precipitation** - hourly precipitation in mm; switches between bar chart (single model) and line chart (multi-model)
- **Precipitation probability** - hourly %; follows the same model selection as the precipitation (mm) chart, skipping models that do not provide it
- **Wind speed** - 10m wind speed, multi-model comparison; toggle between **m/s and km/h** (default m/s)
- **Cloud cover** - hourly cloud cover (%) for the next 5 days; single model, colour-coded bars (clear -> overcast). Below the chart, an on-demand **cloud map** combining real satellite imagery with a model forecast in one sat24-style timeline: the past ~2 h are actual [EUMETSAT](https://www.eumetsat.int) satellite frames (free, no key), the future (up to 5 days, hourly then 3-hourly) is gridded DWD ICON cloud cover via [Open-Meteo's weather-map-layer](https://github.com/open-meteo/weather-map-layer) - the same model compared elsewhere on the site. One slider/play control spans both; satellite frames are dark at night (visible-light channel, no infrared fallback yet). No API key, no background preloading - the map, its ~2.9 MB rendering library and the satellite tiles only load after "Show cloud map" is pressed
- **UV index** - hourly UV index starting from the current hour, next 5 days; colour-coded bars (Low -> Extreme); ECMWF IFS primary, GFS fallback
- **Crosshair** - vertical dashed line follows the cursor across all charts for precise value reading

### Daily forecast table
- Day-by-day summary: weather icon, max/min temperature as coloured pills, precipitation with a small bar, precipitation probability, max wind, cloud cover, humidity. On phones the date column stays in place while the table scrolls sideways
- Switchable between ECMWF IFS, ICON-EU and MET Norway

### Today (Šodien tab and the block above the tabs)
- Current conditions in one block: temperature, weather, feels like, wind with direction and gusts, today's min..max, today's precipitation and humidity, with the source model and data age
- A one or two sentence summary computed from all models (median and how many models agree): when precipitation starts or stops, rain or snow, the day and night temperatures and whether tomorrow is warmer or cooler. Wording hedges ("iespējams lietus") when models disagree
- A status dot for model agreement (temperature spread and how many models show precipitation)
- The nearest LVĢMC station reading when one is within 25 km and less than 90 minutes old
- Hourly strip for the next 24 hours (median temperature, icon from cloud cover and precipitation with a moon at night, chance of precipitation, precipitation bars) and a daily list for up to 10 days with the median min..max on a shared scale and the full model spread behind it
- Sunrise, sunset and the moon phase under the city name

### Climate (Klimats tab)
- **Today's temperature anomaly** vs the 1991-2020 normal for this calendar date (day-of-year climatology, ±7-day smoothed)
- **Warming stripes** - annual mean temperature 1940-present as a strip of blue→red bars (Ed Hawkins style), colour scale centred on the 1961-1990 mean; hover a year for its value
- Latest complete year vs the 1961-1990 average
- Source: **ERA5 reanalysis** via the [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api) (free, no key). Lazy-loaded on first tab open; the ~85 years of daily means are reduced client-side to a small structure and cached in localStorage for a week

### Precipitation radar
- **RainViewer** observed radar frames (the past ~2 hours at 10-minute steps). The free RainViewer tier has had no nowcast since 1 January 2026, so the timeline shows observations only
- The frame list refreshes every 5 minutes while the radar is on screen; the view stays on the newest frame, or on the same time if you had moved back
- Every frame is loaded up front as its own hidden tile layer, so playback switches instantly without blank frames; the status line counts frames until all are loaded
- Shared timeline over the bottom of the map (also in full screen): play/pause, previous/next, a slider with one tick per frame, "Jaunākais", 0,5×/1×/2× speed and the age of the latest frame. Works from the keyboard
- One bar on the map toggles precipitation and the two station networks and chooses what station labels show: air temperature, road temperature, wind or precipitation. A settings button holds the base map (follows the site theme by default, or OSM, relief, satellite) and radar opacity. Choices are remembered
- Word-only precipitation legend (light, moderate, heavy)
- Playback stops when leaving the radar tab or hiding the page; Leaflet maps are created only when a map view is opened

### Weather stations (Radar tab)
- **LVC road weather stations** ([transportdata.gov.lv](https://www.transportdata.gov.lv), CC0) - air/road-surface temperature, humidity, precipitation, wind, road condition
- **LVĢMC meteorological stations** ([data.gov.lv](https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi), CC0) - air/apparent temperature, wind, humidity, pressure, precipitation, visibility, UV index
- Station labels never overlap: the selected station, the one nearest the chosen place and the current extremes keep a label, the rest become small temperature-coloured dots until you zoom in
- One table for both networks: search by name, Visas / LVC / LVĢMC filter, "only stations visible on the map", the 10 nearest by default with "Rādīt visas". Columns: temperature pill, road temperature, wind arrow, precipitation bar, humidity, road condition tag and a 24 h min..max bar. Stale stations are marked
- Clicking a row highlights the station on the map and opens its popup; the station name links to the detail page with 24h/48h charts. LVĢMC popups include a 24 h temperature sparkline
- On phones the table becomes a card list

### Model accuracy (Modeļi tab)
- Select individual models directly in the comparison table; station observations remain visible

- Ranks the 14 models by how close their recent temperature has been to the **nearest LVĢMC station's** measured air temperature over the past 48 h
- Table of mean absolute error (MAE), signed bias and sample count per model; best model highlighted; a chart overlays the observed series against the top three models
- Uses each model's latest analysis / short-range values (`past_days=2` on the forecast API) at the station's coordinates - this is recent model skill near you, not "the forecast as it was issued two days ago"
- Lazy-loaded on tab open; recomputes when the location changes

### Interactive wind maps
- The Wind tab includes official [Windy](https://embed.windy.com/config/map) and [Ventusky](https://my.ventusky.com/de/guide/howto/how-to-use-embed-iframe-version-of-ventusky-21/) embeds, centered on the selected location. These are provider-hosted visualizations, not raw data APIs.
- Nothing loads until the user opens a map. Only one provider frame exists at a time; closing it, changing location or leaving the tab removes the frame.
- Map forecast time and model are independent from the comparison chart. Windy starts in m/s; Ventusky units and language follow browser settings. Attribution and provider controls remain visible.

### Environmental data (Vide tab)
- Air quality and seasonal pollen share one Open-Meteo/CAMS request per rounded location, cached for one hour. Values are model estimates, not local station observations.
- Latvian MeteoAlarm warning snapshots show affected regions and expiry times. CAP polygons match the selected coordinates to a compact home banner, ordered by severity. Expired warnings are excluded; missing data never implies an all-clear. Source wording is preserved.
- LVĢMC hydrological stations include a map, parameter selection and up to 48 hourly readings. Water levels use the source station reference; near-bottom temperatures are labelled explicitly.
- LVĢMC marine forecasts show wave height, water temperature and current speed on a Leaflet point map. Separate source grids are preserved. A touch-friendly hourly slider and point chart support 48 hours, 7 days (default) and up to 9 days. This is a bounded sample, not a continuous raster or bathing-water measurement. Each layer loads one small shared JSON file, cached in the browser for an hour. Changing time or point makes no forecast request.
- NOAA SWPC planetary Kp observations provide geomagnetic context, not a local aurora probability.
- Environmental layers load only when the relevant view is opened; the compact local-warning banner also loads the shared warning snapshot on location selection. Concurrent identical requests share a promise; failures have a 60-second cooldown. Persistent cache holds at most 12 entries.
- Deployment builds shared warning/hydrology/Kp JSON snapshots with 5 total source requests. Marine snapshots add 3 filtered requests, skipped while the cached snapshots are less than 4 hours old. Scheduled deployment runs at minutes 17 and 47, independent of visitor count. GitHub scheduling can be delayed; the UI displays snapshot and observation times and flags stale snapshots. This is not a real-time alert service.
- Last successful snapshots are retained using the deployment cache if a source fails. Generated files are not committed. Run `python scripts/build_public_data.py` once for local testing.
- Public Open-Meteo endpoints are for non-commercial use within their free limits. Source attribution is shown in each view.

### City search
- **Auto-geolocation** on page load - requests GPS permission immediately; shows "Pašreizējā atrašanās vieta" and starts loading at once; Nominatim reverse-geocoding resolves the city name in the background
- **Live autocomplete** - suggestions appear as you type (300ms debounce, min 2 chars, single active request via AbortController)
- Browser **geolocation** button also available in the search bar
- **Saved locations** - a star next to the city name pins the current location; pinned places appear as a row of buttons under the city name (one tap to switch) and above the recent list in the search dropdown (with an unpin ✕). Stored in localStorage (`fav_cities`), no extra requests
- **Recent search history** - last 5 cities shown when search is focused and empty (localStorage)
- Shareable URLs - location encoded in query params (`?lat=&lon=&city=&country=`); shared links skip auto-geolocation

### Share
- WhatsApp and Telegram share buttons with pre-filled city name and current URL

### UI / Theme / Language
- Light and dark theme (saved to localStorage, applied before page render to avoid flash)
- **Latvian / English** toggle in the header. Language comes from `?lang=` > localStorage > `lv`; switching updates the URL and re-renders the whole UI live (no reload). Dates, weekdays and the compass follow the locale (Z/A/D/R ↔ N/E/S/W)
- **Five sections** instead of ten tabs: Šodien (overview, table), Grafiki (temperature, precipitation, wind, clouds, UV), Radars, Vide, Vairāk (climate, model accuracy and site info). Sections with several views get a second row of tabs; arrow keys move along both rows
- The open view is kept in the address (`#radar`, `#temp` ...) and in localStorage for the next visit; old `#tab-radar` links from the station pages still open the radar
- Fully **mobile responsive**; on phones the five sections sit in a bar at the bottom of the screen (with safe-area padding for phones without a home button)
- External scripts load with `defer`, so the page is drawn before Chart.js and Leaflet arrive
- Installable on iOS/Android via "Add to Home Screen"; runs fullscreen without browser chrome; app shell cached offline

---

## Models

| # | Model | Organization | Resolution | Days |
|---|-------|-------------|-----------|------|
| 1 | ECMWF IFS | ECMWF (EU) | 9 km | 10 |
| 2 | ECMWF AIFS | ECMWF - AI model | 25 km | 10 |
| 3 | GFS | NOAA (USA) | 13 km | 16 |
| 4 | ICON (global) | DWD (Germany) | 11 km | 7 |
| 5 | ICON-EU | DWD (Germany) | 7 km | 5 |
| 6 | GEM | Canadian Weather Service | 15 km | 10 |
| 7 | UKMO | Met Office (UK) | 10 km | 7 |
| 8 | MET Norway | MET Norway | 1 km | 10 |
| 9 | Meteo-France | Meteo-France | 1.5 km | 4 |
| 10 | ARPEGE Europe | Meteo-France | 10 km | 4 |
| 11 | JMA | JMA (Japan) | 13 km | 11 |
| 12 | CMA GRAPES | CMA (China) | 15 km | 10 |
| 13 | HARMONIE NL | KNMI (Netherlands) | 2.5 km | 2 |
| 14 | HARMONIE DK | DMI (Denmark) | 2 km | 3 |

All 14 models cover Latvia. ICON-EU and MET Norway are default models for the precipitation and wind charts. ECMWF IFS is the primary source for current conditions and UV index. Regional models (HARMONIE NL, HARMONIE DK) are skipped automatically for cities outside their geographic coverage.

---

## Stack

- **HTML / CSS / JavaScript** - no framework, no build tools
- **[Chart.js 4.4.1](https://www.chartjs.org/)** - interactive charts (CDN, SRI integrity hash)
- **[Leaflet 1.9.4](https://leafletjs.com/)** - interactive radar map (CDN, SRI integrity hash)
- **[Open-Meteo API](https://open-meteo.com/)** - free meteorological data (CC BY 4.0), no API key required
- **[Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api)** - ERA5 reanalysis (1940-present) for the Climate tab, no API key required
- **[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)** - city search with live autocomplete
- **[Nominatim](https://nominatim.openstreetmap.org/)** - reverse geocoding for browser geolocation
- **[RainViewer](https://www.rainviewer.com/api.html)** - free precipitation radar tiles, no API key required
- **[Esri ArcGIS Online](https://server.arcgisonline.com/), OpenStreetMap, OpenTopoMap** - selectable base map tiles, no API key required (Esri Gray Canvas for the light/dark styles)
- **[transportdata.gov.lv](https://www.transportdata.gov.lv)** - LVC road weather station data (DATEX II XML), CC0, requires an API key
- **[data.gov.lv](https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi)** - LVĢMC meteorological station data (CSV), CC0, no API key required
- **Cloudflare Workers + [D1](https://developers.cloudflare.com/d1/)** - proxy the two station data sources (CORS, and for LVC, secret storage and history accumulation - see `cloudflare-worker/`)
- **GitHub Pages** - free static hosting via GitHub Actions

## Architecture

```
index.html                            - structure and markup ([data-i18n] attributes on static text)
style.css                             - CSS custom properties for light/dark theme, responsive layout
sw.js                                 - service worker for PWA offline caching (stays at root for scope)
manifest.json                         - PWA manifest (name, icons, display mode)
favicon.svg                           - inline SVG icon (sun + cloud)
apple-touch-icon.png                  - 180x180 PNG icon for iOS home screen

js/                                   - all application logic, plain sequential <script> tags (no bundler)
  i18n.js       - lv/en string tables, t(), setLang(), applyStaticI18n()
  pure.js       - side-effect-free helpers (tempCls, wKey, haversineKm, stripeColor,
                  processClimate, compassIndex, moonPhaseFrac); also require()-able from Node
  core.js       - MODELS, state (S), utils ($, round, cssVar...), cache, URL state
  weather.js    - wind direction, weather icons/text, date formatting
  charts.js     - model toggle buttons, Chart.js defaults, every forecast chart, the forecast table
  climate.js    - Climate tab (ERA5 anomaly + warming stripes) and model verification
  data.js       - current-conditions metrics, combined multi-model fetch, load pipeline
  locations.js  - city search, theme, saved/recent places, share, geolocation
  forecast-summary.js - model consensus for the Today view (pure, tested)
  today.js      - Today view: summary sentence, agreement, nearest station, hourly strip, daily list
  radar.js      - RainViewer radar map, LVC + LVĢMC station networks, station table
  timeline.js   - shared map timeline (radar and cloud map)
  map-utils.js  - map helpers: full screen control, tick positions, badge declutter
  app.js        - tab switching, language re-render (relangUI), init
  stacija.js / stacija-lvgmc.js - the two standalone station detail pages (own scripts)

test/pure.test.js                     - node:test unit tests for js/pure.js (npm test)
.github/workflows/ci.yml              - syntax-check + unit tests on every push / PR

Load order matters: each file's top-level code only references names from files loaded before it;
cross-file calls that happen at runtime (tab clicks, language switch) can point anywhere.

stacija.html / stacija-lvgmc.html     - LVC / LVĢMC station detail pages

cloudflare-worker/
  lvc-meteo-proxy.js    - parses the LVC DATEX II feed, accumulates history in D1 on a Cron Trigger
  lvgmc-meteo-proxy.js  - fetches/parses the LVĢMC CSV, no D1 needed (source keeps its own 48h window)
  schema.sql            - D1 table definitions for lvc-meteo-proxy
  wrangler.toml / wrangler-lvgmc.toml - Worker deploy config
```

### Key implementation details

- **Caching** - the combined API response is cached in localStorage for 1 hour, keyed by coordinates. Prefix `wx7_` - bumped when API request parameters change to invalidate stale data. `S.dataTs` carries the fetch (or cache-write) time so the "Dati atjaunoti" label is honest even when served from cache.
- **Single combined request** - all 14 models are fetched in one Open-Meteo call (`models=` comma-separated). Each variable comes back suffixed per model; a model outside its geographic coverage is simply absent from the response and skipped. No per-model fallback cascade is needed.
- **UV index** - hourly `uv_index` variable requested for all models; ECMWF IFS is the primary source, GFS is the fallback. Models that return an array of nulls (unsupported variable) are skipped - a plain array existence check is insufficient.
- **Cloud cover** - hourly `cloud_cover` variable, shown for 5 days. Colour-coded bars: sky blue (clear) -> dark slate (overcast).
- **Cloud map** (`js/cloud-map.js`) - lazy: pressing "Show cloud map" fetches the DWD ICON grid metadata (`.../data_spatial/dwd_icon/latest.json`, gives the `valid_times` forecast frame list) in parallel with the SRI-pinned `@openmeteo/weather-map-layer` CDN script. The combined timeline is `[...satellite frames, ...model frames]`, one array of `{time, kind}` walked by a single slider - same shape as the radar frames, and played by the same timeline component.
  - **Satellite (past)** - [EUMETSAT EUMETView WMS](https://view.eumetsat.int/geoserver/wms), layer `msg_fes:vis006` (visible-light channel), no API key. 8 frames at its native 15-minute step (~2 h), computed client-side (`Date.now()` floored to the grid, one step of safety margin) rather than queried - the server's `nearestValue=1` WMS time dimension snaps to the closest actual scene regardless. `L.tileLayer.wms(...,{crs:L.CRS.EPSG4326,time})`: the layer only serves EPSG:4326, Leaflet reprojects per tile automatically.
  - **Model (future)** - `om://.../latest.json?time_step=valid_times_N&variable=cloud_cover`, one tile layer per forecast hour.
  - Every frame is a **freshly built tile layer swapped in** (`layer.addTo(map)` then remove the previous one) rather than mutated in place - neither the WMS layer nor the om adapter's tile layer exposes a `setUrl`-equivalent, same constraint the radar frame-swap already works around.
  - Base map is Esri Gray Canvas, matching the rest of the site (not the CARTO basemap from the library's own examples, which now requires an API key). Closing the tab pauses playback but keeps the built map/library/frames cached for an instant reopen.
- **Moon phase** - computed client-side using a reference new moon (Jan 6 2000 18:14 UTC) and the 29.53-day synodic cycle. Rendered as a monochrome SVG using two SVG arcs: an outer semicircle (the lit hemisphere boundary) and an elliptical terminator arc whose sweep direction flips between crescent and gibbous phases.
- **Auto-geolocation** - on load without URL coords, `getCurrentPosition` is called immediately. Loading starts with a placeholder city name; Nominatim resolves the real name in the background without blocking data fetch. If geolocation is denied or times out (5 s), falls back to the default location (Rīga).
- **Wind units** - API requested with `wind_speed_unit=ms`; conversion to km/h done client-side when selected. Preference saved in localStorage.
- **Live autocomplete** - 300ms debounce on input + `AbortController` ensures max 1 active geocoding request regardless of typing speed.
- **Crosshair plugin** - custom Chart.js plugin registered globally via `Chart.register()`; draws a vertical dashed line at the hovered x position using `chartArea` bounds.
- **Radar** (`js/radar.js`, `js/timeline.js`, `js/map-utils.js`) - Leaflet map created on first tab open. One RainViewer tile layer per frame lives in a dedicated pane above the base map; frames are switched by opacity. Radar tiles are capped at `maxNativeZoom: 6` (Leaflet upscales closer views). The shared timeline component in `js/timeline.js` drives both the radar and the cloud map; its pure helpers (tick positions, speed steps, keeping the position on refresh) are unit tested. Badge decluttering is a pure function in `js/map-utils.js` (tested in `test/declutter.test.js`).
- **LVC weather stations** - the live DATEX II feed only exposes ~30 min of history, so a Cloudflare Worker on a 15-min Cron Trigger parses it and accumulates readings in D1; the site reads the accumulated 24h window from D1 instead of hitting the feed directly. The API key is a Cloudflare Secret, never present in any committed file or client-side code.
- **LVĢMC weather stations** - the public CSV already carries a 48h rolling window, so no database is needed; a Worker fetches/parses it and serves it through Cloudflare's Cache API (10 min TTL) purely to add CORS headers, since the source doesn't send them. Precipitation-only gauge stations (no temperature sensor) are filtered out of the table/map, matching how other public displays of this data handle them.
- **Service worker** - HTML uses network-first (new deploys load immediately); JS/CSS uses stale-while-revalidate (cached version served instantly, new version fetched in background and ready on next load).
- **No flash of wrong theme** - small inline `<script>` in `<head>` reads saved theme and sets `data-theme` before stylesheet loads.
- **XSS prevention** - city search results and all API-returned strings use `textContent` instead of `innerHTML`. Tile URLs are hardcoded templates with no user input.
- **Accessibility** - the tab bar is a proper ARIA `tablist` with roving tabindex and Left/Right/Home/End keyboard navigation; panels are `tabpanel`s. Model toggle buttons expose `aria-pressed`. A skip link jumps to `<main>`. `prefers-reduced-motion` zeroes chart animations and CSS transitions (the loading spinner is kept). Chart `<canvas>` elements carry `role="img"` + `aria-label`.
- **i18n** - static text uses `data-i18n*` attributes resolved by `applyStaticI18n()`; dynamic strings go through `t(key, vars)`. `setLang()` swaps `LANG`/`LOCALE`, updates the URL and calls `relangUI()`, which re-renders every JS-built piece (metrics, charts, tables, model list, lazy tabs, station rows). The two station detail pages load `js/i18n.js` and honour the same stored language (they have no toggle of their own). Radar and station controls are relabelled on a language switch by `relabelRadarControl()`.
- **Failed reload** - a forecast fetch that fails mid-session keeps the previous location's data on screen, shows a toast and reverts the header, rather than blanking the page.

---

## Local setup

```bash
git clone https://github.com/ArtuursG/METEO.git
cd METEO
# Open with Live Server (VS Code) or any local server
```

> Open with a local server - direct `file://` access may block API requests due to CORS.

## Install as app (iOS / Android)

1. Open the site in **Safari** (iOS) or **Chrome** (Android)
2. Tap **Share -> Add to Home Screen**
3. Tap **Add**

The app opens fullscreen without browser chrome and works offline for the app shell.

---

Data: [Open-Meteo](https://open-meteo.com) - License: CC BY 4.0 · Radar: [RainViewer](https://www.rainviewer.com) · Road weather: [LVC / transportdata.gov.lv](https://www.transportdata.gov.lv) (CC0) · Weather stations: [LVĢMC / data.gov.lv](https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi) (CC0)
