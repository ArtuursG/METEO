// ─── TODAY: summary sentence, nearest station, hourly strip, daily list ─────
// Reads S.data through the pure helpers in forecast-summary.js; all text via t().

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
  if(S.lat<55.5||S.lat>58.2||S.lon<20.8||S.lon>28.3||typeof ensureLvgmcStations!=='function'){show(null);return;}
  if(!_lvgmcStations.length){
    show(null);
    try{await ensureLvgmcStations();}catch{}
    if(id!==_stationReq)return;
  }
  show(nearestStationReading(_lvgmcStations,S.lat,S.lon));
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
}
