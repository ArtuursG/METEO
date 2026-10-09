let environmentKind='air',environmentRequest=0,environmentMap=null,environmentRenderedKey=null;
let environmentStorage;try{environmentStorage=localStorage;}catch{}
const environmentalData=createDataCache({storage:environmentStorage});
// Warnings, hydro, Kp and marine snapshots, refreshed by the LVC worker's cron (radar.js LVC_API)
const publicDataUrl=name=>LVC_API+'?data='+encodeURIComponent(name);
const publicData=(key,name,ttl)=>environmentalData(key,publicDataUrl(name),ttl);
// Warnings come with the live answer the page already loads (radar.js ensureHome), so they
// cost no request of their own; their own snapshot is the fallback
async function liveWarnings(){
 if(typeof ensureHome==='function'){
  try{const d=await ensureHome();if(d?.warnings?.ok&&Array.isArray(d.warnings.alerts))return d.warnings;}catch{}
 }
 return publicData('warnings-v2','warnings',600000);
}
const envNode=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
function environmentLabels(){
 $('tb-environment').textContent=t('nav.env');
 $('environmentNav')?.setAttribute('aria-label',t('env.nav_aria'));
 document.querySelectorAll('[data-env]').forEach(b=>{b.textContent=t('env.k_'+b.dataset.env);b.setAttribute('aria-pressed',String(b.dataset.env===environmentKind));});
}
// "atjaunots pirms 12 min"; marked when older than the source normally gets
function environmentFreshness(data,maxAge){
 const at=Date.parse(data?.fetchedAt),stale=!Number.isFinite(at)||Date.now()-at>maxAge;
 const p=envNode('p',Number.isFinite(at)?t('env.updated',{age:fmtAge(at)}):t('env.outdated'),'env-fresh'+(stale?' is-stale':''));
 if(Number.isFinite(at))p.title=new Date(at).toLocaleString(LOCALE)+(stale?' · '+t('env.outdated'):'');
 return p;
}
// Title row: heading on the left, data age on the right
function envHead(title,sub,data,maxAge){
 const head=envNode('div',null,'env-head'),text=envNode('div');
 text.append(envNode('h2',title));
 if(sub)text.append(envNode('p',sub,'env-sub'));
 head.append(text);
 if(data)head.append(environmentFreshness(data,maxAge));
 $('environmentContent').append(head);
}
function envSource(text,url){const p=envNode('p',null,'env-note env-source');const a=envNode('a',text);a.href=url;a.target='_blank';a.rel='noopener';p.append(a);return p;}
const envFmt=(v,d=1)=>v==null||!Number.isFinite(+v)?'-':Number(v).toLocaleString(LOCALE,{maximumFractionDigits:d});
function envMetric(label,value,unit,level,levelText){
 const card=envNode('div',null,'env-metric');
 if(level)card.dataset.level=level;
 card.append(envNode('span',label),envNode('strong',envFmt(value)),envNode('small',unit));
 if(levelText)card.append(envNode('em',levelText));
 return card;
}
// "šodien 14:10", "rīt 04:56", else "6. okt. 14:10" (Riga time like the rest of the site)
function envWhen(ms){
 const ymd=v=>new Date(v).toLocaleDateString('en-CA',{timeZone:'Europe/Riga'});
 const time=new Date(ms).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Riga'});
 return ymd(ms)===ymd(Date.now())?t('today.day_today')+' '+time:ymd(ms)===ymd(Date.now()+864e5)?t('today.day_tomorrow')+' '+time:fmtClock(ms);
}
// "2 h" / "40 min" until a moment
function envIn(ms){const m=Math.max(1,Math.round(ms/60000));return m<90?m+' min':Math.round(m/60)+' h';}
function envChart(id,labels,datasets,unit='',{type='line',legend=true,yMax}={}){
 if(S.charts.environment)S.charts.environment.destroy();
 const canvas=envNode('canvas');canvas.id=id;canvas.setAttribute('role','img');
 canvas.setAttribute('aria-label',datasets.map(d=>d.label).join(', ')+(unit?' · '+unit:''));
 const wrap=envNode('div',null,'env-chart');wrap.append(canvas);$('environmentContent').append(wrap);
 const cd=CD();
 S.charts.environment=new Chart(canvas,{type,data:{labels:labels.map(t=>chartTimeLabel(t,LOCALE)),datasets:datasets.map(d=>({tension:.25,pointHoverRadius:5,pointHitRadius:16,spanGaps:false,...d}))},
  options:{...cd,layout:{padding:8},scales:{...cd.scales,x:{...cd.scales.x,grid:{display:false},ticks:{...cd.scales.x.ticks,maxTicksLimit:window.innerWidth<600?4:8}},
   y:{...cd.scales.y,beginAtZero:type==='bar',...(yMax!=null?{max:yMax}:{}),title:{display:!!unit,text:unit,color:cssVar('--t2')}}},
   plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{title:items=>items.length?chartTimeTitle(labels[items[0].dataIndex],LOCALE):''}},
    legend:{display:legend,labels:{color:cssVar('--t2'),usePointStyle:true,pointStyle:'line',boxWidth:24,padding:16}}}}});
 return wrap;
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
   try{data=await publicData('marine-'+marineParameter,'marine-'+marineParameter,3600000);}catch{data=null;}
  }else if(kind==='warnings')data=await liveWarnings();
  else data=await publicData(kind,kind,kind==='hydro'?1800000:600000);
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
// European AQI and its pollutant sub-index bands (CAMS): 1 labs ... 6 ārkārtīgi slikts
const AQI_BANDS={european_aqi:[20,40,60,80,100],pm2_5:[10,20,25,50,75],pm10:[20,40,50,100,150],ozone:[50,100,130,240,380]};
const aqiLevel=(key,v)=>v==null||!Number.isFinite(+v)?0:1+AQI_BANDS[key].filter(x=>v>x).length;
function renderAir(data){
 const c=$('environmentContent'),h=data.hourly;if(!h?.time?.length)throw new Error('No data');
 const now=Math.floor(Date.now()/3600000)*3600,start=h.time.findIndex(t=>t>=now);if(start<0)throw new Error('Expired forecast');
 envHead(t('env.air_title'),S.city,null);
 const aqi=h.european_aqi?.[start],lvl=aqiLevel('european_aqi',aqi);
 const hero=envNode('div',null,'env-hero');hero.dataset.level=lvl;
 const text=envNode('div');text.append(envNode('span',lvl?t('env.aqi_'+lvl):'-','env-level'),envNode('p',t('env.aqi_hero',{time:envWhen(h.time[start]*1000)}),'env-sub'));
 hero.append(envNode('strong',envFmt(aqi,0),'mono'),text);c.append(hero);
 const grid=envNode('div',null,'env-grid');
 for(const [key,label] of [['pm2_5','PM₂.₅'],['pm10','PM₁₀'],['ozone',t('env.ozone')]]){const l=aqiLevel(key,h[key]?.[start]);grid.append(envMetric(label,h[key]?.[start],'µg/m³',l,l?t('env.aqi_'+l):''));}
 c.append(grid);
 c.append(envNode('h3',t('env.pollen_title')));
 const pollen=envNode('div',null,'env-grid');for(const key of ['birch','alder','grass','mugwort'])pollen.append(envMetric(t('env.pollen_'+key),h[key+'_pollen']?.[start],t('env.grains')));c.append(pollen);
 c.append(envNode('h3',t('env.air_chart')));
 // The line takes the colour of the AQI level it is in
 const lvlColor=v=>cssVar('--aq'+(aqiLevel('european_aqi',v)||2));
 envChart('airChart',h.time.slice(start).map(t=>new Date(t*1000).toISOString()),[{label:t('env.aqi'),data:h.european_aqi.slice(start),pointRadius:0,borderWidth:2.5,
  borderColor:cssVar('--aq2'),segment:{borderColor:ctx=>lvlColor(Math.max(ctx.p0.parsed.y,ctx.p1.parsed.y))}}],'',{legend:false});
 c.append(envNode('p',t('env.air_foot'),'env-note'));
 c.append(envSource('Open-Meteo / CAMS · CC BY 4.0','https://open-meteo.com/en/docs/air-quality-api'));
}

function renderWarnings(data){
 const c=$('environmentContent');
 envHead(t('env.warn_title'),null,data,45*60000);
 const now=Date.now(),groups=groupWarnings(data.alerts,now);
 const here=warningsAtPlace(data.alerts,S.lat,S.lon,now);
 const n=groups.length,sum=envNode('p',n?t(n%10===1&&n%100!==11?'env.warn_count_one':'env.warn_count',{n}):t('env.warn_none'),'env-summary');
 if(here.length)sum.append(envNode('span',t('env.warn_here'),'env-here'));
 c.append(sum);
 if(groups.some(g=>g.polygons.length)){
  const shell=envNode('div',null,'map-stage warn-map'),map=envNode('div');map.id='environmentMap';shell.append(map);c.append(shell);
  environmentMap=L.map(map,{scrollWheelZoom:false,zoomSnap:.5}).setView([56.9,24.6],6.5);environmentBaseMap(environmentMap);addMapFullscreen(environmentMap,shell);
  // Most severe drawn last, on top
  for(const g of groups.slice().reverse())for(const ring of g.polygons){
   const color=cssVar('--sev-'+(g.severity in WARN_SEVERITY?g.severity:'Moderate'));
   L.polygon(ring,{color,weight:1,fillColor:color,fillOpacity:.3}).bindTooltip(warningTitle(g.event,LANG),{sticky:true}).addTo(environmentMap);
  }
  L.circleMarker([S.lat,S.lon],{radius:6,color:'#fff',weight:2,fillColor:cssVar('--acc'),fillOpacity:1}).bindTooltip(S.city).addTo(environmentMap);
  environmentMap.fitBounds([[55.6,20.9],[58.1,28.3]]);
 }
 for(const g of groups){
  const onset=Date.parse(g.onset),card=envNode('article',null,'env-alert');card.dataset.severity=g.severity;
  const top=envNode('div',null,'env-alert-top');
  top.append(envNode('span',t('env.sev_'+(g.severity in WARN_SEVERITY?g.severity:'Moderate')),'env-level'),
   envNode('span',onset>now?t('env.warn_starts',{time:envIn(onset-now)}):t('env.warn_active'),'env-when'));
  const title=envNode('h3',warningTitle(g.event,LANG));title.title=g.event;
  card.append(top,title,envNode('p',(Number.isFinite(onset)?envWhen(onset)+' – ':'')+envWhen(Date.parse(g.expires)),'env-time'));
  // Areas: the first few in the card, all of them behind "visas teritorijas"
  const areas=g.areas.map(a=>warningArea(a,LANG)),SHOW=6;
  card.append(envNode('p',areas.slice(0,SHOW).join(', ')+(areas.length>SHOW?' '+t('env.warn_more',{n:areas.length-SHOW}):''),'env-area'));
  if(areas.length>SHOW){
   const more=envNode('details',null,'env-areas'),summary=envNode('summary',t('env.warn_all',{n:areas.length}));
   more.append(summary,envNode('p',areas.join(', ')));card.append(more);
  }
  c.append(card);
 }
 c.append(envNode('p',t('env.warn_note'),'env-note'));
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
 const c=$('environmentContent');
 envHead(t('env.hydro_title'),null,data,2*3600000);
 const stations=[...data.stations].sort((a,b)=>haversineKm(lat,lon,a.lat,a.lon)-haversineKm(lat,lon,b.lat,b.lon));
 const layout=envNode('div',null,'hydro-layout');c.append(layout);
 const shell=envNode('div',null,'map-stage'),map=envNode('div');map.id='environmentMap';shell.append(map);
 const panel=envNode('div',null,'hydro-detail');layout.append(shell,panel);
 const pick=envNode('select');pick.setAttribute('aria-label',t('env.hydro_station'));
 for(const st of stations){const o=envNode('option',st.name+' · '+Math.round(haversineKm(lat,lon,st.lat,st.lon))+' km');o.value=st.id;pick.append(o);}
 const body=envNode('div');panel.append(pick,body);
 const chartBox=envNode('div');c.append(chartBox);
 environmentMap=L.map(map,{scrollWheelZoom:false}).setView([lat,lon],7);environmentBaseMap(environmentMap);addMapFullscreen(environmentMap,shell);
 const markers=new Map();let param=null;
 const show=()=>{
  const st=stations.find(s=>s.id===pick.value);body.replaceChildren();if(!st)return;
  markers.forEach((marker,id)=>{marker.setIcon(hydroIcon(id===st.id));marker.setZIndexOffset(id===st.id?1000:0);});
  body.append(envNode('h3',st.name),envNode('p',t('env.hydro_dist',{km:Math.round(haversineKm(lat,lon,st.lat,st.lon))}),'env-sub'));
  const keys=Object.keys(st.series).filter(k=>st.series[k]?.length);
  if(!keys.includes(param))param=keys[0];
  const tiles=envNode('div',null,'hydro-values');
  for(const k of keys){
   const series=st.series[k],last=series.at(-1),meta=data.parameters[k]||{unit:''};
   // Change over 24 h: the reading closest to a day before the last one (within 3 h)
   const day=Date.parse(last[0])-864e5,ref=series.reduce((b,p)=>Math.abs(Date.parse(p[0])-day)<Math.abs(Date.parse(b[0])-day)?p:b,series[0]);
   const delta=ref!==last&&Math.abs(Date.parse(ref[0])-day)<=3*3600e3?last[1]-ref[1]:null;
   const b=envNode('button',null,'hydro-value');b.type='button';b.setAttribute('aria-pressed',String(k===param));
   b.append(envNode('span',meta[LANG]||k),envNode('strong',envFmt(last[1])+(meta.unit?' '+meta.unit:'')));
   if(delta!=null)b.append(envNode('small',t('env.hydro_change',{v:(delta>0?'+':delta<0?'−':'±')+envFmt(Math.abs(delta))+(meta.unit?' '+meta.unit:'')})));
   b.onclick=()=>{param=k;show();};
   tiles.append(b);
  }
  body.append(tiles,envNode('p',t('env.hydro_time',{time:envWhen(Date.parse(st.series[param].at(-1)[0]))}),'env-sub'));
  const series=st.series[param],meta=data.parameters[param]||{unit:''};
  chartBox.replaceChildren(envNode('h3',(meta[LANG]||param)+' · '+st.name));
  chartBox.append(envChart('hydroChart',series.map(p=>p[0]),[{label:(meta[LANG]||param)+(meta.unit?' · '+meta.unit:''),data:series.map(p=>p[1]),borderColor:cssVar('--rain'),pointRadius:0,borderWidth:2.5}],meta.unit,{legend:false}));
  environmentMap.panTo([st.lat,st.lon]);
 };
 stations.forEach(st=>{const label=envNode('span',st.name);const marker=L.marker([st.lat,st.lon],{icon:hydroIcon(),title:st.name,alt:st.name}).bindTooltip(label,{className:'hydro-tooltip'}).on('click',()=>{pick.value=st.id;show();}).addTo(environmentMap);markers.set(st.id,marker);});
 pick.onchange=show;show();
 c.append(envNode('p',t('env.hydro_note'),'env-note'));
 c.append(envSource('LVĢMC / data.gov.lv · CC0','https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi'));
}

// Kp levels as NOAA names them: below 4 quiet, 4 unsettled, from 5 storms G1-G5
const kpLevel=kp=>kp<4?0:kp<5?1:Math.min(6,Math.floor(kp)-3);
const KP_COLORS=['--aq1','--aq3','--aq4','--aq4','--aq5','--aq5','--aq6'];
function renderAurora(data){
 const c=$('environmentContent'),last=data.readings.at(-1);
 envHead(t('env.aurora_title'),null,data,60*60000);
 const lvl=kpLevel(last.kp),hero=envNode('div',null,'env-hero');hero.dataset.kp=lvl;
 const text=envNode('div');text.append(envNode('span',t('env.kp_level_'+lvl),'env-level'),envNode('p',t('env.kp_observed',{time:envWhen(Date.parse(last.time))}),'env-sub'));
 hero.append(envNode('strong',envFmt(last.kp,1),'mono'),text);c.append(hero);
 // 0-9 scale with the current value marked
 const scale=envNode('div',null,'kp-scale'),mark=envNode('i');mark.style.left=Math.min(100,Math.max(0,last.kp)/9*100)+'%';scale.append(mark);
 scale.setAttribute('role','img');scale.setAttribute('aria-label','Kp '+envFmt(last.kp,1)+' / 9');
 const ticks=envNode('div',null,'kp-ticks');for(let k=0;k<=9;k++)ticks.append(envNode('span',String(k)));
 c.append(scale,ticks,envNode('p',t('env.kp_latvia'),'env-callout'));
 c.append(envNode('h3',t('env.kp_chart')));
 envChart('auroraChart',data.readings.map(r=>r.time),[{label:'Kp',data:data.readings.map(r=>r.kp),backgroundColor:data.readings.map(r=>cssVar(KP_COLORS[kpLevel(r.kp)])),borderWidth:0,borderRadius:3,maxBarThickness:28}],'Kp',{type:'bar',legend:false,yMax:9});
 c.append(envNode('p',t('env.kp_note'),'env-note'));
 c.append(envSource('NOAA SWPC','https://www.swpc.noaa.gov/products/aurora-30-minute-forecast'));
}
document.querySelectorAll('[data-env]').forEach(b=>b.onclick=()=>{environmentKind=b.dataset.env;initEnvironment();});
environmentLabels();
