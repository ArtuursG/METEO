"""Bounded LVGMC marine samples; never download the full gridded CSV files."""
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

RESOURCES = {
    'wave': '2940095f-1606-4110-851d-83281116f159',
    'temperature': '60427fa8-051a-4603-9e22-e31ba7334e88',
    'current': '917d54f2-79b6-4743-b088-a1fe0eb6f837',
}

def marine(get, num, kind):
    resource = RESOURCES[kind]
    # One representative sea point per 0.25-degree bin, capped at 64 points.
    # The source grids differ: do not join parameters by an assumed common grid.
    sql = f'''WITH points AS (
      SELECT DISTINCT ON (round("Lat"*4),round("Lon"*4)) "Lat","Lon"
      FROM "{resource}" WHERE "Lat" BETWEEN 55.5 AND 58.5
      AND "Lon" BETWEEN 20 AND 24.7 AND "Value" ~ '^-?[0-9]+([.][0-9]+)?$'
      AND "Datetime"=(SELECT MIN("Datetime") FROM "{resource}"
        WHERE "Datetime">=date_trunc('hour',NOW() AT TIME ZONE 'UTC'))
      ORDER BY round("Lat"*4),round("Lon"*4),"Lat","Lon" LIMIT 64)
      SELECT t."Lat",t."Lon",t."Datetime",t."Value"
      FROM "{resource}" t JOIN points p ON t."Lat"=p."Lat" AND t."Lon"=p."Lon"
      WHERE t."Datetime">=date_trunc('hour',NOW() AT TIME ZONE 'UTC')
      AND t."Datetime"<date_trunc('hour',NOW() AT TIME ZONE 'UTC')+interval '9 days'
      ORDER BY t."Datetime",t."Lat",t."Lon" LIMIT 14000'''
    raw = json.loads(get('https://data.gov.lv/dati/api/3/action/datastore_search_sql?'+urlencode({'sql': sql})))
    if not raw.get('success'): raise ValueError('Marine query failed')
    records = raw['result']['records']
    if len(records) >= 14000: raise ValueError('Truncated marine response')
    points = {}
    for row in records:
        lat, lon, value = num(row.get('Lat')), num(row.get('Lon')), num(row.get('Value'))
        if lat is None or lon is None or not (55.5 <= lat <= 58.5 and 20 <= lon <= 24.7): continue
        time = datetime.fromisoformat(row['Datetime']).replace(tzinfo=timezone.utc).isoformat()
        point = points.setdefault((lat, lon), {'lat': lat, 'lon': lon, 'series': []})
        point['series'].append([time, value])
    valid = [p for p in points.values() if any(v is not None for _, v in p['series'])]
    if not valid: raise ValueError('No current marine forecast')
    for point in valid: point['series'].sort()
    return {'kind': kind, 'points': valid, 'source': 'LVĢMC / Copernicus Marine',
            'license': 'CC0-1.0', 'sampled': True, 'timeZone': 'UTC'}
