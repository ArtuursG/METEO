// ─── MODELS ───────────────────────────────────────────────────────────────────
// id: Open-Meteo model identifier | res: grid resolution | days: forecast horizon
// dash: Chart.js borderDash pattern (empty = solid line)
const MODELS = [
  { id:'ecmwf_ifs025',              name:'ECMWF IFS',    flag:'🇪🇺', org:'ECMWF',               res:'9km',   days:10, color:'#2a78d6', dash:[] },
  { id:'ecmwf_aifs025',            name:'ECMWF AIFS',   flag:'🇪🇺', org:'ECMWF (AI)',           res:'25km',  days:10, color:'#29b6f6', dash:[] },
  { id:'gfs_seamless',              name:'GFS',           flag:'🇺🇸', org:'NOAA (USA)',           res:'13km',  days:16, color:'#1baf7a', dash:[6,3] },
  { id:'icon_seamless',             name:'ICON (global)', flag:'🇩🇪', org:'Deutscher Wetterdienst (DWD)',        res:'11km',  days:7,  color:'#eda100', dash:[4,2] },
  { id:'icon_eu',                   name:'ICON-EU',       flag:'🇩🇪', org:'Deutscher Wetterdienst (DWD)',        res:'7km',   days:5,  color:'#eb6834', dash:[2,2] },
  { id:'gem_seamless',              name:'GEM',           flag:'🇨🇦', org:'Canadian Weather Service', res:'15km',  days:10, color:'#e34948', dash:[8,4] },
  { id:'ukmo_seamless',             name:'UKMO',          flag:'🇬🇧', org:'Met Office (UK)',      res:'10km',  days:7,  color:'#e87ba4', dash:[3,3] },
  { id:'metno_seamless',            name:'MET Norway',    flag:'🇳🇴', org:'MET Norway',           res:'1km',   days:10, color:'#B75074', dash:[5,2,1,2] },
  { id:'meteofrance_seamless',      name:'Météo-France',  flag:'🇫🇷', org:'Météo-France',        res:'1.5km', days:4,  color:'#805CD3', dash:[7,2] },
  { id:'jma_seamless',              name:'JMA',           flag:'🇯🇵', org:'JMA (Japan)',          res:'13km',  days:11, color:'#A9852E', dash:[4,4] },
  { id:'cma_grapes_global',         name:'CMA GRAPES',    flag:'🇨🇳', org:'CMA (China)',          res:'15km',  days:10, color:'#d63384', dash:[1,3] },
  { id:'meteofrance_arpege_europe', name:'ARPEGE Europe', flag:'🇫🇷', org:'Météo-France',         res:'10km',  days:4,  color:'#0891b2', dash:[2,4] },
  { id:'knmi_harmonie_arome_europe',name:'HARMONIE NL',   flag:'🇳🇱', org:'KNMI (Netherlands)',   res:'2.5km', days:2,  color:'#4caf50', dash:[6,1,2,1] },
  { id:'dmi_harmonie_arome_europe', name:'HARMONIE DK',   flag:'🇩🇰', org:'DMI (Denmark)',        res:'2km',   days:3,  color:'#795548', dash:[3,5] },
];

// Models available in the daily forecast table selector
const TABLE_MODELS=[
  {id:'ecmwf_ifs025', name:'ECMWF IFS'},
  {id:'icon_eu', name:'ICON-EU'},
  {id:'metno_seamless', name:'MET Norway'},
];

// ─── STATE ────────────────────────────────────────────────────────────────────
// Single mutable state object - all UI reads from here, all updates write here
const S = {
  lat:56.946, lon:24.106,       // default: Riga, Latvia
  city:'Rīga', country:'Latvija',
  active: new Set(MODELS.map(m=>m.id)), // which models are shown on the temp chart
  tableModel:   'ecmwf_ifs025',
  precipModels: new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  windModels:   new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  cloudModel:   'ecmwf_ifs025',
  showSpread: localStorage.getItem('show_spread')!=='0', // shaded model-range band on the temp chart
  windUnit: localStorage.getItem('wind_unit')||'m/s', // 'm/s' or 'km/h'
  data: {},    // keyed by model id, holds raw Open-Meteo API responses
  dataTs: 0,   // epoch ms when the currently shown data was fetched (fresh or cache write time)
  charts: {},  // keyed by chart name, holds Chart.js instances
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const round=(v,d=1)=>v!=null?Math.round(v*(10**d))/(10**d):null;
const r0=v=>v!=null?Math.round(v):null;
// API returns m/s (wind_speed_unit=ms); converts to km/h only when that unit is selected
const windConv=v=>v==null?null:S.windUnit==='km/h'?Math.round(v*3.6):Math.round(v*10)/10;

// ─── CACHE ───────────────────────────────────────────────────────────────────
const CACHE_TTL=60*60*1000; // 1 hour in ms
// Prefix is bumped when API request variables change, to invalidate stale entries
const CACHE_PFX='wx7_';

function getCached(lat,lon){
  try{
    const raw=localStorage.getItem(`${CACHE_PFX}${lat.toFixed(3)}_${lon.toFixed(3)}`);
    if(!raw)return null;
    const{ts,d}=JSON.parse(raw);
    return Date.now()-ts<CACHE_TTL?{d,ts}:null;
  }catch{return null;}
}

// "pirms N min" for the data timestamp; cache TTL caps this at ~1 h
function relTime(ts){
  if(!ts)return 'tikko';
  const m=Math.round((Date.now()-ts)/60000);
  return m<1?'tikko':`pirms ${m} min`;
}

// Brief bottom-centre notification; auto-dismisses
let _toastTimer=null;
function showToast(msg,ms=5000){
  const el=$('toast');
  if(!el)return;
  el.textContent=msg;
  el.hidden=false;
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{el.hidden=true;},250);
  },ms);
}

function setCache(lat,lon,d){
  try{localStorage.setItem(`${CACHE_PFX}${lat.toFixed(3)}_${lon.toFixed(3)}`,JSON.stringify({ts:Date.now(),d}));}catch{}
}

// ─── URL STATE ───────────────────────────────────────────────────────────────
// Encodes current location into the URL so forecast links can be shared
function updateURL(){
  const p=new URLSearchParams({lat:S.lat,lon:S.lon,city:S.city,country:S.country});
  history.replaceState(null,'','?'+p);
}

// Restores location from URL params on page load (skips if no coords present)
function loadFromURL(){
  const p=new URLSearchParams(location.search);
  if(!p.has('lat')||!p.has('lon'))return;
  S.lat=parseFloat(p.get('lat'));
  S.lon=parseFloat(p.get('lon'));
  S.city=p.get('city')||S.city;
  S.country=p.get('country')||S.country;
  $('cityName').textContent=S.city;
  $('heroSub').textContent=S.country;
}

// Returns a CSS class name for temperature colour coding
function tempCls(t){
  if(t==null)return '';
  if(t>=28)return 'tc-hot';
  if(t>=18)return 'tc-warm';
  if(t>=8) return 'tc-cool';
  return 'tc-cold';
}

// Returns a rotated Unicode arrow + direction label; Unicode avoids mobile SVG rendering issues
function wDir(deg){
  if(deg==null)return '-';
  const labels=['Z','ZZA','ZA','AZA','A','ADA','DA','DDA','D','DDR','DR','RDR','R','RZR','ZR','ZZR'];
  const label=labels[Math.round(deg/22.5)%16];
  return `<span style="display:inline-block;transform:rotate(${deg}deg);font-size:13px;line-height:1">↑</span> ${label}`;
}

// ─── WEATHER ICONS / TEXT ────────────────────────────────────────────────────
const WICONS={
  clear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="3.9" y1="3.9" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.1" y2="20.1"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="3.9" y1="20.1" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.1" y2="3.9"/></svg>',
  partly:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="16.5" cy="6.5" r="2.6"/><line x1="16.5" y1="1.6" x2="16.5" y2="3"/><line x1="21.4" y1="6.5" x2="20" y2="6.5"/><line x1="20" y1="3" x2="19" y2="4"/><path d="M16 19H7.5A4.5 4.5 0 0 1 6.7 10.1 6 6 0 0 1 18 11a4 4 0 0 1-2 8z"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  fog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M4 11h16"/><path d="M6 15h12"/><path d="M5 19h11"/></svg>',
  drizzle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  rain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  snow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>',
  thunder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>',
};

// Maps WMO weather interpretation codes to icon keys
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

const WTEXT={clear:'Skaidrs',partly:'Mākoņains',cloud:'Apmācies',fog:'Migla',drizzle:'Smidzina',rain:'Lietus',snow:'Sniegs',thunder:'Pērkons'};
function wIcon(c){const k=wKey(c);return k?WICONS[k]:'';}
function wText(c){const k=wKey(c);return k?WTEXT[k]:'-';}

// Formats an ISO datetime string to short date label used on chart x-axis
function fmtHour(isoStr){
  const d=new Date(isoStr);
  return d.toLocaleDateString('lv-LV',{month:'short',day:'numeric'});
}

// Formats an ISO date string to a Latvian weekday + date for the forecast table
function fmtDate(isoStr){
  const d=new Date(isoStr);
  const dn=['Svētdiena','Pirmdiena','Otrdiena','Trešdiena','Ceturtdiena','Piektdiena','Sestdiena'];
  return `<span class="dl">${dn[d.getDay()]}</span> ${d.toLocaleDateString('lv-LV',{day:'numeric',month:'long'})}`;
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(tab,btn){
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tc>div').forEach(d=>d.classList.remove('on'));
  btn.classList.add('active');
  $('tab-'+tab).classList.add('on');
  // Radar map and climate data initialize lazily on first open (no requests until then)
  if(tab==='radar')initRadar();
  if(tab==='climate')initClimate();
}

// ─── MODEL TOGGLES ───────────────────────────────────────────────────────────
// Renders the toggle buttons for the temperature chart model selector
function buildToggles(){
  const wrap=$('modelToggles');
  wrap.innerHTML='';

  const allOn=MODELS.every(m=>S.active.has(m.id));
  const addCtrl=(label,active,fn)=>{
    const b=document.createElement('button');
    b.className='mt'+(active?' on':'');
    b.textContent=label;
    b.onclick=fn;
    wrap.appendChild(b);
  };
  addCtrl('Visi',allOn,()=>{
    MODELS.forEach(m=>S.active.add(m.id));
    buildToggles();
    rebuildTempChart();
  });
  addCtrl('Neviens',S.active.size===0,()=>{
    S.active.clear();
    buildToggles();
    rebuildTempChart();
  });

  const sep=document.createElement('div');
  sep.style.cssText='width:0.5px;background:var(--b2);margin:2px 6px;align-self:stretch';
  wrap.appendChild(sep);

  MODELS.forEach(m=>{
    const b=document.createElement('button');
    b.className='mt'+(S.active.has(m.id)?' on':'');
    b.innerHTML=`<span class="mt-dot" style="background:${m.color}"></span>${m.flag} ${m.name}`;
    b.title=`${m.org} · ${m.res} · ${m.days} dienas`;
    b.onclick=()=>{
      if(S.active.has(m.id)){S.active.delete(m.id);b.classList.remove('on');}
      else{S.active.add(m.id);b.classList.add('on');}
      $('activeCount').textContent=S.active.size;
      rebuildTempChart();
    };
    wrap.appendChild(b);
  });
  $('activeCount').textContent=S.active.size;
}

// ─── MODEL INFO LIST ─────────────────────────────────────────────────────────
// Builds the "Models" tab with colour dot, flag, name, org, resolution and days
function buildModelInfo(){
  const wrap=$('modelInfoList');
  wrap.innerHTML='';
  MODELS.forEach(m=>{
    const div=document.createElement('div');
    div.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--b)';
    div.innerHTML=`
      <span style="width:10px;height:10px;border-radius:50%;background:${m.color};flex-shrink:0"></span>
      <span style="font-size:14px">${m.flag}</span>
      <div style="flex:1">
        <div style="font-weight:500;font-size:13px">${m.name}</div>
        <div style="font-size:11px;color:var(--t3)">${m.org} · Izšķirtspēja: ${m.res} · Prognoze: ${m.days} dienas</div>
      </div>`;
    wrap.appendChild(div);
  });
}

// ─── CROSSHAIR PLUGIN ────────────────────────────────────────────────────────
// Draws a vertical dashed line at the hovered x position across all charts
Chart.register({
  id:'crosshair',
  afterDraw(chart){
    const active=chart.tooltip?._active;
    if(!active?.length)return;
    const ctx=chart.ctx;
    const x=active[0].element.x;
    const{top,bottom,left,right}=chart.chartArea;
    if(x<left||x>right)return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x,top);
    ctx.lineTo(x,bottom);
    ctx.lineWidth=1;
    ctx.strokeStyle='rgba(150,150,150,.35)';
    ctx.setLineDash([4,4]);
    ctx.stroke();
    ctx.restore();
  }
});

// ─── CHART DEFAULTS ──────────────────────────────────────────────────────────
// Returns a Chart.js options object using current CSS theme variables.
// Called on every chart build so colours update correctly after theme toggle.
function CD(){
  const cs=getComputedStyle(document.body);
  const v=n=>cs.getPropertyValue(n).trim();
  return {
  responsive:true,
  maintainAspectRatio:false,
  animation:{duration:300},
  interaction:{mode:'index',intersect:false},
  plugins:{
    legend:{display:false},
    tooltip:{
      backgroundColor:v('--chart-tip-bg'),
      borderColor:v('--chart-tip-border'),
      borderWidth:1,
      titleColor:v('--chart-tip-title'),
      bodyColor:v('--chart-tip-body'),
      padding:11,
      cornerRadius:7,
    }
  },
  scales:{
    x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:16,maxRotation:0,autoSkip:true,
        // Suppress duplicate date labels when multiple hourly ticks share the same day string
        callback:function(val,index,ticks){const cur=this.getLabelForValue(val);if(index>0&&this.getLabelForValue(ticks[index-1].value)===cur)return '';return cur;}},
      grid:{color:v('--chart-grid')}},
    y:{ticks:{color:v('--chart-tick'),font:{size:11}},grid:{color:v('--chart-grid')}}
  }
  };
}

// Hides the loading spinner and shows the canvas
function showChart(loadId,canvasId){
  $(loadId).style.display='none';
  $(canvasId).style.display='block';
}

// Renders coloured line swatches below a chart
function buildLegend(legId,models){
  const wrap=$(legId);
  if(!wrap)return;
  wrap.innerHTML='';
  models.forEach(m=>{
    const el=document.createElement('div');
    el.className='li';
    el.innerHTML=`<span class="ld" style="background:${m.color}"></span>${m.flag} ${m.name}`;
    wrap.appendChild(el);
  });
}

// ─── TEMPERATURE CHART ───────────────────────────────────────────────────────
// Per-timestep min/max of hourly temperature across the given models
function tempSpread(models){
  const t=Object.values(S.data)[0].hourly.time;
  const min=new Array(t.length).fill(null), max=new Array(t.length).fill(null);
  for(let i=0;i<t.length;i++){
    const vals=models.map(m=>S.data[m.id].hourly.temperature_2m?.[i]).filter(v=>v!=null);
    if(vals.length<2)continue;
    min[i]=Math.min(...vals); max[i]=Math.max(...vals);
  }
  return {min,max};
}

// Short verdict on how far the models disagree, averaged over the next ~48 h
function spreadVerdict(min,max){
  const gaps=[];
  for(let i=0;i<Math.min(48,min.length);i++) if(min[i]!=null) gaps.push(max[i]-min[i]);
  if(!gaps.length)return '';
  const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  const a=round(avg,1);
  if(avg<1.5)return `modeļi lielā mērā vienojas (±${a}°C nākamajās 48 h)`;
  if(avg<4)return `vidēja modeļu izkliede (±${a}°C nākamajās 48 h)`;
  return `liela nenoteiktība – modeļi būtiski atšķiras (±${a}°C nākamajās 48 h)`;
}

function rebuildTempChart(){
  const first=Object.values(S.data)[0];
  if(!first?.hourly?.time)return;
  const chartDefaults=CD();
  const spreadFill=getComputedStyle(document.body).getPropertyValue('--acc-soft').trim();
  const labels=first.hourly.time.map(fmtHour);
  const active=MODELS.filter(m=>S.data[m.id]?.hourly?.temperature_2m&&S.active.has(m.id));
  const lines=active.map(m=>({
    label:m.name,
    data:S.data[m.id].hourly.temperature_2m,
    borderColor:m.color,
    borderWidth:1.5,
    pointRadius:0,
    tension:0.3,
    fill:false,
  }));

  // Shaded band between the coldest and warmest model at each hour. Drawn first
  // so it sits behind every model line; _band flag keeps it out of the tooltip.
  let band=[], sp=null;
  if(S.showSpread&&active.length>=2){
    sp=tempSpread(active);
    band=[
      {label:'_spreadMin',data:sp.min,borderWidth:0,pointRadius:0,tension:0.3,fill:false,_band:true},
      {label:'Modeļu diapazons',data:sp.max,borderWidth:0,pointRadius:0,tension:0.3,fill:'-1',backgroundColor:spreadFill,_band:true},
    ];
  }

  showChart('loadT','cT');
  if(S.charts.temp)S.charts.temp.destroy();
  S.charts.temp=new Chart($('cT'),{
    type:'line',data:{labels,datasets:[...band,...lines]},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'°C'}}
      },
      plugins:{...chartDefaults.plugins,
        tooltip:{...chartDefaults.plugins.tooltip,
          filter:item=>!item.dataset._band,
          callbacks:{
            title:items=>fmtTooltipTitle(first.hourly.time,items[0].dataIndex),
            label:c=>` ${c.dataset.label}: ${round(c.parsed.y)}°C`,
            footer:items=>{
              if(!sp)return '';
              const i=items[0].dataIndex;
              if(sp.min[i]==null)return '';
              return `Diapazons: ${round(sp.min[i])}–${round(sp.max[i])}°C (Δ ${round(sp.max[i]-sp.min[i],1)}°)`;
            }
          }
        }
      }
    }
  });
  buildLegend('legT',MODELS.filter(m=>S.data[m.id]&&S.active.has(m.id)));

  const info=$('spreadInfo');
  if(info)info.textContent=sp?spreadVerdict(sp.min,sp.max):'';
  const chk=$('spreadChk');
  if(chk)chk.checked=S.showSpread;
}

function toggleSpread(on){
  S.showSpread=on;
  try{localStorage.setItem('show_spread',on?'1':'0');}catch{}
  rebuildTempChart();
}

// ─── PRECIPITATION CHART ─────────────────────────────────────────────────────
// Single-model mode renders a bar chart; multi-model renders overlaid line charts
function mkModelSelector(containerId,stateKey,title,onSelect){
  const hd=$(containerId);
  hd.innerHTML=`<span class="card-title">${title}</span>`;
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;gap:4px';
  TABLE_MODELS.forEach(tm=>{
    const b=document.createElement('button');
    b.className='mt'+(S[stateKey]===tm.id?' on':'');
    b.textContent=tm.name;
    b.onclick=()=>{S[stateKey]=tm.id;onSelect();};
    wrap.appendChild(b);
  });
  hd.appendChild(wrap);
}

function mkMultiSelector(containerId,stateKey,title,onSelect){
  const hd=$(containerId);
  hd.innerHTML=`<span class="card-title">${title}</span>`;
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:.6rem';
  const allOn=MODELS.every(m=>S[stateKey].has(m.id));
  const addCtrl=(label,active,fn)=>{
    const b=document.createElement('button');
    b.className='mt'+(active?' on':'');
    b.textContent=label;b.onclick=fn;wrap.appendChild(b);
  };
  addCtrl('Visi',allOn,()=>{MODELS.forEach(m=>S[stateKey].add(m.id));onSelect();});
  addCtrl('Neviens',S[stateKey].size===0,()=>{S[stateKey].clear();onSelect();});
  const sep=document.createElement('div');
  sep.style.cssText='width:0.5px;background:var(--b2);margin:2px 6px;align-self:stretch';
  wrap.appendChild(sep);
  MODELS.forEach(m=>{
    const b=document.createElement('button');
    b.className='mt'+(S[stateKey].has(m.id)?' on':'');
    b.innerHTML=`<span class="mt-dot" style="background:${m.color}"></span>${m.flag} ${m.name}`;
    b.title=`${m.org} · ${m.res} · ${m.days} dienas`;
    b.onclick=()=>{
      // Prevent deselecting the last active model
      if(S[stateKey].has(m.id)){if(S[stateKey].size<=1)return;S[stateKey].delete(m.id);}
      else S[stateKey].add(m.id);
      onSelect();
    };
    wrap.appendChild(b);
  });
  hd.appendChild(wrap);
}

// Formats a full readable timestamp for chart tooltips
function fmtTooltipTitle(timeArr,idx){
  const d=new Date(timeArr[idx]);
  const dn=['Svētdiena','Pirmdiena','Otrdiena','Trešdiena','Ceturtdiena','Piektdiena','Sestdiena'];
  return `${d.toLocaleDateString('lv-LV',{day:'numeric',month:'long'})} - ${dn[d.getDay()]} - plkst. ${d.toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'})}`;
}

function buildPrecipCharts(){
  mkMultiSelector('precipCardHd','precipModels','Nokrišņi (mm)',buildPrecipCharts);

  const base=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!base?.hourly?.time)return;
  const chartDefaults=CD();
  const labels=base.hourly.time.map(fmtHour);
  const active=MODELS.filter(m=>S.precipModels.has(m.id)&&S.data[m.id]?.hourly?.precipitation);
  const multi=active.length>1;

  showChart('loadP','cP');
  if(S.charts.precip)S.charts.precip.destroy();

  const datasets=multi
    ? active.map(m=>({label:m.name,data:S.data[m.id].hourly.precipitation,borderColor:m.color,backgroundColor:m.color+'30',borderWidth:1.5,pointRadius:0,tension:0.3,fill:true}))
    : active.length===1
      ? [{label:active[0].name,data:S.data[active[0].id].hourly.precipitation||[],backgroundColor:active[0].color+'8c',borderColor:active[0].color,borderWidth:0,borderRadius:2}]
      : [];

  S.charts.precip=new Chart($('cP'),{
    type:multi?'line':'bar',
    data:{labels,datasets},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        x:{...chartDefaults.scales.x,ticks:{...chartDefaults.scales.x.ticks,maxTicksLimit:16}},
        y:{...chartDefaults.scales.y,min:0,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+' mm'}}
      },
      plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
        label:c=>` ${c.dataset.label}: ${round(c.parsed.y,1)} mm`
      }}}
    }
  });

  // Precipitation probability chart - follows the same model selection as the mm chart above
  if(S.charts.precipP){S.charts.precipP.destroy();S.charts.precipP=null;}
  const ppDatasets=MODELS
    .filter(m=>S.precipModels.has(m.id)&&S.data[m.id]?.hourly?.precipitation_probability?.some(v=>v!=null))
    .map(m=>({
      label:m.name,data:S.data[m.id].hourly.precipitation_probability,
      borderColor:m.color,borderWidth:1.5,pointRadius:0,tension:0.3,fill:false
    }));
  if(ppDatasets.length){
    showChart('loadPP','cPP');
    S.charts.precipP=new Chart($('cPP'),{
      type:'line',data:{labels,datasets:ppDatasets},
      options:{...chartDefaults,
        scales:{...chartDefaults.scales,
          y:{...chartDefaults.scales.y,min:0,max:100,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'%'}}
        },
        plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
          title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
          label:c=>` ${c.dataset.label}: ${r0(c.parsed.y)}%`
        }}}
      }
    });
  } else {
    // Hide the canvas (do not replaceWith - that permanently removes the element)
    $('cPP').style.display='none';
    $('loadPP').style.display='flex';
    $('loadPP').innerHTML='<div class="err">Nokrišņu varbūtības dati nav pieejami izvēlētajiem modeļiem.</div>';
  }
}

// ─── WIND CHART ──────────────────────────────────────────────────────────────
function buildWindChart(){
  mkMultiSelector('windCardHd','windModels',`Vēja ātrums 10m (${S.windUnit})`,buildWindChart);

  // Unit toggle - inserted between the title and the model selector
  const unitDiv=document.createElement('div');
  unitDiv.style.cssText='display:flex;gap:4px;margin-left:auto';
  ['m/s','km/h'].forEach(u=>{
    const b=document.createElement('button');
    b.className='mt'+(S.windUnit===u?' on':'');
    b.textContent=u;
    b.onclick=()=>setWindUnit(u);
    unitDiv.appendChild(b);
  });
  $('windCardHd').insertBefore(unitDiv,$('windCardHd').children[1]);

  const base=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!base?.hourly?.time)return;
  const chartDefaults=CD();
  const labels=base.hourly.time.map(fmtHour);
  const datasets=MODELS
    .filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.wind_speed_10m)
    .map(m=>({
      label:m.name,
      data:S.data[m.id].hourly.wind_speed_10m.map(v=>windConv(v)),
      borderColor:m.color,borderWidth:1.5,pointRadius:0,tension:0.3,fill:false
    }));
  showChart('loadW','cW');
  if(S.charts.wind)S.charts.wind.destroy();
  S.charts.wind=new Chart($('cW'),{
    type:'line',data:{labels,datasets},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,min:0,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+' '+S.windUnit}}
      },
      plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
        label:c=>` ${c.dataset.label}: ${c.parsed.y} ${S.windUnit}`
      }}}
    }
  });
  buildLegend('legW',MODELS.filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.wind_speed_10m));
}

// Persists the selected unit and rebuilds all wind displays (metrics, chart, table)
function setWindUnit(u){
  S.windUnit=u;
  try{localStorage.setItem('wind_unit',u);}catch{}
  updateMetrics();
  buildWindChart();
  buildTable();
}

// ─── CLOUD COVER CHART ───────────────────────────────────────────────────────
const CLOUD_LEVELS=[
  {max:25,  label:'Skaidrs',          color:'#9fd8ef'},
  {max:50,  label:'Daļēji mākoņains', color:'#7bafc8'},
  {max:75,  label:'Mākoņains',        color:'#8595a3'},
  {max:100, label:'Apmācies',         color:'#5e6e7a'},
];
const cloudColor=v=>(CLOUD_LEVELS.find(l=>v<=l.max)||CLOUD_LEVELS[3]).color;
const cloudLabel=v=>(CLOUD_LEVELS.find(l=>v<=l.max)||CLOUD_LEVELS[3]).label;

function buildCloudChart(){
  mkModelSelector('cloudCardHd','cloudModel','Mākoņu sega (%)',buildCloudChart);
  const src=S.data[S.cloudModel]||S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!src?.hourly?.time)return;
  const cd=CD();
  const cap=5*24;
  const times=src.hourly.time.slice(0,cap);
  const labels=times.map(fmtHour);
  const vals=(src.hourly.cloud_cover||[]).slice(0,cap);
  showChart('loadCl','cCl');
  if(S.charts.cloud)S.charts.cloud.destroy();
  S.charts.cloud=new Chart($('cCl'),{
    type:'bar',
    data:{labels,datasets:[{
      data:vals,
      backgroundColor:vals.map(v=>cloudColor(v??0)),
      borderWidth:0,
      borderRadius:0,
      barPercentage:1.0,
      categoryPercentage:1.0,
    }]},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:16}},
        y:{...cd.scales.y,min:0,max:100,ticks:{...cd.scales.y.ticks,callback:v=>v+'%'}}
      },
      plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(times,items[0].dataIndex),
        label:c=>` ${Math.round(c.parsed.y)}% · ${cloudLabel(c.parsed.y)}`
      }}}
    }
  });
  const leg=$('legCl');
  if(leg) leg.innerHTML=CLOUD_LEVELS.map(l=>`<div class="li"><span class="ld" style="background:${l.color}"></span>${l.label}</div>`).join('');
}

// ─── UV INDEX CHART ───────────────────────────────────────────────────────────
const UV_LEVELS=[
  {max:2, label:'Zems',       color:'#57a838'},
  {max:5, label:'Mērens',     color:'#f5c518'},
  {max:7, label:'Augsts',     color:'#f77f00'},
  {max:10,label:'Ļoti augsts',color:'#e8292a'},
  {max:Infinity,label:'Ārkārtējs',color:'#9b4dca'},
];
function uvColor(v){ return (UV_LEVELS.find(l=>v<=l.max)||UV_LEVELS[4]).color; }
function uvLabel(v){ return (UV_LEVELS.find(l=>v<=l.max)||UV_LEVELS[4]).label; }

function buildUVChart(){
  // Some models return uv_index:[null,null,...] instead of omitting the field - .some() is needed
  // because a plain truthiness check would select those models and render as invisible all-zero bars.
  const hasUV=d=>d?.hourly?.uv_index?.some(v=>v!=null);
  const src=[S.data['ecmwf_ifs025'],S.data['gfs_seamless'],...Object.values(S.data)].find(hasUV);
  const meta=$('uvMeta');
  if(!src?.hourly?.time){
    if(meta)meta.textContent='Nav datu';
    $('loadUV').style.display='none';
    return;
  }

  const modelName=MODELS.find(m=>S.data[m.id]===src)?.name||'';
  if(meta)meta.textContent=modelName;

  // Hourly chart: start from current hour, show 5 days ahead
  const now=new Date();
  const startIdx=Math.max(0,src.hourly.time.findIndex(t=>new Date(t)>=now));
  const times=src.hourly.time.slice(startIdx,startIdx+5*24);
  const vals=src.hourly.uv_index.slice(startIdx,startIdx+5*24);
  const labels=times.map(fmtHour);

  const cd=CD();
  showChart('loadUV','cUV');
  if(S.charts.uv)S.charts.uv.destroy();
  S.charts.uv=new Chart($('cUV'),{
    type:'bar',
    data:{labels,datasets:[{
      data:vals.map(v=>v??0),
      backgroundColor:vals.map(v=>uvColor(v??0)),
      borderWidth:0,
      borderRadius:3,
      barPercentage:0.85,
      categoryPercentage:0.85,
    }]},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:20}},
        y:{...cd.scales.y,min:0,suggestedMax:8,
           ticks:{...cd.scales.y.ticks,stepSize:1,callback:v=>v>0?v:''}}
      },
      plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(times,items[0].dataIndex),
        label:c=>c.parsed.y>0?` UV ${Math.round(c.parsed.y)} · ${uvLabel(c.parsed.y)}`:' Nav UV'
      }}}
    }
  });

  const leg=$('legUV');
  if(leg) leg.innerHTML=UV_LEVELS.map(l=>`<div class="li"><span class="ld" style="background:${l.color}"></span>${l.label}</div>`).join('');

}

// ─── CLIMATE (ERA5 via Open-Meteo Archive) ───────────────────────────────────
const CLIM_PFX='clim2_';
let _climKey=null;   // coord key of the currently rendered climate view

const _avg=a=>a.reduce((s,v)=>s+v,0)/a.length;

// Warming-stripes colour: z = (year mean - 1961-90 mean) / sd, mapped blue->white->red
function stripeColor(z){
  const t=Math.max(-1,Math.min(1,z/3));
  const cold=[8,48,107], mid=[245,245,245], warm=[103,0,13];
  const [x,y]=t<0?[cold,mid]:[mid,warm];
  const f=Math.abs(t);
  return `rgb(${Math.round(x[0]+(y[0]-x[0])*f)},${Math.round(x[1]+(y[1]-x[1])*f)},${Math.round(x[2]+(y[2]-x[2])*f)})`;
}

// Reduce ~85 years of daily means to the small structure the view needs
function processClimate(time,mean){
  const byYear={}, doySum=new Array(367).fill(0), doyCnt=new Array(367).fill(0);
  for(let i=0;i<time.length;i++){
    const v=mean[i]; if(v==null)continue;
    const t=time[i], y=+t.slice(0,4);
    (byYear[y]=byYear[y]||[]).push(v);
    if(y>=1991&&y<=2020){
      const d=new Date(t+'T00:00');
      const doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5);
      doySum[doy]+=v; doyCnt[doy]++;
    }
  }
  const thisYear=new Date().getFullYear();
  const annual=Object.keys(byYear).map(Number).sort((a,b)=>a-b).map(y=>({
    year:y, mean:_avg(byYear[y]), full:byYear[y].length>=350
  })).filter(a=>a.full||a.year===thisYear);
  // day-of-year normal, smoothed +-7 days (circular)
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

async function fetchClimate(key){
  try{
    const raw=localStorage.getItem(CLIM_PFX+key);
    if(raw){const{ts,d}=JSON.parse(raw); if(Date.now()-ts<7*864e5)return d;}
  }catch{}
  const end=new Date(Date.now()-6*864e5).toISOString().slice(0,10); // archive lags ~5 days
  const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${S.lat}&longitude=${S.lon}`
    +`&start_date=1940-01-01&end_date=${end}&daily=temperature_2m_mean&timezone=auto`;
  const r=await fetch(url);
  if(!r.ok)throw new Error('archive '+r.status);
  const j=await r.json();
  if(!j.daily?.temperature_2m_mean)throw new Error('no data');
  const d=processClimate(j.daily.time,j.daily.temperature_2m_mean);
  try{localStorage.setItem(CLIM_PFX+key,JSON.stringify({ts:Date.now(),d}));}catch{}
  return d;
}

async function initClimate(){
  const key=`${S.lat.toFixed(2)}_${S.lon.toFixed(2)}`;
  if(_climKey===key)return;
  $('loadClim').style.display='flex';
  $('climContent').hidden=true;
  $('climErr').hidden=true;

  let d;
  try{ d=await fetchClimate(key); }
  catch(e){
    console.warn('[climate]',e);
    $('loadClim').style.display='none';
    $('climErr').hidden=false;
    return;
  }
  renderClimate(d);
  _climKey=key;
  $('loadClim').style.display='none';
  $('climContent').hidden=false;
}

function renderClimate(d){
  // Today's anomaly: forecast daily mean (max+min)/2 vs the day-of-year normal
  const fc=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  const tmax=fc?.daily?.temperature_2m_max?.[0], tmin=fc?.daily?.temperature_2m_min?.[0];
  const now=new Date();
  const doy=Math.floor((now-new Date(now.getFullYear(),0,0))/864e5);
  const normal=d.doyClim[doy];
  if(tmax!=null&&tmin!=null&&normal!=null){
    const today=(tmax+tmin)/2, anom=today-normal;
    const sign=anom>=0?'+':'−';
    $('climAnomVal').textContent=`${sign}${Math.abs(round(anom,1))}°C`;
    $('climAnomVal').style.color=anom>=0?'#e0796d':'#7aa8d8';
    $('climAnomLbl').textContent=`šodien pret 1991-2020 normu (${round(normal,1)}°C) šai datumai`;
  }else{
    $('climAnomVal').textContent='–';
    $('climAnomLbl').textContent='nepietiek datu šodienas anomālijai';
  }

  // Latest complete year vs 1961-1990
  const full=d.annual.filter(a=>a.full);
  const last=full[full.length-1];
  if(last){
    const diff=last.mean-d.centre;
    $('climYearNote').textContent=
      `${last.year}. gads: vidēji ${round(last.mean,1)}°C — ${diff>=0?'+':'−'}${Math.abs(round(diff,1))}°C pret 1961-1990. gadu vidējo (${round(d.centre,1)}°C).`;
  }

  // Warming stripes
  const wrap=$('climStripes');
  wrap.innerHTML='';
  d.annual.forEach(a=>{
    const z=(a.mean-d.centre)/d.sd;
    const bar=document.createElement('div');
    bar.className='stripe';
    bar.style.background=stripeColor(z);
    if(!a.full)bar.style.opacity='.55';
    bar.title=`${a.year}: ${round(a.mean,1)}°C (${a.mean-d.centre>=0?'+':'−'}${Math.abs(round(a.mean-d.centre,1))}°C)${a.full?'':' — nepilns gads'}`;
    wrap.appendChild(bar);
  });
  const y0=d.annual[0]?.year, y1=d.annual[d.annual.length-1]?.year;
  $('climStripesRange').textContent=y0&&y1?`(${y0}-${y1})`:'';
  $('climAxisL').textContent=y0||'';
  $('climAxisR').textContent=y1||'';
}

// ─── FORECAST TABLE ───────────────────────────────────────────────────────────
function buildTable(){
  mkModelSelector('tableCardHd','tableModel','Prognoze pa dienām',buildTable);

  const src=S.data[S.tableModel]||S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!src?.daily?.time)return;
  const {time,temperature_2m_max:tmax,temperature_2m_min:tmin,precipitation_sum:ps,
         precipitation_probability_max:ppm,wind_speed_10m_max:wmax,
         relative_humidity_2m_mean:rh,weather_code:wc,cloud_cover_mean:cc}=src.daily;
  const tbody=$('tBody');
  tbody.innerHTML='';
  time.forEach((t,i)=>{
    const mx=r0(tmax?.[i]),mn=r0(tmin?.[i]);
    const icon=wIcon(wc?.[i]);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(t)}</td>
      <td class="wcell" title="${wText(wc?.[i])}">${icon}</td>
      <td class="${tempCls(mx)}">${mx!=null?mx+'°':'-'}</td>
      <td class="${tempCls(mn)}">${mn!=null?mn+'°':'-'}</td>
      <td>${ps?.[i]!=null?round(ps[i],1)+' mm':'-'}</td>
      <td>${ppm?.[i]!=null?r0(ppm[i])+'%':'-'}</td>
      <td>${wmax?.[i]!=null?windConv(wmax[i])+' '+S.windUnit:'-'}</td>
      <td>${cc?.[i]!=null?r0(cc[i])+'%':'-'}</td>
      <td>${rh?.[i]!=null?r0(rh[i])+'%':'-'}</td>
    `;
    tbody.appendChild(tr);
  });
  $('loadTbl').style.display='none';
  $('forecastTable').style.display='table';
}

// ─── CURRENT METRICS ─────────────────────────────────────────────────────────
// Returns a monochrome SVG moon phase icon and Latvian name based on lunar cycle math
function moonPhaseInfo(){
  const ref=new Date('2000-01-06T18:14:00Z'); // reference new moon (Jan 6, 2000)
  const cycle=29.53058867;
  const days=((Date.now()-ref)/86400000%cycle+cycle)%cycle;
  const frac=days/cycle; // 0=new, 0.5=full, 1=new
  const i=Math.floor(frac*8)%8;
  const names=['Jaunmēness','Augošs pusmēness','Pirmais ceturksnis','Augošs','Pilnmēness','Dilstošs','Pēdējais ceturksnis','Dilstošs pusmēness'];

  // Build SVG using two arcs: outer semicircle + terminator ellipse
  const r=6,s=16,cx=8,cy=8;
  let svg;
  if(frac<0.02||frac>0.98){
    // New moon - just a circle outline
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
  } else if(frac>0.48&&frac<0.52){
    // Full moon - filled circle
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/></svg>`;
  } else {
    const waxing=frac<0.5;
    // Terminator ellipse x-radius shrinks from r (quarter) to 0 (quarter) symmetrically
    const ex=(Math.abs(Math.cos(frac*2*Math.PI))*r).toFixed(2);
    const outerSweep=waxing?1:0; // right (waxing) or left (waning) semicircle
    // Terminator arc must curve toward the lit hemisphere to close the shape.
    // Between the two quarter moons (gibbous illumination) the sweep direction flips.
    const termSweep=(frac>0.25&&frac<0.75)?1:0;
    const outline=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.35"/>`;
    const lit=`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy+r} A ${ex} ${r} 0 0 ${termSweep} ${cx} ${cy-r} Z" fill="currentColor"/>`;
    svg=`<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${outline}${lit}</svg>`;
  }
  return {svg, name:names[i]};
}

// Populates the metrics row and hero sunrise/sunset using ECMWF as primary source
function updateMetrics(){
  const ecmwf=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!ecmwf)return;
  const c=ecmwf.current;
  if(c){
    $('curTemp').innerHTML=`${r0(c.temperature_2m)}<span>°C</span>`;
    $('curDesc').innerHTML='<span class="wico">'+wIcon(c.weather_code)+'</span>'+wText(c.weather_code);
    const fl=r0(c.apparent_temperature);
    $('feelsLike').innerHTML=`${fl!=null?fl:'-'}<span>°C</span>`;
    const diff=fl!=null&&c.temperature_2m!=null?fl-Math.round(c.temperature_2m):null;
    $('feelsDesc').textContent=diff==null?'-':diff>1?'Siltāk nekā ir':diff<-1?'Aukstāk nekā ir':'Atbilst temperatūrai';
    $('windNow').innerHTML=`${windConv(c.wind_speed_10m)}<span>${S.windUnit}</span>`;
    const gust=c.wind_gusts_10m!=null?` · brāzmas ${windConv(c.wind_gusts_10m)} ${S.windUnit}`:'';
    $('windDir').innerHTML=`Virziens: ${wDir(c.wind_direction_10m)}${gust}`;
    $('humNow').innerHTML=`${r0(c.relative_humidity_2m)}<span>%</span>`;
    const snow=c.snowfall>0?` · sniegs ${round(c.snowfall,1)} cm`:'';
    $('precipNow').textContent=`Nokrišņi: ${round(c.precipitation,1)} mm${snow}`;
  }
  if(ecmwf.daily?.temperature_2m_max?.[0]!=null){
    $('todayMax').innerHTML=`${r0(ecmwf.daily.temperature_2m_max[0])}<span>°C</span>`;
    $('todayMin').textContent=`Min: ${r0(ecmwf.daily.temperature_2m_min?.[0])}°C`;
  }
  // Data freshness: shown both on the temperature card and in the always-visible
  // metrics row (so it is present on every tab, not just Temperatūra)
  $('lastUpdate').textContent=`Dati atjaunoti ${relTime(S.dataTs)}`;
  const srcModel=S.data['ecmwf_ifs025']?'ECMWF IFS':(Object.keys(S.data)[0]||'?');
  const srcEl=$('metricsSrc');
  if(srcEl)srcEl.textContent=`Pašreizējie dati: ${srcModel} · atjaunoti ${relTime(S.dataTs)}`;
  // Sunrise/sunset times are in the daily[0] slot as ISO strings with local timezone offset
  if(ecmwf.daily?.sunrise?.[0]&&ecmwf.daily?.sunset?.[0]){
    const fmt=iso=>new Date(iso).toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'});
    const rise=fmt(ecmwf.daily.sunrise[0]),set=fmt(ecmwf.daily.sunset[0]);
    const sunEl=$('heroSun');
    const moon=moonPhaseInfo();
    if(sunEl)sunEl.innerHTML=
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/></svg>${rise}&nbsp;&nbsp;<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/><path d="M19 14l-7 5-7-5" stroke-width="1.5"/></svg>${set}<span class="hero-sun-sep">·</span><span class="hero-moon" title="${moon.name}">${moon.svg}</span><span class="hero-moon-name">${moon.name}</span>`;
  }
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────
// Open-Meteo supports comma-separated models in one request: each hourly/daily
// variable comes back suffixed per model (temperature_2m_ecmwf_ifs025, ...), sharing
// one time array sized to the longest model horizon. Models unsupported at a variable
// come back null-filled rather than 400; models outside their geographic coverage are
// silently omitted from the response. This means no per-model fallback cascade is needed.
async function fetchAllModels(){
  const hit=getCached(S.lat,S.lon);
  if(hit){S.dataTs=hit.ts;return hit.d;}

  const cur='temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,wind_gusts_10m,snowfall';
  const h='temperature_2m,precipitation,precipitation_probability,wind_speed_10m,cloud_cover,uv_index';
  const d='temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,weather_code,cloud_cover_mean,sunrise,sunset';
  const models=MODELS.map(m=>m.id).join(',');
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}&models=${models}&hourly=${h}&daily=${d}&current=${cur}&timezone=auto&forecast_days=16&wind_speed_unit=ms`;

  const r=await fetch(url);
  if(!r.ok)throw new Error(r.status);
  const data=await r.json();
  setCache(S.lat,S.lon,data);
  S.dataTs=Date.now();
  return data;
}

// Splits the combined multi-model response back into the per-model {hourly,daily,current}
// shape the rest of the app expects in S.data[modelId]. A model with no suffixed
// temperature_2m key was geographically out of coverage and is skipped entirely.
function splitCombined(raw){
  const out={};
  // Open-Meteo returns the `current` block from the first model in the request.
  // Attach it to the first model that actually made it into the response, so
  // current conditions still work when ECMWF IFS is outside its coverage area.
  let currentAssigned=false;
  MODELS.forEach(m=>{
    const tKey=`temperature_2m_${m.id}`;
    if(!(raw.hourly?.[tKey]))return;
    const hourly={time:raw.hourly.time};
    Object.keys(raw.hourly).forEach(k=>{
      if(k.endsWith(`_${m.id}`))hourly[k.slice(0,-(m.id.length+1))]=raw.hourly[k];
    });
    const daily={time:raw.daily?.time};
    Object.keys(raw.daily||{}).forEach(k=>{
      if(k.endsWith(`_${m.id}`))daily[k.slice(0,-(m.id.length+1))]=raw.daily[k];
    });
    out[m.id]={hourly,daily};
    if(!currentAssigned){out[m.id].current=raw.current;currentAssigned=true;}
  });
  return out;
}

// Fetches all models in one request; skips models missing from the response
async function loadAll(){
  const hadData=Object.keys(S.data).length>0;
  if(!hadData){
    $('loadT').style.display='flex';
    $('loadT').innerHTML='<div class="spinner"></div>Ielādē...';
  }

  let fresh=null;
  try{
    fresh=splitCombined(await fetchAllModels());
  }catch(e){
    console.warn('[loadAll] combined fetch failed',e);
  }

  if(!fresh||!Object.keys(fresh).length){
    if(hadData){
      // Keep the previous location's data on screen rather than blanking everything
      showToast('Neizdevās ielādēt jaunos datus. Rādīti iepriekšējie.');
      return false;
    }
    ['loadT','loadP','loadPP','loadW','loadCl','loadUV','loadTbl'].forEach(id=>{
      $(id).innerHTML='<div class="err">Neizdevās ielādēt datus. Pārbaudiet interneta savienojumu.</div>';
    });
    return false;
  }

  S.data=fresh;
  updateMetrics();
  rebuildTempChart();
  buildPrecipCharts();
  buildWindChart();
  buildCloudChart();
  buildUVChart();
  buildTable();
  // Climate tab caches per-location; refresh it if the user is looking at it
  if($('tab-climate')?.classList.contains('on'))initClimate();
  return true;
}

// ─── CITY SEARCH ─────────────────────────────────────────────────────────────
let _searchTimer=null;
let _searchCtrl=null;

// Renders geocoding results into the dropdown
function renderSearchResults(results){
  const drop=$('cityDrop');
  drop.innerHTML='';
  results.forEach(g=>{
    const opt=document.createElement('div');
    opt.className='city-opt';
    // Use textContent (not innerHTML) to prevent XSS from API-returned city names
    const nm=document.createElement('div'); nm.className='co-name'; nm.textContent=g.name;
    const sb=document.createElement('div'); sb.className='co-sub';
    sb.textContent=[g.admin1,g.country].filter(Boolean).join(', ')+(g.timezone?' · '+g.timezone:'');
    opt.appendChild(nm); opt.appendChild(sb);
    opt.onclick=()=>{ drop.style.display='none'; $('cityInput').value=g.name; selectCity(g); };
    drop.appendChild(opt);
  });
  drop.style.display='block';
}

// Geocodes the current input value; called by debounced input handler and Enter key
async function searchCity(){
  const val=$('cityInput').value.trim();
  if(!val)return;
  // Cancel any in-flight request before starting a new one
  if(_searchCtrl)_searchCtrl.abort();
  _searchCtrl=new AbortController();
  const drop=$('cityDrop');
  drop.innerHTML='<div class="city-opt" style="color:var(--t3);cursor:default">Meklē...</div>';
  drop.style.display='block';
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(val)}&count=5&language=en`,{signal:_searchCtrl.signal});
    const d=await r.json();
    if(!d.results?.length){
      drop.innerHTML='<div class="city-opt" style="color:var(--t3);cursor:default">Pilsēta netika atrasta</div>';
      return;
    }
    renderSearchResults(d.results);
  }catch(e){
    if(e.name==='AbortError')return; // superseded by a newer request - ignore silently
    const errEl=document.createElement('div');
    errEl.className='city-opt';
    errEl.style.cssText='color:#e66767;cursor:default';
    errEl.textContent=`Kļūda: ${e.message}`;
    drop.appendChild(errEl);
  }
}

// Updates state, URL, recent history and reloads all model data for the new location.
// Transactional: if the fetch fails, the previous location's data stays on screen
// and the header reverts, rather than blanking the page.
async function selectCity(g){
  const prev={lat:S.lat,lon:S.lon,city:S.city,country:S.country,
              name:$('cityName').textContent,sub:$('heroSub').textContent};
  S.lat=+g.latitude; S.lon=+g.longitude;
  S.city=g.name; S.country=g.country||'';
  $('cityName').textContent=g.name;
  $('heroSub').textContent=`${[g.admin1,g.country].filter(Boolean).join(', ')}${g.timezone?' · '+g.timezone:''}`;
  document.body.classList.add('busy');

  const ok=await loadAll();
  document.body.classList.remove('busy');
  if(!ok){
    Object.assign(S,{lat:prev.lat,lon:prev.lon,city:prev.city,country:prev.country});
    $('cityName').textContent=prev.name;
    $('heroSub').textContent=prev.sub;
    return;
  }

  updateURL();
  saveRecent(g);
  buildToggles();
}

// Close city dropdown when clicking outside the search area
document.addEventListener('click',e=>{
  if(!e.target.closest('.sa'))$('cityDrop').style.display='none';
});

$('cityInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){clearTimeout(_searchTimer);searchCity();}
});
// Autocomplete: wait 300ms after user stops typing, min 2 chars, max 1 active request
$('cityInput').addEventListener('input',()=>{
  const val=$('cityInput').value.trim();
  clearTimeout(_searchTimer);
  if(val.length<2){$('cityDrop').style.display='none';return;}
  _searchTimer=setTimeout(searchCity,300);
});
// Show recent searches when the input is focused and empty
$('cityInput').addEventListener('focus',()=>{if(!$('cityInput').value.trim())showRecent();});

// ─── THEME ────────────────────────────────────────────────────────────────────
const TT_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="3.9" y1="3.9" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.1" y2="20.1"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="3.9" y1="20.1" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.1" y2="3.9"/></svg>';
const TT_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function renderThemeIcon(){
  const t=document.documentElement.getAttribute('data-theme');
  const el=$('themeToggle');
  if(el)el.innerHTML=t==='light'?TT_MOON:TT_SUN;
}

// Charts must be rebuilt after theme switch so CSS variable colours are re-read
function rerenderCharts(){
  if(Object.keys(S.data).length){rebuildTempChart();buildPrecipCharts();buildWindChart();}
}

// Applies theme, saves to localStorage and redraws charts with updated CSS colours
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('theme',t);}catch(e){}
  renderThemeIcon();
  rerenderCharts();
}

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='light'?'dark':'light');
}

// ─── RECENT CITIES ────────────────────────────────────────────────────────────
// Keeps the 5 most recently selected cities in localStorage; deduplicates by proximity
function saveRecent(g){
  try{
    let r=JSON.parse(localStorage.getItem('recent_cities')||'[]');
    r=r.filter(c=>!(Math.abs(c.lat-g.latitude)<0.01&&Math.abs(c.lon-g.longitude)<0.01));
    r.unshift({name:g.name,country:g.country||'',lat:g.latitude,lon:g.longitude,admin1:g.admin1||'',timezone:g.timezone||''});
    localStorage.setItem('recent_cities',JSON.stringify(r.slice(0,5)));
  }catch{}
}

// Shows the last 5 searched cities when the input is focused and empty
function showRecent(){
  const drop=$('cityDrop');
  try{
    const r=JSON.parse(localStorage.getItem('recent_cities')||'[]');
    if(!r.length)return;
    drop.innerHTML='';
    const lbl=document.createElement('div');
    lbl.style.cssText='padding:7px 13px 4px;font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.8px';
    lbl.textContent='Nesenie meklējumi';
    drop.appendChild(lbl);
    r.forEach(c=>{
      const opt=document.createElement('div');
      opt.className='city-opt';
      const nm=document.createElement('div'); nm.className='co-name'; nm.textContent=c.name;
      const sb=document.createElement('div'); sb.className='co-sub'; sb.textContent=[c.admin1,c.country].filter(Boolean).join(', ');
      opt.appendChild(nm); opt.appendChild(sb);
      opt.onclick=()=>{drop.style.display='none';$('cityInput').value=c.name;selectCity({latitude:c.lat,longitude:c.lon,name:c.name,country:c.country,admin1:c.admin1,timezone:c.timezone});};
      drop.appendChild(opt);
    });
    drop.style.display='block';
  }catch{}
}

// ─── SHARE ────────────────────────────────────────────────────────────────────
// Opens WhatsApp share sheet with city name and current URL (includes lat/lon params)
function shareWA(){
  const url=window.location.href;
  const text=`Laika prognoze - ${S.city} | prognoze.lv`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text+'\n'+url)}`,'_blank');
}

// Opens Telegram share sheet with city name and current URL
function shareTG(){
  const url=window.location.href;
  const text=`Laika prognoze - ${S.city}`;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,'_blank');
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────
// Uses Nominatim reverse geocoding to resolve browser coordinates to a city name.
// Pass auto=true on page load: shows status text and falls back to loadAll() on failure.
async function locateMe(auto=false){
  if(!navigator.geolocation){ if(auto) loadAll(); return; }
  const btn=document.querySelector('.lbtn');
  if(btn)btn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      if(btn)btn.classList.remove('loading');
      const{latitude:lat,longitude:lon}=pos.coords;
      // Start loading immediately with placeholder name; Nominatim updates it in background
      selectCity({latitude:lat,longitude:lon,name:'Pašreizējā atrašanās vieta',country:'',admin1:'',timezone:''});
      try{
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=lv`);
        const d=await r.json();
        const a=d.address||{};
        const city=a.city||a.town||a.village||a.municipality||a.suburb||a.neighbourhood||a.county||d.display_name?.split(',')[0]||'';
        if(city){ $('cityName').textContent=city; S.city=city; }
        const country=d.address?.country||'';
        if(country){ $('heroSub').textContent=country; S.country=country; }
        updateURL();
      }catch{ /* keep placeholder name */ }
    },
    ()=>{ if(btn)btn.classList.remove('loading'); if(auto) loadAll(); },
    {timeout:5000}
  );
}

// ─── RADAR ────────────────────────────────────────────────────────────────────
let _rMap=null, _rLayer=null, _rFrames=[], _rIdx=0, _rTimer=null;

// Lazy-initializes the Leaflet map; safe to call multiple times
async function initRadar(){
  if(_rMap){
    _rMap.setView([S.lat,S.lon],6);
    _rMap.invalidateSize(); // recalculate size after tab becomes visible
    ensureLvcStations();    // re-check staleness / refresh distances for new location
    ensureLvgmcStations();
    return;
  }
  _rMap=L.map('radarMap',{maxZoom:13}).setView([S.lat,S.lon],6);

  // Atsevišķa pane radaram ar fiksētu z-index virs tilePane (200, kur dzīvo VISAS
  // bāzes kartes) - tā radars vienmēr paliek virsū neatkarīgi no izvēlētās bāzes kartes.
  // markerPane (600) paliek vēl augstāk, tāpēc LVC marķieri joprojām redzami virs radara.
  _rMap.createPane('radarPane');
  _rMap.getPane('radarPane').style.zIndex=450;

  // Vairākas bāzes kartes lietotājam izvēlei - tikai viena aktīva reizē.
  // Gaišā/Tumšā = Esri Gray Canvas (bez API atslēgas). Esri "Base" slānim nav
  // iebūvētu nosaukumu - "Reference" ir atsevišķs slānis, tāpēc abus apvienojam
  // vienā layerGroup, lai izskatās kā vienota karte ar pilsētu nosaukumiem.
  const esriAttr='Tiles © <a href="https://www.esri.com" target="_blank">Esri</a>';
  const esri=(svc,attr)=>L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,{attribution:attr,maxZoom:16});
  const baseLayers={
    'Gaišā':L.layerGroup([
      esri('Canvas/World_Light_Gray_Base',esriAttr),
      esri('Canvas/World_Light_Gray_Reference'),
    ]),
    'Tumšā':L.layerGroup([
      esri('Canvas/World_Dark_Gray_Base',esriAttr),
      esri('Canvas/World_Dark_Gray_Reference'),
    ]),
    'OpenStreetMap':L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom:19,subdomains:'abc'}),
    'Reljefs':L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap, SRTM · © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
      maxZoom:17,subdomains:'abc'}),
    'Satelīts':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Tiles © <a href="https://www.esri.com" target="_blank">Esri</a>',
      maxZoom:19}),
  };
  baseLayers['Gaišā'].addTo(_rMap);
  // Radara/meteostaciju atsauces paliek redzamas neatkarīgi no izvēlētās bāzes kartes
  _rMap.attributionControl.addAttribution('Radars: <a href="https://www.rainviewer.com" target="_blank">RainViewer</a> · Meteostacijas: <a href="https://www.transportdata.gov.lv" target="_blank">LVC</a> / <a href="https://data.gov.lv/dati/dataset/hidrometeorologiskie-noverojumi" target="_blank">LVĢMC</a>');

  _lvcLayer=L.layerGroup().addTo(_rMap);
  _lvgmcLayer=L.layerGroup().addTo(_rMap);
  bindLvcTableSorting();
  bindLvgmcTableSorting();
  _rMap.on('zoomend moveend',declutterAllBadges);

  // Papildslāņi (checkbox) - šeit pievienos nākotnē vēl citus slāņus (piem. LT/EE radaru)
  const overlays={
    'Ceļa meteostacijas (LVC)':_lvcLayer,
    'LVĢMC meteostacijas':_lvgmcLayer,
  };
  L.control.layers(baseLayers,overlays,{collapsed:true}).addTo(_rMap);

  // Tabula zem kartes redzama tikai tiem tīkliem, kas ieķeksēti slāņu vadībā;
  // ja ieķeksēti abi, parāda cilnes pārslēgšanai starp tām (nevis vienu zem otras)
  _rMap.on('overlayadd',e=>{
    if(e.layer===_lvcLayer)_lvcLayerActive=true;
    if(e.layer===_lvgmcLayer)_lvgmcLayerActive=true;
    updateStationTablesVisibility();
  });
  _rMap.on('overlayremove',e=>{
    if(e.layer===_lvcLayer)_lvcLayerActive=false;
    if(e.layer===_lvgmcLayer)_lvgmcLayerActive=false;
    updateStationTablesVisibility();
  });
  updateStationTablesVisibility();

  await Promise.all([loadRadarFrames(), ensureLvcStations(), ensureLvgmcStations()]);
}

async function loadRadarFrames(){
  try{
    $('radarStatus').textContent='Ielādē...';
    const r=await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    // Combine past observations with nowcast frames
    _rFrames=[...(d.radar.past||[]),...(d.radar.nowcast||[])];
    if(!_rFrames.length)throw new Error('empty');
    $('radarSlider').max=_rFrames.length-1;
    showRadarFrame(_rFrames.length-1); // show most recent frame first
    updateRadarUI();
    $('radarStatus').textContent='';
  }catch{
    $('radarStatus').textContent='Neizdevās ielādēt radara datus.';
  }
}

function showRadarFrame(idx){
  if(_rLayer)_rMap.removeLayer(_rLayer);
  const f=_rFrames[idx];
  // Tile URL hardcoded to known RainViewer domain - no user input involved
  _rLayer=L.tileLayer(
    `https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
    // maxNativeZoom: radar tiles only go to z=6; Leaflet upscales beyond that instead of showing error
    // pane:'radarPane' - fiksēts z-index virs JEBKURAS bāzes kartes (tās visas koplieto
    // 'tilePane'), tāpēc radars nepazūd zem tās, kad lietotājs pārslēdz bāzes karti
    {opacity:0.65,tileSize:256,pane:'radarPane',maxNativeZoom:6}
  ).addTo(_rMap);
  _rIdx=idx;
}

function updateRadarUI(){
  if(!_rFrames.length)return;
  const t=new Date(_rFrames[_rIdx].time*1000);
  const label=t.toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'});
  const isLatest=_rIdx===_rFrames.length-1;
  $('radarTime').textContent=isLatest?`Tagad · ${label}`:label;
  $('radarSlider').value=_rIdx;
}

$('radarSlider').addEventListener('input',e=>{
  if(_rTimer){clearInterval(_rTimer);_rTimer=null;$('radarPlayBtn').textContent='▶';} // bīdot manuāli, aptur animāciju
  showRadarFrame(parseInt(e.target.value,10));
  updateRadarUI();
});

function radarTogglePlay(){
  if(_rTimer){
    clearInterval(_rTimer);_rTimer=null;
    $('radarPlayBtn').textContent='▶';
    return;
  }
  $('radarPlayBtn').textContent='⏸';
  _rTimer=setInterval(()=>{
    const next=(_rIdx+1)%_rFrames.length;
    showRadarFrame(next);updateRadarUI();
  },500);
}

// ─── STACIJU TABULU REDZAMĪBA (atkarīga no ieķeksētajiem kartes slāņiem) ───
let _lvcLayerActive=true, _lvgmcLayerActive=true, _activeStationTab='lvc';

function updateStationTablesVisibility(){
  const card=$('stationTablesCard'), tabs=$('tableTabs');
  const lvcWrap=$('lvcTableWrap'), lvgmcWrap=$('lvgmcTableWrap');

  if(!_lvcLayerActive && !_lvgmcLayerActive){
    card.style.display='none';
    return;
  }
  card.style.display='block';

  if(_lvcLayerActive && _lvgmcLayerActive){
    tabs.style.display='flex';
    lvcWrap.style.display=_activeStationTab==='lvc'?'block':'none';
    lvgmcWrap.style.display=_activeStationTab==='lvgmc'?'block':'none';
  }else{
    tabs.style.display='none';
    lvcWrap.style.display=_lvcLayerActive?'block':'none';
    lvgmcWrap.style.display=_lvgmcLayerActive?'block':'none';
  }
}

function showStationTable(which){
  _activeStationTab=which;
  document.querySelectorAll('#tableTabs .mt').forEach(b=>b.classList.remove('on'));
  $(which==='lvc'?'tabLvcBtn':'tabLvgmcBtn').classList.add('on');
  updateStationTablesVisibility();
}

// ─── LVC CEĻA METEOSTACIJAS ─────────────────────────────────────────────────
const LVC_API='https://lvc-meteo-proxy.jkedainis.workers.dev/';
const LVC_TTL=10*60*1000; // 10 min - Worker pats atjaunojas ik 15 min, biežāk nav jēgas prasīt
let _lvcLayer=null, _lvcStations=[], _lvcRows=[], _lvcFetchedAt=0, _lvcSort={key:'dist',dir:1}, _lvcMarkerList=[];
const LVC_LABEL_W=38, LVC_LABEL_H=15, LVC_LABEL_GAP=3; // aptuvens marķiera uzraksta izmērs px, sadursmju noteikšanai

const ROAD_COND_LV={dry:'Sauss',wet:'Slapjš',moist:'Mitrs',frost:'Sarma',iceOrSnowOnRoad:'Apledojums/sniegs',wetAndDirty:'Slapjš, netīrs'};
const roadCondLv=c=>c?(ROAD_COND_LV[c]||c):'-';

// Haversine attālums km starp divām WGS84 koordinātēm
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

async function ensureLvcStations(){
  if(Date.now()-_lvcFetchedAt<LVC_TTL && _lvcStations.length){
    renderLvcRows(); // dati svaigi - tikai pārrēķina attālumus jaunajai atrašanās vietai
    return;
  }
  try{
    const r=await fetch(LVC_API);
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    _lvcStations=d.stations||[];
    _lvcFetchedAt=Date.now();
    renderLvcRows();
  }catch{
    $('lvcMeta').textContent='Neizdevās ielādēt ceļa meteostaciju datus.';
  }
}

// Pārrēķina attālumus pret pašreizējo atrašanās vietu, kārto un pārzīmē marķierus + tabulu
function renderLvcRows(){
  _lvcRows=_lvcStations.map(s=>({...s,dist:haversineKm(S.lat,S.lon,s.lat,s.lon)}));
  sortLvcRows(_lvcSort.key,true);
}

function sortLvcRows(key,keepDir){
  if(!keepDir){
    _lvcSort.dir=(_lvcSort.key===key)?-_lvcSort.dir:1;
    _lvcSort.key=key;
  }
  const dir=_lvcSort.dir;
  _lvcRows.sort((a,b)=>{
    let av=a[key],bv=b[key];
    if(typeof av==='string'||typeof bv==='string'){av=av||'';bv=bv||'';return dir*String(av).localeCompare(String(bv),'lv');}
    if(av==null)av=Infinity; if(bv==null)bv=Infinity;
    return dir*(av-bv);
  });
  renderLvcMarkers();
  renderLvcTable();
}

function bindLvcTableSorting(){
  document.querySelectorAll('#lvcTable th[data-sort]').forEach(th=>{
    th.addEventListener('click',()=>{
      document.querySelectorAll('#lvcTable th').forEach(t=>t.classList.remove('sort-on'));
      th.classList.add('sort-on');
      sortLvcRows(th.dataset.sort);
    });
  });
}

function renderLvcMarkers(){
  if(!_lvcLayer)return;
  _lvcLayer.clearLayers();
  _lvcMarkerList=[];
  for(const s of _lvcRows){
    if(s.airTemp==null)continue;
    // Pats žetons IR marķieris - nav atsevišķa punkta. iconAnchor:[0,0] +
    // CSS transform:translate(-50%,-50%) centrē žetonu tieši uz koordinātas
    // neatkarīgi no teksta garuma (piem. "-12.3°" pret "+9°").
    const marker=L.marker([s.lat,s.lon],{
      icon:L.divIcon({
        className:'lvc-marker-icon',
        html:`<div class="lvc-temp-badge">${round(s.airTemp,1)}°</div>`,
        iconSize:[0,0],
        iconAnchor:[0,0],
      })
    }).bindPopup(lvcPopupContent(s)).addTo(_lvcLayer);
    _lvcMarkerList.push(marker);
  }
  $('lvcMeta').textContent=`Dati: transportdata.gov.lv (LVC) · ${_lvcRows.length} stacijas`;
  declutterBadges(_lvcMarkerList);
}

function setBadgeVisible(marker,visible){
  const el=marker.getElement();
  const badge=el&&el.querySelector('.lvc-temp-badge');
  if(badge)badge.classList.toggle('lvc-hidden',!visible);
}

// Paslēpj žetonus, kas savstarpēji pārklātos ekrānā - tuvākie kartes centram
// "uzvar" un paliek redzami, tālākie/blīvākie paslēpjas, kamēr netiek tuvināts.
// Vispārīga - izmanto gan LVC, gan LVĢMC slānim (katram sava marķieru saraksta).
function declutterBadges(markerList){
  if(!_rMap||!markerList.length)return;
  const bounds=_rMap.getBounds();
  const centerPt=_rMap.latLngToContainerPoint(_rMap.getCenter());

  const visible=markerList
    .filter(m=>bounds.contains(m.getLatLng()))
    .map(m=>{
      const pt=_rMap.latLngToContainerPoint(m.getLatLng());
      return {m,pt,d:pt.distanceTo(centerPt)};
    })
    .sort((a,b)=>a.d-b.d);

  const placed=[];
  for(const{m,pt}of visible){
    const box={
      left:pt.x-LVC_LABEL_W/2, right:pt.x+LVC_LABEL_W/2,
      top:pt.y-LVC_LABEL_H/2, bottom:pt.y+LVC_LABEL_H/2,
    };
    const overlaps=placed.some(b=>
      box.left<b.right+LVC_LABEL_GAP && box.right>b.left-LVC_LABEL_GAP &&
      box.top<b.bottom+LVC_LABEL_GAP && box.bottom>b.top-LVC_LABEL_GAP
    );
    if(overlaps){ setBadgeVisible(m,false); }
    else{ setBadgeVisible(m,true); placed.push(box); }
  }
  for(const m of markerList){
    if(!bounds.contains(m.getLatLng()))setBadgeVisible(m,false);
  }
}

function declutterAllBadges(){
  declutterBadges(_lvcMarkerList);
  declutterBadges(_lvgmcMarkerList);
}

// DOM elements (nevis string HTML) - lai stacijas nosaukums un cita ārējo datu
// virkne vienmēr iet caur textContent, nevis innerHTML (sk. app.js XSS piezīmi augstāk)
function lvcPopupContent(s){
  const box=document.createElement('div');
  box.className='lvc-popup';

  const h=document.createElement('h4');
  h.textContent=s.name;
  box.appendChild(h);

  const dist=document.createElement('div');
  dist.className='lvc-dist';
  dist.textContent=`${round(s.dist,1)} km attālumā`;
  box.appendChild(dist);

  const rows=[
    ['Gaisa temp.',s.airTemp!=null?`${round(s.airTemp,1)}°C`:'-'],
    ['Ceļa virsmas temp.',s.surfaceTemp!=null?`${round(s.surfaceTemp,1)}°C`:'-'],
    ['Rasas punkts',s.dewPoint!=null?`${round(s.dewPoint,1)}°C`:'-'],
    ['Mitrums',s.humidity!=null?`${round(s.humidity,0)}%`:'-'],
    ['Nokrišņi',s.precipMmH!=null?`${round(s.precipMmH,1)} mm/h`:'-'],
    ['Redzamība',s.visibilityM!=null?`${round(s.visibilityM/1000,1)} km`:'-'],
    ['Ceļa stāvoklis',roadCondLv(s.roadCondition)],
  ];
  const tbl=document.createElement('table');
  for(const[label,val]of rows){
    const tr=document.createElement('tr');
    const td1=document.createElement('td'); td1.textContent=label;
    const td2=document.createElement('td'); td2.textContent=val;
    tr.append(td1,td2);
    tbl.appendChild(tr);
  }
  box.appendChild(tbl);

  const histBtn=document.createElement('a');
  histBtn.className='mt';
  histBtn.style.marginTop='8px';
  histBtn.style.display='inline-block';
  histBtn.style.textDecoration='none';
  histBtn.textContent='24h vēsture ->';
  histBtn.href=`stacija.html?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}&lat=${s.lat}&lon=${s.lon}`;
  box.appendChild(histBtn);

  return box;
}

function renderLvcTable(){
  const tbody=$('lvcBody');
  tbody.textContent='';
  for(const s of _lvcRows){
    const tr=document.createElement('tr');
    tr.addEventListener('click',()=>{
      location.href=`stacija.html?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}&lat=${s.lat}&lon=${s.lon}`;
    });

    const tdName=document.createElement('td'); tdName.textContent=s.name;
    const tdDist=document.createElement('td'); tdDist.textContent=`${round(s.dist,1)} km`;
    const tdTime=document.createElement('td'); tdTime.textContent=s.time?fmtStationTime(s.time):'-';
    const tdAir=document.createElement('td'); tdAir.textContent=s.airTemp!=null?`${round(s.airTemp,1)}°`:'-'; tdAir.className=tempCls(s.airTemp);
    const tdSurf=document.createElement('td'); tdSurf.textContent=s.surfaceTemp!=null?`${round(s.surfaceTemp,1)}°`:'-'; tdSurf.className=tempCls(s.surfaceTemp);
    const tdHum=document.createElement('td'); tdHum.textContent=s.humidity!=null?`${round(s.humidity,0)}%`:'-';
    const tdPrecip=document.createElement('td'); tdPrecip.textContent=s.precipMmH!=null?`${round(s.precipMmH,1)} mm/h`:'-';
    const tdCond=document.createElement('td'); tdCond.textContent=roadCondLv(s.roadCondition);
    const tdMin=document.createElement('td'); tdMin.textContent=s.minTemp!=null?`${round(s.minTemp,1)}°`:'-'; tdMin.className=tempCls(s.minTemp);
    const tdMax=document.createElement('td'); tdMax.textContent=s.maxTemp!=null?`${round(s.maxTemp,1)}°`:'-'; tdMax.className=tempCls(s.maxTemp);

    tr.append(tdName,tdDist,tdTime,tdAir,tdSurf,tdHum,tdPrecip,tdCond,tdMin,tdMax);
    tbody.appendChild(tr);
  }
}

// ─── LVĢMC METEOSTACIJAS ─────────────────────────────────────────────────────
const LVGMC_API='https://lvgmc-meteo-proxy.jkedainis.workers.dev/';
const LVGMC_TTL=10*60*1000; // Worker pats kešo uz 10 min (avots atjaunojas ik stundu)
let _lvgmcLayer=null, _lvgmcStations=[], _lvgmcRows=[], _lvgmcFetchedAt=0, _lvgmcSort={key:'dist',dir:1}, _lvgmcMarkerList=[];

const LVGMC_WIND_LABELS=['Z','ZZA','ZA','AZA','A','ADA','DA','DDA','D','DDR','DR','RDR','R','RZR','ZR','ZZR'];
const fmtStationTime=iso=>new Date(iso).toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'});
const lvgmcWindDirLv=deg=>deg==null?'':LVGMC_WIND_LABELS[Math.round(deg/22.5)%16];

async function ensureLvgmcStations(){
  if(Date.now()-_lvgmcFetchedAt<LVGMC_TTL && _lvgmcStations.length){
    renderLvgmcRows();
    return;
  }
  try{
    const r=await fetch(LVGMC_API);
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    _lvgmcStations=d.stations||[];
    _lvgmcFetchedAt=Date.now();
    renderLvgmcRows();
  }catch{
    $('lvgmcMeta').textContent='Neizdevās ielādēt LVĢMC staciju datus.';
  }
}

// Worker atdod pilnu vēsturi katrai stacijai - šeit paņemam tikai jaunāko ierakstu tabulai/kartei
function renderLvgmcRows(){
  _lvgmcRows=_lvgmcStations
    .map(s=>{
      const latest=s.history?.[s.history.length-1]||{};
      return {...s, ...latest, dist:haversineKm(S.lat,S.lon,s.lat,s.lon)};
    })
    // Dažas LVĢMC stacijas mēra TIKAI nokrišņus/sniegu (nav temp./vēja/mitruma sensoru) -
    // izlaižam tās, lai tabulā nav rindu ar gandrīz visur "-" (tāpat kā meteolapa.lv dara)
    .filter(s=>s.airTemp!=null);
  sortLvgmcRows(_lvgmcSort.key,true);
}

function sortLvgmcRows(key,keepDir){
  if(!keepDir){
    _lvgmcSort.dir=(_lvgmcSort.key===key)?-_lvgmcSort.dir:1;
    _lvgmcSort.key=key;
  }
  const dir=_lvgmcSort.dir;
  _lvgmcRows.sort((a,b)=>{
    let av=a[key],bv=b[key];
    if(typeof av==='string'||typeof bv==='string'){av=av||'';bv=bv||'';return dir*String(av).localeCompare(String(bv),'lv');}
    if(av==null)av=Infinity; if(bv==null)bv=Infinity;
    return dir*(av-bv);
  });
  renderLvgmcMarkers();
  renderLvgmcTable();
}

function bindLvgmcTableSorting(){
  document.querySelectorAll('#lvgmcTable th[data-sort]').forEach(th=>{
    th.addEventListener('click',()=>{
      document.querySelectorAll('#lvgmcTable th').forEach(t=>t.classList.remove('sort-on'));
      th.classList.add('sort-on');
      sortLvgmcRows(th.dataset.sort);
    });
  });
}

function renderLvgmcMarkers(){
  if(!_lvgmcLayer)return;
  _lvgmcLayer.clearLayers();
  _lvgmcMarkerList=[];
  for(const s of _lvgmcRows){
    if(s.airTemp==null)continue;
    const marker=L.marker([s.lat,s.lon],{
      icon:L.divIcon({
        className:'lvc-marker-icon',
        html:`<div class="lvc-temp-badge badge-lvgmc">${round(s.airTemp,1)}°</div>`,
        iconSize:[0,0],
        iconAnchor:[0,0],
      })
    }).bindPopup(lvgmcPopupContent(s)).addTo(_lvgmcLayer);
    _lvgmcMarkerList.push(marker);
  }
  $('lvgmcMeta').textContent=`Dati: data.gov.lv (LVĢMC) · ${_lvgmcRows.length} stacijas`;
  declutterBadges(_lvgmcMarkerList);
}

function lvgmcPopupContent(s){
  const box=document.createElement('div');
  box.className='lvc-popup';

  const h=document.createElement('h4');
  h.textContent=s.name;
  box.appendChild(h);

  const dist=document.createElement('div');
  dist.className='lvc-dist';
  dist.textContent=`${round(s.dist,1)} km attālumā`;
  box.appendChild(dist);

  const rows=[
    ['Gaisa temp.',s.airTemp!=null?`${round(s.airTemp,1)}°C`:'-'],
    ['Sajūtu temp.',s.feelsLike!=null?`${round(s.feelsLike,1)}°C`:'-'],
    ['24h min / max',(s.minTemp!=null&&s.maxTemp!=null)?`${round(s.minTemp,1)}° / ${round(s.maxTemp,1)}°`:'-'],
    ['Vējš',s.windSpeed!=null?`${round(s.windSpeed,1)} m/s ${lvgmcWindDirLv(s.windDir)}`:'-'],
    ['Brāzmas',s.windGust!=null?`${round(s.windGust,1)} m/s`:'-'],
    ['Mitrums',s.humidity!=null?`${round(s.humidity,0)}%`:'-'],
    ['Spiediens',s.pressure!=null?`${round(s.pressure,1)} hPa`:'-'],
    ['Nokrišņi (h)',s.precipHour!=null?`${round(s.precipHour,1)} mm`:'-'],
    ['Redzamība',s.visibility!=null?`${round(s.visibility/1000,1)} km`:'-'],
    ['UV indekss',s.uv!=null?round(s.uv,0):'-'],
  ];
  const tbl=document.createElement('table');
  for(const[label,val]of rows){
    const tr=document.createElement('tr');
    const td1=document.createElement('td'); td1.textContent=label;
    const td2=document.createElement('td'); td2.textContent=val;
    tr.append(td1,td2);
    tbl.appendChild(tr);
  }
  box.appendChild(tbl);

  const histBtn=document.createElement('a');
  histBtn.className='mt';
  histBtn.style.marginTop='8px';
  histBtn.style.display='inline-block';
  histBtn.style.textDecoration='none';
  histBtn.textContent='24h vēsture ->';
  histBtn.href=`stacija-lvgmc.html?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}&lat=${s.lat}&lon=${s.lon}`;
  box.appendChild(histBtn);

  return box;
}

function renderLvgmcTable(){
  const tbody=$('lvgmcBody');
  tbody.textContent='';
  for(const s of _lvgmcRows){
    const tr=document.createElement('tr');
    tr.addEventListener('click',()=>{
      location.href=`stacija-lvgmc.html?id=${encodeURIComponent(s.id)}&name=${encodeURIComponent(s.name)}&lat=${s.lat}&lon=${s.lon}`;
    });

    const tdName=document.createElement('td'); tdName.textContent=s.name;
    const tdDist=document.createElement('td'); tdDist.textContent=`${round(s.dist,1)} km`;
    const tdTime=document.createElement('td'); tdTime.textContent=s.time?fmtStationTime(s.time):'-';
    const tdAir=document.createElement('td'); tdAir.textContent=s.airTemp!=null?`${round(s.airTemp,1)}°`:'-'; tdAir.className=tempCls(s.airTemp);
    const tdFeels=document.createElement('td'); tdFeels.textContent=s.feelsLike!=null?`${round(s.feelsLike,1)}°`:'-'; tdFeels.className=tempCls(s.feelsLike);
    const tdWind=document.createElement('td'); tdWind.textContent=s.windSpeed!=null?`${round(s.windSpeed,1)} m/s`:'-';
    const tdHum=document.createElement('td'); tdHum.textContent=s.humidity!=null?`${round(s.humidity,0)}%`:'-';
    const tdPrecip=document.createElement('td'); tdPrecip.textContent=s.precipHour!=null?`${round(s.precipHour,1)} mm`:'-';
    const tdMin=document.createElement('td'); tdMin.textContent=s.minTemp!=null?`${round(s.minTemp,1)}°`:'-'; tdMin.className=tempCls(s.minTemp);
    const tdMax=document.createElement('td'); tdMax.textContent=s.maxTemp!=null?`${round(s.maxTemp,1)}°`:'-'; tdMax.className=tempCls(s.maxTemp);

    tr.append(tdName,tdDist,tdTime,tdAir,tdFeels,tdWind,tdHum,tdPrecip,tdMin,tdMax);
    tbody.appendChild(tr);
  }
}


// ─── INIT ─────────────────────────────────────────────────────────────────────
loadFromURL();
renderThemeIcon();
buildToggles();
buildModelInfo();
// If URL already has coordinates (shared link), load immediately; otherwise auto-geolocate
if(new URLSearchParams(location.search).has('lat')){
  loadAll();
}else{
  locateMe(true);
}
// Worker pats atjaunojas ik 15 min; šis tikai paņem jaunāko, kad karte jau atvērta
setInterval(()=>{ if(_rMap){ ensureLvcStations(); ensureLvgmcStations(); } },5*60*1000);

// #tab-radar saitē (piem. no stacija.html "Atpakaļ") - atver Radar cilni uzreiz,
// nevis tikai pielaiž lapu (cilnes pārslēdzas ar JS, ne pārlūka noklusēto hash rullēšanu)
if(location.hash==='#tab-radar'){
  switchTab('radar',$('tabRadarBtn'));
}
