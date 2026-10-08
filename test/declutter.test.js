const {test}=require('node:test');
const assert=require('node:assert/strict');
const {declutterBadges,badgePriorities,parseStationTime,foldText}=require('../js/map-utils.js');

const badge=(id,x,y,priority,w=40,h=20)=>({id,x,y,w,h,priority});

test('badges that do not touch are all kept',()=>{
  const kept=declutterBadges([badge('a',0,0,1),badge('b',100,0,2),badge('c',0,100,3)]);
  assert.deepEqual([...kept].sort(),['a','b','c']);
});
test('of two overlapping badges the higher priority one wins',()=>{
  const kept=declutterBadges([badge('low',10,0,1),badge('high',20,5,9)]);
  assert.deepEqual([...kept],['high']);
});
test('a dropped badge does not block others',()=>{
  // b overlaps a (wins) and c; a is dropped, so c only has to avoid b
  const kept=declutterBadges([badge('a',0,0,1),badge('b',30,0,5),badge('c',75,0,3)]);
  assert.deepEqual([...kept].sort(),['b','c']);
});
test('padding counts as overlap',()=>{
  assert.equal(declutterBadges([badge('a',0,0,2),badge('b',42,0,1)],{pad:0}).size,2);
  assert.equal(declutterBadges([badge('a',0,0,2),badge('b',42,0,1)],{pad:2}).size,1);
});
test('blocked areas (map controls) push badges to dots',()=>{
  const kept=declutterBadges([badge('under',50,20,9),badge('free',50,200,1)],{blocked:[{l:0,t:0,r:300,b:60}]});
  assert.deepEqual([...kept],['free']);
});
test('equal priorities are decided by id, so the result is stable',()=>{
  const pts=[badge('b',0,0,1),badge('a',5,0,1)];
  assert.deepEqual([...declutterBadges(pts)],['a']);
  assert.deepEqual([...declutterBadges([...pts].reverse())],['a']);
});
test('points without coordinates are ignored',()=>{
  assert.deepEqual([...declutterBadges([badge('a',NaN,0,1),null,badge('b',0,0,1)])],['b']);
  assert.equal(declutterBadges([]).size,0);
});

test('priority: selected, then nearest, then extremes, then distance',()=>{
  const items=[
    {id:'near',dist:2,value:6},
    {id:'cold',dist:80,value:-3},
    {id:'warm',dist:120,value:14},
    {id:'mid',dist:30,value:7},
    {id:'far',dist:150,value:8},
    {id:'pick',dist:200,value:7},
  ];
  const p=badgePriorities(items,{selectedId:'pick'});
  const order=[...p.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  assert.deepEqual(order.slice(0,2),['pick','near']);
  assert.deepEqual(order.slice(2,4).sort(),['cold','warm']);
  assert.deepEqual(order.slice(4),['mid','far']);
});
test('wind and precipitation only promote the maximum',()=>{
  const p=badgePriorities([{id:'a',dist:5,value:1},{id:'calm',dist:50,value:0},{id:'gale',dist:90,value:15},{id:'b',dist:40,value:3}],{extremes:'max'});
  assert.ok(p.get('gale')>p.get('b'));
  assert.ok(p.get('calm')<p.get('b'),'minimum is not promoted');
});
test('no extremes when all values are equal or missing',()=>{
  const p=badgePriorities([{id:'a',dist:5,value:2},{id:'b',dist:9,value:2},{id:'c',dist:1,value:null}]);
  assert.ok(p.get('c')>p.get('a'),'nearest still first');
  assert.ok(p.get('a')>p.get('b'));
});
test('declutter keeps the selected station even in a crowd',()=>{
  const items=[{id:'x',dist:1,value:5},{id:'y',dist:2,value:6},{id:'sel',dist:3,value:5.5}];
  const pr=badgePriorities(items,{selectedId:'sel'});
  const kept=declutterBadges(items.map((i,k)=>({...i,x:k*10,y:0,w:40,h:20,priority:pr.get(i.id)})));
  assert.deepEqual([...kept],['sel']);
});

test('station times: offsets are respected, Riga wall clock otherwise',()=>{
  assert.equal(parseStationTime('2026-10-07T12:00:00Z'),Date.UTC(2026,9,7,12));
  assert.equal(parseStationTime('2026-10-07T15:00:00+03:00'),Date.UTC(2026,9,7,12));
  // LVĢMC: local time without a zone. October 7 is summer time (UTC+3)
  assert.equal(parseStationTime('2026-10-07T15:00:00'),Date.UTC(2026,9,7,12));
  // December is winter time (UTC+2)
  assert.equal(parseStationTime('2026-12-01T10:00:00'),Date.UTC(2026,11,1,8));
  // the change happens on the last Sunday of October (25 Oct 2026)
  assert.equal(parseStationTime('2026-10-24T12:00'),Date.UTC(2026,9,24,9));
  assert.equal(parseStationTime('2026-10-26T12:00'),Date.UTC(2026,9,26,10));
  assert.ok(Number.isNaN(parseStationTime(null)));
  assert.ok(Number.isNaN(parseStationTime('')));
});

test('search folding ignores case and Latvian diacritics',()=>{
  assert.equal(foldText('Rīga'),'riga');
  assert.equal(foldText('ĶEKAVA'),'kekava');
  assert.ok(foldText('A12 Jēkabpils').includes(foldText('jekab')));
  assert.equal(foldText(null),'');
});
