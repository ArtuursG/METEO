// ─── LVC CEĻA METEOSTACIJAS - ATSEVIŠĶA STACIJAS LAPA ──────────────────────────
// Patstāvīga lapa (nav atkarīga no app.js ielādes secības) - atver, kad
// klikšķina uz stacijas galvenās lapas Radar tabulā. Stacijas id nāk no
// URL parametra ?id=... (papildus &name=, &lat=, &lon= tūlītējai parādīšanai
// pirms datu ielādes un mini-kartei).

const $=id=>document.getElementById(id);
// Skaitļi ar decimālkomatu latviski (punktu angliski); '-', ja vērtības nav
const fmtN=(v,d=1)=>v==null||!Number.isFinite(+v)?'-':(+v).toLocaleString(LOCALE,{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtT=v=>v==null||!Number.isFinite(+v)?'-':fmtN(Math.abs(+v)<0.05?0:v,1)+'°';
const _mapLayers=[];
const mapTileUrl=part=>`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${document.documentElement.getAttribute('data-theme')==='dark'?'Dark':'Light'}_Gray_${part}/MapServer/tile/{z}/{y}/{x}`;
const LVC_API='https://lvc-meteo-proxy.jkedainis.workers.dev/';
const HOURS=24;

applyStaticI18n();

const ROAD_COND_KEY={dry:'road.dry',wet:'road.wet',moist:'road.moist',frost:'road.frost',iceOrSnowOnRoad:'road.ice',wetAndDirty:'road.wetdirty'};
const roadCondLv=c=>c?(ROAD_COND_KEY[c]?t(ROAD_COND_KEY[c]):c):'-';

const windDirLv=deg=>deg==null?'':COMPASS[LANG][compassIndex(deg)];
const noData=()=>t('stp.no_data');

function fmtTime(iso){
  return chartTimeLabel(iso,LOCALE,'Europe/Riga');
}

// Lapas stāvoklis: no tā pārzīmē visu tekstu pēc valodas vai tēmas maiņas.
// status: loading | no_id | empty | error | ok
const P={id:null,name:null,lat:NaN,lon:NaN,status:'loading',hist:[]};

// ─── TĒMA UN VALODA ─────────────────────────────────────────────────────────
const TT_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="3.9" y1="3.9" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.1" y2="20.1"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="3.9" y1="20.1" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.1" y2="3.9"/></svg>';
const TT_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function renderThemeIcon(){
  const th=document.documentElement.getAttribute('data-theme');
  $('themeToggle').innerHTML=th==='light'?TT_MOON:TT_SUN;
}
function setTheme(th){
  document.documentElement.setAttribute('data-theme',th);
  try{localStorage.setItem('theme',th);}catch(e){}
  renderThemeIcon();
  if(P.status==='ok')renderCharts();
  _mapLayers.forEach(({layer,part})=>layer.setUrl(mapTileUrl(part)));
}
$('themeToggle').addEventListener('click',()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='light'?'dark':'light');
});
$('langToggle').addEventListener('click',()=>setLang(LANG==='lv'?'en':'lv'));
renderThemeIcon();

// setLang (i18n.js) izsauc šo pēc statisko [data-i18n] tekstu nomaiņas
function relangUI(){renderPage();}

// ─── CHART DEFAULTS (tāds pats paraugs kā app.js CD()) ─────────────────────
function CD(){
  const cs=getComputedStyle(document.body);
  const v=n=>cs.getPropertyValue(n).trim();
  return {
    responsive:true,maintainAspectRatio:false,animation:{duration:300},
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:true,position:'bottom',labels:{color:v('--t3'),boxWidth:10,font:{size:11}}},
      tooltip:{backgroundColor:v('--chart-tip-bg'),borderColor:v('--chart-tip-border'),borderWidth:1,
        titleColor:v('--chart-tip-title'),bodyColor:v('--chart-tip-body'),padding:11,cornerRadius:7},
    },
    scales:{
      x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:window.innerWidth<=600?4:8,maxRotation:0,autoSkip:true},grid:{color:v('--chart-grid')}},
      y:{ticks:{color:v('--chart-tick'),font:{size:11}},grid:{color:v('--chart-grid')}},
    }
  };
}

// ─── GRAFIKI ─────────────────────────────────────────────────────────────────
let _chart=null, _minMaxChart=null, _windChart=null, _miniMap=null;

// Grafika vietā ziņa (msg) vai pats grafiks (msg tukšs)
function chartBox(boxId,canvasId,msg){
  const box=$(boxId);
  if(msg)box.textContent=msg;
  box.style.display=msg?'':'none';
  $(canvasId).style.display=msg?'none':'block';
}

function renderChart(hist){
  chartBox('stLoading','stChart','');
  const labels=hist.map(h=>fmtTime(h.time));
  if(_chart)_chart.destroy();
  _chart=new Chart($('stChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_air'),data:hist.map(h=>h.airTemp),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_road'),data:hist.map(h=>h.surfaceTemp),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

// LVC nesūta gatavu "stundas min/max" (kā LVĢMC HATMN/HATMX) - mums ir tikai
// ~15 min rādījumi, tāpēc grupējam pēc kalendārās stundas un rēķinām min/max
// katrā stundā pašiem. Tas dod vienu punktu stundā, kas cieši seko dienas gaitai
// (nevis kāpnes vai slīdoša loga izgludinājumu).
function hourlyMinMax(hist){
  const buckets={};
  for(const h of hist){
    if(h.airTemp==null)continue;
    const d=new Date(h.time);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}`;
    if(!buckets[key])buckets[key]={min:h.airTemp,max:h.airTemp,time:h.time};
    else{
      if(h.airTemp<buckets[key].min)buckets[key].min=h.airTemp;
      if(h.airTemp>buckets[key].max)buckets[key].max=h.airTemp;
    }
  }
  return Object.values(buckets).sort((a,b)=>a.time<b.time?-1:1);
}

function renderMinMaxChart(hist){
  if(!hist.some(h=>h.airTemp!=null)){chartBox('stMinMaxLoading','stMinMaxChart',t('stp.no_temp'));return;}
  const buckets=hourlyMinMax(hist);
  chartBox('stMinMaxLoading','stMinMaxChart','');
  const labels=buckets.map(b=>fmtTime(b.time));
  if(_minMaxChart)_minMaxChart.destroy();
  _minMaxChart=new Chart($('stMinMaxChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_min'),data:buckets.map(b=>b.min),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_max'),data:buckets.map(b=>b.max),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderWindChart(hist){
  if(!hist.some(h=>h.windSpeed!=null)){chartBox('stWindLoading','stWindChart',t('stp.no_wind'));return;}
  chartBox('stWindLoading','stWindChart','');
  const labels=hist.map(h=>fmtTime(h.time));
  if(_windChart)_windChart.destroy();
  _windChart=new Chart($('stWindChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_wind_speed'),data:hist.map(h=>h.windSpeed),borderColor:'#7fb37a',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_gust'),data:hist.map(h=>h.windGust),borderColor:'#7fb37a',borderWidth:1.5,borderDash:[5,4],pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderCharts(){
  renderChart(P.hist);
  renderMinMaxChart(P.hist);
  renderWindChart(P.hist);
}

function renderMiniMap(lat,lon,name){
  if(lat==null||lon==null)return;
  _miniMap=L.map('stMiniMap',{zoomControl:false,attributionControl:true}).setView([lat,lon],11);
  // Esri Gray Canvas lapas tēmā (bez API atslēgas); pamatne un nosaukumu slānis atsevišķi
  for(const part of ['Base','Reference']){
    const layer=L.tileLayer(mapTileUrl(part),{attribution:'Tiles © Esri',maxZoom:16}).addTo(_miniMap);
    _mapLayers.push({layer,part});
  }
  const marker=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:'#e0796d',fillOpacity:0.95}).addTo(_miniMap);
  if(name)marker.bindTooltip(name,{permanent:false,direction:'top'});
}

// ─── TAGAD UN DETAĻAS ────────────────────────────────────────────────────────
// Temperatūras izmaiņa pēdējā stundā: "↑ 0,8° pēdējā stundā" (zem 0,3° - gandrīz bez izmaiņām)
function renderTrend(cur){
  const el=$('stTrend');
  const prev=prevReading(P.hist,cur.time);
  // Tikai svaigam mērījumam: veca rādījuma "pēdējā stunda" lasītāju maldinātu
  const fresh=Date.now()-parseStationTime(cur.time)<=90*60000;
  const tr=prev&&fresh?tempTrend(cur.airTemp,cur.time,prev.airTemp,prev.time):null;
  el.hidden=!tr;
  if(!tr)return;
  el.textContent=Math.abs(tr.delta)<0.3?t('stp.trend_flat'):t('stp.trend',{arrow:tr.delta>0?'↑':'↓',v:fmtT(Math.abs(tr.delta))});
  el.title=t('rad.trend_title',{v:(tr.delta>0?'+':'')+fmtT(tr.delta)});
}

// Nakts min un dienas max ar laiku, kad tie sasniegti; notiekošajam periodam "līdz šim"
function renderExtremes(samples){
  const per=synopticPeriods(Date.now());
  const show=(id,p,kind)=>{
    const x=periodExtreme(samples,p,kind);
    $(id).textContent=x?fmtT(x.v):'-';
    const at=x?samples.find(s=>s.t===x.t):null;
    $(id+'Time').textContent=at?fmtTime(at.time).join(' ')+(p.running?t('st.so_far'):''):'';
  };
  show('stMin',per.night,'min');
  show('stMax',per.day,'max');
}

function renderNow(){
  const hist=P.hist,cur=hist[hist.length-1];
  $('stAirTemp').textContent=fmtT(cur.airTemp);
  $('stTime').textContent=fmtTime(cur.time).join(' ');
  renderTrend(cur);
  $('stSurfTemp').textContent=fmtT(cur.surfaceTemp);
  $('stRoadCond').textContent=cur.roadCondition?roadCondLv(cur.roadCondition):'';

  // Sinoptiskais nakts minimums (18-06 UTC) un dienas maksimums (06-18 UTC) no rādījumiem
  renderExtremes(hist.map(h=>({t:parseStationTime(h.time),lo:h.airTemp,hi:h.airTemp,time:h.time})));

  $('dWind').textContent=cur.windSpeed!=null?`${fmtN(cur.windSpeed,1)} m/s ${windDirLv(cur.windDir)}`:noData();
  $('dGust').textContent=cur.windGust!=null?`${fmtN(cur.windGust,1)} m/s`:noData();
  $('dHum').textContent=cur.humidity!=null?`${fmtN(cur.humidity,0)}%`:noData();
  $('dPrecip').textContent=cur.precipMmH!=null?`${fmtN(cur.precipMmH,1)} mm/h`:noData();
  // Berzes koeficients 0-1: sauss asfalts ap 0,8, slapjš ap 0,5, ledus zem 0,3
  $('dFriction').textContent=cur.friction!=null?fmtN(cur.friction,2):noData();
  $('dDew').textContent=cur.dewPoint!=null?`${fmtN(cur.dewPoint,1)}°C`:noData();
  $('dVis').textContent=cur.visibilityM!=null?`${fmtN(cur.visibilityM/1000,1)} km`:noData();
  // com:distance DATEX II laukos ir metros (tāpat kā ledus biezums) - pārrēķina uz cm parastai sniega dziļuma vienībai
  $('dSnow').textContent=cur.snowDepthM!=null?`${fmtN(cur.snowDepthM*100,1)} cm`:noData();
}

// Viss dinamiskais teksts no P; izsauc pēc ielādes un pēc valodas maiņas
function renderPage(){
  const name=P.name||P.id;
  $('stName').textContent=P.status==='no_id'?t('stp.no_station'):name||t('metric.loading');
  $('stInfoName').textContent=name||'-';
  document.title=`${name||t('stp.road_station')} - prognoze.lv`;
  const titles={stChartTitle:t('stp.chart_temp_h',{h:HOURS}),stMinMaxTitle:t('stp.chart_minmax',{h:HOURS}),stWindTitle:t('stp.chart_wind',{h:HOURS})};
  for(const [id,text] of Object.entries(titles))$(id).textContent=text;
  $('stChart').setAttribute('aria-label',titles.stChartTitle);
  $('stMinMaxChart').setAttribute('aria-label',titles.stMinMaxTitle);
  $('stWindChart').setAttribute('aria-label',titles.stWindTitle);

  const boxes=msg=>{chartBox('stLoading','stChart',msg);chartBox('stMinMaxLoading','stMinMaxChart',msg);chartBox('stWindLoading','stWindChart',msg);};
  const meta=$('stChartMeta');
  if(P.status==='loading'){meta.textContent='';return;}
  if(P.status==='no_id'){meta.textContent=t('stp.missing_id');boxes(t('stp.no_data_short'));return;}
  if(P.status==='empty'){meta.textContent=t('stp.no_history');boxes(t('stp.no_data_short'));return;}
  if(P.status==='error'){meta.textContent=t('stp.load_failed');boxes(t('stp.load_error'));return;}
  meta.textContent=t('stp.measurements',{n:P.hist.length,h:HOURS});
  renderNow();
  try{renderCharts();}catch(e){boxes(t('stp.load_error'));}
}

// Saites virs nosaukuma: prognoze stacijas vietai galvenajā lapā.
// #today vajag, citādi galvenā lapa atvērtu pēdējo cilni (parasti radaru).
function renderLinks(){
  const link=$('stForecast');
  if(!Number.isFinite(P.lat)||!Number.isFinite(P.lon)){link.hidden=true;return;}
  link.href='index.html?'+new URLSearchParams({lat:P.lat,lon:P.lon,city:P.name||P.id||'',country:'Latvija'})+'#today';
  link.hidden=false;
}

// ─── DATU IELĀDE ─────────────────────────────────────────────────────────────
async function load(){
  const p=new URLSearchParams(location.search);
  P.id=p.get('id');
  P.name=p.get('name');
  P.lat=parseFloat(p.get('lat'));
  P.lon=parseFloat(p.get('lon'));
  renderLinks();
  if(!P.id){P.status='no_id';renderPage();return;}
  renderPage();
  if(Number.isFinite(P.lat)&&Number.isFinite(P.lon))renderMiniMap(P.lat,P.lon,P.name);
  await fetchHistory();
}

// Ielādē rādījumus; atkārtotā ielādē kļūdas gadījumā paliek iepriekšējie dati
let _loadedAt=0;
async function fetchHistory(){
  try{
    const r=await fetch(`${LVC_API}?station=${encodeURIComponent(P.id)}`);
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    P.hist=Array.isArray(d.history)?d.history:[];
    P.status=P.hist.length?'ok':'empty';
  }catch(e){
    if(P.status!=='ok')P.status='error';
  }
  _loadedAt=Date.now();
  renderPage();
}

// Kamēr lapa atvērta, dati atjaunojas ik 10 min, un uzreiz, kad lapa atkal redzama
const REFRESH_MS=10*60*1000;
const refreshIfOld=()=>{if(P.id&&!document.hidden&&Date.now()-_loadedAt>=REFRESH_MS)fetchHistory();};
setInterval(refreshIfOld,60*1000);
document.addEventListener('visibilitychange',refreshIfOld);

load();
