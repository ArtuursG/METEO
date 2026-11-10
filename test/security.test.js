const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.join(__dirname,'..');
const PAGES=['index.html','stacija.html','stacija-lvgmc.html'];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('every page has the Content-Security-Policy, and it allows its inline scripts by hash',()=>{
  for(const page of PAGES){
    const html=read(page);
    const csp=(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)||[])[1];
    assert.ok(csp,page+' has no Content-Security-Policy');
    assert.match(csp,/object-src 'none'/);
    assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/,page+': inline scripts must be allowed by hash, not unsafe-inline');
    // The policy must come before any script, or it does not cover it
    assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script'),page+': the policy has to come first');
    for(const [,body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
      const hash="'sha256-"+crypto.createHash('sha256').update(body,'utf8').digest('base64')+"'";
      assert.ok(csp.includes(hash),page+': an inline script changed, its hash is not in the policy: '+hash);
    }
  }
});

test('no inline event handlers in the pages (the policy blocks them)',()=>{
  for(const page of PAGES)assert.doesNotMatch(read(page),/\son[a-z]+="/,page);
});

test('Leaflet tooltips and popups get DOM nodes, never strings (a string is inserted as HTML)',()=>{
  const safe=/^(label\b|envNode\(|Object\.assign\(|\(\)\s*=>)/;
  for(const f of fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js'))){
    const src=read('js/'+f);
    for(const [,arg] of src.matchAll(/\.(?:bindTooltip|bindPopup|setTooltipContent|setPopupContent)\(\s*([^,\n]*)/g))
      assert.match(arg.trim(),safe,`${f}: Leaflet content "${arg.trim()}" must be a DOM node`);
  }
});

// Libraries and fonts served from the site's own folder: unchanged copies of the npm packages
// (vendor/README.md). A changed file fails here and shows its new hash.
const VENDOR={
  'vendor/chart.umd.js':'74401d738dd3e03ee5dfb3b6841210fe2c4ead8a960c4011ca4ba0b78a9fd8f3',
  'vendor/leaflet.js':'db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a',
  'vendor/leaflet.css':'a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6',
  'vendor/fonts/plex-mono-latin-400.woff2':'08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7',
  'vendor/fonts/plex-mono-latin-500.woff2':'01d285447409c8a588692162439a038b8cbd7871309ee20267b0d2d91c6e8e22',
  'vendor/fonts/plex-mono-latin-600.woff2':'0d1f0b8d0722224e32e9f28261bdc86c79115be73444ae5eceb73976a1bcdf83',
  'vendor/fonts/plex-mono-latin-ext-400.woff2':'6bc0f226a5b7884a8170e3f62c63d7675609d4631bdc5931b5cdab81821f00eb',
  'vendor/fonts/plex-mono-latin-ext-500.woff2':'6bb06407c97584b0867a959e05e8874693bfeb8c317de190811c51598f2d99ea',
  'vendor/fonts/plex-mono-latin-ext-600.woff2':'32057cf50dd14bdb21a2c93766c4a2c43e4abe688ea3922df3203cac7751a98b',
};

test('vendored libraries and fonts are the pinned files',()=>{
  for(const [file,want] of Object.entries(VENDOR)){
    const got=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    assert.equal(got,want,file+' changed; if that is an upgrade, pin its new sha256');
  }
  const shipped=[...fs.readdirSync(path.join(root,'vendor')).filter(f=>/\.(js|css)$/.test(f)).map(f=>'vendor/'+f),
    ...fs.readdirSync(path.join(root,'vendor/fonts')).filter(f=>f.endsWith('.woff2')).map(f=>'vendor/fonts/'+f)];
  assert.deepEqual(shipped.sort(),Object.keys(VENDOR).sort(),'every file in vendor/ is pinned');
});

test('pages load scripts, styles and fonts only from the site itself',()=>{
  for(const page of PAGES){
    const html=read(page);
    for(const [,url] of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g))
      assert.doesNotMatch(url,/^(?:https?:)?\/\//,page+' loads '+url+' from another server');
    const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
    const of=name=>(csp.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+' '))||'');
    assert.equal(of('font-src'),"font-src 'self'");
    assert.equal(of('style-src'),"style-src 'self' 'unsafe-inline'");
    // The only outside script is the cloud map library, loaded on demand (cloud-map.js)
    assert.deepEqual(of('script-src').split(' ').filter(s=>s.startsWith('http')),['https://cdn.jsdelivr.net/npm/@openmeteo/']);
  }
});

test('the service worker saves every vendored file the pages use',()=>{
  const sw=read('sw.js');
  for(const file of Object.keys(VENDOR))assert.ok(sw.includes("'./"+file),file+' is missing from the service worker list');
  for(const page of PAGES)for(const [,url] of read(page).matchAll(/(?:src|href)="(vendor\/[^"]+)"/g))
    assert.ok(sw.includes("'./"+url+"'"),url+' in '+page+' differs from the service worker list');
});

test('links that open a new window never hand it a handle on the page',()=>{
  for(const f of [...PAGES,...fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')).map(f=>'js/'+f)])
    for(const [tag] of read(f).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g))
      assert.match(tag,/rel="[^"]*noopener/,f+': '+tag);
});

test('every page limits the referrer to the site address',()=>{
  for(const page of PAGES)assert.match(read(page),/<meta name="referrer" content="strict-origin-when-cross-origin">/,page);
});

test('the worker answers only reads, keeps error text to its log and checks the station id',()=>{
  const src=read('cloudflare-worker/lvc-meteo-proxy.js');
  assert.match(src,/request\.method !== "GET" && request\.method !== "HEAD"/);
  assert.match(src,/"X-Content-Type-Options": "nosniff"/);
  // No String(e) inside something that is returned: json({...String(e)...}) or a field of the answer
  assert.doesNotMatch(src,/json\(\{[^}]*String\(e\)/);
  assert.doesNotMatch(src,/extremesError = String\(e\)/);
  assert.match(src,/stationId && !\/\^\[\\w\.:-\]\{1,64\}\$\/\.test\(stationId\)/);
});
