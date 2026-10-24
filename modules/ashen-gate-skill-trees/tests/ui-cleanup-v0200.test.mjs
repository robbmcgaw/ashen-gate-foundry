import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {nudged,snapPos,prereqGroups,labelOf,NODE_STATUS_LABELS} from '../scripts/layout.mjs';
// 0.20.0 UI cleanup (audit ST-01, 03–18): sidebar sub-tabs, Library sub-tabs, dialogs with Cancel, keyboard node moves.
// Mocked Foundry and DialogV2: proves the logic and the markup, not the live window.
class FakeApplication{static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map();
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{},callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{}}},utils:{escapeHTML,randomID:()=>'r'}};
globalThis.CSS={escape:v=>String(v)};
const MOD='ashen-gate-skill-trees';
const node=(id,y,extra={})=>({id,name:`[TEST] Node ${id.slice(5)}`,cost:1,x:100,y,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...extra});
const tree={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},
  tiers:[{level:1,y:0,label:'[TEST] Low band'},{level:2,y:300,label:'[TEST] High band'}],
  nodes:[node('NODE-A',100),node('NODE-B',120,{status:'draft'}),node('NODE-C',400)]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const hero={id:'hero',name:'[TEST] Hero',type:'character',items:[],flags:{},async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=v;},isOwner:true,testUserPermission:()=>true};
const gm={id:'gm',isGM:true,name:'GM'},player={id:'pl',isGM:false,name:'Player'};
const saved=new Map();
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[]},actors:{contents:[hero],get:id=>id==='hero'?hero:null},user:gm,users:{contents:[gm],activeGM:gm}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const app=game.modules.get(MOD).api.open();app.actorId='hero';app.treeId='TP-GEN';
const click=(act,data={})=>app._clicked({target:{closest:()=>({dataset:{act,...data}})}});
const stored=()=>journal.flags[MOD].payload.trees.find(t=>t.id==='TP-GEN');
const read=p=>fs.readFile(new URL(p,import.meta.url),'utf8');
/** DialogV2.wait fake: records the options and answers with one button's callback (or a value for the action). */
const answer=(action,value)=>{const seen=[];foundry.applications.api.DialogV2={wait:async o=>{seen.push(o);
  const b=o.buttons.find(x=>x.action===action);return value!==undefined?value:b.callback();}};return seen;};

test('layout helpers: arrow-key nudge, 10 px grid, tier groups and plain labels',()=>{
  assert.deepEqual(nudged({x:100,y:200},'ArrowRight'),{x:110,y:200});
  assert.deepEqual(nudged({x:100,y:200},'ArrowUp',true),{x:100,y:150});
  assert.deepEqual(nudged({x:0,y:5990},'ArrowLeft',true),{x:0,y:5990},'clamped to the board');
  assert.deepEqual(nudged({x:0,y:5990},'ArrowDown',true),{x:0,y:6000});
  assert.equal(nudged({x:1,y:1},'Enter'),null);
  assert.equal(snapPos(104),100);assert.equal(snapPos(-5),0);assert.equal(snapPos(9000),6000);
  const bands=[{y:300,text:'[TEST] High'},{y:0,text:'[TEST] Low'}];
  const g=prereqGroups([{id:'c',name:'C',y:400},{id:'b',name:'B',y:120},{id:'a',name:'A',y:100}],bands);
  assert.deepEqual(g.map(x=>[x.label,x.nodes.map(n=>n.id)]),[['[TEST] Low',['a','b']],['[TEST] High',['c']]]);
  assert.deepEqual(prereqGroups([{id:'x',requiredLevel:4},{id:'y',requiredLevel:1}]).map(x=>x.label),['Level 1','Level 4']);
  assert.deepEqual(prereqGroups([{id:'x',y:5}]).map(x=>x.label),[''],'no bands: one unlabelled group');
  assert.equal(labelOf(NODE_STATUS_LABELS,'placeholder'),'Placeholder (GM only)');
});

test('ST-01: the sidebar has Perk / Character / Edit sub-tabs for the GM (no Edit for players); selecting a node opens Perk',async()=>{
  game.user=gm;app.sideTab='character';
  let ctx=await app._prepareContext({});
  assert.deepEqual([...ctx.sideTabs.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['perk','character','edit']);
  assert.match(ctx.sideTabs,/class="ag-tabs ag-tabs--sub" role="tablist"/);
  assert.match(ctx.sidePanel.perk,/role="tabpanel"[^]*hidden/);assert.doesNotMatch(ctx.sidePanel.character,/hidden/);
  await click('select',{id:'NODE-A'});
  assert.equal(app.sideTab,'perk');assert.equal(app.nodeId,'NODE-A');
  ctx=await app._prepareContext({});
  assert.equal(ctx.selected.statusText,'Approved','node status shows a label, not the stored value');
  app.sideTab='edit';game.user=player;
  saved.set('publicTreesV2',{schema:'ag-skill-trees/0.3',trees:[]});
  ctx=await app._prepareContext({});
  assert.deepEqual([...ctx.sideTabs.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['perk','character']);
  assert.equal(app.sideTab,'perk','a GM-only tab falls back for players');
  game.user=gm;app.actorId='hero';app.treeId='TP-GEN';
});

test('ST-04: Tree Library has Trees and Checks & maintenance sub-tabs',async()=>{
  app.activeTab='library';app.libraryTab='checks';
  const ctx=await app._prepareContext({});
  assert.deepEqual([...ctx.libraryTabs.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['trees','checks']);
  assert.match(ctx.libraryTabs,/Checks &amp; maintenance/);
  assert.match(ctx.libraryPanel.trees,/hidden/);assert.doesNotMatch(ctx.libraryPanel.checks,/hidden/);
  assert.match(ctx.libraryLink,/^<button type="button" class="ag-link" data-act="tab-library">Tree Library<\/button>$/);
  app.activeTab='trees';
});

test('ST-10: Undo and Redo are disabled when there is nothing to undo or redo',async()=>{
  app.undo=[];app.redo=[];
  let ctx=await app._prepareContext({});
  assert.equal(ctx.canUndoEdit,false);assert.equal(ctx.canRedoEdit,false);
  app.undo=[{treeId:'TP-GEN',tree:stored()}];
  ctx=await app._prepareContext({});
  assert.equal(ctx.canUndoEdit,true);app.undo=[];
});

test('ST-05: form dialogs have Cancel on the left; Cancel on Edit properties and Tree settings saves nothing',async()=>{
  app.editMode=true;app.nodeId='NODE-A';
  const before=JSON.stringify(journal.flags[MOD].payload);
  let seen=answer('cancel');
  await app._editNode();await app._treeSettings();
  assert.equal(seen.length,2);
  for(const o of seen){
    assert.deepEqual(o.buttons.map(b=>b.action),['cancel','ok']);
    assert.equal(o.buttons[0].label,'Cancel');assert.equal(o.buttons[1].default,true);
    assert.ok(o.classes.includes('ag-app')&&o.classes.includes('ag-dialog'));
  }
  assert.equal(JSON.stringify(journal.flags[MOD].payload),before,'nothing saved');
  seen=answer('ok',{name:'[TEST] Renamed',description:'',status:'approved',visibility:'player',maxPoints:'10'});
  await app._treeSettings();
  assert.equal(stored().name,'[TEST] Renamed','the action still saves');
  app.editMode=false;
});

test('ST-07: Edit node shows Status, Visibility and Display first, the other nodes grouped by tier, and labelled options',async()=>{
  app.editMode=true;app.nodeId='NODE-A';
  const seen=answer('cancel');await app._editNode();
  const html=seen[0].content;
  assert.ok(html.indexOf('name="status"')<html.indexOf('<table'),'own fields before the prerequisites');
  assert.ok(html.indexOf('name="display"')<html.indexOf('<table'));
  assert.equal((html.match(/<tbody>/g)??[]).length,2,'one tbody per tier');
  assert.match(html,/<th scope="rowgroup" colspan="3">\[TEST\] Low band<\/th>[^]*Node B[^]*\[TEST\] High band[^]*Node C/);
  assert.match(html,/<option value="placeholder" >Placeholder \(GM only\)<\/option>/);
  assert.doesNotMatch(html,/>draft</,'no raw lowercase status');
  app.editMode=false;
});

test('ST-09: Award points asks once; the button names the amount',async()=>{
  const seen=answer('ok',{label:'[TEST] Milestone',amount:'2'});
  const before=seen.length;
  await app._grant();
  assert.equal(seen.length-before,1,'no second confirmation');
  assert.equal(seen[0].buttons[1].label,'Award 1 point');
  assert.equal(typeof seen[0].render,'function','the label follows the amount');
  assert.equal(hero.flags[MOD].progressV2['tree:TP-GEN'].awarded,2);
});

test('ST-08: Connect prerequisite can be cancelled with the button',async()=>{
  app.editMode=true;app.nodeId='NODE-A';
  await click('link');assert.equal(app.linkFrom,'NODE-A');
  const ctx=await app._prepareContext({});assert.equal(ctx.linkFromName,'[TEST] Node A');
  await click('cancel-link');assert.equal(app.linkFrom,null);
  app.editMode=false;
});

test('ST-17: arrow keys move the focused node in Edit layout and save once; outside Edit layout they do nothing',async()=>{
  const target={dataset:{id:'NODE-C'},style:{left:'100px',top:'400px'}};target.closest=()=>target;
  const key=(k,shift=false)=>{let prevented=false;app._nodeKey({target,key:k,shiftKey:shift,preventDefault(){prevented=true;}});return prevented;};
  app.editMode=false;
  assert.equal(key('ArrowRight'),false);assert.equal(target.style.left,'100px');
  app.editMode=true;
  assert.equal(key('ArrowRight'),true);key('ArrowDown',true);
  assert.deepEqual([target.style.left,target.style.top],['110px','450px']);
  clearTimeout(app._moveTimer);await app._commitMove();
  const c=stored().nodes.find(n=>n.id==='NODE-C');
  assert.deepEqual([c.x,c.y],[110,450]);assert.equal(app.nodeId,'NODE-C');
  game.user=player;assert.equal(key('ArrowLeft'),false,'players never move nodes');game.user=gm;
  await assert.rejects(()=>{game.user=player;return app._moveNode('NODE-C',0,0);},/GM editor only/);game.user=gm;
  // Move node… sets an exact position.
  app.nodeId='NODE-C';answer('ok',{x:'204',y:'30'});await app._moveNodeDialog();
  assert.deepEqual([stored().nodes.find(n=>n.id==='NODE-C').x,stored().nodes.find(n=>n.id==='NODE-C').y],[200,30]);
  app.editMode=false;
});

test('template: kit notices and folds, mode toggles in the canvas bar, Reset in a fold, labelled row actions',async()=>{
  const [tpl,css,src]=await Promise.all([read('../templates/tree.hbs'),read('../styles/trees.css'),read('../scripts/main.js')]);
  assert.doesNotMatch(tpl+css,/agst-banner|agst-linklike|agst-side-section/,'ST-06: no hand-rolled banner or link');
  assert.equal((tpl.match(/class="ag-notice ag-notice--(warn|info) agst-canvas-notice[^"]*" role="(status|alert)"/g)??[]).length,5);
  const bar=tpl.slice(tpl.indexOf('<div class="agst-canvas-bar">'),tpl.indexOf('</div>',tpl.indexOf('<div class="agst-canvas-bar">')));
  for(const act of ['player-preview','edit-mode'])assert.match(bar,new RegExp(`data-act="${act}" class="ag-btn ag-btn--ghost ag-btn--sm" aria-pressed=`),`ST-12 ${act}`);
  assert.match(tpl,/data-act="cancel-link">Cancel connecting<\/button>/);
  const reset=tpl.slice(tpl.indexOf('data-ag-fold-key="reset"')-60,tpl.indexOf('data-act="reset-tree"'));
  assert.match(reset,/<details class="ag-fold agst-reset"[^]*Reset this tree…/,'ST-11');
  assert.match(tpl,/data-act="undo" \{\{#unless canUndoEdit\}\}disabled/);
  assert.match(await fs.readFile(new URL('../scripts/library.mjs',import.meta.url),'utf8'),/data-act="export" data-tree="\$\{esc\(r\.id\)\}" aria-label="Export \$\{esc\(r\.name\)\}"/);
  assert.doesNotMatch(tpl,/<summary[^>]*>(?:(?!<\/summary>)[^])*<button/,'no control inside a summary');
  assert.match(src,/class="ag-btn ag-btn--sm" data-agst-open-tree[^`]*<i class="fa-solid fa-diagram-project" aria-hidden="true">/,'ST-14');
  assert.doesNotMatch(src,/v0\.6|Tree View/,'ST-15');
  assert.doesNotMatch(src,/DialogV2\.input\(/);
});
