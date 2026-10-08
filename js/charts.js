// ─── CHARTS: model toggles, Chart.js defaults, all forecast charts, table ────

// ─── MODEL PICKER ────────────────────────────────────────────────────────────
// One compact picker for the temperature, precipitation and wind charts: chips for the
// models on the chart (they double as the legend) and a "+N" panel with every model.
// Choices are remembered per chart; the defaults are the recommended models.
const REC_IDS=RECOMMENDED_MODELS.map(m=>m.id);
const PICKER={
  active:       {store:'temp_models',  def:REC_IDS, minOne:false, id:'tempPicker'},
  precipModels: {store:'precip_models',def:REC_IDS, minOne:true,  id:'precipPicker'},
  windModels:   {store:'wind_models',  def:REC_IDS, minOne:true,  id:'windPicker'},
};
const _pickerOpen={};

function loadModelSet(key){
  const cfg=PICKER[key];
  try{
    const v=JSON.parse(localStorage.getItem(cfg.store)||'null');
    if(Array.isArray(v)){
      const ok=v.filter(id=>MODELS.some(m=>m.id===id));
      if(ok.length||!cfg.minOne)return new Set(ok);
    }
  }catch{}
  return new Set(cfg.def);
}
function saveModelSet(key){try{localStorage.setItem(PICKER[key].store,JSON.stringify([...S[key]]));}catch{}}
for(const key of Object.keys(PICKER))S[key]=loadModelSet(key);
// Single-model choices (cloud chart, daily table)
const SINGLE_STORE={cloudModel:'cloud_model',tableModel:'table_model'};
for(const [key,store] of Object.entries(SINGLE_STORE)){
  try{const v=localStorage.getItem(store);if(MODELS.some(m=>m.id===v))S[key]=v;}catch{}
}
S.showMedian=(()=>{try{return localStorage.getItem('show_median')!=='0';}catch{return true;}})();

const PICKER_REBUILD={active:()=>rebuildTempChart(),precipModels:()=>buildPrecipCharts(),windModels:()=>buildWindChart()};

// Grid size as read here: '1.5km' becomes '1,5 km' in Latvian
const fmtRes=res=>{const v=parseFloat(res);return Number.isFinite(v)?fmtNum(v,v%1?1:0)+' km':res;};

function moreLabel(n){return t(n%10===1&&n%100!==11?'ch.more_one':'ch.more',{n});}

function pickerNode(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}

function buildModelPicker(key){
  const cfg=PICKER[key],wrap=$(cfg.id);
  if(!wrap)return;
  const set=S[key],change=()=>{saveModelSet(key);PICKER_REBUILD[key]();};
  const hasData=Object.keys(S.data).length>0;
  const available=m=>!hasData||!!S.data[m.id];
  const visible=()=>MODELS.filter(m=>set.has(m.id)&&available(m)).length;
  // Precipitation and wind always keep one model that has data at this place
  if(cfg.minOne&&hasData&&!visible()){
    const fallback=cfg.def.map(id=>MODELS.find(m=>m.id===id)).find(m=>m&&available(m))||MODELS.find(available);
    if(fallback){set.add(fallback.id);saveModelSet(key);}
  }
  // Rebuilding replaces the buttons: remember which one had focus and put it back after
  const focusKey=wrap.contains(document.activeElement)?document.activeElement.dataset.k:null;
  const order=[...wrap.querySelectorAll('[data-k]')].map(e=>e.dataset.k);
  wrap.replaceChildren();
  wrap.setAttribute('role','group');
  wrap.setAttribute('aria-label',t('ch.picker_aria'));

  // Temperature: median line and spread band can be switched off
  if(key==='active'){
    for(const [prop,store,label,title,sw] of [
      ['showMedian','show_median','ch.median','ch.median_title','mp-sw-median'],
      ['showSpread','show_spread','ch.spread','ch.spread_title','mp-sw-band'],
    ]){
      const b=pickerNode('button','mp-chip mp-toggle');b.type='button';b.dataset.k='toggle:'+prop;
      b.setAttribute('aria-pressed',String(!!S[prop]));b.title=t(title);
      b.append(pickerNode('i',sw),pickerNode('span',null,t(label)));
      b.onclick=()=>{S[prop]=!S[prop];try{localStorage.setItem(store,S[prop]?'1':'0');}catch{}rebuildTempChart();buildModelPicker(key);};
      wrap.append(b);
    }
    wrap.append(pickerNode('span','mp-sep'));
  }

  const last=cfg.minOne&&visible()<=1;
  for(const m of MODELS.filter(m=>set.has(m.id)&&available(m))){
    const b=pickerNode('button','mp-chip');b.type='button';b.dataset.k='chip:'+m.id;
    const dot=pickerNode('i','mp-dot');dot.style.background=m.color;
    b.append(dot,pickerNode('span',null,m.name));
    if(!last)b.append(pickerNode('span','mp-x','×'));
    b.title=last?t('ch.last_one'):t('ch.remove',{name:m.name});
    b.setAttribute('aria-label',b.title);
    b.disabled=last;
    b.onclick=()=>{if(last)return;set.delete(m.id);change();buildModelPicker(key);};
    wrap.append(b);
  }

  const rest=MODELS.filter(m=>available(m)&&!set.has(m.id)).length;
  const more=pickerNode('button','mp-more',rest?moreLabel(rest):t('ch.choose'));more.type='button';more.dataset.k='more';
  const panelId=cfg.id+'Panel';
  more.setAttribute('aria-expanded',String(!!_pickerOpen[key]));
  more.setAttribute('aria-controls',panelId);
  more.onclick=()=>{_pickerOpen[key]=!_pickerOpen[key];buildModelPicker(key);if(_pickerOpen[key])$(panelId)?.querySelector('input:not(:disabled)')?.focus();};
  wrap.append(more);

  if(_pickerOpen[key]){
    const panel=pickerNode('div','mp-panel');panel.id=panelId;
    // Temperature only: recent error near this place (model-skill.js), information only
    const skill=key==='active'&&typeof skillNow==='function'?skillNow():null;
    const err=new Map(skill?skill.rows.map(r=>[r.id,r.mae]):[]);
    const top=new Set(skill?skillBest(skill.rows).map(r=>r.id):[]);
    const item=m=>{
      const ok=available(m);
      const row=pickerNode('label','mp-item'+(ok?'':' is-off'));
      const box=document.createElement('input');box.type='checkbox';box.dataset.k='box:'+m.id;
      box.checked=set.has(m.id)&&ok;box.disabled=!ok;
      box.onchange=()=>{
        if(box.checked)set.add(m.id);
        else{if(cfg.minOne&&visible()<=1){box.checked=true;return;}set.delete(m.id);}
        change();buildModelPicker(key);
      };
      const dot=pickerNode('i','mp-dot');dot.style.background=m.color;
      const text=pickerNode('span');
      const small=pickerNode('small',null,ok?`${m.org} · ${fmtRes(m.res)} · ${m.days} ${t('unit.days')}`:t('ch.no_data'));
      if(ok&&err.has(m.id))small.append(' · ',pickerNode('span','mp-err',t('ch.skill_err',{n:fmtTemp(err.get(m.id),1)})));
      text.append(document.createTextNode(m.name));
      if(top.has(m.id)){
        const tag=pickerNode('span','mp-best',t('ch.skill_best'));
        tag.title=t('ch.skill_best_title',{station:skill.station.name});
        text.append(' ',tag);
      }
      text.append(small);
      row.append(box,dot,text);
      return row;
    };
    // The recommended models first, then the rest
    const rec=REC_IDS.map(id=>MODELS.find(m=>m.id===id)).filter(Boolean);
    [['ch.recommended',rec],['ch.others',MODELS.filter(m=>!rec.includes(m))]].forEach(([label,models],i)=>{
      const head=pickerNode('p','mp-group',t(label));head.id=panelId+'G'+i;
      const list=pickerNode('div','mp-list');
      list.setAttribute('role','group');list.setAttribute('aria-labelledby',head.id);
      models.forEach(m=>list.append(item(m)));
      panel.append(head,list);
    });
    const actions=pickerNode('div','mp-actions');
    const act=(label,fn)=>{const b=pickerNode('button',null,t(label));b.type='button';b.dataset.k='act:'+label;b.onclick=()=>{fn();change();buildModelPicker(key);};actions.append(b);};
    act('ch.all',()=>MODELS.filter(available).forEach(m=>set.add(m.id)));
    if(!cfg.minOne)act('ch.none',()=>set.clear());
    act('ch.default',()=>{set.clear();cfg.def.forEach(id=>set.add(id));});
    const close=pickerNode('button','mp-close',t('ch.close'));close.type='button';
    close.onclick=()=>{_pickerOpen[key]=false;buildModelPicker(key);wrap.querySelector('.mp-more')?.focus();};
    actions.append(close);
    panel.append(actions);
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close.click();}});
    wrap.append(panel);
  }

  if(focusKey){
    let el=wrap.querySelector(`[data-k="${focusKey}"]`);
    // A removed chip: move to the button that took its place, or to "+N"
    if(!el){
      const keys=[...wrap.querySelectorAll('[data-k]')].map(e=>e.dataset.k);
      const after=order.slice(order.indexOf(focusKey)+1).find(k=>keys.includes(k));
      el=after?wrap.querySelector(`[data-k="${after}"]`):more;
    }
    if(el&&!el.disabled)el.focus();else more.focus();
  }
}

// Kept for callers that rebuild the temperature picker (city change, language switch)
function buildToggles(){buildModelPicker('active');}

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
        <div style="font-size:11px;color:var(--t3)">${m.org} · ${t('models.resolution')}: ${fmtRes(m.res)} · ${t('models.forecast')}: ${m.days} ${t('unit.days')}</div>
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
    x:{ticks:{color:v('--chart-tick'),font:{size:11},maxTicksLimit:window.innerWidth<=600?4:8,maxRotation:0,autoSkip:true,
        // Keep the date and time together; Chart.js handles label spacing.
        callback:function(val){return this.getLabelForValue(val);}},
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

function rebuildTempChart(){
  const first=Object.values(S.data)[0];
  if(!first?.hourly?.time)return;
  buildModelPicker('active');
  const chartDefaults=CD();
  const spreadFill=cssVar('--acc-soft');
  const labels=first.hourly.time.map(fmtHour);
  const withData=MODELS.filter(m=>S.data[m.id]?.hourly?.temperature_2m);
  const lines=withData.filter(m=>S.active.has(m.id)).map(m=>({
    label:m.name,
    data:S.data[m.id].hourly.temperature_2m,
    borderColor:m.color,
    borderWidth:1.5,
    pointRadius:0,
    tension:0.3,
    fill:false,
    order:1,
  }));

  // Band from the coldest to the warmest model and the median line use every model with
  // data, whatever is picked. `order` sets the stacking: Chart.js draws higher numbers
  // first, so the band sits at the back and the median on top.
  const sp=withData.length>=2?tempSpread(withData):null;
  const band=S.showSpread&&sp?[
    {label:'_spreadMin',data:sp.min,borderWidth:0,pointRadius:0,tension:0.3,fill:false,_band:true,order:2},
    {label:t('chart.model_range'),data:sp.max,borderWidth:0,pointRadius:0,tension:0.3,fill:'-1',backgroundColor:spreadFill,_band:true,order:2},
  ]:[];
  const med=S.showMedian&&withData.length>=2?[{
    label:t('ch.median'),
    data:first.hourly.time.map((_,i)=>{const v=median(withData.map(m=>S.data[m.id].hourly.temperature_2m[i]));return v==null?null:round(v,1);}),
    borderColor:cssVar('--t'),borderWidth:2.5,pointRadius:0,tension:0.3,fill:false,order:0,
  }]:[];

  showChart('loadT','cT');
  if(S.charts.temp)S.charts.temp.destroy();
  S.charts.temp=new Chart($('cT'),{
    type:'line',data:{labels,datasets:[...band,...lines,...med]},
    options:{...chartDefaults,
      scales:{...chartDefaults.scales,
        y:{...chartDefaults.scales.y,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+'°'}}
      },
      plugins:{...chartDefaults.plugins,
        tooltip:{...chartDefaults.plugins.tooltip,
          filter:item=>!item.dataset._band,
          itemSort:(a,b)=>(b.parsed.y??-99)-(a.parsed.y??-99),
          callbacks:{
            title:items=>fmtTooltipTitle(first.hourly.time,items[0].dataIndex),
            label:c=>` ${c.dataset.label}: ${fmtNum(c.parsed.y,1)}°C`,
            footer:items=>{
              if(!sp)return '';
              const i=items[0].dataIndex;
              if(sp.min[i]==null)return '';
              return t('spread.tooltip_range',{min:fmtNum(sp.min[i],1),max:fmtNum(sp.max[i],1),d:fmtNum(sp.max[i]-sp.min[i],1)});
            }
          }
        }
      }
    }
  });

  // Same measure as the agreement dot on the Today view, so the two never disagree
  let v=null;
  try{
    const a=forecastSummary(S.data).agreement;
    if(a&&a.tempSpread!=null)v={level:a.tempLevel,text:t('ch.agree_'+a.tempLevel,{n:fmtNum(a.tempSpread/2,1)})};
  }catch{}
  const info=$('spreadInfo');
  if(info){info.hidden=!v;info.textContent=v?v.text:'';if(v)info.dataset.level=v.level;}
  if(typeof renderSkillLine==='function')renderSkillLine();
}

// ─── SINGLE-MODEL CHOICE ─────────────────────────────────────────────────────
// Card header for the cloud chart and the daily table: the recommended models as buttons,
// every other model with data here in a "Citi" list. has(src) says whether a model's data
// is enough for that view. A saved model without data here is kept but not shown
// (ECMWF IFS is). Returns the id of the model to draw.
function mkModelSelector(containerId,stateKey,title,onSelect,has){
  const hd=$(containerId);
  const usable=m=>!!m&&!!S.data[m.id]&&has(S.data[m.id]);
  const shown=[S[stateKey],...REC_IDS,...MODELS.map(m=>m.id)].map(id=>MODELS.find(m=>m.id===id)).find(usable);
  const focusKey=hd.contains(document.activeElement)?document.activeElement.dataset.k:null;
  const pick=id=>{S[stateKey]=id;try{localStorage.setItem(SINGLE_STORE[stateKey],id);}catch{}onSelect();};
  hd.replaceChildren(pickerNode('span','card-title',title));
  const wrap=pickerNode('div','ch-seg ch-models');
  wrap.setAttribute('role','group');
  wrap.setAttribute('aria-label',title);
  RECOMMENDED_MODELS.forEach(tm=>{
    // A recommended model without data here is left out, like the other models
    if(!usable(MODELS.find(m=>m.id===tm.id)))return;
    const b=pickerNode('button',null,tm.name);b.type='button';b.dataset.k='seg:'+tm.id;
    b.setAttribute('aria-pressed',String(shown?.id===tm.id));
    b.onclick=()=>pick(tm.id);
    wrap.append(b);
  });
  // A native select under a label-sized face: keyboard, touch, Escape and outside
  // click work as everywhere else on the device
  const others=MODELS.filter(m=>!REC_IDS.includes(m.id)&&usable(m));
  if(others.length){
    const on=others.includes(shown);
    const box=pickerNode('span','ch-other'+(on?' is-on':''));
    const face=pickerNode('span','ch-other-face',on?shown.name:t('ch.other'));face.setAttribute('aria-hidden','true');
    const sel=document.createElement('select');sel.dataset.k='other';
    sel.setAttribute('aria-label',t('ch.others'));
    const none=new Option(t('ch.other'),'',false,!on);none.disabled=true;none.hidden=true;
    sel.append(none,...others.map(m=>new Option(m.name,m.id,false,on&&m===shown)));
    sel.onchange=()=>{if(sel.value)pick(sel.value);};
    box.append(face,sel);
    wrap.append(box);
  }
  hd.append(wrap);
  if(focusKey)hd.querySelector(`[data-k="${focusKey}"]`)?.focus();
  return shown?.id||null;
}

// ─── PRECIPITATION CHART ─────────────────────────────────────────────────────
// Single-model mode renders a bar chart; multi-model renders overlaid line charts
// Card header with a title and optional nodes on the right
function chartHeader(containerId,title,...right){
  const hd=$(containerId);
  if(!hd)return;
  hd.replaceChildren(pickerNode('span','card-title',title),...right);
}

// Formats a full readable timestamp for chart tooltips
function fmtTooltipTitle(timeArr,idx){return chartTimeTitle(timeArr[idx],LOCALE);}

function buildPrecipCharts(){
  chartHeader('precipCardHd',t('chart.precip_mm'));
  buildModelPicker('precipModels');

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
                y:{...chartDefaults.scales.y,min:0,ticks:{...chartDefaults.scales.y.ticks,callback:v=>v+' mm'}}
      },
      plugins:{...chartDefaults.plugins,tooltip:{...chartDefaults.plugins.tooltip,callbacks:{
        title:items=>fmtTooltipTitle(base.hourly.time,items[0].dataIndex),
        label:c=>` ${c.dataset.label}: ${fmtNum(c.parsed.y,1)} mm`
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
  // Unit switch on the right of the header
  const units=pickerNode('div','ch-seg');
  units.setAttribute('role','group');units.setAttribute('aria-label',t('ch.wind_unit'));
  ['m/s','km/h'].forEach(u=>{
    const b=pickerNode('button',null,u);b.type='button';
    b.setAttribute('aria-pressed',String(S.windUnit===u));
    b.onclick=()=>setWindUnit(u);
    units.appendChild(b);
  });
  chartHeader('windCardHd',`${t('chart.wind_speed')} (${S.windUnit})`,units);
  buildModelPicker('windModels');

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
        label:c=>` ${c.dataset.label}: ${fmtNum(c.parsed.y,S.windUnit==='m/s'?1:0)} ${S.windUnit}`
      }}}
    }
  });
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
  const id=mkModelSelector('cloudCardHd','cloudModel',t('chart.cloud_cover'),buildCloudChart,d=>!!d.hourly?.cloud_cover?.some(v=>v!=null));
  const src=S.data[id];
  if(!src?.hourly?.time)return;
  const cd=CD();
  const cap=src.hourly.time.length;
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
  const startIdx=0;
  const times=src.hourly.time.slice(startIdx,src.hourly.time.length);
  const vals=src.hourly.uv_index.slice(startIdx,src.hourly.time.length);
  const labels=times.map(fmtHour);

  const cd=CD();
  showChart('loadUV','cUV');
  if(S.charts.uv)S.charts.uv.destroy();
  S.charts.uv=new Chart($('cUV'),{
    type:'bar',
    data:{labels,datasets:[{
      data:vals,
      backgroundColor:vals.map(v=>uvColor(v??0)),
      borderWidth:0,
      borderRadius:3,
      barPercentage:0.85,
      categoryPercentage:0.85,
    }]},
    options:{...cd,
      scales:{...cd.scales,
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
  const id=mkModelSelector('tableCardHd','tableModel',t('chart.forecast_daily'),buildTable,d=>!!d.daily?.temperature_2m_max?.some(v=>v!=null));
  const src=S.data[id];
  if(!src?.daily?.time)return;
  const {time,temperature_2m_max:tmax,temperature_2m_min:tmin,precipitation_sum:ps,
         precipitation_probability_max:ppm,wind_speed_10m_max:wmax,
         relative_humidity_2m_mean:rh,weather_code:wc,cloud_cover_mean:cc}=src.daily;
  const tbody=$('tBody');
  tbody.replaceChildren();
  const pMax=Math.max(10,...(ps||[]).filter(v=>v!=null));
  const td=(cls,text)=>{const c=document.createElement('td');if(cls)c.className=cls;if(text!=null)c.textContent=text;return c;};
  const pill=v=>{
    const c=td('ft-t');
    if(v==null){c.textContent='-';return c;}
    const sp=document.createElement('span');sp.className='ft-pill';sp.textContent=fmtTemp(v);sp.style.background=tempColor(v);
    c.append(sp);return c;
  };
  // Short-range models end early: no rows of dashes after their last day
  let last=time.length-1;
  while(last>0&&tmax?.[last]==null)last--;
  time.slice(0,last+1).forEach((iso,i)=>{
    const tr=document.createElement('tr');
    const day=td('ft-day');day.innerHTML=fmtDate(iso);
    const wx=td('wcell wi wi-'+(wKey(wc?.[i])||'none'));wx.innerHTML=wIcon(wc?.[i]);wx.title=wText(wc?.[i]);
    const label=document.createElement('span');label.className='sr-only';label.textContent=wText(wc?.[i]);wx.append(label);
    const pr=td('ft-num ft-precip');
    if(ps?.[i]!=null){
      const bar=document.createElement('i');bar.style.width=Math.max(ps[i]>0?3:0,Math.round(ps[i]/pMax*46))+'px';
      pr.append(bar,document.createTextNode((ps[i]>0?fmtNum(ps[i],1):'0')+' mm'));
    }else pr.textContent='-';
    tr.append(day,wx,pill(tmin?.[i]),pill(tmax?.[i]),pr,
      td('ft-num',ppm?.[i]!=null?r0(ppm[i])+'%':'-'),
      td('ft-num',wmax?.[i]!=null?fmtNum(windConv(wmax[i]),S.windUnit==='m/s'?1:0)+' '+S.windUnit:'-'),
      td('ft-num',cc?.[i]!=null?r0(cc[i])+'%':'-'),
      td('ft-num',rh?.[i]!=null?r0(rh[i])+'%':'-'));
    tbody.appendChild(tr);
  });
  $('loadTbl').style.display='none';
  $('forecastTable').style.display='table';
}
