// Open-Meteo timestamps are local wall-clock strings; compare in its UTC offset.
function forecastWindow(data,hours,nowMs=Date.now()){
 const out={};
 for(const [id,src] of Object.entries(data)){
  const now=new Date(nowMs+(src.utcOffset||0)*1000).toISOString().slice(0,13)+':00';
  const end=new Date(nowMs+(src.utcOffset||0)*1000+hours*3600000).toISOString().slice(0,13)+':00';
  const filterBlock=(block,daily)=>{
   if(!block?.time)return block;
   const indices=[];
   block.time.forEach((time,i)=>{
    const inRange=daily?time>=now.slice(0,10)&&(hours===Infinity||time<end.slice(0,10)):time>=now&&(hours===Infinity||time<end);
    if(inRange)indices.push(i);
   });
   return Object.fromEntries(Object.entries(block).map(([k,v])=>[k,Array.isArray(v)?indices.map(i=>v[i]):v]));
  };
  out[id]={...src,hourly:filterBlock(src.hourly,false),daily:filterBlock(src.daily,true)};
 }
 return out;
}
if(typeof module!=='undefined')module.exports={forecastWindow};
