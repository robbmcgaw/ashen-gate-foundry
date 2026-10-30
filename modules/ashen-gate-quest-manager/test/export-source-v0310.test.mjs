// 0.31.0 api.exportSource(): the package the Export JSON button downloads, GM only. Mocked Foundry; proves logic, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MOD,validSource,initialState,exportPackage} from '../scripts/core.mjs';
const callbacks=new Map();
globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn),on:()=>{},off:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:class{}}}};
const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false};
const src=(id,name,o={})=>validSource({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':'quest',...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),
 status:'approved',version:'1',provenance:{sources:['[TEST] pack']},visibility:'player',refs:[],name,public_summary:'s',objectives:[{key:'a',goal:'Do it'}],source:{description:'x'},locations:[],parameters:{},outcomes:{},...o});
const sources=[src('QUEST-TEST-ONE','[TEST] One'),src('ORDER-TEST-TWO','[TEST] Two')];
const docs=sources.map(source=>({getFlag:(mod,key)=>mod===MOD?({private:true,source,state:{...initialState(source),status:'Active',partyNotes:'[TEST] secret note'}})[key]:null,testUserPermission:u=>u.isGM}));
const module={active:true,api:null};
const actors=[];actors.get=()=>null;
globalThis.game={user:gm,settings:{register:()=>{},get:()=>true,set:async()=>{}},journal:docs,actors,users:[gm,alice],modules:{get:id=>id===MOD?module:null}};
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.mjs');
callbacks.get('init')();callbacks.get('ready')();

test('exportSource is on the api and writes the ag-quest-source/0.1 package with every quest, definitions only',()=>{
 assert.equal(typeof module.api.exportSource,'function');
 game.user=gm;
 const out=module.api.exportSource();
 assert.equal(out.schema_version,'ag-quest-source/0.1');
 assert.equal('schema' in out,false);
 assert.deepEqual(out.records.map(r=>r.id).sort(),['ORDER-TEST-TWO','QUEST-TEST-ONE']);
 assert.equal('states' in out,false,'no play state');
 assert.doesNotMatch(JSON.stringify(out),/secret note/);
 assert.deepEqual(out,exportPackage(sources),'byte-identical to what the Export JSON button builds');
});
test('exportSource is refused for players',()=>{
 game.user=alice;
 assert.throws(()=>module.api.exportSource(),/GM permission/);
 game.user=gm;
});
test('the Export JSON button and the api share one function',()=>{
 const text=fs.readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
 assert.match(text,/JSON\.stringify\(exportSource\(\),null,2\)/);
 assert.doesNotMatch(text,/JSON\.stringify\(exportPackage\(allPrivate/);
});
