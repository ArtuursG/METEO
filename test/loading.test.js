const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const els=new Map();
 const el=id=>{if(!els.has(id))els.set(id,{textContent:id==='cityName'?'Riga':'Latvia',style:{},classList:{contains:()=>false},addEventListener(){},setAttribute(){}});return els.get(id)};
 const pending=[],store=new Map();
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),
  key:i=>[...store.keys()][i]??null,get length(){return store.size;}};
 const ctx=vm.createContext({console,AbortController,DOMException,URLSearchParams,Date,Number,Math,Set,Promise,JSON,
 localStorage,location:{search:''},history:{replaceState(){}},
 document:{getElementById:el,addEventListener(){},body:{classList:{add(){},remove(){}}}},
 t:x=>x,sameLoc:()=>false,clearTimeout,setTimeout,
 fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve})),
 updateMetrics(){},rebuildTempChart(){},buildPrecipCharts(){},buildWindChart(){},buildCloudChart(){},buildUVChart(){},buildTable(){},buildToggles(){},showToast(){},renderFavBtn(){}});
 vm.runInContext(fs.readFileSync('js/core.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('js/forecast-sync.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('js/data.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('js/locations.js','utf8'),ctx);
 vm.runInContext('showToast=()=>{};updateMetrics=()=>{};saveRecent=()=>{};renderFavBtn=()=>{};S.data={old:{}};',ctx);
 const run=s=>vm.runInContext(s,ctx);
 // Every load asks for the models and, separately, for the ECMWF "now" values
 const answer=(url,value)=>url.includes('current=')
  ?{utc_offset_seconds:0,current:{temperature_2m:value},daily:{time:['2026-09-13'],sunrise:['2026-09-13T06:00'],sunset:['2026-09-13T19:00']}}
  :{utc_offset_seconds:0,hourly:{time:['2026-09-13T00:00'],temperature_2m_ecmwf_ifs025:[value]},daily:{time:['2026-09-13'],temperature_2m_max_ecmwf_ifs025:[value]}};
 const respond=(job,value)=>job.resolve({ok:true,json:async()=>answer(job.url,value)});
 const saved=(lat,lon)=>JSON.parse(store.get(`wx8_${lat.toFixed(3)}_${lon.toFixed(3)}`)||'null');
 return {ctx,run,pending,respond,saved,el};
}
test('late city response cannot replace newer city or be saved under its coordinates',async()=>{
 const h=setup();
 const a=h.run("selectCity({latitude:10,longitude:20,name:'A'})");
 const b=h.run("selectCity({latitude:30,longitude:40,name:'B'})");
 assert.equal(h.pending.length,4);
 assert.equal(h.pending[0].options.signal.aborted,true);
 h.respond(h.pending[2],22);h.respond(h.pending[3],22);await b;
 h.respond(h.pending[0],11);h.respond(h.pending[1],11);await a;
 assert.equal(h.run('S.city'),'B');
 assert.equal(h.run('S.data.ecmwf_ifs025.hourly.temperature_2m[0]'),22);
 assert.equal(h.run('S.data.ecmwf_ifs025.current.temperature_2m'),22);
 assert.equal(h.saved(30,40).models.ecmwf_ifs025.hourly.temperature_2m[0],22);
 // The aborted answer for A is not saved at all
 assert.equal(h.saved(10,20),null);
});
test('failed latest selection restores committed location, not pending selection',async()=>{
 const h=setup();
 const a=h.run("selectCity({latitude:10,longitude:20,name:'A'})");
 const b=h.run("selectCity({latitude:30,longitude:40,name:'B'})");
 h.pending[2].resolve({ok:false,status:503});h.pending[3].resolve({ok:false,status:503});await b;
 h.respond(h.pending[0],11);h.respond(h.pending[1],11);await a;
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
