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
