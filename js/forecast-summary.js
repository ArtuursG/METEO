// ─── FORECAST SUMMARY: model consensus for the home view ─────────────────────
// No DOM, no i18n. Input is S.data ({modelId:{hourly,daily,current,utcOffset}}),
// output is plain objects that js/today.js turns into text. Also require()-able
// from Node for unit tests (see test/forecast-summary.test.js).
//
// Open-Meteo hourly precipitation and precipitation probability describe the
// hour BEFORE the time stamp, temperature and cloud cover are instantaneous.
// hourSlots() lines them up as "the hour starting at HH:00".

const FS_WET_MM=0.2;      // a model "has precipitation" in an hour from 0.2 mm
const FS_SNOW_T=0.5;      // median temperature at or below this: snow
const FS_RAIN_ICON=0.5;   // share of models with precipitation for a rain icon
const FS_POSSIBLE=0.35;   // share for "possible" precipitation in the summary
const FS_LIKELY=0.6;      // mean share in a window for a definite wording

const fsMedian=typeof median==='function'?median:require('./pure.js').median;
const fsHaversine=typeof haversineKm==='function'?haversineKm:require('./pure.js').haversineKm;

const fsNum=v=>v==null||v===''||!Number.isFinite(+v)?null:+v;
const fsKeyMs=key=>Date.parse(key.length===10?key+'T00:00Z':key.slice(0,16)+'Z');
const fsKey=ms=>new Date(ms).toISOString().slice(0,16);

// "YYYY-MM-DDTHH:00" of the current hour in the location's wall clock
function fsNowKey(nowMs,offsetSec){
  return new Date(nowMs+(offsetSec||0)*1000).toISOString().slice(0,13)+':00';
}

function fsModels(data,block){
  return Object.entries(data||{}).filter(([,m])=>m&&m[block]&&Array.isArray(m[block].time)&&m[block].time.length);
}

// Index lookup into one model's arrays for positions on the reference time axis
function fsAligner(refTime,ownTime){
  if(ownTime===refTime||(ownTime.length===refTime.length&&ownTime[0]===refTime[0]&&ownTime[ownTime.length-1]===refTime[refTime.length-1]))return i=>i;
  const at=new Map(ownTime.map((t,i)=>[t,i]));
  return i=>at.has(refTime[i])?at.get(refTime[i]):-1;
}

// Spread of a sorted list without the single most extreme value on each side
// once there are enough models, so one outlier does not decide the verdict.
function fsTrimmedRange(sorted){
  if(sorted.length<2)return null;
  const a=sorted.length>=5?sorted.slice(1,-1):sorted;
  return a[a.length-1]-a[0];
}

// Per-hour consensus over every model that has data, from the current hour on.
// rows[k] = {time,n,t,spread,p,wet,pn,cloud,prob} (null where nothing is known).
function hourlyConsensus(data,{nowMs=Date.now(),hours=50}={}){
  const models=fsModels(data,'hourly');
  if(!models.length)return {rows:[],models:0,ids:[]};
  const ref=models[0][1], time=ref.hourly.time;
  const nowKey=fsNowKey(nowMs,ref.utcOffset);
  const start=time.findIndex(t=>t>=nowKey);
  if(start<0)return {rows:[],models:models.length,ids:models.map(([id])=>id)};
  const look=models.map(([id,m])=>({id,h:m.hourly,at:fsAligner(time,m.hourly.time)}));
  const rows=[];
  for(let i=start;i<Math.min(time.length,start+hours);i++){
    const temps=[],precs=[],clouds=[],probs=[];let wetN=0;
    for(const {h,at} of look){
      const j=at(i);if(j<0)continue;
      const tv=fsNum(h.temperature_2m?.[j]);if(tv!=null)temps.push(tv);
      const pv=fsNum(h.precipitation?.[j]);if(pv!=null){precs.push(pv);if(pv>=FS_WET_MM)wetN++;}
      const cv=fsNum(h.cloud_cover?.[j]);if(cv!=null)clouds.push(cv);
      const pr=fsNum(h.precipitation_probability?.[j]);if(pr!=null)probs.push(pr);
    }
    temps.sort((a,b)=>a-b);
    rows.push({
      time:time[i], n:temps.length,
      t:fsMedian(temps), spread:fsTrimmedRange(temps),
      p:fsMedian(precs), wet:precs.length?wetN/precs.length:null, pn:precs.length,
      cloud:fsMedian(clouds), prob:fsMedian(probs),
    });
  }
  return {rows,models:models.length,ids:models.map(([id])=>id),start,time};
}

// Hour slots: slot k covers [rows[k].time, rows[k+1].time). Temperature and cloud
// at the start of the hour, precipitation from the stamp that closes it.
function hourSlots(rows){
  const out=[];
  for(let k=0;k+1<rows.length;k++){
    const a=rows[k],b=rows[k+1];
    out.push({time:a.time,end:b.time,n:a.n,t:a.t,spread:a.spread,cloud:a.cloud??b.cloud,
      p:b.p,wet:b.wet,pn:b.pn,prob:b.prob});
  }
  return out;
}

// Sunrise/sunset wall-clock strings per date, from the first model that has them
function sunTimes(data){
  const out={};
  for(const [,m] of fsModels(data,'daily')){
    const d=m.daily;
    if(!Array.isArray(d.sunrise)||!Array.isArray(d.sunset))continue;
    d.time.forEach((date,i)=>{if(!out[date]&&d.sunrise[i]&&d.sunset[i])out[date]={rise:d.sunrise[i],set:d.sunset[i]};});
  }
  return out;
}

// Night for an hour slot, judged at the middle of the hour. Unknown sun times: day.
function isNightAt(key,suns){
  const s=suns&&suns[key.slice(0,10)];
  if(!s)return false;
  const mid=key.slice(0,14)+'30';
  return mid<s.rise.slice(0,16)||mid>=s.set.slice(0,16);
}

// Icon key for an hour or a day: clear, partly, cloud, drizzle, rain, snow, night, night_partly
function skyKey({cloud=null,p=null,wet=null,t=null,night=false,daily=false}={}){
  const wetHour=daily?(p!=null&&p>=FS_WET_MM):((wet!=null&&wet>=FS_RAIN_ICON)||(p!=null&&p>=FS_WET_MM));
  if(wetHour){
    if(t!=null&&t<=FS_SNOW_T)return 'snow';
    return p!=null&&p>=(daily?1:0.5)?'rain':'drizzle';
  }
  if(cloud==null)return null;
  if(cloud>=85)return 'cloud';
  if(cloud>=30)return night?'night_partly':'partly';
  return night?'night':'clear';
}

// Daily consensus for up to maxDays days on which at least minModels models have data
function dailyConsensus(data,{nowMs=Date.now(),maxDays=10,minModels=3}={}){
  const models=fsModels(data,'daily');
  if(!models.length)return [];
  const ref=models[0][1], dates=ref.daily.time;
  const today=fsNowKey(nowMs,ref.utcOffset).slice(0,10);
  const look=models.map(([,m])=>({d:m.daily,at:fsAligner(dates,m.daily.time)}));
  const out=[];
  for(let i=0;i<dates.length&&out.length<maxDays;i++){
    if(dates[i]<today)continue;
    const mins=[],maxs=[],sums=[],probs=[],clouds=[];
    for(const {d,at} of look){
      const j=at(i);if(j<0)continue;
      const mx=fsNum(d.temperature_2m_max?.[j]),mn=fsNum(d.temperature_2m_min?.[j]);
      if(mx==null||mn==null)continue;
      maxs.push(mx);mins.push(mn);
      const ps=fsNum(d.precipitation_sum?.[j]);if(ps!=null)sums.push(ps);
      const pp=fsNum(d.precipitation_probability_max?.[j]);if(pp!=null)probs.push(pp);
      const cc=fsNum(d.cloud_cover_mean?.[j]);if(cc!=null)clouds.push(cc);
    }
    if(maxs.length<minModels)continue;
    const row={date:dates[i],offset:Math.round((fsKeyMs(dates[i])-fsKeyMs(today))/864e5),n:maxs.length,
      tmin:fsMedian(mins),tmax:fsMedian(maxs),lo:Math.min(...mins),hi:Math.max(...maxs),
      precip:fsMedian(sums),prob:fsMedian(probs),cloud:fsMedian(clouds)};
    row.snow=(row.tmin+row.tmax)/2<=FS_SNOW_T;
    row.sky=skyKey({cloud:row.cloud,p:row.precip,t:row.snow?0:10,daily:true});
    out.push(row);
  }
  return out;
}

// today | night | tomorrow | dayafter | later, relative to the location's today
function fsDayPart(key,todayKey){
  const diff=Math.round((fsKeyMs(key.slice(0,10))-fsKeyMs(todayKey))/864e5);
  const h=+key.slice(11,13);
  if(diff<=0)return 'today';
  if(diff===1)return h<6?'night':'tomorrow';
  if(diff===2)return 'dayafter';
  return 'later';
}

// Contiguous precipitation periods in the slots; one dry hour inside a period is bridged
function precipWindows(slots,todayKey){
  const wetAt=s=>s.wet!=null&&s.wet>=FS_POSSIBLE;
  const out=[];let cur=null;
  slots.forEach((s,k)=>{
    if(wetAt(s)){
      if(cur&&k-cur.last<=2){cur.last=k;}
      else{cur={first:k,last:k};out.push(cur);}
    }
  });
  const all=out.map(w=>{
    const hours=slots.slice(w.first,w.last+1);
    const wet=hours.filter(wetAt);
    const share=wet.reduce((a,s)=>a+s.wet,0)/wet.length;
    const peak=Math.max(...wet.map(s=>s.wet));
    const mm=hours.reduce((a,s)=>a+(s.p||0),0);
    const snowy=wet.filter(s=>s.t!=null&&s.t<=FS_SNOW_T).length;
    return {start:w.first,end:w.last+1,from:slots[w.first].time,to:slots[w.last].end,
      hours:w.last-w.first+1,mm:Math.round(mm*10)/10,share,peak,
      likely:share>=FS_LIKELY,snow:snowy*2>wet.length,
      day:fsDayPart(slots[w.first].time,todayKey),endDay:fsDayPart(slots[w.last].end,todayKey)};
  });
  // A single uncertain hour without any amount is noise, not a forecast
  return all.filter(w=>w.hours>1||w.peak>=FS_RAIN_ICON||w.mm>=0.1);
}

// Median of one daily variable over models for the date at offset days from today
function fsDailyMedian(data,key,offset,nowMs){
  const vals=[];
  for(const [,m] of fsModels(data,'daily')){
    const today=fsNowKey(nowMs,m.utcOffset).slice(0,10);
    const date=new Date(fsKeyMs(today)+offset*864e5).toISOString().slice(0,10);
    const j=m.daily.time.indexOf(date);
    if(j>=0)vals.push(fsNum(m.daily[key]?.[j]));
  }
  return fsMedian(vals);
}

// The structured summary. horizon: hours ahead considered for precipitation.
function forecastSummary(data,{nowMs=Date.now(),current=null,horizon=36}={}){
  const hc=hourlyConsensus(data,{nowMs,hours:Math.max(horizon,48)+2});
  const slots=hourSlots(hc.rows);
  if(!slots.length||slots[0].n<1)return {ok:false,models:hc.models};
  const models=fsModels(data,'hourly');
  const offset=models[0][1].utcOffset||0;
  const todayKey=fsNowKey(nowMs,offset).slice(0,10);
  const near=slots.slice(0,horizon);

  // Precipitation now and ahead
  const windows=precipWindows(near,todayKey);
  const curP=fsNum(current?.precipitation);
  const s0=near[0];
  const raining=(s0.wet!=null&&s0.wet>=FS_RAIN_ICON)||(curP!=null&&curP>=FS_WET_MM&&(s0.wet??0)>=0.25);
  let nowWin=null;
  if(raining)nowWin=windows[0]&&windows[0].start===0?windows[0]:{start:0,end:1,from:s0.time,to:s0.end,hours:1,mm:s0.p||0,
    share:s0.wet||0,peak:s0.wet||0,likely:false,snow:s0.t!=null&&s0.t<=FS_SNOW_T,day:'today',endDay:fsDayPart(s0.end,todayKey)};
  const later=windows.filter(w=>w!==nowWin);
  let now={t:s0.t,raining:false,snow:false,stop:null,continues:false};
  if(nowWin){
    const ended=nowWin.end<near.length;
    const after=near.slice(nowWin.end,nowWin.end+2).filter(s=>s.wet!=null);
    now={t:s0.t,raining:true,snow:nowWin.snow,continues:!ended,
      stop:ended?{time:nowWin.to,day:nowWin.endDay,sure:after.length>0&&after.every(s=>s.wet<=0.2)}:null};
  }
  const first=now.raining?null:(later[0]||null);
  const next=now.raining?(later[0]||null):(later[1]||null);
  const maxShare=Math.max(0,...near.map(s=>s.wet??0));

  // Clearing after the rain (or this evening when dry): median cloud cover below half
  let clears=false;
  const endOf=now.raining&&now.stop?nowWin.end:first?first.end:null;
  if(endOf!=null&&!(next&&next.start-endOf<=3)){
    // The hour right after the rain is skipped: clouds lag behind the precipitation
    const after=near.slice(endOf+1,endOf+4).filter(s=>s.cloud!=null);
    clears=after.length>=2&&after.reduce((a,s)=>a+s.cloud,0)/after.length<50&&after.every(s=>(s.wet??0)<FS_POSSIBLE);
  }

  // Temperatures: calendar-day medians, plus what is still ahead today and tonight
  const today={max:fsDailyMedian(data,'temperature_2m_max',0,nowMs),min:fsDailyMedian(data,'temperature_2m_min',0,nowMs)};
  const tomorrow={max:fsDailyMedian(data,'temperature_2m_max',1,nowMs),min:fsDailyMedian(data,'temperature_2m_min',1,nowMs)};
  const restToday=slots.filter(s=>s.time.slice(0,10)===todayKey&&s.t!=null).map(s=>s.t);
  const hourNow=+s0.time.slice(11,13);
  const dayAhead=hourNow<15&&restToday.length>0&&(today.max==null||Math.max(...restToday)>=today.max-1);
  const tomorrowKey=new Date(fsKeyMs(todayKey)+864e5).toISOString().slice(0,10);
  const nightTemps=slots.filter(s=>s.t!=null&&(s.time.slice(0,10)===todayKey&&+s.time.slice(11,13)>=18||s.time.slice(0,10)===tomorrowKey&&+s.time.slice(11,13)<9)).map(s=>s.t);
  const nightMin=nightTemps.length?Math.min(...nightTemps):null;
  const deltaMax=today.max!=null&&tomorrow.max!=null?tomorrow.max-today.max:null;
  const trend=deltaMax==null?null:deltaMax>=2?'warmer':deltaMax<=-2?'cooler':'same';

  // Agreement: temperature spread over 48 h and how many models show precipitation in 24 h
  const spreads=slots.slice(0,48).map(s=>s.spread).filter(v=>v!=null);
  const tempSpread=spreads.length?spreads.reduce((a,b)=>a+b,0)/spreads.length:null;
  let rainModels=0,rainOf=0;
  const rows=hc.rows.slice(1,25);
  for(const [,m] of models){
    const at=fsAligner(hc.time,m.hourly.time),pr=m.hourly.precipitation;
    if(!Array.isArray(pr))continue;
    let seen=false,wet=false;
    rows.forEach((_,k)=>{const j=at(hc.start+1+k);const v=j<0?null:fsNum(pr[j]);if(v!=null){seen=true;if(v>=FS_WET_MM)wet=true;}});
    if(seen){rainOf++;if(wet)rainModels++;}
  }
  const rainShare=rainOf?rainModels/rainOf:null;
  const name=['high','medium','low'];
  const tempLevel=tempSpread==null?0:tempSpread<2?0:tempSpread<4?1:2;
  const rainLevel=rainShare==null?0:rainShare<=0.2||rainShare>=0.8?0:rainShare<=0.35||rainShare>=0.65?1:2;
  const agreement=hc.models<2?null:{level:name[Math.max(tempLevel,rainLevel)],tempLevel:name[tempLevel],
    rainLevel:name[rainLevel],tempSpread,rainModels,rainOf,models:hc.models};

  return {ok:true,models:hc.models,todayKey,now,windows,first,next,maxShare,clears,
    today,tomorrow,deltaMax,trend,phase:dayAhead?'day':'night',restMax:restToday.length?Math.max(...restToday):null,nightMin,
    agreement};
}

// Station times go through the site's one parser (map-utils.js: Riga wall-clock time when
// there is no offset). Node tests load it directly; in the browser it is already global.
function stationTimeMs(s){
  const parse=typeof parseStationTime==='function'?parseStationTime:require('./map-utils.js').parseStationTime;
  return parse(s);
}

// Nearest station whose latest temperature reading is fresh enough and that lies within
// maxKm; a stale station nearby never hides a fresh one a little further away.
function nearestStationReading(stations,lat,lon,{nowMs=Date.now(),maxKm=25,maxAgeMin=90}={}){
  let best=null;
  for(const s of stations||[]){
    if(!s||!Number.isFinite(+s.lat)||!Number.isFinite(+s.lon)||!Array.isArray(s.history))continue;
    let h=null;
    for(let i=s.history.length-1;i>=0;i--){if(fsNum(s.history[i]?.airTemp)!=null&&s.history[i].time){h=s.history[i];break;}}
    if(!h)continue;
    const age=(nowMs-stationTimeMs(h.time))/60000;
    if(!Number.isFinite(age)||age>maxAgeMin||age<-15)continue;
    const dist=fsHaversine(lat,lon,+s.lat,+s.lon);
    if(dist>maxKm||(best&&dist>=best.dist))continue;
    best={id:s.id,name:s.name,lat:+s.lat,lon:+s.lon,dist,temp:+h.airTemp,time:h.time,ageMin:Math.max(0,Math.round(age))};
  }
  return best;
}

// Hourly air temperature of the nearest station for the temperature chart, keyed by local
// wall-clock hour like the forecast ("2026-10-09T11:00"). A station whose newest reading is
// older than maxAgeH is left out.
function stationHourly(stations,lat,lon,{nowMs=Date.now(),maxKm=25,maxAgeH=6}={}){
  let best=null;
  for(const s of stations||[]){
    if(!s||!Number.isFinite(+s.lat)||!Number.isFinite(+s.lon)||!Array.isArray(s.history))continue;
    const pts=s.history.filter(h=>h&&h.time&&fsNum(h.airTemp)!=null);
    if(!pts.length)continue;
    const age=(nowMs-stationTimeMs(pts[pts.length-1].time))/3600000;
    if(!Number.isFinite(age)||age>maxAgeH)continue;
    const dist=fsHaversine(lat,lon,+s.lat,+s.lon);
    if(dist>maxKm||(best&&dist>=best.dist))continue;
    best={id:s.id,name:s.name,dist,last:pts[pts.length-1].time,values:new Map(pts.map(h=>[String(h.time).slice(0,16),+h.airTemp]))};
  }
  return best;
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={hourlyConsensus,hourSlots,sunTimes,isNightAt,skyKey,dailyConsensus,forecastSummary,stationTimeMs,nearestStationReading,stationHourly};
}
