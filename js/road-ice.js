// ─── ROAD ICE: slippery roads near the place, from the LVC road stations ─────
// No DOM, no i18n. Input is the raw LVC worker list (_lvcStations in radar.js),
// output is a plain object that js/today.js turns into one line of text. Also
// require()-able from Node for unit tests (see test/road-ice.test.js).

const RI_ICE_COND=new Set(['frost','iceOrSnowOnRoad']);
const RI_ICE_T=0;     // surface at or below this: ice
const RI_NEAR_T=1;    // surface at or below this: close to freezing
const RI_COND_T=3;    // a frost/ice report on a surface warmer than this is left out as implausible

const riHaversine=typeof haversineKm==='function'?haversineKm:require('./pure.js').haversineKm;
const riNum=v=>v==null||v===''||!Number.isFinite(+v)?null:+v;

// Same parser as the station table (map-utils.js loads later in the browser, so look it up on use)
function riTimeMs(v){
  const parse=typeof parseStationTime==='function'?parseStationTime:require('./map-utils.js').parseStationTime;
  return parse(v);
}

// Road stations within maxKm with a fresh reading of the surface or the road condition.
// null when none of them is icy or close to freezing, else
// {level:'ice'|'near', count, total, frost, coldest:{name,surfaceTemp,dist}|null}
// count: stations at that level, total: fresh stations considered,
// frost: icy stations only by the reported frost, ice or snow (no surface at or below 0).
function roadIceSummary(stations,lat,lon,{nowMs=Date.now(),maxKm=35,maxAgeMin=90}={}){
  const fresh=[];
  for(const s of stations||[]){
    const la=riNum(s?.lat),lo=riNum(s?.lon);
    if(la==null||lo==null)continue;
    const surf=riNum(s.surfaceTemp),cond=s.roadCondition||null;
    if(surf==null&&!cond)continue;
    const age=(nowMs-riTimeMs(s.time))/60000;
    if(!Number.isFinite(age)||age>maxAgeMin||age<-15)continue;
    const dist=riHaversine(lat,lon,la,lo);
    if(dist>maxKm)continue;
    const frozen=surf!=null&&surf<=RI_ICE_T,frost=!frozen&&RI_ICE_COND.has(cond)&&(surf==null||surf<=RI_COND_T);
    fresh.push({name:String(s.name||s.id||'-'),surf,dist,frost,ice:frost||frozen});
  }
  const ice=fresh.filter(s=>s.ice).length;
  const near=fresh.filter(s=>!s.ice&&s.surf!=null&&s.surf<=RI_NEAR_T).length;
  if(!ice&&!near)return null;
  let coldest=null;
  for(const s of fresh){
    if(s.surf==null)continue;
    if(!coldest||s.surf<coldest.surfaceTemp||(s.surf===coldest.surfaceTemp&&s.dist<coldest.dist))coldest={name:s.name,surfaceTemp:s.surf,dist:s.dist};
  }
  return {level:ice?'ice':'near',count:ice||near,total:fresh.length,frost:fresh.filter(s=>s.frost).length,coldest};
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={roadIceSummary};
}
