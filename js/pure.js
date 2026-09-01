// ─── PURE HELPERS ──────────────────────────────────────────────────────────
// No DOM, no i18n, no globals. Loaded early in the browser; also require()-able
// from Node for unit tests (see test/pure.test.js).

// Temperature -> CSS colour class
function tempCls(v){
  if(v==null)return '';
  if(v>=28)return 'tc-hot';
  if(v>=18)return 'tc-warm';
  if(v>=8) return 'tc-cool';
  return 'tc-cold';
}

// WMO weather interpretation code -> icon/text key
function wKey(c){
  if(c==null)return null;
  if(c<=1)return 'clear';
  if(c<=3)return 'partly';
  if(c<=9)return 'fog';
  if(c<=19)return 'rain';
  if(c<=29)return 'snow';
  if(c<=49)return 'fog';
  if(c<=59)return 'drizzle';
  if(c<=69)return 'rain';
  if(c<=79)return 'snow';
  if(c<=82)return 'rain';
  if(c<=99)return 'thunder';
  return 'thunder';
}

// 16-point compass index (0 = N, clockwise) for a bearing in degrees
function compassIndex(deg){
  return ((Math.round(deg/22.5)%16)+16)%16;
}

// Great-circle distance in km between two WGS84 points
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Fraction through the lunar synodic cycle (0 = new, 0.5 = full) at epoch ms
function moonPhaseFrac(nowMs){
  const ref=Date.parse('2000-01-06T18:14:00Z'), cycle=29.53058867;
  const days=(((nowMs-ref)/86400000)%cycle+cycle)%cycle;
  return days/cycle;
}

// Warming-stripes colour: z = (year mean - baseline) / sd, mapped blue->white->red.
// Diverging: interpolate from the neutral mid toward the cold or warm endpoint.
function stripeColor(z){
  const tt=Math.max(-1,Math.min(1,z/3));
  const mid=[245,245,245], cold=[8,48,107], warm=[103,0,13];
  const end=tt<0?cold:warm;
  const f=Math.abs(tt);
  return `rgb(${Math.round(mid[0]+(end[0]-mid[0])*f)},${Math.round(mid[1]+(end[1]-mid[1])*f)},${Math.round(mid[2]+(end[2]-mid[2])*f)})`;
}

const _avg=a=>a.reduce((s,v)=>s+v,0)/a.length;

// Reduce daily-mean temperature series to {annual, doyClim, centre, sd} for the Climate tab
function processClimate(time,mean){
  const byYear={}, doySum=new Array(367).fill(0), doyCnt=new Array(367).fill(0);
  for(let i=0;i<time.length;i++){
    const v=mean[i]; if(v==null)continue;
    const s=time[i], y=+s.slice(0,4);
    (byYear[y]=byYear[y]||[]).push(v);
    if(y>=1991&&y<=2020){
      const d=new Date(s+'T00:00');
      const doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5);
      doySum[doy]+=v; doyCnt[doy]++;
    }
  }
  const thisYear=new Date().getFullYear();
  const annual=Object.keys(byYear).map(Number).sort((a,b)=>a-b).map(y=>({
    year:y, mean:_avg(byYear[y]), full:byYear[y].length>=350
  })).filter(a=>a.full||a.year===thisYear);
  const doyClim=new Array(367).fill(null);
  for(let d=1;d<=366;d++){
    let s=0,c=0;
    for(let k=-7;k<=7;k++){const dd=((d+k-1)%366+366)%366+1; if(doyCnt[dd]){s+=doySum[dd]/doyCnt[dd];c++;}}
    if(c)doyClim[d]=s/c;
  }
  const base=annual.filter(a=>a.year>=1961&&a.year<=1990&&a.full);
  const centre=base.length?_avg(base.map(a=>a.mean)):_avg(annual.map(a=>a.mean));
  const mn=_avg(annual.map(a=>a.mean));
  const sd=Math.sqrt(_avg(annual.map(a=>(a.mean-mn)**2)))||1;
  return {annual,doyClim,centre,sd};
}

// Are two {lat,lon} within ~2 km of each other
const sameLoc=(a,b)=>Math.abs(a.lat-b.lat)<0.02&&Math.abs(a.lon-b.lon)<0.02;

if(typeof module!=='undefined'&&module.exports){
  module.exports={tempCls,wKey,compassIndex,haversineKm,moonPhaseFrac,stripeColor,processClimate,sameLoc,_avg};
}
