# prognoze.lv - Weather Forecast Model Comparison

Free meteorological forecast site displaying **14 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

### Forecast charts
- **Temperature** - hourly 2m temperature for up to 16 days, all 14 models overlaid on one chart; toggle each model on/off
- **Model spread band** - shaded range between the coldest and warmest model at each hour, drawn behind the lines; a one-line verdict ("modeļi lielā mērā vienojas" / "vidēja izkliede" / "liela nenoteiktība") averages the next 48 h. Toggleable, preference saved to localStorage
- **Precipitation** - hourly precipitation in mm; switches between bar chart (single model) and line chart (multi-model)
- **Precipitation probability** - hourly %; follows the same model selection as the precipitation (mm) chart, skipping models that do not provide it
- **Wind speed** - 10m wind speed, multi-model comparison; toggle between **m/s and km/h** (default m/s)
- **Cloud cover** - hourly cloud cover (%) for the next 5 days; single model, colour-coded bars (clear -> overcast)
- **UV index** - hourly UV index starting from the current hour, next 5 days; colour-coded bars (Low -> Extreme); ECMWF IFS primary, GFS fallback
- **Crosshair** - vertical dashed line follows the cursor across all charts for precise value reading

### Daily forecast table
- Day-by-day summary: max/min temperature, precipitation, precipitation probability, max wind, cloud cover, humidity
- Switchable between ECMWF IFS, ICON-EU and MET Norway

### Current conditions (metrics row)
- Temperature, feels like (apparent temperature), today's max/min
- Wind speed with **rotating direction arrow** and 16-point compass label (Latvian: Z/A/D/R = N/E/S/W), plus wind gusts
- Humidity and current precipitation (with snowfall in cm when it is snowing)
- Sunrise and sunset times with **moon phase icon** (monochrome SVG, pure math - no API call)
- All metrics sourced from ECMWF IFS (falls back to first available model)
- "Dati atjaunoti pirms N min" reflects the actual fetch time (or cache write time when served from cache), not the page render time

### Climate (Klimats tab)
- **Today's temperature anomaly** vs the 1991-2020 normal for this calendar date (day-of-year climatology, ±7-day smoothed)
- **Warming stripes** - annual mean temperature 1940-present as a strip of blue→red bars (Ed Hawkins style), colour scale centred on the 1961-1990 mean; hover a year for its value
- Latest complete year vs the 1961-1990 average
- Source: **ERA5 reanalysis** via the [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api) (free, no key). Lazy-loaded on first tab open; the ~85 years of daily means are reduced client-side to a small structure and cached in localStorage for a week

### Precipitation radar
- Interactive **RainViewer** radar map with past observations and short-range nowcast
- Scrubber slider through frames, or play as animation
- 5 selectable base maps (light, dark, OpenStreetMap, topographic, satellite) plus toggleable overlay layers, all via a Leaflet layer control
- Lazy-initialised - Leaflet only loads when the Radar tab is opened

### Weather stations (Radar tab)
- **LVC road weather stations** (68 stations, [transportdata.gov.lv](https://www.transportdata.gov.lv), CC0) - air/road-surface temperature, humidity, precipitation, wind, friction, snow/ice depth, road condition
- **LVĢMC meteorological stations** (26-34 stations depending on sensor coverage, [data.gov.lv](https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi), CC0) - air/apparent temperature, wind, humidity, pressure, precipitation, visibility, UV index, lightning strikes
- Each network is an independent toggleable map layer; markers are small labelled temperature badges that auto-declutter (hide when they'd overlap) as you zoom
- A sortable table below the map mirrors whichever layer(s) are active; both active at once switches to tabs instead of stacking
- Clicking a station opens a dedicated page with 24h/48h temperature, hourly min/max, and wind history charts plus a locator map

### Model accuracy (Modeļi tab)
- Ranks the 14 models by how close their recent temperature has been to the **nearest LVĢMC station's** measured air temperature over the past 48 h
- Table of mean absolute error (MAE), signed bias and sample count per model; best model highlighted; a chart overlays the observed series against the top three models
- Uses each model's latest analysis / short-range values (`past_days=2` on the forecast API) at the station's coordinates - this is recent model skill near you, not "the forecast as it was issued two days ago"
- Lazy-loaded on tab open; recomputes when the location changes

### City search
- **Auto-geolocation** on page load - requests GPS permission immediately; shows "Pašreizējā atrašanās vieta" and starts loading at once; Nominatim reverse-geocoding resolves the city name in the background
- **Live autocomplete** - suggestions appear as you type (300ms debounce, min 2 chars, single active request via AbortController)
- Browser **geolocation** button also available in the search bar
- **Saved locations** - a star next to the city name pins the current location; pinned places sit above the recent list in the search dropdown (with an unpin ✕) and are always available (localStorage, `fav_cities`)
- **Recent search history** - last 5 cities shown when search is focused and empty (localStorage)
- Shareable URLs - location encoded in query params (`?lat=&lon=&city=&country=`); shared links skip auto-geolocation

### Share
- WhatsApp and Telegram share buttons with pre-filled city name and current URL

### UI / Theme / Language
- Light and dark theme (saved to localStorage, applied before page render to avoid flash)
- **Latvian / English** toggle in the header. Language comes from `?lang=` > localStorage > `lv`; switching updates the URL and re-renders the whole UI live (no reload). Dates, weekdays and the compass follow the locale (Z/A/D/R ↔ N/E/S/W)
- Fully **mobile responsive** - adapted header and layout for small screens
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
  core.js       - MODELS, state (S), utils ($, round, cssVar...), cache, URL state, haversineKm
  weather.js    - temperature colours, wind direction, weather icons/text, date formatting
  charts.js     - model toggle buttons, Chart.js defaults, every forecast chart, the forecast table
  climate.js    - Climate tab (ERA5 anomaly + warming stripes) and model verification
  data.js       - current-conditions metrics, combined multi-model fetch, load pipeline
  locations.js  - city search, theme, saved/recent places, share, geolocation
  radar.js      - RainViewer radar map, LVC + LVĢMC station networks, marker declutter
  app.js        - tab switching, language re-render (relangUI), init
  stacija.js / stacija-lvgmc.js - the two standalone station detail pages (own scripts)

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
- **Moon phase** - computed client-side using a reference new moon (Jan 6 2000 18:14 UTC) and the 29.53-day synodic cycle. Rendered as a monochrome SVG using two SVG arcs: an outer semicircle (the lit hemisphere boundary) and an elliptical terminator arc whose sweep direction flips between crescent and gibbous phases.
- **Auto-geolocation** - on load without URL coords, `getCurrentPosition` is called immediately. Loading starts with a placeholder city name; Nominatim resolves the real name in the background without blocking data fetch. If geolocation is denied or times out (5 s), falls back to the default location (Rīga).
- **Wind units** - API requested with `wind_speed_unit=ms`; conversion to km/h done client-side when selected. Preference saved in localStorage.
- **Live autocomplete** - 300ms debounce on input + `AbortController` ensures max 1 active geocoding request regardless of typing speed.
- **Crosshair plugin** - custom Chart.js plugin registered globally via `Chart.register()`; draws a vertical dashed line at the hovered x position using `chartArea` bounds.
- **Radar** - Leaflet map lazy-initialised on first tab open. RainViewer frames fetched from their public JSON API; each frame is a tile layer added/removed on step. Radar tiles capped at `maxNativeZoom: 6` (Leaflet upscales for closer views); rendered in a dedicated Leaflet pane with a fixed z-index so it stays above whichever base map is selected. Map zoom capped at 13. Light/dark base maps use Esri Gray Canvas (keyless); the Esri "Base" and "Reference" (labels) services are combined in a single `L.layerGroup` so each behaves as one labelled base layer.
- **LVC weather stations** - the live DATEX II feed only exposes ~30 min of history, so a Cloudflare Worker on a 15-min Cron Trigger parses it and accumulates readings in D1; the site reads the accumulated 24h window from D1 instead of hitting the feed directly. The API key is a Cloudflare Secret, never present in any committed file or client-side code.
- **LVĢMC weather stations** - the public CSV already carries a 48h rolling window, so no database is needed; a Worker fetches/parses it and serves it through Cloudflare's Cache API (10 min TTL) purely to add CORS headers, since the source doesn't send them. Precipitation-only gauge stations (no temperature sensor) are filtered out of the table/map, matching how other public displays of this data handle them.
- **Service worker** - HTML uses network-first (new deploys load immediately); JS/CSS uses stale-while-revalidate (cached version served instantly, new version fetched in background and ready on next load).
- **No flash of wrong theme** - small inline `<script>` in `<head>` reads saved theme and sets `data-theme` before stylesheet loads.
- **XSS prevention** - city search results and all API-returned strings use `textContent` instead of `innerHTML`. Tile URLs are hardcoded templates with no user input.
- **Accessibility** - the tab bar is a proper ARIA `tablist` with roving tabindex and Left/Right/Home/End keyboard navigation; panels are `tabpanel`s. Model toggle buttons expose `aria-pressed`. A skip link jumps to `<main>`. `prefers-reduced-motion` zeroes chart animations and CSS transitions (the loading spinner is kept). Chart `<canvas>` elements carry `role="img"` + `aria-label`.
- **i18n** - static text uses `data-i18n*` attributes resolved by `applyStaticI18n()`; dynamic strings go through `t(key, vars)`. `setLang()` swaps `LANG`/`LOCALE`, updates the URL and calls `relangUI()`, which re-renders every JS-built piece (metrics, charts, tables, model list, lazy tabs, station rows). The two station detail pages load `js/i18n.js` and honour the same stored language (they have no toggle of their own). The Leaflet layer control is rebuilt with new labels on a language switch (`relabelRadarControl`).
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
