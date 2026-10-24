// 0.58.0 chat reskin: stylesheet is loaded, scoped to the chat DOM and to html[data-ag-chat], tokens only, setting defaults.
// Proves logic and CSS text with mocked Foundry, not how chat looks in the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,CHAT_KEY,DEFAULT_CHAT,SKIN_TOKEN_NAMES} from '../scripts/appearance.js';
import {collapseItemDescriptions} from '../scripts/chat-style.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../styles/chat.css').replace(/\/\*[\s\S]*?\*\//g,'');
const root=()=>({style:{setProperty(){}},dataset:{}});
const ctl=(chat)=>createAppearanceController({currentUser:()=>({id:'u',isGM:false}),
  getSetting:k=>k==='styleChat'?chat:(k==='worldSkin'?'ag-default':''),setSetting:async()=>{}});

test('chat.css is listed in module.json after the kit',()=>{
  const m=JSON.parse(read('../module.json'));
  assert.ok(m.styles.includes('styles/chat.css'));assert.ok(m.styles.indexOf('styles/ag-ui.css')<m.styles.indexOf('styles/chat.css'));
});
test('every rule is scoped to html[data-ag-chat="on"] and to chat markup',()=>{
  const sels=[...css.matchAll(/([^{}@;]+)\{/g)].map(m=>m[1].trim()).filter(s=>!/^(from|to|\d+%)/.test(s));
  assert.ok(sels.length>40);
  for(const sel of sels){
    for(const part of sel.split(/,(?![^(]*\))/).map(x=>x.trim())){
      if(/^media /.test(part))continue;
      assert.ok(part.startsWith('html[data-ag-chat="on"]'),`unscoped: ${part}`);
      if(part!=='html[data-ag-chat="on"]')assert.match(part,/#chat|\.chat-popout|\.chat-message|#chat-notifications/,`not chat markup: ${part}`);
    }
  }
});
test('colours come from tokens that every skin defines',()=>{
  assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b|\brgba?\(/,'no colour literals');
  const used=new Set([...css.matchAll(/var\((--ag-[a-z0-9-]+)\)/g)].map(m=>m[1]));
  const kitOnly=new Set(['--ag-radius','--ag-radius-sm','--ag-radius-control','--ag-radius-field','--ag-font-body','--ag-font-display','--ag-font-mono','--ag-control-h','--ag-control-h-sm']);
  for(const t of used){if(kitOnly.has(t)||/^--ag-(text|space)-/.test(t))continue;assert.ok(SKIN_TOKEN_NAMES.includes(t),`${t} is not a base skin token`);}
  const kit=read('../styles/ag-ui.css');for(const t of kitOnly)assert.ok(kit.includes(`${t}:`),`${t} missing from kit`);
});
test('buttons are at least 36px, focus ring is visible, reduced motion respected',()=>{
  assert.match(css,/--agc-btn-h:\s*2\.25rem/);assert.match(css,/min-height:\s*var\(--agc-btn-h\)/);
  assert.match(css,/button:not\(\.unbutton\):focus-visible\s*\{\s*outline:\s*3px/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/\.dice-total\.critical::after[\s\S]*content: "Critical"/,'crit has text, not colour only');
});
test('styleChat is a client boolean, on by default, written as data-ag-chat, no migration',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===CHAT_KEY).v;
  assert.equal(CHAT_KEY,'styleChat');assert.equal(s.scope,'client');assert.equal(s.config,false,'lives in My Appearance, not Game Settings');assert.equal(s.type,Boolean);assert.equal(s.default,true);assert.equal(DEFAULT_CHAT,true);
  let r=root();ctl(true).applyTo(r);assert.equal(r.dataset.agChat,'on');
  r=root();ctl(undefined).applyTo(r);assert.equal(r.dataset.agChat,'on','unset reads as on');
  r=root();r.dataset.agChat='on';ctl(false).applyTo(r);assert.equal('agChat' in r.dataset,false);
  assert.equal(r.dataset.agSkin,'ag-default');
});
test('collapseItemDescriptions closes only dnd5e collapsibles, only while chat styling is on',()=>{
  const el=()=>{const c=new Set();return {classList:{add:x=>c.add(x),has:x=>c.has(x)}};};
  const a=el(),html={querySelectorAll:()=>[a]};
  assert.equal(collapseItemDescriptions(html,{dataset:{}}),0);assert.equal(a.classList.has('collapsed'),false);
  assert.equal(collapseItemDescriptions(html,{dataset:{agChat:'on'}}),1);assert.equal(a.classList.has('collapsed'),true);
  assert.equal(collapseItemDescriptions(null,{dataset:{agChat:'on'}}),0);
});
