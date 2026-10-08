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
 const mapShell=envNode('div',null,'map-stage marine-stage'),map=envNode('div');map.id='environmentMap';mapShell.append(map);c.append(mapShell);
 environmentMap=L.map(map,{scrollWheelZoom:false,zoomSnap:.5}).setView([57.3,23.1],7);
 environmentBaseMap(environmentMap);
 addMapFullscreen(environmentMap,mapShell);
 // Same timeline as the radar and the cloud map, drawn over the bottom of the map
 const frameTimes=times.map(t=>Date.parse(t));
 let index=Math.max(0,nowFrameIndex(frameTimes));
 const tl=createTimeline({
  baseDelay:700,
  formatTime:fmtClock,
  formatTick:ms=>new Date(ms).toLocaleDateString(LOCALE,{day:'numeric',month:'short'}),
  formatValue:ms=>fmtClock(ms)+' ('+Intl.DateTimeFormat().resolvedOptions().timeZone+')',
  labelKey:'env.marine_time',
  latestKey:'rad.tl_now',
  latestIndex:list=>nowFrameIndex(list),
  onChange:i=>{index=i;drawFrame();},
 });
 tl.el.classList.add('marine-tl');
 mapShell.append(tl.el);
 const syncHeight=()=>mapShell.style.setProperty('--tl-h',tl.el.offsetHeight+'px');
 if(typeof ResizeObserver==='function')new ResizeObserver(syncHeight).observe(tl.el);
 tl.setFrames(frameTimes,index);
 tl.setSide(envText('krāsa: mazāka → lielāka','colour: lower → higher'));
 syncHeight();
 environmentMap.on('unload',()=>tl.pause());
 environmentMap.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{paddingTopLeft:[28,28],paddingBottomRight:[28,28+tl.el.offsetHeight],maxZoom:8});
 c.append(envNode('p',envText('Svītra pie punkta nozīmē, ka šai stundai datu nav.','A dash next to a point means there is no value for that hour.'),'env-note'));
 const markers=points.map((p,i)=>{
  const label=envNode('span',null,'marine-value');
  const marker=L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:1,fillOpacity:0.9}).addTo(environmentMap).bindTooltip(label,{permanent:true,direction:'top',className:'marine-label'});
  marker.on('click',()=>{pick.value=String(i);drawChart();drawFrame();});return {marker,label,values:new Map(p.series)};
 });
 // Permanent labels pile up where points are dense: keep the ones that fit, starting with
 // the selected point, then the points nearest to the chosen place (the list order).
 // Labels are measured as drawn; the timeline and every point count as obstacles.
 function declutterLabels(){
  if(!environmentMap)return;
  const box=map.getBoundingClientRect(),selected=Number(pick.value);
  const rel=r=>({l:r.left-box.left,t:r.top-box.top,r:r.right-box.left,b:r.bottom-box.top});
  const blocked=[rel(tl.el.getBoundingClientRect())];
  const items=markers.map(({marker},i)=>{
   const el=marker.getTooltip()?.getElement(),pt=environmentMap.latLngToContainerPoint(marker.getLatLng());
   const radius=marker.getRadius();
   blocked.push({l:pt.x-radius,t:pt.y-radius,r:pt.x+radius,b:pt.y+radius});
   if(!el)return null;
   el.classList.remove('is-hidden');
   // The label sits right above its own point: stop its box short of that point
   const r=rel(el.getBoundingClientRect()),bottom=Math.min(r.b,pt.y-radius-3);
   return {id:i,x:(r.l+r.r)/2,y:(r.t+bottom)/2,w:r.r-r.l,h:Math.max(1,bottom-r.t),priority:i===selected?1e6:1e5-i};
  }).filter(Boolean);
  // The selected point always keeps its label (it may cover a neighbouring dot)
  const sel=items.find(it=>it.id===selected),keep=new Set();
  if(sel&&declutterBadges([sel],{pad:2,blocked:blocked.slice(0,1)}).has(sel.id)){
   keep.add(sel.id);blocked.push({l:sel.x-sel.w/2,t:sel.y-sel.h/2,r:sel.x+sel.w/2,b:sel.y+sel.h/2});
  }
  for(const id of declutterBadges(items.filter(it=>it!==sel),{pad:2,blocked}))keep.add(id);
  markers.forEach(({marker},i)=>marker.getTooltip()?.getElement()?.classList.toggle('is-hidden',!keep.has(i)));
 }
 environmentMap.on('zoomend moveend',declutterLabels);
 function drawChart(){
  const p=points[Number(pick.value)];marineSelected=p.lat+','+p.lon;
  document.getElementById('marineChart')?.parentElement.remove();
  envChart('marineChart',p.series.map(([t])=>t),[{label:(meta[LANG]||meta.lv)+' · '+meta.unit,data:p.series.map(([,v])=>v),borderColor:cssVar('--acc'),pointRadius:0,borderWidth:2,spanGaps:false}],(meta[LANG]||meta.lv)+' · '+meta.unit);
 }
 function drawFrame(){
  // Playback stops once the view is gone (another layer, another tab)
  if(!map.isConnected||!map.getClientRects().length){tl.pause();return;}
  const time=times[index],selected=Number(pick.value);
  markers.forEach(({marker,label,values},i)=>{const v=values.get(time);label.textContent=v==null?'-':Number(v).toLocaleString(LOCALE,{maximumFractionDigits:1})+' '+meta.unit;marker.setStyle({fillColor:v==null?'#777':`hsl(${210-Math.max(0,Math.min(1,v/meta.max))*190} 75% 48%)`,radius:i===selected?10:6,weight:i===selected?3:1});if(i===selected)marker.bringToFront();});
  const p=points[selected],value=markers[selected].values.get(time);
  tl.setStatus((meta[LANG]||meta.lv)+': '+(value==null?'-':Number(value).toLocaleString(LOCALE,{maximumFractionDigits:2})+' '+meta.unit)+' · '+p.lat.toFixed(3)+', '+p.lon.toFixed(3),'');
  declutterLabels();
 }
 pick.onchange=()=>{
  environmentMap.panInside(markers[Number(pick.value)].marker.getLatLng(),{paddingTopLeft:[40,60],paddingBottomRight:[40,40+tl.el.offsetHeight]});
  drawChart();drawFrame();
 };
 c.append(envSource('LVĢMC / Copernicus Marine · CC0','https://data.gov.lv/dati/dataset/telpiskas-juras-prognozes'));
 drawChart();drawFrame();
}
