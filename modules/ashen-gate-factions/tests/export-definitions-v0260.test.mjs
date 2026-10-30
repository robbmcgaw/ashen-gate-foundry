// 0.26.0 api.exportDefinitions(): the file Export downloads, GM only. Mocked Foundry; proves logic, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {makeFaction} from '../scripts/core.mjs';
const hooks=new Map();
globalThis.Hooks={on:(n,f)=>hooks.set(n,f),once:(n,f)=>hooks.set(n,f)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){return this;}async close(){return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const ns='ashen-gate-factions';
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];
globalThis.Folder={create:async data=>{const f={id:'F'+(folders.length+1),name:data.name,type:data.type,folder:data.folder??null,flags:{},getFlag(){return null;}};folders.push(f);return f;}};
const doc=(name,flags)=>{const d={id:'J'+(journal.length+1),name,folder:null,flags,ownership:{default:0},getFlag(m,k){return this.flags[m]?.[k];},async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);return this;},async update(){return this;},testUserPermission(u){return u.isGM;}};journal.push(d);return d;};
globalThis.JournalEntry={create:async x=>doc(x.name,x.flags??{}),updateDocuments:async()=>[]};
const faction=makeFaction({id:'FACTION-TEST-A',trackId:'RENOWN-TEST-A',name:'[TEST] Guild A'});
doc('[TEST] Guild A',{[ns]:{faction}});
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'P1',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const actors=[];actors.get=()=>null;
const mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:()=>{},get:(m,k)=>k==='playerAccessEnabled'?true:'',set:async()=>true},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:{},notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));

test('exportDefinitions writes ag-factions-source-export/0.4 definitions only',()=>{
  assert.equal(typeof mod.api.exportDefinitions,'function');
  const out=mod.api.exportDefinitions();
  assert.equal(out.schema_version,'ag-factions-source-export/0.4');
  assert.equal('schema' in out,false);
  assert.ok(Array.isArray(out.definitions));
  assert.ok(out.definitions.some(d=>d.id==='FACTION-TEST-A'));
  assert.ok(out.definitions.every(d=>!('state' in d)),'no standings');
  assert.equal(out.note,'Excludes all mutable campaign state and user discovery state.');
});
test('exportDefinitions is refused for players',()=>{
  game.user=p1;
  assert.throws(()=>mod.api.exportDefinitions(),/GM authorization required/);
  game.user=gm;
});
test('the Export button and the api share one function',()=>{
  const text=fs.readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
  assert.match(text,/static async exportAll\(\)\{try\{jsonDownload\(exportDefinitions\(\)/);
});
