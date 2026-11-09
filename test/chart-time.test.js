const test=require('node:test');const assert=require('node:assert/strict');const {chartTimeLabel,chartTimeTitle}=require('../js/chart-time');
test('wall-clock labels retain both date and hour across midnight',()=>{const a=chartTimeLabel('2026-09-13T23:00','lv-LV'),b=chartTimeLabel('2026-09-14T00:00','lv-LV');assert.equal(a.length,2);assert.match(a[0],/13/);assert.match(b[0],/14/);assert.equal(a[1],'23:00');assert.equal(b[1],'00:00');});
test('absolute station times convert to Riga while source wall times remain unchanged',()=>{assert.equal(chartTimeLabel('2026-09-13T20:00:00Z','lv-LV','Europe/Riga')[1],'23:00');assert.equal(chartTimeLabel('2026-09-13T20:00','lv-LV','Europe/Riga')[1],'20:00');assert.match(chartTimeTitle('2026-12-31T23:00','lv-LV'),/2026/);});
test('invalid timestamps have an explicit fallback',()=>{assert.deepEqual(chartTimeLabel('bad'),['-','-']);});

test('UTC clock times: wall-clock times convert with their zone, summer time included',()=>{
  const C=require('../js/chart-time.js');
  // Riga: UTC+3 in summer, UTC+2 in winter; the clocks went back on 25 October 2026, 04:00 to 03:00
  assert.equal(new Date(C.wallToMs(Date.parse('2026-07-10T12:00Z'),'Europe/Riga')).toISOString().slice(11,16),'09:00');
  assert.equal(new Date(C.wallToMs(Date.parse('2026-10-25T02:00Z'),'Europe/Riga')).toISOString().slice(0,16),'2026-10-24T23:00');
  assert.equal(new Date(C.wallToMs(Date.parse('2026-10-25T05:00Z'),'Europe/Riga')).toISOString().slice(0,16),'2026-10-25T03:00');
  assert.equal(C.zoneOffsetMs('Europe/Riga',Date.parse('2026-01-15T12:00Z')),2*3600000);
  try{
    C.setTimeUtc(false);
    assert.equal(C.chartTimeLabel('2026-11-09T14:00','en-GB')[1],'14:00');
    C.setTimeUtc(true);
    // The place's wall clock (Riga by default) and the zone a station gives
    assert.equal(C.chartTimeLabel('2026-11-09T14:00','en-GB')[1],'12:00');
    C.setPlaceZone('Asia/Tokyo');
    assert.equal(C.chartTimeLabel('2026-11-09T14:00','en-GB')[1],'05:00');
    assert.equal(C.chartTimeLabel('2026-11-09T14:00','en-GB','Europe/Riga')[1],'12:00');
    // Instants are shown in UTC, titles say so; plain dates stay as they are
    assert.equal(C.chartTimeLabel('2026-11-09T14:00:00+02:00','en-GB','Europe/Riga')[1],'12:00');
    assert.match(C.chartTimeTitle('2026-11-09T14:00:00+02:00','en-GB'),/12:00 UTC$/);
    assert.equal(C.chartTimeLabel('2026-11-09','en-GB')[0],'9 Nov');
  }finally{C.setTimeUtc(false);C.setPlaceZone('Europe/Riga');}
});
