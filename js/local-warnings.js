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
let homeWarningRequest=0;
async function refreshHomeWarnings(){
 const box=$('localWarnings');if(!box)return;
 const id=++homeWarningRequest,lat=S.lat,lon=S.lon;box.hidden=true;box.replaceChildren();box.classList.remove('is-quiet');
 // Latvia-only feed; no source request for locations far outside its coverage.
 if(lat<55.5||lat>58.2||lon<20.8||lon>28.3)return;
 try{
  const data=await environmentalData('warnings-v2',publicDataUrl('warnings'),600000);
  if(id!==homeWarningRequest||lat!==S.lat||lon!==S.lon)return;
  const alerts=warningsAtPlace(data.alerts,lat,lon);if(!alerts.length)return;
  box.hidden=false;box.dataset.severity=alerts[0].severity;
  box.append(envNode('strong',t('lw.title',{city:S.city})));
  for(const a of alerts){box.append(envNode('p',a.event+' · '+chartTimeTitle(a.onset,LOCALE)+' – '+chartTimeTitle(a.expires,LOCALE)));}
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
if(typeof module!=='undefined')module.exports={insideWarningPolygon,warningsAtPlace};
