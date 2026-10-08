const {test}=require('node:test');
const assert=require('node:assert/strict');
const {timelineTickIndexes}=require('../js/map-utils.js');
const T=require('../js/timeline.js');

const minutes=(...m)=>m.map(x=>x*60000);

test('tick indexes spread evenly and always include both ends',()=>{
  assert.deepEqual(timelineTickIndexes(13),[0,3,6,9,12]);
  assert.deepEqual(timelineTickIndexes(13,3),[0,6,12]);
  assert.deepEqual(timelineTickIndexes(8),[0,2,4,5,7]);
  assert.deepEqual(timelineTickIndexes(3),[0,1,2]);
  assert.deepEqual(timelineTickIndexes(2),[0,1]);
});
test('tick indexes never divide by zero or repeat',()=>{
  assert.deepEqual(timelineTickIndexes(1),[0]);
  assert.deepEqual(timelineTickIndexes(0),[0]);
  assert.deepEqual(timelineTickIndexes(10,1),[0,9]);
  const many=timelineTickIndexes(169,5);
  assert.equal(new Set(many).size,many.length);
  assert.equal(many[0],0);assert.equal(many.at(-1),168);
});

test('speed button cycles 0,5× → 1× → 2× → 0,5×',()=>{
  assert.equal(T.nextTimelineSpeed(0.5),1);
  assert.equal(T.nextTimelineSpeed(1),2);
  assert.equal(T.nextTimelineSpeed(2),0.5);
  assert.equal(T.nextTimelineSpeed(3),1,'unknown speed resets to 1×');
  let s=1;const seen=[];for(let i=0;i<6;i++){s=T.nextTimelineSpeed(s);seen.push(s);}
  assert.deepEqual(seen,[2,0.5,1,2,0.5,1]);
});
test('frame delay scales with speed',()=>{
  assert.equal(T.timelineDelay(600,1),600);
  assert.equal(T.timelineDelay(600,2),300);
  assert.equal(T.timelineDelay(600,0.5),1200);
  assert.equal(T.timelineDelay(600,0),600);
});

test('now index: newest frame not in the future, first frame for forecasts',()=>{
  const now=50*60000;
  assert.equal(T.nowFrameIndex(minutes(10,20,30,40),now),3);
  assert.equal(T.nowFrameIndex(minutes(30,40,50,60,70),now),2);
  assert.equal(T.nowFrameIndex(minutes(60,70),now),0);
  assert.equal(T.nowFrameIndex([],now),-1);
});

test('refresh keeps the viewer on the newest frame when they were there',()=>{
  const old=minutes(0,10,20,30),fresh=minutes(10,20,30,40);
  assert.equal(T.mergeFrameIndex(old,3,fresh),3);
  assert.equal(T.mergeFrameIndex(old,1,fresh,true),3,'explicit follow wins');
});
test('refresh keeps the same timestamp when it is still there',()=>{
  const old=minutes(0,10,20,30),fresh=minutes(10,20,30,40);
  assert.equal(T.mergeFrameIndex(old,1,fresh),0);
  assert.equal(T.mergeFrameIndex(old,2,fresh,false),1);
});
test('refresh moves to the closest frame when the shown one dropped out',()=>{
  const old=minutes(0,10,20,30),fresh=minutes(20,30,40,50);
  assert.equal(T.mergeFrameIndex(old,0,fresh,false),0);
  assert.equal(T.mergeFrameIndex(minutes(0,12,24),1,minutes(10,20,30),false),0);
});
test('first load and empty lists',()=>{
  assert.equal(T.mergeFrameIndex([],-1,minutes(0,10,20)),2);
  assert.equal(T.mergeFrameIndex(null,null,minutes(0,10)),1);
  assert.equal(T.mergeFrameIndex(minutes(0,10),1,[]),-1);
  assert.equal(T.mergeFrameIndex(minutes(0,10),7,minutes(0,10,20)),2,'out-of-range index falls back to newest');
});

test('frame layer diff lists added and removed keys',()=>{
  assert.deepEqual(T.diffFrameKeys(['a','b','c'],['b','c','d']),{added:['d'],removed:['a']});
  assert.deepEqual(T.diffFrameKeys([],['a']),{added:['a'],removed:[]});
  assert.deepEqual(T.diffFrameKeys(['a'],[]),{added:[],removed:['a']});
  assert.deepEqual(T.diffFrameKeys(['a','b'],['a','b']),{added:[],removed:[]});
});

test('tick marks: one per frame for short lists, thinned for long ones',()=>{
  assert.deepEqual(T.frameMarkIndexes(13),[0,1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.deepEqual(T.frameMarkIndexes(1),[0]);
  assert.deepEqual(T.frameMarkIndexes(0),[]);
  const long=T.frameMarkIndexes(169);
  assert.ok(long.length<=49,`got ${long.length}`);
  assert.equal(long[0],0);assert.equal(long.at(-1),168);
});

test('frame step is the typical gap in minutes',()=>{
  assert.equal(T.frameStepMinutes(minutes(0,10,20,30)),10);
  assert.equal(T.frameStepMinutes(minutes(0,10,20,40,50)),10,'one missing frame does not change it');
  assert.equal(T.frameStepMinutes(minutes(0)),null);
});

test('label count lands on evenly spaced frames',()=>{
  assert.equal(T.timelineLabelCount(13),5,'radar: 12 steps / 4');
  assert.equal(T.timelineLabelCount(8),3,'satellite: 7 steps do not split in 4, use 3');
  assert.equal(T.timelineLabelCount(169),5,'hourly week: 168 / 4');
  assert.equal(T.timelineLabelCount(10),4,'9 steps / 3');
  assert.equal(T.timelineLabelCount(2),2);
  assert.equal(T.timelineLabelCount(1),1);
  assert.equal(T.timelineLabelCount(0),1);
  const n=T.timelineLabelCount(8),idx=timelineTickIndexes(8,n);
  assert.deepEqual(idx,[0,4,7]);
});
