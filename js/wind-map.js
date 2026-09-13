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
 frame.title=envText('Interaktīva vēja karte','Interactive wind map')+' · '+(windMapProvider==='windy'?'Windy':'Ventusky');
 frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;
 windMapFrame=frame;const container=$('windMapEmbed');container.hidden=false;container.replaceChildren(frame);
 frame.src=windMapURL(windMapProvider,S.lat,S.lon);refreshWindMap();
}
function refreshWindMap(){
 const card=$('windMapCard');if(!card)return;
 const key=S.lat.toFixed(2)+','+S.lon.toFixed(2);
 if(key!==windMapPlace){windMapFrame?.remove();windMapFrame=null;windMapPlace=key;}
 const open=!!windMapFrame;
 $('windMapTitle').textContent=envText('Vēja karte','Wind map')+' · '+S.city;
 $('windMapInfo').textContent=envText('Animācija rāda vēja plūsmu, krāsas - ātrumu. Kartes laiks un modelis ir neatkarīgi no augšējā grafika.','Animation shows wind flow; colours show speed. The map time and model are independent of the chart above.');
 $('windMapSources').setAttribute('aria-label',envText('Kartes avots','Map source'));
 card.querySelectorAll('[data-wind-map]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.windMap===windMapProvider)));
 const action=$('windMapToggle');action.textContent=open?envText('Aizvērt karti','Close map'):envText('Ielādēt vēja karti','Load wind map');action.setAttribute('aria-expanded',String(open));
 $('windMapEmbed').hidden=!open;
 $('windMapHint').textContent=open?envText('Laiku un skatu maini kartē. Ventusky mērvienības un valoda pielāgojas pārlūkam. Ja karte nerādās, atver to atsevišķi.','Change time and view inside the map. Ventusky units and language follow your browser. If the map does not appear, open it separately.'):envText('Karte ielādēsies tikai pēc nospiešanas. Aizverot karti vai atstājot vēja sadaļu, tās darbība tiks apturēta.','The map loads only after you press the button. Closing it or leaving the Wind tab stops it.');
 const link=$('windMapExternal');link.textContent=envText('Atvērt atsevišķi','Open separately')+' · '+(windMapProvider==='windy'?'Windy':'Ventusky');link.href=windMapProvider==='ventusky'?windMapURL('ventusky',S.lat,S.lon).replace('embed.ventusky.com','www.ventusky.com'):'https://www.windy.com/?'+S.lat.toFixed(2)+','+S.lon.toFixed(2)+',6';
 if(windMapFrame)windMapFrame.title=envText('Interaktīva vēja karte','Interactive wind map')+' · '+(windMapProvider==='windy'?'Windy':'Ventusky');
}
if(typeof document!=='undefined'){
 document.querySelectorAll('[data-wind-map]').forEach(b=>b.onclick=()=>{
  if(windMapProvider===b.dataset.windMap)return;
  windMapProvider=b.dataset.windMap;if(windMapFrame)openWindMap();else refreshWindMap();
 });
 $('windMapToggle').onclick=()=>windMapFrame?closeWindMap():openWindMap();
}
if(typeof module!=='undefined')module.exports={windMapURL};
