const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSatFrames}=require('../js/cloud-map.js');

test('buildSatFrames returns 8 frames on a 15-minute grid, ending before now', () => {
  const frames=buildSatFrames();
  assert.equal(frames.length,8);
  for(const f of frames){
    assert.equal(f.kind,'sat');
    const d=new Date(f.time);
    assert.equal(d.getUTCMinutes()%15,0,`expected a 15-min-aligned timestamp, got ${f.time}`);
    assert.equal(d.getUTCSeconds(),0);
  }
  // strictly increasing, 15 min apart
  for(let i=1;i<frames.length;i++){
    const diff=new Date(frames[i].time)-new Date(frames[i-1].time);
    assert.equal(diff,15*60000);
  }
  // the latest frame stays at least one full step behind "now" (processing-lag margin)
  const last=new Date(frames.at(-1).time);
  assert.ok(Date.now()-last.getTime()>=15*60000);
});
