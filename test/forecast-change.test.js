const test=require('node:test');
const assert=require('node:assert/strict');
const {snapshotFromDaily,pickBaseline,addSnapshot,compareForecasts}=require('../js/forecast-change.js');

const H=3600e3;
const T0=Date.parse('2026-10-07T15:40:00Z');
const day=(date,tmin,tmax,precip,prob=20)=>({date,tmin,tmax,precip,prob});
const snap=(ts,days)=>({ts,days});

test('snapshot keeps the first three days, temperatures as they are',()=>{
  const rows=[
    {date:'2026-10-07',offset:0,n:12,tmin:4.04,tmax:11.96,lo:2,hi:14,precip:0.25,prob:33.3,cloud:60,snow:false,sky:'partly'},
    {date:'2026-10-08',offset:1,n:12,tmin:5,tmax:12,lo:3,hi:15,precip:6.18,prob:80,cloud:90},
    {date:'2026-10-09',offset:2,n:12,tmin:3,tmax:9,lo:1,hi:11,precip:null,prob:null,cloud:40},
    {date:'2026-10-10',offset:3,n:11,tmin:2,tmax:8,lo:0,hi:10,precip:0,prob:10,cloud:40},
  ];
  const s=snapshotFromDaily(rows,T0);
  assert.equal(s.ts,T0);
  assert.equal(s.days.length,3);
  assert.deepEqual(s.days[0],{date:'2026-10-07',tmin:4.04,tmax:11.96,precip:0.3,prob:33});
  assert.deepEqual(s.days[2],{date:'2026-10-09',tmin:3,tmax:9,precip:null,prob:null});
  assert.deepEqual(snapshotFromDaily([],T0),{ts:T0,days:[]});
  assert.deepEqual(snapshotFromDaily(null,T0),{ts:T0,days:[]});
});

test('baseline: the newest snapshot that is at least three hours old',()=>{
  const list=[snap(T0-30*H,[]),snap(T0-5*H,[]),snap(T0-2*H,[]),snap(T0-4*H,[])];
  assert.equal(pickBaseline(list,T0).ts,T0-4*H);
  assert.equal(pickBaseline(list,T0,{minAgeMs:H}).ts,T0-2*H);
  assert.equal(pickBaseline([snap(T0-H,[])],T0),null);
  assert.equal(pickBaseline([],T0),null);
  assert.equal(pickBaseline(null,T0),null);
  assert.equal(pickBaseline([{ts:'x',days:[]},null,{days:[]}],T0),null);
});

test('adding snapshots: minimum gap, age limit and the size cap',()=>{
  const d=[day('2026-10-07',4,12,0)];
  let list=addSnapshot([],snap(T0,d));
  assert.equal(list.length,1);
  // Less than an hour later: not stored again
  list=addSnapshot(list,snap(T0+40*60e3,d));
  assert.deepEqual(list.map(s=>s.ts),[T0]);
  list=addSnapshot(list,snap(T0+H,d));
  assert.deepEqual(list.map(s=>s.ts),[T0,T0+H]);
  // An empty snapshot is never stored
  assert.equal(addSnapshot(list,snap(T0+5*H,[])).length,2);
  // Older than four days is dropped
  list=addSnapshot(list,snap(T0+4*24*H+30*60e3,d));
  assert.deepEqual(list.map(s=>s.ts),[T0+H,T0+4*24*H+30*60e3]);
  // At most six, the newest kept; the input is not changed
  let many=[];
  for(let i=0;i<9;i++)many=addSnapshot(many,snap(T0+i*2*H,d));
  assert.equal(many.length,6);
  assert.equal(many[0].ts,T0+3*2*H);
  const before=many.slice();
  addSnapshot(many,snap(T0+40*H,d));
  assert.deepEqual(many,before);
  // Broken entries from storage are ignored
  assert.equal(addSnapshot([null,{ts:1},'x'],snap(T0,d)).length,1);
});

test('no changes: same forecast, small differences, no common dates',()=>{
  const base=snap(T0-20*H,[day('2026-10-06',3,10,0),day('2026-10-07',4,12,0.2),day('2026-10-08',5,12,6)]);
  const same=snap(T0,[day('2026-10-07',4.4,12.4,0.1),day('2026-10-08',5.6,13.4,7.5),day('2026-10-09',3,9,0)]);
  assert.deepEqual(compareForecasts(base,same),[]);
  assert.deepEqual(compareForecasts(base,snap(T0,[day('2026-10-12',0,20,30)])),[]);
  assert.deepEqual(compareForecasts(null,same),[]);
  assert.deepEqual(compareForecasts(base,null),[]);
});

test('temperature: at least 2 degrees on rounded values, one change per day',()=>{
  const base=snap(T0-20*H,[day('2026-10-07',4,12,0),day('2026-10-08',5.4,11.4,0),day('2026-10-09',3,9,0)]);
  // 11.4 -> 13.5 is 11 -> 14 (+3); 5.4 -> 7.4 is +2 on the same day, the larger one wins
  const cur=snap(T0,[day('2026-10-07',4,12,0),day('2026-10-08',7.4,13.5,0),day('2026-10-09',3,9,0)]);
  assert.deepEqual(compareForecasts(base,cur),[{date:'2026-10-08',kind:'tmax',delta:3,from:11.4,to:13.5}]);
  // 11.4 -> 12.6 is 11 -> 13, two degrees; 11.6 -> 13.4 is 12 -> 13, only one
  assert.equal(compareForecasts(base,snap(T0,[day('2026-10-08',5.4,12.6,0)]))[0].delta,2);
  assert.deepEqual(compareForecasts(snap(T0-20*H,[day('2026-10-08',5,11.6,0)]),snap(T0,[day('2026-10-08',5,13.4,0)])),[]);
  // A colder night
  const night=compareForecasts(base,snap(T0,[day('2026-10-09',0.4,9,0)]));
  assert.deepEqual(night.map(c=>[c.kind,c.delta]),[['tmin',-3]]);
});

test('temperature: rounded like the daily list shows it',()=>{
  const cmp=(a,b,kind='tmax')=>compareForecasts(snap(T0-20*H,[day('2026-10-08',...(kind==='tmax'?[0,a]:[a,20]),0)]),
    snap(T0,[day('2026-10-08',...(kind==='tmax'?[0,b]:[b,20]),0)])).map(c=>c.delta);
  // 12 -> 13 on the list: no change, even though 11.5 -> 13.5 would round to 12 -> 14
  assert.deepEqual(cmp(11.54,13.46),[]);
  // 11 -> 13 on the list
  assert.deepEqual(cmp(11.46,13.4),[2]);
  // Halves go away from zero: -2.5 is -3, so -3 -> -1
  assert.deepEqual(cmp(-2.5,-1.4,'tmin'),[2]);
  assert.deepEqual(cmp(2.5,4.4,'tmin'),[]);
});

test('rain appears, disappears or changes a lot',()=>{
  const base=snap(T0-20*H,[day('2026-10-07',4,12,0.2),day('2026-10-08',5,12,3),day('2026-10-09',3,9,8)]);
  const cur=snap(T0,[day('2026-10-07',4,12,6.2),day('2026-10-08',5,12,0.1),day('2026-10-09',3,9,16)]);
  const all=compareForecasts(base,cur);
  assert.equal(all.length,2);
  assert.deepEqual(all[0],{date:'2026-10-07',kind:'precip_new',delta:6,mm:6.2,snow:false});
  assert.deepEqual(all[1],{date:'2026-10-08',kind:'precip_gone',delta:-2.9,mm:3,snow:false});
  // More and less: at least 5 mm and half of the old amount
  const more=compareForecasts(base,snap(T0,[day('2026-10-09',3,9,16)]));
  assert.deepEqual(more.map(c=>[c.kind,c.delta,c.mm]),[['precip_more',8,16]]);
  const less=compareForecasts(snap(T0-20*H,[day('2026-10-09',3,9,12)]),snap(T0,[day('2026-10-09',3,9,5.5)]));
  assert.deepEqual(less.map(c=>[c.kind,c.delta]),[['precip_less',-6.5]]);
  // 20 -> 26 mm is 6 mm but only 30 %
  assert.deepEqual(compareForecasts(snap(T0-20*H,[day('2026-10-09',3,9,20)]),snap(T0,[day('2026-10-09',3,9,26)])),[]);
  // 0.5 -> 0.9 mm is neither new rain nor a big change
  assert.deepEqual(compareForecasts(snap(T0-20*H,[day('2026-10-09',3,9,0.5)]),snap(T0,[day('2026-10-09',3,9,0.9)])),[]);
});

test('precipitation can be left out for some dates, temperature still counts',()=>{
  const base=snap(T0-20*H,[day('2026-10-07',4,12,0.2),day('2026-10-08',5,12,3)]);
  const cur=snap(T0,[day('2026-10-07',4,15,6.2),day('2026-10-08',5,12,0.1)]);
  const all=compareForecasts(base,cur,{noPrecip:['2026-10-07']});
  assert.deepEqual(all.map(c=>[c.date,c.kind]),[['2026-10-08','precip_gone'],['2026-10-07','tmax']]);
  assert.deepEqual(compareForecasts(base,cur,{noPrecip:['2026-10-07','2026-10-08']}).map(c=>c.kind),['tmax']);
});

test('snow when the day is cold enough, judged on the day the amount belongs to',()=>{
  const base=snap(T0-20*H,[day('2026-12-07',-4,-1,0),day('2026-12-08',-3,2,4)]);
  const cur=snap(T0,[day('2026-12-07',-4,-1,5),day('2026-12-08',1,6,0)]);
  const all=compareForecasts(base,cur);
  const byKind=Object.fromEntries(all.map(c=>[c.kind,c]));
  assert.equal(byKind.precip_new.snow,true);
  assert.equal(byKind.precip_gone,undefined);
  // The warmer day wins over the gone snow on 8 December (tmax +4 against 3.8)
  assert.equal(byKind.tmax.delta,4);
  const gone=compareForecasts(snap(T0-20*H,[day('2026-12-08',-3,0,4)]),snap(T0,[day('2026-12-08',-3,0,0)]));
  assert.equal(gone[0].kind,'precip_gone');
  assert.equal(gone[0].snow,true);
});

test('ordered by importance, the day after tomorrow weighs a little less, at most two',()=>{
  const base=snap(T0-20*H,[day('2026-10-07',4,12,0),day('2026-10-08',5,12,0),day('2026-10-09',3,9,0)]);
  const cur=snap(T0,[day('2026-10-07',4,15,0),day('2026-10-08',5,8,0),day('2026-10-09',3,13,0)]);
  // today +3, tomorrow -4, day after +4 (scored 3.4)
  assert.deepEqual(compareForecasts(base,cur).map(c=>[c.date,c.delta]),[['2026-10-08',-4],['2026-10-09',4]]);
  // New rain outranks a 3 degree change
  const rain=snap(T0,[day('2026-10-07',4,15,0),day('2026-10-08',5,12,2)]);
  assert.deepEqual(compareForecasts(base,rain).map(c=>c.kind),['precip_new','tmax']);
});
