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
 *   Staciju sarakstā katrai stacijai ir arī rādījums ~1 h agrāk (prevTime,
 *   prevAirTemp) temperatūras tendencei; ja tāda nav - null.
 *   Gatavo staciju sarakstu cron saglabā tabulā "snapshots", tāpēc pārlūka
 *   pieprasījums nolasa vienu rindu, nevis skenē visus rādījumus.
 *   Tas pats cron atjauno arī lapas publiskos datus (MeteoAlarm brīdinājumi,
 *   LVĢMC hidro, NOAA Kp, LVĢMC jūras prognoze): ?data=<nosaukums>.
 *   Tabulu "snapshots" Worker izveido pats, nekas papildus nav jāiestata.
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

// Gatavs JSON teksts no D1. Īss kešs tikai pret vienlaicīgu pieprasījumu viļņiem:
// dati paši mainās ne biežāk kā ik 15 min, tāpēc 60 s neko nenovecina.
function cachedJson(text, maxAge = 60) {
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      ...CORS_HEADERS,
    },
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

// Temperatūras tendencei: katrai stacijai rādījums ~60 min pirms tās jaunākā (40-90 min
// robežās). Laiks glabājas kā ISO teksts, var būt ar laika joslas nobīdi, tāpēc SQL tikai
// aptuveni atlasa pēdējās stundas, bet precīzo izvēli dara JS ar Date.parse.
const TREND_LOOKBACK_HOURS = 3;
const TREND_MIN = 40, TREND_TARGET = 60, TREND_MAX = 90;

// Tikai rādījumi, kuros ir vērtība `key`: ja gaisa sensors uz brīdi neko nedeva,
// ņemam blakus rādījumu tajā pašā logā, nevis atdodam null.
function pickPrevious(latestTime, rows, key) {
  const latest = Date.parse(latestTime);
  if (!Number.isFinite(latest) || !rows) return null;
  let best = null, bestGap = Infinity, bestAge = Infinity;
  for (const r of rows) {
    if (r[key] == null) continue;
    const age = (latest - Date.parse(r.time)) / 60000;
    if (!(age >= TREND_MIN && age <= TREND_MAX)) continue;
    const gap = Math.abs(age - TREND_TARGET);
    // Vienādā attālumā priekšroka jaunākajam rādījumam
    if (gap < bestGap || (gap === bestGap && age < bestAge)) {
      best = r;
      bestGap = gap;
      bestAge = age;
    }
  }
  return best;
}

// Pēdējo stundu rādījumi ar temperatūru. Kļūdas gadījumā tukšs saraksts: stacijas
// tad tiek atdotas kā agrāk, tikai ar null tendences laukiem.
async function recentReadings(env) {
  try {
    const cutoff = new Date(Date.now() - TREND_LOOKBACK_HOURS * 3600 * 1000).toISOString();
    const { results } = await env.DB.prepare(
      `SELECT station_id AS id, time, air_temp AS airTemp
       FROM readings WHERE time >= ? AND air_temp IS NOT NULL`
    ).bind(cutoff).all();
    return results || [];
  } catch (e) {
    return [];
  }
}

/** Katrai stacijai pievieno prevTime un prevAirTemp (null, ja nav derīga rādījuma). */
function withPrevious(stations, recent) {
  const byStation = {};
  for (const r of recent) (byStation[r.id] = byStation[r.id] || []).push(r);
  return stations.map((s) => {
    const pa = pickPrevious(s.time, byStation[s.id], "airTemp");
    return { ...s, prevTime: pa ? pa.time : null, prevAirTemp: pa ? pa.airTemp : null };
  });
}

const READING_COLUMNS = `
  r.time AS time, r.air_temp AS airTemp, r.dew_point AS dewPoint, r.surface_temp AS surfaceTemp,
  r.max_temp AS maxTemp, r.min_temp AS minTemp, r.humidity AS humidity, r.visibility_m AS visibilityM,
  r.precip_mm_h AS precipMmH, r.road_condition AS roadCondition, r.friction AS friction,
  r.snow_depth_m AS snowDepthM, r.ice_thickness_m AS iceThicknessM,
  r.wind_speed AS windSpeed, r.wind_gust AS windGust, r.wind_dir AS windDir, r.wind_gust_dir AS windGustDir
`;

// Jaunākais rādījums katrai stacijai. CROSS JOIN nosaka cilpu secību: katrai stacijai
// pāris indeksa meklējumi, nevis visas "readings" tabulas pārskatīšana.
async function buildStationList(env) {
  const [{ results }, recent] = await Promise.all([
    env.DB.prepare(
      `SELECT s.id AS id, s.name AS name, s.lat AS lat, s.lon AS lon, ${READING_COLUMNS}
       FROM stations s CROSS JOIN readings r
       WHERE r.station_id = s.id
         AND r.time = (SELECT MAX(time) FROM readings WHERE station_id = s.id)`
    ).all(),
    recentReadings(env),
  ]);
  return { updated: new Date().toISOString(), stations: withPrevious(results || [], recent) };
}

// ─── PUBLISKIE DATI ──────────────────────────────────────────────────────────
// Agrāk tos būvēja GitHub Actions un publicēja ar Pages izvietošanu ik 30 min. Tagad tos
// atjauno šī Worker cron, katru savā ritmā, un glabā kā gatavu JSON tabulā "snapshots".
// Ja avots neatbild, paliek pēdējais labais momentuzņēmums ar savu sākotnējo laiku.
const DATA_GOV = "https://data.gov.lv/dati/dataset/40d80be5-0c09-47c4-80f3-fad4bec19f33/resource/";
const MARINE_RESOURCES = {
  wave: "2940095f-1606-4110-851d-83281116f159",
  temperature: "60427fa8-051a-4603-9e22-e31ba7334e88",
  current: "917d54f2-79b6-4743-b088-a1fe0eb6f837",
};
// every: minūtes starp pārbaudēm (avoti paši mainās retāk: brīdinājumi pēc vajadzības,
// hidro ik stundu, Kp ik 3 h, jūras prognoze dažas reizes dienā).
// heavy: lieli faili; vienā cron reizē tikai viens, lai iekļautos CPU laikā.
const PUBLIC_DATA = {
  warnings: { every: 15, build: () => getText("https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-latvia").then((x) => parseWarnings(x)) },
  aurora: { every: 30, build: () => getText("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").then(parseKp) },
  hydro: { every: 30, heavy: true, build: buildHydro },
  "marine-wave": { every: 240, heavy: true, build: () => buildMarine("wave") },
  "marine-temperature": { every: 240, heavy: true, build: () => buildMarine("temperature") },
  "marine-current": { every: 240, heavy: true, build: () => buildMarine("current") },
};

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "prognoze.lv public data cache" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  if (text.length > 12000000) throw new Error("Response too large");
  return text.replace(/^﻿/, "");
}
function dataNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// CSV ar pēdiņām (nosaukumos var būt komati). Rindas bez pēdiņām sadala ātri ar split,
// jo hidro failā to ir tūkstošiem un cron CPU laiks ir ierobežots.
function csvLine(line) {
  if (!line.includes('"')) return line.split(",");
  const out = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cell); cell = ""; }
    else cell += c;
  }
  out.push(cell);
  return out;
}
function csvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = lines.length ? csvLine(lines[0]).map((h) => h.trim()) : [];
  return lines.slice(1).map((l) => {
    const r = csvLine(l), row = {};
    for (let i = 0; i < head.length; i++) row[head[i]] = (r[i] ?? "").trim();
    return row;
  });
}

function xmlText(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
// Pirmā elementa teksts ar šo vārdu, ar jebkuru vārdtelpas prefiksu (cap:, c:, bez prefiksa)
function xmlField(block, name) {
  const m = block.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`));
  return m ? xmlText(m[1]) : "";
}

/** MeteoAlarm Atom (CAP 1.2) -> spēkā esošie brīdinājumi ar daudzstūriem */
function parseWarnings(xml, nowMs = Date.now()) {
  if (!/<feed[\s>]/.test(xml) || !xml.includes("http://www.w3.org/2005/Atom")) throw new Error("Invalid warning feed");
  const unique = new Map();
  for (const [, entry] of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)) {
    const item = {};
    for (const k of ["identifier", "areaDesc", "event", "severity", "onset", "expires", "status", "message_type"]) item[k] = xmlField(entry, k);
    if (item.status !== "Actual" || item.message_type === "Cancel") continue;
    if (!item.expires || !(Date.parse(item.expires) > nowMs)) continue;
    item.title = xmlField(entry, "title");
    item.polygons = [];
    for (const [, poly] of entry.matchAll(/<(?:[\w-]+:)?polygon(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?polygon>/g)) {
      const ring = xmlText(poly).split(/\s+/).filter(Boolean).map((pair) => pair.split(",").map(Number));
      if (ring.length >= 4 && ring.every((pt) => pt.length === 2 && pt[0] >= -90 && pt[0] <= 90 && pt[1] >= -180 && pt[1] <= 180)) item.polygons.push(ring);
    }
    // Saiti no plūsmas neuzskatām par uzticamu: vienmēr oficiālā lapa
    item.url = "https://meteoalarm.org/en/live/";
    const key = [item.identifier, item.areaDesc, item.event].join("|");
    if (unique.has(key)) unique.get(key).polygons.push(...item.polygons);
    else unique.set(key, item);
  }
  const updated = xml.match(/<feed[\s\S]*?<updated>([^<]*)<\/updated>/);
  return { alerts: [...unique.values()], sourceUpdated: updated ? updated[1].trim() : "", source: "MeteoAlarm / EUMETNET members", license: "CC BY 4.0" };
}

/** NOAA SWPC planetārais Kp (objekti vai vecais rindu formāts) */
function parseKp(text) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length < 2) throw new Error("Invalid Kp response");
  const records = Array.isArray(raw[0]) ? raw.slice(1).map((r) => Object.fromEntries(raw[0].map((h, i) => [h, r[i]]))) : raw;
  const values = [];
  for (const r of records) {
    const kp = dataNum(r.Kp);
    if (kp != null && r.time_tag) values.push({ time: String(r.time_tag).replace(" ", "T").replace(/Z$/, "") + "Z", kp });
  }
  if (!values.length) throw new Error("No Kp measurements");
  return { readings: values.slice(-16), source: "NOAA SWPC", kind: "planetary Kp observations" };
}

/** LVĢMC hidro: stacijas, parametri un pēdējie 48 rādījumi katram parametram */
function parseHydro(stationsCsv, readingsCsv, paramsCsv) {
  const meta = {};
  for (const p of csvRows(paramsCsv)) meta[p.ABBREVIATION] = { lv: p.LV_DESCRIPTION, en: p.EN_DESCRIPTION, unit: p.MEASUREMENT_UNIT };
  // Lielākais fails: rindas lasa tieši pēc kolonnu numuriem, bez starpobjektiem
  const by = {};
  const lines = readingsCsv.split(/\r?\n/);
  const head = csvLine(lines[0] || "").map((h) => h.trim());
  const [iSt, iCode, iTime, iVal] = ["STATION_ID", "ABBREVIATION", "DATETIME", "VALUE"].map((h) => head.indexOf(h));
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line) continue;
    const r = csvLine(line);
    const code = (r[iCode] || "").trim(), dt = (r[iTime] || "").trim(), value = dataNum(r[iVal]);
    // "2026.10.09 08:00:00" -> "2026-10-09T08:00:00" (vietējais laiks, bez zonas)
    if (value == null || !meta[code] || dt.length !== 19 || dt[4] !== "." || dt[7] !== "." || dt[10] !== " ") continue;
    const time = dt.slice(0, 4) + "-" + dt.slice(5, 7) + "-" + dt.slice(8, 10) + "T" + dt.slice(11);
    const id = (r[iSt] || "").trim();
    ((by[id] ||= {})[code] ||= []).push([time, value]);
  }
  const stations = [];
  for (const st of csvRows(stationsCsv)) {
    const values = by[st.STATION_ID], lat = dataNum(st.GEOGR2), lon = dataNum(st.GEOGR1);
    if (!values || lat == null || lon == null) continue;
    const series = {};
    for (const [k, v] of Object.entries(values)) series[k] = v.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])).slice(-48);
    stations.push({ id: st.STATION_ID, name: st.NAME, lat, lon, series });
  }
  if (!stations.length) throw new Error("No hydrological readings");
  return { stations, parameters: meta, timeZone: "Europe/Riga", source: "LVĢMC / data.gov.lv", license: "CC0-1.0" };
}
async function buildHydro() {
  const [stations, readings, params] = await Promise.all([
    getText(DATA_GOV + "93fd5e2c-20c4-496e-a920-ff29bda20383/download/hidro_stacijas.csv"),
    getText(DATA_GOV + "de5f06e9-6f44-497d-8ec2-72a2483608e8/download/hidro_operativie_dati.csv"),
    getText(DATA_GOV + "714ab60d-d93e-4403-b76d-2fb865d15d63/download/hidro_parametri.csv"),
  ]);
  return parseHydro(stations, readings, params);
}

/** LVĢMC jūras prognoze: ierobežots paraugs (viens punkts uz 0,25° šūnu, līdz 64 punktiem) */
function marineQuery(kind) {
  const res = MARINE_RESOURCES[kind];
  // Avota režģi atšķiras: parametrus nesavienojam pēc pieņemta kopīga režģa
  return `WITH points AS (
      SELECT DISTINCT ON (round("Lat"*4),round("Lon"*4)) "Lat","Lon"
      FROM "${res}" WHERE "Lat" BETWEEN 55.5 AND 58.5
      AND "Lon" BETWEEN 20 AND 24.7 AND "Value" ~ '^-?[0-9]+([.][0-9]+)?$'
      AND "Datetime"=(SELECT MIN("Datetime") FROM "${res}"
        WHERE "Datetime">=date_trunc('hour',NOW() AT TIME ZONE 'UTC'))
      ORDER BY round("Lat"*4),round("Lon"*4),"Lat","Lon" LIMIT 64)
      SELECT t."Lat",t."Lon",t."Datetime",t."Value"
      FROM "${res}" t JOIN points p ON t."Lat"=p."Lat" AND t."Lon"=p."Lon"
      WHERE t."Datetime">=date_trunc('hour',NOW() AT TIME ZONE 'UTC')
      AND t."Datetime"<date_trunc('hour',NOW() AT TIME ZONE 'UTC')+interval '9 days'
      ORDER BY t."Datetime",t."Lat",t."Lon" LIMIT 14000`;
}
function parseMarine(text, kind) {
  const raw = JSON.parse(text);
  if (!raw.success) throw new Error("Marine query failed");
  const records = raw.result?.records || [];
  if (records.length >= 14000) throw new Error("Truncated marine response");
  const points = new Map();
  for (const row of records) {
    const lat = dataNum(row.Lat), lon = dataNum(row.Lon), value = dataNum(row.Value);
    if (lat == null || lon == null || !(lat >= 55.5 && lat <= 58.5 && lon >= 20 && lon <= 24.7) || !row.Datetime) continue;
    // Avota laiks ir UTC bez zonas norādes
    const time = String(row.Datetime).replace(" ", "T").slice(0, 19) + "+00:00";
    const key = lat + "," + lon;
    if (!points.has(key)) points.set(key, { lat, lon, series: [] });
    points.get(key).series.push([time, value]);
  }
  const valid = [...points.values()].filter((p) => p.series.some(([, v]) => v != null));
  if (!valid.length) throw new Error("No current marine forecast");
  for (const p of valid) p.series.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { kind, points: valid, source: "LVĢMC / Copernicus Marine", license: "CC0-1.0", sampled: true, timeZone: "UTC" };
}
async function buildMarine(kind) {
  const url = "https://data.gov.lv/dati/api/3/action/datastore_search_sql?" + new URLSearchParams({ sql: marineQuery(kind) });
  return parseMarine(await getText(url), kind);
}

async function ensureSnapshots(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS snapshots (name TEXT PRIMARY KEY, json TEXT NOT NULL, fetched TEXT, checked TEXT NOT NULL)`
  ).run();
}
// Saglabā veiksmīgu rezultātu; kļūdas gadījumā atzīmē tikai pārbaudes laiku
async function storeSnapshot(env, name, build) {
  const at = new Date().toISOString();
  try {
    const body = JSON.stringify({ fetchedAt: at, ok: true, ...(await build()) });
    await env.DB.prepare(
      `INSERT INTO snapshots (name, json, fetched, checked) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET json = excluded.json, fetched = excluded.fetched, checked = excluded.checked`
    ).bind(name, body, at, at).run();
  } catch (e) {
    await env.DB.prepare(
      `INSERT INTO snapshots (name, json, fetched, checked) VALUES (?, ?, NULL, ?)
       ON CONFLICT(name) DO UPDATE SET checked = excluded.checked`
    ).bind(name, JSON.stringify({ ok: false, fetchedAt: at, error: "Source unavailable" }), at).run();
  }
}
// Kuri publiskie dati šoreiz jāatjauno: termiņš pagājis, vecākie vispirms, smagie pa vienam
function dueData(checked, nowMs) {
  let heavy = 0;
  return Object.keys(PUBLIC_DATA)
    .filter((name) => !(nowMs - (checked[name] || 0) < (PUBLIC_DATA[name].every - 2) * 60000))
    .sort((a, b) => (checked[a] || 0) - (checked[b] || 0))
    .filter((name) => !PUBLIC_DATA[name].heavy || heavy++ < 1);
}

async function runCron(env) {
  await ensureSnapshots(env);
  try {
    await syncData(env);
    await env.DB.prepare(
      `INSERT INTO snapshots (name, json, fetched, checked) VALUES ('lvc', ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET json = excluded.json, fetched = excluded.fetched, checked = excluded.checked`
    ).bind(JSON.stringify(await buildStationList(env)), new Date().toISOString(), new Date().toISOString()).run();
  } catch (e) {
    console.log("LVC sinhronizācija neizdevās:", String(e));
  }
  const { results } = await env.DB.prepare("SELECT name, checked FROM snapshots").all();
  const checked = Object.fromEntries((results || []).map((r) => [r.name, Date.parse(r.checked) || 0]));
  for (const name of dueData(checked, Date.now())) await storeSnapshot(env, name, PUBLIC_DATA[name].build);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const stationId = url.searchParams.get("station");
    const dataName = url.searchParams.get("data");

    try {
      if (dataName) {
        if (!Object.hasOwn(PUBLIC_DATA, dataName)) return json({ error: "Unknown data" }, 404);
        const row = await env.DB.prepare("SELECT json FROM snapshots WHERE name = ?").bind(dataName).first();
        return row ? cachedJson(row.json) : json({ ok: false, error: "Not ready" }, 503);
      }

      if (stationId) {
        const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600 * 1000).toISOString();
        const { results } = await env.DB.prepare(
          `SELECT ${READING_COLUMNS} FROM readings r
           WHERE r.station_id = ? AND r.time >= ? ORDER BY r.time ASC`
        ).bind(stationId, cutoff).all();
        return json({ station: stationId, history: results });
      }

      // Gatavais saraksts no pēdējā cron; ja tā vēl nav (tikko izvietots), aprēķina uzreiz
      let row = null;
      try {
        row = await env.DB.prepare("SELECT json FROM snapshots WHERE name = 'lvc'").first();
      } catch (e) {}
      return row ? cachedJson(row.json) : json(await buildStationList(env));
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
  },

  // Tikai testiem (Node): tīrās parsēšanas funkcijas
  parsers: { csvRows, parseWarnings, parseKp, parseHydro, parseMarine, dueData },
};
