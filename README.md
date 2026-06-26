# Weather Forecast — Model Comparison

Free meteorological forecast site displaying **16 leading global weather models** simultaneously for easy comparison.

- **[Open site](https://artuursg.github.io/METEO/)**

---

## Features

- **Temperature chart** — all 16 models in one chart, toggle each on/off
- **Precipitation chart** — bar and line chart, ECMWF / ICON / MET Norway
- **Wind chart** — 10m wind speed, model comparison
- **Forecast table** — daily summary, model selector
- **City search** — any city in the world with coordinate precision
- **Light/dark theme** — saved automatically

## Models

| # | Model | Organization | Resolution | Days |
|---|-------|-------------|-----------|------|
| 1 | ECMWF IFS | ECMWF (EU) | 9 km | 10 |
| 2 | ECMWF AIFS | ECMWF — AI model | 25 km | 10 |
| 3 | GFS | NOAA (USA) | 13 km | 16 |
| 4 | ICON | DWD (Germany) | 11 km | 7 |
| 5 | ICON-EU | DWD (Germany) | 7 km | 5 |
| 6 | ICON-D2 | DWD (Germany) | 2 km | 2 |
| 7 | GEM | MSC (Canada) | 15 km | 10 |
| 8 | ACCESS-G | BOM (Australia) | 12 km | 10 |
| 9 | UKMO | Met Office (UK) | 10 km | 7 |
| 10 | MET Norway | MET Norway | 1 km | 10 |
| 11 | Météo-France | Météo-France | 1.5 km | 4 |
| 12 | JMA | JMA (Japan) | 13 km | 11 |
| 13 | ARPAE COSMO | ARPAE (Italy) | 2.8 km | 5 |
| 14 | CMA GRAPES | CMA (China) | 15 km | 10 |
| 15 | HARMONIE NL | KNMI (Netherlands) | 2.5 km | 2 |
| 16 | HARMONIE DK | DMI (Denmark) | 2 km | 3 |

## Stack

- **HTML / CSS / JavaScript** — no framework, no build tools
- **[Chart.js 4.4.1](https://www.chartjs.org/)** — interactive charts
- **[Open-Meteo API](https://open-meteo.com/)** — free meteorological data (CC BY 4.0)
- **GitHub Pages** — free hosting

## Local setup

```bash
git clone https://github.com/ArtuursG/METEO.git
cd METEO
# Open with Live Server (VS Code) or any local server
```

> Open with a local server — direct `file://` may block API requests.

---

Data: [Open-Meteo](https://open-meteo.com) - License: CC BY 4.0
