const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../js/forecast-summary.js');

// Synthetic multi-model data in the S.data shape. Hour i of day d is index d*24+i,
// local wall clock starting at 2026-10-07T00:00, Riga summer offset.
const OFF=10800, DAYS=4;
const TIME=Array.from({length:DAYS*24},(_,i)=>new Date(Date.UTC(2026,9,7)+i*3600e3).toISOString().slice(0,16));
const DATES=Array.from({length:DAYS},(_,d)=>TIME[d*24].slice(0,10));
// Local 10:20 on 7 October
const NOW=Date.parse('2026-10-07T10:20:00Z')-OFF*1000;
const H=key=>TIME.indexOf(key);

function model({temp=()=>10,precip=()=>0,cloud=()=>40,prob=()=>10,hours=TIME.length}={},m=0){
  const cut=(f)=>TIME.map((_,i)=>i<hours?f(i,m):null);
  const hourly={time:TIME,temperature_2m:cut(temp),precipitation:cut(precip),cloud_cover:cut(cloud),precipitation_probability:cut(prob)};
  const day=(arr,fn)=>DATES.map((_,d)=>{const v=arr.slice(d*24,d*24+24).filter(x=>x!=null);return v.length?fn(v):null;});
  const daily={time:DATES,
    temperature_2m_max:day(hourly.temperature_2m,v=>Math.max(...v)),
    temperature_2m_min:day(hourly.temperature_2m,v=>Math.min(...v)),
    precipitation_sum:day(hourly.precipitation,v=>Math.round(v.reduce((a,b)=>a+b,0)*10)/10),
    precipitation_probability_max:day(hourly.precipitation_probability,v=>Math.max(...v)),
    cloud_cover_mean:day(hourly.cloud_cover,v=>v.reduce((a,b)=>a+b,0)/v.length),
    sunrise:DATES.map(d=>d+'T07:30'),sunset:DATES.map(d=>d+'T18:40')};
  return {hourly,daily,utcOffset:OFF};
}
function data(n,spec){
  const out={};
  for(let m=0;m<n;m++)out['m'+m]=model(typeof spec==='function'?spec(m):spec,m);
  return out;
}
// Simple day curve: 4° at 05:00, 12° at 15:00
const curve=(i,shift=0)=>8+4*Math.sin(((i%24)-9)/24*2*Math.PI)+shift;

test('dry period gives no precipitation windows and a high agreement',()=>{
  const s=F.forecastSummary(data(8,{temp:i=>curve(i)}),{nowMs:NOW});
  assert.equal(s.ok,true);
  assert.equal(s.models,8);
  assert.equal(s.now.raining,false);
  assert.equal(s.windows.length,0);
  assert.equal(s.first,null);
  assert.equal(s.agreement.level,'high');
  assert.equal(s.agreement.rainModels,0);
  assert.equal(s.phase,'day');
  assert.ok(Math.abs(s.today.max-12)<0.01);
  assert.equal(s.trend,'same');
});

test('rain later today: window, amount, likely wording and day part',()=>{
  // Precipitation stamped 15..17 falls 14:00-17:00
  const wet=i=>i>=H('2026-10-07T15:00')&&i<=H('2026-10-07T17:00')?1.2:0;
  const s=F.forecastSummary(data(10,{temp:i=>curve(i),precip:wet,cloud:i=>wet(i)?95:20}),{nowMs:NOW});
  assert.equal(s.now.raining,false);
  assert.ok(s.first);
  assert.equal(s.first.from,'2026-10-07T14:00');
  assert.equal(s.first.to,'2026-10-07T17:00');
  assert.equal(s.first.day,'today');
  assert.equal(s.first.likely,true);
  assert.equal(s.first.snow,false);
  assert.ok(Math.abs(s.first.mm-3.6)<0.01);
  assert.equal(s.clears,true);
});

test('raining now and stopping: stop time and certainty',()=>{
  const wet=i=>i<=H('2026-10-07T13:00')?0.8:0;
  const s=F.forecastSummary(data(9,{temp:()=>9,precip:wet}),{nowMs:NOW,current:{precipitation:0.6}});
  assert.equal(s.now.raining,true);
  assert.equal(s.now.continues,false);
  assert.equal(s.now.stop.time,'2026-10-07T13:00');
  assert.equal(s.now.stop.day,'today');
  assert.equal(s.now.stop.sure,true);
  assert.equal(s.first,null);
});

test('raining now without an end inside the horizon continues',()=>{
  const s=F.forecastSummary(data(6,{temp:()=>9,precip:()=>1}),{nowMs:NOW});
  assert.equal(s.now.raining,true);
  assert.equal(s.now.continues,true);
  assert.equal(s.now.stop,null);
});

test('rain only tomorrow is placed on tomorrow, overnight rain on the night',()=>{
  const day=F.forecastSummary(data(7,{temp:i=>curve(i),precip:i=>i>=H('2026-10-08T10:00')&&i<=H('2026-10-08T13:00')?0.9:0}),{nowMs:NOW});
  assert.equal(day.now.raining,false);
  assert.equal(day.first.day,'tomorrow');
  assert.equal(day.first.from,'2026-10-08T09:00');
  const night=F.forecastSummary(data(7,{temp:i=>curve(i),precip:i=>i>=H('2026-10-08T03:00')&&i<=H('2026-10-08T04:00')?0.9:0}),{nowMs:NOW});
  assert.equal(night.first.day,'night');
});

test('snow when the median temperature is at or below 0.5 °C',()=>{
  const s=F.forecastSummary(data(8,{temp:()=>-1.5,precip:i=>i>=H('2026-10-07T16:00')&&i<=H('2026-10-07T19:00')?0.7:0}),{nowMs:NOW});
  assert.equal(s.first.snow,true);
  const rows=F.dailyConsensus(data(8,{temp:()=>-1.5,precip:i=>i<30?0.7:0}),{nowMs:NOW});
  assert.equal(rows[0].snow,true);
  assert.equal(rows[0].sky,'snow');
});

test('disagreement: half the models show rain, temperatures spread widely',()=>{
  const d=data(10,m=>({temp:i=>curve(i,(m-4.5)*1.4),precip:i=>m<5&&i>=H('2026-10-07T15:00')&&i<=H('2026-10-07T18:00')?1:0}));
  const s=F.forecastSummary(d,{nowMs:NOW});
  assert.ok(s.first);
  assert.equal(s.first.likely,false);
  assert.equal(s.agreement.rainModels,5);
  assert.equal(s.agreement.rainOf,10);
  assert.equal(s.agreement.rainLevel,'low');
  assert.equal(s.agreement.tempLevel,'low');
  assert.equal(s.agreement.level,'low');
});

test('missing models, nulls and short horizons are tolerated',()=>{
  const d=data(4,m=>({temp:i=>m===3&&i%5===0?null:curve(i),hours:m===0?20:TIME.length}));
  d.empty={hourly:{time:TIME},daily:{time:DATES},utcOffset:OFF};
  d.broken=null;
  const s=F.forecastSummary(d,{nowMs:NOW});
  assert.equal(s.ok,true);
  assert.equal(s.now.raining,false);
  const rows=F.dailyConsensus(d,{nowMs:NOW});
  // day 0 has 3 full models plus the short one; day 1+ only models with data
  assert.ok(rows.length>=3);
  assert.ok(rows.every(r=>r.n>=3));
  // A single model gives no agreement verdict and fewer than three models no daily rows
  const one=F.forecastSummary(data(1,{temp:i=>curve(i)}),{nowMs:NOW});
  assert.equal(one.ok,true);
  assert.equal(one.agreement,null);
  assert.deepEqual(F.dailyConsensus(data(2,{}),{nowMs:NOW}),[]);
  // No data at all
  assert.equal(F.forecastSummary({},{nowMs:NOW}).ok,false);
  assert.equal(F.forecastSummary({a:{hourly:{time:[]}}},{nowMs:NOW}).ok,false);
  // Data entirely in the past
  assert.equal(F.forecastSummary(data(3,{}),{nowMs:NOW+10*864e5}).ok,false);
});

test('tomorrow warmer or cooler by at least 2 degrees',()=>{
  const warm=F.forecastSummary(data(5,{temp:i=>curve(i,i>=24?3:0)}),{nowMs:NOW});
  assert.equal(warm.trend,'warmer');
  const cool=F.forecastSummary(data(5,{temp:i=>curve(i,i>=24?-2.5:0)}),{nowMs:NOW});
  assert.equal(cool.trend,'cooler');
  // After 15:00 the summary talks about the night instead of the day
  const evening=F.forecastSummary(data(5,{temp:i=>curve(i)}),{nowMs:NOW+8*3600e3});
  assert.equal(evening.phase,'night');
  assert.ok(evening.nightMin<5);
});

test('hourly consensus medians and slot alignment',()=>{
  const d=data(3,m=>({temp:()=>[1,5,9][m],precip:i=>i===H('2026-10-07T12:00')?[0,0.4,2][m]:0,prob:()=>[10,30,null][m]}));
  const hc=F.hourlyConsensus(d,{nowMs:NOW,hours:4});
  assert.equal(hc.rows[0].time,'2026-10-07T10:00');
  assert.equal(hc.rows[0].t,5);
  assert.equal(hc.rows[0].prob,20);
  const slots=F.hourSlots(hc.rows);
  // precipitation stamped 12:00 belongs to the slot that starts at 11:00
  assert.equal(slots[1].time,'2026-10-07T11:00');
  assert.equal(slots[1].p,0.4);
  assert.ok(Math.abs(slots[1].wet-2/3)<1e-9);
});

test('sky keys for hours and days',()=>{
  assert.equal(F.skyKey({cloud:10}),'clear');
  assert.equal(F.skyKey({cloud:10,night:true}),'night');
  assert.equal(F.skyKey({cloud:50}),'partly');
  assert.equal(F.skyKey({cloud:50,night:true}),'night_partly');
  assert.equal(F.skyKey({cloud:95}),'cloud');
  assert.equal(F.skyKey({cloud:95,wet:0.7,p:0.3,t:5}),'drizzle');
  assert.equal(F.skyKey({cloud:95,wet:0.9,p:1.4,t:5}),'rain');
  assert.equal(F.skyKey({cloud:95,wet:0.9,p:1.4,t:0}),'snow');
  assert.equal(F.skyKey({}),null);
  assert.equal(F.skyKey({cloud:60,p:3,daily:true}),'rain');
  assert.equal(F.skyKey({cloud:60,p:0.4,daily:true}),'drizzle');
  const suns=F.sunTimes(data(1,{}));
  assert.equal(F.isNightAt('2026-10-07T06:00',suns),true);
  assert.equal(F.isNightAt('2026-10-07T07:00',suns),false);
  assert.equal(F.isNightAt('2026-10-07T18:00',suns),false);
  assert.equal(F.isNightAt('2026-10-07T19:00',suns),true);
});

test('daily consensus: medians, model spread and the ten day limit',()=>{
  const d=data(5,m=>({temp:i=>curve(i,m-2)}));
  const rows=F.dailyConsensus(d,{nowMs:NOW});
  assert.equal(rows[0].date,'2026-10-07');
  assert.equal(rows[0].offset,0);
  assert.ok(rows[0].lo<rows[0].tmin&&rows[0].tmax<rows[0].hi);
  assert.ok(Math.abs(rows[0].hi-rows[0].lo-12)<0.01);
  assert.equal(F.dailyConsensus(d,{nowMs:NOW,maxDays:2}).length,2);
  // Days before the local today are skipped
  assert.equal(F.dailyConsensus(d,{nowMs:NOW+864e5})[0].date,'2026-10-08');
});

test('station time parsing and nearest fresh reading',()=>{
  // Riga wall clock 12:00 in October is 09:00 UTC
  assert.equal(F.stationTimeMs('2026-10-07T12:00:00'),Date.parse('2026-10-07T09:00:00Z'));
  assert.equal(F.stationTimeMs('2026-01-07T12:00:00'),Date.parse('2026-01-07T10:00:00Z'));
  assert.equal(F.stationTimeMs('2026-10-07T09:00:00Z'),Date.parse('2026-10-07T09:00:00Z'));
  assert.ok(Number.isNaN(F.stationTimeMs('')));
  const now=Date.parse('2026-10-07T09:20:00Z');
  const st=[
    {id:'a',name:'Far',lat:57.4,lon:21.6,history:[{time:'2026-10-07T12:00:00',airTemp:7}]},
    {id:'b',name:'Rīga',lat:56.95,lon:24.12,history:[{time:'2026-10-07T11:00:00',airTemp:8.1},{time:'2026-10-07T12:00:00',airTemp:8.6},{time:'2026-10-07T12:10:00',precipHour:0}]},
    {id:'c',name:'Precip only',lat:56.946,lon:24.106,history:[{time:'2026-10-07T12:00:00',precipHour:1}]},
  ];
  const r=F.nearestStationReading(st,56.946,24.106,{nowMs:now});
  assert.equal(r.name,'Rīga');
  assert.equal(r.temp,8.6);
  assert.equal(r.ageMin,20);
  assert.ok(r.dist<2);
  // Too old, too far, nothing usable
  assert.equal(F.nearestStationReading(st,56.946,24.106,{nowMs:now+3*3600e3}),null);
  assert.equal(F.nearestStationReading(st,55.0,28.0,{nowMs:now}),null);
  assert.equal(F.nearestStationReading([],56.9,24.1,{nowMs:now}),null);
  assert.equal(F.nearestStationReading(null,56.9,24.1,{nowMs:now}),null);
});

test('a stale nearest station does not hide a fresh one further away',()=>{
  const now=Date.parse('2026-10-07T09:30:00Z');
  const st=[
    {id:'near',name:'Tuvā',lat:56.95,lon:24.11,history:[{time:'2026-10-07T09:00:00',airTemp:5}]},
    {id:'fresh',name:'Svaigā',lat:57.05,lon:24.11,history:[{time:'2026-10-07T12:10:00',airTemp:7.5}]},
  ];
  const r=F.nearestStationReading(st,56.946,24.106,{nowMs:now});
  assert.equal(r.id,'fresh');
  assert.equal(r.temp,7.5);
  assert.ok(r.ageMin>=19&&r.ageMin<=21);
});

test('station hourly readings for the temperature chart: nearest fresh station, local hour keys',()=>{
  const now=Date.parse('2026-10-09T09:20:00Z'); // 12:20 in Riga
  const hist=(last)=>Array.from({length:4},(_,i)=>({time:`2026-10-09T${String(last-3+i).padStart(2,'0')}:00:00`,airTemp:5+i}));
  const stations=[
    {id:'far',name:'Far',lat:57.5,lon:24.1,history:hist(12)},
    {id:'old',name:'Old',lat:56.95,lon:24.11,history:hist(5)},
    {id:'near',name:'Near',lat:56.96,lon:24.12,history:[...hist(12),{time:'2026-10-09T12:30:00',airTemp:null}]},
  ];
  const r=F.stationHourly(stations,56.95,24.1,{nowMs:now});
  assert.equal(r.id,'near');
  assert.equal(r.values.get('2026-10-09T12:00'),8);
  assert.equal(r.values.get('2026-10-09T09:00'),5);
  assert.equal(r.last,'2026-10-09T12:00:00');
  assert.equal(F.stationHourly([],56.95,24.1,{nowMs:now}),null);
});
