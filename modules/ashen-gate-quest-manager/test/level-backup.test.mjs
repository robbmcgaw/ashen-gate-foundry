// 0.13.1 Character Hub level backups are never characters here. Mocked Foundry: proves the data/API checks, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,isLevelBackup,LEVEL_BACKUP_ERROR} from '../scripts/core.mjs';
import {saveRecord,updateState,getPrivate,savePersonalNote} from '../scripts/store.mjs';
import {partyActors,executeGrant,onActorSheetDrop} from '../scripts/rewards.mjs';

const QID='QUEST-TEST-BACKUP';
const source=()=>({id:QID,entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},
 visibility:'player',refs:[],name:'[TEST] Backup',source:{},public_summary:'[TEST]',objectives:[{key:'one',goal:'One'}],locations:[],parameters:{},outcomes:{}});
const state=(extra={})=>({status:'Active',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false,...extra});

function setup(){
 const docs=[];let id=0;const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async f=>{for(const [k,v] of Object.entries(f))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v] of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.default>=2||this.ownership?.[user.id]>=2;}}
 globalThis.JournalEntry={create:async data=>{const j=new Doc(data);docs.push(j);return j;}};
 const mk=(aid,name,owner,flags={})=>({id:aid,name,type:'character',flags,items:[],testUserPermission:(u)=>u.isGM||u.id===owner,
  createEmbeddedDocuments:async()=>{throw new Error('must not be called');}});
 const aria=mk('aria','[TEST] Aria','alice');
 // A Hub backup is GM-only; give it a player owner here too so the flag alone has to exclude it.
 const backup=mk('ariaL2','[TEST] Aria - level 2','alice',{'ashen-gate-character-hub':{levelBackup:{fromLevel:2}}});
 const actors=[aria,backup];actors.get=i=>actors.find(a=>a.id===i)??null;
 globalThis.game={user:gm,users:[gm,alice],journal:docs,actors,items:{contents:[]},folders:[],packs:{get:()=>null},modules:{get:()=>null}};
 return {docs,gm,alice,aria,backup};
}

test('isLevelBackup: only a truthy Hub levelBackup flag counts; safe when absent',()=>{
 assert.equal(isLevelBackup({flags:{'ashen-gate-character-hub':{levelBackup:{fromLevel:1}}}}),true);
 for(const a of [null,undefined,{},{flags:{}},{flags:{'ashen-gate-character-hub':{}}},{flags:{'ashen-gate-character-hub':{levelBackup:null}}}])assert.equal(isLevelBackup(a),false);
});

test('party reward recipients skip level backups; a normal character is unaffected',()=>{
 setup();
 assert.deepEqual(partyActors(state()).map(a=>a.id),['aria']);
 assert.deepEqual(partyActors(state({scope:'individual',actorId:'aria'})).map(a=>a.id),['aria']);
 assert.deepEqual(partyActors(state({scope:'individual',actorId:'ariaL2'})),[]);
});

test('an individual quest cannot be assigned to a level backup (save and update)',async()=>{
 const {docs}=setup();
 await assert.rejects(()=>saveRecord(source(),{state:state({scope:'individual',actorId:'ariaL2'})}),{message:LEVEL_BACKUP_ERROR});
 assert.equal(getPrivate(QID),null);
 await saveRecord(source(),{state:state({scope:'individual',actorId:'aria'})});
 assert.equal(getPrivate(QID).getFlag(MOD,'state').actorId,'aria');
 await assert.rejects(()=>updateState(QID,{actorId:'ariaL2'}),{message:LEVEL_BACKUP_ERROR});
 assert.equal(getPrivate(QID).getFlag(MOD,'state').actorId,'aria');
 assert.ok(docs.some(j=>j.getFlag(MOD,'public')));
 // Hidden quests are refused too, not only published ones.
 await assert.rejects(()=>updateState(QID,{revealed:false,status:'Hidden',actorId:'ariaL2'}),{message:LEVEL_BACKUP_ERROR});
});

test('rewards and notes refuse a level backup as the recipient',async()=>{
 const {alice,backup}=setup();
 await saveRecord(source(),{state:state()});
 const res=await executeGrant(QID,[{actorId:'ariaL2',lines:[{rewardKey:'rw-x',round:1,quantity:1}]}]);
 assert.deepEqual(res.results.map(r=>[r.actorId,r.ok,r.reason]),[['ariaL2',false,LEVEL_BACKUP_ERROR]]);
 const warns=[];
 assert.equal(onActorSheetDrop(backup,{agQuestReward:{questId:QID,rewardKey:'rw-x'}},{notify:{warn:m=>warns.push(m)}}),false);
 assert.deepEqual(warns,[LEVEL_BACKUP_ERROR]);
 game.user=alice;
 await assert.rejects(()=>savePersonalNote(QID,'ariaL2','x'),{message:LEVEL_BACKUP_ERROR});
});
