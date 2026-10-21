import test from 'node:test';import assert from 'node:assert/strict';
// 0.8.1: Character Hub level-backup copies (flags['ashen-gate-character-hub'].levelBackup) are never listed, picked or a target.
// Mocked Foundry globals and a stand-in Skill Trees: proves logic, not the live window.
import {isLevelBackup,LEVEL_BACKUP_MESSAGE} from '../scripts/cinder.mjs';
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
const A=makeActor('A','u1'),B=makeActor('B','u1');
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
const BACKUP=/That is a level backup copy, not a playable character\./;
let ember;

test('isLevelBackup: only a truthy Hub levelBackup flag; safe when flags are absent',()=>{
  assert.equal(isLevelBackup(Abak),true);
  assert.equal(isLevelBackup(A),false);
  for(const x of [null,undefined,{},{flags:null},{flags:{'ashen-gate-character-hub':{}}},{flags:{'ashen-gate-character-hub':{levelBackup:null}}}])assert.equal(isLevelBackup(x),false);
  assert.match(LEVEL_BACKUP_MESSAGE,BACKUP);
});
test('pickers: the character list and the bind / transfer choices leave out the backup copy',async()=>{
  game.user=gm;ember=await cinder.create(DEF);
  const app=api.open();
  assert.deepEqual((await app._prepareContext({})).actors.map(a=>a.id),['A','B'],'GM character list');
  game.user=alice;assert.deepEqual((await app._prepareContext({})).actors.map(a=>a.id),['A','B'],'owner character list');
  game.user=gm;
  const dialogs=foundry.applications.api,before=dialogs.DialogV2;let seen=null;
  dialogs.DialogV2={wait:async o=>{seen=o;return o.buttons.find(b=>b.action==='cancel').callback();}};
  try{
    await app._bind(ember.instanceId,false);
    assert.match(seen.content,/value="A"/);assert.match(seen.content,/value="B"/);assert.doesNotMatch(seen.content,/Abak|level 3/,'bind choices');
  }finally{dialogs.DialogV2=before;}
});
test('API: bind, transfer, rehook, Push, sockets and Strain refuse the backup; a normal character is unaffected',async()=>{
  game.user=gm;
  await assert.rejects(cinder.bind(ember.instanceId,Abak),BACKUP);
  assert.equal(cinder.instances()[0].status,'unbound','nothing recorded');assert.equal(Abak.flags[MOD],undefined,'no bearer marker on the copy');
  await cinder.bind(ember.instanceId,A);
  assert.equal(cinder.instances()[0].bearer.actorId,'A');
  await assert.rejects(cinder.transfer(ember.instanceId,Abak),BACKUP);
  assert.equal(cinder.instances()[0].bearer.actorId,'A','still on A');
  await cinder.transfer(ember.instanceId,B);assert.equal(cinder.instances()[0].bearer.actorId,'B');
  await assert.rejects(cinder.rehook(Abak),BACKUP);
  await assert.rejects(cinder.push(Abak,'POWER-TEST-SPARK','amplify'),BACKUP);
  await assert.rejects(api.sockets.attach(Abak,ember.instanceId,'X1'),BACKUP);
  await assert.rejects(api.strain.add(Abak,1,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST]'}),BACKUP);
  await assert.rejects(st.api.grantPoints(Abak,tree.id,1,'[TEST] award'),BACKUP,'Skill Trees points refused for the copy');
  // A player's relayed Push for the copy is refused on the GM client too.
  emitted.length=0;for(const fn of socketHandlers)await fn({type:'cinder-push',requestId:'q1',userId:'u1',actorId:'Abak',powerId:'POWER-TEST-SPARK',modeId:'amplify'},'u1');
  assert.deepEqual([emitted.at(-1).ok,emitted.at(-1).message],[false,LEVEL_BACKUP_MESSAGE]);
});
