// ─── FORECAST CHANGE: what changed since the previous visit ──────────────────
// No DOM, no i18n, no storage. A snapshot is the model consensus for the first
// three days; js/today.js keeps a few per place in localStorage and turns the
// changes into text. Also require()-able from Node (see test/forecast-change.test.js).

const FC_DAYS=3;
const FC_TEMP=2;          // degrees, compared on the values the daily list shows
const FC_WET=1;           // mm a day: rain expected
const FC_DRY=0.3;         // mm a day: no rain
const FC_MORE_MM=5;       // a change of the daily sum this big ...
const FC_MORE_SHARE=0.5;  // ... and this large a share of the old sum
const FC_SNOW_T=0.5;      // same rule as dailyConsensus(): mean of min and max at or below this

const fcNum=v=>v==null||v===''||!Number.isFinite(+v)?null:+v;
const fcRound=(v,d=1)=>v==null?null:Math.round(v*10**d)/10**d;
// Whole degrees as fmtTemp() shows them: halves away from zero (-2.5 is -3)
const fcDeg=v=>Math.sign(v)*Math.round(Math.abs(v));
const fcValid=s=>s&&Number.isFinite(s.ts)&&Array.isArray(s.days);

// {ts, days:[{date,tmin,tmax,precip,prob}]} from dailyConsensus() rows. Temperatures are
// kept as they are, so they round to whole degrees exactly like the daily list.
function snapshotFromDaily(rows,ts){
  const days=(rows||[]).filter(r=>r&&r.date).slice(0,FC_DAYS).map(r=>({date:r.date,
    tmin:fcNum(r.tmin),tmax:fcNum(r.tmax),precip:fcRound(fcNum(r.precip)),prob:fcRound(fcNum(r.prob),0)}));
  return {ts,days};
}

// The newest snapshot that is at least minAgeMs old, or null
function pickBaseline(list,nowMs,{minAgeMs=3*3600e3}={}){
  let best=null;
  for(const s of list||[]){
    if(!fcValid(s)||s.ts>nowMs-minAgeMs)continue;
    if(!best||s.ts>best.ts)best=s;
  }
  return best;
}

// The stored list with snap added (oldest first). A snapshot less than minGapMs newer
// than the newest stored one is skipped; old ones are dropped, at most max are kept.
function addSnapshot(list,snap,{minGapMs=3600e3,maxAgeMs=4*864e5,max=6}={}){
  const out=(list||[]).filter(fcValid).sort((a,b)=>a.ts-b.ts);
  const newest=out[out.length-1];
  if(fcValid(snap)&&snap.days.length&&(!newest||snap.ts-newest.ts>=minGapMs))out.push(snap);
  const latest=out.length?out[out.length-1].ts:0;
  return out.filter(s=>s.ts>=latest-maxAgeMs).slice(-max);
}

// Changes worth a mention for the dates in both snapshots, most important first, at most 2.
// kind: tmax | tmin (delta in whole degrees), precip_new | precip_gone | precip_more |
// precip_less (delta in mm, mm = the amount now, or before for precip_gone; snow: true
// when the day is cold enough for snow). noPrecip: dates whose precipitation is left out.
function compareForecasts(base,cur,{noPrecip=[]}={}){
  if(!fcValid(base)||!fcValid(cur))return [];
  const before=new Map(base.days.map(d=>[d.date,d]));
  const found=[];
  cur.days.forEach((d,i)=>{
    const b=before.get(d.date);
    if(!b)return;
    const weight=i<2?1:0.85;   // the third day (the day after tomorrow) weighs a little less
    const temps=[];
    for(const [kind,factor] of [['tmax',1],['tmin',0.75]]){
      const to=fcNum(d[kind]),from=fcNum(b[kind]);
      if(to==null||from==null)continue;
      const delta=fcDeg(to)-fcDeg(from);
      if(Math.abs(delta)>=FC_TEMP)temps.push({date:d.date,kind,delta,from,to,score:Math.abs(delta)*factor*weight});
    }
    // One temperature change per day: the larger one
    if(temps.length)found.push(temps.reduce((x,y)=>y.score>x.score?y:x));
    const now=fcNum(d.precip),was=fcNum(b.precip);
    if(now==null||was==null||noPrecip.includes(d.date))return;
    const delta=fcRound(now-was);
    const cold=x=>x.tmin!=null&&x.tmax!=null&&(x.tmin+x.tmax)/2<=FC_SNOW_T;
    let kind=null,mm=now,score=0;
    if(now>=FC_WET&&was<FC_DRY){kind='precip_new';score=3+Math.min(now,10)/5;}
    else if(was>=FC_WET&&now<FC_DRY){kind='precip_gone';mm=was;score=3+Math.min(was,10)/5;}
    else if(Math.abs(delta)>=FC_MORE_MM&&(was<=0||Math.abs(delta)/was>=FC_MORE_SHARE)){kind=delta>0?'precip_more':'precip_less';score=2+Math.min(Math.abs(delta),20)/10;}
    if(kind)found.push({date:d.date,kind,delta,mm,snow:cold(kind==='precip_gone'?b:d),score:score*weight});
  });
  return found.sort((x,y)=>y.score-x.score||x.date.localeCompare(y.date)).slice(0,2).map(({score,...c})=>c);
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={snapshotFromDaily,pickBaseline,addSnapshot,compareForecasts};
}
