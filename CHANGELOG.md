# Changelog

## 2026-09-15 - On-demand cloud map with a forecast timeline

- Added a cloud-cover map under the Mākoņi (Clouds) tab, below the existing chart: gridded DWD ICON cloud cover rendered via Open-Meteo's `weather-map-layer`, the same model already compared elsewhere on the site.
- Sat24-style time control: a slider and play button step through ~90 forecast frames (hourly, then 3-hourly out to 5 days). This is a model forecast animation, not satellite imagery - the info text says so explicitly.
- Off by default, no API key, no background preloading: the map, its ~2.9 MB SRI-pinned rendering library and the grid metadata only load after pressing "Show cloud map", matching the existing Wind-tab embed convention. Reopening after the first load is instant (library, map and metadata stay cached); leaving the tab pauses playback only.
- Uses Esri Gray Canvas for the base map (keyless) rather than the CARTO tiles in the library's own examples, which now require an API key - the same fix already applied to the main radar map.
- First attempt added this as a togglable overlay on the radar map's layer control; moved to its own map under the Clouds tab per feedback, and gained the time-series scrubber.

## 2026-09-13 - On-demand wind maps

- Added official Windy and Ventusky embeds below the Wind chart, centered on the selected location. Windy is the default; Ventusky offers an alternative wind visualization.
- Load maps only after an explicit button press. Keep a single iframe and remove it on close, location changes or leaving the Wind tab. No provider requests are made by the unopened map.
- Added responsive map sizing, accessible provider controls, an external-view link and Latvian/English labels. Provider branding remains intact; map time/model controls operate independently from the comparison chart.
- Windy starts in m/s. Ventusky chooses language and units from browser settings.
- Added a lifecycle test covering lazy loading, provider replacement and cleanup.

## 2026-09-13 - Marine forecasts, local warnings and chart dates

- Added a Sea view with LVGMC wave height, water temperature and current speed forecasts. Each parameter uses its own source coordinates, with explicit point coverage and missing-data states.
- Added a Leaflet point map, accessible point selector, hourly touch slider, previous/next controls and selected-point chart. Periods are 48 hours, 7 days by default and up to the available 9-day forecast.
- Added bounded server-side SQL sampling instead of full marine CSV downloads. Each layer uses one shared snapshot, refreshed at most once per four hours after a successful fetch. Browser caching, request coalescing and lazy loading keep traffic independent of map interactions.
- Added a compact home warning banner matched to the selected coordinates using CAP polygons. Expired warnings are removed and the most severe warning appears first. Original source text, validity times and official links remain visible. Failed or stale checks never produce an all-clear.
- Fixed missing chart dates by keeping date and hour together on the horizontal axis. Removed duplicate-label suppression that conflicted with automatic tick spacing.
- Unified full tooltip timestamps and preserved unzoned forecast wall times. Station timestamps use Europe/Riga; absolute environmental timestamps convert for display. Missing values remain gaps rather than zeroes.
- Kept marine map layers below the fixed header and added accessible names for icon-only mobile tabs and versioned the updated offline shell.
- Added tests for midnight/time-zone formatting, polygon boundaries, warning expiry/severity, marine missing values and truncated responses.

## Earlier improvements in this update series

- Added forecast period controls with a 7-day default, mobile radar timeline controls, model-selection tools and safeguards against outdated location responses.
- Refined card separation while retaining the original visual style and compact station labels.
- Added cached air-quality and seasonal pollen forecasts, national warnings, hydrological station maps and charts, and planetary Kp observations.
- Added scheduled shared-data snapshots, retained last successful data on source failures, bounded browser storage and clear data-source attribution.
