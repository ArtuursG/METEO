let environmentKind='air',environmentRequest=0,environmentMap=null,environmentRenderedKey=null;
let environmentStorage;try{environmentStorage=localStorage;}catch{}
const environmentalData=createDataCache({storage:environmentStorage});
const envText=(lv,en)=>LANG==='en'?en:lv;
const envNode=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
function environmentLabels(){
 $('tb-environment').textContent=envText('Vide','Environment');
 const labels={air:['Gaiss un putekšņi','Air & pollen'],warnings:['Brīdinājumi','Warnings'],hydro:['Ūdeņi','Water'],aurora:['Ziemeļblāzma','Aurora']};
 document.querySelectorAll('[data-env]').forEach(b=>{b.textContent=envText(...labels[b.dataset.env]);b.setAttribute('aria-pressed',String(b.dataset.env===environmentKind));});
}
function environmentFreshness(data,maxAge){
 const age=Date.now()-Date.parse(data.fetchedAt);
 const p=envNode('p',envText('Avots pārbaudīts: ','Source checked: ')+new Date(data.fetchedAt).toLocaleString(LOCALE), 'env-note');
 if(!Number.isFinite(age)||age>maxAge){p.classList.add('env-warning');p.append(document.createTextNode(envText(' - dati var būt novecojuši.',' - data may be outdated.')));}
 return p;
}
function envSource(text,url){const p=envNode('p',null,'env-note');const a=envNode('a',text);a.href=url;a.target='_blank';a.rel='noopener';p.append(a);return p;}
function envMetric(label,value,unit){const card=envNode('div',null,'env-metric');card.append(envNode('span',label),envNode('strong',value==null?'−':Number(value).toLocaleString(LOCALE,{maximumFractionDigits:1})),envNode('small',unit));return card;}
function envChart(id,labels,datasets,unit=''){
 if(S.charts.environment)S.charts.environment.destroy();
 const canvas=envNode('canvas');canvas.id=id;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',unit);
 const wrap=envNode('div',null,'env-chart');wrap.append(canvas);$('environmentContent').append(wrap);
 const cd=CD();S.charts.environment=new Chart(canvas,{type:'line',data:{labels,datasets},options:{...cd,plugins:{...cd.plugins,legend:{display:true,labels:{color:cssVar('--t2')}}}}});
}
async function initEnvironment(){
 environmentLabels();const id=++environmentRequest,kind=environmentKind,lat=S.lat,lon=S.lon;
 const renderKey=[kind,lat.toFixed(2),lon.toFixed(2),LANG,document.documentElement.getAttribute('data-theme')].join('_');
 if(environmentRenderedKey?.key===renderKey&&Date.now()-environmentRenderedKey.time<300000){environmentMap?.invalidateSize();return;}
 environmentRenderedKey=null;
 if(environmentMap){environmentMap.remove();environmentMap=null;}
 if(S.charts.environment){S.charts.environment.destroy();delete S.charts.environment;}
 const content=$('environmentContent');content.replaceChildren(envNode('p',envText('Ielādē datus...','Loading data...'),'env-note'));
 try{
  let data;
  if(kind==='air'){
   const x=lat.toFixed(2),y=lon.toFixed(2);
   const p=new URLSearchParams({latitude:x,longitude:y,hourly:'european_aqi,pm2_5,pm10,ozone,birch_pollen,alder_pollen,grass_pollen,mugwort_pollen',forecast_days:4,timeformat:'unixtime',timezone:'UTC'});
   data=await environmentalData('air_'+x+'_'+y,'https://air-quality-api.open-meteo.com/v1/air-quality?'+p,3600000);
  }else data=await environmentalData(kind,'data/'+kind+'.json',kind==='hydro'?1800000:600000);
  if(id!==environmentRequest||lat!==S.lat||lon!==S.lon||kind!==environmentKind)return;
  content.replaceChildren();
  if(kind==='air')renderAir(data);
  if(kind==='warnings')renderWarnings(data);
  if(kind==='hydro')renderHydro(data,lat,lon);
  if(kind==='aurora')renderAurora(data);
  environmentRenderedKey={key:renderKey,time:Date.now()};
 }catch{
  if(id!==environmentRequest)return;
  content.replaceChildren(envNode('p',envText('Dati pašlaik nav pieejami. Tas nenozīmē, ka riska nav. Mēģini vēlāk.','Data is currently unavailable. This does not mean there is no risk. Try again later.'),'env-warning'));
  const retry=envNode('button',envText('Mēģināt vēlreiz','Try again'),'mt');retry.onclick=initEnvironment;content.append(retry);
 }
}
function renderAir(data){
 const c=$('environmentContent'),h=data.hourly;if(!h?.time?.length)throw new Error('No data');
 const now=Math.floor(Date.now()/3600000)*3600;let start=h.time.findIndex(t=>t>=now);if(start<0)throw new Error('Expired forecast');
 c.append(envNode('h2',envText('Gaiss un ziedputekšņi','Air quality and pollen')),
 envNode('p',S.city+' · '+envText('Modelēta prognoze, nevis vietējās stacijas mērījums.','Model forecast, not a local station measurement.'),'env-note'));
 const grid=envNode('div',null,'env-grid');
 for(const [key,label,unit] of [['european_aqi',envText('Eiropas AQI','European AQI'),'AQI'],['pm2_5','PM₂.₅','µg/m³'],['pm10','PM₁₀','µg/m³'],['ozone',envText('Ozons','Ozone'),'µg/m³']])grid.append(envMetric(label,h[key]?.[start],unit));c.append(grid);
 c.append(envNode('p',envText('Prognozes stunda: ','Forecast hour: ')+new Date(h.time[start]*1000).toLocaleString(LOCALE),'env-note'));
 const pollen=envNode('div',null,'env-grid');for(const [key,lv,en] of [['birch_pollen','Bērzs','Birch'],['alder_pollen','Alksnis','Alder'],['grass_pollen','Graudzāles','Grass'],['mugwort_pollen','Vībotne','Mugwort']])pollen.append(envMetric(envText(lv,en),h[key]?.[start],envText('graudi/m³','grains/m³')));c.append(pollen);
 c.append(envNode('p',envText('Putekšņu dati ir sezonāli. Svītra nozīmē, ka datu nav; tā nenozīmē nulli.','Pollen data is seasonal. A dash means unavailable, not zero.'),'env-note'));
 envChart('airChart',h.time.slice(start).map(t=>new Date(t*1000).toLocaleString(LOCALE,{day:'numeric',month:'short',hour:'2-digit'})),[{label:'European AQI',data:h.european_aqi.slice(start),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2}],'European AQI');
 c.append(envSource('Open-Meteo / CAMS · CC BY 4.0','https://open-meteo.com/en/docs/air-quality-api'));
}
function renderWarnings(data){
 const c=$('environmentContent');c.append(envNode('h2',envText('Brīdinājumi Latvijā','Warnings in Latvia')),environmentFreshness(data,45*60000));
 c.append(envNode('p',envText('Visas Latvijas reģioni. Pārbaudi brīdinājumā norādīto teritoriju un derīguma laiku. Avota teksts saglabāts oriģinālvalodā.','All Latvian regions. Check the affected area and validity period. Source wording is preserved.'),'env-note'));
 const alerts=data.alerts.filter(a=>Date.parse(a.expires)>Date.now());
 if(!alerts.length)c.append(envNode('p',envText('Šajā datu kopijā nav aktuālu brīdinājumu. Pārbaudi arī oficiālo avotu.','No current warnings in this snapshot. Also check the official source.')));
 for(const a of alerts){const card=envNode('article',null,'env-alert');card.dataset.severity=a.severity;card.append(envNode('h3',a.event),envNode('p',a.areaDesc),envNode('p',new Date(a.onset).toLocaleString(LOCALE)+' - '+new Date(a.expires).toLocaleString(LOCALE),'env-note'));c.append(card);}
 c.append(envSource('MeteoAlarm / EUMETNET · CC BY 4.0 · '+envText('Oficiālie brīdinājumi','Official warnings'),'https://meteoalarm.org/en/live/'));
}
function renderHydro(data,lat,lon){
 const c=$('environmentContent');c.append(envNode('h2',envText('Ūdens līmenis un temperatūra','Water level and temperature')),environmentFreshness(data,2*3600000));
 c.append(envNode('p',envText('Līmenis ir avota stacijas atskaites sistēmā, nevis upes dziļums. Piedibens temperatūra nav peldvietas virsmas temperatūra. Laiki: Europe/Riga.','Levels use each station’s reference, not river depth. Near-bottom temperature is not bathing-water surface temperature. Times: Europe/Riga.'),'env-note'));
 const stations=[...data.stations].sort((a,b)=>haversineKm(lat,lon,a.lat,a.lon)-haversineKm(lat,lon,b.lat,b.lon));
 const pick=envNode('select');pick.setAttribute('aria-label',envText('Hidroloģiskā stacija','Hydrological station'));for(const st of stations){const o=envNode('option',st.name+' · '+Math.round(haversineKm(lat,lon,st.lat,st.lon))+' km');o.value=st.id;pick.append(o);}c.append(pick);
 const map=envNode('div');map.id='environmentMap';c.append(map);environmentMap=L.map(map).setView([lat,lon],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(environmentMap);
 const detail=envNode('div');c.append(detail);
 const show=()=>{
  const st=stations.find(s=>s.id===pick.value);detail.replaceChildren();if(!st)return;
  const parameter=envNode('select');parameter.setAttribute('aria-label',envText('Mērījums','Measurement'));for(const k of Object.keys(st.series)){const o=envNode('option',data.parameters[k][LANG]||k);o.value=k;parameter.append(o);}detail.append(parameter);
  const latest=envNode('p',null,'env-note');detail.append(latest);
  const draw=()=>{const k=parameter.value,series=st.series[k],last=series.at(-1);latest.textContent=last[0].replace('T',' ')+' · '+last[1]+' '+data.parameters[k].unit;
   document.getElementById('hydroChart')?.parentElement.remove();envChart('hydroChart',series.map(p=>p[0].slice(5,16).replace('T',' ')),[{label:st.name+' · '+data.parameters[k].unit,data:series.map(p=>p[1]),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2}],data.parameters[k].unit);
  };parameter.onchange=draw;draw();environmentMap.panTo([st.lat,st.lon]);
 };
 stations.forEach(st=>{const label=envNode('span',st.name);L.circleMarker([st.lat,st.lon],{radius:6,color:'#37618f',fillOpacity:.8}).bindTooltip(label).on('click',()=>{pick.value=st.id;show();}).addTo(environmentMap);});pick.onchange=show;show();
 c.append(envSource('LVĢMC / data.gov.lv · CC0','https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi'));
}
function renderAurora(data){
 const c=$('environmentContent'),last=data.readings.at(-1);c.append(envNode('h2',envText('Ziemeļblāzmas apstākļi','Aurora conditions')),environmentFreshness(data,60*60000));
 const grid=envNode('div',null,'env-grid');grid.append(envMetric(envText('Planetārais Kp','Planetary Kp'),last.kp,'0-9'));c.append(grid);
 c.append(envNode('p',envText('Kp novērojuma laiks: ','Kp observation time: ')+new Date(last.time).toLocaleString(LOCALE),'env-note'));
 c.append(envNode('p',envText('Kp raksturo globālo ģeomagnētisko aktivitāti. Tas nav ziemeļblāzmas redzamības procents vai garantija izvēlētajā pilsētā. Vajadzīgas tumšas debesis un maz mākoņu.','Kp describes global geomagnetic activity. It is not a local visibility percentage or guarantee. Dark, clear skies are needed.'),'env-note'));
 envChart('auroraChart',data.readings.map(r=>new Date(r.time).toLocaleString(LOCALE,{day:'numeric',hour:'2-digit'})),[{label:'Kp',data:data.readings.map(r=>r.kp),borderColor:cssVar('--acc'),pointRadius:2,borderWidth:2}],'Kp');
 c.append(envSource('NOAA SWPC','https://www.swpc.noaa.gov/products/aurora-30-minute-forecast'));
}
document.querySelectorAll('[data-env]').forEach(b=>b.onclick=()=>{environmentKind=b.dataset.env;initEnvironment();});
environmentLabels();
