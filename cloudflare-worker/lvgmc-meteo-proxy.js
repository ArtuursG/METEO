/**
 * LVĢMC (Latvijas Vides, ģeoloģijas un meteoroloģijas centrs) meteostaciju
 * starpniekserviss.
 *
 * KĀPĒC ŠIS PASTĀV: dati ir publiski, CC0, BEZ API atslēgas (data.gov.lv) -
 * vienīgā problēma ir CORS (data.gov.lv neatļauj tiešu pārlūka pieprasījumu
 * no cita domēna). Šis Worker tikai pārsūta datus ar CORS galveni un
 * pārveido CSV par ērtu JSON - nekādu noslēpumu šeit nav.
 *
 * AVOTS: https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi
 * Avots pats uztur 48h "ripojošu" vēsturi (stundas solī), tāpēc atšķirībā
 * no LVC šeit NAV vajadzīga D1 uzkrāšana - vienkārši pārsūtam un kešojam
 * uz dažām minūtēm ar Cloudflare Cache API.
 */

const STATIONS_URL = "https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi/resource/c32c7afd-0d05-44fd-8b24-1de85b4bf11d/download/meteo_stacijas.csv";
const READINGS_URL = "https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi/resource/17460efb-ae99-4d1d-8144-1068f184b05f/download/meteo_operativie_dati.csv";

const CACHE_SECONDS = 600; // avots pats atjaunojas ik stundu - ik 10 min pietiek

// Kurus no ~27 pieejamiem parametru kodiem rādām METEO lapā, un ar kādu atslēgu izvadē
const PARAM_MAP = {
  TDRY: "airTemp",
  SAJT: "feelsLike",
  HATMN: "minTemp",
  HATMX: "maxTemp",
  WNS10: "windSpeed",
  WPGST: "windGust",
  WNDD10: "windDir",
  PRSL: "pressure",
  RLH: "humidity",
  VSBA: "visibility",
  SNOWA: "snowDepth",
  HPRAB: "precipHour",
  UVIL: "uv",
  LITOT: "lightning",
  CCTMX: "cloudCoverOktas",
};

/** Vienkāršs CSV parsētājs - pietiek šim failam (nav iekšēju komatu vērtībās, tikai virknes pēdiņās) */
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}
function splitCsvLine(line) {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}
function num(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** "2026.08.19 11:00:00" -> ISO 8601 (avota laiks ir EET/EEST vietējais, DATETIME bez zonas norādes) */
function toIso(dt) {
  const m = dt.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return dt;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function parseStations(csv) {
  const stations = {};
  for (const row of parseCsv(csv)) {
    const lat = num(row.GEOGR2), lon = num(row.GEOGR1);
    if (lat == null || lon == null) continue;
    stations[row.STATION_ID] = { id: row.STATION_ID, name: row.NAME, lat, lon };
  }
  return stations;
}

/** Garais (long) formāts station+param+time+value -> { stationId: { isoTime: {field: value} } } */
function parseReadings(csv) {
  const byStation = {};
  for (const row of parseCsv(csv)) {
    const field = PARAM_MAP[row.ABBREVIATION];
    if (!field) continue;
    const id = row.STATION_ID;
    const time = toIso(row.DATETIME);
    (byStation[id] ??= {});
    (byStation[id][time] ??= { time });
    byStation[id][time][field] = num(row.VALUE);
  }
  return byStation;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + "/", { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const [stationsCsv, readingsCsv] = await Promise.all([
        fetch(STATIONS_URL).then((r) => r.text()),
        fetch(READINGS_URL).then((r) => r.text()),
      ]);
      const stations = parseStations(stationsCsv);
      const readingsByStation = parseReadings(readingsCsv);

      const result = Object.keys(stations)
        .filter((id) => readingsByStation[id])
        .map((id) => {
          const history = Object.values(readingsByStation[id]).sort((a, b) => (a.time < b.time ? -1 : 1));
          return { ...stations[id], history };
        });

      const response = json({ updated: new Date().toISOString(), stations: result });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
  },
};
