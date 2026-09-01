// ─── APP: tab switching, language re-render, init ───────────────────────────

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(tab,btn){
  document.querySelectorAll('.tb').forEach(b=>{
    const on=b===btn;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
    b.tabIndex=on?0:-1;
  });
  document.querySelectorAll('.tc>div').forEach(d=>d.classList.remove('on'));
  $('tab-'+tab).classList.add('on');
  // Radar map, climate and verification data initialize lazily on first open
  if(tab==='radar')initRadar();
  if(tab==='climate')initClimate();
  if(tab==='about')initVerification();
}

// Wires the tab bar as an ARIA tablist with roving-tabindex arrow-key navigation
function initTabsA11y(){
  const bar=document.querySelector('.tab-bar');
  if(!bar)return;
  bar.setAttribute('role','tablist');
  bar.setAttribute('aria-label',t('a11y.tabs'));
  const tabs=[...bar.querySelectorAll('.tb')];
  tabs.forEach(b=>{
    const name=(b.getAttribute('onclick')||'').match(/switchTab\('(\w+)'/)?.[1];
    if(!name)return;
    const on=b.classList.contains('active');
    b.setAttribute('role','tab');
    b.id='tb-'+name;
    b.setAttribute('aria-controls','tab-'+name);
    b.setAttribute('aria-selected',on?'true':'false');
    b.tabIndex=on?0:-1;
    const panel=$('tab-'+name);
    if(panel){
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-labelledby','tb-'+name);
      panel.tabIndex=0;
    }
  });
  bar.addEventListener('keydown',e=>{
    const i=tabs.indexOf(document.activeElement);
    if(i<0)return;
    const to={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:tabs.length-1}[e.key];
    if(to===undefined)return;
    e.preventDefault();
    const tgt=tabs[(to+tabs.length)%tabs.length];
    tgt.focus(); tgt.click();
  });
}

// Re-renders every piece of dynamic UI text after a language switch. Static
// [data-i18n] nodes are already handled by applyStaticI18n() in setLang().
function relangUI(){
  renderFavBtn();
  initTabsA11y();
  buildToggles();
  buildModelInfo();
  if(Object.keys(S.data).length){
    updateMetrics();
    rebuildTempChart();
    buildPrecipCharts();
    buildWindChart();
    buildCloudChart();
    buildUVChart();
    buildTable();
  }
  _climKey=null; _verifKey=null;
  if($('tab-climate')?.classList.contains('on'))initClimate();
  if($('tab-about')?.classList.contains('on'))initVerification();
  if(_lvcStations.length)renderLvcRows();
  if(_lvgmcStations.length)renderLvgmcRows();
  relabelRadarControl();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
applyStaticI18n();
loadFromURL();
renderThemeIcon();
renderFavBtn();
initTabsA11y();
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
