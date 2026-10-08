// Official embeds only: no API keys, tile scraping or background preloading.
let windMapProvider='windy',windMapFrame=null,windMapPlace='';
function windMapURL(provider,lat,lon){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Invalid map coordinates');
 const x=lat.toFixed(2),y=lon.toFixed(2);
 if(provider==='ventusky')return 'https://embed.ventusky.com/?'+new URLSearchParams({p:x+';'+y+';6',l:'wind-10m'});
 return 'https://embed.windy.com/embed.html?'+new URLSearchParams({type:'map',location:'coordinates',metricRain:'mm',metricTemp:'°C',metricWind:'m/s',zoom:'6',overlay:'wind',product:'',level:'surface',lat:x,lon:y});
}
function closeWindMap(){
 windMapFrame?.remove();windMapFrame=null;
 refreshWindMap();
}
function openWindMap(){
 windMapFrame?.remove();
 const frame=document.createElement('iframe');
 frame.title=t('wm.frame',{provider:windMapProvider==='windy'?'Windy':'Ventusky'});
 frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;
 windMapFrame=frame;const container=$('windMapEmbed');container.hidden=false;container.replaceChildren(frame);
 frame.src=windMapURL(windMapProvider,S.lat,S.lon);refreshWindMap();
}
function refreshWindMap(){
 const card=$('windMapCard');if(!card)return;
 const key=S.lat.toFixed(2)+','+S.lon.toFixed(2);
 if(key!==windMapPlace){windMapFrame?.remove();windMapFrame=null;windMapPlace=key;}
 const open=!!windMapFrame;
 $('windMapTitle').textContent=t('wm.title',{city:S.city});
 $('windMapInfo').textContent=t('wm.info');
 $('windMapSources').setAttribute('aria-label',t('wm.source'));
 card.querySelectorAll('[data-wind-map]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.windMap===windMapProvider)));
 const action=$('windMapToggle');action.textContent=t(open?'wm.close':'wm.load');action.setAttribute('aria-expanded',String(open));
 $('windMapEmbed').hidden=!open;
 $('windMapHint').textContent=t(open?'wm.hint_open':'wm.hint_closed');
 const link=$('windMapExternal');link.textContent=t('wm.external',{provider:windMapProvider==='windy'?'Windy':'Ventusky'});link.href=windMapProvider==='ventusky'?windMapURL('ventusky',S.lat,S.lon).replace('embed.ventusky.com','www.ventusky.com'):'https://www.windy.com/?'+S.lat.toFixed(2)+','+S.lon.toFixed(2)+',6';
 if(windMapFrame)windMapFrame.title=t('wm.frame',{provider:windMapProvider==='windy'?'Windy':'Ventusky'});
}
if(typeof document!=='undefined'){
 document.querySelectorAll('[data-wind-map]').forEach(b=>b.onclick=()=>{
  if(windMapProvider===b.dataset.windMap)return;
  windMapProvider=b.dataset.windMap;if(windMapFrame)openWindMap();else refreshWindMap();
 });
 $('windMapToggle').onclick=()=>windMapFrame?closeWindMap():openWindMap();
}
if(typeof module!=='undefined')module.exports={windMapURL};
