const test=require('node:test');
const assert=require('node:assert/strict');
const {roadIceSummary}=require('../js/road-ice.js');

// Riga centre; LVC sends ISO times with an offset
const LAT=56.946, LON=24.106;
const NOW=Date.parse('2026-01-15T07:20:00Z');
const at=min=>new Date(NOW-min*60000).toISOString();
const st=(id,lat,lon,surfaceTemp,extra={})=>({id,name:'A'+id+' Vieta',lat,lon,time:at(10),airTemp:-2,surfaceTemp,roadCondition:'dry',...extra});

test('nothing to report: warm or dry roads, no stations',()=>{
  const list=[st(1,56.95,24.12,3.2),st(2,57.0,24.2,1.6,{roadCondition:'wet'})];
  assert.equal(roadIceSummary(list,LAT,LON,{nowMs:NOW}),null);
  assert.equal(roadIceSummary([],LAT,LON,{nowMs:NOW}),null);
  assert.equal(roadIceSummary(null,LAT,LON,{nowMs:NOW}),null);
});

test('ice: surface at or below 0, count, total and the coldest station',()=>{
  const list=[
    st(1,56.95,24.12,-0.4),
    st(2,57.07,24.32,-1.4),
    st(3,56.82,24.6,0),
    st(4,56.86,24.35,2.5),
    st(5,56.97,23.77,0.8),
    st(6,56.79,23.94,4.1),
  ];
  const r=roadIceSummary(list,LAT,LON,{nowMs:NOW});
  assert.equal(r.level,'ice');
  assert.equal(r.count,3);
  assert.equal(r.total,6);
  assert.equal(r.frost,0);
  assert.equal(r.coldest.name,'A2 Vieta');
  assert.equal(r.coldest.surfaceTemp,-1.4);
  assert.ok(r.coldest.dist>15&&r.coldest.dist<20);
});

test('ice from the road condition alone, also without a surface temperature',()=>{
  const frost=roadIceSummary([st(1,56.95,24.12,1.8,{roadCondition:'frost'}),st(2,56.9,24.2,3)],LAT,LON,{nowMs:NOW});
  assert.equal(frost.level,'ice');
  assert.equal(frost.count,1);
  assert.equal(frost.total,2);
  assert.equal(frost.frost,1);
  assert.equal(frost.coldest.surfaceTemp,1.8);
  // A frost report on a clearly warm surface is not trusted
  assert.equal(roadIceSummary([st(1,56.95,24.12,5.7,{roadCondition:'frost'}),st(2,56.9,24.2,6)],LAT,LON,{nowMs:NOW}),null);
  // Frost on a surface measured below 0: counted as ice, not as frost only
  const both=roadIceSummary([st(1,56.95,24.12,-2,{roadCondition:'frost'}),st(2,56.9,24.2,-0.5)],LAT,LON,{nowMs:NOW});
  assert.equal(both.count,2);
  assert.equal(both.frost,0);
  const snow=roadIceSummary([st(1,56.95,24.12,null,{roadCondition:'iceOrSnowOnRoad'})],LAT,LON,{nowMs:NOW});
  assert.equal(snow.level,'ice');
  assert.equal(snow.total,1);
  assert.equal(snow.coldest,null);
});

test('near: no icy station but a surface at or below +1',()=>{
  const r=roadIceSummary([st(1,56.95,24.12,0.6),st(2,57.0,24.0,1),st(3,56.9,24.3,1.1)],LAT,LON,{nowMs:NOW});
  assert.equal(r.level,'near');
  assert.equal(r.count,2);
  assert.equal(r.total,3);
  assert.equal(r.coldest.name,'A1 Vieta');
  assert.equal(r.coldest.surfaceTemp,0.6);
});

test('far, stale, future and unusable readings are left out',()=>{
  const list=[
    st(1,56.51,21.01,-3),                         // Liepāja, far away
    st(2,56.95,24.12,-2,{time:at(120)}),          // two hours old
    st(3,56.95,24.12,-2,{time:at(-60)}),          // an hour in the future
    st(4,56.95,24.12,-2,{time:''}),               // no time
    st(5,'x',24.12,-2),                           // no position
    st(6,56.95,24.12,null,{roadCondition:null}),  // nothing measured
    st(7,56.96,24.1,2.4),
  ];
  const r=roadIceSummary(list,LAT,LON,{nowMs:NOW});
  assert.equal(r,null);
  // A wider radius and a longer age limit bring them back
  const wide=roadIceSummary(list,LAT,LON,{nowMs:NOW,maxKm:250,maxAgeMin:180});
  assert.equal(wide.level,'ice');
  assert.equal(wide.count,2);
  assert.equal(wide.total,3);
});

test('Riga wall-clock times without an offset are parsed like the station table',()=>{
  // 09:15 in Riga in January is 07:15 UTC, five minutes before NOW
  const r=roadIceSummary([st(1,56.95,24.12,-0.2,{time:'2026-01-15T09:15:00'})],LAT,LON,{nowMs:NOW});
  assert.equal(r.level,'ice');
  assert.equal(r.total,1);
  assert.equal(roadIceSummary([st(1,56.95,24.12,-0.2,{time:'2026-01-15T07:15:00'})],LAT,LON,{nowMs:NOW}),null);
});
