// 0.42.0: shared UI kit 2.0.0. Size setting (Compact / Comfortable) owned by Manager, the html[data-ag-size] attribute,
// the Size switch markup, windowSize() and the skins' shape tokens. Proves logic and CSS text with mocked Foundry, not the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,SIZE_KEY,SIZES,DEFAULT_SIZE,listSizes,APPEARANCE_CONTRACT} from '../scripts/appearance.js';
import {bindSkinPicker} from '../scripts/skin-picker.js';
import {windowSize,COMFORTABLE_SCALE} from '../scripts/ag-html.mjs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const VERSION='0.44.3';

// One browser: client settings live per device, world/user settings are shared.
function device(user,{world=new Map([['worldSkin','ag-default']]),client=new Map()}={}){
  const writes=[];
  const c=createAppearanceController({currentUser:()=>user,
    getSetting:k=>k===SIZE_KEY?client.get(k)??DEFAULT_SIZE:world.get(k)??'',
    setSetting:async(k,v)=>{writes.push(k);if(k===SIZE_KEY)client.set(k,v);else if(k==='worldSkin'){if(!user.isGM)throw Error('denied');world.set(k,v);}},
    subscribeSettings:()=>()=>{}});
  return {c,client,writes};
}
const root=()=>({style:{setProperty(){}},dataset:{}});

test('uiSize is registered as a hidden client setting with compact/comfortable choices, default compact',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({n,k,v})}},namespace:'ashen-gate-manager'});
  const size=reg.find(r=>r.k===SIZE_KEY);
  assert.equal(SIZE_KEY,'uiSize');assert.deepEqual(SIZES,['compact','comfortable']);
  assert.equal(size.n,'ashen-gate-manager');assert.equal(size.v.scope,'client');assert.equal(size.v.config,false);
  assert.equal(size.v.type,String);assert.deepEqual(Object.keys(size.v.choices),['compact','comfortable']);
  assert.equal(size.v.default,'compact');assert.equal('restricted' in size.v,false,'any user may change it');
  const seen=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>{if(k===SIZE_KEY)v.onChange('comfortable');}}},namespace:'x',onSettingChange:(k,v)=>seen.push([k,v])});
  assert.deepEqual(seen,[[SIZE_KEY,'comfortable']],'onChange feeds the controller (noteChange)');
});

test('applyTo writes data-ag-size for comfortable and removes it for compact',async()=>{
  const {c}=device({id:'p'}),r=root();
  c.applyTo(r);assert.equal('agSize' in r.dataset,false,'compact is the kit default: no attribute');
  await c.setSize('comfortable');c.applyTo(r);assert.equal(r.dataset.agSize,'comfortable');
  await c.setSize('compact');c.applyTo(r);assert.equal('agSize' in r.dataset,false);
  assert.equal(r.dataset.agSkin,'ag-default','skin attribute still written');
});

test('size is per device: a client setting, not shared through world or user settings',async()=>{
  const world=new Map([['worldSkin','ag-default']]);
  const laptop=device({id:'robb',isGM:true},{world}),phone=device({id:'robb',isGM:true},{world});
  await phone.c.setSize('comfortable');
  assert.equal(phone.c.getState().size,'comfortable');assert.equal(laptop.c.getState().size,'compact');
  assert.deepEqual(phone.writes,[SIZE_KEY]);assert.deepEqual([...world.keys()],['worldSkin']);
});

test('a non-GM player can set their own size; signed-out callers and unknown sizes are refused',async()=>{
  const {c,client}=device({id:'player',isGM:false});
  const state=await c.setSize('comfortable');assert.equal(state.size,'comfortable');assert.equal(client.get(SIZE_KEY),'comfortable');
  await assert.rejects(c.setSize('huge'),/Unknown Ashen Gate size/);
  await assert.rejects(c.setSize('__proto__'),/Unknown/);
  assert.equal(client.get(SIZE_KEY),'comfortable','nothing written on a refused value');
  const anon=device({}).c;await assert.rejects(anon.setSize('compact'),/authenticated/);
});

test('an unknown or missing stored size falls back to compact without rewriting it',()=>{
  for(const stored of ['huge','',undefined,null,42]){
    const client=new Map([[SIZE_KEY,stored]]);const {c}=device({id:'p'},{client});const r=root();
    assert.equal(c.getState().size,'compact',String(stored));c.applyTo(r);assert.equal('agSize' in r.dataset,false);
    assert.equal(client.get(SIZE_KEY),stored);
  }
  // An unregistered setting (older world, setting not ready) reads as compact instead of throwing.
  const c=createAppearanceController({currentUser:()=>({id:'p'}),getSetting:k=>{if(k===SIZE_KEY)throw Error('not registered');return '';},setSetting:async()=>{}});
  assert.equal(c.getState().size,'compact');
});

test('state keeps every existing field and adds size; contract unchanged; noteChange covers the size key',()=>{
  const {c}=device({id:'p'});const s=c.getState();
  assert.equal(APPEARANCE_CONTRACT,'ag-appearance/0.1-beta');
  for(const k of ['contract','worldDefault','userOverride','effective','source','invalidWorld','invalidUser','size'])assert.ok(k in s,k);
  let n=0;c.subscribe(()=>n++);c.noteChange(SIZE_KEY,'comfortable');assert.equal(n,1);assert.equal(c.getState().size,'comfortable');
  assert.deepEqual(listSizes('comfortable'),[{id:'compact',label:'Compact',selected:false},{id:'comfortable',label:'Comfortable',selected:true}]);
  assert.deepEqual(c.listSizes().map(x=>x.selected),[false,true]);
  assert.deepEqual(listSizes('nonsense').map(x=>x.selected),[true,false]);
});

test('Size switch: a two-option radiogroup in My Appearance and the GM popover with the agreed copy',()=>{
  for(const [path,key,list] of [['../templates/my-appearance.hbs','my','sizes'],['../templates/manager.hbs','gm','appearanceSizes']]){
    const t=read(path);
    assert.match(t,new RegExp(`<span id="ag-size-label-${key}">Size</span>`));
    assert.match(t,new RegExp(`class="ag-segmented" role="radiogroup" aria-labelledby="ag-size-label-${key}"[^>]*data-ag-size-picker="${key}"`));
    assert.match(t,new RegExp(`\\{\\{#each ${list}\\}\\}<button type="button" role="radio" aria-checked=`));
    assert.match(t,/data-ag-size-value="\{\{id\}\}">\{\{label\}\}<\/button>/);
    assert.match(t,/Comfortable makes text and controls larger on this device only\./);
  }
  const my=read('../templates/my-appearance.hbs');
  assert.ok(my.indexOf('data-ag-size-picker')>my.indexOf('data-ag-skin-picker="my"'),'under the skin cards');
  const main=read('../scripts/main.js');
  assert.match(main,/bindSizePicker\(root\.querySelector\('\[data-ag-size-picker="gm"\]'\)\)/);
  assert.match(main,/bindSizePicker\(this\.element\.querySelector\('\[data-ag-size-picker="my"\]'\)/);
  assert.match(main,/appearanceController\.setSize\(value\)/);
  assert.match(main,/\{valueKey:'agSizeValue'\}/);
  assert.match(main,/listSizes:\(\)=>appearanceController\.listSizes\(\),\s*setSize:value=>appearanceController\.setSize\(value\)/);
});

test('the Size switch reuses the skin picker keys and reports the size value',()=>{
  const listeners={};const attrs=[new Map(),new Map()];
  const radios=['compact','comfortable'].map((v,i)=>({dataset:{agSizeValue:v},setAttribute:(k,x)=>attrs[i].set(k,x),focus(){},closest:()=>radios[i]}));
  const group={querySelectorAll:()=>radios,contains:()=>true,addEventListener:(t,f)=>{listeners[t]=f;}};
  const got=[];bindSkinPicker(group,v=>got.push(v),{valueKey:'agSizeValue'});
  listeners.keydown({target:radios[0],key:'ArrowRight',preventDefault(){}});
  listeners.click({target:radios[0],preventDefault(){}});
  assert.deepEqual(got,['comfortable','compact']);assert.equal(attrs[0].get('aria-checked'),'true');assert.equal(attrs[1].get('aria-checked'),'false');
});

test('windowSize scales by 1.2 at Comfortable, is unchanged at Compact, and fits the viewport',()=>{
  const doc=size=>({documentElement:{dataset:size?{agSize:size}:{}}});
  const view={innerWidth:1600,innerHeight:900};
  assert.equal(COMFORTABLE_SCALE,1.2);
  assert.deepEqual(windowSize({width:1020,height:820},{doc:doc(),view}),{width:1020,height:820});
  assert.deepEqual(windowSize({width:1020,height:620},{doc:doc('comfortable'),view}),{width:1224,height:744});
  assert.deepEqual(windowSize({width:1020,height:820},{doc:doc('comfortable'),view}),{width:1224,height:900},'clamped to the viewport');
  assert.deepEqual(windowSize({width:'auto',height:400},{doc:doc('comfortable'),view:{}}),{width:'auto',height:480});
  assert.deepEqual(windowSize({width:500},{doc:null,view:null}),{width:500,height:undefined});
  const main=read('../scripts/main.js');
  assert.match(main,/import \{windowSize\} from "\.\/ag-html\.mjs";/);
  assert.match(main,/super\(\{\.\.\.options,position:\{\.\.\.windowSize\(AshenGateManager\.DEFAULT_OPTIONS\.position\),\.\.\.options\.position\}\}\)/);
});

test('kit 2: both size sets carry the same tokens; skins set the shape tokens; Manager rarity moved to the kit',()=>{
  const kit=read('../styles/ag-ui.css');
  assert.match(kit,/^\/\* ag-ui kit 2\.1\.0 \*\/\n/);
  const names=block=>[...block.matchAll(/(--ag-[a-z0-9-]+):/g)].map(m=>m[1]);
  const comfy=names(kit.match(/html\[data-ag-size="comfortable"\] \{([^}]*)\}/)[1]);
  const root=names(kit.match(/:root \{([^}]*)\}/)[1]);
  assert.ok(comfy.length>=19);for(const n of comfy)assert.ok(root.includes(n),n);
  assert.ok(!comfy.some(n=>n.includes('radius')),'shape is not size');
  for(const [token,value] of [['--ag-control-h','28px'],['--ag-radius-control','999px'],['--ag-radius-window','16px'],['--ag-radius-field','10px'],['--ag-row-h','32px']])
    assert.match(kit,new RegExp(`${token}: ${value};`));
  for(const [file,value] of [['stone-tablet','1px'],['tome-pages','3px']]){
    const css=read(`../styles/skins/${file}.css`);
    for(const t of ['--ag-radius-control','--ag-radius-window'])assert.match(css,new RegExp(`${t}: ${value};`),`${file} ${t}`);
    assert.doesNotMatch(css,/\.ag-slot[^{]*\{[^}]*border-radius/,`${file}: slots stay circles`);
  }
  assert.match(kit,/\.ag-slot \{[^}]*border-radius: 50%/);
  assert.doesNotMatch(read('../styles/manager.css'),/:root\{--ag-rarity/);
});

test(`docs and version ${VERSION} are consistent`,()=>{
  const manifest=JSON.parse(read('../module.json'));
  assert.equal(manifest.version,VERSION);
  assert.match(manifest.download,new RegExp(`ashen-gate-manager-v${VERSION.replaceAll('.','\\.')}/ashen-gate-manager\\.zip$`));
  // 0.43.0: the header and window title read the version from module.json at runtime; nothing typed in.
  assert.match(read('../templates/manager.hbs'),/<span class="ag-version">v\{\{version\}\}<\/span>/);
  assert.match(read('../scripts/main.js'),/version: game\.modules\.get\(MODULE_ID\)\?\.version \?\? ''/);
  assert.match(read('../scripts/main.js'),/title:"Ashen Gate \| General Manager", icon/);
  assert.match(read('../CHANGELOG.md'),new RegExp(`^## ${VERSION.replaceAll('.','\\.')} `));
  assert.match(read('../CHANGELOG.md'),/Shared UI kit 2\.0\.0: rounded compact look for shared parts, Comfortable size option \(General Manager → My Appearance\), shared dialog helper\./);
});
