const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// The LVC worker builds the public snapshots (warnings, hydro, Kp, marine) on its cron
async function parsers(){
  const src=fs.readFileSync(path.join(__dirname,'..','cloudflare-worker','lvc-meteo-proxy.js'),'utf8');
  return (await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default.parsers;
}

test('Kp: objects and the older row format',async()=>{
  const {parseKp}=await parsers();
  for(const raw of [[{time_tag:'2026-09-13T12:00:00',Kp:2.33},{time_tag:'2026-09-13T15:00:00',Kp:3}],[['time_tag','Kp'],['2026-09-13 15:00:00','3']]]){
    const last=parseKp(JSON.stringify(raw)).readings.at(-1);
    assert.deepEqual(last,{time:'2026-09-13T15:00:00Z',kp:3});
  }
  assert.throws(()=>parseKp('[]'));
});

test('warnings: expired and cancelled ones are left out, polygons of one warning are merged',async()=>{
  const {parseWarnings}=await parsers();
  const entry=(expires,{type='Alert',id='w1',area='Rīga',poly='56.9,24.0 57.0,24.0 57.0,24.2 56.9,24.0'}={})=>
    `<entry><title>Dzeltens &amp; vējš</title><cap:identifier>${id}</cap:identifier><cap:areaDesc>${area}</cap:areaDesc><cap:event>Vējš</cap:event>`+
    `<cap:severity>Moderate</cap:severity><cap:status>Actual</cap:status><cap:message_type>${type}</cap:message_type>`+
    `<cap:expires>${expires}</cap:expires><cap:polygon>${poly}</cap:polygon></entry>`;
  const xml='<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2"><updated>2026-10-09T06:00:00Z</updated>'+
    entry('2000-01-01T00:00:00Z',{id:'old'})+entry('2099-01-01T00:00:00+03:00',{type:'Cancel',id:'c'})+
    entry('2099-01-01T00:00:00+03:00')+entry('2099-01-01T00:00:00+03:00',{poly:'57.1,24.0 57.2,24.0 57.2,24.2 57.1,24.0'})+'</feed>';
  const r=parseWarnings(xml,Date.parse('2026-10-09T08:00:00Z'));
  assert.equal(r.alerts.length,1);
  assert.equal(r.alerts[0].title,'Dzeltens & vējš');
  assert.equal(r.alerts[0].polygons.length,2);
  assert.deepEqual(r.alerts[0].polygons[0][0],[56.9,24]);
  assert.equal(r.alerts[0].url,'https://meteoalarm.org/en/live/');
  assert.equal(r.sourceUpdated,'2026-10-09T06:00:00Z');
  assert.throws(()=>parseWarnings('<html></html>'));
});

test('CSV: quoted commas, doubled quotes and CRLF',async()=>{
  const {csvRows}=await parsers();
  assert.deepEqual(csvRows('ID,NAME\r\n1,"Daugava, Jēkabpils"\r\n2,"Saka ""A"""\r\n'),[{ID:'1',NAME:'Daugava, Jēkabpils'},{ID:'2',NAME:'Saka "A"'}]);
});

test('hydro: local times, newest 48 readings per parameter, stations without data skipped',async()=>{
  const {parseHydro}=await parsers();
  const stations='STATION_ID,NAME,GEOGR1,GEOGR2\nH1,"Daugava, Jēkabpils",25.85,56.5\nH2,Bez datiem,24,57\n';
  const params='ABBREVIATION,LV_DESCRIPTION,EN_DESCRIPTION,MEASUREMENT_UNIT\nHHS,Ūdens līmenis,Water level,cm\n';
  const rows=['STATION_ID,ABBREVIATION,DATETIME,VALUE'];
  const stamp=h=>new Date(Date.UTC(2026,9,8,h)).toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+:\d+:\d+).*/,'$1.$2.$3 $4');
  for(let h=49;h>=0;h--)rows.push(`H1,HHS,${stamp(h)},${100+h}`);   // newest first, like an unsorted source
  rows.push('H1,XXX,2026.10.09 01:00:00,5','H1,HHS,2026.10.10 05:00:00,NA');
  const r=parseHydro(stations,rows.join('\n'),params);
  assert.equal(r.stations.length,1);
  const s=r.stations[0];
  assert.equal(s.name,'Daugava, Jēkabpils');
  assert.equal(s.series.HHS.length,48);
  assert.deepEqual(s.series.HHS.at(-1),['2026-10-10T01:00:00',149]);
  assert.deepEqual(s.series.HHS[0],['2026-10-08T02:00:00',102]);
  assert.deepEqual(r.parameters.HHS,{lv:'Ūdens līmenis',en:'Water level',unit:'cm'});
});

test('marine: gaps stay null, source times are UTC, empty or cut answers fail',async()=>{
  const {parseMarine}=await parsers();
  const answer=records=>JSON.stringify({success:true,result:{records}});
  const r=parseMarine(answer([{Lat:57,Lon:23,Datetime:'2026-09-13T01:00:00',Value:'NA'},{Lat:57,Lon:23,Datetime:'2026-09-13T00:00:00',Value:'0'}]),'wave');
  assert.deepEqual(r.points[0].series,[['2026-09-13T00:00:00+00:00',0],['2026-09-13T01:00:00+00:00',null]]);
  assert.equal(r.kind,'wave');
  assert.throws(()=>parseMarine(answer([]),'wave'));
  assert.throws(()=>parseMarine(answer(Array(14000).fill({})),'wave'));
});

test('cron: due sources oldest first, only one large file per run',async()=>{
  const {dueData}=await parsers();
  const now=Date.parse('2026-10-09T12:00:00Z'),min=60000;
  // Nothing stored yet: light sources plus one large one
  assert.deepEqual(dueData({},now),['warnings','aurora','hydro']);
  // A failing marine source has its check time updated, so it does not block hydro
  const checked={warnings:now-5*min,aurora:now-10*min,hydro:now-40*min,'marine-wave':now-1*min,'marine-temperature':now-300*min,'marine-current':now-250*min};
  assert.deepEqual(dueData(checked,now),['marine-temperature']);
  checked['marine-temperature']=now;
  assert.deepEqual(dueData(checked,now),['marine-current']);
});

test('LVĢMC: stations with history, quoted names, unknown parameters and stations without coordinates left out',async()=>{
  const {parseLvgmc}=await parsers();
  const stations='STATION_ID,NAME,GEOGR1,GEOGR2\n"RIGASLU","Rīga, LU",24.1,56.95\n"DAUGPILS","Daugavpils",26.6,55.87\n"NOPLACE","X",,\n';
  const readings='STATION_ID,ABBREVIATION,DATETIME,VALUE\r\n'+
    '"RIGASLU","TDRY","2026.10.09 11:00:00",8.9\r\n"RIGASLU","TDRY","2026.10.09 10:00:00",8.1\r\n'+
    '"RIGASLU","WNS10","2026.10.09 11:00:00",3.4\r\n"RIGASLU","XXXX","2026.10.09 11:00:00",1\r\n'+
    '"NOPLACE","TDRY","2026.10.09 11:00:00",5\r\n\r\n';
  const r=parseLvgmc(stations,readings);
  assert.equal(r.stations.length,1);
  const riga=r.stations[0];
  assert.deepEqual([riga.id,riga.name,riga.lat,riga.lon],['RIGASLU','Rīga, LU',56.95,24.1]);
  assert.deepEqual(riga.history,[{time:'2026-10-09T10:00:00',airTemp:8.1},{time:'2026-10-09T11:00:00',airTemp:8.9,windSpeed:3.4}]);
  assert.throws(()=>parseLvgmc(stations,'A,B\n1,2\n'),/columns/);
  assert.throws(()=>parseLvgmc(stations,'STATION_ID,ABBREVIATION,DATETIME,VALUE\n'),/No LVĢMC/);
});

test('LVĢMC: history is shortened only when the row would not fit in D1',async()=>{
  const {lvgmcBody}=await parsers();
  const station=(n)=>({id:'S'+n,name:'S',lat:57,lon:24,history:Array.from({length:48},(_,h)=>({time:'2026-10-09T'+String(h%24).padStart(2,'0')+':00:00',airTemp:h,note:'x'.repeat(400)}))});
  const small=JSON.parse(lvgmcBody('t',{updated:'u',stations:[station(1)]}));
  assert.equal(small.stations[0].history.length,48);
  assert.equal(small.ok,true);
  const big=lvgmcBody('t',{updated:'u',stations:Array.from({length:100},(_,i)=>station(i))});
  assert.ok(big.length<=1800000);
  assert.ok(JSON.parse(big).stations[0].history.length<48);
});

test('model run times: newest of a model\'s domains, unknown when one is missing',async()=>{
  const {runTimes,modelRuns,MODEL_DOMAINS}=await parsers();
  assert.deepEqual(runTimes({last_run_initialisation_time:100,last_run_availability_time:200}),{init:100,avail:200});
  assert.deepEqual(runTimes({last_run_modification_time:150}),{init:null,avail:150});
  assert.equal(runTimes(null),null);
  assert.equal(runTimes({last_run_availability_time:0}),null);
  const byDomain=Object.fromEntries([...new Set(Object.values(MODEL_DOMAINS).flat())].map(d=>[d,{init:1,avail:1000}]));
  byDomain.dwd_icon={init:1,avail:1500};
  byDomain.jma_gsm=null;
  const m=modelRuns(byDomain);
  assert.equal(m.icon_seamless,1500);
  assert.equal(m.icon_eu,1000);
  assert.equal(m.jma_seamless,null);
  assert.deepEqual(Object.keys(m).sort(),Object.keys(MODEL_DOMAINS).sort());
});

test('home answer: valid JSON from stored parts, missing parts as null, next cron run',async()=>{
  const {homeText,nextCron}=await parsers();
  assert.equal(nextCron(Date.parse('2026-10-09T10:07:30Z')),'2026-10-09T10:15:00.000Z');
  assert.equal(nextCron(Date.parse('2026-10-09T10:15:00Z')),'2026-10-09T10:30:00.000Z');
  const text=homeText({lvc:'{"stations":[1]}',warnings:'{"ok":true,"alerts":[]}'},'2026-10-09T10:00:20Z',Date.parse('2026-10-09T10:07:30Z'));
  const h=JSON.parse(text);
  assert.deepEqual(h,{ok:true,updated:'2026-10-09T10:00:20Z',next:'2026-10-09T10:15:00.000Z',lvc:{stations:[1]},lvgmc:null,warnings:{ok:true,alerts:[]},runs:null});
  assert.equal(JSON.parse(homeText({},null,0)).updated,null);
});

test('cron: a big file already handled this run holds the other big ones back',async()=>{
  const {dueData}=await parsers();
  const now=Date.parse('2026-10-09T10:00:00Z');
  const due=dueData({},now);
  assert.equal(due.filter(n=>n==='hydro'||n.startsWith('marine')).length,1);
  const after=dueData({},now,1);
  assert.equal(after.filter(n=>n==='hydro'||n.startsWith('marine')).length,0);
  assert.ok(after.includes('warnings')&&after.includes('aurora'));
});
