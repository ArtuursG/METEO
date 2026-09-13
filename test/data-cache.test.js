const test=require('node:test');const assert=require('node:assert/strict');const {createDataCache}=require('../js/data-cache');
function store(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('concurrent requests share one fetch; fresh memory and persistent cache reuse it',async()=>{
 let count=0,resolve,time=100000;const storage=store();
 const fetcher=()=>{count++;return new Promise(r=>resolve=r)};
 const cache=createDataCache({storage,fetcher,now:()=>time});const a=cache('x','/x',1000),b=cache('x','/x',1000);
 resolve({ok:true,json:async()=>({value:42})});assert.deepEqual(await a,await b);assert.equal(count,1);
 await cache('x','/x',1000);assert.equal(count,1);
 const reload=createDataCache({storage,fetcher,now:()=>time});await reload('x','/x',1000);assert.equal(count,1);
 time+=1001;const c=reload('x','/x',1000);resolve({ok:true,json:async()=>({value:43})});assert.equal((await c).value,43);assert.equal(count,2);
});
test('failed requests cool down and never masquerade as empty successful data',async()=>{
 let count=0,time=100000;const cache=createDataCache({now:()=>time,fetcher:async()=>{count++;return {ok:false,status:503}}});
 await assert.rejects(cache('x','/x',1000));await assert.rejects(cache('x','/x',1000));assert.equal(count,1);
 time+=60001;await assert.rejects(cache('x','/x',1000));assert.equal(count,2);
});
test('persistent cache is bounded and storage denial does not break fetching',async()=>{
 const storage=store();const fetcher=async()=>({ok:true,json:async()=>({a:1})});const cache=createDataCache({storage,fetcher,maxEntries:2});
 for(let i=0;i<4;i++)await cache('k'+i,'/x',1000);assert.equal(storage.length,2);
 const denied=createDataCache({storage:{getItem(){throw Error()},setItem(){throw Error()}},fetcher});assert.deepEqual(await denied('a','/a',1000),{a:1});
});
