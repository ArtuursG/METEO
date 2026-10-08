// ─── MAP UTILITIES ──────────────────────────────────────────────────────────
// Shared by the radar, the cloud map and the environment/marine maps.
// The helpers above the browser section have no DOM or Leaflet dependency and are
// require()-able from Node (test/declutter.test.js, test/timeline.test.js).

// Indexes for the time labels under a frame slider: evenly spread, both ends included.
function timelineTickIndexes(length,count=5){
  if(!(length>1))return [0];
  const n=Math.max(2,Math.min(count,length));
  return [...new Set(Array.from({length:n},(_,i)=>Math.round(i*(length-1)/(n-1))))];
}

// ─── STATION BADGE DECLUTTER ────────────────────────────────────────────────
// points: [{id,x,y,w,h,priority}] with x/y the badge centre in screen pixels.
// Highest priority goes first; a badge is kept when its box, grown by `pad` on every
// side, does not touch a box that is already kept or one of the `blocked` areas
// (map controls drawn over the map). Returns the Set of ids that keep a full badge;
// the caller draws the rest as small dots.
function declutterBadges(points,{pad=2,blocked=[]}={}){
  const kept=blocked.filter(Boolean).map(b=>({l:b.l,t:b.t,r:b.r,b:b.b}));
  const ids=new Set();
  const order=(points||[])
    .filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))
    .sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.id).localeCompare(String(b.id)));
  for(const p of order){
    const w=(p.w||0)/2+pad,h=(p.h||0)/2+pad;
    const box={l:p.x-w,r:p.x+w,t:p.y-h,b:p.y+h};
    if(kept.some(k=>box.l<k.r&&box.r>k.l&&box.t<k.b&&box.b>k.t))continue;
    kept.push(box);ids.add(p.id);
  }
  return ids;
}

// Priority for each station on screen. Order: the selected station, the one nearest to
// the chosen place, the current extremes of the shown value (`extremes`: 'both' for
// temperatures, 'max' for wind and precipitation), then everything else by distance.
// items: [{id,dist,value}] -> Map(id -> number)
function badgePriorities(items,{selectedId=null,extremes='both'}={}){
  const list=(items||[]).filter(Boolean);
  const valued=list.filter(i=>i.value!=null&&Number.isFinite(+i.value));
  let minId=null,maxId=null;
  if(valued.length>1){
    let lo=valued[0],hi=valued[0];
    for(const i of valued){if(+i.value<+lo.value)lo=i;if(+i.value>+hi.value)hi=i;}
    if(+hi.value!==+lo.value){maxId=hi.id;if(extremes==='both')minId=lo.id;}
  }
  let nearest=null;
  for(const i of list)if(Number.isFinite(i.dist)&&(!nearest||i.dist<nearest.dist))nearest=i;
  const out=new Map();
  for(const i of list){
    let p=1e6-Math.min(Number.isFinite(i.dist)?i.dist:1e5,9e5);
    if(i.id===minId||i.id===maxId)p=2e6;
    if(nearest&&i.id===nearest.id)p=3e6;
    if(selectedId!=null&&i.id===selectedId)p=4e6;
    out.set(i.id,p);
  }
  return out;
}

// ─── STATION TIME ───────────────────────────────────────────────────────────
// LVC sends ISO times with an offset; LVĢMC sends Riga wall-clock time without one.
// Riga: UTC+2, UTC+3 from the last Sunday of March to the last Sunday of October (01:00 UTC).
function rigaOffsetMs(utcMs){
  const y=new Date(utcMs).getUTCFullYear();
  const lastSunday=month=>{const d=new Date(Date.UTC(y,month+1,0));return Date.UTC(y,month,d.getUTCDate()-d.getUTCDay(),1);};
  return (utcMs>=lastSunday(2)&&utcMs<lastSunday(9)?3:2)*3600000;
}
function parseStationTime(value){
  if(value==null||value==='')return NaN;
  if(typeof value==='number')return value;
  const s=String(value).trim();
  if(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(s))return Date.parse(s);
  const m=s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/);
  if(!m)return Date.parse(s);
  const wall=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  return wall-rigaOffsetMs(wall-2*3600000);
}

// Case and diacritic insensitive match for the station search ("riga" finds "Rīga")
function foldText(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}

// ─── BROWSER ONLY ───────────────────────────────────────────────────────────
// "pirms 6 min" style age; '' when the time is unknown
function fmtAge(ms,now=Date.now()){
  if(!Number.isFinite(ms))return '';
  const total=Math.max(0,Math.round((now-ms)/60000));
  if(total<1)return t('rad.age_now');
  if(total<60)return t('rad.age_min',{n:total});
  const h=Math.floor(total/60),m=total%60;
  return h>=6||m===0?t('rad.age_h',{h}):t('rad.age_hm',{h,m});
}
// 14:10, or "6. okt. 14:10" when not today
function fmtClock(ms){
  if(!Number.isFinite(ms))return '-';
  const d=new Date(ms),now=new Date();
  const hm=d.toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
  if(d.toDateString()===now.toDateString())return hm;
  return d.toLocaleDateString(LOCALE,{day:'numeric',month:'short'})+' '+hm;
}

const MAP_ICONS={
  expand:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  shrink:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};

// Full-screen button for a Leaflet map. `target` is the element that goes full screen
// (usually the wrapper holding the map and its overlays). Browsers without the
// Fullscreen API for ordinary elements (iPhone Safari) get a fixed, viewport-sized
// fallback instead.
const _fullscreenButtons=new Set();
function addMapFullscreen(map,target){
  const fsElement=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  const native=!!(target.requestFullscreen||target.webkitRequestFullscreen);
  const isOn=()=>fsElement()===target||target.classList.contains('is-pseudo-fs');
  let button=null;
  const label=()=>{
    if(!button)return;
    const on=isOn(),text=t(on?'rad.fs_exit':'rad.fs_open');
    button.innerHTML=on?MAP_ICONS.shrink:MAP_ICONS.expand;
    button.setAttribute('aria-label',text);button.title=text;
    button.setAttribute('aria-pressed',String(on));
  };
  const resize=()=>{label();setTimeout(()=>map.invalidateSize(),0);};
  const escape=e=>{if(e.key==='Escape'&&target.classList.contains('is-pseudo-fs'))togglePseudo(false);};
  function togglePseudo(on){
    target.classList.toggle('is-pseudo-fs',on);
    document.documentElement.classList.toggle('map-fs-lock',on);
    if(on)document.addEventListener('keydown',escape);else document.removeEventListener('keydown',escape);
    resize();
  }
  async function toggle(){
    if(!native){togglePseudo(!target.classList.contains('is-pseudo-fs'));return;}
    try{
      if(fsElement()){await (document.exitFullscreen||document.webkitExitFullscreen).call(document);}
      else{await (target.requestFullscreen||target.webkitRequestFullscreen).call(target);}
    }catch{togglePseudo(!target.classList.contains('is-pseudo-fs'));}
  }
  const Control=L.Control.extend({options:{position:'topright'},onAdd(){
    const box=L.DomUtil.create('div','leaflet-bar map-fs-control');
    button=L.DomUtil.create('button','leaflet-fullscreen',box);
    button.type='button';
    label();
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.on(button,'click',toggle);
    return box;
  }});
  map.addControl(new Control());
  document.addEventListener('fullscreenchange',resize);
  document.addEventListener('webkitfullscreenchange',resize);
  _fullscreenButtons.add(label);
  map.once('unload',()=>{
    document.removeEventListener('fullscreenchange',resize);
    document.removeEventListener('webkitfullscreenchange',resize);
    document.removeEventListener('keydown',escape);
    document.documentElement.classList.remove('map-fs-lock');
    _fullscreenButtons.delete(label);
  });
}
// Re-translates every full-screen button (language switch)
function relabelMapFullscreen(){_fullscreenButtons.forEach(fn=>fn());}

if(typeof module!=='undefined'&&module.exports){
  module.exports={timelineTickIndexes,declutterBadges,badgePriorities,parseStationTime,rigaOffsetMs,foldText};
}
