-- LVC meteostaciju D1 shēma.
-- Ielīmē un izpildi šo Cloudflare panelī: D1 datubāze -> Console cilne.

CREATE TABLE IF NOT EXISTS stations (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat  REAL NOT NULL,
  lon  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS readings (
  station_id     TEXT NOT NULL,
  time           TEXT NOT NULL,
  air_temp       REAL,
  dew_point      REAL,
  surface_temp   REAL,
  max_temp       REAL,
  min_temp       REAL,
  humidity       REAL,
  visibility_m   REAL,
  precip_mm_h    REAL,
  road_condition TEXT,
  friction       REAL,
  snow_depth_m   REAL,
  ice_thickness_m REAL,
  wind_speed     REAL,
  wind_gust      REAL,
  wind_dir       REAL,
  wind_gust_dir  REAL,
  PRIMARY KEY (station_id, time)
);

CREATE INDEX IF NOT EXISTS idx_readings_time ON readings(time);

-- Ja tabula JAU eksistē (bez vēja kolonnām) - izpildi šīs 4 rindas atsevišķi
-- D1 Console, lai pievienotu vēja datus bez esošās vēstures dzēšanas:
-- ALTER TABLE readings ADD COLUMN wind_speed REAL;
-- ALTER TABLE readings ADD COLUMN wind_gust REAL;
-- ALTER TABLE readings ADD COLUMN wind_dir REAL;
-- ALTER TABLE readings ADD COLUMN wind_gust_dir REAL;
