const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../js/forecast-sync.js');

// A place in Riga, local midnight 2026-10-09 (UTC+3) and a moment later that day
const RIGA={lat:56.95,lon:24.1},OFF=10800,DAY='2026-10-09';
const NOW=Date.parse('2026-10-09T09:00:00Z');
const IDS=['ecmwf_ifs025','icon_eu','knmi_harmonie_arome_europe'];
const MIN=60000;

function cacheWith(at,{nowAt=at,absent=[]}={}){
  const models={};
  for(const id of IDS)models[id]=absent.includes(id)?{at,absent:true}:{at,hourly:{temperature_2m:[1]},daily:{}};
  return {day:DAY,off:OFF,time:{hourly:[DAY+'T00:00'],daily:[DAY]},now:{at:nowAt,day:DAY,current:{}},models};
}
const runs=(models,checkedAt=NOW-5*MIN)=>({models,checkedAt});
const plan=(cache,opt={})=>F.forecastPlan(cache,{nowMs:NOW,ids:IDS,...RIGA,...opt});

test('nothing saved: every model and the now values',()=>{
  assert.deepEqual(plan(null),{models:IDS,now:true});
  assert.deepEqual(plan(F.emptyForecast()),{models:IDS,now:true});
});

test('saved this morning and nothing newer: no request at all',()=>{
  const c=cacheWith(NOW-20*MIN,{nowAt:NOW-5*MIN});
  const r=runs({ecmwf_ifs025:(NOW-3*3600e3)/1000,icon_eu:(NOW-2*3600e3)/1000,knmi_harmonie_arome_europe:(NOW-60*MIN)/1000});
  assert.deepEqual(plan(c,{runs:r}),{models:[],now:false});
});

test('a newer run is asked for once the servers had 10 minutes, and only that model',()=>{
  const c=cacheWith(NOW-20*MIN,{nowAt:NOW-5*MIN});
  const base={ecmwf_ifs025:(NOW-3*3600e3)/1000,knmi_harmonie_arome_europe:(NOW-60*MIN)/1000};
  // Available 6 min ago: not yet
  assert.deepEqual(plan(c,{runs:runs({...base,icon_eu:(NOW-6*MIN)/1000})}).models,[]);
  // Available 12 min ago: now
  assert.deepEqual(plan(c,{runs:runs({...base,icon_eu:(NOW-12*MIN)/1000})}).models,['icon_eu']);
  // Fetched 3 min after it became available: asked once more after the settling time
  const early=cacheWith(NOW-9*MIN,{nowAt:NOW-5*MIN});
  assert.deepEqual(plan(early,{runs:runs({...base,icon_eu:(NOW-12*MIN)/1000})}).models,['icon_eu']);
});

test('without trusted run times a model is asked for every 30 min, as before',()=>{
  const c=cacheWith(NOW-31*MIN,{nowAt:NOW-5*MIN});
  const fresh=runs({ecmwf_ifs025:(NOW-3*3600e3)/1000,icon_eu:(NOW-3*3600e3)/1000,knmi_harmonie_arome_europe:(NOW-3*3600e3)/1000});
  assert.deepEqual(plan(c,{runs:fresh}).models,[]);
  // Run time unknown for one model
  assert.deepEqual(plan(c,{runs:runs({...fresh.models,icon_eu:null})}).models,['icon_eu']);
  // Run times too old (worker cron stuck), or a place outside Europe
  assert.deepEqual(plan(c,{runs:runs(fresh.models,NOW-50*MIN)}).models,IDS);
  assert.deepEqual(plan(c,{runs:fresh,lat:40.7,lon:-74}).models,IDS);
  assert.deepEqual(plan(cacheWith(NOW-20*MIN,{nowAt:NOW-5*MIN})).models,[]);
});

test('now values every 15 min; a new local day asks for everything',()=>{
  assert.equal(plan(cacheWith(NOW-5*MIN,{nowAt:NOW-16*MIN})).now,true);
  assert.equal(plan(cacheWith(NOW-5*MIN,{nowAt:NOW-14*MIN})).now,false);
  const late=Date.parse('2026-10-09T21:30:00Z'); // 00:30 local next day
  assert.deepEqual(F.forecastPlan(cacheWith(late-10*MIN),{nowMs:late,ids:IDS,...RIGA}),{models:IDS,now:true});
});

test('a model outside its area is rechecked only together with others',()=>{
  const c=cacheWith(NOW-20*MIN,{nowAt:NOW-5*MIN,absent:['knmi_harmonie_arome_europe']});
  c.models.knmi_harmonie_arome_europe.at=NOW-4*3600e3;
  assert.deepEqual(plan(c).models,[]);
  c.models.icon_eu.at=NOW-40*MIN;
  assert.deepEqual(plan(c).models,['icon_eu','knmi_harmonie_arome_europe']);
});

test('merging answers: several models suffixed, one model plain, missing ones marked',()=>{
  const time={hourly:[DAY+'T00:00',DAY+'T01:00'],daily:[DAY]};
  const multi={utc_offset_seconds:OFF,hourly:{time:time.hourly,temperature_2m_ecmwf_ifs025:[5,6],precipitation_ecmwf_ifs025:[0,0.2]},daily:{time:time.daily,temperature_2m_max_ecmwf_ifs025:[9]}};
  let c=F.mergeModels(null,multi,['ecmwf_ifs025','knmi_harmonie_arome_europe'],NOW);
  assert.equal(c.day,DAY);
  assert.deepEqual(c.models.ecmwf_ifs025.hourly,{temperature_2m:[5,6],precipitation:[0,0.2]});
  assert.deepEqual(c.models.ecmwf_ifs025.daily,{temperature_2m_max:[9]});
  assert.equal(c.models.knmi_harmonie_arome_europe.absent,true);
  const single={utc_offset_seconds:OFF,hourly:{time:time.hourly,temperature_2m:[7,8]},daily:{time:time.daily,temperature_2m_max:[10]}};
  c=F.mergeModels(c,single,['icon_eu'],NOW+MIN);
  assert.deepEqual(c.models.icon_eu.hourly,{temperature_2m:[7,8]});
  assert.equal(c.models.ecmwf_ifs025.at,NOW,'other models stay');
  // Same model, only nulls (outside its area): absent
  c=F.mergeModels(c,{...single,hourly:{time:time.hourly,temperature_2m:[null,null]}},['icon_eu'],NOW+2*MIN);
  assert.equal(c.models.icon_eu.absent,true);
  // Next day: the saved models of the previous day go
  const next={utc_offset_seconds:OFF,hourly:{time:['2026-10-10T00:00'],temperature_2m:[3]},daily:{time:['2026-10-10'],temperature_2m_max:[4]}};
  c=F.mergeModels(c,next,['icon_eu'],NOW+3*MIN);
  assert.deepEqual(Object.keys(c.models),['icon_eu']);
  assert.throws(()=>F.mergeModels(c,{hourly:{}},['icon_eu'],NOW));
});

test('S.data from the saved copy: same shape as before, now values on the first model',()=>{
  let c=F.mergeModels(null,{utc_offset_seconds:OFF,hourly:{time:[DAY+'T00:00'],temperature_2m_ecmwf_ifs025:[5],temperature_2m_icon_eu:[6]},
    daily:{time:[DAY],temperature_2m_max_ecmwf_ifs025:[9],temperature_2m_max_icon_eu:[8]}},['ecmwf_ifs025','icon_eu'],NOW);
  c=F.mergeNow(c,{utc_offset_seconds:OFF,current:{temperature_2m:5.5},daily:{time:[DAY],sunrise:[DAY+'T07:31'],sunset:[DAY+'T18:42']}},NOW+MIN);
  const d=F.forecastData(c,IDS);
  assert.deepEqual(Object.keys(d),['ecmwf_ifs025','icon_eu']);
  assert.deepEqual(d.ecmwf_ifs025.hourly,{time:[DAY+'T00:00'],temperature_2m:[5]});
  assert.equal(d.ecmwf_ifs025.current.temperature_2m,5.5);
  assert.deepEqual(d.ecmwf_ifs025.daily.sunrise,[DAY+'T07:31']);
  assert.equal(d.icon_eu.current,undefined);
  assert.equal(d.icon_eu.utcOffset,OFF);
  assert.equal(F.forecastTs(c),NOW+MIN);
  assert.equal(F.forecastTs(null),0);
  // Now values of another day are not attached
  c.now.day='2026-10-08';
  assert.equal(F.forecastData(c,IDS).ecmwf_ifs025.current,undefined);
});

test('daily gust maximum from the hourly gusts, per local day',()=>{
  const hourly=['2026-10-09T00:00','2026-10-09T13:00','2026-10-09T23:00','2026-10-10T00:00','2026-10-10T01:00'];
  assert.deepEqual(F.fsDailyMax(hourly,[5,12.4,9,null,7.5],['2026-10-09','2026-10-10','2026-10-11']),[12.4,7.5,null]);
  const c=F.mergeModels(null,{utc_offset_seconds:OFF,hourly:{time:hourly,temperature_2m:[1,2,3,4,5],wind_gusts_10m:[5,12.4,9,null,7.5]},daily:{time:['2026-10-09','2026-10-10']}},['icon_eu'],NOW);
  assert.deepEqual(F.forecastData(c,['icon_eu']).icon_eu.daily.wind_gusts_10m_max,[12.4,7.5]);
});

test('the run a model came from: known once that run had settled when it was fetched',()=>{
  const avail=(NOW-60*MIN)/1000,init=(NOW-7*3600e3)/1000;
  const runs={models:{icon_eu:avail},inits:{icon_eu:init},checkedAt:NOW-5*MIN};
  assert.equal(F.fsRunOf(runs,'icon_eu',NOW),init);
  // Fetched 5 min after the run became available: may still be the previous run
  assert.equal(F.fsRunOf(runs,'icon_eu',avail*1000+5*MIN),null);
  assert.equal(F.fsRunOf({...runs,checkedAt:NOW-50*MIN},'icon_eu',NOW),null);
  assert.equal(F.fsRunOf(null,'icon_eu',NOW),null);
  assert.equal(F.fsRunOf(runs,'gem_seamless',NOW),null);
  const c=F.mergeModels(null,{utc_offset_seconds:OFF,hourly:{time:[DAY+'T00:00'],temperature_2m:[1]},daily:{time:[DAY]}},['icon_eu'],NOW,runs);
  assert.equal(F.forecastData(c,['icon_eu']).icon_eu.run,init);
});

test('the run can be worked out later from the fetch time, until a newer run comes out',()=>{
  const at=NOW-30*MIN,init=(NOW-9*3600e3)/1000;
  const runs={models:{icon_eu:(NOW-2*3600e3)/1000},inits:{icon_eu:init},checkedAt:NOW-3*MIN};
  assert.equal(F.fsRunOf(runs,'icon_eu',at,NOW),init);
  // A newer run already out: the saved data may be from the one before
  assert.equal(F.fsRunOf({...runs,models:{icon_eu:(NOW-20*MIN)/1000}},'icon_eu',at,NOW),null);
});
