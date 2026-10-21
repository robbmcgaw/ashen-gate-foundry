import test from 'node:test';import assert from 'node:assert/strict';
// 0.19.4: Character Hub level-up backups (flag ashen-gate-character-hub.levelBackup) are never listed or accepted as targets. Mocked Foundry; logic only.
import {isLevelBackup} from '../scripts/level-backup.mjs';
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),saved=new Map(),socketSent=[],socketListeners=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{},callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',REFUSED=/level backup copy, not a playable character/;
const node=id=>({id,perkId:null,cost:1,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const generic={id:'TB-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node('G1')]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[generic]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'};
const actorOf=(id,name,extra={})=>({id,name,type:'character',flags:{...extra},items:[],writes:0,
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u)=>u.isGM||u.id==='u1',
  async setFlag(m,k,v){this.writes++;(this.flags[m]??={})[k]=v;},async createEmbeddedDocuments(){return [];}});
const hero=actorOf('hero','[TEST] Hero');
const backup=actorOf('bak','[TEST] Hero - level 3',{'ashen-gate-character-hub':{levelBackup:{level:3,sourceActorId:'hero'}},'ashen-gate-manager':{}});
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[]},actors:{contents:[backup,hero],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner],get:id=>[gm,owner].find(u=>u.id===id),activeGM:gm},socket:{on:(_n,fn)=>socketListeners.push(fn),emit:(_s,m)=>socketSent.push(m)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

test('isLevelBackup: only a truthy Character Hub levelBackup flag; safe on missing data',()=>{
  assert.equal(isLevelBackup(backup),true);
  assert.equal(isLevelBackup(hero),false);
  for(const x of [null,undefined,{},{flags:null},{flags:{'ashen-gate-character-hub':{levelBackup:null}}}])assert.equal(isLevelBackup(x),false);
});
test('the character picker leaves the backup out and never selects it',()=>{
  game.user=gm;
  const app=api.open({actorId:backup.id});
  app._defaults();
  assert.equal(app.actorId,hero.id,'a backup id falls back to a real character');
});
test('a backup is refused as an award or unlock/spend target; nothing is written',async()=>{
  game.user=gm;
  await assert.rejects(()=>api.grantPoints(backup,'TB-GEN',3,'[TEST] award'),REFUSED);
  await assert.rejects(()=>api.unlock(backup,'TB-GEN','G1'),REFUSED);
  await assert.rejects(()=>api.accounts.setAccount(backup,'TB-GEN',{awarded:5,unlocks:['G1']}),REFUSED);
  await assert.rejects(()=>api.resetTree(backup,'TB-GEN'),REFUSED);
  assert.equal(backup.writes,0);
  assert.equal(backup.flags[MOD],undefined);
});
test('a player unlock request for a backup is refused by the GM client',async()=>{
  game.user=gm;socketSent.length=0;
  await socketListeners[0]({type:'unlock-request',requestId:'q1',userId:'u1',actorId:backup.id,treeId:'TB-GEN',nodeId:'G1'},'u1');
  const reply=socketSent.find(m=>m.type==='unlock-result'&&m.requestId==='q1');
  assert.equal(reply.ok,false);assert.match(reply.message,REFUSED);
  assert.equal(backup.writes,0);
});
test('a normal character is unaffected: award and unlock still work',async()=>{
  game.user=gm;
  await api.grantPoints(hero,'TB-GEN',3,'[TEST] award');
  const res=await api.unlock(hero,'TB-GEN','G1');
  assert.equal(res.ok,true);
  const acc=api.accounts.account(hero,'TB-GEN');
  assert.equal(acc.awarded,3);assert.deepEqual(acc.unlocks,['G1']);
});
