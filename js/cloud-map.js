// ─── CLOUD MAP (Mākoņi tab): satellite (past) + model forecast (future) ───────
// One combined timeline, same idea as the RainViewer radar (past observations +
// short-range nowcast): the past portion is real EUMETSAT satellite imagery,
// the future portion is the DWD ICON model grid already compared elsewhere on
// the site (via @openmeteo/weather-map-layer). Off by default - no API keys,
// no background preloading: everything only loads after "Show cloud map".
const CLOUD_OM_LIB_URL='https://cdn.jsdelivr.net/npm/@openmeteo/weather-map-layer@0.1.0/dist/index.js';
const CLOUD_OM_LIB_SRI='sha512-u+hvuEI1AnNAjhc/gSY6An2l87uDMkk2NiUxeHr7ARj3dEoxHGNqB5Za4m4hshlinJVk8PQKGIwXQXTtbY2hGg==';
const CLOUD_OM_META_URL='https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon/latest.json';

// EUMETSAT EUMETView WMS - free, no key. msg_fes:vis006 is the raw visible-light
// channel (0.6 μm), updated every 15 min; the server snaps to the nearest actual
// scene (nearestValue=1) so exact timestamps don't need to be guessed precisely.
// Daylight only - frames are dark/blank at night (no infrared fallback yet).
const SAT_WMS_URL='https://view.eumetsat.int/geoserver/wms';
const SAT_LAYER='msg_fes:vis006';
const SAT_STEP_MIN=15;
const SAT_PAST_COUNT=8; // ~2 h of observed history

let _cloudOpen=false, _cloudLoading=false, _cloudMap=null, _cloudAdapter=null;
let _cloudFrames=[], _cloudIdx=0, _cloudTimer=null, _cloudTileLayer=null, _cloudPlace='';

function loadScriptOnce(src,integrity){
  if(document.querySelector(`script[src="${src}"]`))return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src; s.crossOrigin='anonymous'; if(integrity)s.integrity=integrity;
    s.onload=resolve; s.onerror=()=>reject(new Error('script load failed: '+src));
    document.head.appendChild(s);
  });
}

// Past-observed satellite timestamps: floor "now" to the 15-min grid, skip the
// most recent step (rarely processed yet) as a safety margin, then step back.
function buildSatFrames(){
  const stepMs=SAT_STEP_MIN*60000;
  const latest=Math.floor(Date.now()/stepMs)*stepMs-stepMs;
  const out=[];
  for(let i=SAT_PAST_COUNT-1;i>=0;i--)out.push({time:new Date(latest-i*stepMs).toISOString(),kind:'sat'});
  return out;
}

function stopCloudPlayback(){
  if(_cloudTimer){clearInterval(_cloudTimer);_cloudTimer=null;}
  const btn=$('cloudPlayBtn'); if(!btn)return;
  btn.textContent='▶';
  btn.setAttribute('aria-label',uiText('Atskaņot mākoņu kustību','Play cloud animation'));
  btn.setAttribute('aria-pressed','false');
}

function cloudTogglePlay(){
  if(_cloudTimer){stopCloudPlayback();return;}
  if(_cloudFrames.length<2)return;
  const btn=$('cloudPlayBtn');
  btn.textContent='⏸';
  btn.setAttribute('aria-label',uiText('Apturēt','Pause'));
  btn.setAttribute('aria-pressed','true');
  _cloudTimer=setInterval(()=>showCloudFrame((_cloudIdx+1)%_cloudFrames.length),700);
}

function fmtCloudFrameTime(iso){
  return new Date(iso).toLocaleString(LOCALE,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function showCloudFrame(idx){
  if(!_cloudMap||!_cloudFrames.length)return;
  _cloudIdx=Math.max(0,Math.min(_cloudFrames.length-1,idx));
  const frame=_cloudFrames[_cloudIdx];

  const layer=frame.kind==='sat'
    ?L.tileLayer.wms(SAT_WMS_URL,{
        layers:SAT_LAYER,format:'image/png',version:'1.1.1',transparent:true,
        crs:L.CRS.EPSG4326,time:frame.time,
        attribution:'Satelīts: <a href="https://www.eumetsat.int" target="_blank">EUMETSAT</a>'
      })
    :_cloudAdapter.createTileLayer('om://'+CLOUD_OM_META_URL+`?time_step=valid_times_${frame.modelIdx}&variable=cloud_cover`,{
        opacity:0.6,
        attribution:'Mākoņi: <a href="https://open-meteo.com" target="_blank">Open-Meteo</a> / DWD ICON'
      });
  layer.addTo(_cloudMap);
  const prev=_cloudTileLayer;
  _cloudTileLayer=layer;
  if(prev)_cloudMap.removeLayer(prev); // swap after the new layer starts loading, avoids a blank flash

  const slider=$('cloudSlider');
  slider.max=_cloudFrames.length-1;
  slider.value=_cloudIdx;
  const label=frame.kind==='sat'?uiText('Novērots','Observed'):uiText('Prognoze','Forecast');
  const text=`${label} · ${fmtCloudFrameTime(frame.time)}`;
  slider.setAttribute('aria-valuetext',text);
  $('cloudTime').textContent=text;
}

async function ensureCloudMap(){
  if(_cloudLoading)return;
  if(_cloudMap&&_cloudFrames.length){ _cloudMap.invalidateSize(); return; } // already built - just show it
  _cloudLoading=true;
  const status=$('cloudMapStatus');
  status.textContent=uiText('Ielādē mākoņu karti...','Loading cloud map...');
  try{
    const [meta]=await Promise.all([
      fetch(CLOUD_OM_META_URL).then(r=>{ if(!r.ok)throw new Error('meta '+r.status); return r.json(); }),
      window.OMWeatherMapLayer?Promise.resolve():loadScriptOnce(CLOUD_OM_LIB_URL,CLOUD_OM_LIB_SRI),
    ]);
    const validTimes=meta.valid_times||[];
    if(!validTimes.length)throw new Error('no valid_times in metadata');

    const satFrames=buildSatFrames();
    const modelFrames=validTimes.map((time,modelIdx)=>({time,kind:'model',modelIdx}));
    _cloudFrames=[...satFrames,...modelFrames];
    const nowIdx=satFrames.length-1; // latest observed frame, same convention as the radar timeline

    if(!_cloudMap){
      _cloudMap=L.map('cloudMap',{maxZoom:12}).setView([S.lat,S.lon],6);
      // Esri Gray Canvas - no API key required (CARTO's basemaps.cartocdn.com now
      // needs one; see the official weather-map-layer example, which still uses it)
      const esriAttr='Tiles © <a href="https://www.esri.com" target="_blank">Esri</a>';
      const esri=svc=>L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,{attribution:esriAttr,maxZoom:16});
      esri('Canvas/World_Light_Gray_Base').addTo(_cloudMap);
      esri('Canvas/World_Light_Gray_Reference').addTo(_cloudMap);
      _cloudPlace=S.lat.toFixed(2)+','+S.lon.toFixed(2);
    }else{
      _cloudMap.invalidateSize();
    }
    if(!_cloudAdapter){
      _cloudAdapter=OMWeatherMapLayer.addLeafletProtocolSupport(L);
      _cloudAdapter.addProtocol('om',OMWeatherMapLayer.omProtocol);
      const updateBounds=()=>{
        const b=_cloudMap.getBounds();
        OMWeatherMapLayer.updateCurrentBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);
      };
      _cloudMap.on('moveend',updateBounds);
      updateBounds();
    }
    const endsEl=$('cloudTimelineEnds');
    endsEl.textContent=`${fmtCloudFrameTime(_cloudFrames[0].time)} – ${fmtCloudFrameTime(_cloudFrames.at(-1).time)} `
      +`(${satFrames.length} ${uiText('novēroti','observed')}, ${modelFrames.length} ${uiText('prognoze','forecast')})`;
    status.textContent='';
    showCloudFrame(nowIdx);
  }catch(e){
    console.warn('[cloud map]',e);
    status.textContent=uiText('Neizdevās ielādēt mākoņu karti.','Could not load the cloud map.');
  }finally{
    _cloudLoading=false;
  }
}

function openCloudMap(){
  _cloudOpen=true;
  $('cloudMapEmbed').hidden=false;
  refreshCloudMap();
  ensureCloudMap();
}

function closeCloudMap(){
  _cloudOpen=false;
  stopCloudPlayback();
  $('cloudMapEmbed').hidden=true;
  refreshCloudMap();
}

// Re-centres the already-built map when the selected location changes; called from
// switchTab/relangUI so it also runs on language switch and on returning to the tab.
function refreshCloudMap(){
  const card=$('cloudMapCard'); if(!card)return;
  $('cloudMapTitle').textContent=uiText('Mākoņu karte','Cloud map');
  $('cloudMapInfo').textContent=uiText(
    'Pagātnes kadri - īsts EUMETSAT satelīta attēls (redzamās gaismas kanāls, tāpēc naktī tie ir tumši). Nākotnes kadri - DWD ICON modeļa prognoze, tas pats modelis, ko izmanto pārējā lapā.',
    'Past frames are real EUMETSAT satellite imagery (visible-light channel, so they are dark at night). Future frames are the DWD ICON model forecast, the same model used elsewhere on this site.'
  );
  const btn=$('cloudMapToggle');
  btn.textContent=_cloudOpen?uiText('Paslēpt karti','Hide map'):uiText('Rādīt mākoņu karti','Show cloud map');
  btn.setAttribute('aria-expanded',String(_cloudOpen));
  $('cloudMapHint').textContent=_cloudOpen
    ?uiText('Laiku maini ar slīdni vai atskaņošanas pogu zem kartes.','Move through time with the slider or play button below the map.')
    :uiText('Karte un ~2.9 MB renderēšanas bibliotēka ielādējas tikai pēc nospiešanas.','The map and its ~2.9 MB rendering library load only after you press this.');

  const key=S.lat.toFixed(2)+','+S.lon.toFixed(2);
  if(_cloudMap&&key!==_cloudPlace){
    _cloudPlace=key;
    _cloudMap.setView([S.lat,S.lon],_cloudMap.getZoom());
  }
}

if(typeof document!=='undefined'){
  $('cloudMapToggle').onclick=()=>_cloudOpen?closeCloudMap():openCloudMap();
  $('cloudSlider').addEventListener('input',e=>{stopCloudPlayback();showCloudFrame(parseInt(e.target.value,10));});
  $('cloudPlayBtn').onclick=cloudTogglePlay;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCloudPlayback();});
  refreshCloudMap();
}

if(typeof module!=='undefined')module.exports={buildSatFrames};
