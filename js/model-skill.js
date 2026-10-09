// ─── MODEL SKILL: how close each model came to the nearest LVĢMC station ─────
// The pure part (no DOM) scores the models: measured air temperature per hour against
// the Open-Meteo value for the same hour. loadModelSkill() fetches once per station and
// keeps the result for 2 h; the temperature chart line, the picker panel and the Modeļi
// view all read it. Accuracy is information only, it never changes the default models.
// The pure helpers are require()-able from Node (test/model-skill.test.js).

const SKILL_KM=50;              // the station has to be this close to the place
const SKILL_MIN=6;              // fewest overlapping hours for a score
const SKILL_TTL=2*3600*1000;
const SKILL_PFX='skill1_';
const SKILL_AREA={s:55.5,n:58.2,w:20.8,e:28.3}; // Latvia with its border strip

const skNum=v=>v==null||v===''||!Number.isFinite(+v)?null:+v;
const skHaversine=typeof haversineKm==='function'?haversineKm:require('./pure.js').haversineKm;
// map-utils.js loads later in the browser, so look it up on use
const skRigaOffset=ms=>(typeof rigaOffsetMs==='function'?rigaOffsetMs:require('./map-utils.js').rigaOffsetMs)(ms);

const skillInArea=(lat,lon)=>lat>=SKILL_AREA.s&&lat<=SKILL_AREA.n&&lon>=SKILL_AREA.w&&lon<=SKILL_AREA.e;

// Riga wall-clock hour 'YYYY-MM-DDTHH' of an instant
function rigaHourKey(ms){return new Date(ms+skRigaOffset(ms)).toISOString().slice(0,13);}

// LVĢMC history -> {'YYYY-MM-DDTHH': airTemp}, Riga wall clock, full-hour readings only.
// The worker sends wall-clock times without an offset; a time with an offset is converted.
function skillObs(history){
  const out={};
  for(const h of history||[]){
    const v=skNum(h&&h.airTemp), s=h&&h.time!=null?String(h.time).trim():'';
    const m=s.match(/^(\d{4}-\d\d-\d\d)[T ](\d\d):(\d\d)/);
    if(v==null||!m)continue;
    let key=m[1]+'T'+m[2];
    if(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(s)){
      const ms=Date.parse(s);
      if(!Number.isFinite(ms))continue;
      key=rigaHourKey(ms);
    }
    if(m[3]==='00')out[key]=v;
  }
  return out;
}

// Open-Meteo time 'YYYY-MM-DDTHH:MM' (timezone=auto) -> Riga wall-clock hour key.
// The API uses one UTC offset for the whole series, so right after a clock change the
// earlier hours would be an hour off if compared as plain strings.
function skillHourKey(time,offsetSec){
  const s=String(time||'');
  if(skNum(offsetSec)==null)return s.slice(0,13);
  const ms=Date.parse(s.slice(0,16)+'Z')-offsetSec*1000;
  return Number.isFinite(ms)?rigaHourKey(ms):null;
}

// Mean absolute error and bias per model, best first; only models with SKILL_MIN hours.
// obs: {'YYYY-MM-DDTHH': °C} in Riga wall clock. resp: Open-Meteo response with
// hourly.time, hourly.temperature_2m_<id> and utc_offset_seconds.
function scoreModels(obs,resp,ids){
  const h=resp&&resp.hourly;
  if(!obs||!h||!Array.isArray(h.time))return [];
  const keys=h.time.map(x=>skillHourKey(x,resp.utc_offset_seconds));
  const list=ids||Object.keys(h).filter(k=>k.startsWith('temperature_2m_')).map(k=>k.slice(15));
  const rows=[];
  for(const id of list){
    const arr=h['temperature_2m_'+id];
    if(!Array.isArray(arr))continue;
    let sum=0,abs=0,n=0;
    keys.forEach((k,i)=>{
      const o=k?skNum(obs[k]):null,f=skNum(arr[i]);
      if(o==null||f==null)return;
      sum+=f-o;abs+=Math.abs(f-o);n++;
    });
    if(n>=SKILL_MIN)rows.push({id,mae:abs/n,bias:sum/n,n});
  }
  return rows.sort((a,b)=>a.mae-b.mae);
}

// The best rows: every model whose error rounds to the best one's, as on screen (0,7°)
function skillBest(rows){
  if(!Array.isArray(rows)||!rows.length)return [];
  const top=rows[0].mae.toFixed(1);
  return rows.filter(r=>r.mae.toFixed(1)===top);
}

// Nearest station within maxKm with enough full-hour readings; null outside Latvia
function pickSkillStation(stations,lat,lon,maxKm=SKILL_KM){
  if(!skillInArea(lat,lon))return null;
  let best=null;
  for(const s of stations||[]){
    if(!s||skNum(s.lat)==null||skNum(s.lon)==null||!Array.isArray(s.history))continue;
    const dist=skHaversine(lat,lon,+s.lat,+s.lon);
    if(dist>maxKm||(best&&dist>=best.dist))continue;
    const obs=skillObs(s.history);
    if(Object.keys(obs).length<SKILL_MIN)continue;
    best={station:{id:String(s.id),name:String(s.name||s.id),lat:+s.lat,lon:+s.lon},dist,obs};
  }
  return best;
}

// ─── LOADER (browser) ───────────────────────────────────────────────────────
// _skill: {key,status,...} for the place in key. status: ok | none | few | failed
let _skill=null;
const _skillMem=new Map(),_skillJobs=new Map(),_skillFailed=new Map();
const skillPlace=()=>S.lat.toFixed(3)+','+S.lon.toFixed(3);

function skillRead(id){
  if(_skillMem.has(id))return _skillMem.get(id);
  try{
    const v=JSON.parse(localStorage.getItem(SKILL_PFX+id)||'null');
    if(v&&Array.isArray(v.rows)&&v.resp){_skillMem.set(id,v);return v;}
  }catch{}
  return null;
}
function skillWrite(id,item){
  _skillMem.set(id,item);
  try{
    // Old entries of other stations go, so storage stays small
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);
      if(!k||!k.startsWith(SKILL_PFX)||k===SKILL_PFX+id)continue;
      let ts=0;try{ts=JSON.parse(localStorage.getItem(k)).ts;}catch{}
      if(!(Date.now()-ts<SKILL_TTL))localStorage.removeItem(k);
    }
    localStorage.setItem(SKILL_PFX+id,JSON.stringify(item));
  }catch{}
}

// One Open-Meteo request per station, shared by every caller and kept for SKILL_TTL
function skillForStation(pick){
  const id=pick.station.id,hit=skillRead(id);
  if(hit&&Date.now()-hit.ts<SKILL_TTL)return Promise.resolve(hit);
  if(_skillJobs.has(id))return _skillJobs.get(id);
  if(Date.now()-(_skillFailed.get(id)||0)<60000)return Promise.reject(new Error('retry later'));
  const ids=MODELS.map(m=>m.id);
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${pick.station.lat}&longitude=${pick.station.lon}`
    +`&models=${ids.join(',')}&hourly=temperature_2m&past_days=2&forecast_days=1&timezone=auto`;
  const job=(async()=>{
    const opt={};
    try{if(AbortSignal.timeout)opt.signal=AbortSignal.timeout(20000);}catch{}
    const r=await fetch(url,opt);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(!Array.isArray(j?.hourly?.time))throw new Error('no hourly data');
    const hourly={time:j.hourly.time};
    for(const k of ids.map(id=>'temperature_2m_'+id))if(Array.isArray(j.hourly[k]))hourly[k]=j.hourly[k];
    const resp={hourly,utc_offset_seconds:j.utc_offset_seconds};
    const item={ts:Date.now(),station:pick.station,obs:pick.obs,resp,rows:scoreModels(pick.obs,resp,ids)};
    skillWrite(id,item);
    return item;
  })();
  _skillJobs.set(id,job);
  job.catch(()=>_skillFailed.set(id,Date.now())).finally(()=>_skillJobs.delete(id));
  return job;
}

async function skillState(lat,lon){
  if(!skillInArea(lat,lon))return {status:'none'};
  await ensureLvgmcStations(); // shared live answer, asks again only after the worker's next run
  if(!_lvgmcStations.length)return {status:'failed'};
  const pick=pickSkillStation(_lvgmcStations,lat,lon);
  if(!pick)return {status:'none'};
  const item=await skillForStation(pick);
  return {status:item.rows.length?'ok':'few',station:item.station,dist:pick.dist,rows:item.rows,resp:item.resp,obs:item.obs};
}

// Compares the models for the current place (or reuses the result). Resolves to the
// result, or to null when the place changed meanwhile; never rejects.
async function loadModelSkill(){
  const key=skillPlace();
  let res;
  try{res=await skillState(S.lat,S.lon);}
  catch(e){console.warn('[skill]',e?.message||e);res={status:'failed'};}
  if(key!==skillPlace())return null;
  _skill={key,...res};
  renderSkillLine();
  if(_pickerOpen.active)buildModelPicker('active');
  return _skill;
}

// The result for the place on screen, only when there is something to show
function skillNow(){return _skill&&_skill.status==='ok'&&_skill.key===skillPlace()?_skill:null;}

// "GEM un CMA GRAPES"
function skillNames(models){
  const names=models.map(m=>m.name);
  try{return new Intl.ListFormat(LOCALE,{type:'conjunction'}).format(names);}catch{return names.join(', ');}
}

// One quiet line under the temperature chart; hidden while there is no result
function renderSkillLine(){
  const el=$('tempSkill');
  if(!el)return;
  const s=Object.keys(S.data).length?skillNow():null;
  // Models that tie on the rounded error are all named
  const best=s?skillBest(s.rows).map(r=>MODELS.find(m=>m.id===r.id)).filter(Boolean):[];
  if(!best.length){el.hidden=true;el.replaceChildren();return;}
  const had=el.contains(document.activeElement)?document.activeElement.dataset.k:null;
  const btn=(k,label,title,fn)=>{const b=pickerNode('button',null,t(label));b.type='button';b.dataset.k=k;b.title=title;b.onclick=fn;return b;};
  const parts=[pickerNode('span','ch-skill-text',t('ch.skill_line',{model:skillNames(best),err:fmtTemp(s.rows[0].mae,1),
    station:s.station.name,km:fmtNum(s.dist,s.dist<10?1:0)}))];
  parts.push(btn('compare','ch.skill_compare',t('ch.skill_compare_title'),()=>{
    openTab('about');
    $('tab-about')?.focus({preventScroll:true});
  }));
  const add=best.filter(m=>!S.active.has(m.id)&&S.data[m.id]);
  if(add.length)parts.push(btn('show','ch.skill_show',t('ch.skill_show_title',{model:skillNames(add)}),()=>{
    add.forEach(m=>S.active.add(m.id));saveModelSet('active');rebuildTempChart();
    $('tempPicker')?.querySelector(`[data-k="chip:${add[0].id}"]`)?.focus();
  }));
  el.replaceChildren(...parts);
  el.hidden=false;
  if(had)(el.querySelector(`[data-k="${had}"]`)||el.querySelector('button'))?.focus();
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={skillInArea,rigaHourKey,skillObs,skillHourKey,scoreModels,skillBest,pickSkillStation,SKILL_MIN,SKILL_KM};
}
