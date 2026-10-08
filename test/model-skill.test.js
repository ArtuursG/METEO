const test=require('node:test');
const assert=require('node:assert/strict');
const K=require('../js/model-skill.js');

// LVĢMC style wall-clock string (Riga time, no offset) for a UTC instant
const rigaWall=ms=>{
  const d=new Date(ms),y=d.getUTCFullYear();
  const last=m=>{const e=new Date(Date.UTC(y,m+1,0));return Date.UTC(y,m,e.getUTCDate()-e.getUTCDay(),1);};
  const off=ms>=last(2)&&ms<last(9)?3:2;
  return new Date(ms+off*3600e3).toISOString().slice(0,19);
};
// Open-Meteo style local label with one fixed offset for the whole series
const omLabel=(ms,off)=>new Date(ms+off*1000).toISOString().slice(0,16);
const temp=ms=>10+5*Math.sin(ms/3600e3/24*2*Math.PI);
const hours=(from,n)=>Array.from({length:n},(_,i)=>Date.parse(from)+i*3600e3);

test('station readings are keyed by the Riga wall-clock hour',()=>{
  const obs=K.skillObs([
    {time:'2026-10-08T08:00:00',airTemp:7.4},
    {time:'2026-10-08 09:00:00',airTemp:'8.1'},
    {time:'2026-10-08T10:20:00',airTemp:9},       // not a full hour
    {time:'2026-10-08T11:00:00',airTemp:null},
    {time:'',airTemp:5},
    {time:'2026-10-08T09:00:00Z',airTemp:6.5},    // with an offset: 12:00 in Riga
    null,
  ]);
  assert.deepEqual(obs,{'2026-10-08T08':7.4,'2026-10-08T09':8.1,'2026-10-08T12':6.5});
});

test('forecast hours map to the same Riga hour as the station',()=>{
  // Summer time, timezone=auto gives the Riga offset: the labels are the wall clock
  assert.equal(K.skillHourKey('2026-10-08T08:00',10800),'2026-10-08T08');
  // Fetched after the clock change: one +2 h offset for the whole series, so a label
  // from the day before is an hour behind the wall clock of that day
  assert.equal(K.skillHourKey('2026-10-24T12:00',7200),'2026-10-24T13');
  assert.equal(K.skillHourKey('2026-10-26T12:00',7200),'2026-10-26T12');
  // Winter to summer
  assert.equal(K.skillHourKey('2027-03-27T12:00',10800),'2027-03-27T11');
  // No offset in the response: plain strings
  assert.equal(K.skillHourKey('2026-10-08T08:00'),'2026-10-08T08');
});

test('a model equal to the measurements scores zero, a shifted one does not',()=>{
  const utc=hours('2026-10-06T21:00Z',48);
  const obs=K.skillObs(utc.map(ms=>({time:rigaWall(ms),airTemp:temp(ms)})));
  assert.equal(Object.keys(obs).length,48);
  const resp={utc_offset_seconds:10800,hourly:{
    time:utc.map(ms=>omLabel(ms,10800)),
    temperature_2m_exact:utc.map(temp),
    temperature_2m_late:utc.map(ms=>temp(ms-3600e3)),
  }};
  const rows=K.scoreModels(obs,resp);
  assert.deepEqual(rows.map(r=>r.id),['exact','late']);
  assert.ok(rows[0].mae<1e-9);
  assert.equal(rows[0].n,48);
  assert.ok(rows[1].mae>0.3);
});

test('alignment holds across the October clock change',()=>{
  // Station readings on 24 October (summer time), forecast fetched on 26 October (+2 h)
  const day=hours('2026-10-23T21:00Z',24);
  const obs=K.skillObs(day.map(ms=>({time:rigaWall(ms),airTemp:temp(ms)})));
  assert.ok('2026-10-24T00' in obs&&'2026-10-24T23' in obs);
  const utc=hours('2026-10-23T22:00Z',72);
  const resp={utc_offset_seconds:7200,hourly:{time:utc.map(ms=>omLabel(ms,7200)),temperature_2m_m:utc.map(temp)}};
  assert.equal(resp.hourly.time[0],'2026-10-24T00:00');
  const [row]=K.scoreModels(obs,resp);
  // The series starts at "00:00" in +2 h, which was 01:00 on the Riga clock that day
  assert.equal(row.n,23);
  assert.ok(row.mae<1e-9);
  // Comparing the labels as plain strings would be an hour off
  const naive=K.scoreModels(obs,{hourly:resp.hourly})[0];
  assert.ok(naive.mae>0.3);
});

test('scores: mean error, bias, enough hours, best first',()=>{
  const time=Array.from({length:10},(_,i)=>`2026-10-08T${String(i).padStart(2,'0')}:00`);
  const obs=Object.fromEntries(time.map(x=>[x.slice(0,13),10]));
  const resp={utc_offset_seconds:10800,hourly:{time,
    temperature_2m_warm:time.map(()=>11),                         // +1 every hour
    temperature_2m_mixed:time.map((_,i)=>i%2?9.5:10.5),           // ±0.5
    temperature_2m_short:time.map((_,i)=>i<5?10:null),            // 5 hours only
    temperature_2m_gaps:time.map((_,i)=>i===3?null:i<8?10.2:'x'), // 7 usable hours
  }};
  const rows=K.scoreModels(obs,resp,['warm','mixed','short','gaps','missing']);
  assert.deepEqual(rows.map(r=>r.id),['gaps','mixed','warm']);
  const by=Object.fromEntries(rows.map(r=>[r.id,r]));
  assert.equal(by.warm.n,10);assert.ok(Math.abs(by.warm.mae-1)<1e-9);assert.ok(Math.abs(by.warm.bias-1)<1e-9);
  assert.ok(Math.abs(by.mixed.mae-0.5)<1e-9);assert.ok(Math.abs(by.mixed.bias)<1e-9);
  assert.equal(by.gaps.n,7);
  assert.equal(K.SKILL_MIN,6);
  assert.deepEqual(K.scoreModels(obs,null),[]);
  assert.deepEqual(K.scoreModels(null,resp),[]);
});

test('models that show the same rounded error are all best',()=>{
  const rows=[{id:'a',mae:0.66},{id:'b',mae:0.74},{id:'c',mae:0.76},{id:'d',mae:1.2}];
  assert.deepEqual(K.skillBest(rows).map(r=>r.id),['a','b']);
  assert.deepEqual(K.skillBest(rows.slice(1)).map(r=>r.id),['b']);
  assert.deepEqual(K.skillBest([{id:'a',mae:0},{id:'b',mae:0.04},{id:'c',mae:0.06}]).map(r=>r.id),['a','b']);
  assert.deepEqual(K.skillBest([]),[]);
  assert.deepEqual(K.skillBest(null),[]);
});

test('nearest station with history within 50 km, Latvia only',()=>{
  const hist=n=>Array.from({length:n},(_,i)=>({time:`2026-10-08T${String(i).padStart(2,'0')}:00:00`,airTemp:8}));
  const stations=[
    {id:'near-empty',name:'Tuvā',lat:56.95,lon:24.11,history:hist(3)},
    {id:'riga',name:'Rīga',lat:56.97,lon:24.13,history:hist(24)},
    {id:'far',name:'Tālā',lat:57.4,lon:24.9,history:hist(24)},
    {id:'bad',name:'Bez koordinātām',lat:null,lon:24,history:hist(24)},
    {id:'nohist',name:'Bez vēstures',lat:56.95,lon:24.1},
  ];
  const p=K.pickSkillStation(stations,56.946,24.106);
  assert.equal(p.station.id,'riga');
  assert.equal(p.station.name,'Rīga');
  assert.ok(p.dist>2&&p.dist<5);
  assert.equal(Object.keys(p.obs).length,24);
  // Daugavpils is far from every station in the list
  assert.equal(K.pickSkillStation(stations,55.87,26.53),null);
  // Tallinn is outside Latvia even with a station next to it
  assert.equal(K.pickSkillStation([{...stations[1],lat:59.44,lon:24.75}],59.43,24.75),null);
  assert.equal(K.skillInArea(56.95,24.1),true);
  assert.equal(K.skillInArea(54.69,25.28),false);
  assert.equal(K.pickSkillStation(null,56.95,24.1),null);
});
