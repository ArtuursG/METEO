# Bibliotēkas un fonts lapas mapē

Lapa tos ielādē no šejienes, nevis no cita servera: tā strādā arī bez interneta
(service worker tos saglabā), un apmeklētāja pārlūks nesazinās ar CDN vai fontu serveri.

| Fails | Kas | Versija | Licence |
|---|---|---|---|
| `chart.umd.js` | Chart.js | 4.4.1 | MIT (`chart.LICENSE`) |
| `leaflet.js`, `leaflet.css` | Leaflet | 1.9.4 | BSD-2-Clause (`leaflet.LICENSE`) |
| `fonts/plex-mono-*.woff2` | IBM Plex Mono, latin un latin-ext, 400/500/600 | Fontsource 5.3.0 | SIL OFL 1.1 (`fonts/OFL.txt`) |

Faili ir nemainīti no npm pakotnēm (`chart.js`, `leaflet`, `@fontsource/ibm-plex-mono`).
To sargā `test/security.test.js`: katra faila sha256 ir ierakstīts testā.

## Kā atjaunot

1. `npm pack chart.js@<versija>` (vai `leaflet`, `@fontsource/ibm-plex-mono`) un izpako.
2. Pārkopē `dist/chart.umd.js`, `dist/leaflet.js`, `dist/leaflet.css` vai fontu failus.
3. Lapās (`index.html`, `stacija.html`, `stacija-lvgmc.html`) un `sw.js` nomaini `?v=<versija>`.
4. `npm test` pateiks jaunos sha256; ieraksti tos `test/security.test.js`.
