import test from 'node:test';import assert from 'node:assert/strict';
// 0.17.0 api.exportState(): instances, stage art, Strain and rule settings as plain JSON, GM only. Mocked Foundry and a stand-in Skill Trees; synthetic [TEST] data only; proves logic, not the live UI.
import {buildStateExport,STATE_EXPORT_SCHEMA} from '../scripts/state-export.mjs';
import {fakeSkillTrees} from './fake-skill-trees.mjs';

class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),saved=new Map(),socketHandlers=[],emitted=[];
const Hooks_={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,d)=>{for(const fn of hooks.get(e)??[])fn(d);}};
globalThis.Hooks=Hooks_;
let counter=0;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>`R${String(++counter).padStart(15,'0')}`}};
globalThis.ChatMessage={create:async d=>d,getSpeaker:({actor})=>({actor:actor.id})};
globalThis.CONFIG={statusEffects:[]};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
const MOD='ashen-gate-cinders',DEF='MUT-TEST-EMBER';
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:16},nodes:[]};
const items=[{id:'W0',uuid:'Item.W0',documentName:'Item',type:'feat',name:'[TEST] Ember Cinder',ownership:{default:2},system:{},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:DEF,entityType:'Mutation',status:'approved',visibility:'player',definition:{id:DEF,entity_type:'Mutation',cinder:{schema:'ag-cinder/0.1'}}}}}}];
const gm={id:'gm',isGM:true,name:'GM'},alice={id:'u1',isGM:false,name:'Alice'};
function makeActor(id,ownerId,flags={}){
  const actor={id,name:`[TEST] ${id}`,type:'character',flags:structuredClone(flags),items:[],effects:[],system:{},
    get isOwner(){return game.user.isGM||game.user.id===ownerId;},testUserPermission:u=>u.isGM||u.id===ownerId,
    async update(){return this;},async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(){return [];}};
  actor.items.get=itemId=>actor.items.find(i=>i.id===itemId);
  return actor;
}
const A=makeActor('A','u1'),B=makeActor('B','u1');A.name='[TEST] Zed';B.name='[TEST] Amy';
// Hub copy of A: own id, "<Name> - level X", Hub marker only (the Hub strips other ashen-gate-* flags).
const Abak=makeActor('Abak','u1',{'ashen-gate-character-hub':{levelBackup:{sourceActorId:'A',level:3}}});Abak.name='[TEST] A - level 3';
const st=fakeSkillTrees({trees:[tree],worldItem:id=>items.find(i=>i.flags['ashen-gate-manager'].source.sourceId===id),hooks:Hooks_});
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-skill-trees',{id:'ashen-gate-skill-trees',active:true,api:st.api}]]),i18n:{localize:x=>x},
  settings:{register:(_m,k,o)=>{if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[]},items:{contents:items},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A,Abak,B],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.JournalEntry={create:async data=>{const d={...structuredClone(data),documentName:'JournalEntry',async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};game.journal.contents.push(d);return d;}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
saved.set('strainChip',false);
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5));
const api=game.modules.get(MOD).api,cinder=api.cinder;

let bound,spare;
test('setup: one bound Cinder, one spare, GM stage art, Strain on one character, an attached socket item',async()=>{
  game.user=gm;
  spare=await cinder.create(DEF);bound=await cinder.create(DEF);
  await cinder.bind(bound.instanceId,A);
  await cinder.setDefinitionArtStages(DEF,[{art:'art/ember-1.webp',at:0},{art:'art/ember-2.webp',at:3}]);
  B.flags['ashen-gate-strain']={state:{value:3,history:[{delta:3,to:3,reason:'[TEST] secret reason',at:5}]}};
  A.items.push({id:'ITM1',name:'[TEST] Socket Gem',flags:{}});
  const reg=game.journal.contents[0].flags[MOD].registry.instances.find(i=>i.instanceId===bound.instanceId);
  reg.sockets={attached:[{slot:1,itemId:'ITM1',sourceId:'ITEM-TEST-GEM',by:'gm',at:99}],locked:true,count:2,ops:['op-secret']};
  reg.progression={awarded:4,unlocks:['NODE-B','NODE-A'],grants:[{key:'initial',amount:1}]};
});
test('shape: schema_version, config, cinders, stage_art, strain; no timestamps; plain JSON',()=>{
  game.user=gm;const out=api.exportState();
  assert.deepEqual(Object.keys(out),['schema_version','config','cinders','stage_art','strain']);
  assert.equal(out.schema_version,'ag-cinders-state-export/0.1');assert.equal(STATE_EXPORT_SCHEMA,out.schema_version);
  assert.equal('exportedAt' in out,false);
  const text=JSON.stringify(out);
  for(const k of ['createdAt','firstBoundAt','since','"at":99','op-secret','"by"','secret reason'])assert.equal(text.includes(k),false,k);
  assert.deepEqual(JSON.parse(text),out);
});
test('config: the settings that change the rules, and the Strain config',()=>{
  game.user=gm;const {config}=api.exportState();
  assert.deepEqual(Object.keys(config),['cinders_per_character','starting_points','sockets_per_cinder','strain']);
  assert.equal(config.cinders_per_character,1);assert.equal(config.starting_points,1);assert.equal(config.sockets_per_cinder,3);
  assert.equal(config.strain.schema,'ag-strain-config/0.1');assert.equal(config.strain.guarantee_at,10);
});
test('cinders: every instance with bearer, points, unlocks, art, sockets and attached items',()=>{
  game.user=gm;const {cinders}=api.exportState();
  assert.equal(cinders.length,2);
  assert.deepEqual(cinders.map(c=>c.instance_id),[...cinders.map(c=>c.instance_id)].sort());
  const b=cinders.find(c=>c.instance_id===bound.instanceId),s=cinders.find(c=>c.instance_id===spare.instanceId);
  assert.deepEqual([b.definition_id,b.status,b.bearer],[DEF,'bound',{actor_id:'A',actor_name:'[TEST] Zed'}]);
  assert.equal(b.name,'[TEST] Ember Cinder');
  assert.equal(b.points.awarded,4);assert.deepEqual(b.points.grants,[{key:'initial',amount:1}]);
  assert.deepEqual(b.unlocked_node_ids,['NODE-A','NODE-B']);
  assert.deepEqual(b.powers,[]);assert.deepEqual(b.enhancements,[]);
  assert.deepEqual(b.sockets,{count:2,locked:true,attached:[{slot:1,item_id:'ITM1',source_id:'ITEM-TEST-GEM',item_name:'[TEST] Socket Gem'}]});
  assert.deepEqual(b.art,{own:null,own_stages:null,stage_hold:null,stage:{number:1,held:false}});
  assert.deepEqual([s.status,s.bearer,s.last_bearer,s.powers],['unbound',null,null,[]]);
});
test('stage_art keyed by definition; strain per character with value, band and history length only',()=>{
  game.user=gm;const out=api.exportState();
  assert.deepEqual(out.stage_art,[{definition_id:DEF,stages:[{art:'art/ember-1.webp',at:0},{art:'art/ember-2.webp',at:3}]}]);
  assert.equal(out.strain.length,1);
  const [r]=out.strain;assert.deepEqual(Object.keys(r),['actor_id','actor_name','value','band','history_length']);
  assert.deepEqual([r.actor_id,r.actor_name,r.value,r.history_length],['B','[TEST] Amy',3,1]);assert.equal(typeof r.band.label,'string');
});
test('GM only: API and builder both refuse a player',()=>{
  game.user=alice;assert.throws(()=>api.exportState(),/GM only/);
  assert.throws(()=>buildStateExport({isGM:false}),/GM authorization/);assert.throws(()=>buildStateExport({}),/GM authorization/);
  game.user=gm;
});
test('stable and writes nothing: two runs equal, input order does not matter, nothing saved',()=>{
  game.user=gm;const before=JSON.stringify([game.journal.contents,[...saved],A.flags,B.flags]);
  const a=api.exportState(),b=api.exportState();assert.deepEqual(a,b);
  const reg=game.journal.contents[0].flags[MOD].registry;reg.instances.reverse();
  assert.deepEqual(api.exportState(),a);reg.instances.reverse();
  assert.equal(JSON.stringify([game.journal.contents,[...saved],A.flags,B.flags]),before);
});
test('absent data gives empty arrays, not errors',()=>{
  assert.deepEqual(buildStateExport({isGM:true}),{schema_version:STATE_EXPORT_SCHEMA,config:{cinders_per_character:null,starting_points:null,sockets_per_cinder:null,strain:null},cinders:[],stage_art:[],strain:[]});
  game.user=gm;const store=game.journal.contents.splice(0);const stageSaved=saved.get('definitionArtStages');saved.set('definitionArtStages',{});
  try{const out=api.exportState();assert.deepEqual([out.cinders,out.stage_art],[[],[]]);}finally{game.journal.contents.push(...store);saved.set('definitionArtStages',stageSaved);}
});
test('feature-detect: exportState is a function on the api',()=>{assert.equal(typeof api.exportState,'function');});
