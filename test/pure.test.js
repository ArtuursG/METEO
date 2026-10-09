const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pure.js');

test('tempCls buckets', () => {
  assert.equal(P.tempCls(null), '');
  assert.equal(P.tempCls(-5), 'tc-cold');
  assert.equal(P.tempCls(7.9), 'tc-cold');
  assert.equal(P.tempCls(8), 'tc-cool');
  assert.equal(P.tempCls(17), 'tc-cool');
  assert.equal(P.tempCls(18), 'tc-warm');
  assert.equal(P.tempCls(27), 'tc-warm');
  assert.equal(P.tempCls(28), 'tc-hot');
  assert.equal(P.tempCls(40), 'tc-hot');
});

test('wKey maps WMO codes', () => {
  assert.equal(P.wKey(null), null);
  assert.equal(P.wKey(0), 'clear');
  assert.equal(P.wKey(1), 'clear');
  assert.equal(P.wKey(2), 'partly');
  assert.equal(P.wKey(3), 'partly');
  assert.equal(P.wKey(45), 'fog');
  assert.equal(P.wKey(51), 'drizzle');
  assert.equal(P.wKey(61), 'rain');
  assert.equal(P.wKey(71), 'snow');
  assert.equal(P.wKey(80), 'rain');
  assert.equal(P.wKey(95), 'thunder');
  assert.equal(P.wKey(99), 'thunder');
});

test('compassIndex is 0..15 and wraps', () => {
  assert.equal(P.compassIndex(0), 0);      // N
  assert.equal(P.compassIndex(90), 4);     // E
  assert.equal(P.compassIndex(180), 8);    // S
  assert.equal(P.compassIndex(270), 12);   // W
  assert.equal(P.compassIndex(360), 0);    // wraps to N
  assert.equal(P.compassIndex(-90), 12);   // negative -> W
  for (let d = -720; d <= 720; d += 7) {
    const i = P.compassIndex(d);
    assert.ok(Number.isInteger(i) && i >= 0 && i < 16, `deg ${d} -> ${i}`);
  }
});

test('haversineKm', () => {
  assert.equal(P.haversineKm(56.95, 24.11, 56.95, 24.11), 0);
  const rigaToLiepaja = P.haversineKm(56.95, 24.11, 56.51, 21.01);
  assert.ok(rigaToLiepaja > 185 && rigaToLiepaja < 205, `got ${rigaToLiepaja}`);
  // symmetric
  assert.ok(Math.abs(
    P.haversineKm(56.95, 24.11, 59.44, 24.75) -
    P.haversineKm(59.44, 24.75, 56.95, 24.11)
  ) < 1e-9);
});

test('moonPhaseFrac', () => {
  // at the reference new moon, frac ~ 0
  const ref = Date.parse('2000-01-06T18:14:00Z');
  assert.ok(P.moonPhaseFrac(ref) < 0.001 || P.moonPhaseFrac(ref) > 0.999);
  // ~half a cycle later -> full moon (~0.5)
  const half = ref + 29.53058867 / 2 * 86400000;
  assert.ok(Math.abs(P.moonPhaseFrac(half) - 0.5) < 0.01);
  // always in [0,1)
  for (let k = 0; k < 100; k++) {
    const f = P.moonPhaseFrac(ref + k * 1.37 * 86400000);
    assert.ok(f >= 0 && f < 1);
  }
});

test('stripeColor endpoints and clamping', () => {
  assert.equal(P.stripeColor(0), 'rgb(245,245,245)');   // centre = neutral
  assert.equal(P.stripeColor(3), 'rgb(103,0,13)');      // warm extreme = deep red
  assert.equal(P.stripeColor(-3), 'rgb(8,48,107)');     // cold extreme = deep blue
  assert.equal(P.stripeColor(9), P.stripeColor(3));     // clamped
  assert.equal(P.stripeColor(-9), P.stripeColor(-3));   // clamped
  // just below the centre it is bluer than red; just above, redder than blue
  const [r1,,b1] = P.stripeColor(-1).match(/\d+/g).map(Number);
  const [r2,,b2] = P.stripeColor(1).match(/\d+/g).map(Number);
  assert.ok(b1 > r1);
  assert.ok(r2 > b2);
});

test('sameLoc proximity', () => {
  assert.ok(P.sameLoc({ lat: 56.95, lon: 24.11 }, { lat: 56.951, lon: 24.111 }));
  assert.ok(!P.sameLoc({ lat: 56.95, lon: 24.11 }, { lat: 56.99, lon: 24.11 }));
});

test('processClimate reduces a daily series', () => {
  // synthetic: 3 full years, mean rising 1 deg/yr, plus a partial current year
  const time = [], mean = [];
  const y0 = new Date().getFullYear() - 3;
  for (let y = y0; y < y0 + 3; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 30; d++) {
        time.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        mean.push((y - y0) + 5 + Math.sin(m)); // ~5..8 with seasonal wobble
      }
    }
  }
  const out = P.processClimate(time, mean);
  assert.equal(out.annual.length, 3);           // 3 full years, partial current year has 0 days
  assert.ok(out.annual[0].year === y0);
  assert.ok(out.annual[2].mean > out.annual[0].mean); // warming trend preserved
  assert.ok(out.sd > 0 && Number.isFinite(out.centre));
  assert.equal(out.doyClim.length, 367);
});

test('median ignores missing values', () => {
  assert.equal(P.median([]), null);
  assert.equal(P.median([null, undefined]), null);
  assert.equal(P.median([3, null, 1, 2]), 2);
  assert.equal(P.median([4, 1, 3, 2]), 2.5);
  assert.equal(P.median([-1.5]), -1.5);
});

test('tempColor clamps and interpolates', () => {
  assert.equal(P.tempColor(null), null);
  assert.equal(P.tempColor(-40), '#8ea9f5');
  assert.equal(P.tempColor(45), '#e2716d');
  assert.equal(P.tempColor(10), '#d3e59c');
  assert.match(P.tempColor(12.5), /^#[0-9a-f]{6}$/);
  assert.notEqual(P.tempColor(12.5), P.tempColor(10));
});

test('synoptic periods: night 18-06 UTC, day 06-18 UTC, the running one or the last that ended',()=>{
  const P=require('../js/pure.js');
  const at=s=>Date.parse(s);
  const iso=ms=>new Date(ms).toISOString().slice(0,16);
  const show=p=>[iso(p.night.from),iso(p.night.to),p.night.running,iso(p.day.from),iso(p.day.to),p.day.running];
  // Daytime: last night (ended), today so far
  assert.deepEqual(show(P.synopticPeriods(at('2026-10-09T11:30:00Z'))),['2026-10-08T18:00','2026-10-09T06:00',false,'2026-10-09T06:00','2026-10-09T11:30',true]);
  // Evening: tonight so far, today's day (ended)
  assert.deepEqual(show(P.synopticPeriods(at('2026-10-09T19:00:00Z'))),['2026-10-09T18:00','2026-10-09T19:00',true,'2026-10-09T06:00','2026-10-09T18:00',false]);
  // After midnight UTC: the night that began yesterday, yesterday's day
  assert.deepEqual(show(P.synopticPeriods(at('2026-10-10T03:00:00Z'))),['2026-10-09T18:00','2026-10-10T03:00',true,'2026-10-09T06:00','2026-10-09T18:00',false]);
  // Exactly 06 UTC: the night has just ended, the day has just begun
  assert.deepEqual(show(P.synopticPeriods(at('2026-10-09T06:00:00Z'))),['2026-10-08T18:00','2026-10-09T06:00',false,'2026-10-09T06:00','2026-10-09T06:00',true]);
});

test('period extremes: hourly extremes stamped at the end of their hour, edges and gaps',()=>{
  const P=require('../js/pure.js');
  const t=h=>Date.parse('2026-10-09T00:00:00Z')+h*3600000;
  const night={from:t(-6),to:t(6)},day={from:t(6),to:t(18)};
  const samples=[{t:t(-6),lo:-9,hi:-9},{t:t(2),lo:1.5,hi:3},{t:t(6),lo:0.8,hi:2},{t:t(7),lo:2,hi:4.1},{t:t(14),lo:null,hi:11.2},{t:t(19),lo:-20,hi:30}];
  assert.deepEqual(P.periodExtreme(samples,night,'min'),{v:0.8,t:t(6)});
  assert.deepEqual(P.periodExtreme(samples,day,'max'),{v:11.2,t:t(14)});
  assert.equal(P.periodExtreme([],day,'max'),null);
  assert.equal(P.periodExtreme(samples,null,'max'),null);
});
