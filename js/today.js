// ─── TODAY: summary sentence, nearest station, hourly strip, daily list ─────
// Reads S.data through the pure helpers in forecast-summary.js (road-ice.js and
// forecast-change.js for the road and "forecast changed" lines); all text via t().

// Opens a panel by name (kept for the "Detalizēta tabula" button)
function openTab(name){switchTab(name);document.getElementById('navSub')?.scrollIntoView?.({block:'nearest'});}

const hhmm=key=>key.slice(11,16);
// A window that runs past midnight (or for a day or more) is told by its start and length
const crossesMidnight=w=>new Date(Date.parse(w.to+'Z')-60000).toISOString().slice(0,10)!==w.from.slice(0,10);
const hourRange=(a,b)=>`${+a.slice(11,13)}–${+b.slice(11,13)===0?24:+b.slice(11,13)}`;

function dayWord(day){return t('today.day_'+day);}

// One or two sentences: precipitation first, then temperature
function summaryText(s){
  if(!s?.ok)return '';
  const parts=[];
  const kind=w=>t(w.snow?'today.snow':'today.rain');
  if(s.now.raining){
    const what=t(s.now.snow?'today.snowing':'today.raining');
    if(s.now.stop){
      const at=t('today.at',{time:hhmm(s.now.stop.time)});
      const when=s.now.stop.day==='today'?at:`${dayWord(s.now.stop.day)} ${at}`;
      parts.push(t(s.now.stop.sure?'today.stops':'today.may_stop',{what,when}));
    }else parts.push(t('today.continues',{what}));
  }else if(s.first){
    const w=s.first,withMm=w.mm>=0.5&&w.likely?'_mm':'';
    const vars={day:dayWord(w.day),kind:kind(w),mm:fmtNum(w.mm,w.mm<10?1:0)};
    if(crossesMidnight(w))parts.push(t((w.likely?'today.long':'today.long_possible')+withMm,{...vars,at:t('today.at',{time:hhmm(w.from)}),h:w.hours}));
    else parts.push(t((w.likely?'today.expected':'today.possible')+withMm,{...vars,hours:hourRange(w.from,w.to)}));
  }else parts.push(t('today.dry'));
  if(s.clears&&!s.now.continues)parts.push(t('today.clears'));

  const tmax=s.tomorrow.max;
  if(s.phase==='day'&&s.restMax!=null){
    parts.push(t('today.day_temp',{max:fmtTemp(s.restMax),min:fmtTemp(s.nightMin)}));
    if(s.trend==='warmer'||s.trend==='cooler')parts.push(t('today.trend_'+s.trend,{max:fmtTemp(tmax)}));
  }else if(s.nightMin!=null){
    const trend=s.trend==='warmer'||s.trend==='cooler'?t('today.tomorrow_'+s.trend):t('today.tomorrow');
    parts.push(t('today.night_temp',{min:fmtTemp(s.nightMin),tomorrow:trend,max:fmtTemp(tmax)}));
  }
  return parts.map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');
}

function renderAgreement(s){
  const el=$('nowAgree');
  if(!el)return;
  const a=s?.agreement;
  if(!a){el.hidden=true;return;}
  el.hidden=false;
  el.dataset.level=a.level;
  el.textContent=t('today.agree_'+a.level);
  const bits=[];
  if(a.tempSpread!=null)bits.push(t('today.agree_temp',{n:fmtNum(a.tempSpread/2,1)}));
  if(a.rainOf)bits.push(t('today.agree_rain',{n:a.rainModels,of:a.rainOf}));
  el.title=bits.join(', ');
}

// The LVĢMC and LVC stations only help in and around Latvia
const nearLatvia=()=>S.lat>=55.5&&S.lat<=58.2&&S.lon>=20.8&&S.lon<=28.3;

// Nearest LVĢMC station: only near Latvia, loaded once, never blocks the hero
let _stationReq=0;
async function renderNearestStation(){
  const el=$('nowStation');
  if(!el)return;
  const id=++_stationReq;
  const show=r=>{
    if(!r){el.hidden=true;return;}
    el.hidden=false;
    el.textContent=t('today.station',{name:r.name,km:fmtNum(r.dist,r.dist<10?1:0),temp:fmtTemp(r.temp,1),
      ago:r.ageMin<1?t('reltime.just_now'):t('reltime.min_ago',{n:r.ageMin})});
  };
  if(!nearLatvia()||typeof ensureLvgmcStations!=='function'){show(null);return;}
  if(!_lvgmcStations.length){
    show(null);
    try{await ensureLvgmcStations();}catch{}
    if(id!==_stationReq)return;
  }
  show(nearestStationReading(_lvgmcStations,S.lat,S.lon));
}

// ─── Road surface from the LVC road stations ───
// +0,6° / −1,4°: the sign matters this close to freezing
const signedTemp=v=>{const r=Math.round(v*10)/10;return (r>0?'+':'')+fmtTemp(r,1);};
// Latvian numbers ending in 1 (but not 11) take the singular
const lvSingular=n=>n%10===1&&n%100!==11;

function roadText(r){
  const c=r.coldest;
  const coldest=c?t(r.total>1?'today.road_coldest':'today.road_named',{name:c.name,temp:signedTemp(c.surfaceTemp)}):'';
  if(r.level==='near')return t('today.road_near',{coldest});
  const all=r.count===r.total;
  const where=r.total===1?t('today.road_single')
    :all&&r.total===2?t('today.road_both')
    :all&&!lvSingular(r.total)?t('today.road_all',{n:r.count})
    :all?t('today.road_all_one',{n:r.count})
    :t(lvSingular(r.total)?'today.road_of_one':'today.road_of',{n:r.count,total:r.total});
  // Only reported frost, ice or snow (no surface measured at or below 0): say just that
  const what=r.frost===r.count?'today.road_cond':r.frost?'today.road_frost':'today.road_below';
  return t('today.road_ice',{where,what:t(what),coldest});
}

// Road ice needs a cold night or day: below this forecast minimum the road stations are not even asked
const ROAD_COLD_T=4;
function roadWeatherCold(){
  try{
    const now=fsNum((S.data['ecmwf_ifs025']||Object.values(S.data)[0])?.current?.temperature_2m);
    const lows=dailyConsensus(S.data,{maxDays:2}).map(r=>r.tmin);
    return [now,...lows].some(v=>v!=null&&v<=ROAD_COLD_T);
  }catch{return false;}
}

// Draws the line from the stations already loaded; radar.js calls it again after every LVC refresh
function showRoad(){
  const el=$('nowRoad');
  if(!el)return;
  let r=null;
  if(nearLatvia()&&Object.keys(S.data).length&&roadWeatherCold()){
    try{r=roadIceSummary(_lvcStations,S.lat,S.lon);}catch(e){console.warn('[today] road',e);}
  }
  el.hidden=!r;
  if(!r)return;
  el.dataset.level=r.level;
  el.textContent=roadText(r);
  el.title=t('today.road_open');
}

// Loads after the main render and never blocks it; a late answer for an old place is dropped
let _roadReq=0;
async function renderRoad(){
  const id=++_roadReq;
  showRoad();
  if(!nearLatvia()||typeof ensureLvcStations!=='function'||!roadWeatherCold())return;
  try{await ensureLvcStations();}catch{}
  if(id!==_roadReq)return;
  showRoad();
}

// ─── Forecast change since the previous visit ───
// A few consensus snapshots per place (two decimals, about 1 km) in localStorage
const CHANGE_PFX='fc1_';
const changeKey=(lat,lon)=>`${CHANGE_PFX}${lat.toFixed(2)}_${lon.toFixed(2)}`;
function readSnapshots(lat,lon){
  try{const v=JSON.parse(localStorage.getItem(changeKey(lat,lon))||'[]');return Array.isArray(v)?v:[];}catch{return [];}
}

// loadAll() calls this only for data fresh from the API, never for the cached copy,
// so every snapshot stands for a real fetch at S.dataTs
function saveForecastSnapshot(lat,lon){
  try{
    const snap=snapshotFromDaily(dailyConsensus(S.data,{maxDays:3}),S.dataTs);
    if(!snap.days.length)return;
    localStorage.setItem(changeKey(lat,lon),JSON.stringify(addSnapshot(readSnapshots(lat,lon),snap)));
    pruneSnapshots();
  }catch{}
}
// Places not opened for four days are forgotten
function pruneSnapshots(){
  const old=Date.now()-4*864e5,drop=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k?.startsWith(CHANGE_PFX))continue;
    let last=0;
    try{last=Math.max(0,...JSON.parse(localStorage.getItem(k)).map(s=>+s?.ts||0));}catch{}
    if(last<old)drop.push(k);
  }
  drop.forEach(k=>localStorage.removeItem(k));
}

// "07:10", "vakar 18:40", else the weekday (the visitor's own clock)
function sinceText(ts){
  const d=new Date(ts),time=d.toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
  const days=Math.round((new Date().setHours(0,0,0,0)-new Date(ts).setHours(0,0,0,0))/864e5);
  if(days<=0)return t('today.since_today',{time});
  if(days===1)return t('today.since_yesterday',{time});
  return t('today.since_day',{day:t('today.wd_'+d.getDay()),time});
}

const CHANGE_DAYS=['today','tomorrow','dayafter'];
const changeKind=c=>c.kind==='tmax'?(c.delta>0?'warmer':'cooler')
  :c.kind==='tmin'?(c.delta>0?'min_up':'min_down')
  :(c.snow?'snow':'rain')+c.kind.slice(6);   // precip_new -> rain_new

// The chosen changes are told day by day, temperature first, naming each day once:
// "rīt par 3° siltāks, lietus vairs nav gaidāms"; different days are split by a semicolon
function changeText(changes,ts,rows){
  const offset=new Map(rows.map(r=>[r.date,r.offset]));
  const isTemp=c=>c.kind==='tmax'||c.kind==='tmin';
  let list='',last=null;
  for(const c of changes.slice().sort((a,b)=>a.date.localeCompare(b.date)||isTemp(b)-isTemp(a))){
    const day=CHANGE_DAYS[offset.get(c.date)];
    if(!day)continue;
    const same=c.date===last;
    const part=t('today.chg_'+changeKind(c),{day:same?'':dayWord(day),n:Math.abs(c.delta),mm:fmtNum(c.mm,c.mm<10?1:0)});
    list+=(list?(same?', ':'; '):'')+part.replace(/\s+([,.])/g,'$1').replace(/\s{2,}/g,' ').trim();
    last=c.date;
  }
  return list?t('today.chg',{when:sinceText(ts),list}):'';
}

// From 15:00 today's sum is mostly rain that has fallen or not, so it is left out
const CHANGE_LATE_H=15;
function renderChange(){
  const el=$('nowChange');
  if(!el)return;
  let text='';
  try{
    const rows=dailyConsensus(S.data,{maxDays:3});
    const base=pickBaseline(readSnapshots(S.lat,S.lon),S.dataTs||Date.now());
    const hour=new Date(Date.now()+(Object.values(S.data)[0]?.utcOffset||0)*1000).getUTCHours();
    const noPrecip=hour>=CHANGE_LATE_H?rows.filter(r=>r.offset===0).map(r=>r.date):[];
    if(base)text=changeText(compareForecasts(base,snapshotFromDaily(rows,S.dataTs),{noPrecip}),base.ts,rows);
  }catch(e){console.warn('[today] change',e);}
  el.textContent=text;
  el.hidden=!text;
}

function iconFor(key){return key?(WICONS[key]||''):'';}

function renderHours(){
  const wrap=$('todayHours');
  if(!wrap)return;
  const suns=sunTimes(S.data);
  const slots=hourSlots(hourlyConsensus(S.data,{hours:26}).rows).slice(0,24);
  wrap.replaceChildren();
  slots.forEach((s,k)=>{
    const key=skyKey({cloud:s.cloud,p:s.p,wet:s.wet,t:s.t,night:isNightAt(s.time,suns)});
    const cell=document.createElement('div');
    cell.className='hr'+(k===0?' hr-now':'');
    cell.setAttribute('role','listitem');
    const time=document.createElement('span');time.className='hr-time';
    time.textContent=k===0?t('today.now'):s.time.slice(11,13);
    const icon=document.createElement('span');icon.className='wi wi-'+(key||'none');icon.innerHTML=iconFor(key);
    const temp=document.createElement('span');temp.className='hr-temp mono';temp.textContent=fmtTemp(s.t);
    const bar=document.createElement('span');bar.className='hr-bar';
    const fill=document.createElement('i');fill.style.height=s.p>0?Math.max(2,Math.min(18,s.p*9))+'px':'0';
    bar.append(fill);
    const prob=document.createElement('span');prob.className='hr-prob mono';
    prob.textContent=s.prob!=null&&s.prob>=20?Math.round(s.prob)+'%':'';
    cell.append(time,icon,temp,bar,prob);
    cell.setAttribute('aria-label',`${k===0?t('today.now'):s.time.slice(11,16)}: ${fmtTemp(s.t)}${key?', '+t('wx.'+key):''}${prob.textContent?', '+t('today.prob_aria',{n:prob.textContent}):''}`);
    wrap.append(cell);
  });
}

function dayLabel(d){
  if(d.offset===0)return t('today.today');
  if(d.offset===1)return t('today.tomorrow_short');
  const date=new Date(d.date+'T12:00:00Z');
  const wd=date.toLocaleDateString(LOCALE,{weekday:'short',timeZone:'UTC'});
  return wd.charAt(0).toUpperCase()+wd.slice(1).replace(/\.$/,'');
}

function renderDays(){
  const wrap=$('todayDays');
  if(!wrap)return;
  const days=dailyConsensus(S.data,{maxDays:10});
  wrap.replaceChildren();
  if(!days.length)return;
  const lo=Math.floor(Math.min(...days.map(d=>d.lo))),hi=Math.ceil(Math.max(...days.map(d=>d.hi)));
  const pos=v=>((v-lo)/Math.max(1,hi-lo)*100).toFixed(2)+'%';
  for(const d of days){
    const row=document.createElement('div');row.className='day';row.setAttribute('role','listitem');
    const name=document.createElement('span');name.className='day-name';name.textContent=dayLabel(d);
    if(d.offset>1){const sub=document.createElement('small');sub.textContent=new Date(d.date+'T12:00:00Z').toLocaleDateString(LOCALE,{day:'numeric',month:'numeric',timeZone:'UTC'});name.append(sub);}
    const icon=document.createElement('span');icon.className='wi wi-'+(d.sky||'none');icon.innerHTML=iconFor(d.sky);
    const prob=document.createElement('span');prob.className='day-prob mono';
    prob.textContent=d.prob!=null&&d.prob>=20?Math.round(d.prob)+'%':'';
    const mn=document.createElement('span');mn.className='day-min mono';mn.textContent=fmtTemp(d.tmin);
    const bar=document.createElement('span');bar.className='day-bar';
    const spread=document.createElement('i');spread.className='day-spread';
    spread.style.left=pos(d.lo);spread.style.width=`calc(${pos(d.hi)} - ${pos(d.lo)})`;
    const range=document.createElement('i');range.className='day-range';
    range.style.left=pos(d.tmin);range.style.width=`max(4px, calc(${pos(d.tmax)} - ${pos(d.tmin)}))`;
    range.style.background=`linear-gradient(90deg,${tempColor(d.tmin)},${tempColor(d.tmax)})`;
    bar.append(spread,range);
    const mx=document.createElement('span');mx.className='day-max mono';mx.textContent=fmtTemp(d.tmax);
    row.append(name,icon,prob,mn,bar,mx);
    row.title=t('today.day_title',{lo:fmtTemp(d.lo),hi:fmtTemp(d.hi),n:d.n});
    row.setAttribute('aria-label',`${dayLabel(d)}: ${fmtTemp(d.tmin)} … ${fmtTemp(d.tmax)}${d.sky?', '+t('wx.'+d.sky):''}${prob.textContent?', '+t('today.prob_aria',{n:prob.textContent}):''}. ${row.title}`);
    wrap.append(row);
  }
  const meta=$('todayDaysMeta');
  if(meta)meta.textContent=t('today.days_meta',{n:days.length});
}

// The first load failed: say so where people look first (Today is the default view)
function renderTodayError(){
  const msg=t('err.load_failed');
  if($('curDesc'))$('curDesc').textContent=msg;
  const box=(withRetry)=>{
    const p=document.createElement('div');p.className='err';p.textContent=msg;
    if(!withRetry)return [p];
    const b=document.createElement('button');b.type='button';b.className='mt';b.textContent=t('env.retry');b.onclick=()=>loadAll();
    return [p,b];
  };
  $('todayHours')?.replaceChildren(...box(false));
  $('todayDays')?.replaceChildren(...box(true));
}

function renderToday(){
  if(!Object.keys(S.data).length)return;
  let s=null;
  try{s=forecastSummary(S.data,{current:(S.data['ecmwf_ifs025']||Object.values(S.data)[0])?.current});}catch(e){console.warn('[today] summary',e);}
  const sum=$('nowSummary');
  if(sum){sum.textContent=summaryText(s);sum.hidden=!sum.textContent;}
  renderAgreement(s);
  renderHours();
  renderDays();
  renderNearestStation();
  renderRoad();
  renderChange();
}
