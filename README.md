# prognoze.lv - Weather Forecast Model Comparison

Free meteorological forecast site displaying **15 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

### Forecast charts
- **Temperature** - hourly 2m temperature for up to 16 days, all 15 models overlaid on one chart; toggle each model on/off
- **Precipitation** - hourly precipitation in mm; switches between bar chart (single model) and line chart (multi-model)
- **Precipitation probability** - hourly % from all models that provide it
- **Wind speed** - 10m wind speed, multi-model comparison; toggle between **m/s and km/h** (default m/s)
- **Crosshair** - vertical dashed line follows the cursor across all charts for precise value reading

### Daily forecast table
- Day-by-day summary: max/min temperature, precipitation, precipitation probability, max wind, cloud cover, humidity
- Switchable between ECMWF IFS, ICON-EU and MET Norway
- Temperature colour coding: hot / warm / cool / cold

### Current conditions (metrics row)
- Temperature, feels like (apparent temperature), today's max/min
- Wind speed with **rotating direction arrow** and 16-point compass label (Latvian: Z/A/D/R = N/E/S/W)
- Humidity and current precipitation
- Sunrise and sunset times (from ECMWF daily data)
- All metrics sourced from ECMWF IFS (falls back to first available model)

### City search
- **Live autocomplete** — suggestions appear as you type (300ms debounce, min 2 chars, single active request via AbortController)
- Browser **geolocation** button with Nominatim reverse geocoding and extended address fallback chain
- **Recent search history** — last 5 cities shown when search is focused and empty (localStorage)
- Shareable URLs — location encoded in query params (`?lat=&lon=&city=&country=`)

### Share
- WhatsApp and Telegram share buttons with pre-filled city name and current URL

### UI / Theme
- Light and dark theme (saved to localStorage, applied before page render to avoid flash)
- Fully **mobile responsive** — adapted header and layout for small screens
- **PWA** — installable on iOS/Android via "Add to Home Screen"; runs fullscreen without browser chrome; app shell cached offline

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
| 7 | ACCESS-G | BOM (Australia) | 12 km | 10 |
| 8 | UKMO | Met Office (UK) | 10 km | 7 |
| 9 | MET Norway | MET Norway | 1 km | 10 |
| 10 | Meteo-France | Meteo-France | 1.5 km | 4 |
| 11 | ARPEGE Europe | Meteo-France | 10 km | 4 |
| 12 | JMA | JMA (Japan) | 13 km | 11 |
| 13 | CMA GRAPES | CMA (China) | 15 km | 10 |
| 14 | HARMONIE NL | KNMI (Netherlands) | 2.5 km | 2 |
| 15 | HARMONIE DK | DMI (Denmark) | 2 km | 3 |

All 15 models cover Latvia. ICON-EU and MET Norway are default models for the precipitation and wind charts. ECMWF IFS is the primary source for current conditions.

---

## Stack

- **HTML / CSS / JavaScript** - no framework, no build tools
- **[Chart.js 4.4.1](https://www.chartjs.org/)** - interactive charts (CDN, SRI integrity hash)
- **[Open-Meteo API](https://open-meteo.com/)** - free meteorological data (CC BY 4.0), no API key required
- **[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)** - city search with live autocomplete
- **[Nominatim](https://nominatim.openstreetmap.org/)** - reverse geocoding for browser geolocation
- **GitHub Pages** - free static hosting via GitHub Actions

## Architecture

```
index.html            - structure and markup
style.css             - CSS custom properties for light/dark theme, responsive layout
app.js                - all application logic (~800 lines, no dependencies beyond Chart.js)
sw.js                 - service worker for PWA offline caching
manifest.json         - PWA manifest (name, icons, display mode)
favicon.svg           - inline SVG icon (sun + cloud)
apple-touch-icon.png  - 180x180 PNG icon for iOS home screen
```

### Key implementation details

- **Caching** - API responses cached in localStorage for 1 hour (keyed by model ID + coordinates). Up to 15 requests saved per location per hour. Prefix `wx4_` — bumped when API request parameters change to invalidate stale data.
- **Parallel fetching** - all 15 models fetched simultaneously with `Promise.allSettled`; individual failures silently skipped.
- **Wind units** - API requested with `wind_speed_unit=ms`; conversion to km/h done client-side when selected. Preference saved in localStorage.
- **Live autocomplete** - 300ms debounce on input + `AbortController` ensures max 1 active geocoding request regardless of typing speed.
- **Crosshair plugin** - custom Chart.js plugin registered globally via `Chart.register()`; draws a vertical dashed line at the hovered x position using `chartArea` bounds.
- **No flash of wrong theme** - small inline `<script>` in `<head>` reads saved theme and sets `data-theme` before stylesheet loads.
- **XSS prevention** - city search results use `textContent` instead of `innerHTML` for all API-returned strings.
- **PWA offline** - service worker caches the app shell (HTML/CSS/JS) on install; API calls bypass the SW cache and use the localStorage layer instead.

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

Data: [Open-Meteo](https://open-meteo.com) - License: CC BY 4.0
