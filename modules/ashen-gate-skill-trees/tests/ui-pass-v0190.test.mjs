import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {edgeLine,RING} from '../scripts/graph.mjs';
import {NODE_SIZES} from '../scripts/appearance.mjs';

// 0.19.0 UI pass: D4 Player Access saved by Save Changes, Data tools confirm first, one node tooltip, full node names (mocked Foundry).
const MODULE='ashen-gate-skill-trees';
let constructed=null;
class FakeApplication{static DEFAULT_OPTIONS={};constructor(options){constructed=options;}render(){return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),writes=[],defs=new Map(),values=new Map(),flagWrites=[];
const store={flags:{[MODULE]:{privateStore:true,payload:{schema:'ag-skill-trees/0.2',trees:[]}}},setFlag:async(...a)=>{flagWrites.push(a);}};
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML:x=>x,randomID:()=>'r'}};
globalThis.document={documentElement:{dataset:{agSize:'comfortable'}},createElement:tag=>({tag,className:'',textContent:'',children:[],append(...c){this.children.push(...c);}})};
globalThis.game={modules:new Map([[MODULE,{id:MODULE,active:true,version:'0.28.1'}]]),settings:{
  register:(_m,key,def)=>defs.set(key,def),registerMenu:()=>{},
  get:(_m,key)=>values.has(key)?values.get(key):({treeData:{schema:'ag-skill-trees/0.1',trees:[{id:'OLD',name:'[TEST] Old tree',nodes:[]}]},publicTreesV2:{schema:'ag-skill-trees/0.2',trees:[]}})[key]??defs.get(key)?.default,
  set:async(_m,key,value)=>{writes.push([key,value]);values.set(key,value);return value;}
},journal:{contents:[store]},actors:{contents:[],get:()=>null},items:{contents:[]},user:{isGM:true,id:'gm'},users:{contents:[]}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const app=game.modules.get(MODULE).api.open();
const click=act=>app._clicked({target:{closest:()=>({dataset:{act}})}});
/** Fake GM Setup DOM: the Player Access checkbox and the footer status. */
const setupDom=checked=>{const box={checked},status={textContent:'',dataset:{}};
  app.element={querySelector:s=>s==='[data-agst-setup] [name="playerAccessEnabled"]'?box:s==='[data-agst-setup-status]'?status:null};return {box,status};};
const read=p=>fs.readFile(new URL(p,import.meta.url),'utf8');

test('window opens 1.2x larger when the kit size is Comfortable (windowSize)',()=>{
  assert.deepEqual(constructed.position,{width:1344,height:888});
});

test('D4: changing Player Access writes nothing; Cancel drops it; Save Changes writes the same setting key',async()=>{
  values.set('playerAccessEnabled',true);writes.length=0;
  const {box,status}=setupDom(true);
  box.checked=false;app._onSetupChange();
  assert.equal(status.textContent,'Unsaved changes');
  assert.deepEqual(writes,[],'a checkbox change is not saved');
  await click('setup-cancel');
  assert.deepEqual(writes,[],'Cancel writes nothing');
  assert.equal(app._setupDraft,null);
  box.checked=false;app._onSetupChange();
  await click('setup-save');
  assert.deepEqual(writes,[['playerAccessEnabled',false]]);
  assert.equal(app._setupDraft,null);
  writes.length=0;await click('setup-save');
  assert.deepEqual(writes,[],'saving unchanged values writes nothing');
  box.checked=true;await click('setup-save');
  assert.deepEqual(writes,[['playerAccessEnabled',true]]);
});

test('0.20.0: leaving GM Setup with unsaved changes asks first (kit guardDirty); Keep editing stays, Discard leaves',async()=>{
  values.set('playerAccessEnabled',true);writes.length=0;
  app.activeTab='setup';const {box}=setupDom(true);
  box.checked=false;app._onSetupChange();
  let seen=[];const answer=action=>{foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);return o.buttons.find(b=>b.action===action).callback();}};};
  answer('cancel');await click('tab-library');
  assert.equal(app.activeTab,'setup','Keep editing stays on GM Setup');
  assert.equal(seen[0].window.title,'Discard unsaved changes?');
  assert.deepEqual(seen[0].buttons.map(b=>[b.label,Boolean(b.default)]),[['Keep editing',true],['Discard changes',false]]);
  answer('confirm');await click('tab-library');
  assert.equal(app.activeTab,'library');assert.equal(app._setupDraft,null);assert.deepEqual(writes,[],'discarding writes nothing');
  seen=[];await click('tab-trees');assert.equal(seen.length,0,'no question when nothing is unsaved');
});

test('D4: Save Changes is GM only, and the old instant toggle is gone',async()=>{
  game.user.isGM=false;
  await assert.rejects(()=>app._saveSetup({playerAccessEnabled:false}),/GM only/);
  game.user.isGM=true;
  const [tpl,src]=await Promise.all([read('../templates/tree.hbs'),read('../scripts/main.js')]);
  assert.doesNotMatch(tpl+src,/toggle-player-access/);
  const setup=tpl.slice(tpl.indexOf('{{#if activeSetup}}\n'));
  assert.match(setup,/<input type="checkbox" name="playerAccessEnabled"/);
  assert.match(setup,/<footer class="ag-footer">\s*<button type="button" class="ag-btn ag-btn--ghost" data-act="setup-cancel">Cancel<\/button>\s*<span class="ag-footer__status" role="status"[^>]*>[^<]*(\{\{[^}]+\}\}[^<]*)*<\/span>\s*<button type="button" class="ag-btn ag-btn--primary" data-act="setup-save">/);
});

test('Data tools: migrations live in Tree Library > Checks & maintenance; GM Setup keeps Player access and Developer Tools (QA only)',async()=>{
  const tpl=await read('../templates/tree.hbs');
  const lib=tpl.slice(tpl.indexOf('{{#if activeLibrary}}\n'),tpl.indexOf('{{#if activeSetup}}\n'));
  const setup=tpl.slice(tpl.indexOf('{{#if activeSetup}}\n'));
  const checks=lib.slice(lib.indexOf('{{{libraryPanel.checks}}}'));
  const data=checks.slice(checks.indexOf('aria-label="Older saved data"'),checks.indexOf('aria-label="Publication and backups"'));
  const dev=setup.slice(setup.indexOf('<details class="ag-devtools">'),setup.indexOf('</details>'));
  for(const act of ['ledger-import','legacy-preview','legacy-clear'])assert.match(data,new RegExp(`data-act="${act}"`),act),assert.doesNotMatch(setup,new RegExp(`data-act="${act}"`),act);
  assert.match(data,/Migrate legacy trees \(\{\{legacy\}\}\)…/,'the button says it migrates');
  assert.deepEqual([...setup.matchAll(/data-act="([^"]+)"/g)].map(m=>m[1]),['qa-install','qa-reset','setup-cancel','setup-save']);
  assert.deepEqual([...dev.matchAll(/data-act="([^"]+)"/g)].map(m=>m[1]),['qa-install','qa-reset']);
  assert.doesNotMatch(dev,/Cinder|Profession/,'dev-tools copy names no setting content');
  // ST-16: the Player access card renders before GM storage exists; Developer Tools waits for it.
  assert.ok(setup.indexOf('name="playerAccessEnabled"')<setup.indexOf('{{#if initialized}}'));
  // ST-18: Republish is a secondary action next to the backup.
  assert.match(checks,/<button type="button" class="ag-btn" data-act="publish">[^<]*<i[^>]*><\/i> Republish player view<\/button>/);
  assert.doesNotMatch(lib,/data-act="publish"[^>]*ag-btn--primary|ag-btn--primary[^>]*data-act="publish"/);
});

test('Data tools: Cancel on the legacy migration and the legacy clear changes nothing',async()=>{
  let seen=[];foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);return o.buttons.find(b=>b.action==='cancel').callback();}};
  writes.length=0;flagWrites.length=0;
  await app._legacyPreview();
  await app._legacyClear();
  assert.deepEqual(seen.map(o=>o.window.title),['Migrate legacy trees?','Clear the legacy public setting?']);
  assert.deepEqual(seen.map(o=>o.buttons.map(b=>b.label)),[['Cancel','Migrate trees'],['Cancel','Back up and clear']]);
  assert.deepEqual(writes,[]);assert.deepEqual(flagWrites,[]);
});

test('header, tabs and toolbar follow the standard',async()=>{
  const tpl=await read('../templates/tree.hbs');
  assert.match(tpl,/<header class="ag-header">\s*<div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate<\/span> \| Skill Trees<\/h1><\/div>\s*<div class="ag-header__meta"><span class="ag-version">v\{\{moduleVersion\}\}<\/span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-act="help">/);
  assert.match(tpl,/<nav class="ag-tabs ag-tabs--scroll" role="tablist"/);
  const tabs=[...tpl.matchAll(/<button type="button" role="tab" data-act="(tab-[a-z]+)" class="([^"]*)" aria-selected=/g)].map(m=>[m[1],m[2].includes('ag-tab--gm')]);
  assert.deepEqual(tabs,[['tab-professions',false],['tab-cinders',false],['tab-library',true],['tab-setup',true]]);
  const lib=tpl.slice(tpl.indexOf('{{#if activeLibrary}}\n'),tpl.indexOf('{{#if activeSetup}}\n'));
  const bar=lib.slice(lib.indexOf('<div class="ag-toolbar">'),lib.indexOf('<section'));
  const order=['class="ag-search"','class="ag-toolbar__count"','class="ag-toolbar__end"','data-act="create-tree"'].map(x=>bar.indexOf(x));
  assert.ok(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])),'search, count, then New tree on the right');
  assert.match(bar,/data-act="create-tree" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> New tree/);
  assert.doesNotMatch(tpl,/>(LEVEL|TO CHOOSE|USED|AWARDED|AVAILABLE|UNLOCKED|SELECTED PERK)</);
  assert.match(tpl,/<small class="ag-eyebrow">To choose<\/small>/);
});

test('tooltips: no title= on buttons or nodes; fit-to-window zoom is a labelled expand icon button',async()=>{
  const [tpl,src]=await Promise.all([read('../templates/tree.hbs'),read('../scripts/main.js')]);
  assert.doesNotMatch(tpl,/\stitle=/);
  assert.doesNotMatch(src,/<(button|li|span|div)\b[^>]*\stitle=/);
  const node=tpl.slice(tpl.indexOf('<button type="button" class="agst-node'),tpl.indexOf('</button>',tpl.indexOf('<button type="button" class="agst-node')));
  assert.doesNotMatch(node,/title=|data-tooltip=/,'the corner card is the only node tooltip');
  assert.match(tpl,/data-act="zoom-reset" data-tooltip="Fit tree to window" data-tooltip-class="ag-tooltip" aria-label="Fit tree to window"><i class="fa-solid fa-expand" aria-hidden="true"><\/i><\/button>/);
  assert.doesNotMatch(tpl,/⟲|fa-regular/);
  for(const m of tpl.matchAll(/<button\b[^>]*class="[^"]*ag-btn--icon[^"]*"[^>]*>/g))assert.match(m[0],/aria-label="[^"]+"[\s\S]*|data-tooltip="[^"]+"/,m[0]),assert.match(m[0],/data-tooltip=/,m[0]);
});

test('corner tip uses kit badge tones (ok for unlocked, accent for available)',()=>{
  const card={hidden:true,children:[],replaceChildren(...c){this.children=c;},append(...c){this.children.push(...c);}};
  app.element={querySelector:s=>s==='.agst-tip'?card:null};
  app._tips={A:{name:'A',status:'Unlocked',statusKey:'unlocked',costText:'1 point'},B:{name:'B',status:'Available',statusKey:'available'},C:{name:'C',status:'Locked',statusKey:'locked',reason:'Needs A'}};
  const badge=()=>card.children[0].children[1].className;
  app._showTip('A');assert.equal(badge(),'ag-badge ag-badge--ok');
  app._showTip('B');assert.equal(badge(),'ag-badge ag-badge--accent');
  app._showTip('C');assert.equal(badge(),'ag-badge');
  assert.equal(card.hidden,false);
});

test('icon nodes (0.23.0): no text on the board nodes, the old footprint is kept, and edges stop at the icon ring',async()=>{
  const css=await read('../styles/trees.css');
  assert.doesNotMatch(css,/line-clamp|text-overflow\s*:\s*ellipsis/);
  assert.match(css,/button\.agst-node\{[^}]*width:181px;height:67px/);
  assert.match(css,/\.agst-size-compact button\.agst-node\{width:132px;height:46px/);
  assert.match(css,/button\.agst-node\{[^}]*pointer-events:none/,'only the icon takes the pointer');
  assert.doesNotMatch(css,/--agst-(bg|panel|border|text|muted|accent):/,'no kit token re-aliases');
  const {w,h,icon}=NODE_SIZES.compact;
  const a={x:0,y:0},b={x:0,y:300};
  const reach=icon/2+RING+3;
  assert.equal(edgeLine(a,b,'compact').d,`M ${w/2} ${h/2+reach} L ${w/2} ${300+h/2-reach}`);
  assert.equal(edgeLine({...a,h:90},b,'compact').d,edgeLine(a,b,'compact').d,'a node has a fixed size now, so a measured height changes nothing');
});

test('dialog forms and tables use kit parts',async()=>{
  const src=await read('../scripts/main.js');
  assert.doesNotMatch(src,/agst-form|agst-resolve-table|agst-prereq-table|<label>/);
  assert.match(src,/<div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Perk<\/th>/);
  assert.match(src,/<div class="ag-form-grid agst-dialog">/);
});
