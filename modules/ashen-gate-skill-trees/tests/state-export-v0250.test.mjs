import test from 'node:test';import assert from 'node:assert/strict';
// 0.25.0 api.exportState(): GM layouts + per-character progress as plain JSON. Mocked Foundry and a stand-in Ledger; synthetic [TEST] data only; proves logic, not the live UI.
import {buildStateExport,STATE_EXPORT_SCHEMA} from '../scripts/state-export.mjs';
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),saved=new Map();
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,extra={})=>({id,perkId:`PERK-TP-${id}`,cost:1,x:10,y:20,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown',...extra});
const prof={id:'TP-PROF',name:'[TEST] Herbalism Tree',description:'SECRET DESCRIPTION',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},nodes:[node('NP2',{x:30,requiresAll:['NP1']}),node('NP1',{excludes:['NP3']}),node('NP3',{excludes:['NP1']})]};
const generic={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'draft',visibility:'gm',provider:{kind:'generic_points',maxPoints:10},nodeSize:'compact',tiers:[{level:1,label:'T1',y:0,icon:null}],
  nodes:[{id:'NG1',name:'[TEST] Custom node',description:'CUSTOM BODY',cost:2,x:1,y:2,requiresAll:[],requiresAny:[['NG2','NG3']],excludes:[]}]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[generic,prof]}}},setFlag(){throw Error('write attempted');}};
const perk=(id,cost)=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},
  system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:cost}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'};
const actorOf=(id,name,progressV2,extra={})=>({id,name,type:'character',flags:progressV2?{[MOD]:{progressV2}}:{},items:[],...extra,
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u)=>u.isGM||u.id==='u1'});
const zed=actorOf('a-zed','[TEST] Zed',{'tree:TP-GEN':{awarded:5,unlocks:['NG1'],history:[{id:'h',kind:'unlock',at:1},{id:'h2',kind:'grant',at:2}]}});
const hero=actorOf('a-hero','[TEST] Hero',{'tree:TP-PROF':{unlocks:['NP2','NP1'],kept:{NP1:{level:1,at:5,by:'gm',reason:'x'}},history:[]}});
const blank=actorOf('a-blank','[TEST] Blank');
const npc=actorOf('a-npc','[TEST] Npc',{'tree:TP-GEN':{awarded:9,unlocks:[]}},{type:'npc'});
const backup=actorOf('a-bak','[TEST] Backup',{'tree:TP-GEN':{awarded:9,unlocks:[]}},{flags:{'ashen-gate-character-hub':{levelBackup:true},[MOD]:{progressV2:{'tree:TP-GEN':{awarded:9,unlocks:[]}}}}});
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>p===PROF&&a.id==='a-hero'?{profId:p,xp:5,level:3,tier:'Apprentice'}:null}}};
let writes=0;
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async()=>{writes++;}},
  journal:{contents:[journal]},items:{contents:[perk('NP1',1),perk('NP2',1),perk('NP3',1)]},actors:{contents:[zed,blank,hero,npc,backup],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner],get:id=>[gm,owner].find(u=>u.id===id),activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

test('shape: schema_version, trees, progress only; no timestamps; plain JSON',()=>{
  game.user=gm;const out=api.exportState();
  assert.deepEqual(Object.keys(out),['schema_version','trees','progress']);
  assert.equal(out.schema_version,'ag-skill-trees-state-export/0.1');assert.equal(STATE_EXPORT_SCHEMA,out.schema_version);
  assert.equal('exportedAt' in out,false);assert.equal(/"(at|createdAt|exportedAt)"/.test(JSON.stringify(out)),false);
  assert.deepEqual(JSON.parse(JSON.stringify(out)),out);
});
test('layouts: tree and node fields, sorted by id, no description text; custom node keeps its own name only',()=>{
  game.user=gm;const {trees}=api.exportState();
  assert.deepEqual(trees.map(t=>t.tree_id),['TP-GEN','TP-PROF']);
  const p=trees[1];
  assert.deepEqual([p.name,p.kind,p.status,p.visibility,p.source_ref],['[TEST] Herbalism Tree','profession','approved','player',PROF]);
  assert.deepEqual(p.nodes.map(n=>n.id),['NP1','NP2','NP3']);
  const p2=p.nodes[1];
  assert.deepEqual([p2.perk_id,p2.x,p2.y,p2.requires_all,p2.visibility,p2.status,p2.display],['PERK-TP-NP2',30,20,['NP1'],'player','approved','shown']);
  assert.deepEqual(p.nodes[0].excludes,['NP3']);assert.equal('name' in p.nodes[0],false);
  const g=trees[0];assert.equal(g.appearance.node_size,'compact');assert.equal(g.appearance.tiers.length,1);
  assert.deepEqual(g.nodes[0].requires_any,[['NG2','NG3']]);assert.equal(g.nodes[0].name,'[TEST] Custom node');assert.equal(g.nodes[0].cost,2);
  const text=JSON.stringify(trees);for(const k of ['SECRET DESCRIPTION','CUSTOM BODY','"description"'])assert.equal(text.includes(k),false,k);
});
test('progress: actor id and name, unlocked ids, points; blank, NPC and level-backup actors left out; sorted by name',()=>{
  game.user=gm;const {progress}=api.exportState();
  assert.deepEqual(progress.map(a=>a.actor_name),['[TEST] Hero','[TEST] Zed']);
  const h=progress[0];assert.equal(h.actor_id,'a-hero');
  assert.deepEqual(h.trees,[{tree_id:'TP-PROF',wallet:'tree:TP-PROF',unlocked_node_ids:['NP1','NP2'],kept_node_ids:['NP1'],awarded:0,history_length:0,points:{level:3,earned:3,spent:2,available:1}}]);
  assert.deepEqual(progress[1].trees[0],{tree_id:'TP-GEN',wallet:'tree:TP-GEN',unlocked_node_ids:['NG1'],kept_node_ids:[],awarded:5,history_length:2,points:{level:null,earned:5,spent:2,available:3}});
});
test('GM only: API and builder both refuse a player',()=>{
  game.user=owner;assert.throws(()=>api.exportState(),/GM only/);
  assert.throws(()=>buildStateExport({isGM:false,trees:[],actors:[]}),/GM authorization/);
  assert.throws(()=>buildStateExport({trees:[]}),/GM authorization/);
  game.user=gm;
});
test('stable and writes nothing: two runs equal, input order does not matter, no setting or flag written',()=>{
  game.user=gm;const a=api.exportState(),b=api.exportState();assert.deepEqual(a,b);
  journal.flags[MOD].payload.trees.reverse();game.actors.contents.reverse();
  assert.deepEqual(api.exportState(),a);assert.equal(writes,0);
});
test('absent data gives empty arrays, not errors',()=>{
  assert.deepEqual(buildStateExport({isGM:true}),{schema_version:STATE_EXPORT_SCHEMA,trees:[],progress:[]});
  game.user=gm;const saveTrees=journal.flags[MOD].payload.trees;journal.flags[MOD].payload.trees=[];
  try{const out=api.exportState();assert.deepEqual(out.trees,[]);assert.deepEqual(out.progress,[]);}finally{journal.flags[MOD].payload.trees=saveTrees;}
});
test('feature-detect: exportState is a function on the api',()=>{assert.equal(typeof api.exportState,'function');});
