// Separate observed infrared imagery from model forecasts; load each source on demand.
const CLOUD_OM_LIB_URL='https://cdn.jsdelivr.net/npm/@openmeteo/weather-map-layer@0.1.0/dist/index.js';
const CLOUD_OM_LIB_SRI='sha512-u+hvuEI1AnNAjhc/gSY6An2l87uDMkk2NiUxeHr7ARj3dEoxHGNqB5Za4m4hshlinJVk8PQKGIwXQXTtbY2hGg==';
const CLOUD_OM_META_URL='https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon/latest.json';


const SAT_WMS_URL='https://view.eumetsat.int/geoserver/wms';
const SAT_LAYER='msg_fes:ir108',SAT_STEP_MIN=15,SAT_PAST_COUNT=8;
let _cloudOpen=false,_cloudMap=null,_cloudAdapter=null,_cloudFrames=[],_cloudIdx=0,_cloudTimer=null,_cloudTileLayer=null,_cloudPlace='',_cloudMode='sat',_cloudRequest=0;
const cloudCache={},cloudScripts=new Map();
function loadScriptOnce(src,integrity){
 if(window.OMWeatherMapLayer)return Promise.resolve();
 if(cloudScripts.has(src))return cloudScripts.get(src);
 const work=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.integrity=integrity;s.onload=resolve;s.onerror=()=>{s.remove();cloudScripts.delete(src);reject(new Error('Map library unavailable'));};document.head.append(s);});
 cloudScripts.set(src,work);return work;
}
function buildSatFrames(latest=Math.floor(Date.now()/900000)*900000-900000){
 return Array.from({length:SAT_PAST_COUNT},(_,i)=>({time:new Date(Number(latest)-(SAT_PAST_COUNT-1-i)*900000).toISOString(),kind:'sat'}));
}
function stopCloudPlayback(){
 if(_cloudTimer)clearInterval(_cloudTimer);_cloudTimer=null;
 const b=$('cloudPlayBtn');if(b){b.textContent='▶';b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',uiText('Atskaņot mākoņu kustību','Play cloud animation'));}
}
function cloudTogglePlay(){
 if(_cloudTimer){stopCloudPlayback();return;}if(_cloudFrames.length<2)return;
 $('cloudPlayBtn').textContent='Ⅱ';$('cloudPlayBtn').setAttribute('aria-pressed','true');$('cloudPlayBtn').setAttribute('aria-label',uiText('Apturēt','Pause'));
 _cloudTimer=setInterval(()=>{if(_cloudIdx===_cloudFrames.length-1){stopCloudPlayback();return;}showCloudFrame(_cloudIdx+1);},1200);
 if(_cloudIdx===_cloudFrames.length-1)showCloudFrame(0);
}
function fmtCloudFrameTime(iso){return new Date(iso).toLocaleString(LOCALE,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function showCloudFrame(index){
 if(!_cloudMap||!_cloudFrames.length)return;
 _cloudIdx=Math.max(0,Math.min(_cloudFrames.length-1,index));const frame=_cloudFrames[_cloudIdx];
 if(_cloudTileLayer)_cloudMap.removeLayer(_cloudTileLayer);
 _cloudTileLayer=frame.kind==='sat'?L.tileLayer.wms(SAT_WMS_URL,{layers:SAT_LAYER,format:'image/png',version:'1.1.1',transparent:true,crs:L.CRS.EPSG4326,time:frame.time,opacity:.72,attribution:'© EUMETSAT · IR 10.8 μm'}):_cloudAdapter.createTileLayer('om://'+CLOUD_OM_META_URL+'?time_step=valid_times_'+frame.modelIdx+'&variable=cloud_cover',{opacity:.65,attribution:'Open-Meteo / DWD ICON'});
 _cloudTileLayer.addTo(_cloudMap);
 const slider=$('cloudSlider');slider.max=_cloudFrames.length-1;slider.value=_cloudIdx;slider.disabled=false;
 slider.style.setProperty('--progress',100*_cloudIdx/Math.max(1,_cloudFrames.length-1)+'%');
 const label=frame.kind==='sat'?uiText('Novērojums · IR','Observed · IR'):uiText('Prognoze · ICON','Forecast · ICON');
 $('cloudTime').textContent=label+' · '+fmtCloudFrameTime(frame.time);slider.setAttribute('aria-valuetext',$('cloudTime').textContent);
 $('cloudPrev').disabled=_cloudIdx===0;$('cloudNext').disabled=_cloudIdx===_cloudFrames.length-1;
 $('cloudPlayBtn').disabled=_cloudFrames.length<2;
}
async function cloudFrames(mode){
 const cached=cloudCache[mode];if(cached&&Date.now()-cached.saved<900000)return cached.frames;
 let frames;
 if(mode==='sat'){
  const response=await fetch(SAT_WMS_URL+'?service=WMS&request=GetCapabilities',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Satellite metadata unavailable');
  const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
  const name=[...xml.getElementsByTagNameNS('*','Name')].find(n=>n.textContent===SAT_LAYER);
  const dimension=name&&[...name.parentElement.getElementsByTagNameNS('*','Dimension')].find(n=>n.getAttribute('name')==='time');
  const latest=Date.parse(dimension?.getAttribute('default'));if(!Number.isFinite(latest)||latest>Date.now()+900000)throw new Error('No satellite timestamp');
  frames=buildSatFrames(latest);
 }else{
  const [meta]=await Promise.all([fetch(CLOUD_OM_META_URL,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw new Error('Forecast metadata unavailable');return r.json();}),loadScriptOnce(CLOUD_OM_LIB_URL,CLOUD_OM_LIB_SRI)]);
  frames=(meta.valid_times||[]).map((time,modelIdx)=>({time:typeof time==='number'?new Date(time*1000).toISOString():time,kind:'model',modelIdx})).filter(f=>Date.parse(f.time)>=Date.now()&&Date.parse(f.time)<=Date.now()+7*86400000);
 }
 if(!frames.length)throw new Error('No frames');cloudCache[mode]={saved:Date.now(),frames};return frames;
}
async function ensureCloudMap(){
 const id=++_cloudRequest,mode=_cloudMode;stopCloudPlayback();_cloudFrames=[];
 if(_cloudTileLayer&&_cloudMap){_cloudMap.removeLayer(_cloudTileLayer);_cloudTileLayer=null;}
 $('cloudSlider').disabled=true;$('cloudPlayBtn').disabled=true;$('cloudPrev').disabled=true;$('cloudNext').disabled=true;
 $('cloudMapStatus').textContent=uiText('Ielādē izvēlēto slāni...','Loading selected layer...');$('cloudTime').textContent='-';$('cloudTimelineEnds').textContent='';
 try{
  const frames=await cloudFrames(mode);if(id!==_cloudRequest||!_cloudOpen)return;
  if(!_cloudMap){
   _cloudMap=L.map('cloudMap',{maxZoom:10,scrollWheelZoom:false}).setView([S.lat,S.lon],6);
   addMapFullscreen(_cloudMap,$('cloudMapEmbed'));
   addThemedMapLayer(_cloudMap,'Base');
   const pane=_cloudMap.createPane('cloudLabels');pane.style.zIndex=450;pane.style.pointerEvents='none';
   addThemedMapLayer(_cloudMap,'Reference',{pane:'cloudLabels'});
   _cloudPlace=S.lat.toFixed(2)+','+S.lon.toFixed(2);
  }
  _cloudMap.invalidateSize();
  if(mode==='model'&&!_cloudAdapter){_cloudAdapter=OMWeatherMapLayer.addLeafletProtocolSupport(L);_cloudAdapter.addProtocol('om',OMWeatherMapLayer.omProtocol);const bounds=()=>{const b=_cloudMap.getBounds();OMWeatherMapLayer.updateCurrentBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);};_cloudMap.on('moveend',bounds);bounds();}
  _cloudFrames=frames;const ticks=$('cloudTimelineEnds');ticks.replaceChildren();for(const i of timelineTickIndexes(frames.length)){const span=document.createElement('span');span.textContent=fmtCloudFrameTime(frames[i].time);ticks.append(span);}
  $('cloudMapStatus').textContent=mode==='sat'&&Date.now()-Date.parse(frames.at(-1).time)>3600000?uiText('Jaunākais avota attēls ir vecāks par stundu.','The latest source image is over an hour old.'):'';
  showCloudFrame(mode==='sat'?frames.length-1:0);
 }catch(e){if(id===_cloudRequest)$('cloudMapStatus').textContent=uiText('Šis slānis pašlaik nav pieejams. Izmēģini otru skatu vai mēģini vēlāk.','This layer is unavailable. Try the other view or try again later.');}
}
function openCloudMap(){_cloudOpen=true;$('cloudMapEmbed').hidden=false;refreshCloudMap();ensureCloudMap();}
function closeCloudMap(){_cloudOpen=false;++_cloudRequest;stopCloudPlayback();$('cloudMapEmbed').hidden=true;refreshCloudMap();}
function refreshCloudMap(){
 if(!$('cloudMapCard'))return;
 $('cloudMapTitle').textContent=uiText('Mākoņi virs reģiona','Clouds over the region');
 $('cloudMapInfo').textContent=uiText('Novērojumi rāda satelīta attēlu, prognoze - gaidāmo mākoņu segu. Izvēlies, kuru vēlies apskatīt.','Observations show satellite imagery; the forecast shows expected cloud cover. Choose a view.');
 $('cloudObserved').textContent=uiText('Tagad · satelīts','Now · satellite');$('cloudForecast').textContent=uiText('Tālāk · prognoze','Next · forecast');
 $('cloudObserved').setAttribute('aria-pressed',String(_cloudMode==='sat'));$('cloudForecast').setAttribute('aria-pressed',String(_cloudMode==='model'));
 $('cloudMapToggle').textContent=_cloudOpen?uiText('Paslēpt karti','Hide map'):uiText('Atvērt mākoņu karti','Open cloud map');$('cloudMapToggle').setAttribute('aria-expanded',String(_cloudOpen));
 $('cloudMapHint').textContent=_cloudMode==='sat'?uiText('Infrasarkanais kanāls darbojas arī naktī. Gaišie apgabali izceļ aukstākās mākoņu virsotnes; tas nav mākoņu daudzums procentos.','Infrared works at night too. Light areas highlight colder cloud tops; this is not cloud-cover percentage.'):uiText('DWD ICON mākoņu segas prognoze līdz 7 dienām. Pieejamais periods atkarīgs no avota.','DWD ICON cloud-cover forecast up to 7 days. Available duration depends on the source.');
 $('cloudSlider').setAttribute('aria-label',uiText('Mākoņu kartes laiks','Cloud map time'));$('cloudPrev').setAttribute('aria-label',uiText('Iepriekšējais kadrs','Previous frame'));$('cloudNext').setAttribute('aria-label',uiText('Nākamais kadrs','Next frame'));
 $('cloudTimelineTitle').textContent=uiText('Laika skala','Timeline');
 const key=S.lat.toFixed(2)+','+S.lon.toFixed(2);if(_cloudMap&&key!==_cloudPlace){_cloudPlace=key;_cloudMap.setView([S.lat,S.lon],_cloudMap.getZoom());}
}
if(typeof document!=='undefined'){
 $('cloudMapToggle').onclick=()=>_cloudOpen?closeCloudMap():openCloudMap();
 for(const [id,mode] of [['cloudObserved','sat'],['cloudForecast','model']])$(id).onclick=()=>{_cloudMode=mode;refreshCloudMap();if(_cloudOpen)ensureCloudMap();else openCloudMap();};
 let scrub; $('cloudSlider').oninput=e=>{stopCloudPlayback();clearTimeout(scrub);const index=Number(e.target.value);scrub=setTimeout(()=>{if(_cloudOpen)showCloudFrame(index);},100);};
 $('cloudPrev').onclick=()=>{stopCloudPlayback();showCloudFrame(_cloudIdx-1);};$('cloudNext').onclick=()=>{stopCloudPlayback();showCloudFrame(_cloudIdx+1);};$('cloudPlayBtn').onclick=cloudTogglePlay;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCloudPlayback();});refreshCloudMap();
}
if(typeof module!=='undefined')module.exports={buildSatFrames};
