// Shared forecast period controls.
let forecastHours=168;
const rangeSections=['temp','precip','wind','table','cloud','uv'];
function rangeCopy(){
 const en=LANG==='en';
 document.querySelectorAll('.range-bar').forEach(bar=>{
  bar.querySelector('.range-label').textContent=en?'Forecast period':'Prognozes periods';
  bar.querySelectorAll('button').forEach((b,i)=>{
   b.textContent=(en?['48 h','7 days','14 days+']:['48 h','7 dienas','14 dienas+'])[i];
   b.setAttribute('aria-pressed',String(Number(b.dataset.hours)===forecastHours));
  });
  bar.querySelector('.range-note').textContent=en?'From the current hour. Model horizons vary; 14 days+ shows all available forecast data. Daily table shows whole days.':'No pašreizējās stundas. Modeļu termiņi atšķiras; 14 dienas+ rāda visu pieejamo prognozi. Tabulā - pilnas dienas.';
 });
 const title=document.querySelector('#tab-temp .card-title');
 title.removeAttribute('data-i18n');
 title.textContent=en?'Temperature · model comparison':'Temperatūra · modeļu salīdzinājums';
}
rangeSections.forEach(key=>{
 const bar=document.createElement('div');bar.className='range-bar';
 const label=document.createElement('span');label.className='range-label';bar.append(label);
 const group=document.createElement('div');group.className='range-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Prognozes periods');
 [48,168,384].forEach(hours=>{
  const b=document.createElement('button');b.type='button';b.dataset.hours=hours;
  b.onclick=()=>{forecastHours=hours;rangeCopy();rebuildTempChart();buildPrecipCharts();buildWindChart();buildCloudChart();buildUVChart();buildTable();};
  group.append(b);
 });bar.append(group);
 const note=document.createElement('span');note.className='range-note';bar.append(note);
 document.getElementById('tab-'+key).prepend(bar);
});
function rangedBuild(build){return function(...args){
 const original=S.data;
 if(!Object.keys(original).length)return;
 S.data=forecastWindow(original,forecastHours);
 try{return build(...args);}finally{S.data=original;rangeCopy();}
};}
rebuildTempChart=rangedBuild(rebuildTempChart);
buildPrecipCharts=rangedBuild(buildPrecipCharts);
buildWindChart=rangedBuild(buildWindChart);
buildCloudChart=rangedBuild(buildCloudChart);
buildUVChart=rangedBuild(buildUVChart);
buildTable=rangedBuild(buildTable);
const originalSplit=splitCombined;
splitCombined=function(raw){const result=originalSplit(raw);for(const src of Object.values(result))src.utcOffset=raw.utc_offset_seconds||0;return result;};
rangeCopy();
