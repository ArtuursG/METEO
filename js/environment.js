let environmentKind='air',environmentRequest=0,environmentMap=null,environmentRenderedKey=null;
let environmentStorage;try{environmentStorage=localStorage;}catch{}
const environmentalData=createDataCache({storage:environmentStorage});
const envNode=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
function environmentLabels(){
 $('tb-environment').textContent=t('nav.env');
 $('environmentNav')?.setAttribute('aria-label',t('env.nav_aria'));
 document.querySelectorAll('[data-env]').forEach(b=>{b.textContent=t('env.k_'+b.dataset.env);b.setAttribute('aria-pressed',String(b.dataset.env===environmentKind));});
}
function environmentFreshness(data,maxAge){
 const age=Date.now()-Date.parse(data.fetchedAt);
 const p=envNode('p',t('env.downloaded',{time:new Date(data.fetchedAt).toLocaleString(LOCALE)}),'env-note env-freshness');
 if(!Number.isFinite(age)||age>maxAge){p.classList.add('env-warning');p.append(document.createTextNode(' '+t('env.outdated')));}
 return p;
}
function envSource(text,url){const p=envNode('p',null,'env-note');const a=envNode('a',text);a.href=url;a.target='_blank';a.rel='noopener';p.append(a);return p;}
function envMetric(label,value,unit){const card=envNode('div',null,'env-metric');card.append(envNode('span',label),envNode('strong',value==null?'-':Number(value).toLocaleString(LOCALE,{maximumFractionDigits:1})),envNode('small',unit));return card;}
function envChart(id,labels,datasets,unit=''){
 if(S.charts.environment)S.charts.environment.destroy();
 const canvas=envNode('canvas');canvas.id=id;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',unit);
 const wrap=envNode('div',null,'env-chart');wrap.append(canvas);$('environmentContent').append(wrap);
 const cd=CD();
 canvas.setAttribute('aria-label',datasets.map(d=>d.label).join(', ')+' · '+unit);
 S.charts.environment=new Chart(canvas,{type:'line',data:{labels:labels.map(t=>chartTimeLabel(t,LOCALE)),datasets:datasets.map(d=>({tension:.2,pointHoverRadius:5,pointHitRadius:16,spanGaps:false,...d}))},options:{...cd,layout:{padding:8},scales:{...cd.scales,x:{...cd.scales.x,grid:{display:false},ticks:{...cd.scales.x.ticks,maxTicksLimit:window.innerWidth<600?4:8}},y:{...cd.scales.y,title:{display:!!unit,text:unit,color:cssVar('--t2')}}},plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{title:items=>items.length?chartTimeTitle(labels[items[0].dataIndex],LOCALE):''}},legend:{display:true,labels:{color:cssVar('--t2'),usePointStyle:true,pointStyle:'line',boxWidth:24,padding:16}}}}});
}
async function initEnvironment(){
 environmentLabels();const id=++environmentRequest,kind=environmentKind,lat=S.lat,lon=S.lon;
 const renderKey=[kind,kind==='marine'?marineParameter:'',lat.toFixed(2),lon.toFixed(2),LANG,document.documentElement.getAttribute('data-theme')].join('_');
 if(environmentRenderedKey?.key===renderKey&&Date.now()-environmentRenderedKey.time<300000){environmentMap?.invalidateSize();return;}
 environmentRenderedKey=null;
 if(environmentMap){environmentMap.remove();environmentMap=null;}
 if(S.charts.environment){S.charts.environment.destroy();delete S.charts.environment;}
 const content=$('environmentContent');content.replaceChildren(envNode('p',t('env.loading'),'env-note'));
 try{
  let data;
  if(kind==='air'){
   const x=lat.toFixed(2),y=lon.toFixed(2);
   const p=new URLSearchParams({latitude:x,longitude:y,hourly:'european_aqi,pm2_5,pm10,ozone,birch_pollen,alder_pollen,grass_pollen,mugwort_pollen',forecast_days:4,timeformat:'unixtime',timezone:'UTC'});
   data=await environmentalData('air_'+x+'_'+y,'https://air-quality-api.open-meteo.com/v1/air-quality?'+p,3600000);
  }else if(kind==='marine'){
   try{data=await environmentalData('marine-'+marineParameter,'data/marine-'+marineParameter+'.json',3600000);}catch{data=null;}
  }else data=await environmentalData(kind==='warnings'?'warnings-v2':kind,'data/'+kind+'.json',kind==='hydro'?1800000:600000);
  if(id!==environmentRequest||lat!==S.lat||lon!==S.lon||kind!==environmentKind)return;
  content.replaceChildren();
  if(kind==='air')renderAir(data);
  if(kind==='marine')renderMarine(data);
  if(kind==='warnings')renderWarnings(data);
  if(kind==='hydro')renderHydro(data,lat,lon);
  if(kind==='aurora')renderAurora(data);
  environmentRenderedKey={key:renderKey,time:Date.now()};
 }catch{
  if(id!==environmentRequest)return;
  content.replaceChildren(envNode('p',t('env.unavailable'),'env-warning'));
  const retry=envNode('button',t('env.retry'),'mt');retry.onclick=initEnvironment;content.append(retry);
 }
}
function renderAir(data){
 const c=$('environmentContent'),h=data.hourly;if(!h?.time?.length)throw new Error('No data');
 const now=Math.floor(Date.now()/3600000)*3600;let start=h.time.findIndex(t=>t>=now);if(start<0)throw new Error('Expired forecast');
  c.append(envNode('h2',t('env.air_title')),
 envNode('p',S.city,'env-location'),
 envNode('p',t('env.air_model'),'env-note'));
 const grid=envNode('div',null,'env-grid');
 for(const [key,label,unit] of [['european_aqi',t('env.aqi'),'AQI'],['pm2_5','PM₂.₅','µg/m³'],['pm10','PM₁₀','µg/m³'],['ozone',t('env.ozone'),'µg/m³']])grid.append(envMetric(label,h[key]?.[start],unit));c.append(grid);
 c.append(envNode('p',t('env.forecast_hour',{time:new Date(h.time[start]*1000).toLocaleString(LOCALE)}),'env-note'));
 const pollen=envNode('div',null,'env-grid');for(const key of ['birch','alder','grass','mugwort'])pollen.append(envMetric(t('env.pollen_'+key),h[key+'_pollen']?.[start],t('env.grains')));c.append(pollen);
 c.append(envNode('p',t('env.pollen_note'),'env-note'));
 envChart('airChart',h.time.slice(start).map(t=>new Date(t*1000).toISOString()),[{label:'European AQI',data:h.european_aqi.slice(start),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2}],'European AQI');
 c.append(envSource('Open-Meteo / CAMS · CC BY 4.0','https://open-meteo.com/en/docs/air-quality-api'));
}
function renderWarnings(data){
 const c=$('environmentContent');c.append(envNode('h2',t('env.warn_title')),environmentFreshness(data,45*60000));
 c.append(envNode('p',t('env.warn_note'),'env-note'));
 const alerts=data.alerts.filter(a=>Date.parse(a.expires)>Date.now());
 if(!alerts.length)c.append(envNode('p',t('env.warn_none')));
 for(const a of alerts){const card=envNode('article',null,'env-alert');card.dataset.severity=a.severity;card.append(envNode('h3',a.event),envNode('p',a.areaDesc),envNode('p',new Date(a.onset).toLocaleString(LOCALE)+' – '+new Date(a.expires).toLocaleString(LOCALE),'env-note'));c.append(card);}
 c.append(envSource('MeteoAlarm / EUMETNET · CC BY 4.0 · '+t('env.warn_official'),'https://meteoalarm.org/en/live/'));
}
const themedMapLayers=new Set();
function themedMapUrl(part){return 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_'+(document.documentElement.getAttribute('data-theme')==='dark'?'Dark':'Light')+'_Gray_'+part+'/MapServer/tile/{z}/{y}/{x}';}
function addThemedMapLayer(map,part,options={}){
 const layer=L.tileLayer(themedMapUrl(part),{attribution:'Tiles © Esri',maxZoom:16,...options}).addTo(map);
 const entry={layer,part};themedMapLayers.add(entry);map.on('unload',()=>themedMapLayers.delete(entry));return layer;
}
function environmentBaseMap(map){addThemedMapLayer(map,'Base');addThemedMapLayer(map,'Reference');}
new MutationObserver(()=>{
 themedMapLayers.forEach(({layer,part})=>layer.setUrl(themedMapUrl(part)));
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function hydroIcon(selected=false){return L.divIcon({className:'hydro-pin'+(selected?' is-selected':''),iconSize:[36,40],iconAnchor:[18,36],tooltipAnchor:[0,-30],html:'<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 2C12 10 5 17 5 24a13 13 0 0026 0C31 17 24 10 18 2Z" fill="currentColor" stroke="white" stroke-width="2"/><path d="M10 24q4-4 8 0t8 0M12 29q3-3 6 0t6 0" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>'});}
function renderHydro(data,lat,lon){
 const c=$('environmentContent');c.append(envNode('h2',t('env.hydro_title')),environmentFreshness(data,2*3600000));
 c.append(envNode('p',t('env.hydro_note'),'env-note'));
 const stations=[...data.stations].sort((a,b)=>haversineKm(lat,lon,a.lat,a.lon)-haversineKm(lat,lon,b.lat,b.lon));
 const pick=envNode('select');pick.setAttribute('aria-label',t('env.hydro_station'));for(const st of stations){const o=envNode('option',st.name+' · '+Math.round(haversineKm(lat,lon,st.lat,st.lon))+' km');o.value=st.id;pick.append(o);}c.append(pick);
 const shell=envNode('div',null,'map-stage'),map=envNode('div');map.id='environmentMap';shell.append(map);c.append(shell);environmentMap=L.map(map,{scrollWheelZoom:false}).setView([lat,lon],7);environmentBaseMap(environmentMap);addMapFullscreen(environmentMap,shell);
 const detail=envNode('div',null,'hydro-detail');c.append(detail);const markers=new Map();
 const show=()=>{
  const st=stations.find(s=>s.id===pick.value);detail.replaceChildren();if(!st)return;
  markers.forEach((marker,id)=>{marker.setIcon(hydroIcon(id===st.id));marker.setZIndexOffset(id===st.id?1000:0);});detail.append(envNode('h3',st.name));
  const parameter=envNode('select');parameter.setAttribute('aria-label',t('env.hydro_measure'));for(const k of Object.keys(st.series)){const o=envNode('option',data.parameters[k][LANG]||k);o.value=k;parameter.append(o);}detail.append(parameter);
  const latest=envNode('p',null,'hydro-latest');detail.append(latest);
  const draw=()=>{const k=parameter.value,series=st.series[k],last=series.at(-1);latest.textContent=last[0].replace('T',' ')+' · '+last[1]+' '+data.parameters[k].unit;
   document.getElementById('hydroChart')?.parentElement.remove();envChart('hydroChart',series.map(p=>p[0]),[{label:st.name+' · '+data.parameters[k].unit,data:series.map(p=>p[1]),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2}],data.parameters[k].unit);
  };parameter.onchange=draw;draw();environmentMap.panTo([st.lat,st.lon]);
 };
 stations.forEach(st=>{const label=envNode('span',st.name);const marker=L.marker([st.lat,st.lon],{icon:hydroIcon(),title:st.name,alt:st.name}).bindTooltip(label,{className:'hydro-tooltip'}).on('click',()=>{pick.value=st.id;show();}).addTo(environmentMap);markers.set(st.id,marker);});pick.onchange=show;show();
 c.append(envSource('LVĢMC / data.gov.lv · CC0','https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi'));
}
function renderAurora(data){
 const c=$('environmentContent'),last=data.readings.at(-1);c.append(envNode('h2',t('env.aurora_title')),environmentFreshness(data,60*60000));
 const grid=envNode('div',null,'env-grid');grid.append(envMetric(t('env.kp'),last.kp,'0–9'));c.append(grid);
 c.append(envNode('p',t('env.kp_time',{time:new Date(last.time).toLocaleString(LOCALE)}),'env-note'));
 c.append(envNode('p',t('env.kp_note'),'env-note'));
 envChart('auroraChart',data.readings.map(r=>r.time),[{label:'Kp',data:data.readings.map(r=>r.kp),borderColor:cssVar('--acc'),pointRadius:2,borderWidth:2}],'Kp');
 c.append(envSource('NOAA SWPC','https://www.swpc.noaa.gov/products/aurora-30-minute-forecast'));
}
document.querySelectorAll('[data-env]').forEach(b=>b.onclick=()=>{environmentKind=b.dataset.env;initEnvironment();});
environmentLabels();
