// ─── RADAR & WEATHER STATIONS (LVC + LVĢMC) ─────────────────────────────────
// Precipitation frames: RainViewer free tier (observed frames only, native zoom up to 6).
// Stations: the LVC worker in cloudflare-worker/ (one ?data=home answer). Shared map helpers live in
// map-utils.js, the frame scrubber in timeline.js. Nothing here runs Leaflet code until
// the radar panel is opened for the first time (initRadar).

const LVC_API='https://lvc-meteo-proxy.jkedainis.workers.dev/';
const RAINVIEWER_API='https://api.rainviewer.com/public/weather-maps.json';
const RAINVIEWER_TILES='https://tilecache.rainviewer.com';
const STATION_RETRY=60*1000;
const RADAR_REFRESH=5*60*1000;
const RADAR_RETRY=60*1000;
const STATION_LAG=45*60*1000;        // a station this far behind its network is marked
const STATION_ROWS=10;
const LATVIA_BOUNDS=[[55.65,20.9],[58.1,28.25]];

const ROAD_COND_KEY={dry:'road.dry',wet:'road.wet',moist:'road.moist',frost:'road.frost',iceOrSnowOnRoad:'road.ice',wetAndDirty:'road.wetdirty'};
const ROAD_COND_TONE={dry:'dry',moist:'wet',wet:'wet',wetAndDirty:'wet',frost:'bad',iceOrSnowOnRoad:'bad'};
const ROAD_SEVERITY={dry:0,moist:1,wet:2,wetAndDirty:3,frost:4,iceOrSnowOnRoad:5};
const roadCondLabel=c=>c?(ROAD_COND_KEY[c]?t(ROAD_COND_KEY[c]):String(c)):'-';
const NETWORK_NAME={lvc:'LVC',lvgmc:'LVĢMC'};

let _rMap=null;
// Raw worker responses (other modules read these; LVĢMC items keep history[], latest last)
let _lvcStations=[],_lvgmcStations=[];

// Radar map state
const R={
  frames:[],          // [{time (s), path}] ascending
  layers:new Map(),   // frame path -> L.tileLayer on radarPane
  loaded:new Set(),   // frame paths whose tiles finished loading at least once
  idx:-1,
  followLatest:true,
  fetchedAt:0,failedAt:0,failed:false,loading:null,
  host:RAINVIEWER_TILES,  // tile host from the API answer
  show:true,opacity:.7,base:'theme',metric:'temp',
  themeLayers:[],extraBase:{},
  timeline:null,legend:null,settings:null,place:null,attr:'',
  placeKey:'',ticker:null,
};
// Station state
const ST={
  lvc:{rows:[],fetchedAt:0,failedAt:0,error:false,promise:null},
  lvgmc:{rows:[],fetchedAt:0,failedAt:0,error:false,promise:null},
  on:{lvc:true,lvgmc:true},
  layers:{lvc:null,lvgmc:null},
  markers:new Map(),  // row key -> {marker,row,value,width}
  query:'',inView:false,showAll:false,
  sort:{key:'dist',dir:1},
  selected:null,quiet:false,renderedKey:'',
};

const radarNode=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const radarNum=v=>v!=null&&v!==''&&Number.isFinite(+v)?+v:null;
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const placeKey=()=>S.lat.toFixed(3)+','+S.lon.toFixed(3);
function radarPanelVisible(){const p=$('tab-radar');return !!p&&!document.hidden&&p.getClientRects().length>0;}

// ─── PREFERENCES (per browser, optional) ────────────────────────────────────
const RADAR_PREFS='radar_prefs';
function loadRadarPrefs(){
  try{
    const p=JSON.parse(localStorage.getItem(RADAR_PREFS)||'{}');
    if(['theme','osm','relief','satellite'].includes(p.base))R.base=p.base;
    if(['temp','road','wind','precip'].includes(p.metric))R.metric=p.metric;
    if(Number.isFinite(p.opacity))R.opacity=Math.min(1,Math.max(.2,p.opacity));
    if(typeof p.show==='boolean')R.show=p.show;
    if(typeof p.lvc==='boolean')ST.on.lvc=p.lvc;
    if(typeof p.lvgmc==='boolean')ST.on.lvgmc=p.lvgmc;
  }catch{}
}
function saveRadarPrefs(){
  try{localStorage.setItem(RADAR_PREFS,JSON.stringify({base:R.base,metric:R.metric,opacity:R.opacity,show:R.show,lvc:ST.on.lvc,lvgmc:ST.on.lvgmc}));}catch{}
}

// ─── STATION DATA ───────────────────────────────────────────────────────────
function lvcRow(s){
  const lat=radarNum(s?.lat),lon=radarNum(s?.lon);
  if(lat==null||lon==null)return null;
  const air=radarNum(s.airTemp),time=parseStationTime(s.time);
  const lows=[radarNum(s.minTemp),air].filter(v=>v!=null),highs=[radarNum(s.maxTemp),air].filter(v=>v!=null);
  return {key:'lvc:'+s.id,net:'lvc',id:s.id,name:String(s.name||s.id||'-'),lat,lon,src:s,
    time,airTemp:air,surfaceTemp:radarNum(s.surfaceTemp),dewPoint:radarNum(s.dewPoint),
    windSpeed:radarNum(s.windSpeed),windGust:radarNum(s.windGust),windDir:radarNum(s.windDir),
    precip:radarNum(s.precipMmH),humidity:radarNum(s.humidity),visibility:radarNum(s.visibilityM),
    cond:s.roadCondition||null,
    // prevTime/prevAirTemp come from the worker; older worker versions do not send them
    trend:tempTrend(air,time,s.prevAirTemp,s.prevTime),
    min24:lows.length?Math.min(...lows):null,max24:highs.length?Math.max(...highs):null,dist:null};
}
function lvgmcRow(s){
  const lat=radarNum(s?.lat),lon=radarNum(s?.lon);
  if(lat==null||lon==null)return null;
  const hist=Array.isArray(s.history)?s.history.filter(Boolean):[];
  let reading=null;
  for(let i=hist.length-1;i>=0;i--)if(radarNum(hist[i].airTemp)!=null){reading=hist[i];break;}
  // Some LVĢMC stations only measure precipitation or snow; they have no thermometer
  if(!reading)return null;
  const time=parseStationTime(reading.time);
  const day=Number.isFinite(time)?hist.filter(h=>{const at=parseStationTime(h.time);return at>time-24*3600000&&at<=time;}):[reading];
  const lows=day.flatMap(h=>[radarNum(h.airTemp),radarNum(h.minTemp)]).filter(v=>v!=null);
  const highs=day.flatMap(h=>[radarNum(h.airTemp),radarNum(h.maxTemp)]).filter(v=>v!=null);
  const spark=day.map(h=>({t:parseStationTime(h.time),v:radarNum(h.airTemp)})).filter(p=>Number.isFinite(p.t)&&p.v!=null);
  const prev=prevReading(hist,time);
  return {key:'lvgmc:'+s.id,net:'lvgmc',id:s.id,name:String(s.name||s.id||'-'),lat,lon,src:s,
    time,airTemp:radarNum(reading.airTemp),feelsLike:radarNum(reading.feelsLike),surfaceTemp:null,
    windSpeed:radarNum(reading.windSpeed),windGust:radarNum(reading.windGust),windDir:radarNum(reading.windDir),
    precip:radarNum(reading.precipHour),humidity:radarNum(reading.humidity),pressure:radarNum(reading.pressure),
    visibility:radarNum(reading.visibility),uv:radarNum(reading.uv),cond:null,
    trend:prev?tempTrend(reading.airTemp,time,prev.airTemp,prev.time):null,
    min24:lows.length?Math.min(...lows):null,max24:highs.length?Math.max(...highs):null,spark,dist:null};
}

function fetchStationJson(url){
  const options={};
  try{if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)options.signal=AbortSignal.timeout(20000);}catch{}
  return fetch(url,options).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}

// ─── LIVE DATA: one request for both networks, warnings and model run times ─
// The LVC worker answers ?data=home with everything the page needs right away and the time
// of its next cron run (every 15 min). The next request goes right after that run, so new
// readings show up within about two minutes, and an open page makes one request per run
// instead of one per network on its own timer. Resolves with the answer (or the last good
// one), never rejects; works before the map exists and while the radar panel is hidden.
const HOME_API=LVC_API+'?data=home';
const HOME_AFTER_RUN=90*1000;        // the cron run needs a moment to finish
const HOME_MAX_WAIT=15*60*1000;
const H={data:null,fetchedAt:0,failedAt:0,error:false,fails:0,promise:null,nextAt:0,updated:null,late:0};
function homeDue(now=Date.now()){
  // After failures (worker down, daily limit reached) wait 1, 2, 4... up to 15 min
  if(H.error)return now-H.failedAt>=Math.min(HOME_MAX_WAIT,STATION_RETRY*2**(H.fails-1));
  return !H.fetchedAt||now>=H.nextAt;
}
// When to ask again: after the next run; if the run is late (same answer), 1, 2, 4... min
function homeNextAt(d,now,late){
  if(late)return now+Math.min(HOME_MAX_WAIT,60000*2**(late-1));
  const next=Date.parse(d?.next);
  return Number.isFinite(next)?Math.min(now+HOME_MAX_WAIT+HOME_AFTER_RUN,Math.max(now+60000,next+HOME_AFTER_RUN)):now+HOME_MAX_WAIT;
}
function ensureHome(){
  if(H.promise)return H.promise;
  if(!homeDue())return Promise.resolve(H.data);
  H.promise=ST.lvc.promise=ST.lvgmc.promise=(async()=>{
    try{
      const d=await fetchStationJson(HOME_API);
      if(d?.ok!==true)throw new Error('unexpected answer');
      const now=Date.now();
      H.late=H.updated!=null&&d.updated===H.updated?H.late+1:0;
      H.updated=d.updated??null;
      H.data=d;H.fetchedAt=now;H.error=false;H.fails=0;H.nextAt=homeNextAt(d,now,H.late);
      setNetwork('lvc',d.lvc);
      setNetwork('lvgmc',d.lvgmc);
    }catch(e){
      H.error=true;H.failedAt=Date.now();H.fails++;
      console.warn('[stations]',e?.message||e);
      // Readings already on screen stay; the status line says the update failed
      for(const net of ['lvc','lvgmc']){ST[net].error=true;ST[net].failedAt=H.failedAt;}
    }
    H.promise=ST.lvc.promise=ST.lvgmc.promise=null;
    try{renderLvcRows();renderLvgmcRows();}catch(e){console.warn('[stations] render',e);}
    // The now block follows every refresh (today.js, local-warnings.js)
    for(const f of ['showRoad','renderNearestStation','refreshHomeWarnings'])
      if(typeof window[f]==='function')try{window[f]();}catch(e){console.warn('[stations]',f,e);}
    return H.data;
  })();
  return H.promise;
}
// One network's part of the answer; a missing or failed part counts as that network's error
function setNetwork(net,part){
  const list=part&&part.ok!==false&&Array.isArray(part.stations)?part.stations:null;
  const st=ST[net];
  if(list){
    if(net==='lvc')_lvcStations=list;else _lvgmcStations=list;
    st.fetchedAt=Date.now();st.error=false;
  }else{st.error=true;st.failedAt=Date.now();}
}
// Open-Meteo model run times from the same answer (unix seconds per model, null if unknown)
function homeRuns(){
  const r=H.data?.runs;
  return r?.ok&&r.models?{models:r.models,checkedAt:Date.parse(H.data.updated||r.fetchedAt)}:null;
}
function ensureStations(){return ensureHome().then(()=>{});}
// Keeping the live answer current pays off for places near Latvia or once the station map is
// open; hidden pages make no requests
function liveWanted(){return !document.hidden&&(nearLatvia()||!!_rMap);}
function ensureLvcStations(){return ensureStations();}
function ensureLvgmcStations(){return ensureStations();}

// Rebuild rows from the raw worker data and redraw markers and the table
function renderLvcRows(){ST.lvc.rows=_lvcStations.map(lvcRow).filter(Boolean);renderStations();}
function renderLvgmcRows(){ST.lvgmc.rows=_lvgmcStations.map(lvgmcRow).filter(Boolean);renderStations();}

const stationRenderKey=()=>placeKey()+'|'+LANG;
const allStationRows=()=>[...ST.lvc.rows,...ST.lvgmc.rows];
function renderStations(){
  ST.renderedKey=stationRenderKey();
  for(const r of allStationRows())r.dist=haversineKm(S.lat,S.lon,r.lat,r.lon);
  syncRadarBar();
  renderStationMarkers();
  renderStationTable();
}
function networkLatest(net){
  let latest=NaN;
  for(const r of ST[net].rows)if(Number.isFinite(r.time)&&!(r.time<=latest))latest=r.time;
  return latest;
}
function stationIsStale(row){
  const latest=networkLatest(row.net);
  return !Number.isFinite(row.time)||(Number.isFinite(latest)&&row.time<latest-STATION_LAG);
}
function stationHref(row){
  const s=row.src||row;
  const page=row.net==='lvc'?'stacija.html':'stacija-lvgmc.html';
  return `${page}?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}&lat=${s.lat}&lon=${s.lon}`;
}

// ─── RADAR MAP ──────────────────────────────────────────────────────────────
// Called whenever the radar panel is shown; builds the map on the first call
async function initRadar(){
  try{
    if(!_rMap){
      if(typeof L==='undefined'||!$('radarMap'))return;
      buildRadarMap();
    }else{
      _rMap.invalidateSize();
      syncPlace();
    }
    requestAnimationFrame(()=>{if(_rMap){_rMap.invalidateSize();syncPlace();declutterStations();}});
    const jobs=[ensureStations()];
    if(R.show&&!R.loading&&(!R.frames.length||Date.now()-R.fetchedAt>=RADAR_REFRESH))jobs.push(loadRadarFrames());
    await Promise.all(jobs);
  }catch(e){console.warn('[radar]',e);}
}

function stopRadarPlayback(){
  R.timeline?.pause();
  setSettingsOpen(false);
}

function buildRadarMap(){
  loadRadarPrefs();
  _rMap=L.map('radarMap',{maxZoom:12,minZoom:4,zoomSnap:.5,zoomControl:false});
  _rMap.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  // Own panes: radar frames above every base map (all base maps share tilePane, 200),
  // place names above the radar (blended, see style.css), the selected-place ring
  // below the station markers (markerPane is 600).
  for(const [name,z] of [['radarPane',450],['radarLabels',460],['radarPlace',590]]){
    const pane=_rMap.createPane(name);pane.style.zIndex=z;pane.style.pointerEvents='none';
  }
  fitPlace();
  if(typeof addThemedMapLayer==='function'){
    R.themeLayers=[addThemedMapLayer(_rMap,'Base'),addThemedMapLayer(_rMap,'Reference',{pane:'radarLabels'})];
  }else{
    const theme=document.documentElement.getAttribute('data-theme')==='dark'?'Dark':'Light';
    const esri=part=>`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${theme}_Gray_${part}/MapServer/tile/{z}/{y}/{x}`;
    R.themeLayers=[L.tileLayer(esri('Base'),{attribution:'Tiles © Esri',maxZoom:16}).addTo(_rMap),L.tileLayer(esri('Reference'),{maxZoom:16,pane:'radarLabels'}).addTo(_rMap)];
  }
  applyBaseMap();
  L.control.zoom({position:'topright'}).addTo(_rMap);
  addMapFullscreen(_rMap,$('radarStage'));
  addRadarSettings();

  ST.layers.lvc=L.layerGroup();ST.layers.lvgmc=L.layerGroup();
  for(const net of ['lvc','lvgmc'])if(ST.on[net])ST.layers[net].addTo(_rMap);
  R.place=L.marker([S.lat,S.lon],{pane:'radarPlace',interactive:false,keyboard:false,
    icon:L.divIcon({className:'radar-place',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(_rMap);

  R.timeline=createTimeline({
    baseDelay:600,
    formatTime:fmtClock,
    formatValue:ms=>fmtClock(ms)+', '+fmtAge(ms),
    onChange:i=>{R.followLatest=i===R.frames.length-1;showRadarFrame(i);},
  });
  R.timeline.el.classList.add('radar-timeline');
  $('radarStage').append(R.timeline.el);
  R.legend=buildRadarLegend();
  R.timeline.setSide(R.legend);
  renderStationMarkers();

  bindRadarBar();
  _rMap.on('moveend resize',onRadarMove);
  // Popups stay clear of the overlays: pan inside them, scroll when there is no room
  _rMap.on('popupopen',e=>{
    const inset=radarInsets(),o=e.popup.options;
    o.autoPanPaddingTopLeft=L.point(12,inset.top+8);
    o.autoPanPaddingBottomRight=L.point(12,inset.bottom+8);
    o.maxHeight=Math.max(140,_rMap.getSize().y-inset.top-inset.bottom-40);
    e.popup.update();   // Leaflet already panned with the old options; redo it with these
  });
  _rMap.on('popupclose',e=>{
    if(ST.quiet)return;
    const key=e.popup?._source?._stationKey;
    if(key&&key===ST.selected){ST.selected=null;highlightSelection();declutterStations();}
  });
  if(typeof ResizeObserver==='function'){
    const stage=$('radarStage');
    new ResizeObserver(()=>{
      stage.style.setProperty('--tl-h',R.timeline.el.offsetHeight+'px');
      declutterStations();
    }).observe(R.timeline.el);
  }
  R.ticker=setInterval(radarTick,30000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)R.timeline?.pause();else radarTick();});
  relabelRadarControl();
}

function fitPlace(){
  const size=_rMap.getSize();
  // Hidden container (0×0): show something now, fit properly once it has a size
  if(!size.x||!size.y){R.placeKey='';_rMap.setView([S.lat,S.lon],6);return;}
  R.placeKey=placeKey();
  const inLatvia=S.lat>=55.4&&S.lat<=58.3&&S.lon>=20.5&&S.lon<=28.5;
  if(inLatvia)_rMap.fitBounds(LATVIA_BOUNDS,{padding:[6,6]});
  else _rMap.setView([S.lat,S.lon],7);
}
// The chosen place changed since the map last looked at it
function syncPlace(){
  if(!_rMap||R.placeKey===placeKey())return;
  fitPlace();
  R.place?.setLatLng([S.lat,S.lon]);
  renderStations();
}

function applyBaseMap(){
  if(!_rMap)return;
  const themed=R.base==='theme';
  for(const layer of R.themeLayers){if(themed)layer.addTo(_rMap);else _rMap.removeLayer(layer);}
  for(const [kind,layer] of Object.entries(R.extraBase))if(kind!==R.base)_rMap.removeLayer(layer);
  if(!themed){
    if(!R.extraBase[R.base])R.extraBase[R.base]=makeBaseLayer(R.base);
    R.extraBase[R.base].addTo(_rMap);
  }
  $('radarStage')?.setAttribute('data-base',R.base);
}
function makeBaseLayer(kind){
  if(kind==='osm')return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',maxZoom:19,subdomains:'abc'});
  if(kind==='relief')return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap, SRTM · © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',maxZoom:17,subdomains:'abc'});
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
    attribution:'Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',maxZoom:19});
}

// ─── RADAR FRAMES ───────────────────────────────────────────────────────────
function loadRadarFrames(){
  if(R.loading)return R.loading;
  R.loading=(async()=>{
    try{
      const options={cache:'no-cache'};
      try{if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)options.signal=AbortSignal.timeout(15000);}catch{}
      const r=await fetch(RAINVIEWER_API,options);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      // Free tier: observed frames only. The path is used inside a tile URL, so it
      // must look like a plain RainViewer path.
      const frames=(Array.isArray(d?.radar?.past)?d.radar.past:[])
        .filter(f=>f&&Number.isFinite(f.time)&&typeof f.path==='string'&&/^\/[\w/.-]+$/.test(f.path)&&!f.path.includes('//'))
        .sort((a,b)=>a.time-b.time);
      if(!frames.length)throw new Error('no frames');
      const idx=mergeFrameIndex(R.frames.map(f=>f.time),R.idx,frames.map(f=>f.time),R.followLatest);
      // Tiles come from the host the API names (only a RainViewer https host is accepted)
      if(typeof d.host==='string'&&/^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/.test(d.host))R.host=d.host;
      R.frames=frames;R.fetchedAt=Date.now();R.failed=false;
      syncFrameLayers();
      R.timeline?.setFrames(frames.map(f=>f.time*1000),idx);
      showRadarFrame(idx);
    }catch(e){
      R.failed=true;R.failedAt=Date.now();
      console.warn('[radar] frames',e?.message||e);
    }
    R.loading=null;
    updateRadarStatus();
  })();
  updateRadarStatus();
  return R.loading;
}

// RainViewer's free tier allows 100 requests a minute from one address. Every radar tile
// request goes through this queue, which keeps to 90 a minute; tiles of the frame on
// screen go first, tiles that left the view are dropped from the queue.
const RV_PER_MIN=90;
const _rvQueue=[];let _rvSent=[],_rvTimer=null;
function rvPump(){
  const now=Date.now();
  _rvSent=_rvSent.filter(t=>now-t<60000);
  while(_rvQueue.length&&_rvSent.length<RV_PER_MIN){
    const job=_rvQueue.shift();
    if(job.cancelled)continue;
    _rvSent.push(now);job.run();
  }
  clearTimeout(_rvTimer);_rvTimer=null;
  if(_rvQueue.length)_rvTimer=setTimeout(rvPump,60000-(now-_rvSent[0])+50);
}
const RadarTileLayer=L.TileLayer.extend({
  createTile(coords,done){
    const tile=document.createElement('img');
    L.DomEvent.on(tile,'load',L.Util.bind(this._tileOnLoad,this,done,tile));
    L.DomEvent.on(tile,'error',L.Util.bind(this._tileOnError,this,done,tile));
    tile.alt='';tile.setAttribute('role','presentation');
    const url=this.getTileUrl(coords);
    tile._rv={path:this.options.path,run:()=>{tile.src=url;}};
    if(this.options.path===R.frames[R.idx]?.path)_rvQueue.unshift(tile._rv);else _rvQueue.push(tile._rv);
    rvPump();
    return tile;
  },
});

// One tile layer per frame at opacity 0, so switching frames is only an opacity change and
// the animation does not flicker. Frames that dropped out are removed.
function frameLayer(f){
  let layer=R.layers.get(f.path);
  if(layer)return layer;
  layer=new RadarTileLayer(`${R.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{
    path:f.path,opacity:0,tileSize:256,maxNativeZoom:6,keepBuffer:0,pane:'radarPane',className:'radar-frame'});
  layer.on('load',()=>{if(!R.loaded.has(f.path)){R.loaded.add(f.path);updateRadarStatus();}});
  layer.on('tileunload',e=>{if(e.tile?._rv)e.tile._rv.cancelled=true;});
  // A tile that still failed (limit or network) is asked again a minute later, once per frame
  layer.on('tileerror',()=>{
    if(layer._retry)return;
    layer._retry=setTimeout(()=>{if(R.layers.get(f.path)===layer&&_rMap?.hasLayer(layer))layer.redraw();},60000);
  });
  R.layers.set(f.path,layer);
  return layer;
}
function syncFrameLayers(){
  if(!_rMap)return;
  const {removed}=diffFrameKeys([...R.layers.keys()],R.frames.map(f=>f.path));
  for(const path of removed){_rMap.removeLayer(R.layers.get(path));R.layers.delete(path);R.loaded.delete(path);}
  for(const f of R.frames){
    const layer=frameLayer(f);
    if(R.show)layer.addTo(_rMap);else _rMap.removeLayer(layer);
  }
  applyFrameOpacity();
}

function applyFrameOpacity(){
  const current=R.frames[R.idx]?.path;
  R.layers.forEach((layer,path)=>layer.setOpacity(R.show&&path===current?R.opacity:0));
}
function showRadarFrame(idx){
  if(!R.frames[idx])return;
  R.idx=idx;
  // Tiles still waiting for the frame now on screen move to the front of the queue
  const path=R.frames[idx].path;
  if(_rvQueue.some(j=>j.path===path)){
    const mine=_rvQueue.filter(j=>j.path===path),rest=_rvQueue.filter(j=>j.path!==path);
    _rvQueue.length=0;_rvQueue.push(...mine,...rest);
  }
  applyFrameOpacity();
}

function updateRadarStatus(){
  const tl=R.timeline;
  if(!tl)return;
  if(R.legend)R.legend.hidden=!R.show;
  if(!R.show){tl.setDisabled(true);tl.setStatus(t('rad.hidden'),'');return;}
  if(!R.frames.length){
    tl.setDisabled(true);
    tl.setStatus(R.failed?t('rad.failed'):t('rad.loading'),R.failed?'bad':'');
    return;
  }
  tl.setDisabled(false);
  const lastMs=R.frames[R.frames.length-1].time*1000,age=(Date.now()-lastMs)/60000;
  const parts=[t('rad.latest_age',{time:fmtClock(lastMs),age:fmtAge(lastMs)})];
  const loaded=R.frames.filter(f=>R.loaded.has(f.path)).length;
  if(loaded<R.frames.length)parts.push(t('rad.frames_loading',{n:loaded,total:R.frames.length}));
  else{const step=frameStepMinutes(R.frames.map(f=>f.time*1000));if(step)parts.push(t('rad.frames_step',{n:step}));}
  if(R.failed)parts.push(t('rad.refresh_failed'));
  tl.setStatus(parts.join(' · '),age<=20?'ok':age<=60?'warn':'bad');
}

// Runs every 30 s; does work only while the radar panel is on screen
function radarTick(){
  if(!_rMap||!radarPanelVisible())return;
  syncPlace();
  const now=Date.now();
  if(R.show&&now-R.fetchedAt>=RADAR_REFRESH&&!(R.failed&&now-R.failedAt<RADAR_RETRY))loadRadarFrames();
  ensureStations();
  updateRadarStatus();
}

// Precipitation colour legend (RainViewer "Universal Blue" palette, scheme 2 in the
// tile URL). Words only: the palette maps radar reflectivity, not exact mm/h.
const RADAR_LEGEND=[['rad.legend_light',['#88ddee','#0099cc']],['rad.legend_moderate',['#0077aa','#005588']],['rad.legend_heavy',['#ffee00','#ff4400']]];
function buildRadarLegend(){
  const box=radarNode('span','radar-legend');
  box.setAttribute('role','img');
  relabelRadarLegend(box);
  return box;
}
function relabelRadarLegend(box=R.legend){
  if(!box)return;
  box.replaceChildren();
  box.setAttribute('aria-label',t('rad.legend_aria'));
  for(const [key,colors] of RADAR_LEGEND){
    const item=radarNode('span','radar-legend-item');
    const sw=radarNode('span','radar-legend-sw');
    for(const c of colors){const i=radarNode('i');i.style.background=c;sw.append(i);}
    item.append(sw,radarNode('span',null,t(key)));
    box.append(item);
  }
}

// ─── MAP CONTROLS ───────────────────────────────────────────────────────────
function bindRadarBar(){
  $('radarTogglePrecip')?.addEventListener('click',()=>{
    R.show=!R.show;saveRadarPrefs();
    if(!R.show)R.timeline?.pause();
    syncFrameLayers();syncRadarBar();updateRadarStatus();
    if(R.show&&!R.loading&&Date.now()-R.fetchedAt>=RADAR_REFRESH)loadRadarFrames();
  });
  $('radarToggleLvc')?.addEventListener('click',()=>toggleNetwork('lvc'));
  $('radarToggleLvgmc')?.addEventListener('click',()=>toggleNetwork('lvgmc'));
  document.querySelectorAll('#radarMetric [data-metric]').forEach(b=>b.addEventListener('click',()=>{
    if(R.metric===b.dataset.metric)return;
    R.metric=b.dataset.metric;saveRadarPrefs();syncRadarBar();renderStationMarkers();
  }));
  syncRadarBar();
}
// One choice for the map and the table: the network buttons on the map decide which stations
// the table lists, and the table's network filter switches the networks on the map
function toggleNetwork(net,on=!ST.on[net]){
  ST.on[net]=on;saveRadarPrefs();
  const layer=ST.layers[net];
  if(_rMap&&layer){if(on)layer.addTo(_rMap);else _rMap.removeLayer(layer);}
  syncRadarBar();declutterStations();
  renderStationTable();
}
// Both on (or both off: the table still lists everything) -> all; otherwise the one that is on
const tableNet=()=>ST.on.lvc===ST.on.lvgmc?'all':ST.on.lvc?'lvc':'lvgmc';
function showNetworks(choice){
  for(const net of ['lvc','lvgmc']){
    const on=choice==='all'||choice===net;
    if(ST.on[net]!==on)toggleNetwork(net,on);
  }
  renderStationTable();
}
function syncRadarBar(){
  const set=(id,on)=>$(id)?.setAttribute('aria-pressed',String(on));
  set('radarTogglePrecip',R.show);set('radarToggleLvc',ST.on.lvc);set('radarToggleLvgmc',ST.on.lvgmc);
  const count=(id,n)=>{const e=$(id);if(e)e.textContent=n?String(n):'';};
  count('radarCountLvc',ST.lvc.rows.length);count('radarCountLvgmc',ST.lvgmc.rows.length);
  document.querySelectorAll('#radarMetric [data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===R.metric)));
}
function labelRadarBar(){
  $('radarBar')?.setAttribute('aria-label',t('rad.layers_aria'));
  $('radarMap')?.setAttribute('aria-label',t('rad.map_aria'));
  const title=(id,key)=>{const e=$(id);if(e)e.title=t(key);};
  title('radarTogglePrecip','rad.layer_precip_title');title('radarToggleLvc','rad.layer_lvc_title');title('radarToggleLvgmc','rad.layer_lvgmc_title');
  document.querySelectorAll('#radarMetric [data-metric]').forEach(b=>{
    b.title=t('rad.metric_'+b.dataset.metric+'_title');
    b.setAttribute('aria-label',t('rad.metric_'+b.dataset.metric+'_title'));
  });
}

const RADAR_BASES=[['theme','rad.base_theme'],['osm','rad.base_osm'],['relief','rad.base_relief'],['satellite','rad.base_sat']];
const LAYERS_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3.5 8.5 12 13l8.5-4.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/></svg>';
function addRadarSettings(){
  const Control=L.Control.extend({options:{position:'topright'},onAdd(){
    const box=L.DomUtil.create('div','leaflet-bar radar-settings');
    const btn=L.DomUtil.create('button','radar-settings-btn',box);
    btn.type='button';btn.innerHTML=LAYERS_ICON;
    btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','radarSettingsPanel');
    const panel=L.DomUtil.create('div','radar-settings-panel',box);
    panel.id='radarSettingsPanel';panel.hidden=true;
    const set=radarNode('fieldset','radar-settings-set');
    const legend=radarNode('legend');set.append(legend);
    const radios={};
    for(const [kind] of RADAR_BASES){
      const label=radarNode('label','radar-radio');
      const input=radarNode('input');input.type='radio';input.name='radarBase';input.value=kind;input.checked=R.base===kind;
      input.addEventListener('change',()=>{if(!input.checked)return;R.base=kind;saveRadarPrefs();applyBaseMap();});
      const text=radarNode('span');
      label.append(input,text);set.append(label);radios[kind]={input,text};
    }
    const op=radarNode('label','radar-opacity');
    const opText=radarNode('span');
    const range=radarNode('input');range.type='range';range.min='20';range.max='100';range.step='5';range.value=String(Math.round(R.opacity*100));
    const out=radarNode('output',null,range.value+'%');
    range.addEventListener('input',()=>{R.opacity=Number(range.value)/100;out.textContent=range.value+'%';applyFrameOpacity();});
    range.addEventListener('change',saveRadarPrefs);
    op.append(opText,range,out);
    panel.append(set,op);
    btn.addEventListener('click',()=>setSettingsOpen(panel.hidden));
    box.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();setSettingsOpen(false);btn.focus();}});
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
    R.settings={box,btn,panel,legend,radios,opText,range};
    return box;
  }});
  _rMap.addControl(new Control());
  document.addEventListener('pointerdown',e=>{if(R.settings&&!R.settings.panel.hidden&&!R.settings.box.contains(e.target))setSettingsOpen(false);});
}
function setSettingsOpen(open){
  const s=R.settings;
  if(!s)return;
  s.panel.hidden=!open;
  s.btn.setAttribute('aria-expanded',String(open));
  if(open){for(const [kind,r] of Object.entries(s.radios))r.input.checked=kind===R.base;}
}
function relabelRadarSettings(){
  const s=R.settings;
  if(!s)return;
  s.btn.title=t('rad.settings');s.btn.setAttribute('aria-label',t('rad.settings'));
  s.panel.setAttribute('aria-label',t('rad.settings'));
  s.legend.textContent=t('rad.base');
  for(const [kind,key] of RADAR_BASES)s.radios[kind].text.textContent=t(key);
  s.opText.textContent=t('rad.opacity');
  s.range.setAttribute('aria-label',t('rad.opacity'));
}

// ─── STATION MARKERS ────────────────────────────────────────────────────────
const RADAR_METRICS={
  temp:{get:r=>r.airTemp,text:v=>fmtTemp(v,1),color:v=>tempColor(v),extremes:'both'},
  road:{get:r=>r.surfaceTemp,text:v=>fmtTemp(v,1),color:v=>tempColor(v),extremes:'both'},
  wind:{get:r=>r.windSpeed,text:v=>fmtNum(v,1),color:()=>null,extremes:'max'},
  precip:{get:r=>r.precip,text:v=>fmtNum(v,1),color:()=>null,extremes:'max'},
};
const windArrow=deg=>`<svg class="st-wind-arrow" viewBox="0 0 12 12" aria-hidden="true" style="transform:rotate(${Math.round(deg)}deg)"><path d="M6 1.5v8.5M2.8 6.8 6 10l3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderStationMarkers(){
  if(!_rMap||!ST.layers.lvc)return;
  const m=RADAR_METRICS[R.metric];
  const reopen=ST.selected&&ST.markers.get(ST.selected)?.marker.isPopupOpen();
  ST.quiet=true;
  ST.layers.lvc.clearLayers();ST.layers.lvgmc.clearLayers();
  ST.quiet=false;
  ST.markers.clear();
  for(const row of allStationRows()){
    const value=m.get(row);
    const text=value==null?'':m.text(value);
    const arrow=R.metric==='wind'&&row.windDir!=null&&value>0;
    const color=value==null?null:m.color(value);
    const style=color?` style="--mark:${color}"`:'';
    const tone=R.metric==='precip'&&value>0?' is-rain':color?' is-temp':'';
    const html=`<span class="st-badge${tone}"${style}>${arrow?windArrow(row.windDir):''}${text}</span><span class="st-dot${tone}"${style}></span>`;
    const label=row.name+(text?': '+text+(R.metric==='wind'?' m/s':R.metric==='precip'?' mm/h':''):'');
    const marker=L.marker([row.lat,row.lon],{
      icon:L.divIcon({className:'st-marker is-'+row.net+' is-dot',html,iconSize:[0,0],iconAnchor:[0,0]}),
      title:label,alt:label,riseOnHover:true,keyboard:true,
    });
    marker._stationKey=row.key;
    marker.bindPopup(()=>stationPopup(row),{maxWidth:280,minWidth:210});
    marker.on('popupopen',()=>{if(!ST.quiet&&ST.selected!==row.key)selectStation(row.key,{fromMap:true});});
    marker.addTo(ST.layers[row.net]);
    ST.markers.set(row.key,{marker,row,value,width:12+6.7*text.length+(arrow?13:0)});
  }
  declutterStations();
  if(reopen)ST.markers.get(ST.selected)?.marker.openPopup();
}

// Map controls drawn over the map, in map-container pixels; badges avoid them
function radarOverlayRects(){
  const map=_rMap.getContainer().getBoundingClientRect();
  const els=[...($('radarBar')?.children||[]),R.timeline?.el,..._rMap.getContainer().querySelectorAll('.leaflet-control')];
  return els.filter(Boolean).map(el=>{
    const r=el.getBoundingClientRect();
    return r.width?{l:r.left-map.left,t:r.top-map.top,r:r.right-map.left,b:r.bottom-map.top}:null;
  }).filter(Boolean);
}

// Space taken by the layer bar (top) and the timeline and attribution (bottom), in map pixels
function radarInsets(){
  const map=_rMap.getContainer().getBoundingClientRect();
  let top=0,bottom=0;
  for(const el of $('radarBar')?.children||[]){const r=el.getBoundingClientRect();if(r.height)top=Math.max(top,r.bottom-map.top);}
  for(const el of [R.timeline?.el,..._rMap.getContainer().querySelectorAll('.leaflet-bottom .leaflet-control')]){
    const r=el?.getBoundingClientRect();
    if(r?.height)bottom=Math.max(bottom,map.bottom-r.top);
  }
  return {top,bottom};
}

// Which stations get a full badge right now (selected, nearest, extremes, then by
// distance, without overlaps); the rest become dots. Runs after every move and zoom.
function declutterStations(){
  if(!_rMap||!ST.markers.size)return;
  const size=_rMap.getSize();
  if(!size.x||!size.y)return;
  const items=[];
  for(const [key,e] of ST.markers){
    if(!ST.on[e.row.net])continue;
    const p=_rMap.latLngToContainerPoint([e.row.lat,e.row.lon]);
    const inView=p.x>=-20&&p.y>=-20&&p.x<=size.x+20&&p.y<=size.y+20;
    const hasValue=e.value!=null&&!(R.metric==='precip'&&e.value<=0);
    if(inView&&hasValue)items.push({id:key,x:p.x,y:p.y,w:e.width,h:20,dist:e.row.dist,value:e.value});
  }
  const priority=badgePriorities(items,{selectedId:ST.selected,extremes:RADAR_METRICS[R.metric].extremes});
  const keep=declutterBadges(items.map(i=>({...i,priority:priority.get(i.id)})),{pad:2,blocked:radarOverlayRects()});
  for(const [key,e] of ST.markers){
    const el=e.marker.getElement();
    if(!el)continue;
    const badge=keep.has(key),selected=key===ST.selected;
    el.classList.toggle('is-dot',!badge);
    el.classList.toggle('is-selected',selected);
    el.tabIndex=badge?0:-1;
    el.setAttribute('aria-hidden',String(!badge));
    e.marker.setZIndexOffset(selected?2000:badge?500:0);
  }
}
let _radarMoveTimer=null;
function onRadarMove(){
  declutterStations();
  if(ST.inView){clearTimeout(_radarMoveTimer);_radarMoveTimer=setTimeout(renderStationTable,150);}
}

// Popup content as DOM nodes: station names and values never go through innerHTML
function stationPopup(row){
  const box=radarNode('div','st-popup');
  box.append(radarNode('h4',null,row.name));
  const meta=radarNode('p','st-popup-meta');
  meta.append(`${NETWORK_NAME[row.net]} · ${t('station.dist_away',{n:fmtNum(row.dist,1)})} · ${t('st.measured',{time:fmtClock(row.time)})}`);
  if(stationIsStale(row)){meta.append(' ');meta.append(radarNode('span','st-stale',fmtAge(row.time)));}
  box.append(meta);
  const temp=v=>v==null?null:fmtTemp(v,1);
  const wind=r=>r.windSpeed==null?null:`${fmtNum(r.windSpeed,1)} m/s${r.windDir!=null?' '+COMPASS[LANG][compassIndex(r.windDir)]:''}`;
  // Third item marks secondary readings, hidden on phones to keep the popup short.
  // The last-hour change sits in the air temperature row, so the popup keeps its height.
  const air=row.airTemp==null?null:[temp(row.airTemp),stationTrendMark(freshTrend(row),true)];
  const rows=row.net==='lvc'?[
    ['station.air_t',air],
    ['station.road_surface_t',temp(row.surfaceTemp)],
    ['station.road_cond',row.cond?roadCondLabel(row.cond):null],
    ['station.dew_point',temp(row.dewPoint),true],
    ['station.humidity',row.humidity==null?null:fmtNum(row.humidity,0)+'%'],
    ['station.wind',wind(row)],
    ['station.gust',row.windGust==null?null:fmtNum(row.windGust,1)+' m/s',true],
    ['station.precip',row.precip==null?null:fmtNum(row.precip,1)+' mm/h'],
    ['station.visibility',row.visibility==null?null:fmtNum(row.visibility/1000,1)+' km',true],
  ]:[
    ['station.air_t',air],
    ['station.feels_t',temp(row.feelsLike)],
    ['station.wind',wind(row)],
    ['station.gust',row.windGust==null?null:fmtNum(row.windGust,1)+' m/s',true],
    ['station.humidity',row.humidity==null?null:fmtNum(row.humidity,0)+'%'],
    ['station.pressure',row.pressure==null?null:fmtNum(row.pressure,1)+' hPa',true],
    ['station.precip_h',row.precip==null?null:fmtNum(row.precip,1)+' mm'],
    ['station.visibility',row.visibility==null?null:fmtNum(row.visibility/1000,1)+' km',true],
    ['station.uv',row.uv==null?null:fmtNum(row.uv,0),true],
  ];
  const tbl=radarNode('table','st-popup-table');
  for(const [key,val,minor] of rows){
    if(val==null)continue;
    const tr=radarNode('tr',minor?'is-minor':null);
    const td=radarNode('td');
    td.append(...[].concat(val).filter(Boolean));
    tr.append(radarNode('th',null,t(key)),td);
    tbl.append(tr);
  }
  if(tbl.rows.length)box.append(tbl);
  if(row.net==='lvgmc'&&row.spark?.length>2)box.append(stationSparkline(row.spark));
  const link=radarNode('a','st-popup-link',t('station.history_24h'));
  link.href=stationHref(row);
  box.append(link);
  return box;
}

// Small 24 h temperature line for LVĢMC popups (gaps over 2 h break the line)
function stationSparkline(points){
  const W=220,H=46,P=4,ns='http://www.w3.org/2000/svg';
  const t0=points[0].t,t1=points[points.length-1].t;
  let lo=Infinity,hi=-Infinity;
  for(const p of points){lo=Math.min(lo,p.v);hi=Math.max(hi,p.v);}
  const span=Math.max(hi-lo,1),mid=(hi+lo)/2;
  const x=ms=>P+(W-2*P)*(t1>t0?(ms-t0)/(t1-t0):1);
  const y=v=>H/2-(v-mid)/span*(H-2*P);
  let d='';
  points.forEach((p,i)=>{d+=(i&&p.t-points[i-1].t<=2*3600000?'L':'M')+x(p.t).toFixed(1)+' '+y(p.v).toFixed(1);});
  const wrap=radarNode('figure','st-spark');
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');
  svg.setAttribute('aria-label',t('st.spark_aria',{min:fmtTemp(lo,1),max:fmtTemp(hi,1)}));
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d',d);path.setAttribute('class','st-spark-line');
  const last=points[points.length-1];
  const dot=document.createElementNS(ns,'circle');
  dot.setAttribute('cx',x(last.t).toFixed(1));dot.setAttribute('cy',y(last.v).toFixed(1));dot.setAttribute('r','2.5');dot.setAttribute('class','st-spark-dot');
  svg.append(path,dot);
  const cap=radarNode('figcaption');
  cap.append(radarNode('span',null,t('st.spark_title')),radarNode('span',null,`${fmtTemp(lo,1)} … ${fmtTemp(hi,1)}`));
  wrap.append(svg,cap);
  return wrap;
}

// ─── SELECTION ──────────────────────────────────────────────────────────────
// fromMap: the marker's popup was opened on the map (click or keyboard)
function selectStation(key,{fromMap=false}={}){
  ST.selected=key;
  highlightSelection();
  declutterStations();
  if(fromMap||!_rMap)return;
  const entry=ST.markers.get(key);
  if(!entry)return;
  if(!ST.on[entry.row.net])toggleNetwork(entry.row.net,true);
  ST.quiet=true;
  _rMap.setView([entry.row.lat,entry.row.lon],Math.max(_rMap.getZoom(),8),{animate:false});
  entry.marker.openPopup();
  ST.quiet=false;
  declutterStations();
  const stage=$('radarStage');
  if(stage&&radarPanelVisible()){
    const r=stage.getBoundingClientRect();
    const seen=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
    if(seen<r.height*.4)stage.scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'});
  }
}
function highlightSelection(){
  document.querySelectorAll('#stBody tr[data-key],#stList li[data-key]').forEach(el=>{
    el.classList.toggle('is-selected',el.dataset.key===ST.selected);
  });
}

// ─── STATION TABLE ──────────────────────────────────────────────────────────
// dir: direction of the first click. Values that are missing always sort last.
const ST_COLUMNS=[
  {key:'name',label:'st.col_station',by:'st.by_name',dir:1,get:r=>r.name},
  {key:'dist',label:'st.col_dist',title:'st.col_dist_title',by:'st.by_dist',dir:1,get:r=>r.dist,num:true},
  {key:'air',label:'st.col_air',title:'st.col_air_title',by:'st.by_air',dir:-1,get:r=>r.airTemp,num:true},
  {key:'road',label:'st.col_road',title:'st.col_road_title',by:'st.by_road',dir:1,get:r=>r.surfaceTemp,num:true},
  {key:'wind',label:'st.col_wind',title:'st.col_wind_title',by:'st.by_wind',dir:-1,get:r=>r.windSpeed},
  {key:'precip',label:'st.col_precip',title:'st.col_precip_title',by:'st.by_precip',dir:-1,get:r=>r.precip,num:true},
  {key:'hum',label:'st.col_hum',title:'st.col_hum_title',by:'st.by_hum',dir:-1,get:r=>r.humidity,num:true},
  {key:'cond',label:'st.col_cond',title:'st.col_cond_title',by:'st.by_cond',dir:-1,get:r=>r.cond==null?null:(ROAD_SEVERITY[r.cond]??.5)},
  {key:'range',label:'st.col_range',title:'st.col_range_title',sortable:false},
];
const SORT_ARROW='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2.5 8.5 7.5h-7z" fill="currentColor"/></svg>';

function sortStationRows(rows){
  const col=ST_COLUMNS.find(c=>c.key===ST.sort.key)||ST_COLUMNS[1];
  const dir=ST.sort.dir;
  return rows.sort((a,b)=>{
    const av=col.get(a),bv=col.get(b);
    if(av==null||bv==null)return av==null&&bv==null?a.dist-b.dist:av==null?1:-1;
    const c=typeof av==='string'?String(av).localeCompare(String(bv),'lv'):av-bv;
    return c?dir*c:a.dist-b.dist;
  });
}
function filteredStationRows(){
  let rows=allStationRows();
  const net=tableNet();
  if(net!=='all')rows=rows.filter(r=>r.net===net);
  const q=foldText(ST.query.trim());
  if(q)rows=rows.filter(r=>foldText(r.name).includes(q));
  if(ST.inView&&_rMap&&radarPanelVisible()){
    const b=_rMap.getBounds();
    rows=rows.filter(r=>ST.on[r.net]&&b.contains([r.lat,r.lon]));
  }
  return sortStationRows(rows);
}

function renderStationHead(){
  const tr=$('stHeadRow');
  if(!tr)return;
  tr.replaceChildren();
  for(const col of ST_COLUMNS){
    const th=radarNode('th');th.scope='col';th.className='st-col-'+col.key;
    if(col.title)th.title=t(col.title);
    if(col.sortable===false){th.textContent=t(col.label);tr.append(th);continue;}
    const active=ST.sort.key===col.key;
    th.setAttribute('aria-sort',active?(ST.sort.dir>0?'ascending':'descending'):'none');
    const b=radarNode('button','st-sort');b.type='button';
    b.append(radarNode('span',null,t(col.label)));
    const arrow=radarNode('span','st-sort-arrow'+(active?' is-on':'')+(active&&ST.sort.dir<0?' is-desc':''));
    arrow.innerHTML=SORT_ARROW;b.append(arrow);
    b.setAttribute('aria-label',t('st.sort_by',{col:t(col.by)}));
    b.addEventListener('click',()=>{
      if(ST.sort.key===col.key)ST.sort.dir=-ST.sort.dir;
      else ST.sort={key:col.key,dir:col.dir};
      renderStationHead();renderStationTable();
      tr.querySelector('.st-col-'+col.key+' button')?.focus();
    });
    th.append(b);tr.append(th);
  }
}

function stationTimesText(){
  const box=$('stTimes');
  if(!box)return;
  box.replaceChildren();
  for(const net of ['lvc','lvgmc']){
    const latest=networkLatest(net);
    if(!Number.isFinite(latest)&&!ST[net].error)continue;
    if(box.childNodes.length)box.append(' · ');
    const span=radarNode('span',null,`${NETWORK_NAME[net]} ${Number.isFinite(latest)?fmtClock(latest):'-'}`);
    const old=!Number.isFinite(latest)||Date.now()-latest>(net==='lvc'?90:180)*60000;
    if(old||ST[net].error){span.className='st-old';span.title=ST[net].error?t(net==='lvc'?'radar.lvc_failed':'radar.lvgmc_failed'):t('st.net_old');}
    box.append(span);
  }
}

function renderStationTable(){
  const body=$('stBody'),list=$('stList');
  if(!body||!list)return;
  const all=allStationRows();
  const counts={all:all.length,lvc:ST.lvc.rows.length,lvgmc:ST.lvgmc.rows.length};
  document.querySelectorAll('#stNetFilter [data-net]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.net===tableNet()));
    const c=b.querySelector('.st-count');if(c)c.textContent=counts[b.dataset.net]?String(counts[b.dataset.net]):'';
  });
  stationTimesText();

  const msg=$('stMsg');
  const pending=ST.lvc.promise||ST.lvgmc.promise||(!ST.lvc.fetchedAt&&!ST.lvc.error)||(!ST.lvgmc.fetchedAt&&!ST.lvgmc.error);
  const notes=[];
  if(ST.lvc.error)notes.push(t('radar.lvc_failed'));
  if(ST.lvgmc.error)notes.push(t('radar.lvgmc_failed'));
  if(!all.length&&pending&&!notes.length)notes.push(t('st.loading'));
  msg.textContent=notes.join(' ');
  msg.hidden=!notes.length;
  msg.classList.toggle('is-error',ST.lvc.error||ST.lvgmc.error);

  const rows=filteredStationRows();
  const shown=ST.showAll?rows:rows.slice(0,STATION_ROWS);
  let lo=Infinity,hi=-Infinity;
  for(const r of shown)for(const v of [r.min24,r.max24,r.airTemp])if(v!=null){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  const scale={lo,hi:Math.max(hi,lo+1)};
  const maxPrecip=Math.max(2,...shown.map(r=>r.precip||0));

  body.replaceChildren(...shown.map(r=>stationTableRow(r,scale,maxPrecip)));
  list.replaceChildren(...shown.map(stationListItem));
  if(!shown.length&&all.length){
    const tr=radarNode('tr','st-empty'),td=radarNode('td',null,t('st.none'));td.colSpan=ST_COLUMNS.length;tr.append(td);body.append(tr);
    list.append(radarNode('li','st-empty',t('st.none')));
  }
  $('stationTable').hidden=!all.length;
  list.hidden=!all.length;

  const note=$('stFootNote'),more=$('stMore');
  const col=ST_COLUMNS.find(c=>c.key===ST.sort.key);
  note.textContent=rows.length?t('st.shown',{n:shown.length,total:rows.length})+(col?.by?' · '+t('st.sorted',{col:t(col.by)}):''):'';
  more.hidden=rows.length<=STATION_ROWS;
  more.textContent=ST.showAll?t('st.show_less'):t('st.show_all',{n:rows.length});
  more.setAttribute('aria-expanded',String(ST.showAll));
  highlightSelection();
}

function tempPill(v){
  const s=radarNode('span','st-pill',v==null?'-':fmtTemp(v,1));
  if(v==null)s.classList.add('is-empty');else s.style.background=tempColor(v);
  return s;
}
// Change over the last hour: "+0,8°"
const stationTrendText=tr=>(tr.delta>0?'+':'')+fmtTemp(tr.delta,1);
const STATION_TREND_ARROW='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.6V1.6M1.9 4.6 5 1.5l3.1 3.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Small arrow when the air temperature moved at least 0.3° in the last hour, else null.
// The exact change is in the title and aria-label; withValue also shows it ("↑ 0,7°").
// A trend only for a current reading (LVC every 15 min, LVĢMC hourly)
const freshTrend=r=>!stationIsStale(r)&&Date.now()-r.time<=(r.net==='lvc'?90:180)*60000?r.trend:null;
function stationTrendMark(tr,withValue){
  if(!tr||Math.abs(tr.delta)<.3)return null;
  const a=radarNode('span','st-trend '+(tr.delta>0?'is-up':'is-down'));
  const label=t('rad.trend_title',{v:stationTrendText(tr)});
  a.title=label;a.setAttribute('role','img');a.setAttribute('aria-label',label);
  a.innerHTML=STATION_TREND_ARROW;
  if(withValue)a.append(fmtTemp(Math.abs(tr.delta),1));
  return a;
}
// Temperature pill plus the trend arrow
function stationTempCell(r){
  const box=radarNode('span','st-temp');
  box.append(tempPill(r.airTemp));
  const mark=stationTrendMark(freshTrend(r));
  if(mark)box.append(mark);
  return box;
}
function stationNameCell(r){
  const wrap=radarNode('div','st-namebox');
  const a=radarNode('a','st-name',r.name);a.href=stationHref(r);
  const sub=radarNode('span','st-sub',NETWORK_NAME[r.net]);
  if(stationIsStale(r)){
    const s=radarNode('span','st-stale',Number.isFinite(r.time)?fmtAge(r.time):t('st.no_time'));
    s.title=t('st.stale_title');sub.append(' · ',s);
  }
  wrap.append(a,sub);
  return wrap;
}
function stationTableRow(r,scale,maxPrecip){
  const tr=radarNode('tr');tr.dataset.key=r.key;tr.tabIndex=0;
  const td=(cls,...kids)=>{const c=radarNode('td',cls);c.append(...kids);return c;};
  const muted=text=>radarNode('span','st-muted',text);
  // wind: arrow shows where the air is going
  const wind=radarNode('span','st-wind');
  if(r.windSpeed==null)wind.append(muted('-'));
  else{
    if(r.windDir!=null)wind.insertAdjacentHTML('beforeend',windArrow(r.windDir));
    wind.append(fmtNum(r.windSpeed,1));
    wind.title=t('st.wind_title',{dir:r.windDir!=null?COMPASS[LANG][compassIndex(r.windDir)]:'',v:fmtNum(r.windSpeed,1),g:r.windGust!=null?fmtNum(r.windGust,1):'-'}).trim();
  }
  const precip=radarNode('span','st-precip');
  if(r.precip==null)precip.append(muted('-'));
  else if(r.precip<=0)precip.append(muted(fmtNum(0,0)));
  else{const bar=radarNode('i','st-precip-bar');bar.style.width=Math.max(3,Math.round(36*Math.min(1,r.precip/maxPrecip)))+'px';precip.append(bar,fmtNum(r.precip,1));}
  const cond=r.cond?radarNode('span','st-tag is-'+(ROAD_COND_TONE[r.cond]||'dry'),roadCondLabel(r.cond)):muted('-');
  tr.append(
    td('st-c-name',stationNameCell(r)),
    td('st-c-num',r.dist==null?'-':fmtNum(r.dist,r.dist<100?1:0)+' km'),
    td('st-c-air',stationTempCell(r)),
    td('st-c-num',r.surfaceTemp==null?muted('-'):fmtTemp(r.surfaceTemp,1)),
    td('st-c-wind',wind),
    td('st-c-precip',precip),
    td('st-c-num',r.humidity==null?muted('-'):fmtNum(r.humidity,0)+'%'),
    td('st-c-cond',cond),
    td('st-c-range',rangeBar(r,scale)),
  );
  return tr;
}
// 24 h min…max on a scale shared by the visible rows, tick at the current temperature
function rangeBar(r,scale){
  if(r.min24==null||r.max24==null)return radarNode('span','st-muted','-');
  const pos=v=>(100*(v-scale.lo)/(scale.hi-scale.lo)).toFixed(1)+'%';
  const box=radarNode('div','st-range');
  box.title=t('st.range_title',{min:fmtTemp(r.min24,1),max:fmtTemp(r.max24,1),now:fmtTemp(r.airTemp,1)});
  const bar=radarNode('div','st-range-bar');
  const fill=radarNode('i','st-range-fill');
  fill.style.left=pos(r.min24);
  fill.style.width=`calc(${pos(r.max24)} - ${pos(r.min24)})`;
  // data-encoding gradient: colour of the min temperature to colour of the max
  fill.style.background=`linear-gradient(90deg,${tempColor(r.min24)},${tempColor(r.max24)})`;
  bar.append(fill);
  if(r.airTemp!=null){const now=radarNode('i','st-range-now');now.style.left=pos(r.airTemp);bar.append(now);}
  const labels=radarNode('div','st-range-lbl');
  labels.append(radarNode('span',null,fmtTemp(r.min24,1)),radarNode('span',null,fmtTemp(r.max24,1)));
  box.append(bar,labels);
  return box;
}
function stationListItem(r){
  const li=radarNode('li','st-item');li.dataset.key=r.key;li.tabIndex=0;
  const main=radarNode('div','st-item-main');
  const a=radarNode('a','st-name',r.name);a.href=stationHref(r);
  const meta=radarNode('div','st-item-meta');
  // network · distance · precipitation · road or wind · condition · stale age
  // (rain comes early so a narrow screen does not cut it off)
  const parts=[NETWORK_NAME[r.net]];
  if(r.dist!=null)parts.push(fmtNum(r.dist,r.dist<100?1:0)+' km');
  if(r.precip>0)parts.push(radarNode('span','st-rain',t('st.precip_short',{v:fmtNum(r.precip,1)})));
  if(r.net==='lvc'){
    if(r.surfaceTemp!=null)parts.push(t('st.road_short',{v:fmtTemp(r.surfaceTemp,1)}));
    if(r.cond){const c=radarNode('span',ROAD_COND_TONE[r.cond]==='bad'?'st-ice':null,roadCondLabel(r.cond));parts.push(c);}
  }else if(r.windSpeed!=null)parts.push(t('st.wind_short',{v:fmtNum(r.windSpeed,1)}));
  if(stationIsStale(r)){const s=radarNode('span','st-stale',Number.isFinite(r.time)?fmtAge(r.time):t('st.no_time'));s.title=t('st.stale_title');parts.push(s);}
  parts.forEach((p,i)=>{if(i)meta.append(' · ');meta.append(p);});
  main.append(a,meta);
  li.append(main,stationTempCell(r));
  return li;
}

function initStationTable(){
  renderStationHead();
  const search=$('stSearch');
  let typing=null;
  search?.addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(()=>{ST.query=search.value;renderStationTable();},120);});
  document.querySelectorAll('#stNetFilter [data-net]').forEach(b=>b.addEventListener('click',()=>showNetworks(b.dataset.net)));
  $('stInView')?.addEventListener('change',e=>{ST.inView=e.target.checked;renderStationTable();});
  $('stMore')?.addEventListener('click',()=>{ST.showAll=!ST.showAll;renderStationTable();});
  // Row click selects the station on the map; the name stays a normal link
  const pick=e=>{
    if(e.target.closest('a'))return;
    const row=e.target.closest('[data-key]');
    if(row)selectStation(row.dataset.key);
  };
  const keys=e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-key]')){e.preventDefault();selectStation(e.target.dataset.key);}
  };
  for(const el of [$('stBody'),$('stList')]){el?.addEventListener('click',pick);el?.addEventListener('keydown',keys);}
  renderStationTable();
  // The chosen place changes through the header search: refresh distances, and the map
  // view when the radar is on screen. #cityName is updated whenever a place is selected.
  const city=$('cityName');
  if(city&&typeof MutationObserver==='function'){
    new MutationObserver(()=>setTimeout(()=>{
      if(_rMap&&radarPanelVisible())syncPlace();
      if(allStationRows().length&&ST.renderedKey!==stationRenderKey())renderStations();
    },0)).observe(city,{childList:true,characterData:true,subtree:true});
  }
}

// ─── LANGUAGE ───────────────────────────────────────────────────────────────
// Single entry point to re-translate the radar and station UI (called by relangUI)
function relabelRadarControl(){
  try{
    labelRadarBar();
    if(_rMap){
      const zin=_rMap.getContainer().querySelector('.leaflet-control-zoom-in'),zout=_rMap.getContainer().querySelector('.leaflet-control-zoom-out');
      if(zin){zin.title=t('rad.zoom_in');zin.setAttribute('aria-label',t('rad.zoom_in'));}
      if(zout){zout.title=t('rad.zoom_out');zout.setAttribute('aria-label',t('rad.zoom_out'));}
      relabelMapFullscreen();
      relabelRadarSettings();
      relabelRadarLegend();
      if(R.attr)_rMap.attributionControl.removeAttribution(R.attr);
      R.attr=t('radar.attr');_rMap.attributionControl.addAttribution(R.attr);
      R.timeline?.relabel();
      updateRadarStatus();
      if(ST.renderedKey!==stationRenderKey())renderStations();
    }
    renderStationHead();
    renderStationTable();
  }catch(e){console.warn('[radar] relabel',e);}
}

// Runs after every script has loaded (map-utils.js comes later in the page), with or without defer
if(typeof document!=='undefined'&&document.getElementById('stationTable')){
  if(document.readyState==='complete')initStationTable();
  else document.addEventListener('DOMContentLoaded',initStationTable,{once:true});
}
