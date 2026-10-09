# Changelog

## v2.1.0 - 2026-10-09

Fewer requests for the same data, and new data sooner.

- One worker request instead of three: the LVC worker's `?data=home` answer carries both station networks, the MeteoAlarm warnings and the Open-Meteo model run times, and says when its next cron run is. An open page asks again 90 seconds after that run instead of on its own timers, so new readings show up within about two minutes and a page open all day makes about 100 worker requests instead of about 340.
- The LVĢMC stations are prepared by the LVC worker's cron and parsed only when the source file changed (about once an hour). The separate LVĢMC worker is no longer used.
- Lighter forecast requests: the current values and sunrise/sunset, which the page takes from ECMWF IFS only, come from a small separate request every 15 minutes instead of being requested for all 14 models. A new place costs about 24 Open-Meteo calls instead of 40.
- Models are asked for again only when Open-Meteo has a newer run of them, 10 minutes after it became available as Open-Meteo advises. A model without a known run time, or any model outside Europe, refreshes every 30 minutes as before. A page open all day uses about 300 Open-Meteo calls instead of about 1,900, which matters for offices that share one address.
- Failed forecast requests back off 1, 2, 4 up to 15 minutes. When only the current values change, the charts are not redrawn.
- Changes to worker code, workflows, docs and tests no longer start a GitHub Pages deployment.

## v2.0.0 - 2026-10-08

The redesigned site: five sections, a Today view, a new radar, live data from the workers instead of scheduled builds.

### Free model choice, road ice, forecast changes, station trends

- Every model can be chosen in the cloud chart and the daily table. ECMWF IFS, ICON-EU and MET Norway stay the recommended, visible choice and are now also the temperature chart default.
- Recent model accuracy against the nearest LVĢMC station appears under the temperature chart and in the model picker, as information only.
- The now block reports icy road surfaces from nearby LVC road weather stations and what changed in the forecast since the previous visit. The short forecast sentence is removed: the numbers, hours and days say it more precisely.
- Temperature trend arrows in the station table, popups and station pages. The LVC worker returns the reading about an hour before the latest one.
- Station pages get the language switch, a calm back link and a link to the forecast for the station's place.
- No more scheduled deployments: warnings, hydrology, Kp and marine snapshots are built by the LVC worker's cron (warnings every 15 minutes, Kp and hydrology every 30, marine every 4 hours) and read from it; GitHub Pages only publishes code changes. The worker also stores the ready station list, so a list request reads one row instead of scanning all readings. Right after a deployment the worker answers warnings and Kp at once; hydrology and marine follow one per cron run.
- Redesigned Vide views: a section switch like the rest of the site, a title row with the data age, air quality as a large index with its European level and coloured pollutant levels, warnings with a count, a map of the warning areas and coloured cards with plain times ("šodien 19:00 – rīt 05:00"), water stations with the map and the values side by side and their change over 24 hours, and the Kp index with its level, a 0-9 scale and coloured 3-hour bars.
- Radar playback within RainViewer's free limit (100 requests a minute from one address): every tile request goes through a queue that keeps to 90 a minute, the frame on screen first, so all frames load instead of most being refused. Tiles come from the host named in the API answer, and a frame whose tiles failed is loaded again a minute later.
- Fresh data while the page stays open: the forecast reloads every 30 minutes while the page is visible and at once when it is shown again after 15 minutes, the data age label updates every minute, and the station pages reload their readings every 10 minutes. A saved forecast is reused for 10 minutes instead of an hour; an older copy only stands in when the network fails.
- MeteoAlarm sends one entry per municipality and in English. Entries for the same event and time are merged into one card with the list of areas, and titles and areas are shown in Latvian ("Dzeltenais brīdinājums: vējš", "Ķekavas novads", "Rīgas jūras līča rietumu daļa"). The home page also lists warnings that start later, with their start time.
- The daily table shows the minimum temperature before the maximum.

### Today view, new radar and shared map timeline

- Add a Today tab and a compact current-conditions block: a model agreement dot, the nearest LVĢMC reading, the next 24 hours and up to 10 days with model spread.
- Rebuild the radar: observed frames only (RainViewer's free tier no longer has a nowcast), automatic refresh every 5 minutes, preloaded frames for smooth playback, controls and timeline on the map, a precipitation legend and a settings button for base map and opacity.
- Station labels no longer overlap; stations without a label show as coloured dots.
- Replace the two station tables with one table: search, network filter, nearest stations first, temperature pills, wind arrows, precipitation bars, road condition tags and 24 h ranges. Phones get a card list.
- The cloud map and the marine forecast map use the same timeline as the radar, drawn on the map. Marine point labels no longer overlap, and choosing a point in the list moves the map to it.
- Simpler charts: the temperature chart shows the median of all models, the spread band and two models by default, with a compact model picker (also for precipitation and wind) that remembers the choice. The spread verdict sits next to the title, the period switch is compact and the daily table uses coloured temperatures and precipitation bars.
- Five sections instead of ten tabs, with a second row for sections that hold several views and a bottom bar on phones. The open view is remembered in the address and for the next visit.
- Saved places appear as buttons under the city name. A failed warning check is now one quiet line instead of a warning-sized box.
- Scripts load with defer, so the page appears before the chart and map libraries arrive.
- Numbers in the new views use the Latvian decimal comma.
- All remaining inline Latvian/English strings moved into the string tables; unused translations removed.
- Station pages use the same current-conditions block as the home page, a map that follows the light/dark theme and dashed gust lines. LVĢMC min/max now covers the last 24 hours. Road stations show road grip instead of an always-empty pressure row.
- Remove unused styles from the old tab bar and metric cards.

## 2026-09-21 - Marine timeline label layout

- Split marine timeline labels into separate date and time rows so adjacent labels no longer merge visually.
- Shorten the selected marine timestamp while keeping the time zone in its accessible label.

## 2026-09-20 - Data freshness, timeline ticks and full-screen maps

- Show snapshot download times separately from the latest measurement shown in each data view.
- Add five evenly spaced time labels to radar, cloud and marine sliders.
- Add a full-screen control to radar, cloud, water and marine maps; keep timeline controls visible in full screen.

## 2026-09-20 - Desktop timeline sizing and air-quality subtitle

- Widen desktop timelines to 760px and enlarge their labels and controls while retaining the compact mobile layout.
- Put the city and air-quality model explanation on separate lines without a middle-dot separator.


## 2026-09-20 - Centered time sliders below maps

- Restyle radar, cloud and marine timelines as compact centered panels below their maps, with the selected time above the slider.
- Retain playback, keyboard controls and responsive sizing without adding dependencies or data requests.


## 2026-09-20 - Compact controls and synchronized map themes

- Replace environmental metric cards with compact monochrome readings and smaller navigation controls.
- Reduce timeline buttons, tracks, thumbs and water-station symbols.
- Synchronize radar, cloud, water and marine basemaps with the site theme; preserve weather overlays.
- Remove the external Sat24 link from the cloud map.


## 2026-09-20 - Clearer cloud views and environment maps

- Separate observed infrared satellite imagery from cloud-cover forecasts. Read the latest observation timestamp from EUMETSAT metadata; retain a direct Sat24 link.
- Load forecast rendering only when requested, cache metadata for 15 minutes, and debounce timeline scrubbing.
- Refresh radar, cloud and marine sliders with touch-friendly controls and progress tracks.
- Use neutral environment basemaps, accessible water-drop station markers and a highlighted selected station.
- Refine compact environmental cards and charts, preserving date/time labels on small screens.


## 2026-09-15 - Cloud map: combine real satellite frames with the model forecast

- Extended the Mākoņi-tab cloud map from a model-only forecast loop into one continuous timeline, exactly like the radar's past-observations-plus-nowcast: the past ~2 h are real satellite frames, the rest (up to 5 days) is the DWD ICON forecast already used elsewhere.
- Satellite source: EUMETSAT EUMETView WMS (`msg_fes:vis006`, visible-light channel), free, no API key, confirmed reliable at 15-minute native resolution back to 2020. `msg_fes:rgb_natural` (colour composite) returned occasional 502s in testing - stuck with the plainer, more reliable grayscale channel.
- One slider spans both halves; each step is labelled "Novērots" (Observed) or "Prognoze" (Forecast) so it is never ambiguous which kind of data is showing. Map/library/frames stay cached after the first load.
- Known limit (accepted for now, no fallback built): the visible-light channel is dark at night. An infrared layer exists at EUMETSAT for a day/night-aware version later if wanted.

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
