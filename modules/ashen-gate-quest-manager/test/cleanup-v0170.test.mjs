// 0.17.0 UI cleanup (audit QL-* / QJ-*). Mocked Foundry and a fake DOM: proves the logic and wiring, not the live
// Foundry UI (look, focus ring, keyboard in the real window: check those in Forge).
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MOD,initialState} from '../scripts/core.mjs';
import {El} from './helpers/fake-dom.mjs';

const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
let lastApp;const dialogs=[];let answer='confirm';
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;this.renders=(this.renders??0)+1;return this._renderHTML();}async close(){this.rendered=false;this.closed=true;return this;}},
 DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialogs.push(o);}}}}};
const gm={id:'gm',isGM:true,flags:{}},alice={id:'alice',isGM:false,flags:{}};
for(const u of [gm,alice]){u.getFlag=(m,k)=>m===MOD?structuredClone(u.flags[k]):undefined;u.setFlag=async(m,k,v)=>{u.flags[k]=structuredClone(v);};}
const docs=[];let n=0;
const setPath=(o,path,v)=>{const ks=path.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k]??={};t[ks.at(-1)]=structuredClone(v);};
class Doc{constructor(d){this.id=`j${++n}`;this.name=d.name;this.flags=structuredClone(d.flags??{});this.ownership=d.ownership;this._stats={modifiedTime:n};this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
 getFlag(m,k){return structuredClone(this.flags?.[m]?.[k]);}
 async update(data){for(const [k,v] of Object.entries(data)){if(k.startsWith('flags.'))setPath(this,k,v);else this[k]=v;}return this;}
 async delete(){docs.splice(docs.indexOf(this),1);}
 testUserPermission(u){return u.isGM||this.ownership?.[u.id]>=2||this.ownership?.default>=2;}}
globalThis.JournalEntry={create:async(data)=>{const d=new Doc(data);docs.push(d);return d;}};
const actors=[{id:'aria',name:'[TEST] Aria',type:'character',flags:{},testUserPermission:u=>u.isGM||u.id==='alice'}];actors.get=id=>actors.find(a=>a.id===id)??null;
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const mod={active:true,api:null,version:'0.17.0'};const notes=[];
const locations={active:true,api:{getLocation:id=>({'LOC-TEST-MILL':{id,name:'[TEST] Old Mill'}})[id]??null,locationsForQuest:id=>id==='QUEST-TEST-MILL'?[{id:'LOC-TEST-MILL'}]:[]}};
const users=[gm,alice];
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users,journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:id==='ashen-gate-locations'?locations:null}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
const store=await import('../scripts/store.mjs');
const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'player',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'[TEST] goal',visibility:'player'}],locations:[],parameters:{},outcomes:{},...o});
await store.saveRecord(src('QUEST-TEST-MILL','[TEST] Mill',{locations:['LOC-TEST-MILL']}),{state:{...initialState(src('QUEST-TEST-MILL','x')),status:'Active'}});
const content=new El();
const draw=async app=>{app._replaceHTML(await app._renderHTML(),content);return content;};
const reset=()=>{dialogs.length=0;notes.length=0;answer='confirm';game.user=gm;};
await mod.api.open();const app=lastApp;

test('QL-01: location links are real buttons (kit linkButton), in the window and the embed',async()=>{
 reset();app.tab='party';app.selectedId='QUEST-TEST-MILL';const html=await app.render();
 assert.match(html,/<li><button type="button" class="ag-link" data-action="open-location" data-id="LOC-TEST-MILL"><i class="fa-solid fa-map-location-dot" aria-hidden="true"><\/i> \[TEST\] Old Mill<\/button><\/li>/);
 assert.doesNotMatch(html,/<a class="agq-location"/);
 const host=new El();host.isConnected=true;const view=mod.api.embed.mount(host,{actorId:'aria'});await new Promise(r=>setTimeout(r,0));
 assert.match(host.innerHTML,/<button type="button" class="ag-link" data-action="open-location" data-id="LOC-TEST-MILL">/);view.unmount();
});
test('QL-04: Party puts the character picker in the Character notes heading; Individual keeps it in the toolbar',async()=>{
 reset();app.tab='party';let html=await app.render();
 const toolbar=h=>h.slice(h.indexOf('<div class="ag-toolbar agq-toolbar">'),h.indexOf('<div class="ag-split agq-split"'));
 assert.doesNotMatch(toolbar(html),/id="ag-actor"/);
 assert.match(html,/<h3 class="agq-h">Character notes<\/h3><label class="ag-field agq-notefor">Character<select id="ag-actor" aria-label="Character for notes">/);
 app.tab='individual';html=await app.render();
 assert.match(toolbar(html),/<select id="ag-actor" aria-label="Character">/);assert.doesNotMatch(html,/agq-notefor/);
});
test('QL-03: GM Setup has no overlay toggle; QL-08 one name, Quest Log',async()=>{
 reset();app.tab='setup';const html=await app.render();
 assert.doesNotMatch(html,/toggle-overlay|Objectives overlay/);
 const manifest=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url),'utf8'));
 assert.equal(manifest.title,'Ashen Gate | Quest Log');assert.doesNotMatch(manifest.description,/Quest Manager/);
 assert.match(fs.readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8'),/label:'Quest Log',title:'Quest Log'/,'launcher label');
});
test('QL-09: the individual character field shows only for an individual quest',async()=>{
 reset();app.tab='quests';app.gmId='QUEST-TEST-MILL';await draw(app);
 const field=content.querySelector('[data-actor-field]');assert.equal(field.hidden,true);
 const scope=content.querySelector('#ag-scope');scope.value='individual';scope.fire('change');assert.equal(field.hidden,false);
 scope.value='party';scope.fire('change');assert.equal(field.hidden,true);
 app.unsavedSource=false;
});
test('QL-10: editing the source JSON says the form is ignored and marks the form fields',async()=>{
 reset();app.tab='quests';app.gmId='QUEST-TEST-MILL';app.unsavedSource=false;app.sourceJsonEdited=false;await draw(app);
 const json=content.querySelector('#ag-source-json');json.fire('input');
 assert.equal(app.sourceJsonEdited,true);assert.equal(app.unsavedSource,true);
 assert.equal(content.querySelector('[data-source-status]').textContent,'Saving from JSON; form edits are ignored');
 assert.equal(content.querySelector('#ag-src-name').getAttribute('aria-disabled'),'true');assert.equal(json.getAttribute('aria-disabled'),null);
 answer='confirm';await app.action({dataset:{action:'cancel-edit'}},content);assert.equal(app.sourceJsonEdited,false);assert.equal(app.unsavedSource,false);
});
test('QL-14 + guardDirty: closing with unsaved quest edits asks; Keep editing (the default) keeps the window open',async()=>{
 reset();app.unsavedSource=true;answer='cancel';
 const before=app.closed;await app.close();
 assert.equal(app.closed,before,'not closed');assert.equal(app.unsavedSource,true);
 assert.equal(dialogs[0].window.title,'Discard unsaved changes?');
 assert.deepEqual(dialogs[0].buttons.map(b=>[b.label,b.default]),[['Keep editing',true],['Discard changes',false]],'Keep editing is the default');
 answer='confirm';await app.close();assert.equal(app.closed,true);assert.equal(app.unsavedSource,false);
 app.closed=false;app.rendered=true;
});
test('§7.6: Delete quest asks with Cancel as the default button',async()=>{
 reset();app.gmId='QUEST-TEST-MILL';answer='cancel';
 await app.action({dataset:{action:'delete'}},content);
 assert.equal(dialogs[0].window.title,'Delete [TEST] Mill?');
 assert.deepEqual(dialogs[0].buttons.map(b=>[b.label,b.default]),[['Cancel',true],['Delete quest',false]]);
 assert.ok(store.getPrivate('QUEST-TEST-MILL'),'nothing deleted');
});
test('QL-02/QL-07: assignments load into their own editor with a status; Cancel puts the blank one back',async()=>{
 reset();app.tab='quests';app.gmId='QUEST-TEST-MILL';
 await mod.api.assignments.save({id:'ASSIGN-TEST-ONE',entity_type:'Assignment',status:'draft',version:'0.1.0',provenance:{sources:['[TEST]']},visibility:'gm',refs:[{relation:'executes_objective',target_id:'QUEST-TEST-MILL',mode:'required'}],scope:'campaign_state',owner_system_id:'SYS-QUEST',objective_id:'QUEST-TEST-MILL',execution_status:'pending',participants:[],results:{}});
 await draw(app);
 assert.match(content.innerHTML,/data-action="edit-assignment"[^>]*>[^<]*<i[^>]*><\/i> Load into editor<\/button>/);
 const ta=content.querySelector('#ag-assignment-json');let scrolled=false;ta.scrollIntoView=()=>{scrolled=true;};
 await app.action({dataset:{action:'edit-assignment',id:'ASSIGN-TEST-ONE'}},content);
 assert.match(ta.value,/"id": "ASSIGN-TEST-ONE"/);assert.equal(content.querySelector('[data-assign-status]').textContent,'Editing a saved assignment');
 assert.ok(scrolled);assert.equal((await import('./helpers/fake-dom.mjs')).doc.focused,ta,'focus moves to the editor');
 await app.action({dataset:{action:'cancel-assignment'}},content);
 assert.match(ta.value,/"id": "ASSIGN-REPLACE-ME"/);assert.equal(content.querySelector('[data-assign-status]').textContent,'New assignment');
 // Edits in the assignment editor are not quest edits.
 ta.fire('input');assert.equal(app.unsavedSource,false);
});
test('QL-05: Filters (n) opens its row without a redraw, counts the filters set and remembers the choice',async()=>{
 reset();app.tab='quests';app.filtersOpen=false;await draw(app);
 const row=content.querySelector('#ag-gm-filters'),toggle=content.querySelector('#ag-gm-filters-toggle');assert.equal(row.hidden,true);
 const renders=app.renders??0;
 await app.action(toggle,content);
 assert.equal(row.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(app.filtersOpen,true);assert.equal(app.renders??0,renders);
 const type=content.querySelector('#ag-gm-type');type.value='contract';type.fire('change');
 assert.equal(content.querySelector('[data-filter-label]').textContent,'Filters (1)');
 await app.action({dataset:{action:'clear-filters'}},content);
 assert.equal(content.querySelector('#ag-gm-type').value,'all');assert.equal(app.qv.type,'all');
 await app.action(content.querySelector('#ag-gm-filters-toggle'),content);assert.equal(app.filtersOpen,false);
 // Ticking a quest brings the full-width bulk row; the list column keeps the hint.
 const box=content.querySelector('[data-pick="QUEST-TEST-MILL"]');box.checked=true;box.fire('change');
 assert.equal(content.querySelector('#ag-gm-bulk').hidden,false);assert.ok(content.querySelector('#ag-gm-bulkhint'),'the hint stays in the list column');
 assert.ok(content.querySelector('#ag-gm-bulk [data-action="bulk-delete"]'));assert.ok(!content.querySelector('.agq-list [data-action="bulk-delete"]'),'not in the narrow list column');
 app.picked.clear();
});
test('QL-13: Import JSON… previews the file, imports only on the labelled button and keeps quests already here',async()=>{
 reset();app.tab='quests';
 const file=records=>({text:async()=>JSON.stringify({schema_version:'ag-quest-source/0.1',records})});
 const fresh=src('QUEST-TEST-FRESH','[TEST] Fresh');
 answer='cancel';await app.importFile(file([fresh,src('QUEST-TEST-MILL','[TEST] Mill changed')]));
 assert.equal(dialogs[0].window.title,'Import 1 quest?');assert.equal(dialogs[0].buttons[1].label,'Import 1 quest');
 assert.match(dialogs[0].content,/Adds 1 quest: \[TEST\] Fresh\./);assert.match(dialogs[0].content,/Already here, kept as is: \[TEST\] Mill changed\./);
 assert.equal(store.getPrivate('QUEST-TEST-FRESH'),null,'Cancel imports nothing');
 answer='confirm';await app.importFile(file([fresh,src('QUEST-TEST-MILL','[TEST] Mill changed')]));
 assert.ok(store.getPrivate('QUEST-TEST-FRESH'));assert.equal(store.getPrivate('QUEST-TEST-MILL').getFlag(MOD,'source').name,'[TEST] Mill','existing quest kept');
 assert.match(notes.at(-1)[1],/1 quest imported/);
 dialogs.length=0;await app.importFile(file([fresh]));assert.equal(dialogs[0].window.title,'Nothing to import');
 dialogs.length=0;await app.importFile({text:async()=>'{"nope":1}'});assert.equal(dialogs[0].window.title,'Nothing imported');
 game.user=alice;await assert.rejects(()=>app.importFile(file([src('QUEST-TEST-P','[TEST] P')])),/GM permission required/);game.user=gm;
});
test('QJ-05: the Journal tells a player up front when no GM is connected',async()=>{
 reset();game.user=alice;app.tab='journal';
 users.activeGM=null;let html=await app.render();
 assert.match(html,/data-jaction="new" class="ag-btn ag-btn--sm"[^>]*disabled/);assert.match(html,/New session needs a GM connected/);
 users.activeGM=gm;html=await app.render();assert.doesNotMatch(html,/needs a GM connected/);
 delete users.activeGM;game.user=gm;app.tab='party';
 console.error=origError;
});
