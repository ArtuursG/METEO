// Shared forecast period controls.
let forecastHours=168;
const rangeSections=['temp','precip','wind','table','cloud','uv'];
function rangeCopy(){
 document.querySelectorAll('.range-bar').forEach(bar=>{
  bar.querySelector('.range-label').textContent=t('ch.period');
  const group=bar.querySelector('.range-buttons');
  group.setAttribute('aria-label',t('ch.period'));
  group.title=t('ch.period_note');
  bar.querySelectorAll('button').forEach((b,i)=>{
   b.textContent=t(['ch.p48','ch.p7','ch.p14'][i]);
   b.setAttribute('aria-pressed',String(Number(b.dataset.hours)===forecastHours));
  });
  const note=bar.querySelector('.range-note');
  note.textContent=t('ch.period_hint');note.title=t('ch.period_note');
 });
}
rangeSections.forEach(key=>{
 const bar=document.createElement('div');bar.className='range-bar';
 const label=document.createElement('span');label.className='range-label';bar.append(label);
 const group=document.createElement('div');group.className='range-buttons';group.setAttribute('role','group');
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
rangeCopy();
