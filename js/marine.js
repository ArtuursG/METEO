// Each layer has its own source grid and is loaded only when selected.
let marineParameter='wave',marineHours=168,marineSelected=null;
const marineMeta={wave:{lv:'Viļņu augstums',en:'Wave height',unit:'m',max:3},temperature:{lv:'Ūdens temperatūra',en:'Water temperature',unit:'°C',max:25},current:{lv:'Straumes ātrums',en:'Current speed',unit:'m/s',max:1}};
function renderMarine(data){
 const c=$('environmentContent'),meta=marineMeta[marineParameter];
 c.append(envNode('h2',envText('Jūras prognoze','Marine forecast')));
 const tabs=envNode('div',null,'env-nav');
 for(const [key,m] of Object.entries(marineMeta)){
  const b=envNode('button',m[LANG]||m.lv,'mt');b.setAttribute('aria-pressed',String(key===marineParameter));
  b.onclick=()=>{marineParameter=key;initEnvironment();};tabs.append(b);
 }c.append(tabs);
 if(!data?.points?.length){c.append(envNode('p',envText('Šim slānim pašlaik nav pieejamu prognožu. Izvēlies citu slāni vai mēģini vēlāk.','No forecast is currently available for this layer. Choose another layer or try later.'),'env-warning'));const retry=envNode('button',envText('Mēģināt vēlreiz','Try again'),'mt');retry.onclick=()=>{environmentRenderedKey=null;initEnvironment();};c.append(retry);return;}
 c.append(environmentFreshness(data,18*3600000),envNode('p',envText('Atlasīti jūras prognozes punkti. Pieskaries punktam, lai apskatītu tā grafiku. Dati neraksturo upes vai precīzus apstākļus peldvietā.','Selected marine forecast points. Tap a point to view its chart. These data do not describe rivers or exact bathing conditions.'),'env-note'));
 const start=Math.floor(Date.now()/3600000)*3600000,end=start+marineHours*3600000;
 const points=data.points.map(p=>({...p,series:p.series.filter(([t])=>Date.parse(t)>=start&&Date.parse(t)<end)})).filter(p=>p.series.some(([,v])=>v!=null));
 if(!points.length){c.append(envNode('p',envText('Šīs prognozes derīguma laiks ir beidzies.','This forecast has expired.'),'env-warning'));return;}
 c.append(envNode('p',envText('Pieejamie punkti: ','Available points: ')+points.length,'env-note'));
 const times=[...new Set(points.flatMap(p=>p.series.map(([t])=>t)))].sort();
 const periods=envNode('div',null,'env-nav');
 for(const [hours,lv,en] of [[48,'48 h','48 h'],[168,'7 dienas','7 days'],[216,'9 dienas','9 days']]){
  const b=envNode('button',envText(lv,en),'mt');b.setAttribute('aria-pressed',String(marineHours===hours));b.onclick=()=>{marineHours=hours;environmentRenderedKey=null;initEnvironment();};periods.append(b);
 }c.append(periods);
 const pick=envNode('select');pick.setAttribute('aria-label',envText('Jūras prognozes punkts','Marine forecast point'));
 points.sort((a,b)=>haversineKm(S.lat,S.lon,a.lat,a.lon)-haversineKm(S.lat,S.lon,b.lat,b.lon));
 points.forEach((p,i)=>{const o=envNode('option',p.lat.toFixed(3)+', '+p.lon.toFixed(3)+' · '+Math.round(haversineKm(S.lat,S.lon,p.lat,p.lon))+' km '+envText('no izvēlētās vietas','from selected location'));o.value=String(i);pick.append(o);});
 const saved=points.findIndex(p=>p.lat+','+p.lon===marineSelected);pick.value=String(Math.max(0,saved));c.append(pick);
 const map=envNode('div');map.id='environmentMap';c.append(map);
 environmentMap=L.map(map,{scrollWheelZoom:false}).setView([57.3,23.1],7);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(environmentMap);
 environmentMap.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[28,28],maxZoom:8});
 const timeline=envNode('div',null,'marine-timeline'),back=envNode('button','‹','mt'),next=envNode('button','›','mt'),stamp=envNode('output');
 back.setAttribute('aria-label',envText('Iepriekšējā stunda','Previous hour'));next.setAttribute('aria-label',envText('Nākamā stunda','Next hour'));
 const slider=envNode('input');slider.type='range';slider.min='0';slider.max=String(times.length-1);slider.value='0';slider.step='1';slider.setAttribute('aria-label',envText('Jūras prognozes laiks','Marine forecast time'));
 timeline.append(back,stamp,next,slider);c.append(timeline);
 const legend=envNode('p',envText('Krāsa: mazāka → lielāka vērtība. Svītra: nav datu.','Colour: lower → higher value. Dash: no data.'),'env-note');c.append(legend);
 const detail=envNode('p',null,'env-note');c.append(detail);
 const markers=points.map((p,i)=>{
  const label=envNode('span',null,'marine-value');
  const marker=L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:1,fillOpacity:0.9}).addTo(environmentMap).bindTooltip(label,{permanent:true,direction:'top',className:'marine-label'});
  marker.on('click',()=>{pick.value=String(i);drawChart();drawFrame();});return {marker,label,values:new Map(p.series)};
 });
 function drawChart(){
  const p=points[Number(pick.value)];marineSelected=p.lat+','+p.lon;
  document.getElementById('marineChart')?.parentElement.remove();
  envChart('marineChart',p.series.map(([t])=>t),[{label:(meta[LANG]||meta.lv)+' · '+meta.unit,data:p.series.map(([,v])=>v),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2,spanGaps:false}],(meta[LANG]||meta.lv)+' · '+meta.unit);
 }
 function drawFrame(){
  const index=Number(slider.value),time=times[index];stamp.textContent=chartTimeTitle(time,LOCALE)+' · '+Intl.DateTimeFormat().resolvedOptions().timeZone;slider.setAttribute('aria-valuetext',stamp.textContent);back.disabled=index===0;next.disabled=index===times.length-1;
  markers.forEach(({marker,label,values},i)=>{const v=values.get(time);label.textContent=v==null?'-':Number(v).toLocaleString(LOCALE,{maximumFractionDigits:1})+' '+meta.unit;marker.setStyle({fillColor:v==null?'#777':`hsl(${210-Math.max(0,Math.min(1,v/meta.max))*190} 75% 48%)`,radius:i===Number(pick.value)?10:6,weight:i===Number(pick.value)?3:1});});
  const p=points[Number(pick.value)],value=markers[Number(pick.value)].values.get(time);
  detail.textContent=(meta[LANG]||meta.lv)+': '+(value==null?'-':Number(value).toLocaleString(LOCALE,{maximumFractionDigits:2})+' '+meta.unit)+' · '+p.lat.toFixed(3)+', '+p.lon.toFixed(3);
 }
 pick.onchange=()=>{drawChart();drawFrame();};slider.oninput=drawFrame;
 back.onclick=()=>{slider.value=String(Math.max(0,Number(slider.value)-1));drawFrame();};next.onclick=()=>{slider.value=String(Math.min(times.length-1,Number(slider.value)+1));drawFrame();};
 c.append(envSource('LVĢMC / Copernicus Marine · CC0','https://data.gov.lv/dati/dataset/telpiskas-juras-prognozes'));
 drawChart();drawFrame();
}
