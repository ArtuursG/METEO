const test=require('node:test');const assert=require('node:assert/strict');const {forecastWindow}=require('../js/forecast-range');
const times=Array.from({length:384},(_,i)=>new Date(Date.UTC(2026,8,13,i)).toISOString().slice(0,16));
const source={m:{utcOffset:10800,hourly:{time:times,temperature_2m:times.map((_,i)=>i)},daily:{time:['2026-09-13','2026-09-14','2026-09-15','2026-09-16'],value:[1,2,3,4]}}};
test('48h starts at current forecast-local hour and keeps values aligned',()=>{const x=forecastWindow(source,48,Date.UTC(2026,8,13,10,35));assert.equal(x.m.hourly.time[0],'2026-09-13T13:00');assert.equal(x.m.hourly.time.length,48);assert.equal(x.m.hourly.temperature_2m[0],13);assert.equal(x.m.daily.time.length,2);assert.equal(source.m.hourly.time.length,384);});
test('7d and extended windows preserve available data without invented values',()=>{assert.equal(forecastWindow(source,168,Date.UTC(2026,8,13,10)).m.hourly.time.length,168);assert.equal(forecastWindow(source,384,Date.UTC(2026,8,13,10)).m.hourly.time.length,371);});

test('past hours: the temperature chart can keep hours before the current one',()=>{
  const time=Array.from({length:30},(_,i)=>`2026-10-09T${String(i%24).padStart(2,'0')}:00`.replace('2026-10-09',i<24?'2026-10-09':'2026-10-10'));
  const data={m:{utcOffset:10800,hourly:{time,temperature_2m:time.map((_,i)=>i)},daily:{time:['2026-10-09','2026-10-10']}}};
  const now=Date.parse('2026-10-09T09:30:00Z'); // 12:30 local
  const {forecastWindow}=require('../js/forecast-range.js');
  assert.equal(forecastWindow(data,6,now).m.hourly.time[0],'2026-10-09T12:00');
  const w=forecastWindow(data,6,now,4);
  assert.equal(w.m.hourly.time[0],'2026-10-09T08:00');
  assert.equal(w.m.hourly.time.at(-1),'2026-10-09T17:00');
  // Past hours change only the hourly part
  assert.deepEqual(w.m.daily.time,forecastWindow(data,6,now).m.daily.time);
});
