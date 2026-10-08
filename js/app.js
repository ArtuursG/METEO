// ─── APP: tab switching, language re-render, init ───────────────────────────

// ─── NAVIGATION ─────────────────────────────────────────────────────────────
// Five sections; the ones holding several panels get a second row of tabs.
// Panels keep their ids (tab-temp, tab-radar ...), so deep links and other code still work.
const NAV_GROUPS={
  today:  {panels:['today','table'],labels:['nav.overview','tab.table']},
  charts: {panels:['temp','precip','wind','cloud','uv'],labels:['tab.temp','tab.precip','tab.wind','tab.cloud','tab.uv']},
  radar:  {panels:['radar'],labels:['tab.radar']},
  env:    {panels:['environment'],labels:['nav.env']},
  more:   {panels:['climate','about'],labels:['tab.climate','tab.models']},
};
const NAV_PANELS=Object.values(NAV_GROUPS).flatMap(g=>g.panels);
const navGroupOf=panel=>Object.keys(NAV_GROUPS).find(k=>NAV_GROUPS[k].panels.includes(panel));
const _navLast={};   // last panel opened in each section
let _navCurrent='', _navSubKey='';

// Opens a panel by name; the second argument (an old tab button) is accepted and ignored
function switchTab(tab){
  if(!NAV_PANELS.includes(tab)||!$('tab-'+tab))tab='today';
  if(tab!=='wind'&&windMapFrame)closeWindMap();
  if(tab==='wind')refreshWindMap();
  if(tab!=='environment')environmentRequest++;
  document.querySelectorAll('.tc>div').forEach(d=>d.classList.remove('on'));
  $('tab-'+tab).classList.add('on');
  _navCurrent=tab;
  _navLast[navGroupOf(tab)]=tab;
  renderNav();
  rememberTab(tab);
  // Radar map, climate and verification data initialize lazily on first open
  if(tab==='radar')initRadar();
  else if(typeof stopRadarPlayback==='function')stopRadarPlayback();
  if(tab==='environment')initEnvironment();
  if(tab==='climate')initClimate();
  if(tab==='about')initVerification();
  if(tab==='cloud')refreshCloudMap();
  else if(typeof stopCloudPlayback==='function')stopCloudPlayback();
}

// The open panel goes into the address (#radar) and into storage for the next visit
function rememberTab(tab){
  try{localStorage.setItem('last_tab',tab);}catch{}
  try{
    const u=new URL(location.href);
    u.hash=tab==='today'?'':tab;
    history.replaceState(null,'',u);
  }catch{}
}
function initialTab(){
  const h=location.hash.replace(/^#(tab-)?/,'');
  if(NAV_PANELS.includes(h))return h;
  try{const v=localStorage.getItem('last_tab');if(NAV_PANELS.includes(v))return v;}catch{}
  return 'today';
}

// Draws the active state of both rows and the second row's tabs for the open section
function renderNav(){
  const group=navGroupOf(_navCurrent)||'today';
  const nav=$('mainNav');
  if(nav)nav.setAttribute('aria-label',t('nav.aria'));
  document.querySelectorAll('#navPrimary .nb').forEach(b=>{
    const on=b.dataset.group===group;
    if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    b.tabIndex=on?0:-1;
  });
  const sub=$('navSub'),cfg=NAV_GROUPS[group];
  if(!sub)return;
  for(const name of NAV_PANELS){
    const panel=$('tab-'+name);
    if(!panel)continue;
    panel.setAttribute('role','tabpanel');
    panel.tabIndex=0;
    const g=navGroupOf(name);
    panel.setAttribute('aria-labelledby',NAV_GROUPS[g].panels.length<2?navButtonId(g):'ns-'+name);
  }
  const single=cfg.panels.length<2;
  sub.hidden=single;
  // Same section and language: only move the selection, so keyboard focus stays put
  const key=group+'|'+LANG;
  if(key===_navSubKey){
    sub.querySelectorAll('.ns').forEach(b=>{const on=b.id==='ns-'+_navCurrent;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    return;
  }
  _navSubKey=key;
  sub.replaceChildren();
  if(single)return;
  sub.setAttribute('aria-label',t('nav.sub_aria',{name:t('nav.'+group)}));
  cfg.panels.forEach((name,i)=>{
    const b=document.createElement('button');
    b.type='button';b.className='ns';b.id='ns-'+name;
    b.setAttribute('role','tab');
    b.setAttribute('aria-controls','tab-'+name);
    const on=name===_navCurrent;
    b.setAttribute('aria-selected',String(on));
    b.tabIndex=on?0:-1;
    b.textContent=t(cfg.labels[i]);
    b.onclick=()=>switchTab(name);
    sub.append(b);
  });
}
const navButtonId=g=>document.querySelector(`#navPrimary .nb[data-group="${g}"]`)?.id||'';

// Arrow keys move along a row (roving tabindex); Enter/Space press the button as usual
function bindNavKeys(row,selector,activate){
  row?.addEventListener('keydown',e=>{
    const items=[...row.querySelectorAll(selector)];
    const i=items.indexOf(document.activeElement);
    if(i<0)return;
    const to={ArrowRight:i+1,ArrowLeft:i-1,ArrowDown:i+1,ArrowUp:i-1,Home:0,End:items.length-1}[e.key];
    if(to===undefined)return;
    e.preventDefault();
    const next=items[(to+items.length)%items.length];
    next.focus();
    if(activate)next.click();
  });
}
function initNav(){
  document.querySelectorAll('#navPrimary .nb').forEach(b=>{
    b.onclick=()=>switchTab(_navLast[b.dataset.group]||NAV_GROUPS[b.dataset.group].panels[0]);
  });
  bindNavKeys($('navPrimary'),'.nb',false);
  bindNavKeys($('navSub'),'.ns',true);
}

// Re-renders every piece of dynamic UI text after a language switch. Static
// [data-i18n] nodes are already handled by applyStaticI18n() in setLang().
function relangUI(){
  refreshWindMap();
  refreshCloudMap();
  refreshHomeWarnings();
  environmentLabels();
  if($('tab-environment')?.classList.contains('on'))initEnvironment();
  renderFavBtn();
  renderNav();
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
initNav();
buildToggles();
buildModelInfo();
// Last opened section (address first, e.g. index.html#tab-radar from a station page)
switchTab(initialTab());
// If URL already has coordinates (shared link), load immediately; otherwise auto-geolocate
if(new URLSearchParams(location.search).has('lat')){
  loadAll();
}else{
  locateMe(true);
}
// The workers refresh every 15 min; this only picks up the latest while the map exists
setInterval(()=>{ if(_rMap){ ensureLvcStations(); ensureLvgmcStations(); } },5*60*1000);
