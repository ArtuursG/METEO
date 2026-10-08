// ─── CLIMATE & MODEL VERIFICATION ───────────────────────────────────────────

// ─── CLIMATE (ERA5 via Open-Meteo Archive) ───────────────────────────────────
const CLIM_PFX='clim2_';
let _climKey=null;   // coord key of the currently rendered climate view
// stripeColor, processClimate live in pure.js

async function fetchClimate(key){
  try{
    const raw=localStorage.getItem(CLIM_PFX+key);
    if(raw){const{ts,d}=JSON.parse(raw); if(Date.now()-ts<7*864e5)return d;}
  }catch{}
  const end=new Date(Date.now()-6*864e5).toISOString().slice(0,10); // archive lags ~5 days
  const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${S.lat}&longitude=${S.lon}`
    +`&start_date=1940-01-01&end_date=${end}&daily=temperature_2m_mean&timezone=auto`;
  const r=await fetch(url);
  if(!r.ok)throw new Error('archive '+r.status);
  const j=await r.json();
  if(!j.daily?.temperature_2m_mean)throw new Error('no data');
  const d=processClimate(j.daily.time,j.daily.temperature_2m_mean);
  try{localStorage.setItem(CLIM_PFX+key,JSON.stringify({ts:Date.now(),d}));}catch{}
  return d;
}

async function initClimate(){
  const key=`${S.lat.toFixed(2)}_${S.lon.toFixed(2)}`;
  if(_climKey===key)return;
  $('loadClim').style.display='flex';
  $('climContent').hidden=true;
  $('climErr').hidden=true;

  let d;
  try{ d=await fetchClimate(key); }
  catch(e){
    console.warn('[climate]',e);
    $('loadClim').style.display='none';
    $('climErr').hidden=false;
    return;
  }
  renderClimate(d);
  _climKey=key;
  $('loadClim').style.display='none';
  $('climContent').hidden=false;
}

function renderClimate(d){
  // Today's anomaly: forecast daily mean (max+min)/2 vs the day-of-year normal
  const fc=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  const tmax=fc?.daily?.temperature_2m_max?.[0], tmin=fc?.daily?.temperature_2m_min?.[0];
  const now=new Date();
  const doy=Math.floor((now-new Date(now.getFullYear(),0,0))/864e5);
  const normal=d.doyClim[doy];
  if(tmax!=null&&tmin!=null&&normal!=null){
    const today=(tmax+tmin)/2, anom=today-normal;
    const sign=anom>=0?'+':'−';
    $('climAnomVal').textContent=`${sign}${Math.abs(round(anom,1))}°C`;
    $('climAnomVal').style.color=anom>=0?'#e0796d':'#7aa8d8';
    $('climAnomLbl').textContent=t('clim.anom_today',{n:round(normal,1)});
  }else{
    $('climAnomVal').textContent='-';
    $('climAnomLbl').textContent=t('clim.anom_nodata');
  }

  // Latest complete year vs 1961-1990
  const full=d.annual.filter(a=>a.full);
  const last=full[full.length-1];
  if(last){
    const diff=last.mean-d.centre;
    const dstr=`${diff>=0?'+':'−'}${Math.abs(round(diff,1))}`;
    $('climYearNote').textContent=
      t('clim.year_note',{year:last.year,mean:round(last.mean,1),diff:dstr,centre:round(d.centre,1)});
  }

  // Warming stripes
  const wrap=$('climStripes');
  wrap.innerHTML='';
  d.annual.forEach(a=>{
    const z=(a.mean-d.centre)/d.sd;
    const bar=document.createElement('div');
    bar.className='stripe';
    bar.style.background=stripeColor(z);
    if(!a.full)bar.style.opacity='.55';
    const dstr=`${a.mean-d.centre>=0?'+':'−'}${Math.abs(round(a.mean-d.centre,1))}`;
    bar.title=t('clim.stripe_tooltip',{year:a.year,mean:round(a.mean,1),diff:dstr})+(a.full?'':t('clim.stripe_partial'));
    wrap.appendChild(bar);
  });
  const y0=d.annual[0]?.year, y1=d.annual[d.annual.length-1]?.year;
  $('climStripesRange').textContent=y0&&y1?`(${y0}-${y1})`:'';
  $('climAxisL').textContent=y0||'';
  $('climAxisR').textContent=y1||'';
}

// ─── MODEL VERIFICATION (recent model analysis vs nearest LVĢMC station) ──────
// The data comes from loadModelSkill() (model-skill.js), shared with the temperature chart
let _verifKey=null;

async function initVerification(){
  const key=`${S.lat.toFixed(2)}_${S.lon.toFixed(2)}`;
  if(_verifKey===key)return;
  _verifKey=null; // set again only when this place is drawn
  $('loadVerif').style.display='flex';
  $('verifContent').hidden=true;
  $('verifErr').hidden=true;

  const res=await loadModelSkill();
  // The place changed meanwhile: start over for the new one
  if(!res){if($('tab-about')?.classList.contains('on'))initVerification();return;}
  $('loadVerif').style.display='none';
  const msg=$('verifErr').firstElementChild;
  if(res.status==='ok'){
    try{
      renderVerification(res);
      _verifKey=key;
      $('verifContent').hidden=false;
      return;
    }catch(e){console.warn('[verif]',e);}
  }
  // data-i18n keeps the reason when the language changes; no station nearby is not an error
  const quiet={none:'ch.skill_none',few:'ch.skill_few'}[res.status];
  msg.dataset.i18n=quiet||'verif.err';
  msg.textContent=t(msg.dataset.i18n);
  msg.className=quiet?'clim-note':'err';
  $('verifMeta').textContent='';
  $('verifErr').hidden=false;
}

// Models picked for the chart; null until the first render (then the 3 most accurate)
let _verifChosen=null;

function renderVerification(res){
  const st=res.station,dist=res.dist;
  const rows=res.rows.map(r=>({...MODELS.find(m=>m.id===r.id),...r})).filter(r=>r.name);
  const times=res.resp.hourly.time,off=res.resp.utc_offset_seconds;
  $('verifMeta').textContent=t('verif.station',{name:st.name,dist:fmtNum(dist,dist<10?1:0)});
  // Models that tie on the rounded error share the top spot
  const top=new Set(skillBest(rows).map(r=>r.id));
  $('verifIntro').textContent=t('verif.intro',{best:skillNames(rows.filter(r=>top.has(r.id))),mae:fmtNum(rows[0].mae,1)});

  const available=new Set(rows.map(r=>r.id));
  _verifChosen=_verifChosen===null?new Set(rows.slice(0,3).map(r=>r.id)):new Set([..._verifChosen].filter(id=>available.has(id)));
  let hint=$('modelCompareHint');
  if(!hint){hint=document.createElement('p');hint.id='modelCompareHint';hint.className='compare-hint';$('verifTable').before(hint);}
  hint.textContent=t('st.verif_hint');

  const fmtBias=v=>{const x=round(v,1); return x===0?`±${fmtNum(0,1)}°C`:`${x>0?'+':'−'}${fmtNum(Math.abs(x),1)}°C`;};
  const tb=$('verifBody'); tb.textContent='';
  rows.forEach(rw=>{
    const tr=document.createElement('tr');
    if(top.has(rw.id))tr.className='verif-best';
    const td1=document.createElement('td');
    const label=document.createElement('label');
    const check=document.createElement('input');
    check.type='checkbox';check.checked=_verifChosen.has(rw.id);
    check.setAttribute('aria-label',t('st.verif_compare',{name:rw.name}));
    check.addEventListener('change',()=>{check.checked?_verifChosen.add(rw.id):_verifChosen.delete(rw.id);drawVerifChart();});
    const dot=document.createElement('span'); dot.className='mt-dot'; dot.style.background=rw.color;
    label.append(check,dot,document.createTextNode(rw.name));
    td1.appendChild(label);
    const td2=document.createElement('td'); td2.textContent=`${fmtNum(rw.mae,1)}°C`;
    const td3=document.createElement('td'); td3.textContent=fmtBias(rw.bias);
    const td4=document.createElement('td'); td4.textContent=rw.n;
    tr.append(td1,td2,td3,td4);
    tb.appendChild(tr);
  });

  const cd=CD();
  const labels=times.map(fmtHour);
  // Same hour alignment as the scores (Riga wall clock on both sides)
  const obsData=times.map(iso=>res.obs[skillHourKey(iso,off)]??null);
  const measured={label:`${st.name} (${t('verif.measured')})`,data:obsData,borderColor:cssVar('--t'),borderWidth:2.5,pointRadius:0,tension:0.3};
  const datasets=()=>[measured,...rows.filter(rw=>_verifChosen.has(rw.id)).map(rw=>({
    label:rw.name,data:res.resp.hourly[`temperature_2m_${rw.id}`],
    borderColor:rw.color,borderWidth:1.5,pointRadius:0,tension:0.3,borderDash:[4,3]
  }))];
  function drawVerifChart(){
    if(!S.charts.verif)return;
    S.charts.verif.data.datasets=datasets();
    S.charts.verif.update();
  }
  if(S.charts.verif)S.charts.verif.destroy();
  $('cVerif').style.display='block';
  S.charts.verif=new Chart($('cVerif'),{
    type:'line',data:{labels,datasets:datasets()},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:12}},
        y:{...cd.scales.y,ticks:{...cd.scales.y.ticks,callback:v=>v+'°C'}}},
      plugins:{...cd.plugins,
        legend:{display:true,position:'bottom',labels:{color:cssVar('--t3'),boxWidth:10,font:{size:11}}},
        tooltip:{...cd.plugins.tooltip,callbacks:{
          title:items=>fmtTooltipTitle(times,items[0].dataIndex),
          label:c=>` ${c.dataset.label}: ${fmtNum(c.parsed.y,1)}°C`
        }}}
    }
  });
}
