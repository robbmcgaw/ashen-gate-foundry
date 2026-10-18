import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {saveRecord,updateState,removeRecord,allPrivate,visibleById,savePersonalNote,reconcileActorAudience} from '../scripts/store.mjs';
function setup(){
 const docs=[];let id=0;const gm={id:'gm',isGM:true},A={id:'A',isGM:false},B={id:'B',isGM:false};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.deleted=false;this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async(fields)=>{for(const [k,v] of Object.entries(fields))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v]of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){this.deleted=true;docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.[user.id]>=2||this.ownership?.default>=2;}}
 globalThis.JournalEntry={create:async(data)=>{const j=new Doc(data);docs.push(j);return j;}};
 const actor={id:'actorA',name:'A character',testUserPermission:(u)=>u.isGM||u.id==='A',flags:{},getFlag:(m,k)=>actor.flags?.[m]?.[k],setFlag:async(m,k,val)=>{actor.flags[m]??={};actor.flags[m][k]=val;}};
 const actors=[actor];actors.get=id=>id==='actorA'?actor:null;
 globalThis.game={user:gm,users:[gm,A,B],journal:docs,actors};
 const source={id:'QUEST-SCOPE-TEST',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'player',refs:[],name:'Scope Test',source:{},public_summary:'Test',objectives:[{key:'one',goal:'One'}],locations:[],parameters:{},outcomes:{}};
 return {docs,gm,A,B,actor,source};
}
test('regression: Individual→Party revokes restrictive permission and never reuses old projection',async()=>{
 const {docs,source,gm,A,B}=setup();await saveRecord(source,{state:{status:'Available',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 const previous=docs.find(j=>j.getFlag(MOD,'public'));
 assert.deepEqual(previous.ownership,{default:0,gm:2,A:2});
 await updateState(source.id,{scope:'party'});
 const current=docs.find(j=>j.getFlag(MOD,'public'));
 assert.notEqual(current._id,previous._id);assert.equal(previous.deleted,true);
 assert.deepEqual(current.ownership,{default:2});assert.equal(current.testUserPermission(B),true);
 assert.equal(docs.filter(j=>j.getFlag(MOD,'private')).length,1);
});
test('regression: deleting Individual quest immediately deletes player note access projection',async()=>{
 const {docs,source,A}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 const noteTarget=docs.find(j=>j.getFlag(MOD,'public'));
 game.user=A;await savePersonalNote(source.id,'actorA','Character wrote this note');
 game.user={isGM:true,id:'gm'};await removeRecord(source.id);
 assert.equal(noteTarget.deleted,true);assert.equal(docs.filter(j=>j.getFlag(MOD,'public')).length,0);
 assert.equal(visibleById(source.id),null);assert.equal(allPrivate().length,0);
});
test('GM-only hidden source is never projected, player API cannot modify it',async()=>{
 const {docs,source,A}=setup();source.visibility='gm';await saveRecord(source);
 assert.equal(docs.filter(j=>j.getFlag(MOD,'public')).length,0);
 game.user=A;await assert.rejects(()=>updateState(source.id,{status:'Available'}),/GM permission/);
 await assert.rejects(()=>removeRecord(source.id),/GM permission/);
});
test('switch owner revokes former owner without orphan projection',async()=>{
 const {docs,source}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 const old=docs.find(j=>j.getFlag(MOD,'public'));
 await assert.rejects(()=>updateState(source.id,{actorId:'missing'}),/Individual Actor unavailable/);
 const gmRow=allPrivate()[0];assert.equal(gmRow.state.actorId,'actorA'); // invalid new Actor did not persist.
 assert.equal(old.deleted,false);
});

test('Actor ownership change revokes old projection grants after GM reconcile',async()=>{
 const {docs,source,actor,A}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 const original=docs.find(j=>j.getFlag(MOD,'public'));assert.equal(original.testUserPermission(A),true);
 actor.testUserPermission=()=>false;await reconcileActorAudience('actorA');
 const newProjection=docs.find(j=>j.getFlag(MOD,'public'));assert.equal(original.deleted,true);assert.equal(newProjection.testUserPermission(A),false);
});
test('deleted Actor yields no public projection on GM reconciliation',async()=>{
 const {docs,source}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 game.actors.get=()=>null;game.actors.length=0;await reconcileActorAudience('actorA');assert.equal(docs.filter(j=>j.getFlag(MOD,'public')).length,0);
});
test('private character notes cannot be viewed by a different player',async()=>{
 const {source,docs,A,B}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 const note=docs.find(j=>j.getFlag(MOD,'notesFor')===source.id);assert.ok(note);assert.equal(note.testUserPermission(A),true);assert.equal(note.testUserPermission(B),false);
 game.user=A;await savePersonalNote(source.id,'actorA','Private actor note');assert.ok(note.pages[0].text.content.includes('Private actor note'));
 game.user=B;await assert.rejects(()=>savePersonalNote(source.id,'actorA','Tamper'),/not visible/);
});
test('hiding and revealing preserves character authored notes in GM-only archival state',async()=>{
 const {source,docs,A}=setup();await saveRecord(source,{state:{status:'Active',scope:'individual',actorId:'actorA',revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}});
 game.user=A;await savePersonalNote(source.id,'actorA','Note persisted while hidden');game.user={id:'gm',isGM:true};
 await updateState(source.id,{status:'Hidden'});assert.equal(docs.filter(j=>j.getFlag(MOD,'notesFor')===source.id).length,0);
 assert.ok(allPrivate()[0].document.getFlag(MOD,'notesArchive').length);
 await updateState(source.id,{status:'Active'});assert.ok(docs.find(j=>j.getFlag(MOD,'notesFor')===source.id).pages[0].text.content.includes('Note persisted while hidden'));
});
test('all five approved campaign statuses preserve independent Objective source lifecycle',async()=>{
 const {source}=setup();source.status='approved';await saveRecord(source);
 for(const status of ['Hidden','Available','Active','Completed','Failed']){
   const updated=await updateState(source.id,{status});
   assert.equal(updated.status,status);
   assert.equal(allPrivate()[0].source.status,'approved');
   assert.equal(allPrivate()[0].state.status,status);
 }
});
test('source update preserves campaign progress and reward state, not source lifecycle',async()=>{
 const {source}=setup();await saveRecord(source,{state:{status:'Completed',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{one:'complete'},partyNotes:'Shared completed note',gmNotes:'GM outcome',rewardRecorded:true}});
 const revision={...source,status:'approved',version:'2.0.0',name:'New source title'};
 await saveRecord(revision,{replace:true});
 const after=allPrivate()[0];assert.equal(after.source.version,'2.0.0');assert.equal(after.source.status,'approved');assert.equal(after.state.status,'Completed');assert.equal(after.state.progress.one,'complete');assert.equal(after.state.rewardRecorded,true);assert.equal(after.state.gmNotes,'GM outcome');
});
test('Quest-owned delegated ASSIGN blocks deletion of its Objective',async()=>{
 const {source}=setup();await saveRecord(source);
 const {saveAssignment}=await import('../scripts/assignments.mjs');
 await saveAssignment({id:'ASSIGN-SCOPE-TEST',entity_type:'Assignment',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},visibility:'gm',refs:[{relation:'executes_objective',target_id:source.id,mode:'required'}],scope:'campaign_state',owner_system_id:'SYS-QUEST',objective_id:source.id,execution_status:'pending',participants:[],results:{}},{objectiveExists:()=>true});
 await assert.rejects(()=>removeRecord(source.id),/Remove\/reassign Quest-owned ASSIGN/);
 assert.equal(allPrivate().length,1);
});
