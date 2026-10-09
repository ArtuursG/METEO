// ─── DATA: current metrics, combined model fetch, load pipeline ──────────────

// ─── CURRENT METRICS ─────────────────────────────────────────────────────────
// Returns a monochrome SVG moon phase icon and localised name based on lunar cycle math
function moonPhaseInfo(){
  const frac=moonPhaseFrac(Date.now()); // 0=new, 0.5=full, 1=new  (see pure.js)
  const i=Math.floor(frac*8)%8;

  // Build SVG using two arcs: outer semicircle + terminator ellipse
  const r=6,s=16,cx=8,cy=8;
  let svg;
  if(frac<0.02||frac>0.98){
    // New moon - just a circle outline
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
  } else if(frac>0.48&&frac<0.52){
    // Full moon - filled circle
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/></svg>`;
  } else {
    const waxing=frac<0.5;
    // Terminator ellipse x-radius shrinks from r (quarter) to 0 (quarter) symmetrically
    const ex=(Math.abs(Math.cos(frac*2*Math.PI))*r).toFixed(2);
    const outerSweep=waxing?1:0; // right (waxing) or left (waning) semicircle
    // Terminator arc must curve toward the lit hemisphere to close the shape.
    // Between the two quarter moons (gibbous illumination) the sweep direction flips.
    const termSweep=(frac>0.25&&frac<0.75)?1:0;
    const outline=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.35"/>`;
    const lit=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy+r} A ${ex} ${r} 0 0 ${termSweep} ${cx} ${cy-r} Z" fill="currentColor"/>`;
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${outline}${lit}</svg>`;
  }
  return {svg, name:t('moon.'+i)};
}

// How old the shown forecast is; app.js redraws it every minute while the page is open
let _srcModel='';
function renderDataAge(){
  if(!S.dataTs)return;
  const srcEl=$('metricsSrc');
  if(srcEl)srcEl.textContent=t('today.src',{model:_srcModel,ago:relTime(S.dataTs)});
  if($('lastUpdate'))$('lastUpdate').textContent=`${t('metric.updated_prefix')} ${relTime(S.dataTs)}`;
}

// Fills the "now" block and hero sunrise/sunset, with ECMWF as the main source
function updateMetrics(){
  const ecmwf=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!ecmwf)return;
  const c=ecmwf.current;
  if(c){
    $('curTemp').textContent=fmtTemp(c.temperature_2m);
    // Same sun/moon choice as the hourly strip below it
    const night=typeof sunTimes==='function'&&!!c.time&&isNightAt(c.time,sunTimes(S.data));
    const sky=nightKey(wKey(c.weather_code),night);
    $('curIcon').innerHTML=sky?WICONS[sky]:'';
    $('curIcon').className='now-icon wi wi-'+(sky||'none');
    $('curDesc').textContent=sky?t('wx.'+sky):'-';
    const fl=c.apparent_temperature;
    $('feelsLike').textContent=fl!=null?t('today.feels',{n:fmtTemp(fl)}):'';
    const w=v=>fmtNum(windConv(v),S.windUnit==='m/s'?1:0);
    const gust=c.wind_gusts_10m!=null?`, ${t('metric.gust')} ${w(c.wind_gusts_10m)}`:'';
    $('windNow').innerHTML=`${w(c.wind_speed_10m)} ${S.windUnit} ${wDir(c.wind_direction_10m)}<small>${gust}</small>`;
    $('humNow').textContent=c.relative_humidity_2m!=null?`${r0(c.relative_humidity_2m)}%`:'-';
  }
  const d=ecmwf.daily;
  if(d?.temperature_2m_max?.[0]!=null)$('todayMax').textContent=`${fmtTemp(d.temperature_2m_min?.[0])} … ${fmtTemp(d.temperature_2m_max[0])}`;
  if(d?.precipitation_sum?.[0]!=null)$('precipNow').textContent=`${fmtNum(d.precipitation_sum[0],1)} mm`;
  const srcModel=S.data['ecmwf_ifs025']?'ECMWF IFS':(MODELS.find(m=>S.data[m.id]===ecmwf)?.name||'?');
  _srcModel=srcModel;
  renderDataAge();
  if(typeof renderToday==='function')renderToday();
  // Sunrise/sunset times are in the daily[0] slot as ISO strings with local timezone offset
  if(ecmwf.daily?.sunrise?.[0]&&ecmwf.daily?.sunset?.[0]){
    const fmt=iso=>new Date(iso).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
    const rise=fmt(ecmwf.daily.sunrise[0]),set=fmt(ecmwf.daily.sunset[0]);
    const sunEl=$('heroSun');
    const moon=moonPhaseInfo();
    if(sunEl)sunEl.innerHTML=
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/></svg>${rise}&nbsp;&nbsp;<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/><path d="M19 14l-7 5-7-5" stroke-width="1.5"/></svg>${set}<span class="hero-sun-sep">·</span><span class="hero-moon" title="${moon.name}">${moon.svg}</span><span class="hero-moon-name">${moon.name}</span>`;
  }
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────
// Open-Meteo counts a request as variables × models × days / (10 × 14) calls against a
// per-address limit (offices share one address), so the forecast is kept per model in
// forecast-sync.js and only what changed is asked for:
// - all models, hourly and daily, once per place and day; after that only the models
//   Open-Meteo has a newer run of (run times from the LVC worker's live answer), or every
//   30 min for a model whose run time is not known;
// - the "now" values and sunrise/sunset, used from ECMWF IFS only, in a small separate
//   request every 15 min instead of for all 14 models.
// Several models in one request come back suffixed per model (temperature_2m_icon_eu);
// models outside their area are left out of the answer.
const FC_URL='https://api.open-meteo.com/v1/forecast';
const FC_NOW='temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,wind_gusts_10m,snowfall';
// Gusts only hourly: their daily maximum is worked out from them (forecast-sync.js)
const FC_HOURLY='temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,uv_index';
const FC_DAILY='temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,weather_code,cloud_cover_mean';
// The prefix changes with the requested variables, so a saved copy always has all of them
const FC_PFX='wx9_',FC_PLACES=FC_PFX+'places',FC_KEEP_PLACES=6;
const fcKey=(lat,lon)=>`${FC_PFX}${lat.toFixed(3)}_${lon.toFixed(3)}`;
const fcModelIds=()=>MODELS.map(m=>m.id);
let _fc={key:null,cache:null},_fcFails=0,_fcFailedAt=0;

function readForecast(key){
  try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&v.models?v:null;}catch{return null;}
}
// Keeps the latest few places; returns the saved text (a clean copy for rendering)
function saveForecast(key,cache){
  const text=JSON.stringify(cache);
  try{
    let places=[];
    try{places=JSON.parse(localStorage.getItem(FC_PLACES)||'[]');}catch{}
    places=[key,...places.filter(k=>k!==key)];
    for(const k of places.slice(FC_KEEP_PLACES))localStorage.removeItem(k);
    places=places.slice(0,FC_KEEP_PLACES);
    // Copies saved with other variables or in the earlier format are no longer read
    const old=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^wx\d+_/.test(k||'')&&!k.startsWith(FC_PFX))old.push(k);}
    old.forEach(k=>localStorage.removeItem(k));
    try{localStorage.setItem(key,text);}
    catch{places.slice(1).forEach(k=>localStorage.removeItem(k));places=[key];localStorage.setItem(key,text);}
    localStorage.setItem(FC_PLACES,JSON.stringify(places));
  }catch{}
  return text;
}
// After failed requests: wait 1, 2, 4... up to 15 min before asking again
const fcBackoff=()=>_fcFails?Math.min(15,2**(_fcFails-1))*60000:0;
const fcRuns=()=>typeof homeRuns==='function'?homeRuns():null;
function fcPlan(lat,lon,runs=fcRuns()){
  return forecastPlan(_fc.cache,{nowMs:Date.now(),ids:fcModelIds(),runs,lat,lon});
}
// app.js asks this every minute: is anything newer than what is on screen?
function forecastDue(lat,lon){
  if(_fc.key!==fcKey(lat,lon))return true;
  if(Date.now()-_fcFailedAt<fcBackoff())return false;
  const p=fcPlan(lat,lon);
  return p.now||p.models.length>0;
}

async function fcGet(url,signal){
  const r=await fetch(url,{signal});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

// Brings the saved copy of this place up to date and returns it as S.data.
// force: the visitor asked for it (search, location), so a failure backoff does not hold it back
async function syncForecast(lat,lon,signal,{force=false}={}){
  const key=fcKey(lat,lon);
  if(_fc.key!==key){_fc={key,cache:readForecast(key)||emptyForecast()};_fcFails=0;_fcFailedAt=0;}
  const entry=_fc;
  let plan=fcPlan(lat,lon);
  // Saved models could be reused: give the run times (already on their way) a moment
  if(plan.models.length&&Object.keys(entry.cache.models).length&&!fcRuns()&&fsInEurope(lat,lon)
    &&typeof ensureHome==='function'&&typeof liveWanted==='function'&&liveWanted()){
    await Promise.race([ensureHome(),new Promise(r=>setTimeout(r,3000))]);
    plan=fcPlan(lat,lon);
  }
  if(!force&&Date.now()-_fcFailedAt<fcBackoff())plan={models:[],now:false};
  const jobs=[];let modelsChanged=false;
  if(plan.models.length){
    const ids=plan.models;
    const url=`${FC_URL}?latitude=${lat}&longitude=${lon}&models=${ids.join(',')}&hourly=${FC_HOURLY}&daily=${FC_DAILY}&timezone=auto&forecast_days=16&wind_speed_unit=ms`;
    // Which run each model comes from is only worked out for Europe (the run times' area)
    const runs=fsInEurope(lat,lon)?fcRuns():null;
    jobs.push(fcGet(url,signal).then(raw=>{entry.cache=mergeModels(entry.cache,raw,ids,Date.now(),runs);modelsChanged=true;}));
  }
  if(plan.now){
    const url=`${FC_URL}?latitude=${lat}&longitude=${lon}&models=ecmwf_ifs025&current=${FC_NOW}&daily=sunrise,sunset&timezone=auto&forecast_days=16&wind_speed_unit=ms`;
    jobs.push(fcGet(url,signal).then(raw=>{entry.cache=mergeNow(entry.cache,raw,Date.now());}));
  }
  const done=await Promise.allSettled(jobs);
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const failed=done.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(failed.length){_fcFails++;_fcFailedAt=Date.now();console.warn('[forecast]',...failed);}
  else if(jobs.length){_fcFails=0;_fcFailedAt=0;}
  const text=done.some(r=>r.status==='fulfilled')?saveForecast(key,entry.cache):JSON.stringify(entry.cache);
  const view=JSON.parse(text);
  const data=forecastData(view,fcModelIds());
  const ts=forecastTs(view);
  // No network: a saved forecast stands in for up to CACHE_KEEP (its age is shown)
  if(!Object.keys(data).length||(failed.length&&Date.now()-ts>CACHE_KEEP))throw failed[0]||new Error('No forecast');
  return {key,data,ts,modelsChanged};
}

// Loads the forecast (only what changed, see above) and redraws what depends on it
let _loadId=0, _loadController=null;
// quiet: a background refresh; on failure the data on screen stays without a message
async function loadAll({quiet=false}={}){
  if(typeof refreshWindMap==='function')refreshWindMap();
  if(typeof refreshHomeWarnings==='function')refreshHomeWarnings();
  const id=++_loadId;
  if(_loadController)_loadController.abort();
  _loadController=new AbortController();
  const lat=S.lat, lon=S.lon;
  const hadData=Object.keys(S.data).length>0;
  if(!hadData){
    $('loadT').style.display='flex';
    $('loadT').innerHTML=`<div class="spinner"></div>${t('metric.loading')}`;
  }

  let fresh=null, fetched=null;
  try{
    fetched=await syncForecast(lat,lon,_loadController.signal,{force:!quiet});
    if(id!==_loadId)return null;
    fresh=fetched.data;
  }catch(e){
    if(id!==_loadId)return null;
    if(e?.name!=='AbortError')console.warn('[loadAll] forecast failed',e);
  }

  if(!fresh||!Object.keys(fresh).length){
    if(hadData){
      // Keep the previous location's data on screen rather than blanking everything
      if(!quiet)showToast(t('toast.reload_failed'));
      return false;
    }
    ['loadT','loadP','loadPP','loadW','loadCl','loadUV','loadTbl'].forEach(id=>{
      $(id).innerHTML=`<div class="err">${t('err.load_failed')}</div>`;
    });
    if(typeof renderTodayError==='function')renderTodayError();
    return false;
  }

  // Same place and no model changed: only the "now" values moved, the charts stay as they are
  const nowOnly=hadData&&S.dataKey===fetched.key&&!fetched.modelsChanged;
  S.data=fresh;
  S.dataTs=fetched.ts;
  S.dataKey=fetched.key;
  updateMetrics();
  if(nowOnly)return true;
  // Snapshots for the "forecast changed" line come only from models fresh from the API
  if(fetched.modelsChanged&&typeof saveForecastSnapshot==='function')saveForecastSnapshot(lat,lon);
  buildModelInfo();
  rebuildTempChart();
  buildPrecipCharts();
  buildWindChart();
  buildCloudChart();
  buildUVChart();
  buildTable();
  // Model accuracy near this place, in the background (model-skill.js)
  if(typeof loadModelSkill==='function')loadModelSkill();
  // Climate / verification tabs cache per-location; refresh if the user is on them
  if($('tab-environment')?.classList.contains('on'))initEnvironment();
  if($('tab-climate')?.classList.contains('on'))initClimate();
  if($('tab-about')?.classList.contains('on'))initVerification();
  return true;
}

