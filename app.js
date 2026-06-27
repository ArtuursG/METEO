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
  { id:'access_global',             name:'ACCESS-G',      flag:'🇦🇺', org:'BOM (Australia)',      res:'12km',  days:10, color:'#9085e9', dash:[10,3,2,3] },
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
// Single mutable state object — all UI reads from here, all updates write here
const S = {
  lat:56.946, lon:24.106,       // default: Riga, Latvia
  city:'Rīga', country:'Latvija',
  active: new Set(MODELS.map(m=>m.id)), // which models are shown on the temp chart
  tableModel:   'ecmwf_ifs025',
  precipModels: new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  windModels:   new Set(['ecmwf_ifs025','icon_eu','metno_seamless']),
  windUnit: localStorage.getItem('wind_unit')||'m/s', // 'm/s' or 'km/h'
  data: {},    // keyed by model id, holds raw Open-Meteo API responses
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
const CACHE_PFX='wx4_';

function getCached(id,lat,lon){
  try{
    const raw=localStorage.getItem(`${CACHE_PFX}${id}_${lat.toFixed(3)}_${lon.toFixed(3)}`);
    if(!raw)return null;
    const{ts,d}=JSON.parse(raw);
    return Date.now()-ts<CACHE_TTL?d:null;
  }catch{return null;}
}

function setCache(id,lat,lon,d){
  try{localStorage.setItem(`${CACHE_PFX}${id}_${lat.toFixed(3)}_${lon.toFixed(3)}`,JSON.stringify({ts:Date.now(),d}));}catch{}
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

// Returns an SVG arrow rotated to the wind direction, paired with a short label
function wDir(deg){
  if(deg==null)return '-';
  const labels=['Z','ZZA','ZA','AZA','A','ADA','DA','DDA','D','DDR','DR','RDR','R','RZR','ZR','ZZR'];
  const label=labels[Math.round(deg/22.5)%16];
  const arrow=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:middle;transform:rotate(${deg}deg)"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg> ${label}`;
  return arrow;
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

function showChart(loadId,canvasId){
  $(loadId).style.display='none';
  $(canvasId).style.display='block';
}

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
function rebuildTempChart(){
  const first=Object.values(S.data)[0];
  if(!first?.hourly?.time)return;
  const chartDefaults=CD();
  const labels=first.hourly.time.map(fmtHour);
  const datasets=MODELS
    .filter(m=>S.data[m.id]?.hourly?.temperature_2m&&S.active.has(m.id))
    .map(m=>({
      label:m.name,
      data:S.data[m.id].hourly.temperature_2m,
      borderColor:m.color,
      borderWidth:1.5,
      pointRadius:0,
      tension:0.3,
      fill:false,
    }));
  showChart('loadT','cT');
  if(S.charts.temp)S.charts.temp.destroy();
  S.charts.temp=new Chart($('cT'),{
    type:'line',data:{labels,datasets},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'°C'}}
      },
      plugins:{...chartDefaults.plugins,
        tooltip:{...chartDefaults.plugins.tooltip,
          callbacks:{
            title:items=>fmtTooltipTitle(first.hourly.time,items[0].dataIndex),
            label:c=>` ${c.dataset.label}: ${round(c.parsed.y)}°C`
          }
        }
      }
    }
  });
  buildLegend('legT',MODELS.filter(m=>S.data[m.id]&&S.active.has(m.id)));
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

  // Precipitation probability chart — always shows all available models
  showChart('loadPP','cPP');
  if(S.charts.precipP)S.charts.precipP.destroy();
  const ppDatasets=MODELS
    .filter(m=>S.data[m.id]?.hourly?.precipitation_probability)
    .map(m=>({
      label:m.name,data:S.data[m.id].hourly.precipitation_probability,
      borderColor:m.color,borderWidth:1.5,pointRadius:0,tension:0.3,fill:false
    }));
  if(ppDatasets.length){
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
    $('cPP').replaceWith(Object.assign(document.createElement('p'),{textContent:'Nokrišņu varbūtības dati nav pieejami šiem modeļiem.',style:'color:var(--t3);font-size:13px;padding:1rem 0'}));
  }
}

// ─── WIND CHART ──────────────────────────────────────────────────────────────
function buildWindChart(){
  mkMultiSelector('windCardHd','windModels',`Vēja ātrums 10m (${S.windUnit})`,buildWindChart);

  // Unit toggle — inserted between the title and the model selector
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
    .filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.windspeed_10m)
    .map(m=>({
      label:m.name,
      data:S.data[m.id].hourly.windspeed_10m.map(v=>windConv(v)),
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
  buildLegend('legW',MODELS.filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.windspeed_10m));
}

function setWindUnit(u){
  S.windUnit=u;
  try{localStorage.setItem('wind_unit',u);}catch{}
  updateMetrics();
  buildWindChart();
  buildTable();
}

// ─── FORECAST TABLE ───────────────────────────────────────────────────────────
function buildTable(){
  mkModelSelector('tableCardHd','tableModel','Prognoze pa dienām',buildTable);

  const src=S.data[S.tableModel]||S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!src?.daily?.time)return;
  const {time,temperature_2m_max:tmax,temperature_2m_min:tmin,precipitation_sum:ps,
         precipitation_probability_max:ppm,windspeed_10m_max:wmax,
         relative_humidity_2m_mean:rh,weathercode:wc,cloudcover_mean:cc}=src.daily;
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
// Populates the metrics row and hero sunrise/sunset using ECMWF as primary source
function updateMetrics(){
  const ecmwf=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!ecmwf)return;
  const c=ecmwf.current;
  if(c){
    $('curTemp').innerHTML=`${r0(c.temperature_2m)}<span>°C</span>`;
    $('curDesc').innerHTML='<span class="wico">'+wIcon(c.weathercode)+'</span>'+wText(c.weathercode);
    const fl=r0(c.apparent_temperature);
    $('feelsLike').innerHTML=`${fl!=null?fl:'-'}<span>°C</span>`;
    const diff=fl!=null&&c.temperature_2m!=null?fl-Math.round(c.temperature_2m):null;
    $('feelsDesc').textContent=diff==null?'-':diff>1?'Siltāk nekā ir':diff<-1?'Aukstāk nekā ir':'Atbilst temperatūrai';
    $('windNow').innerHTML=`${windConv(c.windspeed_10m)}<span>${S.windUnit}</span>`;
    $('windDir').innerHTML=`Virziens: ${wDir(c.winddirection_10m)}`;
    $('humNow').innerHTML=`${r0(c.relative_humidity_2m)}<span>%</span>`;
    $('precipNow').textContent=`Nokrišņi: ${round(c.precipitation,1)} mm`;
  }
  if(ecmwf.daily?.temperature_2m_max?.[0]!=null){
    $('todayMax').innerHTML=`${r0(ecmwf.daily.temperature_2m_max[0])}<span>°C</span>`;
    $('todayMin').textContent=`Min: ${r0(ecmwf.daily.temperature_2m_min?.[0])}°C`;
  }
  $('lastUpdate').textContent=`Atjaunots: ${new Date().toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'})}`;
  const srcModel=S.data['ecmwf_ifs025']?'ECMWF IFS':(Object.keys(S.data)[0]||'?');
  const srcEl=$('metricsSrc');
  if(srcEl)srcEl.textContent=`Pašreizējie dati: ${srcModel}`;
  // Sunrise/sunset times are in the daily[0] slot as ISO strings with local timezone offset
  if(ecmwf.daily?.sunrise?.[0]&&ecmwf.daily?.sunset?.[0]){
    const fmt=iso=>new Date(iso).toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'});
    const rise=fmt(ecmwf.daily.sunrise[0]),set=fmt(ecmwf.daily.sunset[0]);
    const sunEl=$('heroSun');
    if(sunEl)sunEl.innerHTML=
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/></svg>${rise}&nbsp;&nbsp;<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M12 16v2M4.22 4.22l1.42 1.42M18.36 4.22l-1.42 1.42M2 10h2M20 10h2"/><path d="M5 19h14"/><path d="M19 14l-7 5-7-5" stroke-width="1.5"/></svg>${set}`;
  }
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────
// Returns cached data if fresh, otherwise fetches from Open-Meteo API
async function fetchModel(m){
  const hit=getCached(m.id,S.lat,S.lon);
  if(hit)return hit;
  const vars='temperature_2m,precipitation,precipitation_probability,windspeed_10m';
  const dvars='temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max,relative_humidity_2m_mean,weathercode,cloudcover_mean,sunrise,sunset';
  const cur='temperature_2m,apparent_temperature,relative_humidity_2m,windspeed_10m,winddirection_10m,weathercode,precipitation';
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}&models=${m.id}&hourly=${vars}&daily=${dvars}&current=${cur}&timezone=auto&forecast_days=16&wind_speed_unit=ms`;
  const r=await fetch(url);
  if(!r.ok)throw new Error(r.status);
  const data=await r.json();
  setCache(m.id,S.lat,S.lon,data);
  return data;
}

// Fetches all models in parallel; individual failures are silently skipped
async function loadAll(){
  let loaded=0;
  S.data={};
  $('loadT').style.display='flex';
  $('loadT').innerHTML=`<div class="spinner"></div>Ielādē datus no <span id="loadCount">0</span>/${MODELS.length} modeļiem...`;

  await Promise.allSettled(MODELS.map(m=>
    fetchModel(m).then(d=>{
      S.data[m.id]=d;
      loaded++;
      $('loadCount').textContent=loaded;
      return {id:m.id,d};
    })
  ));

  if(!Object.keys(S.data).length){
    ['loadT','loadP','loadPP','loadW','loadTbl'].forEach(id=>{
      $(id).innerHTML='<div class="err">Neizdevās ielādēt datus. Pārbaudiet interneta savienojumu.</div>';
    });
    return;
  }

  updateMetrics();
  rebuildTempChart();
  buildPrecipCharts();
  buildWindChart();
  buildTable();
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
    if(e.name==='AbortError')return; // superseded by a newer request — ignore silently
    drop.innerHTML=`<div class="city-opt" style="color:#e66767;cursor:default">Kļūda: ${e.message}</div>`;
  }
}

// Updates state, URL, recent history and reloads all model data for the new location
async function selectCity(g){
  S.lat=g.latitude; S.lon=g.longitude;
  S.city=g.name; S.country=g.country||'';
  $('cityName').textContent=g.name;
  $('heroSub').textContent=`${[g.admin1,g.country].filter(Boolean).join(', ')}${g.timezone?' · '+g.timezone:''}`;
  updateURL();
  saveRecent(g);

  Object.values(S.charts).forEach(c=>c?.destroy?.());
  S.charts={}; S.data={};

  ['loadP','loadPP','loadW','loadTbl'].forEach(id=>{
    const el=$(id); el.style.display='flex';
    el.innerHTML='<div class="spinner"></div>Ielādē...';
  });
  ['cT','cP','cPP','cW'].forEach(id=>{const c=$(id);if(c)c.style.display='none';});
  $('forecastTable').style.display='none';

  buildToggles();
  await loadAll();
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

function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('theme',t);}catch(e){}
  renderThemeIcon();
  rerenderCharts();
}

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
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
function shareWA(){
  const url=window.location.href;
  const text=`Laika prognoze — ${S.city} | prognoze.lv`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text+'\n'+url)}`,'_blank');
}

function shareTG(){
  const url=window.location.href;
  const text=`Laika prognoze — ${S.city}`;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,'_blank');
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────
// Uses Nominatim reverse geocoding to resolve browser coordinates to a city name
async function locateMe(){
  if(!navigator.geolocation)return;
  const btn=document.querySelector('.lbtn');
  if(btn)btn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      if(btn)btn.classList.remove('loading');
      const{latitude:lat,longitude:lon}=pos.coords;
      try{
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=lv`);
        const d=await r.json();
        const city=d.address?.city||d.address?.town||d.address?.village||d.address?.county||'Mana atrašanās vieta';
        selectCity({latitude:lat,longitude:lon,name:city,country:d.address?.country||'',admin1:d.address?.state||'',timezone:''});
      }catch{
        selectCity({latitude:lat,longitude:lon,name:'Mana atrašanās vieta',country:'',admin1:'',timezone:''});
      }
    },
    ()=>{if(btn)btn.classList.remove('loading');}
  );
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadFromURL();
renderThemeIcon();
buildToggles();
buildModelInfo();
loadAll();
