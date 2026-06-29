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
- **Cloud cover** - hourly cloud cover (%) for the next 5 days; single model, colour-coded bars (clear → overcast)
- **UV index** - hourly UV index starting from the current hour, next 5 days; colour-coded bars (Low → Extreme); ECMWF IFS primary, GFS fallback
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
- Step through frames manually (◀ ▶) or play as animation
- Light **CartoDB Positron** base map
- Lazy-initialised - Leaflet only loads when the Radar tab is opened

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
- **[CartoDB Positron](https://carto.com/basemaps/)** - light minimal base map tiles
- **GitHub Pages** - free static hosting via GitHub Actions

## Architecture

```
index.html            - structure and markup
style.css             - CSS custom properties for light/dark theme, responsive layout
app.js                - all application logic (~1080 lines, depends on Chart.js and Leaflet)
sw.js                 - service worker for PWA offline caching
manifest.json         - PWA manifest (name, icons, display mode)
favicon.svg           - inline SVG icon (sun + cloud)
apple-touch-icon.png  - 180x180 PNG icon for iOS home screen
```

### Key implementation details

- **Caching** - API responses cached in localStorage for 1 hour (keyed by model ID + coordinates). Up to 14 requests saved per location per hour. Prefix `wx6_` - bumped when API request parameters change to invalidate stale data.
- **Parallel fetching** - all 14 models fetched simultaneously with `Promise.allSettled`; individual failures silently skipped.
- **API variable fallback** - some models reject unsupported variables with HTTP 400 instead of returning null. `fetchModel` cascades through up to 5 progressively reduced variable sets: full → no current → no precipitation probability → no UV index → no cloud cover. Models that still fail (outside geographic coverage) are silently skipped.
- **UV index** - hourly `uv_index` variable requested for all models; ECMWF IFS is the primary source, GFS is the fallback. Models that return an array of nulls (unsupported variable) are skipped - a plain array existence check is insufficient.
- **Cloud cover** - hourly `cloud_cover` variable, shown for 5 days. Colour-coded bars: sky blue (clear) → dark slate (overcast).
- **Moon phase** - computed client-side using a reference new moon (Jan 6 2000 18:14 UTC) and the 29.53-day synodic cycle. Rendered as a monochrome SVG using two SVG arcs: an outer semicircle (the lit hemisphere boundary) and an elliptical terminator arc whose sweep direction flips between crescent and gibbous phases.
- **Auto-geolocation** - on load without URL coords, `getCurrentPosition` is called immediately. Loading starts with a placeholder city name; Nominatim resolves the real name in the background without blocking data fetch. If geolocation is denied or times out (5 s), falls back to the default location (Rīga).
- **Wind units** - API requested with `wind_speed_unit=ms`; conversion to km/h done client-side when selected. Preference saved in localStorage.
- **Live autocomplete** - 300ms debounce on input + `AbortController` ensures max 1 active geocoding request regardless of typing speed.
- **Crosshair plugin** - custom Chart.js plugin registered globally via `Chart.register()`; draws a vertical dashed line at the hovered x position using `chartArea` bounds.
- **Radar** - Leaflet map lazy-initialised on first tab open. RainViewer frames fetched from their public JSON API; each frame is a tile layer added/removed on step. Radar tiles capped at `maxNativeZoom: 6` (Leaflet upscales for closer views). Map zoom capped at 13.
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
2. Tap **Share → Add to Home Screen**
3. Tap **Add**

The app opens fullscreen without browser chrome and works offline for the app shell.

---

Data: [Open-Meteo](https://open-meteo.com) - License: CC BY 4.0 · Radar: [RainViewer](https://www.rainviewer.com)
