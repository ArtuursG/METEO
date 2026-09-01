// ─── WEATHER: temperature colours, wind direction, icons, date formatting ────

// Returns a CSS class name for temperature colour coding
function tempCls(t){
  if(t==null)return '';
  if(t>=28)return 'tc-hot';
  if(t>=18)return 'tc-warm';
  if(t>=8) return 'tc-cool';
  return 'tc-cold';
}

// Returns a rotated Unicode arrow + direction label; Unicode avoids mobile SVG rendering issues
function wDir(deg){
  if(deg==null)return '-';
  const label=COMPASS[LANG][Math.round(deg/22.5)%16];
  return `<span style="display:inline-block;transform:rotate(${deg}deg);font-size:13px;line-height:1">↑</span> ${label}`;
}

// ─── WEATHER ICONS / TEXT ────────────────────────────────────────────────────
const WICONS={
  clear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="3.9" y1="3.9" x2="5.3" y2="5.3"/><line x1="18.7" y1="18.7" x2="20.1" y2="20.1"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="3.9" y1="20.1" x2="5.3" y2="18.7"/><line x1="18.7" y1="5.3" x2="20.1" y2="3.9"/></svg>',
  partly:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="16.5" cy="6.5" r="2.6"/><line x1="16.5" y1="1.6" x2="16.5" y2="3"/><line x1="21.4" y1="6.5" x2="20" y2="6.5"/><line x1="20" y1="3" x2="19" y2="4"/><path d="M16 19H7.5A4.5 4.5 0 0 1 6.7 10.1 6 6 0 0 1 18 11a4 4 0 0 1-2 8z"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  fog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M4 11h16"/><path d="M6 15h12"/><path d="M5 19h11"/></svg>',
  drizzle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  rain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
  snow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>',
  thunder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>',
};

// Maps WMO weather interpretation codes to icon keys
function wKey(c){
  if(c==null)return null;
  if(c<=1)return 'clear';
  if(c<=3)return 'partly';
  if(c<=9)return 'fog';
  if(c<=19)return 'rain';
  if(c<=29)return 'snow';
  if(c<=49)return 'fog';
  if(c<=59)return 'drizzle';
  if(c<=69)return 'rain';
  if(c<=79)return 'snow';
  if(c<=82)return 'rain';
  if(c<=99)return 'thunder';
  return 'thunder';
}

function wIcon(c){const k=wKey(c);return k?WICONS[k]:'';}
function wText(c){const k=wKey(c);return k?t('wx.'+k):'-';}

// Formats an ISO datetime string to short date label used on chart x-axis
function fmtHour(isoStr){
  const d=new Date(isoStr);
  return d.toLocaleDateString(LOCALE,{month:'short',day:'numeric'});
}

// Formats an ISO date string to a localised weekday + date for the forecast table
function fmtDate(isoStr){
  const d=new Date(isoStr);
  const wd=d.toLocaleDateString(LOCALE,{weekday:'long'});
  return `<span class="dl">${wd[0].toUpperCase()+wd.slice(1)}</span> ${d.toLocaleDateString(LOCALE,{day:'numeric',month:'long'})}`;
}
