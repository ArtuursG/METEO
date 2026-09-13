const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('wind embeds load on demand, replace providers and unload on location changes',()=>{
 const frames=[];
 const node=()=>({textContent:'',setAttribute(){},replaceChildren(){},querySelectorAll:()=>buttons});
 const buttons=['windy','ventusky'].map(provider=>({...node(),dataset:{windMap:provider}}));
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const ctx=vm.createContext({URLSearchParams,Number,Math,$,S:{lat:56.95,lon:24.11,city:'Rīga'},envText:(lv)=>lv,document:{querySelectorAll:()=>buttons,createElement:()=>{const frame={remove(){frames.splice(frames.indexOf(frame),1);}};frames.push(frame);return frame;}}});
 vm.runInContext(fs.readFileSync('js/wind-map.js','utf8'),ctx);
 vm.runInContext('refreshWindMap()',ctx);assert.equal(frames.length,0);
 $('windMapToggle').onclick();assert.equal(frames.length,1);assert.equal(new URL(frames[0].src).hostname,'embed.windy.com');
 buttons[1].onclick();assert.equal(frames.length,1);assert.equal(new URL(frames[0].src).hostname,'embed.ventusky.com');
 ctx.S.lat=57.2;vm.runInContext('refreshWindMap()',ctx);assert.equal(frames.length,0);
 $('windMapToggle').onclick();assert.equal(frames.length,1);
 vm.runInContext('closeWindMap()',ctx);assert.equal(frames.length,0);
});
