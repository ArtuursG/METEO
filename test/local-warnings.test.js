const {test}=require('node:test');
const assert=require('node:assert/strict');
const {insideWarningPolygon,warningsAtPlace,warningTitle,warningArea,groupWarnings}=require('../js/local-warnings');
const polygon=[[56,23],[57,23],[57,24],[56,24],[56,23]];
test('CAP latitude-longitude polygons include boundaries and exclude other locations',()=>{
 assert.equal(insideWarningPolygon(56.5,23.5,polygon),true);
 assert.equal(insideWarningPolygon(56,23.5,polygon),true);
 assert.equal(insideWarningPolygon(23.5,56.5,polygon),false);
 assert.equal(insideWarningPolygon(57.1,23.5,polygon),false);
});
test('local warnings reject expired or unlocated alerts and prioritize severity',()=>{
 const base={polygons:[polygon],expires:'2026-09-14T00:00:00Z'};
 const alerts=[{...base,severity:'Moderate'},{...base,severity:'Extreme'}, {...base,expires:'2020-01-01T00:00:00Z'}, {...base,polygons:[]}];
 assert.deepEqual(warningsAtPlace(alerts,56.5,23.5,Date.parse('2026-09-13T00:00:00Z')).map(a=>a.severity),['Extreme','Moderate']);
});

test('MeteoAlarm titles and areas in Latvian, unknown ones as sent',()=>{
 assert.equal(warningTitle('Yellow Wind Warning','lv'),'Dzeltenais brīdinājums: vējš');
 assert.equal(warningTitle('Orange Snow-Ice Warning','lv'),'Oranžais brīdinājums: sniegs un apledojums');
 assert.equal(warningTitle('Yellow Wind Warning','en'),'Yellow Wind Warning');
 assert.equal(warningTitle('Something else','lv'),'Something else');
 assert.equal(warningArea('Kekava municipality','lv'),'Ķekavas novads');
 assert.equal(warningArea('Riga','lv'),'Rīga');
 assert.equal(warningArea('Gulf of Riga West','lv'),'Rīgas jūras līča rietumu daļa');
 assert.equal(warningArea('Unknown place','lv'),'Unknown place');
 assert.equal(warningArea('Kekava municipality','en'),'Kekava municipality');
});
test('warnings split per area are merged into one, duplicates and expired ones dropped',()=>{
 const w=(area,extra={})=>({event:'Yellow Wind Warning',severity:'Moderate',onset:'2026-10-09T11:00:00+00:00',expires:'2026-10-10T03:00:00+00:00',areaDesc:area,polygons:area==='Riga'?[polygon]:[],...extra});
 const alerts=[w('Riga'),w('Jurmala'),w('Riga',{identifier:'other'}),
  w('Central Baltic East',{event:'Orange Wind Warning',severity:'Severe',onset:'2026-10-09T09:00:00+00:00'}),
  w('Old',{expires:'2026-10-01T00:00:00Z'})];
 const g=groupWarnings(alerts,Date.parse('2026-10-08T18:00:00Z'));
 assert.equal(g.length,2);
 assert.equal(g[0].severity,'Severe','most severe first');
 assert.deepEqual(g[1].areas,['Riga','Jurmala']);
 assert.equal(g[1].polygons.length,2,'polygons of every entry are kept for the map');
});
