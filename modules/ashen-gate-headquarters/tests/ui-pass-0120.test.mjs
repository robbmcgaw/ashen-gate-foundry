// 0.12.0 UI pass: header, tabs, GM Setup's one Save Changes (D4), confirms, labels and tooltips.
// Mocked Foundry globals; proves the wiring and markup, not the live window or its look.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,applyOperation} from '../js/logic.mjs';
import {setupChanges,configPayload,rankRulesPayload,SETUP_FORM} from '../js/setup-form.mjs';
import {facilitiesPanel,listFacilitiesTab,facilityRow,DEV_ACTIONS} from '../js/facilities-tab.mjs';

const hooks={once:{},on:{}};
const warnings=[],writes=[];
let dialog=null,answer='cancel';
const gm={id:'gm',isGM:true,active:true,name:'GM'};
const step=(s,op,p={})=>applyOperation(s,gm,op,p);
let state=step(emptyState(),'activate',{hq_ref:'HQ-TEST-001',location_ref:'LOC-TEST-001',campaign_key:'test',guild_key:'primary'});
state=step(state,'load_demo');state=step(state,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
state=step(state,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_test0000000001'});
state=step(state,'lock');
state=step(state,'install',{room_key:'common',key:'copy_test0000000001',x:0,y:0,expected_shared_revision:state.core.headquarters_states[0].shared_revision});
state=step(state,'unlock_editor');
const settings=new Map([['ashen-gate-headquarters.playerAccessEnabled',true],['ashen-gate-headquarters.state',state]]);
const vault={id:'vault',ownership:{default:0},flags:{},update:async d=>{writes.push({vault:d});}};
globalThis.foundry={applications:{api:{
  ApplicationV2:class{constructor(o){this.options=o;}render(){}close(){}},
  HandlebarsApplicationMixin:B=>class extends B{},
  DialogV2:{wait:async o=>{dialog=o;return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialog=o;}}
}}};
globalThis.Hooks={once:(k,f)=>{hooks.once[k]=f;},on:(k,f)=>{(hooks.on[k]??=[]).push(f);return k;},off:()=>{}};
globalThis.ui={notifications:{warn:m=>warnings.push(m),info:()=>{},error:m=>warnings.push(m)}};
globalThis.document={querySelectorAll:()=>[]};
let menu;
const mod={id:'ashen-gate-headquarters',version:'0.14.0'};
globalThis.game={user:gm,users:Object.assign(new Map([['gm',gm]]),{activeGM:gm}),modules:{get:()=>mod},
  settings:{register:()=>{},registerMenu:(_m,_k,o)=>{menu=o;},get:(m,k)=>structuredClone(settings.get(`${m}.${k}`)),set:async(m,k,v)=>{writes.push({[k]:v});settings.set(`${m}.${k}`,v);}},
  keybindings:{register:()=>{}},journal:{contents:[],get:()=>null},items:{contents:[]},actors:{contents:[]}};
globalThis.JournalEntry={create:async d=>Object.assign(vault,d,{id:'vault'})};
await import('../js/main.mjs');
hooks.once.init();
await hooks.once.ready();
const code=readFileSync(new URL('../js/main.mjs',import.meta.url),'utf8');
const app=()=>{const a=new menu.type();clearInterval(a.leaseTimer);return a;};
const read=()=>game.modules.get().api.getState();
/** FormData stand-in: the setup form's current values. */
const formValues=(s,over={})=>{const v={name:s.config.name,width:String(s.config.bounds.width),height:String(s.config.bounds.height),background:s.config.background,background_fit:s.config.background_fit,
  background_x:String(s.config.background_x),background_y:String(s.config.background_y),background_opacity:String(s.config.background_opacity)};
  for(const r of s.config.rank_rules){v[`slots_${r.rank}`]=String(r.shared_facility_slots);v[`orders_${r.rank}`]=String(r.orders_per_downtime);v[`unlock_${r.rank}`]=r.unlock_refs.join(', ');}
  if(settings.get('ashen-gate-headquarters.playerAccessEnabled'))v.player_access_enabled='on';
  return Object.assign(v,over);};
const data=v=>({get:k=>k in v&&v[k]!==undefined?v[k]:null});
globalThis.FormData=class{constructor(form){this.v=form.values;}get(k){return k in this.v&&this.v[k]!==undefined?this.v[k]:null;}entries(){return Object.entries(this.v);}};
const submitSetup=async values=>{writes.length=0;warnings.length=0;const form={dataset:{aghqForm:SETUP_FORM},values};
  await app().submit({target:{closest:()=>form},preventDefault(){}});};

test('setupChanges: an unchanged form writes nothing; each section is only included when it changed',()=>{
  const s=read();
  assert.deepEqual(setupChanges(s,true,data(formValues(s))),{});
  assert.deepEqual(setupChanges(s,true,data(formValues(s,{player_access_enabled:undefined}))),{access:false});
  assert.deepEqual(Object.keys(setupChanges(s,true,data(formValues(s,{name:'[TEST] Hall'})))),['config']);
  assert.deepEqual(Object.keys(setupChanges(s,true,data(formValues(s,{slots_3:'4'})))),['rules']);
  assert.equal(configPayload(data(formValues(s,{width:'30'}))).width,30);
  assert.deepEqual(rankRulesPayload(data(formValues(s,{unlock_2:'FAC-A, ,FAC-B'})))[1].unlock_refs,['FAC-A','FAC-B']);
});

test('D4: GM Setup has one Save Changes for Player Access, settings and ranks; Cancel bottom-left',()=>{
  const a=app();a.tab='manage';const html=a.page(read());
  assert.equal((html.match(/type="submit"/g)??[]).length,1,'one submit');
  assert.match(html,new RegExp(`<form class="aghq-setup" data-aghq-form="${SETUP_FORM}">`));
  const form=html.slice(html.indexOf(`data-aghq-form="${SETUP_FORM}"`));
  for(const n of ['player_access_enabled','name','background_fit','slots_1','orders_5','unlock_3'])assert.ok(form.includes(`name="${n}"`),n);
  assert.ok(!/Save Player Access|data-aghq-form="(player-access|config|ranks)"/.test(html),'no separate saves');
  const footer=html.slice(html.indexOf('<footer class="ag-footer">'));
  assert.ok(footer.indexOf('data-action="cancel-setup"')<footer.indexOf('ag-btn--primary'),'Cancel left of Save');
  assert.match(footer,/class="ag-btn ag-btn--primary">.*Save Changes<\/button>/);
  assert.match(html,/<details class="ag-devtools[^"]*"><summary>Developer Tools<\/summary>/);
  for(const x of DEV_ACTIONS)assert.ok(html.indexOf(`data-action="${x}"`)>html.indexOf('ag-devtools'),`${x} inside Developer Tools`);
});

test('D4: ticking Player Access does nothing until Save Changes; the footer says there is something to save',()=>{
  const listeners={};const status={textContent:"",dataset:{}};
  const formEl={querySelector:()=>status};
  const checkbox={closest:sel=>sel.startsWith('form')?formEl:null,matches:()=>false};
  const a=app();a.element={querySelector:()=>status};a.bind({dataset:{},addEventListener:(k,f)=>{listeners[k]=f;}});
  writes.length=0;
  listeners.change({target:checkbox});listeners.input({target:checkbox});
  assert.equal(writes.length,0,'no write on change');
  assert.equal(status.textContent,'Unsaved changes');
});

test('D4: Save Changes writes only Player Access when only it changed (same setting key)',async()=>{
  await submitSetup(formValues(read(),{player_access_enabled:undefined}));
  assert.deepEqual(writes,[{playerAccessEnabled:false}]);
  assert.equal(warnings.length,0);
  await submitSetup(formValues(read(),{player_access_enabled:'on'}));
  assert.deepEqual(writes,[{playerAccessEnabled:true}]);
});

test('D4: Save Changes writes settings and ranks; an unchanged form writes nothing',async()=>{
  await submitSetup(formValues(read()));
  assert.equal(writes.length,0,'nothing changed');
  await submitSetup(formValues(read(),{name:'[TEST] Hall',slots_2:'3'}));
  assert.equal(warnings.length,0,warnings.join());
  assert.equal(read().config.name,'[TEST] Hall');
  assert.equal(read().config.rank_rules[1].shared_facility_slots,3);
  assert.ok(!writes.some(w=>'playerAccessEnabled' in w),'Player Access untouched');
});

test('players cannot save GM Setup',async()=>{
  const values=formValues(read(),{name:'[TEST] Hacked'});const player={id:'p1',isGM:false,active:true,name:'Player'};game.user=player;
  try{await submitSetup(values);}finally{game.user=gm;}
  assert.notEqual(read().config.name,'[TEST] Hacked');
  assert.ok(warnings.length>0);
});

test('Uninstall asks first (danger, verb label); Cancel writes nothing',async()=>{
  const a=app();a.selectedCopy='copy_test0000000001';
  const btn={dataset:{action:'uninstall'}};
  answer='cancel';writes.length=0;dialog=null;
  await a.click({target:{closest:sel=>sel==='button'?btn:null},preventDefault(){}},{querySelector:()=>null});
  assert.ok(dialog.classes.includes('ag-dialog--danger'));
  assert.deepEqual(dialog.buttons.map(b=>b.label),['Cancel','Uninstall facility']);
  assert.equal(dialog.window.title,'Uninstall Demo Forge?');
  assert.ok(dialog.buttons.find(b=>b.action==='cancel').default,'Cancel is the default (confirmDanger)');
  assert.equal(writes.length,0);
  assert.equal(read().core.headquarters_states[0].installations.length,1);
});

test('Cancel in GM Setup re-renders and writes nothing',async()=>{
  const a=app();let rendered=0;a.render=()=>{rendered++;};writes.length=0;
  await a.click({target:{closest:sel=>sel==='button'?{dataset:{action:'cancel-setup'}}:null},preventDefault(){}},{querySelector:()=>null});
  assert.equal(rendered,1);assert.equal(writes.length,0);
});

test('header: brand title, no subtitle, version and ghost Help; no Alpha; the Guildhall summary is on the board',()=>{
  const a=app();const html=a.page(read());
  assert.match(html,/<div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate<\/span> \| Headquarters<\/h1><\/div>/);
  assert.match(html,/<div class="aghq-boardhead"><strong>\[TEST\] Hall<\/strong><span>Guild rank 1 · 1\/2 shared facilities · 2 orders per downtime/);
  assert.match(html,/<span class="ag-version">v0\.14\.0<\/span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help">/);
  assert.ok(!/Alpha/.test(html));
});

test('tabs: role=tab with aria-selected, icons hidden, GM tabs last and marked',()=>{
  const a=app();const html=a.page(read());
  const tabs=[...html.matchAll(/<button type="button" role="tab" id="aghq-tab-([a-z]+)" data-tab="\1" aria-selected="(true|false)" aria-controls="aghq-panel" tabindex="(0|-1)" class="([^"]*)"><i class="fa-solid [a-z-]+" aria-hidden="true"><\/i>/g)].map(m=>[m[0],m[1],m[2],m[4],m[3]]);
  assert.deepEqual(tabs.map(t=>t[1]),['builder','quarters','benefits','hirelings','facilities','manage']);
  assert.deepEqual(tabs.filter(t=>t[3].includes('ag-tab--gm')).map(t=>t[1]),['hirelings','facilities','manage']);
  assert.deepEqual(tabs.filter(t=>t[4]==='0').map(t=>t[1]),['builder'],'one Tab stop (roving tabindex)');
  assert.match(html,/<main class="aghq-body" id="aghq-panel" role="tabpanel" aria-labelledby="aghq-tab-builder">/);
  assert.deepEqual(tabs.filter(t=>t[2]==='true').map(t=>t[1]),['builder']);
  assert.ok(!/\.aghq-content button\.active/.test(readFileSync(new URL('../styles/headquarters.css',import.meta.url),'utf8')));
});

test('builder: Font Awesome tile icons, labelled zoom buttons with tooltips, kit footer',()=>{
  const a=app();a.selectedCopy='copy_test0000000001';const html=a.page(read());
  for(const z of ['out','in'])assert.match(html,new RegExp(`class="ag-btn ag-btn--icon ag-btn--sm" data-action="zoom-${z}" aria-label="Zoom ${z}" data-tooltip="Zoom ${z}" data-tooltip-class="ag-tooltip"`));
  assert.match(html,/<i class="fa-solid fa-hammer aghq-tile-icon" aria-hidden="true">/);
  assert.match(code,/data-action="uninstall" class="ag-btn ag-btn--sm ag-btn--danger"/);
  assert.match(html,/<footer class="ag-footer"><span class="ag-footer__status" role="status">Auto-saved · View only<\/span><button type="button" class="ag-btn" data-action="take-lock">/);
  for(const g of ['⚒','✎','▣','♙','>−<','>+<'])assert.ok(!code.includes(g),`glyph ${g}`);
  assert.ok(!/<button\b[^>]*\stitle=/.test(code));
  assert.ok(!code.includes("'fas "),'legacy fas prefix');
});

test('every button in the window code carries a kit class (tab and radio buttons are kit-styled by their strip)',()=>{
  const src=code+readFileSync(new URL('../js/facilities-tab.mjs',import.meta.url),'utf8');
  // Board pieces and decoration art are canvas buttons with their own look (aghq-tile, aghq-decoration*).
  const bare=[...src.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).filter(b=>!/class="[^"]*ag-btn/.test(b)&&!/role="(tab|radio)"/.test(b)&&!/class="aghq-(tile|decoration|decoration-card)\b/.test(b));
  assert.deepEqual(bare,[]);
});

test('Facilities: kit toolbar, grouped rows with badges; Developer Tools are not here',()=>{
  const rows=[facilityRow({id:'FAC-TEST-1',name:'[TEST] One',placements:['shared'],stages:[{}]},{unlocked:true,owned:1})];
  const html=facilitiesPanel({},listFacilitiesTab(rows));
  assert.match(html,/<div class="ag-toolbar"><label class="ag-search">/);

  assert.match(html,/<ul class="ag-rows"><li class="ag-row aghq-catalogrow">/);
  assert.match(html,/<span class="ag-badge ag-badge--ok">Acquired<\/span>/);
  for(const x of DEV_ACTIONS)assert.ok(!html.includes(`data-action="${x}"`));
  assert.match(facilitiesPanel({},listFacilitiesTab([])),/class="ag-empty".*No facility definitions yet\./);
});

test('empty states use the kit; players see no GM instructions or ids',()=>{
  const s=read();const player={id:'p1',isGM:false,active:true,name:'Player'};game.user=player;
  try{
    const a=app();
    a.tab='quarters';const q=a.quarters(s);
    assert.match(q,/class="ag-empty".*No personal rooms yet\..*Ask your GM to create player rooms\./);
    assert.ok(!q.includes('add-rooms'),'players get no Create missing player rooms');
    assert.equal(a.hirelings(s),'','players get no Hirelings panel');
    assert.ok(!a.page(s).includes('data-tab="hirelings"'),'HQ-06: no Hirelings tab for players');
    const b=a.builder(s,false).replace(/<[^>]*>/g,' ');assert.ok(!/copy_test|FAC-DEMO/.test(b),'no ids in player-visible text');
  }finally{game.user=gm;}
});

test('window opens through windowSize (1.2× in Comfortable)',()=>{
  assert.match(code,/import \{windowSize,[^}]*\} from '\.\/ag-html\.mjs'/);
  assert.match(code,/super\(\{\.\.\.options,position:\{\.\.\.windowSize\(HeadquartersApp\.DEFAULT_OPTIONS\.position\)/);
});
