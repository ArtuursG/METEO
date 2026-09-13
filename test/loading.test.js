const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const els=new Map();
 const el=id=>{if(!els.has(id))els.set(id,{textContent:id==='cityName'?'Riga':'Latvia',style:{},classList:{contains:()=>false},addEventListener(){},setAttribute(){}});return els.get(id)};
 const pending=[],cached=[];
 const ctx=vm.createContext({console,AbortController,URLSearchParams,Date,Number,Math,Set,
 localStorage:{getItem:()=>null},location:{search:''},history:{replaceState(){}},
 document:{getElementById:el,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 t:x=>x,sameLoc:()=>false,clearTimeout,setTimeout,
 fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve})),
 updateMetrics(){},rebuildTempChart(){},buildPrecipCharts(){},buildWindChart(){},buildCloudChart(){},buildUVChart(){},buildTable(){},buildToggles(){},showToast(){},renderFavBtn(){}});
 vm.runInContext(fs.readFileSync('js/core.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('js/data.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('js/locations.js','utf8'),ctx);
 vm.runInContext('showToast=()=>{};updateMetrics=()=>{};setCache=(lat,lon,d)=>recordCache(lat,lon,d);saveRecent=()=>{};renderFavBtn=()=>{};S.data={old:{}};',ctx);
 ctx.recordCache=(...args)=>cached.push(args);
 const run=s=>vm.runInContext(s,ctx);
 const response=value=>({ok:true,json:async()=>({hourly:{time:['2026-09-13'],temperature_2m_ecmwf_ifs025:[value]}})});
 return {ctx,run,pending,cached,response,el};
}
test('late city response cannot replace newer city or cache under its coordinates',async()=>{
 const h=setup();
 const a=h.run("selectCity({latitude:10,longitude:20,name:'A'})");
 const b=h.run("selectCity({latitude:30,longitude:40,name:'B'})");
 assert.equal(h.pending[0].options.signal.aborted,true);
 h.pending[1].resolve(h.response(22));await b;
 h.pending[0].resolve(h.response(11));await a;
 assert.equal(h.run('S.city'),'B');
 assert.equal(h.run('S.data.ecmwf_ifs025.hourly.temperature_2m[0]'),22);
 assert.deepEqual(h.cached.map(x=>x.slice(0,2)),[[30,40],[10,20]]);
});
test('failed latest selection restores committed location, not pending selection',async()=>{
 const h=setup();
 const a=h.run("selectCity({latitude:10,longitude:20,name:'A'})");
 const b=h.run("selectCity({latitude:30,longitude:40,name:'B'})");
 h.pending[1].resolve({ok:false,status:503});await b;
 h.pending[0].resolve(h.response(11));await a;
 assert.equal(h.run('S.city'),'Rīga');
 assert.equal(h.el('cityName').textContent,'Riga');
 assert.equal(h.run('S.data.old!==undefined'),true);
});
test('invalid URL coordinates retain safe defaults',()=>{
 const h=setup();
 for(const query of ['?lat=91&lon=20','?lat=abc&lon=20','?lat=&lon=20','?lat=20&lon=181']){
 h.ctx.location.search=query;h.run('loadFromURL()');assert.equal(h.run('S.lat'),56.946);
 }
 h.ctx.location.search='?lat=0&lon=0';h.run('loadFromURL()');assert.equal(h.run('S.lat'),0);
});
