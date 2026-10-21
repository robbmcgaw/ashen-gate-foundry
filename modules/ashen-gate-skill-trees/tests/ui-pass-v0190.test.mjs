import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {edgeLine} from '../scripts/graph.mjs';
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
globalThis.game={modules:new Map([[MODULE,{id:MODULE,active:true,version:'0.19.3'}]]),settings:{
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
const setupDom=checked=>{const box={checked},status={textContent:''};
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

test('Data tools: migrations are their own card and ask first; Developer Tools keeps only QA install and reset',async()=>{
  const tpl=await read('../templates/tree.hbs');
  const setup=tpl.slice(tpl.indexOf('{{#if activeSetup}}\n'));
  const data=setup.slice(setup.indexOf('aria-label="Data tools"'),setup.indexOf('<details class="ag-devtools">'));
  const dev=setup.slice(setup.indexOf('<details class="ag-devtools">'),setup.indexOf('</details>'));
  for(const act of ['ledger-import','legacy-preview','legacy-clear'])assert.match(data,new RegExp(`data-act="${act}"`),act),assert.doesNotMatch(dev,new RegExp(`data-act="${act}"`),act);
  assert.deepEqual([...dev.matchAll(/data-act="([^"]+)"/g)].map(m=>m[1]),['qa-install','qa-reset']);
  assert.doesNotMatch(dev,/Cinder|Profession/,'dev-tools copy names no setting content');
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
  assert.deepEqual(tabs,[['tab-trees',false],['tab-library',true],['tab-setup',true]]);
  const lib=tpl.slice(tpl.indexOf('{{#if activeLibrary}}\n'),tpl.indexOf('{{#if activeSetup}}\n'));
  const bar=lib.slice(lib.indexOf('<div class="ag-toolbar">'),lib.indexOf('<section'));
  const order=['class="ag-search"','class="ag-toolbar__count"','class="ag-toolbar__end"','data-act="create-tree"'].map(x=>bar.indexOf(x));
  assert.ok(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])),'search, count, then New tree on the right');
  assert.match(bar,/data-act="create-tree" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> New tree/);
  assert.doesNotMatch(tpl,/>(LEVEL|TO CHOOSE|USED|AWARDED|AVAILABLE|UNLOCKED|SELECTED PERK)</);
  assert.match(tpl,/<small class="ag-eyebrow">To choose<\/small>/);
});

test('tooltips: no title= on buttons or nodes; reset zoom is a labelled rotate-left icon button',async()=>{
  const [tpl,src]=await Promise.all([read('../templates/tree.hbs'),read('../scripts/main.js')]);
  assert.doesNotMatch(tpl,/\stitle=/);
  assert.doesNotMatch(src,/<(button|li|span|div)\b[^>]*\stitle=/);
  const node=tpl.slice(tpl.indexOf('<button type="button" class="agst-node'),tpl.indexOf('</button>',tpl.indexOf('<button type="button" class="agst-node')));
  assert.doesNotMatch(node,/title=|data-tooltip=/,'the corner card is the only node tooltip');
  assert.match(tpl,/data-act="zoom-reset" data-tooltip="Reset zoom" data-tooltip-class="ag-tooltip" aria-label="Reset zoom"><i class="fa-solid fa-rotate-left" aria-hidden="true"><\/i><\/button>/);
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

test('full node names: no line clamp or ellipsis; nodes keep width, grow in height, and edges meet the taller border',async()=>{
  const css=await read('../styles/trees.css');
  assert.doesNotMatch(css,/line-clamp|text-overflow\s*:\s*ellipsis/);
  assert.match(css,/button\.agst-node\{[^}]*width:181px;min-height:67px;height:auto/);
  assert.match(css,/\.agst-size-compact button\.agst-node\{width:132px;min-height:46px/);
  assert.doesNotMatch(css,/--agst-(bg|panel|border|text|muted|accent):/,'no kit token re-aliases');
  const {w}=NODE_SIZES.compact;
  const a={x:0,y:0},b={x:0,y:300};
  const short=edgeLine(a,b,'compact'),tall=edgeLine({...a,h:90},b,'compact');
  assert.equal(short.d,`M ${w/2} ${46+3} L ${w/2} ${300-3}`);
  assert.equal(tall.d,`M ${w/2} ${90+3} L ${w/2} ${300-3}`,'a measured height moves the start to the real bottom border');
  assert.equal(edgeLine({...a,h:10},b,'compact').d,short.d,'never smaller than the default box');
});

test('dialog forms and tables use kit parts',async()=>{
  const src=await read('../scripts/main.js');
  assert.doesNotMatch(src,/agst-form|agst-resolve-table|agst-prereq-table|<label>/);
  assert.match(src,/<div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Perk<\/th>/);
  assert.match(src,/<div class="ag-form-grid agst-dialog">/);
});
