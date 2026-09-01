// ─── LVĢMC METEOSTACIJAS - ATSEVIŠĶA STACIJAS LAPA ─────────────────────────────
// Patstāvīga lapa (nav atkarīga no app.js ielādes secības). Stacijas id nāk
// no URL parametra ?id=... (papildus &name=, &lat=, &lon=). Worker atdod
// VISU staciju pilnu vēsturi vienā atbildē (avots pats uztur 48h logu),
// tāpēc šeit vienkārši atlasām vienu staciju no tā paša endpoint.

const $=id=>document.getElementById(id);
const round=(v,d=1)=>v!=null?Math.round(v*(10**d))/(10**d):null;
const LVGMC_API='https://lvgmc-meteo-proxy.jkedainis.workers.dev/';

applyStaticI18n();

const windDirLv=deg=>deg==null?'':COMPASS[LANG][compassIndex(deg)];
const noData=()=>t('stp.no_data');
// tempCls comes from pure.js

function fmtTime(iso){
  return new Date(iso).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
}

// ─── TĒMA ───────────────────────────────────────────────────────────────────
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
  if(_lastHist.length){renderChart(_lastHist);renderMinMaxChart(_lastHist);renderWindChart(_lastHist);}
}
$('themeToggle').addEventListener('click',()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='light'?'dark':'light');
});
renderThemeIcon();

// ─── CHART DEFAULTS ──────────────────────────────────────────────────────────
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
      x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:12,maxRotation:0,autoSkip:true},grid:{color:v('--chart-grid')}},
      y:{ticks:{color:v('--chart-tick'),font:{size:11}},grid:{color:v('--chart-grid')}},
    }
  };
}

let _chart=null, _minMaxChart=null, _windChart=null, _lastHist=[], _miniMap=null;

function renderChart(hist){
  $('stLoading').style.display='none';
  $('stChart').style.display='block';
  const labels=hist.map(h=>fmtTime(h.time));
  if(_chart)_chart.destroy();
  _chart=new Chart($('stChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_air'),data:hist.map(h=>h.airTemp),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_feels'),data:hist.map(h=>h.feelsLike),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

// HATMN/HATMX = tās stundas min/max (nevis kopš pusnakts kumulatīvs) - tāpēc
// zīmējas kā tīra svārstību "aploksne" ap dienas gaitu, bez pēkšņiem lēcieniem
function renderMinMaxChart(hist){
  const hasMinMax=hist.some(h=>h.minTemp!=null||h.maxTemp!=null);
  if(!hasMinMax){
    $('stMinMaxLoading').textContent=t('stp.no_minmax');
    return;
  }
  $('stMinMaxLoading').style.display='none';
  $('stMinMaxChart').style.display='block';
  const labels=hist.map(h=>fmtTime(h.time));
  if(_minMaxChart)_minMaxChart.destroy();
  _minMaxChart=new Chart($('stMinMaxChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_min'),data:hist.map(h=>h.minTemp),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_max'),data:hist.map(h=>h.maxTemp),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderWindChart(hist){
  const hasWind=hist.some(h=>h.windSpeed!=null);
  if(!hasWind){
    $('stWindLoading').textContent=t('stp.no_wind');
    return;
  }
  $('stWindLoading').style.display='none';
  $('stWindChart').style.display='block';
  const labels=hist.map(h=>fmtTime(h.time));
  if(_windChart)_windChart.destroy();
  _windChart=new Chart($('stWindChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:t('stp.ds_wind_speed'),data:hist.map(h=>h.windSpeed),borderColor:'#7fb37a',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:t('stp.ds_gust'),data:hist.map(h=>h.windGust),borderColor:'#4a8f44',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderMiniMap(lat,lon,name){
  if(lat==null||lon==null)return;
  _miniMap=L.map('stMiniMap',{zoomControl:false,attributionControl:true}).setView([lat,lon],11);
  // Esri Gray Canvas (bez API atslēgas); base + nosaukumu slānis atsevišķi
  const esriTile=svc=>L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,{
    attribution:'Tiles © Esri',maxZoom:16});
  esriTile('Canvas/World_Light_Gray_Base').addTo(_miniMap);
  esriTile('Canvas/World_Light_Gray_Reference').addTo(_miniMap);
  const marker=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:'#e0796d',fillOpacity:0.95}).addTo(_miniMap);
  if(name)marker.bindTooltip(name,{permanent:false,direction:'top'});
}

async function load(){
  const p=new URLSearchParams(location.search);
  const id=p.get('id');
  const nameHint=p.get('name');
  const lat=parseFloat(p.get('lat'));
  const lon=parseFloat(p.get('lon'));
  $('stChartTitle').textContent=t('stp.chart_temp_h',{h:48});
  $('stMinMaxTitle').textContent=t('stp.chart_minmax',{h:48});
  $('stWindTitle').textContent=t('stp.chart_wind',{h:48});
  if(nameHint){$('stName').textContent=nameHint;$('stInfoName').textContent=nameHint;}
  if(!id){
    $('stName').textContent=t('stp.no_station');
    $('stChartMeta').textContent=t('stp.missing_id');
    return;
  }
  if(!isNaN(lat)&&!isNaN(lon))renderMiniMap(lat,lon,nameHint);

  try{
    const r=await fetch(LVGMC_API);
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    const station=(d.stations||[]).find(s=>s.id===id);
    const hist=station?.history||[];
    if(!hist.length){
      $('stChartMeta').textContent=t('stp.no_station_data');
      $('stLoading').textContent=t('stp.no_data_short');
      $('stMinMaxLoading').textContent=t('stp.no_data_short');
      $('stWindLoading').textContent=t('stp.no_data_short');
      return;
    }
    _lastHist=hist;
    const cur=hist[hist.length-1];
    document.title=`${nameHint||id} - prognoze.lv`;

    $('stAirTemp').innerHTML=`${cur.airTemp!=null?round(cur.airTemp,1):'-'}<span>°C</span>`;
    $('stAirTemp').className='mc-val '+tempCls(cur.airTemp);
    $('stTime').textContent=fmtTime(cur.time);

    $('stFeels').innerHTML=`${cur.feelsLike!=null?round(cur.feelsLike,1):'-'}<span>°C</span>`;
    $('stFeels').className='mc-val '+tempCls(cur.feelsLike);

    if(cur.minTemp!=null){$('stMin').innerHTML=`${round(cur.minTemp,1)}<span>°C</span>`;$('stMinTime').textContent=fmtTime(cur.time);}
    if(cur.maxTemp!=null){$('stMax').innerHTML=`${round(cur.maxTemp,1)}<span>°C</span>`;$('stMaxTime').textContent=fmtTime(cur.time);}

    $('dWind').textContent=cur.windSpeed!=null?`${round(cur.windSpeed,1)} m/s ${windDirLv(cur.windDir)}`:noData();
    $('dGust').textContent=cur.windGust!=null?`${round(cur.windGust,1)} m/s`:noData();
    $('dHum').textContent=cur.humidity!=null?`${round(cur.humidity,0)}%`:noData();
    $('dPressure').textContent=cur.pressure!=null?`${round(cur.pressure,1)} hPa`:noData();
    $('dPrecip').textContent=cur.precipHour!=null?`${round(cur.precipHour,1)} mm`:noData();
    $('dVis').textContent=cur.visibility!=null?`${round(cur.visibility/1000,1)} km`:noData();
    $('dSnow').textContent=cur.snowDepth!=null?`${round(cur.snowDepth,0)} cm`:noData();
    $('dUv').textContent=cur.uv!=null?round(cur.uv,0):noData();
    $('dCloud').textContent=cur.cloudCoverOktas!=null?t('stp.oktas',{n:round(cur.cloudCoverOktas,0)}):noData();
    $('dLightning').textContent=cur.lightning!=null?`${round(cur.lightning,0)}`:noData();

    $('stChartMeta').textContent=t('stp.measurements_hourly',{n:hist.length});
    renderChart(hist);
    renderMinMaxChart(hist);
    renderWindChart(hist);
  }catch(e){
    $('stChartMeta').textContent=t('stp.load_failed');
    $('stLoading').textContent=t('stp.load_error');
    $('stMinMaxLoading').textContent=t('stp.load_error');
    $('stWindLoading').textContent=t('stp.load_error');
  }
}

load();
