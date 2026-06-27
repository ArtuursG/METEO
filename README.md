# prognoze.lv - Weather Forecast Model Comparison

Free meteorological forecast site displaying **15 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

### Forecast charts
- **Temperature** - hourly 2m temperature for up to 16 days, all 15 models overlaid on one chart
- **Precipitation** - hourly precipitation in mm; switches between bar chart (single model) and line chart (multi-model comparison)
- **Precipitation probability** - hourly % from all models that provide it
- **Wind speed** - 10m wind speed in km/h, multi-model comparison

### Daily forecast table
- Day-by-day summary: max/min temperature, precipitation, precipitation probability, max wind, cloud cover, humidity
- Switchable between ECMWF IFS, ICON-EU and MET Norway
- Temperature colour coding: hot / warm / cool / cold

### Current conditions (top metrics row)
- Temperature, feels like (apparent temperature), today's max/min
- Wind speed and 16-point compass direction (N/NNE/NE ... NNW)
- Humidity and current precipitation
- Sunrise and sunset times
- All metrics sourced from ECMWF IFS (falls back to first available model)

### City search and location
- Search any city worldwide via Open-Meteo Geocoding API
- Browser geolocation button with Nominatim reverse geocoding
- Recent search history (last 5 cities, stored in localStorage)
- Shareable URLs - location is encoded in query params (`?lat=&lon=&city=&country=`)

### Share
- WhatsApp and Telegram share buttons with pre-filled city name and URL

### UI
- Light and dark theme (saved to localStorage, applied before page render to avoid flash)
- Fully responsive - adapted layout for mobile screens
- Model toggles on the temperature chart - enable/disable individual models
- Multi-model selector for precipitation and wind charts
- "Models" info tab listing all 15 models with organisation, resolution and forecast horizon

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

All 15 models cover Latvia and the broader European region. Models with EU or global coverage are preferred; regional models (HARMONIE) provide high-resolution short-range forecasts.

---

## Stack

- **HTML / CSS / JavaScript** - no framework, no build tools
- **[Chart.js 4.4.1](https://www.chartjs.org/)** - interactive charts (loaded via CDN with SRI integrity hash)
- **[Open-Meteo API](https://open-meteo.com/)** - free meteorological data (CC BY 4.0), no API key required
- **[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)** - city search
- **[Nominatim](https://nominatim.openstreetmap.org/)** - reverse geocoding for browser geolocation
- **GitHub Pages** - free static hosting via GitHub Actions

## Architecture

```
index.html   - structure and markup
style.css    - CSS custom properties for light/dark theme, responsive layout
app.js       - all application logic (~700 lines, no dependencies beyond Chart.js)
favicon.svg  - inline SVG icon (sun + cloud)
```

### Key implementation details

- **Caching** - API responses are cached in localStorage for 1 hour (keyed by model ID + coordinates). Up to 15 requests are saved per location visit.
- **Parallel fetching** - all 15 models are fetched simultaneously with `Promise.allSettled`; individual model failures are silently skipped.
- **No flash of wrong theme** - a small inline script in `<head>` reads the saved theme and sets `data-theme` before the stylesheet loads.
- **XSS prevention** - city search results use `textContent` instead of `innerHTML` to prevent injection from API-returned data.

---

## Local setup

```bash
git clone https://github.com/ArtuursG/METEO.git
cd METEO
# Open with Live Server (VS Code) or any local server
```

> Open with a local server - direct `file://` access may block API requests due to CORS.

---

Data: [Open-Meteo](https://open-meteo.com) - License: CC BY 4.0
