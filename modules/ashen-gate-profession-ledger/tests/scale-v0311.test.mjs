// 0.31.1 QA pass: big worlds (hundreds of recipes and materials), six top-level GM tabs with Gathering nodes under Gathering,
// a readable node import preview and Select all / Clear selection on the Assign grants. Mocked Foundry: logic and markup only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {lookupWorldDefinition} from '../scripts/definition-lookup.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={};let api;
const values={partyRoster:['a1'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>false,prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,definition=null)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='loot')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''},quantity:1},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const PROFS=['ALCHEMY','COOKING','HERBALISM'];
const world=[];
for(const p of PROFS)world.push(worldDoc('wp'+p,`${p} — Profession`,src('PROF-'+p,'Profession',def('PROF-'+p,'Profession',{name:p[0]+p.slice(1).toLowerCase()})),'feat'));
for(let i=0;i<90;i++)world.push(worldDoc('wr'+i,`Recipe: [TEST] Recipe ${i}`,src('REC-TEST-'+i,'Recipe',def('REC-TEST-'+i,'Recipe',{name:`[TEST] Recipe ${i}`,profession_id:'PROF-'+PROFS[i%3],tier:'apprentice',starting:i%2===0,ingredients:[{material_id:'MAT-TEST-A',quantity:1}]}))));
world.push(worldDoc('wma','Material A',src('MAT-TEST-A','Material',def('MAT-TEST-A','Material',{name:'[TEST] Material A',quality:'common',tier:2}))));
const held=(id,name,flags,type='loot')=>({id,name,type,system:{quantity:1,description:{value:''}},flags});
const items=[held('hp','Alchemy — Profession',src('PROF-ALCHEMY','Profession'),'feat'),held('hp2','Cooking — Profession',src('PROF-COOKING','Profession'),'feat')];items.get=i=>items.find(x=>x.id===i);
const actor={id:'a1',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items,flags:{'ashen-gate-profession-ledger':{knownRecipes:[]}},testUserPermission:()=>true,setFlag:async()=>{}};
const journal={id:'j1',flags:{'ashen-gate-profession-ledger':{role:'gm-data'}},getFlag(m,k){return this.flags[m]?.[k];},async update(u){for(const [k,v] of Object.entries(u)){const [,m,key]=k.split('.');this.flags[m]??={};this.flags[m][key]=v;}}};
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.33.1'};
globalThis.game={user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},journal:[journal],
  actors:{contents:[actor],get:id=>id==='a1'?actor:undefined},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'catalog'});app.element={querySelectorAll:()=>[],querySelector:()=>null};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};

test('definition lookup: the per-pass index never reads stale documents',async()=>{
  const mk=(id,extra={})=>worldDoc('x'+id,id,{'ashen-gate-manager':{lifecycle:{archived:false},source:{sourceId:id,entityType:'Item',visibility:'player',status:'approved',version:'1',refs:[],definition:def(id,'Item',{name:id})}}});
  const a=mk('ITEM-ONE'),b=mk('ITEM-TWO');
  const g={user:gm,users:{contents:[gm]},items:{contents:[a,b]},actors:{contents:[]},journal:{contents:[]},tables:{contents:[]},macros:{contents:[]}};
  assert.equal(lookupWorldDefinition(g,'ITEM-ONE').document,a);
  a.flags['ashen-gate-manager'].lifecycle.archived=true;
  assert.equal(lookupWorldDefinition(g,'ITEM-ONE').status,'not_found','an archived document is not read from the index');
  const c=mk('ITEM-ONE');g.items.contents=[a,b,c];
  assert.equal(lookupWorldDefinition(g,'ITEM-ONE').document,c,'a document added in the same pass is found');
  g.items.contents=[b];
  assert.equal(lookupWorldDefinition(g,'ITEM-ONE').status,'not_found','a document removed in the same pass is gone');
  const d=mk('ITEM-TWO');g.items.contents=[b,d];
  assert.equal(lookupWorldDefinition(g,'ITEM-TWO').status,'conflict','two active bindings still conflict for the GM');
  await Promise.resolve();
});

test('a big recipe list starts with every folder shut, remembers an opened one and still opens on a search',async()=>{
  const h=await html('catalog');
  const folders=h.match(/<details class="agl-folder"[^>]*>/g);
  assert.equal(folders.length,3);
  assert.ok(folders.every(f=>/data-big/.test(f)&&!/\sopen/.test(f)),'90 recipes: all folders closed');
  assert.match(h,/<span class="ag-badge">30 recipes<\/span>|<span class="ag-badge">30 /,'each folder still says how many recipes it holds');
  app.closedFolders.add('open:alchemy');
  const h2=await html('catalog');
  assert.match(h2,/<details class="agl-folder" data-folder="alchemy" data-big open>/);
  assert.doesNotMatch(h2,/data-folder="cooking" data-big open/);
  app.closedFolders.clear();
});

test('a short list keeps its folders open, as before',async()=>{
  const few=world.filter(d=>!/^wr(?!0$|1$|2$)/.test(d.id));
  const saved=game.items.contents;game.items.contents=few;
  const h=await html('catalog');
  assert.doesNotMatch(h,/data-big/);
  assert.match(h,/<details class="agl-folder" data-folder="[^"]*" open>/);
  game.items.contents=saved;
});

test('GM: six top-level tabs; Gathering nodes is Gathering’s fourth sub-tab and keeps Gathering selected',async()=>{
  const gmTabs=h=>[...h.matchAll(/<button type="button" role="tab" id="agl-tab-([a-z]+)"/g)].map(m=>m[1]);
  let h=await html('gathering');
  assert.deepEqual(gmTabs(h),['individual','party','catalog','gathering','assign','gm']);
  assert.match(h,/id="agl-gather-tab-nodes" data-tab="nodes"[^>]*aria-selected="false"[^>]*>Gathering nodes</);
  h=await html('nodes');
  assert.deepEqual(gmTabs(h),['individual','party','catalog','gathering','assign','gm']);
  assert.match(h,/id="agl-tab-gathering"[^>]*class="active"[^>]*aria-selected="true"/);
  assert.match(h,/<main[^>]*aria-labelledby="agl-tab-gathering"/);
  assert.match(h,/id="agl-gather-tab-nodes"[^>]*aria-selected="true"/);
  assert.match(h,/id="agl-gather-panel-nodes"[^>]*><div class="ag-toolbar agl-toolbar">/,'the node list sits in the Gathering nodes panel');
  // The sub-tab row moves between the two views.
  await app._click('gather-tab','start');assert.equal(app.view,'gathering');assert.equal(app.gatherTab,'start');
  await app._click('gather-tab','nodes');assert.equal(app.view,'nodes');
  await app._click('gather-tab','requests');assert.equal(app.view,'gathering');assert.equal(app.gatherTab,'requests');
  // A top-level click on Gathering from the nodes starts on the default sub-tab.
  app.view='nodes';await app._click('tab','gathering');assert.equal(app.view,'gathering');
  game.user=player;app.view='gathering';
  await app._click('gather-tab','nodes');assert.equal(app.view,'gathering','a player cannot switch to the nodes');
  game.user=gm;
});

test('players never get the Gathering nodes sub-tab',async()=>{
  game.user=player;
  app.view='gathering';
  const h=(await app._prepareContext({})).html;
  assert.doesNotMatch(h,/Gathering nodes|data-tab="nodes"|agl-tab-nodes/);
  game.user=gm;
});

test('a node import preview lists one node per line inside a fold per outcome',async()=>{
  const nodes=Array.from({length:30},(_,i)=>({id:`NODE-TEST-${i}`,name:`[TEST] Node ${i}`,activity:'herbalism',tier:{min:1,max:2},materials:{common:[{materialId:'MAT-TEST-A',quantity:1}]}}));
  const plan=api.gathering.templates.preview({schema:'ag-gathering-nodes/1',nodes});
  assert.ok(plan.ok&&plan.add.length===30);
  app.nodeImport={fileName:'big.nodes.json',data:{},plan};
  const h=await html('nodes');
  const preview=h.slice(h.indexOf('agl-node-import'));
  assert.match(preview,/<details class="agl-node-plan-group" ><summary><span class="ag-badge ag-badge--ok">New: 30<\/span><\/summary>/,'a long list starts folded');
  assert.equal((preview.match(/<li>\[TEST\] Node \d+<\/li>/g)||[]).length,30);
  assert.doesNotMatch(preview,/\), \[TEST\] Node/,'no comma-run of names');
  app.nodeImport=null;
});

test('Assign: Select all and Clear selection on the starting recipes and signature perks',async()=>{
  app.view='assign';
  await app._click('grant-preview');
  const g=app.grantState,fresh=g.preview.rows.filter(r=>r.status==='new');
  assert.ok(fresh.length>1);assert.equal(g.selected.size,fresh.length);
  let h=await html('assign');
  assert.match(h,/data-action="grant-select" data-id="all">Select all<[^]*data-action="grant-select" data-id="none">Clear selection</);
  await app._click('grant-select','none');assert.equal(g.selected.size,0);
  h=await html('assign');
  assert.match(h,/data-action="grant-apply" data-id="selected" disabled>/,'Grant selected is off with nothing ticked');
  await app._click('grant-select','all');assert.equal(g.selected.size,fresh.length);
  await app._click('signature-preview');
  await app._click('signature-select','none');assert.equal(app.signatureState.selected.size,0);
  await app._click('grant-select','none');
  game.user=player;
  await app._click('grant-select','all');assert.equal(g.selected.size,0,'a player cannot change the GM’s selection');
  game.user=gm;
});
