// Look-book skins (Black Ink, Iron and Ember, Moss Plum): registry, tokens, contrast, fallback, CSS scoping.
// Mocked controller and CSS text only; not live Foundry rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,skinStylesheet,SKIN_TOKEN_NAMES,DEFAULT_SKIN_ID} from '../scripts/appearance.js';

const IDS=['ag-black-ink','ag-iron-ember','ag-moss-plum'];
const ctl=(world,user='')=>createAppearanceController({currentUser:()=>({id:'u',isGM:true}),getSetting:k=>k==='worldSkin'?world:user,setSetting:async()=>{},subscribeSettings:()=>()=>{}});
const tokens=id=>{const v=new Map();ctl(id).applyTo({style:{setProperty:(k,x)=>v.set(k,x)},dataset:{}});return v;};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const lum=c=>{const [r,g,b]=c.map(lin);return .2126*r+.7152*g+.0722*b;};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
const mix=(a,b,p)=>a.map((v,i)=>v*p+b[i]*(1-p));

test('skin list: default unchanged, 19 skins, the three new ones are structural with swatches',()=>{
  const list=ctl('').listSkins();
  assert.equal(DEFAULT_SKIN_ID,'ag-default');assert.equal(list.length,19);assert.equal(list[0].id,'ag-default');
  for(const id of IDS){const s=list.find(x=>x.id===id);assert.ok(s,id);assert.equal(s.structural,true);assert.equal(s.swatch.length,4);assert.match(s.label,/^Ashen Gate — /);}
});
test('look-book colour tokens are ported exactly',()=>{
  const t=tokens('ag-moss-plum');
  assert.equal(t.get('--ag-surface'),'#17201a');assert.equal(t.get('--ag-text'),'#ece8d8');assert.equal(t.get('--ag-accent'),'#d8cba4');
  assert.equal(tokens('ag-black-ink').get('--ag-focus'),'#ffffff');assert.equal(tokens('ag-iron-ember').get('--ag-accent'),'#ff7f32');
});
for(const id of IDS){
  test(`${id}: all tokens present and valid hex`,()=>{
    const t=tokens(id);
    for(const n of SKIN_TOKEN_NAMES)assert.match(t.get(n),/^#[0-9a-f]{6}$/i,n);
    assert.equal(t.get('--ag-bg'),t.get('--ag-surface'));assert.equal(t.get('--ag-panel'),t.get('--ag-surface-raised'));
  });
  test(`${id}: contrast (text 4.5:1, borders and focus 3:1, accent button, soft fills)`,()=>{
    const t=tokens(id),c=k=>rgb(t.get(k));const bad=[];
    for(const bg of ['--ag-surface','--ag-surface-sunken','--ag-surface-raised']){
      for(const fg of ['--ag-text','--ag-muted','--ag-accent','--ag-danger','--ag-ok','--ag-warn'])if(ratio(c(fg),c(bg))<4.5)bad.push(`${fg}/${bg}`);
      if(ratio(c('--ag-focus'),c(bg))<3)bad.push(`focus/${bg}`);
      // Control edges are painted with --ag-border-strong (kit: text 22% over border), as in the look book's own self-check.
      if(ratio(mix(c('--ag-text'),c('--ag-border'),.22),c(bg))<3)bad.push(`control edge/${bg}`);
    }
    if(ratio(c('--ag-accent-contrast'),c('--ag-accent'))<4.5)bad.push('on accent');
    for(const tone of ['accent','ok','warn','danger']){
      const soft=mix(c(`--ag-${tone}`),c('--ag-surface-raised'),.16);
      if(ratio(mix(c(`--ag-${tone}`),c('--ag-text'),.8),soft)<4.5)bad.push(`${tone} ink on soft`);
    }
    assert.deepEqual(bad,[]);
  });
  test(`${id}: stylesheet ships, every selector scoped, no web fonts or remote assets, Compact and Comfortable both defined`,()=>{
    const file=skinStylesheet(id);assert.match(file,/^styles\/skins\/[a-z-]+\.css$/);
    const css=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    const body=css.replace(/\/\*[\s\S]*?\*\//g,'');
    assert.doesNotMatch(body,/@font-face|@import|@keyframes|animation\s*:|url\(|https?:/);
    for(const m of body.matchAll(/([^{}]+)\{/g))for(const sel of m[1].trim().split(/,(?![^(]*\))/))
      assert.ok(/^(:where\()?html\[data-ag-skin="/.test(sel.trim())&&sel.includes(`"${id}"`),sel);
    assert.match(body,/\[data-ag-size="comfortable"\]\s*\{[^}]*--ag-control-h/);
    assert.match(body,/:not\(\[data-ag-size="comfortable"\]\)\s*\{[^}]*--ag-control-h/);
    for(const n of ['--ag-font-body','--ag-radius','--ag-shadow','--ag-space-3'])assert.ok(body.includes(n),n);
  });
}
test('Black Ink is square; Moss Plum takes Moss density and Plum corners/type',()=>{
  const css=id=>readFileSync(new URL(`../${skinStylesheet(id)}`,import.meta.url),'utf8');
  assert.match(css('ag-black-ink'),/--ag-radius-window: 0px/);assert.match(css('ag-black-ink'),/--ag-shadow: none/);
  const mp=css('ag-moss-plum');assert.match(mp,/"Outfit"/);assert.match(mp,/--ag-radius-window: 22px/);assert.match(mp,/--ag-space-4: 11px/);
});
test('unknown or removed skin ids fall back safely, including through a user override',()=>{
  const root={style:{setProperty(){}},dataset:{}};
  assert.equal(ctl('ag-black-ink-v0').applyTo(root).effective,'ag-default');assert.equal(root.dataset.agSkin,'ag-default');
  const s=ctl('ag-iron-ember','ag-gone').getState();assert.equal(s.effective,'ag-iron-ember');assert.equal(s.invalidUser,true);
  assert.equal(skinStylesheet('ag-gone'),null);
});
