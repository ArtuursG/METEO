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
  const srcEl=$('metricsSrc');
  if(srcEl)srcEl.textContent=t('today.src',{model:srcModel,ago:relTime(S.dataTs)});
  if($('lastUpdate'))$('lastUpdate').textContent=`${t('metric.updated_prefix')} ${relTime(S.dataTs)}`;
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
// Open-Meteo supports comma-separated models in one request: each hourly/daily
// variable comes back suffixed per model (temperature_2m_ecmwf_ifs025, ...), sharing
// one time array sized to the longest model horizon. Models unsupported at a variable
// come back null-filled rather than 400; models outside their geographic coverage are
// silently omitted from the response. This means no per-model fallback cascade is needed.
async function fetchAllModels(lat,lon,signal){
  const hit=getCached(lat,lon);
  if(hit)return hit;

  const cur='temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,wind_gusts_10m,snowfall';
  const h='temperature_2m,precipitation,precipitation_probability,wind_speed_10m,cloud_cover,uv_index';
  const d='temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,weather_code,cloud_cover_mean,sunrise,sunset';
  const models=MODELS.map(m=>m.id).join(',');
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&models=${models}&hourly=${h}&daily=${d}&current=${cur}&timezone=auto&forecast_days=16&wind_speed_unit=ms`;

  const r=await fetch(url,{signal});
  if(!r.ok)throw new Error(r.status);
  const data=await r.json();
  setCache(lat,lon,data);
  return {d:data,ts:Date.now(),fresh:true};
}

// Splits the combined multi-model response back into the per-model {hourly,daily,current}
// shape the rest of the app expects in S.data[modelId]. A model with no suffixed
// temperature_2m key was geographically out of coverage and is skipped entirely.
function splitCombined(raw){
  const out={};
  // Open-Meteo returns the `current` block from the first model in the request.
  // Attach it to the first model that actually made it into the response, so
  // current conditions still work when ECMWF IFS is outside its coverage area.
  let currentAssigned=false;
  MODELS.forEach(m=>{
    const tKey=`temperature_2m_${m.id}`;
    if(!(raw.hourly?.[tKey]))return;
    const hourly={time:raw.hourly.time};
    Object.keys(raw.hourly).forEach(k=>{
      if(k.endsWith(`_${m.id}`))hourly[k.slice(0,-(m.id.length+1))]=raw.hourly[k];
    });
    const daily={time:raw.daily?.time};
    Object.keys(raw.daily||{}).forEach(k=>{
      if(k.endsWith(`_${m.id}`))daily[k.slice(0,-(m.id.length+1))]=raw.daily[k];
    });
    out[m.id]={hourly,daily};
    if(!currentAssigned){out[m.id].current=raw.current;currentAssigned=true;}
  });
  return out;
}

// Fetches all models in one request; skips models missing from the response
let _loadId=0, _loadController=null;
async function loadAll(){
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
    fetched=await fetchAllModels(lat,lon,_loadController.signal);
    if(id!==_loadId)return null;
    fresh=splitCombined(fetched.d);
  }catch(e){
    if(id!==_loadId)return null;
    console.warn('[loadAll] combined fetch failed',e);
  }

  if(!fresh||!Object.keys(fresh).length){
    if(hadData){
      // Keep the previous location's data on screen rather than blanking everything
      showToast(t('toast.reload_failed'));
      return false;
    }
    ['loadT','loadP','loadPP','loadW','loadCl','loadUV','loadTbl'].forEach(id=>{
      $(id).innerHTML=`<div class="err">${t('err.load_failed')}</div>`;
    });
    if(typeof renderTodayError==='function')renderTodayError();
    return false;
  }

  S.data=fresh;
  S.dataTs=fetched.ts;
  updateMetrics();
  // Snapshots for the "forecast changed" line come only from a fresh API response
  if(fetched.fresh&&typeof saveForecastSnapshot==='function')saveForecastSnapshot(lat,lon);
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

