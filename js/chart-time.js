// ─── CLOCK TIMES: local or UTC ───
// Clock times show in local time, or in UTC when TIME_UTC is on (the "UTC" button in the header;
// synoptic work runs on UTC). Day names, dates and the daily table stay local days.
let TIME_UTC=false;
try{TIME_UTC=localStorage.getItem('time_utc')==='1';}catch{}
function setTimeUtc(on){TIME_UTC=!!on;try{localStorage.setItem('time_utc',on?'1':'0');}catch{}}
// The zone Open-Meteo's wall-clock times are in (the place's, from the answer, data.js)
let PLACE_ZONE='Europe/Riga';
const utcMark=()=>TIME_UTC?' UTC':'';
// toLocale* options for an instant: the visitor's own clock, or UTC
const clockZone=()=>TIME_UTC?{timeZone:'UTC'}:{};
const _zoneFormats=new Map();
// Offset of a time zone at an instant (ms), from Intl, so summer time is right
function zoneOffsetMs(zone,ms){
 let f=_zoneFormats.get(zone);
 if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'});_zoneFormats.set(zone,f);}
 const p={};for(const x of f.formatToParts(new Date(ms)))p[x.type]=+x.value;
 return Date.UTC(p.year,p.month-1,p.day,p.hour%24,p.minute,p.second)-ms;
}
// The instant of a wall-clock time in a zone; two passes settle the summer time change
function wallToMs(wallAsUtc,zone){
 try{const first=wallAsUtc-zoneOffsetMs(zone,wallAsUtc);return wallAsUtc-zoneOffsetMs(zone,first);}catch{return wallAsUtc;}
}
// Unzoned wall-clock strings are shown as they are (or converted from `timeZone`, default the
// place's, to UTC); absolute instants in `timeZone` (or the visitor's zone), or in UTC.
function chartDate(value,timeZone){
 const text=String(value);
 const wall=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(text);
 if(!wall)return {date:new Date(value),zone:TIME_UTC?'UTC':timeZone};
 const asUtc=Date.parse(text.length===10?text+'T00:00:00Z':text+'Z');
 if(!TIME_UTC||text.length===10)return {date:new Date(asUtc),zone:'UTC'};
 return {date:new Date(wallToMs(asUtc,timeZone||PLACE_ZONE)),zone:'UTC'};
}
function chartTimeLabel(value,locale='lv-LV',timeZone){
 const {date,zone}=chartDate(value,timeZone);if(!Number.isFinite(date.getTime()))return ['-','-'];
 const options=zone?{timeZone:zone}:{};
 return [date.toLocaleDateString(locale,{...options,day:'numeric',month:'short'}),date.toLocaleTimeString(locale,{...options,hour:'2-digit',minute:'2-digit'})];
}
function chartTimeTitle(value,locale='lv-LV',timeZone){
 const {date,zone}=chartDate(value,timeZone);if(!Number.isFinite(date.getTime()))return '-';
 return date.toLocaleString(locale,{...(zone?{timeZone:zone}:{}),year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+utcMark();
}
if(typeof module!=='undefined')module.exports={chartTimeLabel,chartTimeTitle,zoneOffsetMs,wallToMs,setTimeUtc,setPlaceZone:z=>{PLACE_ZONE=z;}};
