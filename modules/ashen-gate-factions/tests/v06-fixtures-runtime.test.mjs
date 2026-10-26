import test from 'node:test';
import assert from 'node:assert/strict';
const journal=[],actors=[],items=[],folders=[];
let counter=0,refreshCalls=0;
const moduleId='ashen-gate-factions';
const gm={id:'gm',name:'GM',isGM:true},p1={id:'p1',name:'Player 1',isGM:false},p2={id:'p2',name:'Player 2',isGM:false};
const users=[gm,p1];
const mod={active:true,api:{refreshPlayerViews:async()=>{refreshCalls++;return {status:'requested'};}}};
const setupDoc=(cls,collection)=>Object.assign(cls,{async create(data){const id=`QA${++counter}`;const doc={...data,id,uuid:`${cls.documentName}.${id}`,flags:structuredClone(data.flags??{}),getFlag(ns,key){return this.flags[ns]?.[key];}};collection.push(doc);return doc;},async deleteDocuments(ids){for(const id of ids){const i=collection.findIndex(d=>d.id===id);if(i>=0)collection.splice(i,1);}}});
class JournalEntry{}JournalEntry.documentName='JournalEntry';class Actor{}Actor.documentName='Actor';class Item{}Item.documentName='Item';
for(const [c,a] of [[JournalEntry,journal],[Actor,actors],[Item,items]])setupDoc(c,a);
globalThis.JournalEntry=JournalEntry;globalThis.Actor=Actor;globalThis.Item=Item;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
globalThis.Folder={create:async data=>{const d={...data,folder:data.folder??null,id:`F${folders.length}`,getFlag(mod,key){return this.flags?.[mod]?.[key]}};folders.push(d);return d;}};
globalThis.game={user:gm,users,journal,actors,items,folders,modules:{get:()=>mod}};
const {setup,reset,FIXTURE}=await import('../fixtures/setup.mjs');
test('Fixture refuses missing second real user without any world mutations',async()=>{
 await assert.rejects(setup(),/two separate non-GM/);
 assert.equal(actors.length,0);assert.equal(journal.length,0);assert.equal(refreshCalls,0);
});
test('Fixture creates real Foundry-shaped owned Actors, linked Journals, Item, and source/state separation',async()=>{
 users.push(p2);
 const result=await setup();assert.equal(result.tag,FIXTURE);
 assert.equal(actors.length,2);assert.equal(items.length,1);assert.equal(journal.length,14);
 assert.equal(folders.length,2);assert.equal(actors[0].ownership.p1,3);assert.equal(actors[1].ownership.p2,3);
 assert.equal(journal.filter(d=>d.getFlag(moduleId,'faction')).length,3);
 assert.equal(journal.filter(d=>d.getFlag(moduleId,'groupClaims')).length,3);
 assert.equal(journal.filter(d=>d.getFlag(moduleId,'individual')).length,6);
 assert.equal(journal.find(d=>d.getFlag(moduleId,'groupClaims')?.faction_id==='FACTION-PLAYTEST-FAR').getFlag(moduleId,'groupClaims').standing.score,5);
 assert.equal(journal.find(d=>d.getFlag(moduleId,'groupClaims')?.faction_id==='FACTION-PLAYTEST-GILT').getFlag(moduleId,'groupClaims').field_reveals.mode,'selective');
 const defs=journal.filter(d=>d.getFlag(moduleId,'faction'));
 for(const d of defs){assert.equal(d.ownership.default,0);assert.equal(d.getFlag(moduleId,'faction').state,undefined);}
 assert.ok(defs.find(d=>d.getFlag(moduleId,'faction').id==='FACTION-PLAYTEST-FAR').getFlag(moduleId,'faction').refs.some(r=>r.target_id==='QUEST-PLAYTEST-SUPPLY-ROAD'));
 assert.equal(items[0].ownership.default,0);assert.equal(refreshCalls,1);
});
test('Fixture is idempotent and reset only deletes marked QA docs',async()=>{
 await assert.rejects(setup(),/already present/);
 const untouched={id:'ORIGINAL',getFlag:()=>null};journal.push(untouched);
 const r=await reset();assert.equal(r.removed,17);assert.equal(journal.length,1);assert.equal(journal[0],untouched);
 assert.equal(actors.length,0);assert.equal(items.length,0);assert.equal(refreshCalls,2);
});
