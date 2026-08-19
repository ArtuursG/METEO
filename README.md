# prognoze.lv - Weather Forecast Model Comparison

Free meteorological forecast site displaying **14 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

### Forecast charts
- **Temperature** - hourly 2m temperature for up to 16 days, all 14 models overlaid on one chart; toggle each model on/off
- **Precipitation** - hourly precipitation in mm; switches between bar chart (single model) and line chart (multi-model)
- **Precipitation probability** - hourly % from all models that provide it
- **Wind speed** - 10m wind speed, multi-model comparison; toggle between **m/s and km/h** (default m/s)
- **Cloud cover** - hourly cloud cover (%) for the next 5 days; single model, colour-coded bars (clear -> overcast)
- **UV index** - hourly UV index starting from the current hour, next 5 days; colour-coded bars (Low -> Extreme); ECMWF IFS primary, GFS fallback
- **Crosshair** - vertical dashed line follows the cursor across all charts for precise value reading

### Daily forecast table
- Day-by-day summary: max/min temperature, precipitation, precipitation probability, max wind, cloud cover, humidity
- Switchable between ECMWF IFS, ICON-EU and MET Norway

### Current conditions (metrics row)
- Temperature, feels like (apparent temperature), today's max/min
- Wind speed with **rotating direction arrow** and 16-point compass label (Latvian: Z/A/D/R = N/E/S/W)
- Humidity and current precipitation
- Sunrise and sunset times with **moon phase icon** (monochrome SVG, pure math - no API call)
- All metrics sourced from ECMWF IFS (falls back to first available model)

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

### City search
- **Auto-geolocation** on page load - requests GPS permission immediately; shows "Pašreizējā atrašanās vieta" and starts loading at once; Nominatim reverse-geocoding resolves the city name in the background
- **Live autocomplete** - suggestions appear as you type (300ms debounce, min 2 chars, single active request via AbortController)
- Browser **geolocation** button also available in the search bar
- **Recent search history** - last 5 cities shown when search is focused and empty (localStorage)
- Shareable URLs - location encoded in query params (`?lat=&lon=&city=&country=`); shared links skip auto-geolocation

### Share
- WhatsApp and Telegram share buttons with pre-filled city name and current URL

### UI / Theme
- Light and dark theme (saved to localStorage, applied before page render to avoid flash)
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
- **[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)** - city search with live autocomplete
- **[Nominatim](https://nominatim.openstreetmap.org/)** - reverse geocoding for browser geolocation
- **[RainViewer](https://www.rainviewer.com/api.html)** - free precipitation radar tiles, no API key required
- **[CartoDB](https://carto.com/basemaps/), OpenStreetMap, OpenTopoMap, Esri** - selectable base map tiles
- **[transportdata.gov.lv](https://www.transportdata.gov.lv)** - LVC road weather station data (DATEX II XML), CC0, requires an API key
- **[data.gov.lv](https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi)** - LVĢMC meteorological station data (CSV), CC0, no API key required
- **Cloudflare Workers + [D1](https://developers.cloudflare.com/d1/)** - proxy the two station data sources (CORS, and for LVC, secret storage and history accumulation - see `cloudflare-worker/`)
- **GitHub Pages** - free static hosting via GitHub Actions

## Architecture

```
index.html                            - structure and markup
style.css                             - CSS custom properties for light/dark theme, responsive layout
app.js                                - all application logic, depends on Chart.js and Leaflet
sw.js                                 - service worker for PWA offline caching
manifest.json                         - PWA manifest (name, icons, display mode)
favicon.svg                           - inline SVG icon (sun + cloud)
apple-touch-icon.png                  - 180x180 PNG icon for iOS home screen

stacija.html / stacija.js             - LVC station detail page (standalone, own script)
stacija-lvgmc.html / stacija-lvgmc.js - LVĢMC station detail page (standalone, own script)

cloudflare-worker/
  lvc-meteo-proxy.js    - parses the LVC DATEX II feed, accumulates history in D1 on a Cron Trigger
  lvgmc-meteo-proxy.js  - fetches/parses the LVĢMC CSV, no D1 needed (source keeps its own 48h window)
  schema.sql            - D1 table definitions for lvc-meteo-proxy
  wrangler.toml / wrangler-lvgmc.toml - Worker deploy config
```

### Key implementation details

- **Caching** - API responses cached in localStorage for 1 hour (keyed by model ID + coordinates). Up to 14 requests saved per location per hour. Prefix `wx6_` - bumped when API request parameters change to invalidate stale data.
- **Parallel fetching** - all 14 models fetched simultaneously with `Promise.allSettled`; individual failures silently skipped.
- **API variable fallback** - some models reject unsupported variables with HTTP 400 instead of returning null. `fetchModel` cascades through up to 5 progressively reduced variable sets: full -> no current -> no precipitation probability -> no UV index -> no cloud cover. Models that still fail (outside geographic coverage) are silently skipped.
- **UV index** - hourly `uv_index` variable requested for all models; ECMWF IFS is the primary source, GFS is the fallback. Models that return an array of nulls (unsupported variable) are skipped - a plain array existence check is insufficient.
- **Cloud cover** - hourly `cloud_cover` variable, shown for 5 days. Colour-coded bars: sky blue (clear) -> dark slate (overcast).
- **Moon phase** - computed client-side using a reference new moon (Jan 6 2000 18:14 UTC) and the 29.53-day synodic cycle. Rendered as a monochrome SVG using two SVG arcs: an outer semicircle (the lit hemisphere boundary) and an elliptical terminator arc whose sweep direction flips between crescent and gibbous phases.
- **Auto-geolocation** - on load without URL coords, `getCurrentPosition` is called immediately. Loading starts with a placeholder city name; Nominatim resolves the real name in the background without blocking data fetch. If geolocation is denied or times out (5 s), falls back to the default location (Rīga).
- **Wind units** - API requested with `wind_speed_unit=ms`; conversion to km/h done client-side when selected. Preference saved in localStorage.
- **Live autocomplete** - 300ms debounce on input + `AbortController` ensures max 1 active geocoding request regardless of typing speed.
- **Crosshair plugin** - custom Chart.js plugin registered globally via `Chart.register()`; draws a vertical dashed line at the hovered x position using `chartArea` bounds.
- **Radar** - Leaflet map lazy-initialised on first tab open. RainViewer frames fetched from their public JSON API; each frame is a tile layer added/removed on step. Radar tiles capped at `maxNativeZoom: 6` (Leaflet upscales for closer views); rendered in a dedicated Leaflet pane with a fixed z-index so it stays above whichever base map is selected. Map zoom capped at 13.
- **LVC weather stations** - the live DATEX II feed only exposes ~30 min of history, so a Cloudflare Worker on a 15-min Cron Trigger parses it and accumulates readings in D1; the site reads the accumulated 24h window from D1 instead of hitting the feed directly. The API key is a Cloudflare Secret, never present in any committed file or client-side code.
- **LVĢMC weather stations** - the public CSV already carries a 48h rolling window, so no database is needed; a Worker fetches/parses it and serves it through Cloudflare's Cache API (10 min TTL) purely to add CORS headers, since the source doesn't send them. Precipitation-only gauge stations (no temperature sensor) are filtered out of the table/map, matching how other public displays of this data handle them.
- **Station min/max charts** - LVĢMC's `HATMN`/`HATMX` parameters are genuine hourly min/max, so they chart directly. LVC only reports a since-midnight running min/max (a step function, not a smooth line), so the station page instead buckets its own ~15 min readings by calendar hour and computes min/max per bucket client-side.
- **Marker declutter** - each station marker is a small `divIcon` badge (not a pin + separate label); on every `zoomend`/`moveend`, badges whose screen-space bounding boxes would overlap are hidden (closest to the map centre wins), and re-shown once there's room.
- **Service worker** - HTML uses network-first (new deploys load immediately); JS/CSS uses stale-while-revalidate (cached version served instantly, new version fetched in background and ready on next load).
- **No flash of wrong theme** - small inline `<script>` in `<head>` reads saved theme and sets `data-theme` before stylesheet loads.
- **XSS prevention** - city search results and all API-returned strings use `textContent` instead of `innerHTML`. Tile URLs are hardcoded templates with no user input.

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
