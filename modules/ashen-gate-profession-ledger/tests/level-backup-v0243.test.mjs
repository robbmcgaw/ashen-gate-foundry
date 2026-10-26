import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {isLevelBackup} from '../scripts/core.mjs';
// 0.24.3: Character Hub's level-up backup copies are never listed, picked or accepted as targets.
const hooks={};let api;
const values={partyRoster:['ana','ana-bk'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true};
const users=[gm];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:class{render(){return this;}static async wait(){return true;}}}},
  utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
const prof={id:'p1',name:'[TEST] Alchemy — Profession',type:'feat',system:{description:{value:''}},
  flags:{'ashen-gate-manager':{source:{sourceId:'PROF-TG-ALCHEMY',entityType:'Profession',visibility:'player',status:'approved',definition:{id:'PROF-TG-ALCHEMY',name:'[TEST] Alchemy'}}}}};
const makeActor=(id,name,extraFlags={})=>{const a={id,name,type:'character',hasPlayerOwner:true,items:[structuredClone(prof)],system:{skills:{},tools:{},abilities:{}},
  flags:{...extraFlags},testUserPermission:()=>true,
  setFlag:async(scope,key,value)=>{(a.flags[scope]??={})[key]=value;}};return a;};
const ana=makeActor('ana','[TEST] Ana');
const backup=makeActor('ana-bk','[TEST] Ana - level 3',{'ashen-gate-character-hub':{levelBackup:{sourceActorId:'ana',level:3}}});
const all=[ana,backup];
const ledgerModule={active:true,set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:[],get:()=>null},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const REFUSAL=/level backup copy, not a playable character/;

test('isLevelBackup reads only the Hub flag and is safe when it is absent',()=>{
  assert.equal(isLevelBackup(backup),true);
  assert.equal(isLevelBackup(ana),false);
  assert.equal(isLevelBackup(null),false);
  assert.equal(isLevelBackup({flags:{'ashen-gate-character-hub':{levelBackup:null}}}),false);
});

test('a backup id stored in the roster is ignored by the party, the picker and the GM character list',()=>{
  const app=api.open({view:'gm'});
  assert.deepEqual(app.actors.map(a=>a.id),['ana'],'party skips the stored backup id');
  assert.deepEqual(_test.myCharacters().map(a=>a.id),['ana']);
  const roster=app._roster();
  assert.match(roster,/\[TEST\] Ana/);
  assert.doesNotMatch(roster,/level 3/,'backup is not offered in the Party Roster picker');
  assert.deepEqual(values.partyRoster,['ana','ana-bk'],'saved roster is not rewritten');
});

test('assign refuses a backup id; a normal character and the default party are unaffected',()=>{
  assert.throws(()=>api.assign.preview({actorIds:['ana-bk']}),REFUSAL);
  assert.deepEqual(api.assign.preview({actorIds:['ana']}).actors.map(a=>a.id),['ana']);
  assert.deepEqual(api.assign.preview().actors.map(a=>a.id),['ana']);
});

test('XP award is refused for a backup (API and action route); a normal character gets it',async()=>{
  await assert.rejects(api.awardProfessionXP(backup,'PROF-TG-ALCHEMY',5),REFUSAL);
  await assert.rejects(_test.performAction('award-xp',{id:'PROF-TG-ALCHEMY',actorId:'ana-bk',points:5}),REFUSAL);
  await assert.rejects(api.adjustProfessionXP(backup,'PROF-TG-ALCHEMY',{delta:5}),REFUSAL);
  assert.equal(backup.flags['ashen-gate-profession-ledger'],undefined,'backup untouched');
  const out=await _test.performAction('award-xp',{id:'PROF-TG-ALCHEMY',actorId:'ana',points:5});
  assert.equal(out.award.actorId,'ana');
  assert.equal(ana.flags['ashen-gate-profession-ledger'].professionProgress.professions['PROF-TG-ALCHEMY'].xp,5);
});

test('gathering, crafting, learning and the embed refuse a backup',async()=>{
  // 0.34.0: no lead gatherer; a backup is simply never offered a roll.
  const herb={...structuredClone(prof),id:'p2',flags:{'ashen-gate-manager':{source:{...prof.flags['ashen-gate-manager'].source,sourceId:'PROF-TG-HERBALISM',definition:{id:'PROF-TG-HERBALISM',name:'[TEST] Herbalism'}}}}};
  ana.items.push(structuredClone(herb));backup.items.push(structuredClone(herb));
  const round=await api.gathering.start({node:{label:'[TEST] Patch',skill:'Herbalism',tier:1,dc:10},leadId:'ana-bk'});
  assert.deepEqual(round.rollers.map(r=>r.actorId),['ana'],'the backup is not a roller');
  await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'ana-bk',total:12}),/does not hold a profession for this gather/);
  assert.equal(api.gathering.cancel(round.id),true);
  await assert.rejects(api.craft(backup,'REC-TEST'),REFUSAL);
  await assert.rejects(api.learnRecipe(backup,backup.items[0]),REFUSAL);
  const el={innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},querySelector:()=>null,contains:()=>true};
  const embed=api.embed.mount(el,{actorId:'ana-bk'});
  assert.match(el.innerHTML,REFUSAL);
  embed.unmount();
});
