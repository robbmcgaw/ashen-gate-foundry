// Shared UI kit (styles/ag-ui.css) and Manager skins stay in step: the kit's :root defaults are
// the Standard skin, every skin sets every base token, and Manager themes the whole document.
// Proves CSS text and controller logic, not live Foundry rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,SKIN_TOKEN_NAMES,DEFAULT_SKIN_ID} from '../scripts/appearance.js';

const kit=readFileSync(new URL('../styles/ag-ui.css',import.meta.url),'utf8');
const rootBlock=kit.match(/:root \{([^}]*)\}/)[1];
const kitDefaults=Object.fromEntries([...rootBlock.matchAll(/(--ag-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
const controller=skin=>createAppearanceController({currentUser:()=>({id:'u'}),getSetting:k=>k==='worldSkin'?skin:'',setSetting:async()=>{},subscribeSettings:()=>()=>{}});
const applied=skin=>{const values=new Map();const root={style:{setProperty:(k,v)=>values.set(k,v)},dataset:{}};controller(skin).applyTo(root);return {values,root};};

test('kit :root defaults equal the Standard skin, so modules look the same with or without Manager',()=>{
  const {values}=applied(DEFAULT_SKIN_ID);
  const base=SKIN_TOKEN_NAMES.filter(k=>!['--ag-bg','--ag-panel'].includes(k));
  for(const token of base)assert.equal(kitDefaults[token],values.get(token),token);
});
test('every skin sets every base token, including the pre-kit --ag-bg/--ag-panel aliases',()=>{
  const ids=controller(DEFAULT_SKIN_ID).listSkins().map(s=>s.id);
  assert.ok(ids.length>=5);
  for(const id of ids){
    const {values,root}=applied(id);
    assert.equal(root.dataset.agSkin,id);
    for(const token of SKIN_TOKEN_NAMES)assert.match(values.get(token)??'',/^#[0-9a-f]{6}$/,`${id} ${token}`);
    assert.equal(values.get('--ag-bg'),values.get('--ag-surface'));
  }
});
test('skin previews expose four swatch colours but never the token map',()=>{
  for(const skin of controller(DEFAULT_SKIN_ID).listSkins()){
    assert.equal('tokens' in skin,false);
    assert.equal(skin.swatch.length,4);
  }
});
test('Manager applies the skin to the document root and re-applies on change; My Appearance is on the API',()=>{
  const main=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(main,/applyTo\(document\.documentElement\)/);
  assert.match(main,/appearanceController\.subscribe\(applyDocumentSkin\)/);
  assert.match(main,/openMyAppearance:/);
});
test('kit keeps selects from clipping and derives soft colours inside each app',()=>{
  assert.match(kit,/\.ag-app select,[\s\S]*?height: auto !important;/);
  assert.match(kit,/:root, \.ag-app[^{]*\{[^}]*--ag-accent-soft:/);
  assert.doesNotMatch(kit.replace(/:root \{[^}]*\}/,''),/(^|\})\s*(body|html)\s*\{/);
});
