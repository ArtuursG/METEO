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
