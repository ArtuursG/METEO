// ─── CLOUD MAP ──────────────────────────────────────────────────────────────
// Two views, each loaded only when asked for: observed infrared satellite imagery
// (EUMETSAT) and the DWD ICON cloud-cover forecast (Open-Meteo map layer). The time
// scrubber is the shared timeline from timeline.js, drawn over the bottom of the map.
// buildSatFrames is require()'d by test/cloud-map.test.js, so DOM code stays guarded.

const CLOUD_OM_LIB_URL='https://cdn.jsdelivr.net/npm/@openmeteo/weather-map-layer@0.1.0/dist/index.js';
const CLOUD_OM_LIB_SRI='sha512-u+hvuEI1AnNAjhc/gSY6An2l87uDMkk2NiUxeHr7ARj3dEoxHGNqB5Za4m4hshlinJVk8PQKGIwXQXTtbY2hGg==';
const CLOUD_OM_META_URL='https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon/latest.json';
const SAT_WMS_URL='https://view.eumetsat.int/geoserver/wms';
const SAT_LAYER='msg_fes:ir108',SAT_STEP_MIN=15,SAT_PAST_COUNT=8;

let _cloudOpen=false,_cloudMap=null,_cloudAdapter=null,_cloudFrames=[],_cloudTileLayer=null,
  _cloudPlace='',_cloudMode='sat',_cloudRequest=0,_cloudTimeline=null,_cloudFailed=false,_cloudShowTimer=null;
const cloudCache={},cloudScripts=new Map();

function loadScriptOnce(src,integrity){
  if(window.OMWeatherMapLayer)return Promise.resolve();
  if(cloudScripts.has(src))return cloudScripts.get(src);
  const work=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;s.crossOrigin='anonymous';s.integrity=integrity;s.onload=resolve;
    s.onerror=()=>{s.remove();cloudScripts.delete(src);reject(new Error('Map library unavailable'));};
    document.head.append(s);
  });
  cloudScripts.set(src,work);
  return work;
}

// Satellite frames on the 15-minute grid, newest one step behind `latest` (processing lag)
function buildSatFrames(latest=Math.floor(Date.now()/900000)*900000-900000){
  return Array.from({length:SAT_PAST_COUNT},(_,i)=>({time:new Date(Number(latest)-(SAT_PAST_COUNT-1-i)*SAT_STEP_MIN*60000).toISOString(),kind:'sat'}));
}

function stopCloudPlayback(){_cloudTimeline?.pause();}

async function cloudFrames(mode){
  const cached=cloudCache[mode];
  if(cached&&Date.now()-cached.saved<900000)return cached.frames;
  let frames;
  if(mode==='sat'){
    const response=await fetch(SAT_WMS_URL+'?service=WMS&request=GetCapabilities',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Satellite metadata unavailable');
    const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
    const name=[...xml.getElementsByTagNameNS('*','Name')].find(n=>n.textContent===SAT_LAYER);
    const dimension=name&&[...name.parentElement.getElementsByTagNameNS('*','Dimension')].find(n=>n.getAttribute('name')==='time');
    const latest=Date.parse(dimension?.getAttribute('default'));
    if(!Number.isFinite(latest)||latest>Date.now()+900000)throw new Error('No satellite timestamp');
    frames=buildSatFrames(latest);
  }else{
    const [meta]=await Promise.all([
      fetch(CLOUD_OM_META_URL,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Forecast metadata unavailable');return r.json();}),
      loadScriptOnce(CLOUD_OM_LIB_URL,CLOUD_OM_LIB_SRI),
    ]);
    frames=(meta.valid_times||[])
      .map((time,modelIdx)=>({time:typeof time==='number'?new Date(time*1000).toISOString():time,kind:'model',modelIdx}))
      .filter(f=>Date.parse(f.time)>=Date.now()-3600000&&Date.parse(f.time)<=Date.now()+7*86400000);
  }
  if(!frames.length)throw new Error('No frames');
  cloudCache[mode]={saved:Date.now(),frames};
  return frames;
}

function cloudLayer(frame){
  if(frame.kind==='sat')return L.tileLayer.wms(SAT_WMS_URL,{layers:SAT_LAYER,format:'image/png',version:'1.1.1',transparent:true,crs:L.CRS.EPSG4326,time:frame.time,opacity:.72,attribution:'© EUMETSAT · IR 10.8 μm'});
  return _cloudAdapter.createTileLayer('om://'+CLOUD_OM_META_URL+'?time_step=valid_times_'+frame.modelIdx+'&variable=cloud_cover',{opacity:.65,attribution:'Open-Meteo / DWD ICON'});
}

// The previous image stays until the new one has loaded, so scrubbing does not blank the map
function showCloudFrame(index){
  if(!_cloudMap||!_cloudFrames[index])return;
  let layer;
  try{layer=cloudLayer(_cloudFrames[index]);}catch(e){console.warn('[cloud]',e);return;}
  const old=_cloudTileLayer;
  _cloudTileLayer=layer.addTo(_cloudMap);
  if(old){
    const drop=()=>{if(_cloudMap&&old!==_cloudTileLayer)_cloudMap.removeLayer(old);};
    layer.once('load',drop);setTimeout(drop,4000);
  }
}
function scheduleCloudFrame(index){
  clearTimeout(_cloudShowTimer);
  _cloudShowTimer=setTimeout(()=>{if(_cloudOpen)showCloudFrame(index);},_cloudTimeline?.isPlaying()?0:120);
}

function cloudStatus(){
  const tl=_cloudTimeline;
  if(!tl)return;
  if(_cloudFailed){tl.setStatus(t('rad.cloud_unavailable'),'bad');tl.setSide('');return;}
  if(!_cloudFrames.length){tl.setStatus(t('rad.cloud_loading'),'');tl.setSide('');return;}
  const last=Date.parse(_cloudFrames[_cloudFrames.length-1].time);
  if(_cloudMode==='sat'){
    const age=(Date.now()-last)/60000;
    tl.setStatus(t('rad.latest_age',{time:fmtClock(last),age:fmtAge(last)}),age<=45?'ok':age<=90?'warn':'bad');
    tl.setSide(t('rad.cloud_sat_src'));
  }else{
    tl.setStatus(t('rad.cloud_until',{time:fmtClock(last)}),'');
    tl.setSide(t('rad.cloud_model_src'));
  }
}

// Map and timeline are created on the first open, before any source is contacted,
// so a failing source still leaves a usable map with an honest status line.
function buildCloudMap(){
  if(_cloudMap)return;
  _cloudMap=L.map('cloudMap',{maxZoom:10,scrollWheelZoom:false,zoomControl:false}).setView([S.lat,S.lon],6);
  L.control.zoom({position:'topright'}).addTo(_cloudMap);
  addMapFullscreen(_cloudMap,$('cloudStage'));
  addThemedMapLayer(_cloudMap,'Base');
  const pane=_cloudMap.createPane('cloudLabels');pane.style.zIndex=450;pane.style.pointerEvents='none';
  addThemedMapLayer(_cloudMap,'Reference',{pane:'cloudLabels'});
  _cloudPlace=S.lat.toFixed(2)+','+S.lon.toFixed(2);
  _cloudTimeline=createTimeline({
    baseDelay:900,
    formatTime:fmtClock,
    formatTick:ms=>_cloudMode==='sat'?new Date(ms).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'}):new Date(ms).toLocaleDateString(LOCALE,{day:'numeric',month:'short'}),
    labelKey:'rad.cloud_time',
    latestKey:()=>_cloudMode==='sat'?'rad.tl_latest':'rad.tl_now',
    latestIndex:times=>_cloudMode==='sat'?times.length-1:nowFrameIndex(times),
    onChange:scheduleCloudFrame,
  });
  _cloudTimeline.el.classList.add('cloud-timeline');
  $('cloudStage').append(_cloudTimeline.el);
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>$('cloudStage').style.setProperty('--tl-h',_cloudTimeline.el.offsetHeight+'px')).observe(_cloudTimeline.el);
}

async function ensureCloudMap(){
  const id=++_cloudRequest,mode=_cloudMode;
  try{buildCloudMap();}catch(e){console.warn('[cloud]',e);return;}
  stopCloudPlayback();
  _cloudFrames=[];_cloudFailed=false;
  if(_cloudTileLayer){_cloudMap.removeLayer(_cloudTileLayer);_cloudTileLayer=null;}
  _cloudTimeline.setFrames([],-1);
  _cloudTimeline.relabel();
  cloudStatus();
  _cloudMap.invalidateSize();
  try{
    const frames=await cloudFrames(mode);
    if(id!==_cloudRequest||!_cloudOpen)return;
    if(mode==='model'&&!_cloudAdapter){
      _cloudAdapter=OMWeatherMapLayer.addLeafletProtocolSupport(L);
      _cloudAdapter.addProtocol('om',OMWeatherMapLayer.omProtocol);
      const bounds=()=>{const b=_cloudMap.getBounds();OMWeatherMapLayer.updateCurrentBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);};
      _cloudMap.on('moveend',bounds);bounds();
    }
    _cloudFrames=frames;
    const times=frames.map(f=>Date.parse(f.time));
    const start=mode==='sat'?frames.length-1:nowFrameIndex(times);
    _cloudTimeline.setFrames(times,start);
    showCloudFrame(start);
  }catch(e){
    if(id!==_cloudRequest)return;
    _cloudFailed=true;
    console.warn('[cloud]',e?.message||e);
  }
  cloudStatus();
}

function openCloudMap(){
  _cloudOpen=true;$('cloudMapEmbed').hidden=false;
  _cloudMap?.invalidateSize();
  refreshCloudMap();ensureCloudMap();
}
function closeCloudMap(){
  _cloudOpen=false;++_cloudRequest;stopCloudPlayback();
  $('cloudMapEmbed').hidden=true;refreshCloudMap();
}

// Texts, button states and the map position (language switch, panel shown, place changed)
function refreshCloudMap(){
  if(!$('cloudMapCard'))return;
  $('cloudMapTitle').textContent=t('rad.cloud_title');
  $('cloudMapInfo').textContent=t('rad.cloud_info');
  $('cloudModes').setAttribute('aria-label',t('rad.cloud_modes'));
  $('cloudObserved').textContent=t('rad.cloud_sat');$('cloudForecast').textContent=t('rad.cloud_model');
  $('cloudObserved').setAttribute('aria-pressed',String(_cloudMode==='sat'));
  $('cloudForecast').setAttribute('aria-pressed',String(_cloudMode==='model'));
  const toggle=$('cloudMapToggle');
  toggle.textContent=t(_cloudOpen?'rad.cloud_close':'rad.cloud_open');
  toggle.setAttribute('aria-expanded',String(_cloudOpen));
  $('cloudMap').setAttribute('aria-label',t('rad.cloud_title'));
  $('cloudMapHint').textContent=t(_cloudMode==='sat'?'rad.cloud_hint_sat':'rad.cloud_hint_model');
  if(_cloudTimeline){_cloudTimeline.relabel();cloudStatus();}
  const key=S.lat.toFixed(2)+','+S.lon.toFixed(2);
  if(_cloudMap&&key!==_cloudPlace){_cloudPlace=key;_cloudMap.setView([S.lat,S.lon],_cloudMap.getZoom());}
}

if(typeof document!=='undefined'&&document.getElementById('cloudMapCard')){
  $('cloudMapToggle').addEventListener('click',()=>_cloudOpen?closeCloudMap():openCloudMap());
  for(const [id,mode] of [['cloudObserved','sat'],['cloudForecast','model']]){
    $(id).addEventListener('click',()=>{
      if(_cloudMode===mode&&_cloudOpen)return;
      _cloudMode=mode;refreshCloudMap();
      if(_cloudOpen)ensureCloudMap();else openCloudMap();
    });
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCloudPlayback();});
  // t() and the timeline helpers come from scripts loaded around this one
  if(document.readyState==='complete')refreshCloudMap();
  else document.addEventListener('DOMContentLoaded',refreshCloudMap,{once:true});
}
if(typeof module!=='undefined')module.exports={buildSatFrames};
