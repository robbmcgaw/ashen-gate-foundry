import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,reset} from '../fixtures/setup.mjs';
const NS='ashen-gate-utilities';
let id=0;
const collection=()=>{const arr=[];arr.find=Array.prototype.find;return arr;};
const actors=collection(),items=collection(),tables=collection();
function createDoc(collection){return async d=>{const doc={...d,id:`document-${++id}`,delete:async()=>{collection.splice(collection.indexOf(doc),1);},getFlag(ns,key){return this.flags?.[ns]?.[key];}};collection.push(doc);return doc;};}
globalThis.Actor={create:createDoc(actors)};globalThis.Item={create:createDoc(items)};globalThis.RollTable={create:createDoc(tables)};
globalThis.CONST={TABLE_RESULT_TYPES:{TEXT:'text',DOCUMENT:'document'}};
let allow=true,confirmCalls=0;
globalThis.confirm=()=>{confirmCalls++;return allow;};
globalThis.game={user:{isGM:true},modules:new Map([[NS,{active:true}]]),users:[{id:'gm',isGM:true},{id:'playerA',isGM:false,name:'Alice'},{id:'playerB',isGM:false,name:'Bob'}],actors,items,tables,settings:{set:async()=>{}}};
globalThis.ui={notifications:{info:()=>{}}};

test('fixture uses real native Actor/Item/RollTable creation calls',async()=>{
 const result=await setup();assert.equal(result.actors.length,2);assert.equal(result.tables.length,2);assert.equal(actors.length,2);assert.equal(items.length,1);assert.equal(tables.length,2);
 assert.ok(actors.every(x=>x.type==='character'&&x.flags[NS].fixtureId==='AG-UTILITIES-V020-DISPOSABLE'));
 assert.equal(tables[0].results[0].type,'text');assert.equal(tables[1].results[0].type,'document');
});
test('setup is idempotent for tagged native documents',async()=>{
 await setup();assert.equal(actors.length,2);assert.equal(items.length,1);assert.equal(tables.length,2);
});
test('non-GM cannot run fixture setup or reset',async()=>{
 game.user={id:'playerA',isGM:false};await assert.rejects(setup(),/GM/);await assert.rejects(reset(),/GM/);game.user={id:'gm',isGM:true};
});
test('default reset preserves unrelated native documents and stash',async()=>{
 const other=await Actor.create({name:'Actual Character',type:'character'});
 const stash=await Actor.create({name:'Ashen Gate | Party Stash',type:'npc',flags:{[NS]:{partyStash:true}}});
 const result=await reset();assert.deepEqual(result.deleted,{actors:2,items:1,tables:2});assert.equal(actors.length,2);assert.ok(actors.includes(other));assert.ok(actors.includes(stash));
});
test('optional stash cleanup needs explicit second confirmation',async()=>{
 await setup();const stash=actors.find(x=>x.name==='Ashen Gate | Party Stash');
 allow=true;confirmCalls=0;const outcome=await reset({deleteStash:true});
 assert.equal(confirmCalls,2);assert.equal(outcome.stashDeleted,true);assert.ok(!actors.includes(stash));assert.ok(actors.some(x=>x.name==='Actual Character'));
});
