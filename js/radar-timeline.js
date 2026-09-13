// Touch-friendly frame navigation; a native range input also supports keyboards.
const radarControl=document.querySelector('.radar-ctrl');
radarControl.classList.add('timeline');
const frameSlider=$('radarSlider');
frameSlider.setAttribute('aria-label',uiText('Radara laiks','Radar time'));
const timelineHeading=document.createElement('div');timelineHeading.className='timeline-heading';
const timelineLabel=document.createElement('strong');timelineLabel.textContent=uiText('Nokrišņu kustība','Precipitation movement');
timelineHeading.append(timelineLabel,$('radarTime'));radarControl.prepend(timelineHeading);
const timelineEnds=document.createElement('div');timelineEnds.className='timeline-ends';radarControl.append(timelineEnds);
const timelineActions=document.createElement('div');timelineActions.className='timeline-actions';
function timelineButton(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=action;timelineActions.append(b);return b;}
function stopRadarPlayback(){if(_rTimer){clearInterval(_rTimer);_rTimer=null;} $('radarPlayBtn').textContent='▶';$('radarPlayBtn').setAttribute('aria-label',uiText('Atskaņot radaru','Play radar'));$('radarPlayBtn').setAttribute('aria-pressed','false');}
function seekRadar(index){stopRadarPlayback();if(!_rFrames.length)return;showRadarFrame(Math.max(0,Math.min(_rFrames.length-1,index)));updateRadarUI();}
const prevFrame=timelineButton('‹',uiText('Iepriekšējais kadrs','Previous frame'),()=>seekRadar(_rIdx-1));
timelineActions.append($('radarPlayBtn'));
const nextFrame=timelineButton('›',uiText('Nākamais kadrs','Next frame'),()=>seekRadar(_rIdx+1));
const latestFrame=timelineButton(uiText('Jaunākais novērojums','Latest observation'),uiText('Jaunākais novērojums','Latest observation'),()=>seekRadar(_rFrames.reduce((last,f,i)=>f.time*1000<=Date.now()?i:last,0)));
const speed=document.createElement('select');speed.setAttribute('aria-label',uiText('Animācijas ātrums','Playback speed'));
for(const [ms,label] of [[1000,uiText('Lēni','Slow')],[600,uiText('Vidēji','Medium')],[300,uiText('Ātri','Fast')]]){const o=document.createElement('option');o.value=ms;o.textContent=label;speed.append(o);}speed.value=600;timelineActions.append(speed);radarControl.append(timelineActions);
radarTogglePlay=function(){if(_rTimer){stopRadarPlayback();return;}if(_rFrames.length<2)return;$('radarPlayBtn').textContent='⏸';$('radarPlayBtn').setAttribute('aria-label',uiText('Apturēt radaru','Pause radar'));$('radarPlayBtn').setAttribute('aria-pressed','true');_rTimer=setInterval(()=>{showRadarFrame((_rIdx+1)%_rFrames.length);updateRadarUI();},Number(speed.value));};
speed.onchange=()=>{if(_rTimer){stopRadarPlayback();radarTogglePlay();}};
frameSlider.addEventListener('input',()=>{stopRadarPlayback();updateRadarUI();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRadarPlayback();});
const frameUI=updateRadarUI;
updateRadarUI=function(){frameUI();const available=_rFrames.length>0;frameSlider.disabled=!available;prevFrame.disabled=!available||_rIdx===0;nextFrame.disabled=!available||_rIdx===_rFrames.length-1;latestFrame.disabled=!available;$('radarPlayBtn').disabled=_rFrames.length<2;
 if(!available){timelineEnds.textContent=uiText('Gaidām radara datus','Waiting for radar data');return;}
 const fmt=f=>new Date(f.time*1000).toLocaleTimeString(LOCALE,{hour:'2-digit',minute:'2-digit'});
 timelineEnds.replaceChildren();for(const text of [fmt(_rFrames[0]),(_rIdx+1)+' / '+_rFrames.length+uiText(' kadri',' frames'),fmt(_rFrames.at(-1))]){const span=document.createElement('span');span.textContent=text;timelineEnds.append(span);}
 frameSlider.setAttribute('aria-valuetext',$('radarTime').textContent);frameSlider.style.setProperty('--progress',100*_rIdx/Math.max(1,_rFrames.length-1)+'%');
};
stopRadarPlayback();updateRadarUI();
function refreshControlLabels(){
 mapButtons.radar.textContent=uiText('Nokrišņi','Precipitation');mapButtons.lvc.textContent=uiText('LVC stacijas','LVC stations');mapButtons.lvgmc.textContent=uiText('LVĢMC stacijas','LVĢMC stations');
 opacityLabel.firstChild.textContent=uiText('Nokrišņu slāņa redzamība ','Radar opacity ');opacity.setAttribute('aria-label',uiText('Nokrišņu slāņa redzamība','Radar opacity'));
 const buttons=toolbar.querySelectorAll('button');buttons[3].textContent=uiText('Visa Latvija','All Latvia');buttons[4].textContent=uiText('Izvēlētā pilsēta','Selected city');
 timelineLabel.textContent=uiText('Nokrišņu kustība','Precipitation movement');frameSlider.setAttribute('aria-label',uiText('Radara laiks','Radar time'));
 prevFrame.setAttribute('aria-label',uiText('Iepriekšējais kadrs','Previous frame'));nextFrame.setAttribute('aria-label',uiText('Nākamais kadrs','Next frame'));latestFrame.textContent=uiText('Jaunākais novērojums','Latest observation');latestFrame.setAttribute('aria-label',latestFrame.textContent);
 speed.setAttribute('aria-label',uiText('Animācijas ātrums','Playback speed'));[...speed.options].forEach((o,i)=>o.textContent=(LANG==='en'?['Slow','Medium','Fast']:['Lēni','Vidēji','Ātri'])[i]);
 $('radarPlayBtn').setAttribute('aria-label',_rTimer?uiText('Apturēt radaru','Pause radar'):uiText('Atskaņot radaru','Play radar'));rangeCopy();updateRadarUI();
}
