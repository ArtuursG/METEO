// ─── RADAR & WEATHER STATIONS (LVC + LVĢMC) ─────────────────────────────────

// ─── RADAR ────────────────────────────────────────────────────────────────────
let _rMap=null, _rLayer=null, _rFrames=[], _rIdx=0, _rTimer=null;
let _rLayerCtrl=null, _rBaseLayers=null;  // kept so the layer-control labels can be re-translated

// Rebuilds the Leaflet layer control with current-language labels (called on language switch)
function relabelRadarControl(){
  if(!_rMap||!_rLayerCtrl||!_rBaseLayers)return;
  _rMap.removeControl(_rLayerCtrl);
  const bl={
    [t('basemap.light')]:_rBaseLayers.light,
    [t('basemap.dark')]:_rBaseLayers.dark,
    [t('basemap.osm')]:_rBaseLayers.osm,
    [t('basemap.relief')]:_rBaseLayers.relief,
    [t('basemap.satellite')]:_rBaseLayers.satellite,
  };
  const ol={[t('radar.overlay_lvc')]:_lvcLayer,[t('radar.overlay_lvgmc')]:_lvgmcLayer};
  _rLayerCtrl=L.control.layers(bl,ol,{collapsed:true}).addTo(_rMap);
}

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
  _rBaseLayers={
    light:L.layerGroup([
      esri('Canvas/World_Light_Gray_Base',esriAttr),
      esri('Canvas/World_Light_Gray_Reference'),
    ]),
    dark:L.layerGroup([
      esri('Canvas/World_Dark_Gray_Base',esriAttr),
      esri('Canvas/World_Dark_Gray_Reference'),
    ]),
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom:19,subdomains:'abc'}),
    relief:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap, SRTM · © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
      maxZoom:17,subdomains:'abc'}),
    satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Tiles © <a href="https://www.esri.com" target="_blank">Esri</a>',
      maxZoom:19}),
  };
  const baseLayers={
    [t('basemap.light')]:_rBaseLayers.light,
    [t('basemap.dark')]:_rBaseLayers.dark,
    [t('basemap.osm')]:_rBaseLayers.osm,
    [t('basemap.relief')]:_rBaseLayers.relief,
    [t('basemap.satellite')]:_rBaseLayers.satellite,
  };
  _rBaseLayers.light.addTo(_rMap);
  // Radar / station attribution stays visible regardless of the selected base map
  _rMap.attributionControl.addAttribution(t('radar.attr'));

  _lvcLayer=L.layerGroup().addTo(_rMap);
  _lvgmcLayer=L.layerGroup().addTo(_rMap);
  bindLvcTableSorting();
  bindLvgmcTableSorting();
  _rMap.on('zoomend moveend',declutterAllBadges);

  // Papildslāņi (checkbox) - šeit pievienos nākotnē vēl citus slāņus (piem. LT/EE radaru)
  const overlays={
    [t('radar.overlay_lvc')]:_lvcLayer,
    [t('radar.overlay_lvgmc')]:_lvgmcLayer,
  };
  _rLayerCtrl=L.control.layers(baseLayers,overlays,{collapsed:true}).addTo(_rMap);

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
    $('radarStatus').textContent=t('radar.loading');
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
    $('radarStatus').textContent=t('radar.load_failed');
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
  const dt=new Date(_rFrames[_rIdx].time*1000);
  const label=dt.toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
  const isLatest=_rIdx===_rFrames.length-1;
  $('radarTime').textContent=isLatest?`${t('radar.now')} · ${label}`:label;
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

const ROAD_COND_KEY={dry:'road.dry',wet:'road.wet',moist:'road.moist',frost:'road.frost',iceOrSnowOnRoad:'road.ice',wetAndDirty:'road.wetdirty'};
const roadCondLv=c=>c?(ROAD_COND_KEY[c]?t(ROAD_COND_KEY[c]):c):'-';


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
    $('lvcMeta').textContent=t('radar.lvc_failed');
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
  $('lvcMeta').textContent=`${t('radar.lvc_src')} · ${t('radar.stations_count',{n:_lvcRows.length})}`;
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
  dist.textContent=t('station.dist_away',{n:round(s.dist,1)});
  box.appendChild(dist);

  const rows=[
    [t('station.air_t'),s.airTemp!=null?`${round(s.airTemp,1)}°C`:'-'],
    [t('station.road_surface_t'),s.surfaceTemp!=null?`${round(s.surfaceTemp,1)}°C`:'-'],
    [t('station.dew_point'),s.dewPoint!=null?`${round(s.dewPoint,1)}°C`:'-'],
    [t('station.humidity'),s.humidity!=null?`${round(s.humidity,0)}%`:'-'],
    [t('station.precip'),s.precipMmH!=null?`${round(s.precipMmH,1)} mm/h`:'-'],
    [t('station.visibility'),s.visibilityM!=null?`${round(s.visibilityM/1000,1)} km`:'-'],
    [t('station.road_cond'),roadCondLv(s.roadCondition)],
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
  histBtn.textContent=t('station.history_24h');
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

const fmtStationTime=iso=>new Date(iso).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
const lvgmcWindDirLv=deg=>deg==null?'':COMPASS[LANG][Math.round(deg/22.5)%16];

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
    $('lvgmcMeta').textContent=t('radar.lvgmc_failed');
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
  $('lvgmcMeta').textContent=`${t('radar.lvgmc_src')} · ${t('radar.stations_count',{n:_lvgmcRows.length})}`;
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
  dist.textContent=t('station.dist_away',{n:round(s.dist,1)});
  box.appendChild(dist);

  const rows=[
    [t('station.air_t'),s.airTemp!=null?`${round(s.airTemp,1)}°C`:'-'],
    [t('station.feels_t'),s.feelsLike!=null?`${round(s.feelsLike,1)}°C`:'-'],
    [t('station.minmax_24h'),(s.minTemp!=null&&s.maxTemp!=null)?`${round(s.minTemp,1)}° / ${round(s.maxTemp,1)}°`:'-'],
    [t('station.wind'),s.windSpeed!=null?`${round(s.windSpeed,1)} m/s ${lvgmcWindDirLv(s.windDir)}`:'-'],
    [t('station.gust'),s.windGust!=null?`${round(s.windGust,1)} m/s`:'-'],
    [t('station.humidity'),s.humidity!=null?`${round(s.humidity,0)}%`:'-'],
    [t('station.pressure'),s.pressure!=null?`${round(s.pressure,1)} hPa`:'-'],
    [t('station.precip_h'),s.precipHour!=null?`${round(s.precipHour,1)} mm`:'-'],
    [t('station.visibility'),s.visibility!=null?`${round(s.visibility/1000,1)} km`:'-'],
    [t('station.uv'),s.uv!=null?round(s.uv,0):'-'],
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
  histBtn.textContent=t('station.history_24h');
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
