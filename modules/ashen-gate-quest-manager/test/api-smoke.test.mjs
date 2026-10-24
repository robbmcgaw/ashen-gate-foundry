import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
const callbacks=new Map();
globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn),on:()=>{},off:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:class{}}}};
let access=false;
const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false},bob={id:'bob',isGM:false};
const projection={id:'QUEST-SAFE',entity_type:'Objective',objective_kind:'quest',name:'Safe Public Name',status:'Available',scope:'party',actorId:null,objectives:[{key:'one',goal:'A public objective'}],locationIds:[]};
const j={getFlag:(mod,key)=>mod===MOD?({public:true,view:projection})[key]:null,testUserPermission:(u)=>u.id==='alice'||u.isGM};
const jHidden={getFlag:(mod,key)=>mod===MOD?({private:true,source:{id:'QUEST-HIDDEN',objective_kind:'quest',status:'approved'},state:{status:'Hidden'}})[key]:null,testUserPermission:(u)=>u.isGM};
const module={active:true,api:null};
const actors=[];actors.get=()=>null;
globalThis.game={user:gm,settings:{register:()=>{},get:()=>access,set:async(_,__,value)=>{access=value;}},journal:[j,jHidden],actors,users:[gm,alice,bob],modules:{get:id=>id===MOD?module:null}};
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.mjs');
callbacks.get('init')();callbacks.get('ready')();
test('mock boot publishes exact-ID consumer and Quest-owned Assignment API',()=>{
 assert.equal(module.api.version,'0.21.1');assert.equal(module.api.consumer.contract,'ag-objective-consumer/0.2-alpha');assert.equal(module.api.assignments.contract,'ag-quest-assignments/0.1-alpha');
});
test('direct non-GM APIs reject hidden Player Access, including resolver',()=>{
 game.user=alice;access=false;
 assert.throws(()=>module.api.getVisibleObjective('QUEST-SAFE'),/hidden by the GM/);
 assert.deepEqual(module.api.resolveObjective('QUEST-SAFE'),{status:'not_found'});
 assert.throws(()=>module.api.getGMSource('QUEST-HIDDEN'),/GM permission/);
 assert.throws(()=>module.api.getGMState('QUEST-HIDDEN'),/GM permission/);
 assert.throws(()=>module.api.assignments.list(),/GM permission/);
});
test('player access is never permission to see GM-only source/progress',()=>{
 game.user=alice;access=true;
 assert.equal(module.api.getVisibleObjective('QUEST-SAFE')?.name,'Safe Public Name');
 assert.equal(module.api.getVisibleObjective('QUEST-HIDDEN'),null);
 assert.deepEqual(module.api.resolveObjective('QUEST-HIDDEN'),{status:'not_found'});
 assert.throws(()=>module.api.getGMSource('QUEST-HIDDEN'),/GM permission/);
});
test('a second player cannot read projections they do not own',()=>{
 game.user=bob;access=true;
 assert.equal(module.api.getVisibleObjective('QUEST-SAFE'),null);
 assert.deepEqual(module.api.resolveObjective('QUEST-SAFE'),{status:'not_found'});
});
test('player cannot use direct GM state-write API',async()=>{
 game.user=alice;access=true;
 assert.throws(()=>module.api.setGMState('QUEST-SAFE',{status:'Completed'}),/GM permission/);
 await assert.rejects(()=>module.api.assignments.save({}),/GM permission/);
});
test('listQuests is GM-only and lists every quest for linking',()=>{
 game.user=alice;access=true;
 assert.throws(()=>module.api.listQuests(),/GM permission/);
 game.user=gm;
 assert.deepEqual(module.api.listQuests().map(q=>[q.id,q.status]),[['QUEST-HIDDEN','Hidden']],'GM sees hidden quests too');
 assert.deepEqual(module.api.listQuests().map(q=>[q.kind,q.definitionStatus]),[['quest','approved']],'kind and definition status are reported so pickers can label drafts');
});
