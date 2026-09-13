const {test}=require('node:test');
const assert=require('node:assert/strict');
const {insideWarningPolygon,warningsAtPlace}=require('../js/local-warnings');
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
