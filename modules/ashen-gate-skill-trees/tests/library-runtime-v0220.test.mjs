import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';
// 0.22.0: Tree Library runtime. Mocked Foundry: proves the view data, permissions and saved stamps, not the live window.
// messages and template, not the live window.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(o){this.options=o;}render(){return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),saved=new Map(),notes=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
globalThis.document={documentElement:{dataset:{agSize:'comfortable'}},createElement:tag=>({tag,className:'',textContent:'',children:[],append(...c){this.children.push(...c);}})};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,perk,extra={})=>({id:`NODE-${id}`,perkId:perk,cost:1,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',name:`[TEST] Perk ${id}`,...extra});
const prof={id:'TREE-TP-PROF',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},
  nodes:[node('P1','PERK-TP-P1'),node('P2','PERK-TP-P2',{requiresAll:['NODE-P1']}),node('P3','PERK-TP-GONE',{name:''})]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[prof]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=id=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},system:{description:{value:''}},testUserPermission:()=>true,
  toObject(){return {name:this.name,type:'feat',system:{},flags:{}};},
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:1}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'};
const hero={id:'hero',name:'[TEST] Hero',type:'character',flags:{[MOD]:{progressV2:{'tree:TREE-TP-PROF':{unlocks:['NODE-P1'],history:[]}}}},items:[],
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},get isOwner(){return true;},testUserPermission:()=>true};
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:()=>({profId:PROF,xp:5,level:3,tier:'Apprentice'})}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true,version:'0.24.0'}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('P1'),perk('P2')]},actors:{contents:[hero],get:id=>id==='hero'?hero:null},
  user:gm,users:{contents:[gm,owner],get:id=>[gm,owner].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:m=>notes.push(m),error:m=>notes.push(m)}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

test('GM library is built from the stored trees; players get no library and grouped Tree choices only',async()=>{
  game.user=gm;let app=api.open();app.activeTab='library';app.treeId='TREE-TP-PROF';
  let ctx=await app._prepareContext();
  assert.equal(ctx.libraryHasTrees,true);
  assert.match(ctx.libraryHtml,/Test trees/,'a [TEST] tree is in the Test trees folder');assert.match(ctx.libraryHtml,/Herbalism Tree/);
  assert.match(ctx.libraryFilters,/Filters/);assert.equal(ctx.libraryCountText,'1 tree');
  assert.deepEqual(ctx.libraryGroupOptions.map(o=>o.value),['type','status','visibility','none']);
  app.lib.query='zzz';ctx=await app._prepareContext();assert.match(ctx.libraryHtml,/Nothing matches/);assert.equal(ctx.libraryCountText,'0 of 1 trees');
  game.user=owner;app=api.open();app.activeTab='trees';
  await app._clicked({target:{closest:()=>({dataset:{act:'tab-library'}})}});
  assert.equal(app.activeTab,'trees','a player cannot open the Tree Library');
  app.activeTab='library';
  ctx=await app._prepareContext();
  assert.equal(ctx.libraryHasTrees,false,'a player is given no library rows');assert.doesNotMatch(ctx.libraryHtml,/Herbalism Tree/);
  assert.equal(ctx.treeGroups??null,null,'one folder: the Tree select stays flat');
});

test('updatedAt: set when a layout changes, kept when it does not, never published',async()=>{
  game.user=gm;
  const t=structuredClone(prof);delete t.updatedAt;
  const first=await api.importTrees({schema:'ag-skill-trees/0.3',trees:[{...t,description:'changed'}]},{mode:'update'});
  assert.equal(first.failed.length,0);
  const stored=()=>journal.flags[MOD].payload.trees.find(x=>x.id===t.id);
  const stamp=stored().updatedAt;
  assert.ok(Date.parse(stamp),'a changed layout is stamped');
  await api.importTrees({schema:'ag-skill-trees/0.3',trees:[{...structuredClone(stored())}]},{mode:'update'});
  assert.equal(stored().updatedAt,stamp,'saving the same content keeps the stamp');
  assert.doesNotMatch(JSON.stringify(saved.get('publicTreesV2')??{}),/updatedAt/,'players never receive it');
});
