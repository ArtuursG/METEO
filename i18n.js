// ─── I18N ────────────────────────────────────────────────────────────────────
// Loaded before app.js. Exposes: LANG, LOCALE, t(key, vars), COMPASS,
// setLang(l), applyStaticI18n(). Language: ?lang= param > localStorage > 'lv'.

const I18N_LANGS = ['lv', 'en'];

function _detectLang(){
  try{
    const q = new URLSearchParams(location.search).get('lang');
    if(I18N_LANGS.includes(q)){ localStorage.setItem('lang', q); return q; }
    const s = localStorage.getItem('lang');
    if(I18N_LANGS.includes(s)) return s;
  }catch{}
  return 'lv';
}

let LANG = _detectLang();
let LOCALE = LANG === 'en' ? 'en-GB' : 'lv-LV';

// 16-point compass, index 0 = North, clockwise
const COMPASS = {
  lv: ['Z','ZZA','ZA','AZA','A','ADA','DA','DDA','D','DDR','DR','RDR','R','RZR','ZR','ZZR'],
  en: ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'],
};

const STR = {
  lv: {
    'meta.title': 'prognoze.lv - 14 laika prognožu modeļu salīdzinājums',

    'ui.skip': 'Pāriet uz saturu',
    'ui.search_ph': 'Meklēt pilsētu...',
    'ui.search': 'Meklēt',
    'ui.my_location': 'Mana atrašanās vieta',
    'ui.toggle_theme': 'Mainīt tēmu',
    'ui.toggle_lang': 'Switch to English',
    'ui.save_place': 'Saglabāt šo vietu',
    'ui.unsave_place': 'Noņemt no saglabātajām vietām',
    'ui.share_wa': 'Dalīties WhatsApp',
    'ui.share_tg': 'Dalīties Telegram',

    'metric.current': 'Pašreizējā',
    'metric.feels': 'Sajūta',
    'metric.today_max': 'Šodienas max',
    'metric.min': 'Min',
    'metric.wind': 'Vējš',
    'metric.humidity': 'Mitrums',
    'metric.models': 'Modeļi',
    'metric.active_models': 'aktīvi modeļi',
    'metric.loading': 'Ielādē...',
    'metric.precip': 'Nokrišņi',
    'metric.direction': 'Virziens',
    'metric.gust': 'brāzmas',
    'metric.snow': 'sniegs',
    'metric.source': 'Pašreizējie dati',
    'metric.updated': 'atjaunoti',
    'metric.updated_prefix': 'Dati atjaunoti',
    'unit.days': 'dienas',
    'models.resolution': 'Izšķirtspēja',
    'models.forecast': 'Prognoze',
    'a11y.tabs': 'Datu skati',
    'radar.now': 'Tagad',

    'feels.warmer': 'Siltāk nekā ir',
    'feels.colder': 'Aukstāk nekā ir',
    'feels.matches': 'Atbilst temperatūrai',

    'tab.temp': 'Temperatūra',
    'tab.precip': 'Nokrišņi',
    'tab.wind': 'Vējš',
    'tab.table': 'Tabula',
    'tab.cloud': 'Mākoņi',
    'tab.uv': 'UV',
    'tab.climate': 'Klimats',
    'tab.radar': 'Radars',
    'tab.models': 'Modeļi',

    'card.temp_title': 'Temperatūra 2m - modeļu salīdzinājums (16 dienas)',
    'card.model_hint': 'Izvēlies kurus modeļus rādīt grafikā - klikšķini uz modeļa nosaukuma',
    'card.show_spread': 'Rādīt modeļu izkliedi',
    'card.precip_prob': 'Nokrišņu varbūtība (%)',
    'card.precip_prob_sub': 'tie paši modeļi, kas izvēlēti augšpusē',
    'card.uv_title': 'UV indekss',
    'card.climate_title': 'Klimats un anomālija',
    'card.climate_src': 'Dati: ERA5 (1940-) · Open-Meteo',
    'card.radar_title': 'Nokrišņu radars',
    'card.radar_src': 'Dati: RainViewer',
    'card.stations': 'Meteostacijas',
    'card.verif_title': 'Modeļu precizitāte pēdējās 48 h',
    'card.models_title': 'Meteoroloģiskie modeļi',

    'chart.aria_temp': 'Temperatūras prognoze ar modeļu izkliedes joslu',
    'chart.aria_precip': 'Nokrišņu prognoze',
    'chart.aria_precip_prob': 'Nokrišņu varbūtība',
    'chart.aria_wind': 'Vēja ātrums',
    'chart.aria_cloud': 'Mākoņu sega',
    'chart.aria_uv': 'UV indekss',
    'chart.aria_verif': 'Novērojumi pret modeļu prognozēm',
    'chart.precip_mm': 'Nokrišņi (mm)',
    'chart.wind_speed': 'Vēja ātrums 10m',
    'chart.cloud_cover': 'Mākoņu sega (%)',
    'chart.forecast_daily': 'Prognoze pa dienām',
    'chart.model_range': 'Modeļu diapazons',
    'chart.measured': 'mērīts',
    'chart.no_precip_prob': 'Nokrišņu varbūtības dati nav pieejami izvēlētajiem modeļiem.',

    'sel.all': 'Visi',
    'sel.none': 'Neviens',
    'sel.model_show': '{name} - rādīt grafikā',

    'spread.agree': 'modeļi lielā mērā vienojas (±{n}°C nākamajās 48 h)',
    'spread.medium': 'vidēja modeļu izkliede (±{n}°C nākamajās 48 h)',
    'spread.high': 'liela nenoteiktība – modeļi būtiski atšķiras (±{n}°C nākamajās 48 h)',
    'spread.tooltip_range': 'Diapazons: {min}–{max}°C (Δ {d}°)',

    'th.date': 'Datums', 'th.time': 'Laiks', 'th.max_c': 'Max °C', 'th.min_c': 'Min °C',
    'th.precip': 'Nokrišņi', 'th.precip_pct': 'Nokrišņi %', 'th.wind_max': 'Vējš max',
    'th.cloud': 'Mākoņi', 'th.humidity': 'Mitrums',
    'th.station': 'Stacija', 'th.dist': 'Attālums', 'th.air_t': 'Gaisa t.',
    'th.road_t': 'Ceļa t.', 'th.feels_t': 'Sajūtu t.', 'th.wind': 'Vējš',
    'th.precip_h': 'Nokrišņi (h)', 'th.road_cond': 'Ceļa stāvoklis',
    'th.min_t': 'min t°', 'th.max_t': 'max t°',
    'th.model': 'Modelis', 'th.mae': 'Vidējā kļūda (MAE)', 'th.bias': 'Novirze', 'th.points': 'Punkti',

    'wx.clear': 'Skaidrs', 'wx.partly': 'Mākoņains', 'wx.cloud': 'Apmācies',
    'wx.fog': 'Migla', 'wx.drizzle': 'Smidzina', 'wx.rain': 'Lietus',
    'wx.snow': 'Sniegs', 'wx.thunder': 'Pērkons',

    'cloud.clear': 'Skaidrs', 'cloud.partly': 'Daļēji mākoņains',
    'cloud.cloudy': 'Mākoņains', 'cloud.overcast': 'Apmācies',

    'uv.low': 'Zems', 'uv.moderate': 'Mērens', 'uv.high': 'Augsts',
    'uv.veryhigh': 'Ļoti augsts', 'uv.extreme': 'Ārkārtējs',

    'road.dry': 'Sauss', 'road.wet': 'Slapjš', 'road.moist': 'Mitrs',
    'road.frost': 'Sarma', 'road.ice': 'Apledojums/sniegs', 'road.wetdirty': 'Slapjš, netīrs',

    'moon.0': 'Jaunmēness', 'moon.1': 'Augošs pusmēness', 'moon.2': 'Pirmais ceturksnis',
    'moon.3': 'Augošs', 'moon.4': 'Pilnmēness', 'moon.5': 'Dilstošs',
    'moon.6': 'Pēdējais ceturksnis', 'moon.7': 'Dilstošs pusmēness',

    'reltime.just_now': 'tikko',
    'reltime.min_ago': 'pirms {n} min',

    'err.load_failed': 'Neizdevās ielādēt datus. Pārbaudiet interneta savienojumu.',
    'toast.reload_failed': 'Neizdevās ielādēt jaunos datus. Rādīti iepriekšējie.',
    'search.searching': 'Meklē...',
    'search.not_found': 'Pilsēta netika atrasta',
    'err.prefix': 'Kļūda',

    'geo.current_location': 'Pašreizējā atrašanās vieta',

    'favs.saved': 'Saglabātās vietas',
    'favs.recent': 'Nesenie meklējumi',
    'favs.remove': 'Noņemt {name} no saglabātajām',

    'radar.loading': 'Ielādē...',
    'radar.load_failed': 'Neizdevās ielādēt radara datus.',
    'radar.lvc_tab': 'Ceļa meteostacijas (LVC)',
    'radar.lvgmc_tab': 'LVĢMC meteostacijas',
    'radar.lvc_src': 'Dati: transportdata.gov.lv (LVC)',
    'radar.lvgmc_src': 'Dati: data.gov.lv (LVĢMC)',
    'radar.lvc_failed': 'Neizdevās ielādēt ceļa meteostaciju datus.',
    'radar.lvgmc_failed': 'Neizdevās ielādēt LVĢMC staciju datus.',
    'radar.stations_count': '{n} stacijas',
    'radar.overlay_lvc': 'Ceļa meteostacijas (LVC)',
    'radar.overlay_lvgmc': 'LVĢMC meteostacijas',
    'radar.attr': 'Radars: <a href="https://www.rainviewer.com" target="_blank">RainViewer</a> · Meteostacijas: <a href="https://www.transportdata.gov.lv" target="_blank">LVC</a> / <a href="https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi" target="_blank">LVĢMC</a>',

    'basemap.light': 'Gaišā', 'basemap.dark': 'Tumšā', 'basemap.osm': 'OpenStreetMap',
    'basemap.relief': 'Reljefs', 'basemap.satellite': 'Satelīts',

    'station.dist_away': '{n} km attālumā',
    'station.history_24h': '24h vēsture ->',
    'station.road_surface_t': 'Ceļa virsmas temp.',
    'station.feels_t': 'Sajūtu temp.',
    'station.wind': 'Vējš',
    'station.gust': 'Brāzmas',
    'station.precip': 'Nokrišņi',
    'station.precip_h': 'Nokrišņi (h)',
    'station.visibility': 'Redzamība',
    'station.road_cond': 'Ceļa stāvoklis',
    'station.humidity': 'Mitrums',
    'station.air_t': 'Gaisa temp.',
    'station.dew_point': 'Rasas punkts',
    'station.pressure': 'Spiediens',
    'station.uv': 'UV indekss',
    'station.minmax_24h': '24h min / max',

    'clim.anom_lbl': 'salīdzinājumā ar 1991-2020 normu šai datumai',
    'clim.loading': 'Ielādē vēsturiskos datus...',
    'clim.stripes_hd': 'Gada vidējā temperatūra pa gadiem',
    'clim.stripes_aria': 'Sasilšanas svītras - gada vidējā temperatūra pa gadiem',
    'clim.note': 'Anomālija = novirze no 1991-2020 gada vidējā šajā vietā. Sasilšanas svītru krāsu skala centrēta uz 1961-1990 vidējo (zila = vēsāks, sarkana = siltāks). Avots: ERA5 reanalīze caur Open-Meteo Archive API.',
    'clim.err': 'Neizdevās ielādēt vēsturiskos klimata datus.',
    'clim.anom_today': 'šodien pret 1991-2020 normu ({n}°C) šai datumai',
    'clim.anom_nodata': 'nepietiek datu šodienas anomālijai',
    'clim.year_note': '{year}. gads: vidēji {mean}°C — {diff}°C pret 1961-1990. gadu vidējo ({centre}°C).',
    'clim.stripe_tooltip': '{year}: {mean}°C ({diff}°C)',
    'clim.stripe_partial': ' — nepilns gads',

    'verif.loading': 'Salīdzina ar meteostaciju...',
    'verif.intro': 'Pēdējās 48 h precīzākais {station} stacijai bija {best} — vidējā kļūda {mae}°C. Salīdzināti {count} modeļi pret faktiski izmērīto gaisa temperatūru.',
    'verif.station': 'Stacija: {name} (~{dist} km)',
    'verif.note': 'MAE = vidējā absolūtā kļūda (jo mazāka, jo precīzāk). Novirze: pozitīva = modelis rāda siltāk nekā stacija mērīja. Salīdzināts ar tuvāko LVĢMC staciju un modeļu jaunāko analīzi/tuvprognozi par pēdējām 48 h - tā nav "prognoze, kāda tā bija izdota pirms 2 dienām".',
    'verif.err': 'Neizdevās aprēķināt precizitāti (nav tuvu meteostacijas ar vēsturi vai neizdevās ielādēt datus).',
    'verif.measured': 'mērīts',

    'share.text': 'Laika prognoze - {city}',
    'footer.data': 'Dati',
  },

  en: {
    'meta.title': 'prognoze.lv - 14 weather forecast models compared',

    'ui.skip': 'Skip to content',
    'ui.search_ph': 'Search for a city...',
    'ui.search': 'Search',
    'ui.my_location': 'My location',
    'ui.toggle_theme': 'Toggle theme',
    'ui.toggle_lang': 'Pārslēgt uz latviešu',
    'ui.save_place': 'Save this place',
    'ui.unsave_place': 'Remove from saved places',
    'ui.share_wa': 'Share on WhatsApp',
    'ui.share_tg': 'Share on Telegram',

    'metric.current': 'Now',
    'metric.feels': 'Feels like',
    'metric.today_max': 'Today max',
    'metric.min': 'Min',
    'metric.wind': 'Wind',
    'metric.humidity': 'Humidity',
    'metric.models': 'Models',
    'metric.active_models': 'active models',
    'metric.loading': 'Loading...',
    'metric.precip': 'Precip.',
    'metric.direction': 'Direction',
    'metric.gust': 'gusts',
    'metric.snow': 'snow',
    'metric.source': 'Current data',
    'metric.updated': 'updated',
    'metric.updated_prefix': 'Data updated',
    'unit.days': 'days',
    'models.resolution': 'Resolution',
    'models.forecast': 'Forecast',
    'a11y.tabs': 'Data views',
    'radar.now': 'Now',

    'feels.warmer': 'Warmer than actual',
    'feels.colder': 'Colder than actual',
    'feels.matches': 'Matches the temperature',

    'tab.temp': 'Temperature',
    'tab.precip': 'Precipitation',
    'tab.wind': 'Wind',
    'tab.table': 'Table',
    'tab.cloud': 'Clouds',
    'tab.uv': 'UV',
    'tab.climate': 'Climate',
    'tab.radar': 'Radar',
    'tab.models': 'Models',

    'card.temp_title': 'Temperature 2m - model comparison (16 days)',
    'card.model_hint': 'Choose which models to show on the chart - click a model name',
    'card.show_spread': 'Show model spread',
    'card.precip_prob': 'Precipitation probability (%)',
    'card.precip_prob_sub': 'same models as selected above',
    'card.uv_title': 'UV index',
    'card.climate_title': 'Climate and anomaly',
    'card.climate_src': 'Data: ERA5 (1940-) · Open-Meteo',
    'card.radar_title': 'Precipitation radar',
    'card.radar_src': 'Data: RainViewer',
    'card.stations': 'Weather stations',
    'card.verif_title': 'Model accuracy over the past 48 h',
    'card.models_title': 'Weather models',

    'chart.aria_temp': 'Temperature forecast with model spread band',
    'chart.aria_precip': 'Precipitation forecast',
    'chart.aria_precip_prob': 'Precipitation probability',
    'chart.aria_wind': 'Wind speed',
    'chart.aria_cloud': 'Cloud cover',
    'chart.aria_uv': 'UV index',
    'chart.aria_verif': 'Observations vs model forecasts',
    'chart.precip_mm': 'Precipitation (mm)',
    'chart.wind_speed': 'Wind speed 10m',
    'chart.cloud_cover': 'Cloud cover (%)',
    'chart.forecast_daily': 'Daily forecast',
    'chart.model_range': 'Model range',
    'chart.measured': 'measured',
    'chart.no_precip_prob': 'Precipitation probability is not available for the selected models.',

    'sel.all': 'All',
    'sel.none': 'None',
    'sel.model_show': '{name} - show on chart',

    'spread.agree': 'models largely agree (±{n}°C over the next 48 h)',
    'spread.medium': 'moderate model spread (±{n}°C over the next 48 h)',
    'spread.high': 'high uncertainty – models differ substantially (±{n}°C over the next 48 h)',
    'spread.tooltip_range': 'Range: {min}–{max}°C (Δ {d}°)',

    'th.date': 'Date', 'th.time': 'Time', 'th.max_c': 'Max °C', 'th.min_c': 'Min °C',
    'th.precip': 'Precip.', 'th.precip_pct': 'Precip. %', 'th.wind_max': 'Wind max',
    'th.cloud': 'Clouds', 'th.humidity': 'Humidity',
    'th.station': 'Station', 'th.dist': 'Distance', 'th.air_t': 'Air t.',
    'th.road_t': 'Road t.', 'th.feels_t': 'Feels t.', 'th.wind': 'Wind',
    'th.precip_h': 'Precip. (h)', 'th.road_cond': 'Road condition',
    'th.min_t': 'min t°', 'th.max_t': 'max t°',
    'th.model': 'Model', 'th.mae': 'Mean error (MAE)', 'th.bias': 'Bias', 'th.points': 'Points',

    'wx.clear': 'Clear', 'wx.partly': 'Partly cloudy', 'wx.cloud': 'Overcast',
    'wx.fog': 'Fog', 'wx.drizzle': 'Drizzle', 'wx.rain': 'Rain',
    'wx.snow': 'Snow', 'wx.thunder': 'Thunderstorm',

    'cloud.clear': 'Clear', 'cloud.partly': 'Partly cloudy',
    'cloud.cloudy': 'Cloudy', 'cloud.overcast': 'Overcast',

    'uv.low': 'Low', 'uv.moderate': 'Moderate', 'uv.high': 'High',
    'uv.veryhigh': 'Very high', 'uv.extreme': 'Extreme',

    'road.dry': 'Dry', 'road.wet': 'Wet', 'road.moist': 'Moist',
    'road.frost': 'Frost', 'road.ice': 'Ice/snow', 'road.wetdirty': 'Wet, dirty',

    'moon.0': 'New moon', 'moon.1': 'Waxing crescent', 'moon.2': 'First quarter',
    'moon.3': 'Waxing gibbous', 'moon.4': 'Full moon', 'moon.5': 'Waning gibbous',
    'moon.6': 'Last quarter', 'moon.7': 'Waning crescent',

    'reltime.just_now': 'just now',
    'reltime.min_ago': '{n} min ago',

    'err.load_failed': 'Could not load data. Check your internet connection.',
    'toast.reload_failed': 'Could not load the new data. Showing the previous location.',
    'search.searching': 'Searching...',
    'search.not_found': 'City not found',
    'err.prefix': 'Error',

    'geo.current_location': 'Current location',

    'favs.saved': 'Saved places',
    'favs.recent': 'Recent searches',
    'favs.remove': 'Remove {name} from saved',

    'radar.loading': 'Loading...',
    'radar.load_failed': 'Could not load radar data.',
    'radar.lvc_tab': 'Road weather stations (LVC)',
    'radar.lvgmc_tab': 'LVĢMC weather stations',
    'radar.lvc_src': 'Data: transportdata.gov.lv (LVC)',
    'radar.lvgmc_src': 'Data: data.gov.lv (LVĢMC)',
    'radar.lvc_failed': 'Could not load road weather station data.',
    'radar.lvgmc_failed': 'Could not load LVĢMC station data.',
    'radar.stations_count': '{n} stations',
    'radar.overlay_lvc': 'Road weather stations (LVC)',
    'radar.overlay_lvgmc': 'LVĢMC weather stations',
    'radar.attr': 'Radar: <a href="https://www.rainviewer.com" target="_blank">RainViewer</a> · Stations: <a href="https://www.transportdata.gov.lv" target="_blank">LVC</a> / <a href="https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi" target="_blank">LVĢMC</a>',

    'basemap.light': 'Light', 'basemap.dark': 'Dark', 'basemap.osm': 'OpenStreetMap',
    'basemap.relief': 'Relief', 'basemap.satellite': 'Satellite',

    'station.dist_away': '{n} km away',
    'station.history_24h': '24h history ->',
    'station.road_surface_t': 'Road surface temp.',
    'station.feels_t': 'Feels-like temp.',
    'station.wind': 'Wind',
    'station.gust': 'Gusts',
    'station.precip': 'Precipitation',
    'station.precip_h': 'Precipitation (h)',
    'station.visibility': 'Visibility',
    'station.road_cond': 'Road condition',
    'station.humidity': 'Humidity',
    'station.air_t': 'Air temp.',
    'station.dew_point': 'Dew point',
    'station.pressure': 'Pressure',
    'station.uv': 'UV index',
    'station.minmax_24h': '24h min / max',

    'clim.anom_lbl': 'compared with the 1991-2020 normal for this date',
    'clim.loading': 'Loading historical data...',
    'clim.stripes_hd': 'Annual mean temperature by year',
    'clim.stripes_aria': 'Warming stripes - annual mean temperature by year',
    'clim.note': 'Anomaly = deviation from the 1991-2020 annual mean at this location. The warming-stripes colour scale is centred on the 1961-1990 mean (blue = cooler, red = warmer). Source: ERA5 reanalysis via the Open-Meteo Archive API.',
    'clim.err': 'Could not load historical climate data.',
    'clim.anom_today': 'today vs the 1991-2020 normal ({n}°C) for this date',
    'clim.anom_nodata': 'not enough data for today’s anomaly',
    'clim.year_note': '{year}: {mean}°C on average — {diff}°C vs the 1961-1990 annual mean ({centre}°C).',
    'clim.stripe_tooltip': '{year}: {mean}°C ({diff}°C)',
    'clim.stripe_partial': ' — partial year',

    'verif.loading': 'Comparing with a weather station...',
    'verif.intro': 'Over the past 48 h the most accurate model for {station} was {best} — mean error {mae}°C. {count} models compared against the measured air temperature.',
    'verif.station': 'Station: {name} (~{dist} km)',
    'verif.note': 'MAE = mean absolute error (lower is better). Bias: positive = the model runs warmer than the station measured. Compared against the nearest LVĢMC station and each model’s latest analysis / nowcast for the past 48 h - this is not "the forecast as it was issued two days ago".',
    'verif.err': 'Could not compute accuracy (no nearby station with history, or data failed to load).',
    'verif.measured': 'measured',

    'share.text': 'Weather forecast - {city}',
    'footer.data': 'Data',
  },
};

function t(key, vars){
  let s = (STR[LANG] && STR[LANG][key]) ?? STR.lv[key] ?? key;
  if(vars) for(const k in vars) s = s.replaceAll('{'+k+'}', vars[k]);
  return s;
}

// Applies [data-i18n] (textContent), [data-i18n-ph] (placeholder),
// [data-i18n-title] (title + aria-label), [data-i18n-aria] (aria-label only),
// [data-i18n-html] (innerHTML) across the document.
function applyStaticI18n(root=document){
  root.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el=>{ el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach(el=>{
    const v = t(el.dataset.i18nTitle); el.title = v; el.setAttribute('aria-label', v);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.documentElement.lang = LANG;
  const tt = STR[LANG]['meta.title']; if(tt) document.title = tt;
  const lt = document.getElementById('langToggle');
  if(lt) lt.textContent = LANG === 'lv' ? 'EN' : 'LV';
}

function setLang(l){
  if(!I18N_LANGS.includes(l) || l === LANG) return;
  LANG = l;
  LOCALE = LANG === 'en' ? 'en-GB' : 'lv-LV';
  try{ localStorage.setItem('lang', l); }catch{}
  try{
    const u = new URL(location.href);
    u.searchParams.set('lang', l);
    history.replaceState(null, '', u);
  }catch{}
  applyStaticI18n();
  if(typeof relangUI === 'function') relangUI();
}
