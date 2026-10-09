// CAP polygon coordinates are latitude, longitude; include points on the boundary.
function insideWarningPolygon(lat,lon,ring){
 if(!Array.isArray(ring)||ring.length<4)return false;
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ay,ax]=ring[j],[by,bx]=ring[i];
  if(![ay,ax,by,bx].every(Number.isFinite))return false;
  const cross=(lon-ax)*(by-ay)-(lat-ay)*(bx-ax);
  if(Math.abs(cross)<1e-9&&lon>=Math.min(ax,bx)&&lon<=Math.max(ax,bx)&&lat>=Math.min(ay,by)&&lat<=Math.max(ay,by))return true;
  if((ay>lat)!==(by>lat)&&lon<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
 }return inside;
}
function warningsAtPlace(alerts,lat,lon,now=Date.now()){
 return alerts.filter(a=>Date.parse(a.expires)>now&&(a.polygons||[]).some(r=>insideWarningPolygon(lat,lon,r)))
  .sort((a,b)=>({Extreme:3,Severe:2,Moderate:1}[b.severity]||0)-({Extreme:3,Severe:2,Moderate:1}[a.severity]||0));
}
// MeteoAlarm's Latvian feed is in English and split per municipality. These turn it into
// one Latvian title per warning and Latvian place names (unknown names stay as sent).
const WARN_COLOR_LV={green:'Zaļais',yellow:'Dzeltenais',orange:'Oranžais',red:'Sarkanais'};
const WARN_TYPE_LV={'wind':'vējš','snow ice':'sniegs un apledojums','snow':'sniegs','ice':'apledojums','thunderstorm':'pērkona negaiss',
 'thunderstorms':'pērkona negaiss','fog':'migla','high temperature':'karstums','extreme high temperature':'karstums','low temperature':'sals',
 'extreme low temperature':'sals','coastal event':'krasta parādības','forest fire':'meža ugunsbīstamība','avalanches':'lavīnas',
 'rain':'lietus','flood':'plūdi','flooding':'plūdi','rain flood':'lietusgāžu plūdi','marine hazard':'bīstami apstākļi jūrā'};
function warningTitle(event,lang='lv'){
 const m=String(event||'').match(/^(green|yellow|orange|red)\s+(.+?)\s+warning$/i);
 if(lang!=='lv'||!m)return String(event||'');
 const type=WARN_TYPE_LV[m[2].toLowerCase().replace(/[-/]/g,' ').replace(/\s+/g,' ').trim()];
 return type?WARN_COLOR_LV[m[1].toLowerCase()]+' brīdinājums: '+type:String(event);
}
const WARN_CITY_LV={Riga:'Rīga',Daugavpils:'Daugavpils',Jelgava:'Jelgava',Jekabpils:'Jēkabpils',Jurmala:'Jūrmala',Liepaja:'Liepāja',
 Ogre:'Ogre',Rezekne:'Rēzekne',Valmiera:'Valmiera',Ventspils:'Ventspils',
 'Central Baltic East':'Baltijas jūras centrālās daļas austrumi','Gulf of Riga West':'Rīgas jūras līča rietumu daļa',
 'Gulf of Riga East':'Rīgas jūras līča austrumu daļa','Southern Gulf of Riga':'Rīgas jūras līča dienvidu daļa','Irbe Strait':'Irbes šaurums'};
const WARN_MUNI_LV={Adazi:'Ādažu',Aizkraukle:'Aizkraukles',Aluksne:'Alūksnes',Augsdaugava:'Augšdaugavas',Balvi:'Balvu',Bauska:'Bauskas',
 Cesis:'Cēsu',Dienvidkurzeme:'Dienvidkurzemes',Dobele:'Dobeles',Gulbene:'Gulbenes',Jekabpils:'Jēkabpils',Jelgava:'Jelgavas',Kekava:'Ķekavas',
 Kraslava:'Krāslavas',Kuldiga:'Kuldīgas',Limbazi:'Limbažu',Livani:'Līvānu',Ludza:'Ludzas',Madona:'Madonas',Marupe:'Mārupes',Ogre:'Ogres',
 Olaine:'Olaines',Preili:'Preiļu',Rezekne:'Rēzeknes',Ropazi:'Ropažu',Salaspils:'Salaspils',Saldus:'Saldus',Saulkrasti:'Saulkrastu',
 Sigulda:'Siguldas',Smiltene:'Smiltenes',Talsi:'Talsu',Tukums:'Tukuma',Valka:'Valkas',Valmiera:'Valmieras',Varaklani:'Varakļānu',Ventspils:'Ventspils'};
function warningArea(name,lang='lv'){
 const n=String(name||'').trim();
 if(lang!=='lv')return n;
 const muni=n.match(/^(.+?)\s+municipality$/i);
 if(muni)return WARN_MUNI_LV[muni[1]]?WARN_MUNI_LV[muni[1]]+' novads':n;
 return WARN_CITY_LV[n]||n;
}
// One entry per warning: the feed repeats it per area (and sometimes twice), so entries with
// the same event and times are merged, their areas and polygons collected; expired ones dropped
const WARN_SEVERITY={Minor:0,Moderate:1,Severe:2,Extreme:3};
function groupWarnings(alerts,now=Date.now()){
 const groups=new Map();
 for(const a of alerts||[]){
  if(!(Date.parse(a.expires)>now))continue;
  const key=[a.event,a.severity,a.onset,a.expires].join('|');
  let g=groups.get(key);
  if(!g){g={event:a.event,severity:a.severity,onset:a.onset,expires:a.expires,areas:[],polygons:[]};groups.set(key,g);}
  if(a.areaDesc&&!g.areas.includes(a.areaDesc))g.areas.push(a.areaDesc);
  g.polygons.push(...(a.polygons||[]));
 }
 return [...groups.values()].sort((a,b)=>(WARN_SEVERITY[b.severity]||0)-(WARN_SEVERITY[a.severity]||0)||Date.parse(a.onset)-Date.parse(b.onset));
}
let homeWarningRequest=0;
async function refreshHomeWarnings(){
 const box=$('localWarnings');if(!box)return;
 const id=++homeWarningRequest,lat=S.lat,lon=S.lon;box.hidden=true;box.replaceChildren();box.classList.remove('is-quiet');
 // Latvia-only feed; no source request for locations far outside its coverage.
 if(lat<55.5||lat>58.2||lon<20.8||lon>28.3)return;
 try{
  const data=await liveWarnings();
  if(id!==homeWarningRequest||lat!==S.lat||lon!==S.lon)return;
  const alerts=groupWarnings(warningsAtPlace(data.alerts,lat,lon));if(!alerts.length)return;
  box.hidden=false;box.dataset.severity=alerts[0].severity;
  box.append(envNode('strong',t('lw.title',{city:S.city})));
  // In force now, or starting later (MeteoAlarm's own map shows only the current ones under "Now")
  const now=Date.now();
  for(const a of alerts){
   const on=Date.parse(a.onset),off=Date.parse(a.expires),later=on>now;
   const line=envNode('p',warningTitle(a.event,LANG)+' · '+(later?t('lw.starts',{from:envWhen(on),to:envWhen(off)}):t('lw.active_until',{time:envWhen(off)})),later?'is-later':null);
   line.title=a.event+' · '+chartTimeTitle(a.onset,LOCALE)+' – '+chartTimeTitle(a.expires,LOCALE);
   box.append(line);
  }
  const stale=Date.now()-Date.parse(data.fetchedAt)>45*60000||!Number.isFinite(Date.parse(data.fetchedAt));
  box.append(envNode('p',t(stale?'lw.stale':'lw.matched'),'env-note'));
  box.append(envSource('MeteoAlarm · '+t('lw.official'),'https://meteoalarm.org/en/live/'));
 }catch{
  if(id!==homeWarningRequest||lat!==S.lat||lon!==S.lon)return;
  // A failed check is one quiet line, not a box that looks like a warning
  box.hidden=false;box.removeAttribute('data-severity');box.classList.add('is-quiet');
  const line=envNode('p',t('lw.unchecked')+' ');
  const link=envNode('a','MeteoAlarm');link.href='https://meteoalarm.org/en/live/';link.target='_blank';link.rel='noopener';
  line.append(link);box.append(line);
 }
}
if(typeof module!=='undefined')module.exports={insideWarningPolygon,warningsAtPlace,warningTitle,warningArea,groupWarnings};
