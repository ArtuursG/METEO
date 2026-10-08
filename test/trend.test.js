const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {tempTrend,prevReading}=require('../js/map-utils.js');

const MIN=60000;
const T0=Date.UTC(2026,9,8,9,0);   // 12:00 in Riga (summer time)

test('trend: change against a reading an hour older',()=>{
  assert.deepEqual(tempTrend(7.3,T0,6.5,T0-60*MIN),{delta:0.8,minutes:60});
  assert.deepEqual(tempTrend(5.1,T0,6.4,T0-45*MIN),{delta:-1.3,minutes:45});
});
test('trend: delta is rounded to 0.1 without float noise or minus zero',()=>{
  assert.equal(tempTrend(7.3,T0,7.0,T0-60*MIN).delta,0.3);
  assert.ok(Object.is(tempTrend(-2.04,T0,-2,T0-60*MIN).delta,0));
});
test('trend: only 40-90 minutes back counts',()=>{
  assert.equal(tempTrend(7,T0,6,T0-40*MIN).minutes,40);
  assert.equal(tempTrend(7,T0,6,T0-90*MIN).minutes,90);
  assert.equal(tempTrend(7,T0,6,T0-39*MIN),null);
  assert.equal(tempTrend(7,T0,6,T0-91*MIN),null);
  assert.equal(tempTrend(7,T0,6,T0+60*MIN),null,'previous reading after the current one');
});
test('trend: missing values or times give null',()=>{
  assert.equal(tempTrend(null,T0,6,T0-60*MIN),null);
  assert.equal(tempTrend(7,T0,undefined,T0-60*MIN),null);
  assert.equal(tempTrend(7,T0,'',T0-60*MIN),null);
  assert.equal(tempTrend(7,T0,6,null),null);
  assert.equal(tempTrend(7,NaN,6,T0),null);
  assert.equal(tempTrend('x',T0,6,T0-60*MIN),null);
});
test('trend: station time strings work, with or without an offset',()=>{
  // LVC sends an offset, LVĢMC Riga wall clock
  assert.deepEqual(tempTrend('7.5','2026-10-08T12:00:00+03:00',7,'2026-10-08T08:00:00Z'),{delta:0.5,minutes:60});
  assert.deepEqual(tempTrend(7.5,'2026-10-08T12:00:00',8,'2026-10-08T11:00:00'),{delta:-0.5,minutes:60});
});

const at=(min,airTemp,extra={})=>({time:new Date(T0-min*MIN).toISOString(),airTemp,...extra});

test('previous reading: hourly history picks the hour before',()=>{
  const hist=[at(180,4),at(120,5),at(60,6),at(0,7)];
  assert.equal(prevReading(hist,T0),hist[2]);
});
test('previous reading: 15-minute steps pick exactly 60 minutes back',()=>{
  const hist=Array.from({length:12},(_,i)=>at(165-15*i,5+i/10));
  assert.equal(prevReading(hist,T0).time,new Date(T0-60*MIN).toISOString());
});
test('previous reading: nearest to 60 minutes, newer one on a tie',()=>{
  assert.equal(prevReading([at(85,1),at(50,2),at(0,3)],T0).airTemp,2);
  assert.equal(prevReading([at(75,1),at(45,2),at(0,3)],T0).airTemp,2);
  assert.equal(prevReading([at(45,2),at(75,1)],T0).airTemp,2,'order does not matter');
});
test('previous reading: nothing within 40-90 minutes gives null',()=>{
  assert.equal(prevReading([at(30,1),at(100,2),at(0,3)],T0),null);
  assert.equal(prevReading([],T0),null);
  assert.equal(prevReading(null,T0),null);
  assert.equal(prevReading([at(60,1)],NaN),null);
});
test('previous reading: readings without the value are skipped',()=>{
  const hist=[at(60,null),at(55,6.2),at(0,7)];
  assert.equal(prevReading(hist,T0).airTemp,6.2);
  assert.equal(prevReading([at(60,null,{surfaceTemp:3})],T0,'surfaceTemp').surfaceTemp,3);
  assert.equal(prevReading([null,at(60,5)],T0).airTemp,5);
});
test('previous reading: LVĢMC wall clock times and a time string as the latest',()=>{
  const hist=[{time:'2026-10-08T10:00:00',airTemp:5},{time:'2026-10-08T11:00:00',airTemp:6},{time:'2026-10-08T12:00:00',airTemp:7}];
  const prev=prevReading(hist,'2026-10-08T12:00:00');
  assert.equal(prev.airTemp,6);
  assert.deepEqual(tempTrend(7,'2026-10-08T12:00:00',prev.airTemp,prev.time),{delta:1,minutes:60});
});

// ─── LVC worker: list response with the reading about an hour earlier ──────────
// The worker is an ES module without imports; load it through a data: URL so the
// test also runs on Node versions that do not detect module syntax in .js files.
async function loadWorker(){
  const src=fs.readFileSync(path.join(__dirname,'..','cloudflare-worker','lvc-meteo-proxy.js'),'utf8');
  return (await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
}
// Minimal D1 stand-in: the latest-readings query and the recent-readings query
function fakeDb({latest,recent,recentFails=false}){
  return {prepare(sql){
    const isRecent=/air_temp IS NOT NULL OR surface_temp IS NOT NULL/.test(sql);
    const stmt={bind:()=>stmt,all:async()=>{
      if(isRecent&&recentFails)throw new Error('D1 error');
      return {results:isRecent?recent:latest};
    }};
    return stmt;
  }};
}
const listJson=async(worker,db)=>(await worker.fetch(new Request('https://w.example/'),{DB:db})).json();

test('worker: every station gets prevTime, prevAirTemp, prevSurfaceTemp',async()=>{
  const worker=await loadWorker();
  const latest=[
    {id:'a',name:'A1',lat:56.9,lon:24.1,time:'2026-10-08T12:00:00+03:00',airTemp:7.3,surfaceTemp:6},
    {id:'b',name:'A2',lat:57,lon:24,time:'2026-10-08T09:00:00Z',airTemp:5,surfaceTemp:4},
    {id:'c',name:'A3',lat:57,lon:25,time:'2026-10-08T09:00:00Z',airTemp:3,surfaceTemp:2},
  ];
  const recent=[
    {id:'a',time:'2026-10-08T11:15:00+03:00',airTemp:6.9,surfaceTemp:5.8},
    {id:'a',time:'2026-10-08T11:00:00+03:00',airTemp:6.5,surfaceTemp:5.5},
    {id:'a',time:'2026-10-08T10:45:00+03:00',airTemp:6.4,surfaceTemp:5.4},
    {id:'a',time:'2026-10-08T12:00:00+03:00',airTemp:7.3,surfaceTemp:6},
    {id:'b',time:'2026-10-08T08:40:00Z',airTemp:4.9,surfaceTemp:4},
    {id:'b',time:'2026-10-08T07:00:00Z',airTemp:4,surfaceTemp:3},
  ];
  const d=await listJson(worker,fakeDb({latest,recent}));
  const by=Object.fromEntries(d.stations.map(s=>[s.id,s]));
  assert.equal(by.a.prevTime,'2026-10-08T11:00:00+03:00');
  assert.equal(by.a.prevAirTemp,6.5);
  assert.equal(by.a.prevSurfaceTemp,5.5);
  assert.equal(by.a.airTemp,7.3,'latest fields are unchanged');
  // b: only 20 and 120 minutes back, c: no recent readings at all
  for(const id of ['b','c'])assert.deepEqual([by[id].prevTime,by[id].prevAirTemp,by[id].prevSurfaceTemp],[null,null,null]);
  assert.ok(d.updated);
});
test('worker: a reading without air temperature is skipped for prevAirTemp',async()=>{
  const worker=await loadWorker();
  const latest=[{id:'a',name:'A1',lat:56.9,lon:24.1,time:'2026-10-08T09:30:00+03:00',airTemp:10,surfaceTemp:8}];
  const recent=[
    {id:'a',time:'2026-10-08T08:45:00+03:00',airTemp:9.4,surfaceTemp:7.6},
    {id:'a',time:'2026-10-08T08:30:00+03:00',airTemp:null,surfaceTemp:5},
    {id:'a',time:'2026-10-08T08:15:00+03:00',airTemp:9.1,surfaceTemp:7.2},
  ];
  const s=(await listJson(worker,fakeDb({latest,recent}))).stations[0];
  assert.equal(s.prevTime,'2026-10-08T08:45:00+03:00','45 and 75 min tie, the newer wins');
  assert.equal(s.prevAirTemp,9.4);
  assert.equal(s.prevSurfaceTemp,5);
});
test('worker: the list still works when the recent-readings query fails',async()=>{
  const worker=await loadWorker();
  const latest=[{id:'a',name:'A1',lat:56.9,lon:24.1,time:'2026-10-08T09:00:00Z',airTemp:7}];
  const d=await listJson(worker,fakeDb({latest,recent:[],recentFails:true}));
  assert.equal(d.stations.length,1);
  assert.equal(d.stations[0].airTemp,7);
  assert.equal(d.stations[0].prevAirTemp,null);
});
