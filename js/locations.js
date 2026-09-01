// ─── LOCATIONS: city search, theme, saved/recent places, share, geolocation ──

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

// Geocodes the current input value; called by debounced input handler and Enter key
async function searchCity(){
  const val=$('cityInput').value.trim();
  if(!val)return;
  // Cancel any in-flight request before starting a new one
  if(_searchCtrl)_searchCtrl.abort();
  _searchCtrl=new AbortController();
  const drop=$('cityDrop');
  drop.innerHTML=`<div class="city-opt" style="color:var(--t3);cursor:default">${t('search.searching')}</div>`;
  drop.style.display='block';
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(val)}&count=5&language=${LANG}`,{signal:_searchCtrl.signal});
    const d=await r.json();
    if(!d.results?.length){
      drop.innerHTML=`<div class="city-opt" style="color:var(--t3);cursor:default">${t('search.not_found')}</div>`;
      return;
    }
    renderSearchResults(d.results);
  }catch(e){
    if(e.name==='AbortError')return; // superseded by a newer request - ignore silently
    const errEl=document.createElement('div');
    errEl.className='city-opt';
    errEl.style.cssText='color:#e66767;cursor:default';
    errEl.textContent=`${t('err.prefix')}: ${e.message}`;
    drop.appendChild(errEl);
  }
}

// Updates state, URL, recent history and reloads all model data for the new location.
// Transactional: if the fetch fails, the previous location's data stays on screen
// and the header reverts, rather than blanking the page.
async function selectCity(g){
  const prev={lat:S.lat,lon:S.lon,city:S.city,country:S.country,
              name:$('cityName').textContent,sub:$('heroSub').textContent};
  S.lat=+g.latitude; S.lon=+g.longitude;
  S.city=g.name; S.country=g.country||'';
  $('cityName').textContent=g.name;
  $('heroSub').textContent=`${[g.admin1,g.country].filter(Boolean).join(', ')}${g.timezone?' · '+g.timezone:''}`;
  document.body.classList.add('busy');

  const ok=await loadAll();
  document.body.classList.remove('busy');
  if(!ok){
    Object.assign(S,{lat:prev.lat,lon:prev.lon,city:prev.city,country:prev.country});
    $('cityName').textContent=prev.name;
    $('heroSub').textContent=prev.sub;
    return;
  }

  S.geo=normCity(g);
  updateURL();
  saveRecent(g);
  renderFavBtn();
  buildToggles();
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
  _verifKey=null; // force the verification chart to redraw with new theme colours on next open
  if($('tab-about')?.classList.contains('on'))initVerification();
}

// Applies theme, saves to localStorage and redraws charts with updated CSS colours
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('theme',t);}catch(e){}
  renderThemeIcon();
  rerenderCharts();
}

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='light'?'dark':'light');
}

// ─── SAVED & RECENT CITIES ──────────────────────────────────────────────────
// Both live in localStorage as arrays of {name,country,admin1,timezone,lat,lon}.
// Saved (fav_cities) are user-pinned and always shown; recent_cities is a rolling 5.
function normCity(g){
  return {name:g.name||S.city, country:g.country||'', admin1:g.admin1||'', timezone:g.timezone||'',
          lat:+(g.lat??g.latitude), lon:+(g.lon??g.longitude)};
}
const _sameLoc=sameLoc; // from pure.js
const _readList=k=>{try{return JSON.parse(localStorage.getItem(k)||'[]');}catch{return [];}};
const _writeList=(k,a)=>{try{localStorage.setItem(k,JSON.stringify(a));}catch{}};

function getFavs(){return _readList('fav_cities');}
function isFav(c){return c&&getFavs().some(f=>_sameLoc(f,c));}
function toggleFav(g){
  if(!g)return;
  const c=normCity(g);
  if(!isFinite(c.lat)||!isFinite(c.lon))return;
  let f=getFavs();
  f=isFav(c)?f.filter(x=>!_sameLoc(x,c)):[c,...f].slice(0,12);
  _writeList('fav_cities',f);
  renderFavBtn();
  if(document.activeElement===$('cityInput'))showRecent();
}
function renderFavBtn(){
  const b=$('favBtn'); if(!b)return;
  const on=isFav(S.geo);
  b.setAttribute('aria-pressed',on?'true':'false');
  b.setAttribute('aria-label',on?t('ui.unsave_place'):t('ui.save_place'));
  b.title=b.getAttribute('aria-label');
}

// Rolling list of the 5 most recently opened locations (deduped by proximity)
function saveRecent(g){
  const c=normCity(g);
  const r=_readList('recent_cities').filter(x=>!_sameLoc(x,c));
  _writeList('recent_cities',[c,...r].slice(0,5));
}

function _cityRow(c,pinned){
  const opt=document.createElement('div');
  opt.className='city-opt';
  if(pinned){
    const st=document.createElement('span'); st.className='co-star';
    st.innerHTML='<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    opt.appendChild(st);
  }
  const box=document.createElement('div');
  const nm=document.createElement('div'); nm.className='co-name'; nm.textContent=c.name;
  const sb=document.createElement('div'); sb.className='co-sub'; sb.textContent=[c.admin1,c.country].filter(Boolean).join(', ');
  box.appendChild(nm); box.appendChild(sb); opt.appendChild(box);
  if(pinned){
    const x=document.createElement('button');
    x.className='co-unpin'; x.type='button'; x.textContent='✕';
    x.setAttribute('aria-label',t('favs.remove',{name:c.name}));
    x.onclick=e=>{e.stopPropagation();toggleFav(c);};
    opt.appendChild(x);
  }
  opt.onclick=()=>{$('cityDrop').style.display='none';$('cityInput').value=c.name;
    selectCity({latitude:c.lat,longitude:c.lon,name:c.name,country:c.country,admin1:c.admin1,timezone:c.timezone});};
  return opt;
}

// Dropdown shown when the search box is focused and empty: saved on top, then recent
function showRecent(){
  const drop=$('cityDrop');
  const favs=getFavs();
  const recent=_readList('recent_cities').filter(c=>!favs.some(f=>_sameLoc(f,c)));
  if(!favs.length&&!recent.length){drop.style.display='none';return;}
  drop.innerHTML='';
  const lbl=txt=>{const d=document.createElement('div');
    d.style.cssText='padding:7px 13px 4px;font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.8px';
    d.textContent=txt;return d;};
  if(favs.length){drop.appendChild(lbl(t('favs.saved')));favs.forEach(c=>drop.appendChild(_cityRow(c,true)));}
  if(recent.length){drop.appendChild(lbl(t('favs.recent')));recent.forEach(c=>drop.appendChild(_cityRow(c,false)));}
  drop.style.display='block';
}

// ─── SHARE ────────────────────────────────────────────────────────────────────
// Opens WhatsApp share sheet with city name and current URL (includes lat/lon params)
function shareWA(){
  const url=window.location.href;
  const text=`${t('share.text',{city:S.city})} | prognoze.lv`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text+'\n'+url)}`,'_blank');
}

// Opens Telegram share sheet with city name and current URL
function shareTG(){
  const url=window.location.href;
  const text=t('share.text',{city:S.city});
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,'_blank');
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────
// Uses Nominatim reverse geocoding to resolve browser coordinates to a city name.
// Pass auto=true on page load: shows status text and falls back to loadAll() on failure.
async function locateMe(auto=false){
  if(!navigator.geolocation){ if(auto) loadAll(); return; }
  const btn=document.querySelector('.lbtn');
  if(btn)btn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(
    async pos=>{
      if(btn)btn.classList.remove('loading');
      const{latitude:lat,longitude:lon}=pos.coords;
      // Start loading immediately with placeholder name; Nominatim updates it in background
      selectCity({latitude:lat,longitude:lon,name:t('geo.current_location'),country:'',admin1:'',timezone:''});
      try{
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${LANG}`);
        const d=await r.json();
        const a=d.address||{};
        const city=a.city||a.town||a.village||a.municipality||a.suburb||a.neighbourhood||a.county||d.display_name?.split(',')[0]||'';
        if(city){ $('cityName').textContent=city; S.city=city; }
        const country=d.address?.country||'';
        if(country){ $('heroSub').textContent=country; S.country=country; }
        S.geo={name:S.city,country:S.country,admin1:a.state||'',timezone:'',lat,lon};
        renderFavBtn();
        updateURL();
      }catch{ /* keep placeholder name */ }
    },
    ()=>{ if(btn)btn.classList.remove('loading'); if(auto) loadAll(); },
    {timeout:5000}
  );
}

