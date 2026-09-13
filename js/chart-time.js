// Preserve unzoned source wall-clock timestamps; convert absolute instants explicitly.
function chartDate(value,timeZone){
 const text=String(value);
 const wall=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(text);
 const date=new Date(wall?(text.length===10?text+'T00:00:00Z':text+'Z'):value);
 return {date,zone:wall?'UTC':timeZone};
}
function chartTimeLabel(value,locale='lv-LV',timeZone){
 const {date,zone}=chartDate(value,timeZone);if(!Number.isFinite(date.getTime()))return ['-','-'];
 const options=zone?{timeZone:zone}:{};
 return [date.toLocaleDateString(locale,{...options,day:'numeric',month:'short'}),date.toLocaleTimeString(locale,{...options,hour:'2-digit',minute:'2-digit'})];
}
function chartTimeTitle(value,locale='lv-LV',timeZone){
 const {date,zone}=chartDate(value,timeZone);if(!Number.isFinite(date.getTime()))return '-';
 return date.toLocaleString(locale,{...(zone?{timeZone:zone}:{}),year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
if(typeof module!=='undefined')module.exports={chartTimeLabel,chartTimeTitle};
