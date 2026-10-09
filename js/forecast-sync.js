// ─── FORECAST SYNC: which models to ask Open-Meteo for, and the saved copy ──────
// Pure helpers (no DOM), loaded before data.js and required by the Node tests.
// Open-Meteo weighs a request by variables × models × days (from 14 days on), so the
// forecast is kept per model: a model is asked for again only when Open-Meteo has a newer
// run of it (run times come with the LVC worker's live answer, radar.js ensureHome), and the
// "now" values with sunrise/sunset come from a small ECMWF request every 15 minutes. The rest
// of the app sees the same S.data shape as before: {modelId:{hourly,daily,current?,utcOffset}}.

const FS_NOW_EVERY=15*60*1000;          // current conditions follow the clock, not model runs
const FS_FALLBACK_EVERY=30*60*1000;     // a model without a known run time: every 30 min as before
const FS_RUN_SETTLE=10*60*1000;         // Open-Meteo's servers catch up within ~10 min of a new run
const FS_RUNS_MAX_AGE=40*60*1000;       // older run times (worker cron stuck) are not trusted
const FS_MODEL_MAX_AGE=12*3600*1000;    // last resort even when the run times say nothing changed
const FS_ABSENT_RECHECK=3*3600*1000;    // a model outside its area (missing from the answer)

// Local date at the place (timezone=auto answers start at local midnight)
const fsLocalDay=(nowMs,off)=>new Date(nowMs+(off||0)*1000).toISOString().slice(0,10);
// The run times and the seamless model makeup behind them are worked out for Europe
const fsInEurope=(lat,lon)=>lat>=34&&lat<=72&&lon>=-25&&lon<=45;
const fsSameTimes=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a[0]===b[0]&&a[a.length-1]===b[b.length-1];

function emptyForecast(){return {day:null,off:0,time:null,now:null,models:{}};}

// What to ask for now: {models:[ids], now:boolean}.
// runs: {models:{id:unix seconds|null}, checkedAt:ms} from the live answer, or null.
function forecastPlan(cache,{nowMs,ids,runs=null,lat,lon}){
  const c=cache||emptyForecast();
  const today=c.day?fsLocalDay(nowMs,c.off):null;
  const sameDay=!!c.day&&c.day===today;
  const runsOk=!!runs&&nowMs-runs.checkedAt<FS_RUNS_MAX_AGE&&fsInEurope(lat,lon);
  const stale=ids.filter(id=>{
    const e=sameDay?c.models[id]:null;
    if(!e)return true;
    const age=nowMs-e.at;
    if(e.absent)return age>=FS_ABSENT_RECHECK;
    if(age>=FS_MODEL_MAX_AGE)return true;
    const run=runsOk?runs.models?.[id]:null;
    if(Number.isFinite(run)){
      const ready=run*1000+FS_RUN_SETTLE;
      return e.at<ready&&nowMs>=ready;
    }
    return age>=FS_FALLBACK_EVERY;
  });
  // A model outside its area is only asked about together with others: Open-Meteo leaves it
  // out of a multi-model answer, but may refuse a request for that model alone
  const models=stale.some(id=>!(sameDay&&c.models[id]?.absent))?stale:[];
  const now=!c.now||c.now.day!==today||!sameDay||nowMs-c.now.at>=FS_NOW_EVERY;
  return {models,now};
}

// One model's variables from an answer: suffixed (temperature_2m_icon_eu) when several
// models were asked for, plain when only one
function fsModelBlock(block,id,single){
  const out={};
  if(!block)return out;
  const suffix='_'+id;
  for(const k of Object.keys(block)){
    if(k==='time')continue;
    if(single)out[k]=block[k];
    else if(k.endsWith(suffix))out[k.slice(0,-suffix.length)]=block[k];
  }
  return out;
}

// The run (initialisation, unix seconds) an answer fetched at `at` came from: known when the
// run times (checked within FS_RUNS_MAX_AGE before nowMs) say the latest run had settled on
// Open-Meteo's servers by then. Works at fetch time and later, until a newer run comes out.
function fsRunOf(runs,id,at,nowMs=at){
  if(!runs||!Number.isFinite(at)||!(nowMs-runs.checkedAt<FS_RUNS_MAX_AGE))return null;
  const avail=runs.models?.[id],init=runs.inits?.[id];
  return Number.isFinite(avail)&&Number.isFinite(init)&&at>=avail*1000+FS_RUN_SETTLE?init:null;
}

// Models answer into the saved copy. A new local day (or a changed time axis) starts it
// afresh; a model with no temperature at all is outside its area. runs (optional): the run
// times at the moment of the request, to remember which run each model came from.
function mergeModels(cache,raw,ids,at,runs=null){
  const hourly=raw?.hourly?.time,daily=raw?.daily?.time;
  if(!Array.isArray(hourly)||!hourly.length||!Array.isArray(daily)||!daily.length)throw new Error('Unexpected forecast answer');
  const c=cache||emptyForecast();
  const day=hourly[0].slice(0,10);
  const keep=c.day===day&&fsSameTimes(c.time?.hourly,hourly)&&fsSameTimes(c.time?.daily,daily);
  const next={...c,day,off:raw.utc_offset_seconds??c.off,time:keep?c.time:{hourly,daily},models:keep?{...c.models}:{}};
  const single=ids.length===1;
  for(const id of ids){
    const h=fsModelBlock(raw.hourly,id,single);
    if(!Array.isArray(h.temperature_2m)||!h.temperature_2m.some(v=>v!=null)){next.models[id]={at,absent:true};continue;}
    next.models[id]={at,run:fsRunOf(runs,id,at),hourly:h,daily:fsModelBlock(raw.daily,id,single)};
  }
  return next;
}

// "Now" answer (ECMWF current values, sunrise and sunset) into the saved copy
function mergeNow(cache,raw,at){
  const d=raw?.daily;
  if(!raw?.current||!Array.isArray(d?.time)||!d.time.length)throw new Error('Unexpected current answer');
  const c=cache||emptyForecast();
  return {...c,off:raw.utc_offset_seconds??c.off,now:{at,day:d.time[0],current:raw.current,time:d.time,sunrise:d.sunrise,sunset:d.sunset}};
}

// Daily maximum of an hourly series per local day (Open-Meteo's own daily values are the same
// local-day aggregation of its hourly ones)
function fsDailyMax(hourlyTime,values,dailyTime){
  const byDay=new Map();
  hourlyTime.forEach((time,i)=>{
    const v=values[i];if(v==null)return;
    const d=time.slice(0,10),cur=byDay.get(d);
    if(cur==null||v>cur)byDay.set(d,v);
  });
  return dailyTime.map(d=>byDay.has(d)?byDay.get(d):null);
}

// The saved copy as S.data, models in the given order. The "now" values and sunrise/sunset go
// where the app has always read them: the first model's current block and daily arrays.
function forecastData(cache,ids){
  const out={};
  if(!cache?.time)return out;
  for(const id of ids){
    const e=cache.models[id];
    if(!e||e.absent)continue;
    const daily={time:cache.time.daily,...e.daily};
    if(Array.isArray(e.hourly.wind_gusts_10m))daily.wind_gusts_10m_max=fsDailyMax(cache.time.hourly,e.hourly.wind_gusts_10m,cache.time.daily);
    out[id]={hourly:{time:cache.time.hourly,...e.hourly},daily,utcOffset:cache.off||0,at:e.at,run:e.run??null};
  }
  const first=Object.values(out)[0],n=cache.now;
  if(first&&n&&n.day===cache.day){
    first.current=n.current;
    if(fsSameTimes(n.time,cache.time.daily)){first.daily.sunrise=n.sunrise;first.daily.sunset=n.sunset;}
  }
  return out;
}

// When the page last heard from Open-Meteo about this place (ms), 0 if never
function forecastTs(cache){
  if(!cache)return 0;
  const times=Object.values(cache.models||{}).filter(e=>!e.absent).map(e=>e.at);
  if(cache.now&&cache.now.day===cache.day)times.push(cache.now.at);
  return times.length?Math.max(...times):0;
}

if(typeof module!=='undefined')module.exports={forecastPlan,fsRunOf,mergeModels,mergeNow,forecastData,forecastTs,emptyForecast,fsDailyMax,fsLocalDay,fsInEurope,FS_NOW_EVERY,FS_FALLBACK_EVERY,FS_RUN_SETTLE,FS_RUNS_MAX_AGE,FS_ABSENT_RECHECK};
