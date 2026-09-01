// ─── CORE: models, state, utils, cache, URL, small helpers ───────────────────

// ─── MODELS ───────────────────────────────────────────────────────────────────
// id: Open-Meteo model identifier | res: grid resolution | days: forecast horizon
// dash: Chart.js borderDash pattern (empty = solid line)
const MODELS = [
  { id:'ecmwf_ifs025',              name:'ECMWF IFS', org:'ECMWF',               res:'9km',   days:10, color:'#2a78d6', dash:[] },
  { id:'ecmwf_aifs025',            name:'ECMWF AIFS', org:'ECMWF (AI)',           res:'25km',  days:10, color:'#29b6f6', dash:[] },
  { id:'gfs_seamless',              name:'GFS', org:'NOAA (USA)',           res:'13km',  days:16, color:'#1baf7a', dash:[6,3] },
  { id:'icon_seamless',             name:'ICON (global)', org:'Deutscher Wetterdienst (DWD)',        res:'11km',  days:7,  color:'#eda100', dash:[4,2] },
  { id:'icon_eu',                   name:'ICON-EU', org:'Deutscher Wetterdienst (DWD)',        res:'7km',   days:5,  color:'#eb6834', dash:[2,2] },
  { id:'gem_seamless',              name:'GEM', org:'Canadian Weather Service', res:'15km',  days:10, color:'#e34948', dash:[8,4] },
  { id:'ukmo_seamless',             name:'UKMO', org:'Met Office (UK)',      res:'10km',  days:7,  color:'#e87ba4', dash:[3,3] },
  { id:'metno_seamless',            name:'MET Norway', org:'MET Norway',           res:'1km',   days:10, color:'#B75074', dash:[5,2,1,2] },
  { id:'meteofrance_seamless',      name:'Météo-France', org:'Météo-France',        res:'1.5km', days:4,  color:'#805CD3', dash:[7,2] },
  { id:'jma_seamless',              name:'JMA', org:'JMA (Japan)',          res:'13km',  days:11, color:'#A9852E', dash:[4,4] },
  { id:'cma_grapes_global',         name:'CMA GRAPES', org:'CMA (China)',          res:'15km',  days:10, color:'#d63384', dash:[1,3] },
  { id:'meteofrance_arpege_europe', name:'ARPEGE Europe', org:'Météo-France',         res:'10km',  days:4,  color:'#0891b2', dash:[2,4] },
  { id:'knmi_harmonie_arome_europe',name:'HARMONIE NL', org:'KNMI (Netherlands)',   res:'2.5km', days:2,  color:'#4caf50', dash:[6,1,2,1] },
  { id:'dmi_harmonie_arome_europe', name:'HARMONIE DK', org:'DMI (Denmark)',        res:'2km',   days:3,  color:'#795548', dash:[3,5] },
];

// Models available in the daily forecast table selector
const TABLE_MODELS=[
  {id:'ecmwf_ifs025', name:'ECMWF IFS'},
  {id:'icon_eu', name:'ICON-EU'},
  {id:'metno_seamless', name:'MET Norway'},
];

// ─── STATE ────────────────────────────────────────────────────────────────────
// Single mutable state object - all UI reads from here, all updates write here
const S = {
  lat:56.946, lon:24.106,       // default: Riga, Latvia
  city:'Rīga', country:'Latvija',
  active: new Set(MODELS.map(m=>m.id)), // which models are shown on the temp chart
  tableModel:   'ecmwf_ifs025',
  precipModels: new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  windModels:   new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  cloudModel:   'ecmwf_ifs025',
  showSpread: localStorage.getItem('show_spread')!=='0', // shaded model-range band on the temp chart
  windUnit: localStorage.getItem('wind_unit')||'m/s', // 'm/s' or 'km/h'
  data: {},    // keyed by model id, holds raw Open-Meteo API responses
  dataTs: 0,   // epoch ms when the currently shown data was fetched (fresh or cache write time)
  charts: {},  // keyed by chart name, holds Chart.js instances
  geo: null,   // normalised current location {name,country,admin1,timezone,lat,lon} - for the save-location star
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const round=(v,d=1)=>v!=null?Math.round(v*(10**d))/(10**d):null;
const r0=v=>v!=null?Math.round(v):null;
const cssVar=n=>getComputedStyle(document.body).getPropertyValue(n).trim();
// API returns m/s (wind_speed_unit=ms); converts to km/h only when that unit is selected
const windConv=v=>v==null?null:S.windUnit==='km/h'?Math.round(v*3.6):Math.round(v*10)/10;

// ─── CACHE ───────────────────────────────────────────────────────────────────
const CACHE_TTL=60*60*1000; // 1 hour in ms
// Prefix is bumped when API request variables change, to invalidate stale entries
const CACHE_PFX='wx7_';

function getCached(lat,lon){
  try{
    const raw=localStorage.getItem(`${CACHE_PFX}${lat.toFixed(3)}_${lon.toFixed(3)}`);
    if(!raw)return null;
    const{ts,d}=JSON.parse(raw);
    return Date.now()-ts<CACHE_TTL?{d,ts}:null;
  }catch{return null;}
}

// "pirms N min" for the data timestamp; cache TTL caps this at ~1 h
function relTime(ts){
  if(!ts)return t('reltime.just_now');
  const m=Math.round((Date.now()-ts)/60000);
  return m<1?t('reltime.just_now'):t('reltime.min_ago',{n:m});
}

// Brief bottom-centre notification; auto-dismisses
let _toastTimer=null;
function showToast(msg,ms=5000){
  const el=$('toast');
  if(!el)return;
  el.textContent=msg;
  el.hidden=false;
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{el.hidden=true;},250);
  },ms);
}

function setCache(lat,lon,d){
  try{localStorage.setItem(`${CACHE_PFX}${lat.toFixed(3)}_${lon.toFixed(3)}`,JSON.stringify({ts:Date.now(),d}));}catch{}
}

// ─── URL STATE ───────────────────────────────────────────────────────────────
// Encodes current location into the URL so forecast links can be shared
function updateURL(){
  const p=new URLSearchParams({lat:S.lat,lon:S.lon,city:S.city,country:S.country});
  history.replaceState(null,'','?'+p);
}

// Restores location from URL params on page load (skips if no coords present)
function loadFromURL(){
  const p=new URLSearchParams(location.search);
  if(!p.has('lat')||!p.has('lon'))return;
  S.lat=parseFloat(p.get('lat'));
  S.lon=parseFloat(p.get('lon'));
  S.city=p.get('city')||S.city;
  S.country=p.get('country')||S.country;
  $('cityName').textContent=S.city;
  $('heroSub').textContent=S.country;
  S.geo={name:S.city,country:S.country,admin1:'',timezone:'',lat:S.lat,lon:S.lon};
}

