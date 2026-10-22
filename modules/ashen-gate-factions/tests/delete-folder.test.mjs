/** 0.16.0 Delete folder. In-memory Foundry V14-shaped test (mocked globals): proves logic, not the live Foundry UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,sourceDefinition,projectedFolders,deleteFolderText,removeFolder,newFolderKey,liveFolderKey,OTHER_FOLDER} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';

const hooks=new Map(),socketHandlers=new Map();
globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn),once:(name,fn)=>hooks.set(name,fn)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{async render(){this.rendered=true;return this;}async close(){this.rendered=false;return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1,dialog=null,answer='cancel';
const DialogV2={wait:async opts=>{dialog=opts;return opts.buttons.find(b=>b.action===answer)?.callback?.()??null;}};
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C,DialogV2}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];
globalThis.Folder={create:async data=>{const f={id:'F'+(folders.length+1),name:data.name,type:data.type,flags:structuredClone(data.flags??{}),getFlag(mod,key){return this.flags[mod]?.[key];}};folders.push(f);return f;}};
let count=0;
function makeDoc(data){const doc={id:'J'+(++count),name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  getFlag(mod,key){return this.flags[mod]?.[key];},
  async setFlag(mod,key,val){this.flags[mod]??={};this.flags[mod][key]=structuredClone(val);return this;},
  async update(p){if(p.name!==undefined)this.name=p.name;if(p.folder!==undefined)this.folder=p.folder;if(p.ownership)this.ownership=structuredClone(p.ownership);for(const [key,val] of Object.entries(p)){if(!key.startsWith('flags.'))continue;const [,mod,flag]=key.split('.');this.flags[mod]??={};this.flags[mod][flag]=structuredClone(val);}return this;},
  testUserPermission(user,level){return Boolean(user.isGM||(this.ownership[user.id]??this.ownership.default)>=level);}
};journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>makeDoc(x),updateDocuments:async rows=>{for(const row of rows)await journal.get(row._id).update(row);return rows;}};
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const actors=[{id:'A1',name:'A1',type:'character',ownership:{p1:3},items:[],testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=level;}}];actors.get=id=>actors.find(x=>x.id===id);
const settings={},notify=[],mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(m,key,v)=>{settings[key]=v.default;},get:(m,key)=>settings[key],set:async(m,key,v)=>settings[key]=v},socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
const ns='ashen-gate-factions';
const factionDoc=key=>makeDoc({name:`[TEST] Guild ${key}`,flags:{[ns]:{faction:sourceDefinition(makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:`[TEST] Guild ${key}`}))}}});
const g1=factionDoc('ONE'),g2=factionDoc('TWO'),g3=factionDoc('THREE');
// A deity never has a folder in the UI; an older stored record may still carry one, so it is counted and moved too.
const deity=makeDoc({name:'[TEST] Sun Deity',flags:{[ns]:{faction:sourceDefinition(makeDeity({id:'DEITY-QA-SUN',trackId:'RENOWN-QA-SUN',name:'[TEST] Sun Deity'}))}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));

const index=()=>journal.find(d=>d.getFlag(ns,'folderIndex')).getFlag(ns,'folderIndex');
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
const focused=[];const button=key=>({dataset:{action:'deleteFolder',key},focus(){focused.push(key);}});
let typed='';
dashboard.element={dataset:{agfBound:'yes'},
  querySelector:sel=>sel.includes('new-folder-name')?{value:typed,focus(){focused.push('new-folder-name');}}:null,
  querySelectorAll:sel=>sel.includes('deleteFolder')?index().folders.map(f=>button(f.key)):[]};
for(const name of ['[TEST] Folder A','[TEST] Folder B']){typed=name;await actions.createFolder.call(dashboard);}
const [A,B]=index().folders;
for(const d of [g1,g2])await d.setFlag(ns,'faction',{...d.getFlag(ns,'faction'),folder_key:A.key});
await deity.setFlag(ns,'faction',{...deity.getFlag(ns,'faction'),folder_key:A.key});
await g3.setFlag(ns,'faction',{...g3.getFlag(ns,'faction'),folder_key:B.key});
const groupScoreBefore=JSON.stringify(journal.filter(d=>d.getFlag(ns,'groupClaims')).map(d=>d.getFlag(ns,'groupClaims')));

test('setup: two folders, two factions and one deity in Folder A',()=>{
  assert.deepEqual(index().folders.map(f=>f.name),['[TEST] Folder A','[TEST] Folder B']);
  assert.equal(mod.api.getFactions().filter(f=>f.folder_key===A.key).length,2);
});

test('confirm text names the folder, counts what moves and says nothing is deleted',()=>{
  const t=deleteFolderText({name:'[TEST] Folder A',factions:2,deities:1});
  assert.equal(t.title,'Delete folder “[TEST] Folder A”?');
  assert.equal(t.yes,'Delete folder');
  assert.equal(t.message,`2 factions and 1 deity will move to ${OTHER_FOLDER}. They are not deleted.`);
  assert.equal(deleteFolderText({name:'X',factions:1,deities:0}).message,`1 faction and 0 deities will move to ${OTHER_FOLDER}. They are not deleted.`);
});

test('a player is refused in the API, the dashboard action and over the socket',async()=>{
  game.user=p1;
  try{
    await assert.rejects(mod.api.deleteFolder(A.key),/GM authorization required/);
    notify.length=0;dialog=null;
    await actions.deleteFolder.call(dashboard,null,{dataset:{key:A.key}});
    assert.equal(dialog,null,'no confirmation for a player');
    assert.ok(notify.some(n=>n.includes('GM authorization')));
  }finally{game.user=gm;}
  game.socket.emit(`module.${ns}`,{type:'deleteFolder',key:A.key,userId:'p1'});
  await new Promise(r=>setTimeout(r,10));
  assert.equal(index().folders.length,2,'folder index unchanged');
  assert.equal(g1.getFlag(ns,'faction').folder_key,A.key,'members unchanged');
});

test('Cancel (the default button) changes nothing',async()=>{
  answer='cancel';dialog=null;
  await actions.deleteFolder.call(dashboard,null,{dataset:{key:A.key}});
  assert.equal(dialog.window.title,'Delete folder “[TEST] Folder A”?');
  assert.match(dialog.content,/2 factions and 1 deity will move to Other factions\. They are not deleted\./);
  const [cancel,confirm]=dialog.buttons;
  assert.equal(cancel.label,'Cancel');assert.equal(cancel.default,true);
  assert.equal(confirm.label,'Delete folder');assert.equal(confirm.default,false);
  assert.equal(index().folders.length,2);
  assert.equal(g1.getFlag(ns,'faction').folder_key,A.key);
});

test('Delete folder moves its members to Other factions and deletes none of them',async()=>{
  const docsBefore=journal.length;
  answer='confirm';focused.length=0;
  await actions.deleteFolder.call(dashboard,null,{dataset:{key:A.key}});
  assert.deepEqual(index().folders.map(f=>f.key),[B.key],'only Folder A is gone');
  assert.ok(index().retired.includes(A.key),'deleted key is retired');
  assert.equal(journal.length,docsBefore,'no Journal created or removed');
  for(const d of [g1,g2,deity])assert.equal(d.getFlag(ns,'faction').folder_key,'',`${d.name} moved to Other factions`);
  assert.equal(g3.getFlag(ns,'faction').folder_key,B.key,'other folders untouched');
  assert.deepEqual(mod.api.getFactions().map(f=>f.id).sort(),['FACTION-QA-ONE','FACTION-QA-THREE','FACTION-QA-TWO']);
  assert.equal(mod.api.getDeities().length,1);
  assert.equal(JSON.stringify(journal.filter(d=>d.getFlag(ns,'groupClaims')).map(d=>d.getFlag(ns,'groupClaims'))),groupScoreBefore,'Renown and discovery untouched');
  assert.deepEqual(focused,[B.key],'focus moves to the next row\'s Delete folder');
  const other=projectedFolders({folders:index().folders,factions:mod.api.getFactions(),gm:true}).find(f=>f.key==='');
  assert.deepEqual(other.known.map(f=>f.id).sort(),['FACTION-QA-ONE','FACTION-QA-TWO']);
});

test('deleting the same folder again is a harmless no-op',async()=>{
  const before=JSON.stringify(index());
  assert.deepEqual(await mod.api.deleteFolder(A.key),{deleted:false,key:A.key,name:null,moved:{factions:0,deities:0}});
  dialog=null;await actions.deleteFolder.call(dashboard,null,{dataset:{key:A.key}});
  assert.equal(dialog,null,'no confirmation for a folder that is gone');
  assert.equal(JSON.stringify(index()),before);
  assert.equal(removeFolder(index(),A.key).folder,null);
});

test('deleting the last folder sends focus to the new-folder name',async()=>{
  focused.length=0;
  const result=await mod.api.deleteFolder(B.key);
  assert.equal(result.deleted,true);assert.deepEqual(result.moved,{factions:1,deities:0});
  assert.equal(g3.getFlag(ns,'faction').folder_key,'');
  typed='[TEST] Folder C';await actions.createFolder.call(dashboard);
  const C=index().folders[0];
  await actions.deleteFolder.call(dashboard,null,{dataset:{key:C.key}});
  assert.deepEqual(focused,['new-folder-name']);
});

test('a deleted folder key is never reused',()=>{
  const keys=['folder_a','folder_b','folder_c'];let i=0;
  assert.equal(newFolderKey({folders:[{key:'folder_b'}],retired:['folder_a']},()=>keys[i++]),'folder_c');
  assert.ok(!index().folders.some(f=>index().retired.includes(f.key)));
});

test('a folder reference that names no folder cannot dangle',async()=>{
  await g1.setFlag(ns,'faction',{...g1.getFlag(ns,'faction'),folder_key:'folder_gone'});
  assert.equal(mod.api.getFactions().find(f=>f.id==='FACTION-QA-ONE').folder_key,'','getFactions / Manager world export');
  const shown=projectedFolders({folders:[],factions:[g1.getFlag(ns,'faction')],gm:true});
  assert.deepEqual(shown.map(f=>[f.key,f.known.length]),[['',1]],'listed under Other factions, not hidden');
  assert.equal(liveFolderKey([{key:'k'}],'k'),'k');assert.equal(liveFolderKey([],'k'),'');
  // Import: a definition from another world keeps its id but lands in Other factions.
  const def=sourceDefinition(makeFaction({id:'FACTION-QA-IMPORT',trackId:'RENOWN-QA-IMPORT',name:'[TEST] Imported'}));def.folder_key='folder_elsewhere';
  const out=await mod.api.importFactions({schema_version:'ag-factions-source-export/0.4',definitions:[def]});
  assert.equal(out.added.length,1);
  assert.equal(journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-QA-IMPORT').getFlag(ns,'faction').folder_key,'');
});

test('Manage folders lists Delete folder… per row, keyboard reachable and named',()=>{
  const hbs=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
  assert.match(hbs,/<button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="deleteFolder" data-key="\{\{key\}\}" aria-label="Delete folder \{\{name\}\}…"[^>]*>Delete folder…<\/button>/);
});
