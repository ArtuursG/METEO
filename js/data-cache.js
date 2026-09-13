// Bounded persistent cache with request coalescing and a short error cooldown.
function createDataCache({storage,fetcher=fetch,now=Date.now,maxEntries=12}={}){
 const memory=new Map(),pending=new Map(),failed=new Map(),prefix='env1_';
 function read(key){try{return JSON.parse(storage?.getItem(prefix+key)||'null');}catch{return null;}}
 function write(key,item){try{
  storage?.setItem(prefix+key,JSON.stringify(item));
  const keys=[];for(let i=0;i<(storage?.length||0);i++){const k=storage.key(i);if(k?.startsWith(prefix))keys.push(k);}
  keys.sort((a,b)=>(JSON.parse(storage.getItem(a))?.saved||0)-(JSON.parse(storage.getItem(b))?.saved||0));
  while(keys.length>maxEntries)storage.removeItem(keys.shift());
 }catch{}}
 return async function cached(key,url,ttl){
  const hit=memory.get(key)||read(key);
  if(hit&&now()-hit.saved<ttl)return hit.data;
  if(pending.has(key))return pending.get(key);
  if(now()-(failed.get(key)||-Infinity)<60000)throw new Error('Please retry later');
  const work=(async()=>{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();if(data.error||data.ok===false)throw new Error('Source unavailable');
    const item={saved:now(),data};memory.set(key,item);while(memory.size>maxEntries)memory.delete(memory.keys().next().value);write(key,item);failed.delete(key);return data;
   }catch(e){failed.set(key,now());if(failed.size>maxEntries)failed.delete(failed.keys().next().value);throw e;}
   finally{clearTimeout(timer);pending.delete(key);}
  })();pending.set(key,work);return work;
 };
}
if(typeof module!=='undefined')module.exports={createDataCache};
