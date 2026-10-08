// ─── TIMELINE ───────────────────────────────────────────────────────────────
// One frame scrubber for the radar and the cloud map, drawn over the bottom of the map.
// The helpers at the top are pure and require()-able from Node (test/timeline.test.js);
// createTimeline() builds the DOM and only runs in the browser.

const TIMELINE_SPEEDS=[0.5,1,2];

// 0,5× -> 1× -> 2× -> 0,5×; anything unknown goes back to 1×
function nextTimelineSpeed(speed){
  const i=TIMELINE_SPEEDS.indexOf(speed);
  return i<0?1:TIMELINE_SPEEDS[(i+1)%TIMELINE_SPEEDS.length];
}

function timelineDelay(baseMs,speed){return Math.round(baseMs/(speed>0?speed:1));}

// Newest frame that is not in the future; the first one when every frame is (forecasts).
// times: ascending epoch ms. -1 for an empty list.
function nowFrameIndex(times,now=Date.now()){
  if(!times||!times.length)return -1;
  let idx=-1;
  for(let i=0;i<times.length;i++)if(times[i]<=now)idx=i;
  return idx<0?0:idx;
}

// Frame list refreshed: stay on the newest frame when the viewer was there (or had
// nothing yet), otherwise keep the same timestamp, or the closest one if it dropped out.
function mergeFrameIndex(oldTimes,oldIdx,newTimes,followLatest){
  if(!newTimes||!newTimes.length)return -1;
  const last=newTimes.length-1;
  if(!oldTimes||!oldTimes.length||oldIdx==null||oldIdx<0||oldIdx>=oldTimes.length)return last;
  if(followLatest??oldIdx===oldTimes.length-1)return last;
  const at=oldTimes[oldIdx];
  const same=newTimes.indexOf(at);
  if(same>=0)return same;
  let best=0;
  for(let i=1;i<newTimes.length;i++)if(Math.abs(newTimes[i]-at)<Math.abs(newTimes[best]-at))best=i;
  return best;
}

// Which frame keys need a new layer and which layers can go
function diffFrameKeys(oldKeys,newKeys){
  const before=new Set(oldKeys||[]),after=new Set(newKeys||[]);
  return {added:[...after].filter(k=>!before.has(k)),removed:[...before].filter(k=>!after.has(k))};
}

// Frames that get a tick mark on the rail. Long lists (hourly forecasts) are thinned to
// at most `max` marks; the last frame always has one.
function frameMarkIndexes(length,max=48){
  if(!(length>0))return [];
  if(length===1)return [0];
  const step=Math.max(1,Math.ceil((length-1)/(Math.max(2,max)-1)));
  const out=[];
  for(let i=0;i<length;i+=step)out.push(i);
  if(out[out.length-1]!==length-1)out.push(length-1);
  return out;
}

// How many time labels to put under the rail so they land on evenly spaced frames:
// the largest count up to `max` that divides the list exactly; long lists may be a
// frame off, short ones fall back to start, middle and end.
function timelineLabelCount(length,max=5){
  if(!(length>1))return 1;
  const top=Math.min(max,length);
  for(let c=top;c>=3;c--)if((length-1)%(c-1)===0)return c;
  return length-1>=2*(top-1)?top:Math.min(3,length);
}

// Typical gap between frames in whole minutes (median), null when unknown
function frameStepMinutes(times){
  if(!times||times.length<2)return null;
  const gaps=[];
  for(let i=1;i<times.length;i++)gaps.push(times[i]-times[i-1]);
  gaps.sort((a,b)=>a-b);
  const mid=gaps[gaps.length>>1];
  return mid>0?Math.round(mid/60000):null;
}

// ─── DOM ────────────────────────────────────────────────────────────────────
const TIMELINE_ICONS={
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/></svg>',
  prev:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg>',
  next:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg>',
};

// opts:
//   formatTime(ms)    label next to the slider ("14:10")
//   formatTick(ms)    labels under the rail (defaults to formatTime)
//   formatValue(ms)   aria-valuetext (defaults to formatTime)
//   onChange(index)   the shown frame changed (slider, buttons, playback)
//   latestIndex(times) frame for the "latest" button (default: the last one)
//   latestKey         i18n key for that button, or a function returning one
//   labelKey          i18n key for the slider's accessible name
//   baseDelay         ms per frame at 1× (default 600); the last frame is held 3× longer
function createTimeline(opts={}){
  const o={baseDelay:600,holdLast:3,labelCount:5,latestKey:'rad.tl_latest',labelKey:'rad.tl_time',...opts};
  const fmt=o.formatTime||(ms=>String(ms));
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
  const button=(cls,html)=>{const b=make('button','timeline-btn '+cls);b.type='button';if(html)b.innerHTML=html;return b;};

  const root=make('div','timeline');root.setAttribute('role','group');
  const row=make('div','timeline-row');
  const start=make('div','timeline-btns');
  const play=button('timeline-play',TIMELINE_ICONS.play);
  const prev=button('timeline-step',TIMELINE_ICONS.prev);
  const next=button('timeline-step',TIMELINE_ICONS.next);
  start.append(play,prev,next);
  const clock=make('output','timeline-time','-');
  const track=make('div','timeline-track');
  const rail=make('div','timeline-rail'),fill=make('div','timeline-fill');rail.append(fill);
  const marks=make('div','timeline-marks');marks.setAttribute('aria-hidden','true');
  const range=make('input','timeline-range');range.type='range';range.min='0';range.max='0';range.step='1';range.value='0';
  const ticks=make('div','timeline-labels');ticks.setAttribute('aria-hidden','true');
  track.append(rail,marks,range,ticks);
  const end=make('div','timeline-btns timeline-btns-end');
  const speedBtn=button('timeline-speed');
  const latest=button('timeline-latest');
  end.append(speedBtn,latest);
  row.append(start,clock,track,end);
  const status=make('div','timeline-status');
  const statusMain=make('span','timeline-status-main');
  const dot=make('i','timeline-dot');dot.setAttribute('aria-hidden','true');
  const statusText=make('span');
  statusMain.append(dot,statusText);
  const statusSide=make('span','timeline-status-side');
  status.append(statusMain,statusSide);
  root.append(row,status);

  let times=[],idx=-1,timer=null,speed=1,disabled=true;

  const latestIdx=()=>o.latestIndex?o.latestIndex(times):times.length-1;
  const pct=i=>times.length>1?100*i/(times.length-1):0;

  function render(){
    const has=times.length>0&&idx>=0;
    const off=disabled||!has;
    range.disabled=off;prev.disabled=off||idx<=0;next.disabled=off||idx>=times.length-1;
    play.disabled=off||times.length<2;latest.disabled=off;speedBtn.disabled=off||times.length<2;
    range.max=String(Math.max(0,times.length-1));
    if(has)range.value=String(idx);
    fill.style.width=(has?pct(idx):0)+'%';
    clock.textContent=has?fmt(times[idx]):'-';
    range.setAttribute('aria-valuetext',has?(o.formatValue||fmt)(times[idx]):'-');
    play.innerHTML=timer?TIMELINE_ICONS.pause:TIMELINE_ICONS.play;
    play.setAttribute('aria-pressed',String(!!timer));
    latest.setAttribute('aria-pressed',String(has&&idx===latestIdx()));
    speedBtn.textContent=(typeof fmtNum==='function'?fmtNum(speed,speed%1?1:0):String(speed))+'×';
    speedBtn.setAttribute('aria-label',t('rad.tl_speed',{v:speedBtn.textContent}));
  }
  function relabel(){
    root.setAttribute('aria-label',t('rad.tl_aria'));
    range.setAttribute('aria-label',t(o.labelKey));
    play.setAttribute('aria-label',t('rad.tl_play'));play.title=t('rad.tl_play');
    prev.setAttribute('aria-label',t('rad.tl_prev'));prev.title=t('rad.tl_prev');
    next.setAttribute('aria-label',t('rad.tl_next'));next.title=t('rad.tl_next');
    latest.textContent=t(typeof o.latestKey==='function'?o.latestKey():o.latestKey);
    renderTicks();render();
  }
  function renderTicks(){
    marks.replaceChildren();ticks.replaceChildren();
    if(times.length<2)return;
    for(const i of frameMarkIndexes(times.length)){const m=make('i');m.style.left=pct(i)+'%';marks.append(m);}
    for(const i of timelineTickIndexes(times.length,timelineLabelCount(times.length,o.labelCount))){
      const s=make('span',null,(o.formatTick||fmt)(times[i]));
      s.style.left=pct(i)+'%';s.style.transform=`translateX(-${pct(i)}%)`;
      ticks.append(s);
    }
  }
  function setIndex(i,emit=true){
    if(!times.length)return;
    idx=Math.max(0,Math.min(times.length-1,i|0));
    render();
    if(emit&&o.onChange)o.onChange(idx);
  }
  function schedule(){
    clearTimeout(timer);
    const hold=idx>=times.length-1?o.holdLast:1;
    timer=setTimeout(()=>{
      timer=null;
      if(times.length<2){render();return;}
      setIndex(idx>=times.length-1?0:idx+1);
      schedule();
    },timelineDelay(o.baseDelay,speed)*hold);
    render();
  }
  function startPlay(){
    if(timer||disabled||times.length<2)return;
    if(idx>=times.length-1)setIndex(0);
    schedule();
  }
  function pause(){
    if(timer){clearTimeout(timer);timer=null;}
    render();
  }

  play.addEventListener('click',()=>timer?pause():startPlay());
  prev.addEventListener('click',()=>{pause();setIndex(idx-1);});
  next.addEventListener('click',()=>{pause();setIndex(idx+1);});
  latest.addEventListener('click',()=>{pause();setIndex(latestIdx());});
  speedBtn.addEventListener('click',()=>{speed=nextTimelineSpeed(speed);if(timer)schedule();else render();});
  range.addEventListener('input',()=>{pause();setIndex(Number(range.value));});
  // Space toggles playback when the slider has focus (arrow keys already step frames)
  range.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();timer?pause():startPlay();}});
  // Leaflet must not turn clicks and drags on the overlay into map pans or zooms
  if(typeof L!=='undefined'&&L.DomEvent){L.DomEvent.disableClickPropagation(root);L.DomEvent.disableScrollPropagation(root);}

  relabel();

  return {
    el:root,
    // New frame list (ascending epoch ms). Playback keeps running; nothing is emitted.
    setFrames(list,index){
      times=(list||[]).slice();
      disabled=!times.length;
      idx=times.length?Math.max(0,Math.min(times.length-1,index??times.length-1)):-1;
      if(times.length<2)pause();
      renderTicks();render();
    },
    setIndex,
    index:()=>idx,
    isLatest:()=>times.length>0&&idx===latestIdx(),
    play:startPlay,
    pause,
    isPlaying:()=>!!timer,
    setDisabled(v){disabled=!!v||!times.length;if(disabled)pause();render();},
    // Status line: text on the left with a tone dot ('ok' | 'warn' | 'bad' | ''),
    // and a short note or a DOM node on the right.
    setStatus(text,tone=''){statusText.textContent=text||'';dot.className='timeline-dot'+(tone?' is-'+tone:'');dot.hidden=!tone;},
    setSide(content){statusSide.replaceChildren();if(content==null)return;if(typeof content==='string')statusSide.textContent=content;else statusSide.append(content);},
    relabel,
  };
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={TIMELINE_SPEEDS,nextTimelineSpeed,timelineDelay,nowFrameIndex,mergeFrameIndex,diffFrameKeys,frameMarkIndexes,timelineLabelCount,frameStepMinutes};
}
