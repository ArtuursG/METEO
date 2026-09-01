// ─── CLIMATE & MODEL VERIFICATION ───────────────────────────────────────────

// ─── CLIMATE (ERA5 via Open-Meteo Archive) ───────────────────────────────────
const CLIM_PFX='clim2_';
let _climKey=null;   // coord key of the currently rendered climate view

const _avg=a=>a.reduce((s,v)=>s+v,0)/a.length;

// Warming-stripes colour: z = (year mean - 1961-90 mean) / sd, mapped blue->white->red
function stripeColor(z){
  const t=Math.max(-1,Math.min(1,z/3));
  const cold=[8,48,107], mid=[245,245,245], warm=[103,0,13];
  const [x,y]=t<0?[cold,mid]:[mid,warm];
  const f=Math.abs(t);
  return `rgb(${Math.round(x[0]+(y[0]-x[0])*f)},${Math.round(x[1]+(y[1]-x[1])*f)},${Math.round(x[2]+(y[2]-x[2])*f)})`;
}

// Reduce ~85 years of daily means to the small structure the view needs
function processClimate(time,mean){
  const byYear={}, doySum=new Array(367).fill(0), doyCnt=new Array(367).fill(0);
  for(let i=0;i<time.length;i++){
    const v=mean[i]; if(v==null)continue;
    const t=time[i], y=+t.slice(0,4);
    (byYear[y]=byYear[y]||[]).push(v);
    if(y>=1991&&y<=2020){
      const d=new Date(t+'T00:00');
      const doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5);
      doySum[doy]+=v; doyCnt[doy]++;
    }
  }
  const thisYear=new Date().getFullYear();
  const annual=Object.keys(byYear).map(Number).sort((a,b)=>a-b).map(y=>({
    year:y, mean:_avg(byYear[y]), full:byYear[y].length>=350
  })).filter(a=>a.full||a.year===thisYear);
  // day-of-year normal, smoothed +-7 days (circular)
  const doyClim=new Array(367).fill(null);
  for(let d=1;d<=366;d++){
    let s=0,c=0;
    for(let k=-7;k<=7;k++){const dd=((d+k-1)%366+366)%366+1; if(doyCnt[dd]){s+=doySum[dd]/doyCnt[dd];c++;}}
    if(c)doyClim[d]=s/c;
  }
  const base=annual.filter(a=>a.year>=1961&&a.year<=1990&&a.full);
  const centre=base.length?_avg(base.map(a=>a.mean)):_avg(annual.map(a=>a.mean));
  const mn=_avg(annual.map(a=>a.mean));
  const sd=Math.sqrt(_avg(annual.map(a=>(a.mean-mn)**2)))||1;
  return {annual,doyClim,centre,sd};
}

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
let _verifKey=null;

async function initVerification(){
  const key=`${S.lat.toFixed(2)}_${S.lon.toFixed(2)}`;
  if(_verifKey===key)return;
  $('loadVerif').style.display='flex';
  $('verifContent').hidden=true;
  $('verifErr').hidden=true;

  try{
    await ensureLvgmcStations();
    const cand=(_lvgmcStations||[])
      .filter(s=>Array.isArray(s.history)&&s.history.some(h=>h.airTemp!=null&&h.time))
      .map(s=>({s,d:haversineKm(S.lat,S.lon,s.lat,s.lon)}))
      .sort((a,b)=>a.d-b.d)[0];
    if(!cand)throw new Error('no nearby station with history');
    const st=cand.s;

    // observed hourly air temperature, keyed by the "YYYY-MM-DDTHH" hour bucket
    const obs={};
    for(const h of st.history){
      if(h.airTemp==null||!h.time)continue;
      obs[h.time.slice(0,13)]=h.airTemp;
    }
    if(Object.keys(obs).length<6)throw new Error('too little station history');

    const models=MODELS.map(m=>m.id).join(',');
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}`
      +`&models=${models}&hourly=temperature_2m&past_days=2&forecast_days=1&timezone=auto`;
    const r=await fetch(url);
    if(!r.ok)throw new Error('forecast '+r.status);
    const j=await r.json();
    const times=j.hourly?.time;
    if(!times)throw new Error('no forecast times');

    const rows=[];
    for(const m of MODELS){
      const arr=j.hourly[`temperature_2m_${m.id}`];
      if(!arr)continue;
      let sum=0,abs=0,n=0;
      for(let i=0;i<times.length;i++){
        const o=obs[times[i].slice(0,13)];
        if(o==null||arr[i]==null)continue;
        const e=arr[i]-o; sum+=e; abs+=Math.abs(e); n++;
      }
      if(n>=6)rows.push({name:m.name,color:m.color,id:m.id,mae:abs/n,bias:sum/n,n});
    }
    if(!rows.length)throw new Error('no obs/forecast overlap');
    rows.sort((a,b)=>a.mae-b.mae);

    renderVerification(st,cand.d,rows,{times,hourly:j.hourly,obs});
    _verifKey=key;
    $('loadVerif').style.display='none';
    $('verifContent').hidden=false;
  }catch(e){
    console.warn('[verif]',e);
    $('loadVerif').style.display='none';
    $('verifErr').hidden=false;
  }
}

function renderVerification(st,dist,rows,series){
  $('verifMeta').textContent=t('verif.station',{name:st.name,dist:round(dist)});
  const best=rows[0];
  $('verifIntro').textContent=t('verif.intro',
    {station:st.name,best:best.name,mae:best.mae.toFixed(1),count:rows.length});

  const fmtBias=v=>{const x=+v.toFixed(1); return x===0?'±0.0°C':`${x>0?'+':'−'}${Math.abs(x).toFixed(1)}°C`;};
  const tb=$('verifBody'); tb.textContent='';
  rows.forEach((rw,i)=>{
    const tr=document.createElement('tr');
    if(i===0)tr.className='verif-best';
    const td1=document.createElement('td');
    const dot=document.createElement('span'); dot.className='mt-dot'; dot.style.background=rw.color;
    td1.appendChild(dot); td1.appendChild(document.createTextNode(rw.name));
    const td2=document.createElement('td'); td2.textContent=`${rw.mae.toFixed(1)}°C`;
    const td3=document.createElement('td'); td3.textContent=fmtBias(rw.bias);
    const td4=document.createElement('td'); td4.textContent=rw.n;
    tr.append(td1,td2,td3,td4);
    tb.appendChild(tr);
  });

  const cd=CD();
  const labels=series.times.map(fmtHour);
  const obsData=series.times.map(iso=>series.obs[iso.slice(0,13)]??null);
  const ds=[{label:`${st.name} (${t('verif.measured')})`,data:obsData,borderColor:cssVar('--t'),borderWidth:2.5,pointRadius:0,tension:0.3}];
  rows.slice(0,3).forEach(rw=>ds.push({
    label:rw.name,data:series.hourly[`temperature_2m_${rw.id}`],
    borderColor:rw.color,borderWidth:1.5,pointRadius:0,tension:0.3,borderDash:[4,3]
  }));
  if(S.charts.verif)S.charts.verif.destroy();
  $('cVerif').style.display='block';
  S.charts.verif=new Chart($('cVerif'),{
    type:'line',data:{labels,datasets:ds},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:12}},
        y:{...cd.scales.y,ticks:{...cd.scales.y.ticks,callback:v=>v+'°C'}}},
      plugins:{...cd.plugins,
        legend:{display:true,position:'bottom',labels:{color:cssVar('--t3'),boxWidth:10,font:{size:11}}},
        tooltip:{...cd.plugins.tooltip,callbacks:{
          title:items=>fmtTooltipTitle(series.times,items[0].dataIndex),
          label:c=>` ${c.dataset.label}: ${round(c.parsed.y,1)}°C`
        }}}
    }
  });
}

