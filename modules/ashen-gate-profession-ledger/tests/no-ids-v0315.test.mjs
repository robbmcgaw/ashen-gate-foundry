// 0.32.1: Ashen Gate canonical ids (REC-*, MAT-*, PROF-*, NODE-*, LOC-* …) are never shown in the Ledger UI. Renders the main
// views with sample records (as a player and as the GM) and checks the visible text, tooltips, aria-labels and placeholders.
// The GM sees no ids on rows either; the node editor keeps a closed Details fold with the id field.
// Mocked Foundry: logic and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';
import {materialProblem,nodeBlocker,startBlocker} from '../scripts/gathering.mjs';
import {canLearnRecipe,nextProgress} from '../scripts/progression.mjs';
import {saveTemplate,checkTemplate,parseNodeFile} from '../scripts/nodes.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={},infos=[],errors=[];let api;
const values={partyRoster:['bard'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>true,prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:m=>errors.push(String(m)),warn:()=>{}}};
globalThis.ChatMessage={create:async()=>({}),getSpeaker:()=>({})};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,{status='approved',visibility='player',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='loot')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''},quantity:1},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const world=[
  worldDoc('wprof','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession',{definition:def('PROF-TEST-ALCHEMY','Profession',{name:'[TEST] Alchemy'})}),'feat'),
  worldDoc('wherb','[TEST] Herb',src('MAT-TEST-HERB','Material',{definition:def('MAT-TEST-HERB','Material',{name:'[TEST] Herb',quality:'common',tier:1})})),
  worldDoc('wdraft','[TEST] Draft Moss',src('MAT-TEST-MOSS','Material',{status:'draft',definition:def('MAT-TEST-MOSS','Material',{name:'[TEST] Draft Moss',quality:'common',tier:1})})),
  worldDoc('wsalveitem','[TEST] Salve',src('ITEM-TEST-SALVE','Item',{definition:def('ITEM-TEST-SALVE','Item',{name:'[TEST] Salve'})})),
  worldDoc('wsalve','Recipe: [TEST] Field Salve',src('REC-ALCHEMY-FIELD-MEDIC-S-SALVE','Recipe',{definition:def('REC-ALCHEMY-FIELD-MEDIC-S-SALVE','Recipe',{name:'[TEST] Field Salve',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-SALVE',tier:'apprentice',effort:'short',starting:true,ingredients:[{material_id:'MAT-TEST-HERB',quantity:1}]})})),
  worldDoc('wnores','Recipe: [TEST] Lost Elixir',src('REC-ALCHEMY-FIELD-01','Recipe',{definition:def('REC-ALCHEMY-FIELD-01','Recipe',{name:'[TEST] Lost Elixir',profession_id:'PROF-TEST-ALCHEMY',result_item_id:'ITEM-TEST-GONE',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-GONE',quantity:2}]})})),
  worldDoc('wgated','Recipe: [TEST] Gated Tonic',src('REC-TEST-GATED','Recipe',{visibility:'reveal_gated',definition:def('REC-TEST-GATED','Recipe',{name:'[TEST] Gated Tonic',profession_id:'PROF-TEST-ALCHEMY',tier:'apprentice',refs:[{relation:'also_available_as_journal',target_id:'HANDOUT-TEST-X',mode:'optional'}]})})),
  worldDoc('wsecret','Recipe: [TEST] Secret Tonic',src('REC-TEST-SECRET','Recipe',{visibility:'gm',status:'draft',definition:def('REC-TEST-SECRET','Recipe',{name:'[TEST] Secret Tonic',profession_id:'PROF-TEST-ALCHEMY',tier:'apprentice',refs:[{relation:'starting_recipe',target_id:'REC-TEST-GATED',mode:'required'}]})})),
  worldDoc('wbal','Recipe: [TEST] Ballad',src('REC-TEST-BALLAD','Recipe',{definition:def('REC-TEST-BALLAD','Recipe',{name:'[TEST] Ballad',kind:'activity',profession_id:'PROF-TEST-ALCHEMY',tier:'apprentice',effort:'short'})}))];
const held=(id,name,flags,type='loot',qty=1)=>({id,name,type,system:{quantity:qty,description:{value:''}},flags,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
const items=[held('hp','[TEST] Alchemy — Profession',src('PROF-TEST-ALCHEMY','Profession'),'feat'),held('hh','[TEST] Herb',src('MAT-TEST-HERB','Material'),'loot',3),
  held('hr','Recipe: [TEST] Lost Elixir',src('REC-ALCHEMY-FIELD-01','Recipe'))];items.get=i=>items.find(x=>x.id===i);
const actor={id:'bard',name:'[TEST] Bard',type:'character',hasPlayerOwner:true,items,flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-ALCHEMY-FIELD-MEDIC-S-SALVE','REC-TEST-BALLAD','REC-TEST-GATED','REC-TEST-SECRET']}},
  testUserPermission:()=>true,setFlag:async()=>{},system:{skills:{},tools:{},abilities:{}}};
const nodeTemplate={id:'NODE-TEST-REEDS',name:'[TEST] River Reeds',activity:'herbalism',tier:{min:1,max:2},materials:{common:[{materialId:'MAT-TEST-HERB',quantity:1}],rare:[],exotic:[{materialId:'MAT-TEST-MOSS',mode:'discovery'}]}};
const journal={id:'j1',flags:{'ashen-gate-profession-ledger':{role:'gm-data'}},getFlag(m,k){return this.flags[m]?.[k];},async update(u){for(const [k,v] of Object.entries(u)){const [,m,key]=k.split('.');this.flags[m]??={};this.flags[m][key]=v;}}};
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.37.7'};
globalThis.game={user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},journal:[journal],
  actors:{contents:[actor],get:id=>id==='bard'?actor:undefined},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));
game.user=gm;
await _test.writeNodeStore({schema:'ag-gathering-nodes/1',nodes:[{...nodeTemplate,dc:null,dcVisible:false,finite:true,note:'',check:{skill:'',tool:''},meta:{origin:'gm',edited:true,createdAt:1,updatedAt:1,legacy:[]},problems:[]}],retiredIds:[]}).catch(()=>{});
const app=api.open({view:'individual'});app.element={querySelectorAll:()=>[],querySelector:()=>null};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
/** What the GM sees outside the closed Details fold. */
const withoutDetails=h=>h.replace(/<details class="agl-details agl-id-details">[\s\S]*?<\/details>/g,'');
const VIEWS=['individual','party','catalog','gathering','assign','gm'];

test('player views show no ids (recipe list rows included)',async()=>{
  game.user=player;app.actorId='bard';
  for(const view of VIEWS){assertNoMachineText(await html(view),`player ${view} view`);}
  const row=(await html('individual'));
  assert.match(row,/\[TEST\] Field Salve/);
  assert.doesNotMatch(row,/REC-ALCHEMY-FIELD-MEDIC-S-SALVE<|agl-id/,'the id line under a recipe row is gone');
});

test('GM views show no ids',async()=>{
  game.user=gm;app.actorId='bard';
  for(const view of [...VIEWS,'nodes']){assertNoMachineText(withoutDetails(await html(view)),`GM ${view} view`);}
  assert.doesNotMatch(await html('catalog'),/<small class="agl-id">/);
});

test('GM node editor, node list and import preview show no ids',async()=>{
  game.user=gm;
  const list=await html('nodes');
  assert.match(list,/\[TEST\] River Reeds/);
  assertNoMachineText(list,'GM node list');
  app.nodeDraft=null;
  await app._click('node-edit','NODE-TEST-REEDS').catch(()=>{});
  assert.ok(app.nodeDraft,'the editor opened');
  const editor=await html('nodes');
  assert.match(editor,/Edit \[TEST\] River Reeds/);
  assert.match(editor,/<summary[^>]*>[\s\S]*?Details/,'the id field sits in a Details fold');
  assertNoMachineText(editor,'GM node editor');
  app.nodeDraft=null;
  const plan=api.gathering.templates.preview({schema:'ag-gathering-nodes/1',nodes:[{...nodeTemplate,id:'NODE-TEST-NEW',name:'[TEST] New Spot'}]});
  app.nodeImport={fileName:'spots.nodes.json',data:{},plan};
  assertNoMachineText(await html('nodes'),'GM node import preview');
  app.nodeImport=null;
});

test('messages name the thing, not its id',()=>{
  for(const state of ['missing','draft','gm-only','not-visible','duplicate','retired','other'])
    assertNoMachineText(materialProblem('MAT-TEST-HERB',state,{name:'[TEST] Herb'}),`material problem ${state}`);
  assert.match(materialProblem('MAT-TEST-HERB','missing',{name:'[TEST] Herb'}),/Material “\[TEST\] Herb” is not imported/);
  assert.match(materialProblem('MAT-TEST-HERB','missing'),/^This material is not imported/,'no name known: a neutral label');
  const node={id:'n',missingTemplate:'NODE-TEST-GONE',available:true,dc:10};
  assertNoIds(nodeBlocker(node),'missing node template');
  assertNoIds(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:{id:'n',materialId:'MAT-TEST-HERB',available:true,dc:10},materialState:'missing',materialId:'MAT-TEST-HERB'}),'start blocker');
  const learn=canLearnRecipe(actor,items[2],'bad');assertNoIds(learn.reason,'learn refusal');
  assert.throws(()=>nextProgress(null,'nope',1),e=>findId(e.message)===null&&/imported profession/.test(e.message));
  const store={nodes:[{id:'NODE-TEST-REEDS',name:'[TEST] River Reeds'}],retiredIds:['NODE-TEST-OLD']};
  const dup=saveTemplate(store,{...nodeTemplate,id:'NODE-TEST-REEDS',name:'[TEST] Other'},{isNew:true});
  assertNoIds(dup.errors.join(' '),'duplicate node id error');
  assertNoIds(saveTemplate(store,{...nodeTemplate,id:'NODE-TEST-OLD'},{isNew:true}).errors.join(' '),'retired node id error');
  assertNoIds(checkTemplate({...nodeTemplate,id:'bad id',activity:'nope'}).errors.join(' '),'node editor errors');
  assertNoIds(parseNodeFile({schema:'ag-gathering-nodes/1',nodes:[nodeTemplate,nodeTemplate]}).errors.join(' '),'node file errors');
});

test('Assign previews and the Gathering start form show no ids',async()=>{
  game.user=gm;
  app.view='assign';
  for(const action of ['grant-preview','assign-preview','signature-preview'])await app._click(action).catch(()=>{});
  const h=await html('assign');
  assert.match(h,/\[TEST\] Field Salve/,'the starting-recipe preview lists the recipe by name');
  assertNoMachineText(h,'GM Assign tab');
  app.gather.source='adhoc';app.gather.adhoc={...app.gather.adhoc,materialId:'MAT-TEST-MOSS',rareMaterialId:'MAT-TEST-GONE'};
  assertNoMachineText(await html('gathering'),'GM ad-hoc Gathering form with a draft and a missing material');
});
