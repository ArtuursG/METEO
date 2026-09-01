// ─── CHARTS: model toggles, Chart.js defaults, all forecast charts, table ────

// ─── MODEL TOGGLES ───────────────────────────────────────────────────────────
// Renders the toggle buttons for the temperature chart model selector
function buildToggles(){
  const wrap=$('modelToggles');
  wrap.innerHTML='';

  const allOn=MODELS.every(m=>S.active.has(m.id));
  const addCtrl=(label,active,fn)=>{
    const b=document.createElement('button');
    b.className='mt'+(active?' on':'');
    b.textContent=label;
    b.onclick=fn;
    wrap.appendChild(b);
  };
  addCtrl(t('sel.all'),allOn,()=>{
    MODELS.forEach(m=>S.active.add(m.id));
    buildToggles();
    rebuildTempChart();
  });
  addCtrl(t('sel.none'),S.active.size===0,()=>{
    S.active.clear();
    buildToggles();
    rebuildTempChart();
  });

  const sep=document.createElement('div');
  sep.style.cssText='width:0.5px;background:var(--b2);margin:2px 6px;align-self:stretch';
  wrap.appendChild(sep);

  MODELS.forEach(m=>{
    const b=document.createElement('button');
    b.className='mt'+(S.active.has(m.id)?' on':'');
    b.setAttribute('aria-pressed',S.active.has(m.id)?'true':'false');
    b.innerHTML=`<span class="mt-dot" style="background:${m.color}"></span>${m.name}`;
    b.title=`${m.org} · ${m.res} · ${m.days} ${t('unit.days')}`;
    b.setAttribute('aria-label',t('sel.model_show',{name:m.name}));
    b.onclick=()=>{
      const on=!S.active.has(m.id);
      on?S.active.add(m.id):S.active.delete(m.id);
      b.classList.toggle('on',on);
      b.setAttribute('aria-pressed',on?'true':'false');
      $('activeCount').textContent=S.active.size;
      rebuildTempChart();
    };
    wrap.appendChild(b);
  });
  $('activeCount').textContent=S.active.size;
}

// ─── MODEL INFO LIST ─────────────────────────────────────────────────────────
// Builds the "Models" tab with colour dot, name, org, resolution and days
function buildModelInfo(){
  const wrap=$('modelInfoList');
  wrap.innerHTML='';
  MODELS.forEach(m=>{
    const div=document.createElement('div');
    div.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--b)';
    div.innerHTML=`
      <span style="width:10px;height:10px;border-radius:50%;background:${m.color};flex-shrink:0"></span>
      <div style="flex:1">
        <div style="font-weight:500;font-size:13px">${m.name}</div>
        <div style="font-size:11px;color:var(--t3)">${m.org} · ${t('models.resolution')}: ${m.res} · ${t('models.forecast')}: ${m.days} ${t('unit.days')}</div>
      </div>`;
    wrap.appendChild(div);
  });
}

// ─── CROSSHAIR PLUGIN ────────────────────────────────────────────────────────
// Draws a vertical dashed line at the hovered x position across all charts
Chart.register({
  id:'crosshair',
  afterDraw(chart){
    const active=chart.tooltip?._active;
    if(!active?.length)return;
    const ctx=chart.ctx;
    const x=active[0].element.x;
    const{top,bottom,left,right}=chart.chartArea;
    if(x<left||x>right)return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x,top);
    ctx.lineTo(x,bottom);
    ctx.lineWidth=1;
    ctx.strokeStyle='rgba(150,150,150,.35)';
    ctx.setLineDash([4,4]);
    ctx.stroke();
    ctx.restore();
  }
});

// ─── CHART DEFAULTS ──────────────────────────────────────────────────────────
// Returns a Chart.js options object using current CSS theme variables.
// Called on every chart build so colours update correctly after theme toggle.
function CD(){
  const cs=getComputedStyle(document.body);
  const v=n=>cs.getPropertyValue(n).trim();
  const reduce=window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
  return {
  responsive:true,
  maintainAspectRatio:false,
  animation:{duration:reduce?0:300},
  interaction:{mode:'index',intersect:false},
  plugins:{
    legend:{display:false},
    tooltip:{
      backgroundColor:v('--chart-tip-bg'),
      borderColor:v('--chart-tip-border'),
      borderWidth:1,
      titleColor:v('--chart-tip-title'),
      bodyColor:v('--chart-tip-body'),
      padding:11,
      cornerRadius:7,
    }
  },
  scales:{
    x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:16,maxRotation:0,autoSkip:true,
        // Suppress duplicate date labels when multiple hourly ticks share the same day string
        callback:function(val,index,ticks){const cur=this.getLabelForValue(val);if(index>0&&this.getLabelForValue(ticks[index-1].value)===cur)return '';return cur;}},
      grid:{color:v('--chart-grid')}},
    y:{ticks:{color:v('--chart-tick'),font:{size:11}},grid:{color:v('--chart-grid')}}
  }
  };
}

// Hides the loading spinner and shows the canvas
function showChart(loadId,canvasId){
  $(loadId).style.display='none';
  $(canvasId).style.display='block';
}

// Renders coloured line swatches below a chart
function buildLegend(legId,models){
  const wrap=$(legId);
  if(!wrap)return;
  wrap.innerHTML='';
  models.forEach(m=>{
    const el=document.createElement('div');
    el.className='li';
    el.innerHTML=`<span class="ld" style="background:${m.color}"></span>${m.name}`;
    wrap.appendChild(el);
  });
}

// ─── TEMPERATURE CHART ───────────────────────────────────────────────────────
// Per-timestep min/max of hourly temperature across the given models
function tempSpread(models){
  const t=Object.values(S.data)[0].hourly.time;
  const min=new Array(t.length).fill(null), max=new Array(t.length).fill(null);
  for(let i=0;i<t.length;i++){
    const vals=models.map(m=>S.data[m.id].hourly.temperature_2m?.[i]).filter(v=>v!=null);
    if(vals.length<2)continue;
    min[i]=Math.min(...vals); max[i]=Math.max(...vals);
  }
  return {min,max};
}

// Short verdict on how far the models disagree, averaged over the next ~48 h
function spreadVerdict(min,max){
  const gaps=[];
  for(let i=0;i<Math.min(48,min.length);i++) if(min[i]!=null) gaps.push(max[i]-min[i]);
  if(!gaps.length)return '';
  const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  const a=round(avg,1);
  if(avg<1.5)return t('spread.agree',{n:a});
  if(avg<4)return t('spread.medium',{n:a});
  return t('spread.high',{n:a});
}

function rebuildTempChart(){
  const first=Object.values(S.data)[0];
  if(!first?.hourly?.time)return;
  const chartDefaults=CD();
  const spreadFill=getComputedStyle(document.body).getPropertyValue('--acc-soft').trim();
  const labels=first.hourly.time.map(fmtHour);
  const active=MODELS.filter(m=>S.data[m.id]?.hourly?.temperature_2m&&S.active.has(m.id));
  const lines=active.map(m=>({
    label:m.name,
    data:S.data[m.id].hourly.temperature_2m,
    borderColor:m.color,
    borderWidth:1.5,
    pointRadius:0,
    tension:0.3,
    fill:false,
  }));

  // Shaded band between the coldest and warmest model at each hour. Drawn first
  // so it sits behind every model line; _band flag keeps it out of the tooltip.
  let band=[], sp=null;
  if(S.showSpread&&active.length>=2){
    sp=tempSpread(active);
    band=[
      {label:'_spreadMin',data:sp.min,borderWidth:0,pointRadius:0,tension:0.3,fill:false,_band:true},
      {label:t('chart.model_range'),data:sp.max,borderWidth:0,pointRadius:0,tension:0.3,fill:'-1',backgroundColor:spreadFill,_band:true},
    ];
  }

  showChart('loadT','cT');
  if(S.charts.temp)S.charts.temp.destroy();
  S.charts.temp=new Chart($('cT'),{
    type:'line',data:{labels,datasets:[...band,...lines]},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'°C'}}
      },
      plugins:{...chartDefaults.plugins,
        tooltip:{...chartDefaults.plugins.tooltip,
          filter:item=>!item.dataset._band,
          callbacks:{
            title:items=>fmtTooltipTitle(first.hourly.time,items[0].dataIndex),
            label:c=>` ${c.dataset.label}: ${round(c.parsed.y)}°C`,
            footer:items=>{
              if(!sp)return '';
              const i=items[0].dataIndex;
              if(sp.min[i]==null)return '';
              return t('spread.tooltip_range',{min:round(sp.min[i]),max:round(sp.max[i]),d:round(sp.max[i]-sp.min[i],1)});
            }
          }
        }
      }
    }
  });
  buildLegend('legT',MODELS.filter(m=>S.data[m.id]&&S.active.has(m.id)));

  const info=$('spreadInfo');
  if(info)info.textContent=sp?spreadVerdict(sp.min,sp.max):'';
  const chk=$('spreadChk');
  if(chk)chk.checked=S.showSpread;
}

function toggleSpread(on){
  S.showSpread=on;
  try{localStorage.setItem('show_spread',on?'1':'0');}catch{}
  rebuildTempChart();
}

// ─── PRECIPITATION CHART ─────────────────────────────────────────────────────
// Single-model mode renders a bar chart; multi-model renders overlaid line charts
function mkModelSelector(containerId,stateKey,title,onSelect){
  const hd=$(containerId);
  hd.innerHTML=`<span class="card-title">${title}</span>`;
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;gap:4px';
  wrap.setAttribute('role','group');
  wrap.setAttribute('aria-label',title);
  TABLE_MODELS.forEach(tm=>{
    const b=document.createElement('button');
    b.className='mt'+(S[stateKey]===tm.id?' on':'');
    b.textContent=tm.name;
    b.setAttribute('aria-pressed',S[stateKey]===tm.id?'true':'false');
    b.onclick=()=>{S[stateKey]=tm.id;onSelect();};
    wrap.appendChild(b);
  });
  hd.appendChild(wrap);
}

function mkMultiSelector(containerId,stateKey,title,onSelect){
  const hd=$(containerId);
  hd.innerHTML=`<span class="card-title">${title}</span>`;
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:.6rem';
  const allOn=MODELS.every(m=>S[stateKey].has(m.id));
  const addCtrl=(label,active,fn)=>{
    const b=document.createElement('button');
    b.className='mt'+(active?' on':'');
    b.textContent=label;b.onclick=fn;wrap.appendChild(b);
  };
  addCtrl(t('sel.all'),allOn,()=>{MODELS.forEach(m=>S[stateKey].add(m.id));onSelect();});
  addCtrl(t('sel.none'),S[stateKey].size===0,()=>{S[stateKey].clear();onSelect();});
  const sep=document.createElement('div');
  sep.style.cssText='width:0.5px;background:var(--b2);margin:2px 6px;align-self:stretch';
  wrap.appendChild(sep);
  MODELS.forEach(m=>{
    const b=document.createElement('button');
    b.className='mt'+(S[stateKey].has(m.id)?' on':'');
    b.setAttribute('aria-pressed',S[stateKey].has(m.id)?'true':'false');
    b.innerHTML=`<span class="mt-dot" style="background:${m.color}"></span>${m.name}`;
    b.title=`${m.org} · ${m.res} · ${m.days} ${t('unit.days')}`;
    b.setAttribute('aria-label',t('sel.model_show',{name:m.name}));
    b.onclick=()=>{
      // Prevent deselecting the last active model
      if(S[stateKey].has(m.id)){if(S[stateKey].size<=1)return;S[stateKey].delete(m.id);}
      else S[stateKey].add(m.id);
      onSelect();
    };
    wrap.appendChild(b);
  });
  hd.appendChild(wrap);
}

// Formats a full readable timestamp for chart tooltips
function fmtTooltipTitle(timeArr,idx){
  const d=new Date(timeArr[idx]);
  const wd=d.toLocaleDateString(LOCALE,{weekday:'long'});
  return `${d.toLocaleDateString(LOCALE,{day:'numeric',month:'long'})} · ${wd} · ${d.toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'})}`;
}

function buildPrecipCharts(){
  mkMultiSelector('precipCardHd','precipModels',t('chart.precip_mm'),buildPrecipCharts);

  const base=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!base?.hourly?.time)return;
  const chartDefaults=CD();
  const labels=base.hourly.time.map(fmtHour);
  const active=MODELS.filter(m=>S.precipModels.has(m.id)&&S.data[m.id]?.hourly?.precipitation);
  const multi=active.length>1;

  showChart('loadP','cP');
  if(S.charts.precip)S.charts.precip.destroy();

  const datasets=multi
    ? active.map(m=>({label:m.name,data:S.data[m.id].hourly.precipitation,borderColor:m.color,backgroundColor:m.color+'30',borderWidth:1.5,pointRadius:0,tension:0.3,fill:true}))
    : active.length===1
      ? [{label:active[0].name,data:S.data[active[0].id].hourly.precipitation||[],backgroundColor:active[0].color+'8c',borderColor:active[0].color,borderWidth:0,borderRadius:2}]
      : [];

  S.charts.precip=new Chart($('cP'),{
    type:multi?'line':'bar',
    data:{labels,datasets},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        x:{...chartDefaults.scales.x,ticks:{...chartDefaults.scales.x.ticks,maxTicksLimit:16}},
        y:{...chartDefaults.scales.y,min:0,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+' mm'}}
      },
      plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
        label:c=>` ${c.dataset.label}: ${round(c.parsed.y,1)} mm`
      }}}
    }
  });

  // Precipitation probability chart - follows the same model selection as the mm chart above
  if(S.charts.precipP){S.charts.precipP.destroy();S.charts.precipP=null;}
  const ppDatasets=MODELS
    .filter(m=>S.precipModels.has(m.id)&&S.data[m.id]?.hourly?.precipitation_probability?.some(v=>v!=null))
    .map(m=>({
      label:m.name,data:S.data[m.id].hourly.precipitation_probability,
      borderColor:m.color,borderWidth:1.5,pointRadius:0,tension:0.3,fill:false
    }));
  if(ppDatasets.length){
    showChart('loadPP','cPP');
    S.charts.precipP=new Chart($('cPP'),{
      type:'line',data:{labels,datasets:ppDatasets},
      options:{...chartDefaults,
        scales:{...chartDefaults.scales,
          y:{...chartDefaults.scales.y,min:0,max:100,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'%'}}
        },
        plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
          title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
          label:c=>` ${c.dataset.label}: ${r0(c.parsed.y)}%`
        }}}
      }
    });
  } else {
    // Hide the canvas (do not replaceWith - that permanently removes the element)
    $('cPP').style.display='none';
    $('loadPP').style.display='flex';
    $('loadPP').innerHTML=`<div class="err">${t('chart.no_precip_prob')}</div>`;
  }
}

// ─── WIND CHART ──────────────────────────────────────────────────────────────
function buildWindChart(){
  mkMultiSelector('windCardHd','windModels',`${t('chart.wind_speed')} (${S.windUnit})`,buildWindChart);

  // Unit toggle - inserted between the title and the model selector
  const unitDiv=document.createElement('div');
  unitDiv.style.cssText='display:flex;gap:4px;margin-left:auto';
  ['m/s','km/h'].forEach(u=>{
    const b=document.createElement('button');
    b.className='mt'+(S.windUnit===u?' on':'');
    b.textContent=u;
    b.onclick=()=>setWindUnit(u);
    unitDiv.appendChild(b);
  });
  $('windCardHd').insertBefore(unitDiv,$('windCardHd').children[1]);

  const base=S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!base?.hourly?.time)return;
  const chartDefaults=CD();
  const labels=base.hourly.time.map(fmtHour);
  const datasets=MODELS
    .filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.wind_speed_10m)
    .map(m=>({
      label:m.name,
      data:S.data[m.id].hourly.wind_speed_10m.map(v=>windConv(v)),
      borderColor:m.color,borderWidth:1.5,pointRadius:0,tension:0.3,fill:false
    }));
  showChart('loadW','cW');
  if(S.charts.wind)S.charts.wind.destroy();
  S.charts.wind=new Chart($('cW'),{
    type:'line',data:{labels,datasets},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,min:0,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+' '+S.windUnit}}
      },
      plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
        label:c=>` ${c.dataset.label}: ${c.parsed.y} ${S.windUnit}`
      }}}
    }
  });
  buildLegend('legW',MODELS.filter(m=>S.windModels.has(m.id)&&S.data[m.id]?.hourly?.wind_speed_10m));
}

// Persists the selected unit and rebuilds all wind displays (metrics, chart, table)
function setWindUnit(u){
  S.windUnit=u;
  try{localStorage.setItem('wind_unit',u);}catch{}
  updateMetrics();
  buildWindChart();
  buildTable();
}

// ─── CLOUD COVER CHART ───────────────────────────────────────────────────────
const CLOUD_LEVELS=[
  {max:25,  key:'cloud.clear',    color:'#9fd8ef'},
  {max:50,  key:'cloud.partly',   color:'#7bafc8'},
  {max:75,  key:'cloud.cloudy',   color:'#8595a3'},
  {max:100, key:'cloud.overcast', color:'#5e6e7a'},
];
const cloudColor=v=>(CLOUD_LEVELS.find(l=>v<=l.max)||CLOUD_LEVELS[3]).color;
const cloudLabel=v=>t((CLOUD_LEVELS.find(l=>v<=l.max)||CLOUD_LEVELS[3]).key);

function buildCloudChart(){
  mkModelSelector('cloudCardHd','cloudModel',t('chart.cloud_cover'),buildCloudChart);
  const src=S.data[S.cloudModel]||S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!src?.hourly?.time)return;
  const cd=CD();
  const cap=5*24;
  const times=src.hourly.time.slice(0,cap);
  const labels=times.map(fmtHour);
  const vals=(src.hourly.cloud_cover||[]).slice(0,cap);
  showChart('loadCl','cCl');
  if(S.charts.cloud)S.charts.cloud.destroy();
  S.charts.cloud=new Chart($('cCl'),{
    type:'bar',
    data:{labels,datasets:[{
      data:vals,
      backgroundColor:vals.map(v=>cloudColor(v??0)),
      borderWidth:0,
      borderRadius:0,
      barPercentage:1.0,
      categoryPercentage:1.0,
    }]},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:16}},
        y:{...cd.scales.y,min:0,max:100,ticks:{...cd.scales.y.ticks,callback:v=>v+'%'}}
      },
      plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(times,items[0].dataIndex),
        label:c=>` ${Math.round(c.parsed.y)}% · ${cloudLabel(c.parsed.y)}`
      }}}
    }
  });
  const leg=$('legCl');
  if(leg) leg.innerHTML=CLOUD_LEVELS.map(l=>`<div class="li"><span class="ld" style="background:${l.color}"></span>${t(l.key)}</div>`).join('');
}

// ─── UV INDEX CHART ───────────────────────────────────────────────────────────
const UV_LEVELS=[
  {max:2, key:'uv.low',      color:'#57a838'},
  {max:5, key:'uv.moderate', color:'#f5c518'},
  {max:7, key:'uv.high',     color:'#f77f00'},
  {max:10,key:'uv.veryhigh', color:'#e8292a'},
  {max:Infinity,key:'uv.extreme',color:'#9b4dca'},
];
function uvColor(v){ return (UV_LEVELS.find(l=>v<=l.max)||UV_LEVELS[4]).color; }
function uvLabel(v){ return t((UV_LEVELS.find(l=>v<=l.max)||UV_LEVELS[4]).key); }

function buildUVChart(){
  // Some models return uv_index:[null,null,...] instead of omitting the field - .some() is needed
  // because a plain truthiness check would select those models and render as invisible all-zero bars.
  const hasUV=d=>d?.hourly?.uv_index?.some(v=>v!=null);
  const src=[S.data['ecmwf_ifs025'],S.data['gfs_seamless'],...Object.values(S.data)].find(hasUV);
  const meta=$('uvMeta');
  if(!src?.hourly?.time){
    if(meta)meta.textContent='Nav datu';
    $('loadUV').style.display='none';
    return;
  }

  const modelName=MODELS.find(m=>S.data[m.id]===src)?.name||'';
  if(meta)meta.textContent=modelName;

  // Hourly chart: start from current hour, show 5 days ahead
  const now=new Date();
  const startIdx=Math.max(0,src.hourly.time.findIndex(t=>new Date(t)>=now));
  const times=src.hourly.time.slice(startIdx,startIdx+5*24);
  const vals=src.hourly.uv_index.slice(startIdx,startIdx+5*24);
  const labels=times.map(fmtHour);

  const cd=CD();
  showChart('loadUV','cUV');
  if(S.charts.uv)S.charts.uv.destroy();
  S.charts.uv=new Chart($('cUV'),{
    type:'bar',
    data:{labels,datasets:[{
      data:vals.map(v=>v??0),
      backgroundColor:vals.map(v=>uvColor(v??0)),
      borderWidth:0,
      borderRadius:3,
      barPercentage:0.85,
      categoryPercentage:0.85,
    }]},
    options:{...cd,
      scales:{...cd.scales,
        x:{...cd.scales.x,ticks:{...cd.scales.x.ticks,maxTicksLimit:20}},
        y:{...cd.scales.y,min:0,suggestedMax:8,
           ticks:{...cd.scales.y.ticks,stepSize:1,callback:v=>v>0?v:''}}
      },
      plugins:{...cd.plugins,tooltip:{...cd.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(times,items[0].dataIndex),
        label:c=>c.parsed.y>0?` UV ${Math.round(c.parsed.y)} · ${uvLabel(c.parsed.y)}`:' Nav UV'
      }}}
    }
  });

  const leg=$('legUV');
  if(leg) leg.innerHTML=UV_LEVELS.map(l=>`<div class="li"><span class="ld" style="background:${l.color}"></span>${t(l.key)}</div>`).join('');

}


// ─── FORECAST TABLE ───────────────────────────────────────────────────────────
function buildTable(){
  mkModelSelector('tableCardHd','tableModel',t('chart.forecast_daily'),buildTable);

  const src=S.data[S.tableModel]||S.data['ecmwf_ifs025']||Object.values(S.data)[0];
  if(!src?.daily?.time)return;
  const {time,temperature_2m_max:tmax,temperature_2m_min:tmin,precipitation_sum:ps,
         precipitation_probability_max:ppm,wind_speed_10m_max:wmax,
         relative_humidity_2m_mean:rh,weather_code:wc,cloud_cover_mean:cc}=src.daily;
  const tbody=$('tBody');
  tbody.innerHTML='';
  time.forEach((iso,i)=>{
    const mx=r0(tmax?.[i]),mn=r0(tmin?.[i]);
    const icon=wIcon(wc?.[i]);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(iso)}</td>
      <td class="wcell" title="${wText(wc?.[i])}">${icon}</td>
      <td class="${tempCls(mx)}">${mx!=null?mx+'°':'-'}</td>
      <td class="${tempCls(mn)}">${mn!=null?mn+'°':'-'}</td>
      <td>${ps?.[i]!=null?round(ps[i],1)+' mm':'-'}</td>
      <td>${ppm?.[i]!=null?r0(ppm[i])+'%':'-'}</td>
      <td>${wmax?.[i]!=null?windConv(wmax[i])+' '+S.windUnit:'-'}</td>
      <td>${cc?.[i]!=null?r0(cc[i])+'%':'-'}</td>
      <td>${rh?.[i]!=null?r0(rh[i])+'%':'-'}</td>
    `;
    tbody.appendChild(tr);
  });
  $('loadTbl').style.display='none';
  $('forecastTable').style.display='table';
}

