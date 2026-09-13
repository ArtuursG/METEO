const uiText=(lv,en)=>LANG==='en'?en:lv;
// Map controls and model comparison interactions.
let radarVisible=true,radarOpacity=.65;
const toolbar=document.createElement('div');toolbar.className='map-tools';
const mapButtons={};
function mapButton(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;toolbar.append(b);return b;}
function syncMapButtons(){
 for(const [key,layer] of [['lvc',_lvcLayer],['lvgmc',_lvgmcLayer]])mapButtons[key].setAttribute('aria-pressed',String(!!(_rMap&&layer&&_rMap.hasLayer(layer))));
 mapButtons.radar.setAttribute('aria-pressed',String(radarVisible));
}
mapButtons.radar=mapButton(uiText('Nokrišņi','Precipitation'),()=>{radarVisible=!radarVisible;if(_rLayer)_rLayer.setOpacity(radarVisible?radarOpacity:0);syncMapButtons();});
mapButtons.lvc=mapButton(uiText('LVC stacijas','LVC stations'),()=>{if(!_rMap||!_lvcLayer)return;_rMap.hasLayer(_lvcLayer)?_rMap.removeLayer(_lvcLayer):_rMap.addLayer(_lvcLayer);_lvcLayerActive=_rMap.hasLayer(_lvcLayer);updateStationTablesVisibility();syncMapButtons();});
mapButtons.lvgmc=mapButton(uiText('LVĢMC stacijas','LVĢMC stations'),()=>{if(!_rMap||!_lvgmcLayer)return;_rMap.hasLayer(_lvgmcLayer)?_rMap.removeLayer(_lvgmcLayer):_rMap.addLayer(_lvgmcLayer);_lvgmcLayerActive=_rMap.hasLayer(_lvgmcLayer);updateStationTablesVisibility();syncMapButtons();});
const opacityLabel=document.createElement('label');opacityLabel.textContent=uiText('Nokrišņu slāņa redzamība ','Radar opacity ');
const opacity=document.createElement('input');opacity.type='range';opacity.min=0;opacity.max=100;opacity.value=65;opacity.setAttribute('aria-label',uiText('Nokrišņu slāņa redzamība','Radar opacity'));
const output=document.createElement('output');output.textContent='65%';
opacity.oninput=()=>{radarOpacity=Number(opacity.value)/100;output.textContent=opacity.value+'%';if(_rLayer)_rLayer.setOpacity(radarVisible?radarOpacity:0);};opacityLabel.append(opacity,output);toolbar.append(opacityLabel);
mapButton(uiText('Visa Latvija','All Latvia'),()=>_rMap?.fitBounds([[55.65,20.9],[58.1,28.25]]));
mapButton(uiText('Izvēlētā pilsēta','Selected city'),()=>_rMap?.setView([S.lat,S.lon],9));
$('radarMap').before(toolbar);
const originalRadarInit=initRadar;
let radarCenterKey='';
initRadar=async function(){
 const key=S.lat+','+S.lon;
 if(_rMap&&key===radarCenterKey){_rMap.invalidateSize();ensureLvcStations();ensureLvgmcStations();syncMapButtons();return;}
 radarCenterKey=key;
 const promise=originalRadarInit();
 if(_rMap&&!_rMap._mapControls){_rMap._mapControls=true;_rMap.on('layeradd layerremove',syncMapButtons);}
 syncMapButtons();await promise;syncMapButtons();
};
const originalFrame=showRadarFrame;
showRadarFrame=function(index){if(!_rFrames[index])return;originalFrame(index);_rLayer.setOpacity(radarVisible?radarOpacity:0);};
const originalRadarUI=updateRadarUI;
updateRadarUI=function(){originalRadarUI();if(!_rFrames[_rIdx])return;const frame=_rFrames[_rIdx];const future=frame.time*1000>Date.now();$('radarTime').textContent=(future?uiText('Prognoze','Forecast'):uiText('Novērojums','Observation'))+' · '+new Date(frame.time*1000).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});};
const originalPlay=radarTogglePlay;
radarTogglePlay=function(){if(!_rFrames.length)return;originalPlay();};

const originalVerification=renderVerification;
let chosenModels=null;
renderVerification=function(st,dist,rows,series){
 originalVerification(st,dist,rows,series);
 const available=new Set(rows.map(r=>r.id));
 chosenModels=chosenModels===null?new Set(rows.slice(0,3).map(r=>r.id)):new Set([...chosenModels].filter(id=>available.has(id)));
 let hint=$('modelCompareHint');
 if(!hint){hint=document.createElement('p');hint.id='modelCompareHint';hint.className='compare-hint';$('verifTable').before(hint);}
 hint.textContent=uiText('Izvēlies modeļus tabulā, lai tos salīdzinātu grafikā ar stacijas mērījumiem. MAE - vidējā absolūtā kļūda (mazāka ir labāka). Nobīde - vai modelis rāda siltāku (+) vai vēsāku (-) temperatūru.','Select models to compare with station measurements. MAE is the mean absolute error (lower is better). Bias shows whether the model is warmer (+) or cooler (-).');
 const measured=S.charts.verif.data.datasets[0];
 const redraw=()=>{
  S.charts.verif.data.datasets=[measured,...rows.filter(r=>chosenModels.has(r.id)).map(r=>({label:r.name,data:series.hourly['temperature_2m_'+r.id],borderColor:r.color,borderWidth:1.5,pointRadius:0,tension:.3,borderDash:[4,3]}))];
  S.charts.verif.update();
 };
 [...$('verifBody').rows].forEach((tr,i)=>{
  const r=rows[i],cell=tr.cells[0],label=document.createElement('label'),check=document.createElement('input');
  check.type='checkbox';check.checked=chosenModels.has(r.id);check.setAttribute('aria-label',uiText('Salīdzināt ','Compare ')+r.name);
  check.onchange=()=>{check.checked?chosenModels.add(r.id):chosenModels.delete(r.id);redraw();};
  label.append(check);while(cell.firstChild)label.append(cell.firstChild);cell.append(label);
 });redraw();
};
