import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeStore,migrateLocationNodes,previewLocationCopy,planCopyUndo,applyCopyUndo,saveTemplate} from '../scripts/nodes.mjs';
// 0.35.5: Copy Location nodes shows a preview and asks first; the last copy can be undone (snapshot first, edited and in-use templates kept). Synthetic ([TEST]).

const entry=(id,label,skill,extra={})=>({id,label,skill,tier:1,dc:10,materialId:'MAT-TG-HERB',visible:true,available:true,...extra});
const bulk=(n,skill,prefix)=>Array.from({length:n},(_,i)=>entry(`${prefix}${i}`,`[TEST] ${prefix} ${i}`,skill));

test('pure: the preview is the real copy on a throwaway store, with the activity breakdown and the no-activity count',()=>{
 const locs=[{id:'LOC-A',name:'[TEST] A',resources:[...bulk(3,'Herbalism','h'),...bulk(2,'Mining','m'),...bulk(4,'[TEST] Whistling','w')]}];
 const store=normalizeStore({});
 const p=previewLocationCopy(store,locs);
 assert.equal(p.total,9);assert.deepEqual(p.byActivity,{herbalism:3,mining:2});assert.equal(p.noActivity,4);assert.equal(p.created.length,9);
 assert.equal(store.nodes.length,0,'the preview never writes');
 assert.equal(migrateLocationNodes(store,locs).created.length,p.total,'the preview cannot disagree with the copy');
});

test('pure: undo plan: untouched templates go; edited and Location-used ones are kept unless ticked; matched ones are unlinked; ids are not retired; older copies are not undone by a second press',()=>{
 const first=migrateLocationNodes(normalizeStore({}),[{id:'LOC-A',name:'[TEST] A',resources:[entry('x1','[TEST] Old patch','Herbalism')]}],{now:1,runId:'run1'}).store;
 const locs=[{id:'LOC-A',name:'[TEST] A',resources:[entry('x1','[TEST] Old patch','Herbalism'),entry('x2','[TEST] Twin','Herbalism'),...bulk(3,'Mining','m')]},
  {id:'LOC-B',name:'[TEST] B',resources:[entry('t1','[TEST] Old patch','Herbalism')]}];
 const second=migrateLocationNodes(first,locs,{now:2,runId:'run2'});
 let store=second.store;
 assert.equal(second.linked,1,'the identical entry at B matched the older template');
 const made=second.created;assert.equal(made.length,4);
 assert.ok(store.nodes.filter(n=>made.includes(n.id)).every(n=>n.meta.copyRun==='run2'),'new copies carry a run id');
 // The GM edits one, and a Location points at another.
 const edited=store.nodes.find(n=>n.id===made[0]);store={...store,nodes:store.nodes.map(n=>n.id===made[0]?{...n,meta:{...n.meta,edited:true}}:n)};
 const refs=id=>id===made[1]?[{kind:'reference',locationName:'[TEST] C'}]:[];
 const plan=planCopyUndo(store,{references:refs});
 assert.equal(plan.total,4);assert.deepEqual([plan.remove.length,plan.editedSince.length,plan.inUse.length],[2,1,1]);
 assert.equal(plan.unlink.length,1,'the older template matched by this run');
 const after=applyCopyUndo(store,plan);
 assert.deepEqual(after.nodes.map(n=>n.id).sort(),[...first.nodes.map(n=>n.id),edited.id,made[1]].sort());
 assert.equal(after.nodes.find(n=>n.id===first.nodes[0].id).meta.legacy.length,1,'the entry this run added to its copied-from list is taken off again');
 assert.deepEqual(after.retiredIds,[],'ids are not retired: the copy is as if it never ran');
 assert.equal(planCopyUndo(after,{references:refs}),null,'a second press finds nothing to undo; the older copy is not undone');
 const ticked=applyCopyUndo(store,plan,{alsoRemove:[edited.id,made[1],'NODE-NOT-IN-PLAN']});
 assert.ok(!ticked.nodes.some(n=>n.id===edited.id||n.id===made[1]),'ticked extras go too');assert.ok(ticked.nodes.some(n=>n.id===first.nodes[0].id));
 const again=migrateLocationNodes(after,locs,{now:3});
 assert.deepEqual([again.created.length,again.linked],[2,1],'entries of removed templates can be copied again; kept ones are not copied twice');
});

/* ---- Mocked Foundry ----------------------------------------------------------------------------- */
const hooks={},errors=[],infos=[],chats=[];let api,confirmAnswer=true,lastConfirm=null,failSnapshot=false;
const values={partyRoster:[],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}close(){}static async wait(o){lastConfirm=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{chats.push(structuredClone(x));return x;},getSpeaker:()=>({})};
const journals=[],snapshotOrder=[];
const setPath=(o,k,v)=>{const parts=k.split('.');while(parts.length>1){const p=parts.shift();o[p]??={};o=o[p];}o[parts[0]]=v;};
const makeJournal=data=>{const j={...structuredClone(data),getFlag:(scope,key)=>j.flags?.[scope]?.[key],update:async u=>{for(const [k,v] of Object.entries(u))setPath(j,k,structuredClone(v));}};return j;};
globalThis.JournalEntry={create:async data=>{
  if(!game.user.isGM)throw Error('players cannot create');
  if(data.flags?.['ashen-gate-profession-ledger']?.role==='node-copy-undo-snapshot'){
    if(failSnapshot)throw Error('disk full');
    snapshotOrder.push(game.journal.find(j=>j.flags?.['ashen-gate-profession-ledger']?.role==='gm-data')?.flags['ashen-gate-profession-ledger'].gatheringNodes.nodes.length);
  }
  const j=makeJournal({id:`j${journals.length}`,...data});journals.push(j);return j;}};
const locs=[{id:'LOC-A',name:'[TEST] A',revealed:true,resources:[entry('seed','[TEST] Seed','Herbalism')]}];
const locApi={listLocations:()=>structuredClone(locs),resourcesAt:id=>structuredClone(locs.find(l=>l.id===id)?.resources??[]),markNodeExhausted:async()=>{}};
const ledgerModule={active:true,version:'0.40.0',set api(v){api=v},get api(){return api}};
const modules={'ashen-gate-profession-ledger':ledgerModule,'ashen-gate-locations':{active:true,version:'0.20.4',api:locApi}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:[],get:()=>null},actors:{contents:[],get:()=>null},journal:journals,
  socket:{emit:()=>{},on:()=>{}},modules:{get:id=>modules[id]},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const here=path.dirname(fileURLToPath(import.meta.url));
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
await new Promise(r=>setTimeout(r,5));await _test.nodeWrites();
const app=api.open({view:'nodes'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async()=>{app.view='nodes';return (await app._prepareContext({})).html;};
const ids=()=>_test.readNodeStore().nodes.map(n=>n.id).sort();

test('the world starts with the seed copied at ready (a first, older run); Robb’s mistake is a later run of many nodes',async()=>{
 assert.equal(_test.readNodeStore().migrations.length,1);
 // A hand-made template, then Location nodes appear (95 with an activity, many without), as in the real world.
 await api.gathering.templates.create({id:'NODE-TEST-HAND',name:'[TEST] Hand made',activity:'mining',tier:{min:1,max:1},materials:{common:[{materialId:'MAT-TG-HERB'}]}});
 locs[0].resources.push(...bulk(6,'Herbalism','h'),...bulk(5,'Fishing','f'),...bulk(9,'[TEST] Whistling','w'));
});

test('Copy Location nodes… opens a preview first: how many, by activity, how many with no activity; nothing is created until it is confirmed',async()=>{
 game.user=gm;const before=ids();
 await app._click('node-copy-locations');
 let h=await html();
 assert.match(h,/This creates <strong>20 node templates<\/strong>/);assert.match(h,/Herbalism: <strong>6<\/strong>/);assert.match(h,/Fishing: <strong>5<\/strong>/);
 assert.match(h,/No activity set: <strong>9<\/strong>/);assert.match(h,/you can undo the copy/);
 assert.match(h,/data-action="node-copy-apply" ><i[^>]*><\/i> Copy 20 nodes…/);assert.match(h,/data-action="node-copy-cancel"/);
 assert.deepEqual(ids(),before,'a preview creates nothing');
 await app._click('node-copy-cancel');assert.equal(app.nodeCopy,null);assert.deepEqual(ids(),before);
 // Confirm: the dialog names the count, then 20 are created; the API's direct copy is unchanged.
 await app._click('node-copy-locations');
 confirmAnswer=false;await app._click('node-copy-apply');assert.deepEqual(ids(),before,'Cancel creates nothing');
 confirmAnswer=true;await app._click('node-copy-apply');
 assert.equal(lastConfirm.window.title,'Copy 20 Location gathering nodes into templates?');assert.match(lastConfirm.content,/9 with no activity set/);assert.match(lastConfirm.content,/You can undo the copy/);
 assert.equal(_test.readNodeStore().nodes.length,before.length+20);
 h=await html();
 assert.match(h,/20 Location gathering nodes copied into templates|21 Location gathering nodes copied into templates/,'the banner');assert.match(h,/data-action="node-undo-open">Undo last copy…/,'with the undo in the banner');
 assert.match(h,/data-action="node-undo-open" ><i[^>]*><\/i> Undo last copy…/,'and next to the copy button');
});

test('Undo last copy…: a preview grouped by activity, edited-since and in-use templates kept with ticks, then a danger confirmation; the snapshot is saved before anything is removed',async()=>{
 game.user=gm;
 const store=_test.readNodeStore(),last=store.migrations.at(-1);
 assert.equal(last.created.length,20);assert.ok(last.runId,'a run id is recorded');
 // After the copy the GM edits one template and points a Location entry at another.
 const edited=last.created[0],inUse=last.created[1],lockedBefore=structuredClone(locs);
 await api.gathering.templates.update({...api.gathering.templates.get(edited),name:'[TEST] Edited after the copy'});
 locs[0].resources.push({id:'pointer',nodeId:inUse,tier:1});
 const locsBefore=structuredClone(locs);
 await app._click('node-undo-open');
 let h=await html();
 assert.match(h,/created <strong>?20 node templates|created 20 node templates/);assert.match(h,/Will be removed \(18\)/);
 assert.match(h,/Edited since the copy, kept \(1\)/);assert.match(h,/\[TEST\] Edited after the copy/);assert.match(h,/Used by a Location, kept \(1\)/);assert.match(h,/Used by \[TEST\] A/);
 assert.match(h,/<span class="ag-fold__title">No activity set<\/span><span class="ag-fold__count">9<\/span>/,'grouped by activity with counts');
 assert.match(h,/data-action="node-undo-apply"[^>]*>.*Undo copy…/s);
 // Players cannot do it through the API.
 game.user=alice;
 await assert.rejects(()=>api.gathering.templates.undoCopy({preview:false}),/Only the GM/);assert.throws(()=>api.gathering.templates.copyPreview(),/Only the GM/);
 game.user=gm;
 // A snapshot that cannot be saved stops the undo with nothing changed.
 const beforeIds=ids();failSnapshot=true;
 await assert.rejects(()=>api.gathering.templates.undoCopy({preview:false}),/Undo cancelled: the snapshot could not be saved \(disk full\)\. Nothing was changed\./);
 assert.deepEqual(ids(),beforeIds);failSnapshot=false;
 // Cancel on the confirmation changes nothing; the confirmation is a labelled danger dialog.
 confirmAnswer=false;await app._click('node-undo-apply');
 assert.equal(lastConfirm.window.title,'Undo the copy of 18 nodes?');assert.deepEqual(lastConfirm.buttons.map(b=>[b.label,b.default]),[['Cancel',true],['Remove 18 nodes',false]]);
 assert.ok(lastConfirm.classes.includes('ag-dialog--danger'));assert.deepEqual(ids(),beforeIds);
 confirmAnswer=true;await app._click('node-undo-apply');
 const after=_test.readNodeStore();
 assert.equal(after.nodes.length,beforeIds.length-18);
 assert.ok(after.nodes.some(n=>n.id===edited),'edited since the copy: kept');assert.ok(after.nodes.some(n=>n.id==='NODE-TEST-HAND'),'hand-made: kept');assert.ok(after.nodes.some(n=>n.id===inUse),'used by a Location: kept');
 assert.ok(!last.created.slice(2).some(id=>after.nodes.some(n=>n.id===id)),'every other node of the copy is gone');
 assert.equal(after.nodes.filter(n=>store.migrations[0].created.includes(n.id)).length,store.migrations[0].created.length,'the first (older) run is untouched');
 assert.deepEqual(snapshotOrder.at(-1),beforeIds.length,'the snapshot was saved while all the nodes were still there');
 const snap=journals.at(-1);assert.equal(snap.ownership.default,0);assert.equal(snap.flags['ashen-gate-profession-ledger'].snapshot.removedTemplates.length,18);
 assert.deepEqual(locs,locsBefore,'Locations records are never changed');assert.ok(lockedBefore.length);
 assert.equal(after.retiredIds.length,0);
 assert.ok(chats.some(c=>/removed 18 node templates/.test(c.content)&&c.whisper?.[0]==='gm'));
 // Banner cleared, button disabled, and a second press finds nothing (it must not undo the older copy).
 h=await html();
 assert.doesNotMatch(h,/Location gathering nodes copied into templates/);assert.match(h,/data-action="node-undo-open" disabled/);
 await assert.rejects(()=>api.gathering.templates.undoCopy({preview:false}),/There is no copy to undo/);
 assert.equal((await api.gathering.templates.undoCopy()).plan,null);assert.deepEqual(ids(),after.nodes.map(n=>n.id).sort());
});

test('a copy made before run ids existed (Robb’s) is identified by the ids its record lists; ticked extras are removed; the same entries can be copied again',async()=>{
 game.user=gm;
 await app._click('node-copy-locations');await app._click('node-copy-apply');   // a fresh copy of what is left to copy
 const store=_test.readNodeStore(),rec=store.migrations.at(-1);
 // Make it look like an old copy: no run id anywhere.
 const old={...store,migrations:[...store.migrations.slice(0,-1),(({runId,...r})=>r)(rec)],nodes:store.nodes.map(n=>{const {copyRun,...meta}=n.meta;return {...n,meta};})};
 await _test.writeNodeStore(old);
 const preview=(await api.gathering.templates.undoCopy()).plan;
 assert.equal(preview.total,rec.created.length);assert.equal(preview.remove.length,rec.created.length,'identified from the record, not from a marker');
 const out=await api.gathering.templates.undoCopy({preview:false});
 assert.equal(out.removed.length,rec.created.length);
});

test('manual cleanup facts: a copied template is marked meta.origin "migration" with meta.legacy[] (locationId, key); the copy run is the last entry of store.migrations',async()=>{
 const store=_test.readNodeStore();
 const t=store.nodes.find(n=>n.meta.origin==='migration');
 assert.ok(t&&t.meta.legacy[0].locationId&&'key' in t.meta.legacy[0]);
 assert.ok(store.migrations.every(m=>Array.isArray(m.created)&&typeof m.at==='number'));
});
