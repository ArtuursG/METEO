/**
 * LVC (Latvijas Valsts ceļi) ceļa meteostaciju starpniekserviss.
 *
 * KĀPĒC ŠIS PASTĀV: NPP platforma (transportdata.gov.lv) pieprasa API
 * atslēgu, kas NEDRĪKST parādīties publiskā, GitHub Pages hostētā koda -
 * ikviens apmeklētājs to redzētu pārlūka izstrādātāja rīkos. Šis Worker
 * tur atslēgas servera pusē (Cloudflare Secrets) un atdod METEO lapai
 * jau gatavu, tīru JSON bez atslēgām.
 *
 * ARHITEKTŪRA:
 *   Cron Trigger (ik pa CRON_MINUTES) -> scheduled() -> ielasa LVC feed,
 *   ieraksta D1 datubāzē (tabulas "stations" un "readings"), izdzēš
 *   ierakstus, kas vecāki par RETENTION_HOURS.
 *   Pārlūks -> fetch() -> lasa TIKAI no D1 (nevis katru reizi no LVC -
 *   tas ļauj rādīt 24h vēsturi un netērē LVC pieprasījumu limitu).
 *
 * ATSLĒGU UN D1 UZSTĀDĪŠANA - dari TIKAI Cloudflare panelī, NEKAD
 * neieraksti atslēgas šajā failā. Skat. schema.sql šai pašā mapē un
 * izvietošanas instrukcijas sarunā.
 */

const RETENTION_HOURS = 24;

const LVC_DOWNLOAD_URL = "https://www.transportdata.gov.lv/api/v1/get/file/download-file";

async function fetchFeed(apiKey) {
  const res = await fetch(LVC_DOWNLOAD_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: 1 }),
  });
  if (!res.ok) throw new Error(`LVC pieprasījums neizdevās: ${res.status}`);
  return res.text();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}
function extractNested(block, outerTag, innerTag) {
  const outerM = block.match(new RegExp(`<${outerTag}>([\\s\\S]*?)</${outerTag}>`));
  if (!outerM) return null;
  return extractTag(outerM[1], innerTag);
}
function num(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** "Meteostaciju atrašanās vietas" -> { id: {name, lat, lon} } */
function parseLocations(xml) {
  const stations = {};
  const blockRe = /<roa:measurementSite id="([a-f0-9]+)"[^>]*>([\s\S]*?)<\/roa:measurementSite>/g;
  let m;
  while ((m = blockRe.exec(xml))) {
    const [, id, block] = m;
    // Netieši, jo "com:value" pirmais iegadās measurementEquipmentTypeUsed
    // blokā ("Road Weather Stations (RWS)") - īstais nosaukums ir dziļāk.
    const name = extractNested(block, "roa:measurementSiteName", "com:value") || id;
    const lat = extractTag(block, "loc:latitude");
    const lon = extractTag(block, "loc:longitude");
    if (lat && lon) stations[id] = { id, name, lat: num(lat), lon: num(lon) };
  }
  return stations;
}

/** "Meteostaciju reāllaika mērījumi" -> { id: {...jaunākie rādījumi} } */
function parseMeasurements(xml) {
  const readings = {};
  const blockRe = /<roa:siteMeasurements>([\s\S]*?)<\/roa:siteMeasurements>/g;
  let m;
  while ((m = blockRe.exec(xml))) {
    const block = m[1];
    const idM = block.match(/measurementSiteReference id="([a-f0-9]+)"/);
    if (!idM) continue;
    const id = idM[1];
    const time = extractTag(block, "roa:timeValue") || "";

    // Katrai stacijai atdodam JAUNĀKO ierakstu (var būt vairāki 30 min logā)
    if (readings[id] && readings[id].time >= time) continue;

    const noPrecip = block.includes("<roa:noPrecipitation>true</roa:noPrecipitation>");
    const precipRate = num(extractNested(block, "roa:precipitationIntensity", "com:intensityPerHour"));

    readings[id] = {
      time,
      airTemp: num(extractNested(block, "com:airTemperature", "com:temperature")),
      dewPoint: num(extractNested(block, "com:dewPointTemperature", "com:temperature")),
      surfaceTemp: num(extractNested(block, "com:roadSurfaceTemperature", "com:temperature")),
      maxTemp: num(extractNested(block, "com:maximumTemperature", "com:temperature")),
      minTemp: num(extractNested(block, "com:minimumTemperature", "com:temperature")),
      humidity: num(extractNested(block, "com:relativeHumidity", "com:percentage")),
      visibilityM: num(extractNested(block, "com:minimumVisibilityDistance", "com:integerMetreDistance")),
      precipMmH: noPrecip ? 0 : precipRate,
      roadCondition: extractTag(block, "roa:weatherRelatedRoadConditionType"),
      // "com:friction" ir gan ārējā, gan iekšējā taga vārds - vispārīgais
      // extractNested apstājas pie iekšējā aizverošā taga pirms sasniedz
      // vērtību, tāpēc šeit vajag tiešu, abus līmeņus aptverošu regex.
      friction: num((block.match(/<com:friction>\s*<com:friction>([^<]*)<\/com:friction>/) || [])[1]),
      snowDepthM: num(extractNested(block, "com:depthOfSnow", "com:distance")),
      iceThicknessM: num(extractNested(block, "com:iceLayerThickness", "com:distance")),
      // "com:windSpeed" tāpat pati sevī ligzdota - tāda pati problēma kā friction
      windSpeed: num((block.match(/<com:windSpeed>\s*<com:windSpeed>([^<]*)<\/com:windSpeed>/) || [])[1]),
      windGust: num(extractNested(block, "com:maximumWindSpeed", "com:windSpeed")),
      windDir: num(extractNested(block, "com:windDirectionBearing", "com:directionBearing")),
      windGustDir: num(extractNested(block, "com:maximumWindDirectionBearing", "com:directionBearing")),
    };
  }
  return readings;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Cron Trigger izsauc šo - ielasa LVC feed un ieraksta D1. */
async function syncData(env) {
  const [locXml, measXml] = await Promise.all([
    fetchFeed(env.LVC_LOCATIONS_KEY),
    fetchFeed(env.LVC_MEASUREMENTS_KEY),
  ]);
  const locations = parseLocations(locXml);
  const readings = parseMeasurements(measXml);

  const stationStmts = Object.values(locations).map((s) =>
    env.DB.prepare(
      `INSERT INTO stations (id, name, lat, lon) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lon = excluded.lon`
    ).bind(s.id, s.name, s.lat, s.lon)
  );

  const readingStmts = Object.entries(readings)
    .filter(([id]) => locations[id]) // tikai stacijas, kam ir zināma atrašanās vieta
    .map(([id, r]) =>
      env.DB.prepare(
        `INSERT INTO readings
           (station_id, time, air_temp, dew_point, surface_temp, max_temp, min_temp,
            humidity, visibility_m, precip_mm_h, road_condition, friction, snow_depth_m, ice_thickness_m,
            wind_speed, wind_gust, wind_dir, wind_gust_dir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(station_id, time) DO NOTHING`
      ).bind(
        id, r.time, r.airTemp, r.dewPoint, r.surfaceTemp, r.maxTemp, r.minTemp,
        r.humidity, r.visibilityM, r.precipMmH, r.roadCondition, r.friction, r.snowDepthM, r.iceThicknessM,
        r.windSpeed, r.windGust, r.windDir, r.windGustDir
      )
    );

  // D1 batch() pieņem ierobežotu skaitu izteikumu vienā reizē - droši sadalām pa daļām.
  for (const part of chunk(stationStmts, 50)) await env.DB.batch(part);
  for (const part of chunk(readingStmts, 50)) await env.DB.batch(part);

  const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM readings WHERE time < ?").bind(cutoff).run();
}

const READING_COLUMNS = `
  r.time AS time, r.air_temp AS airTemp, r.dew_point AS dewPoint, r.surface_temp AS surfaceTemp,
  r.max_temp AS maxTemp, r.min_temp AS minTemp, r.humidity AS humidity, r.visibility_m AS visibilityM,
  r.precip_mm_h AS precipMmH, r.road_condition AS roadCondition, r.friction AS friction,
  r.snow_depth_m AS snowDepthM, r.ice_thickness_m AS iceThicknessM,
  r.wind_speed AS windSpeed, r.wind_gust AS windGust, r.wind_dir AS windDir, r.wind_gust_dir AS windGustDir
`;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncData(env));
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const stationId = url.searchParams.get("station");

    try {
      if (stationId) {
        const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600 * 1000).toISOString();
        const { results } = await env.DB.prepare(
          `SELECT ${READING_COLUMNS} FROM readings r
           WHERE r.station_id = ? AND r.time >= ? ORDER BY r.time ASC`
        ).bind(stationId, cutoff).all();
        return json({ station: stationId, history: results });
      }

      const { results } = await env.DB.prepare(
        `SELECT s.id AS id, s.name AS name, s.lat AS lat, s.lon AS lon, ${READING_COLUMNS}
         FROM stations s
         JOIN readings r ON r.station_id = s.id
         JOIN (SELECT station_id, MAX(time) AS maxt FROM readings GROUP BY station_id) latest
           ON latest.station_id = r.station_id AND latest.maxt = r.time`
      ).all();
      return json({ updated: new Date().toISOString(), stations: results });
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
  },
};
