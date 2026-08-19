// ─── LVC CEĻA METEOSTACIJAS - ATSEVIŠĶA STACIJAS LAPA ──────────────────────────
// Patstāvīga lapa (nav atkarīga no app.js ielādes secības) - atver, kad
// klikšķina uz stacijas galvenās lapas Radar tabulā. Stacijas id nāk no
// URL parametra ?id=... (papildus &name=, &lat=, &lon= tūlītējai parādīšanai
// pirms datu ielādes un mini-kartei).

const $=id=>document.getElementById(id);
const round=(v,d=1)=>v!=null?Math.round(v*(10**d))/(10**d):null;
const LVC_API='https://lvc-meteo-proxy.jkedainis.workers.dev/';

const ROAD_COND_LV={dry:'Sauss',wet:'Slapjš',moist:'Mitrs',frost:'Sarma',iceOrSnowOnRoad:'Apledojums/sniegs',wetAndDirty:'Slapjš, netīrs'};
const roadCondLv=c=>c?(ROAD_COND_LV[c]||c):'-';

const WIND_LABELS=['Z','ZZA','ZA','AZA','A','ADA','DA','DDA','D','DDR','DR','RDR','R','RZR','ZR','ZZR'];
const windDirLv=deg=>deg==null?'':WIND_LABELS[Math.round(deg/22.5)%16];

function tempCls(t){
  if(t==null)return '';
  if(t>=28)return 'tc-hot';
  if(t>=18)return 'tc-warm';
  if(t>=8) return 'tc-cool';
  return 'tc-cold';
}
function fmtTime(iso){
  return new Date(iso).toLocaleTimeString('lv-LV',{hour:'2-digit',minute:'2-digit'});
}

// ─── TĒMA ───────────────────────────────────────────────────────────────────
const TT_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="3.9" y1="3.9" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.1" y2="20.1"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="3.9" y1="20.1" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.1" y2="3.9"/></svg>';
const TT_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function renderThemeIcon(){
  const t=document.documentElement.getAttribute('data-theme');
  $('themeToggle').innerHTML=t==='light'?TT_MOON:TT_SUN;
}
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('theme',t);}catch(e){}
  renderThemeIcon();
  if(_lastHist.length){renderChart(_lastHist);renderMinMaxChart(_lastHist);renderWindChart(_lastHist);}
}
$('themeToggle').addEventListener('click',()=>{
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='light'?'dark':'light');
});
renderThemeIcon();

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
      x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:12,maxRotation:0,autoSkip:true},grid:{color:v('--chart-grid')}},
      y:{ticks:{color:v('--chart-tick'),font:{size:11}},grid:{color:v('--chart-grid')}},
    }
  };
}

// ─── DATU IELĀDE ─────────────────────────────────────────────────────────────
let _chart=null, _minMaxChart=null, _windChart=null, _lastHist=[], _miniMap=null;

function renderChart(hist){
  $('stLoading').style.display='none';
  $('stChart').style.display='block';
  const labels=hist.map(h=>fmtTime(h.time));
  if(_chart)_chart.destroy();
  _chart=new Chart($('stChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Gaisa temp.',data:hist.map(h=>h.airTemp),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:'Ceļa virsmas temp.',data:hist.map(h=>h.surfaceTemp),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
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
  const hasTemp=hist.some(h=>h.airTemp!=null);
  if(!hasTemp){
    $('stMinMaxLoading').textContent='Šai stacijai nav temperatūras datu.';
    return;
  }
  const buckets=hourlyMinMax(hist);
  $('stMinMaxLoading').style.display='none';
  $('stMinMaxChart').style.display='block';
  const labels=buckets.map(b=>fmtTime(b.time));
  if(_minMaxChart)_minMaxChart.destroy();
  _minMaxChart=new Chart($('stMinMaxChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Minimālā T°',data:buckets.map(b=>b.min),borderColor:'#5b8fc7',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:'Maksimālā T°',data:buckets.map(b=>b.max),borderColor:'#e0796d',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderWindChart(hist){
  const hasWind=hist.some(h=>h.windSpeed!=null);
  if(!hasWind){
    $('stWindLoading').textContent='Šai stacijai nav vēja datu.';
    return;
  }
  $('stWindLoading').style.display='none';
  $('stWindChart').style.display='block';
  const labels=hist.map(h=>fmtTime(h.time));
  if(_windChart)_windChart.destroy();
  _windChart=new Chart($('stWindChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Vēja ātrums m/s',data:hist.map(h=>h.windSpeed),borderColor:'#7fb37a',borderWidth:1.5,pointRadius:0,tension:0.3},
      {label:'Brāzmas m/s',data:hist.map(h=>h.windGust),borderColor:'#4a8f44',borderWidth:1.5,pointRadius:0,tension:0.3},
    ]},
    options:CD(),
  });
}

function renderMiniMap(lat,lon,name){
  if(lat==null||lon==null)return;
  _miniMap=L.map('stMiniMap',{zoomControl:false,attributionControl:true}).setView([lat,lon],11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
    attribution:'© OpenStreetMap © CartoDB',maxZoom:16,subdomains:'abcd'
  }).addTo(_miniMap);
  const marker=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:'#e0796d',fillOpacity:0.95}).addTo(_miniMap);
  if(name)marker.bindTooltip(name,{permanent:false,direction:'top'});
}

async function load(){
  const p=new URLSearchParams(location.search);
  const id=p.get('id');
  const nameHint=p.get('name');
  const lat=parseFloat(p.get('lat'));
  const lon=parseFloat(p.get('lon'));
  if(nameHint){$('stName').textContent=nameHint;$('stInfoName').textContent=nameHint;}
  if(!id){
    $('stName').textContent='Nav norādīta stacija';
    $('stChartMeta').textContent='Trūkst ?id= parametra URL.';
    return;
  }
  if(!isNaN(lat)&&!isNaN(lon))renderMiniMap(lat,lon,nameHint);

  try{
    const r=await fetch(`${LVC_API}?station=${encodeURIComponent(id)}`);
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    const hist=d.history||[];
    if(!hist.length){
      $('stChartMeta').textContent='Vēl nav uzkrātu vēstures datu (dati krājas ik pēc 15 min).';
      $('stLoading').textContent='Nav datu.';
      $('stWindLoading').textContent='Nav datu.';
      return;
    }
    _lastHist=hist;
    const cur=hist[hist.length-1];
    document.title=`${nameHint||id} - prognoze.lv`;

    $('stAirTemp').innerHTML=`${cur.airTemp!=null?round(cur.airTemp,1):'-'}<span>°C</span>`;
    $('stAirTemp').className='mc-val '+tempCls(cur.airTemp);
    $('stTime').textContent=fmtTime(cur.time);

    $('stSurfTemp').innerHTML=`${cur.surfaceTemp!=null?round(cur.surfaceTemp,1):'-'}<span>°C</span>`;
    $('stSurfTemp').className='mc-val '+tempCls(cur.surfaceTemp);
    $('stRoadCond').textContent=roadCondLv(cur.roadCondition);

    const withTemp=hist.filter(h=>h.airTemp!=null);
    if(withTemp.length){
      const minH=withTemp.reduce((a,b)=>a.airTemp<b.airTemp?a:b);
      const maxH=withTemp.reduce((a,b)=>a.airTemp>b.airTemp?a:b);
      $('stMin').innerHTML=`${round(minH.airTemp,1)}<span>°C</span>`;
      $('stMinTime').textContent=fmtTime(minH.time);
      $('stMax').innerHTML=`${round(maxH.airTemp,1)}<span>°C</span>`;
      $('stMaxTime').textContent=fmtTime(maxH.time);
    }

    $('dWind').textContent=cur.windSpeed!=null?`${round(cur.windSpeed,1)} m/s ${windDirLv(cur.windDir)}`:'nav datu';
    $('dGust').textContent=cur.windGust!=null?`${round(cur.windGust,1)} m/s`:'nav datu';
    $('dHum').textContent=cur.humidity!=null?`${round(cur.humidity,0)}%`:'nav datu';
    $('dPrecip').textContent=cur.precipMmH!=null?`${round(cur.precipMmH,1)} mm/h`:'nav datu';
    $('dDew').textContent=cur.dewPoint!=null?`${round(cur.dewPoint,1)}°C`:'nav datu';
    $('dVis').textContent=cur.visibilityM!=null?`${round(cur.visibilityM/1000,1)} km`:'nav datu';
    // com:distance DATEX II laukos ir metros (tāpat kā ledus biezums) - pārrēķina uz cm parastai sniega dziļuma vienībai
    $('dSnow').textContent=cur.snowDepthM!=null?`${round(cur.snowDepthM*100,1)} cm`:'nav datu';

    $('stChartMeta').textContent=`${hist.length} mērījumi pēdējās 24h`;
    renderChart(hist);
    renderMinMaxChart(hist);
    renderWindChart(hist);
  }catch(e){
    $('stChartMeta').textContent='Neizdevās ielādēt datus.';
    $('stLoading').textContent='Kļūda ielādējot datus.';
    $('stMinMaxLoading').textContent='Kļūda ielādējot datus.';
    $('stWindLoading').textContent='Kļūda ielādējot datus.';
  }
}

load();
