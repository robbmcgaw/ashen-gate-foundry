// 0.29.0 bulk Archive / Restore / Delete for quests (GM only). Mocked: an in-memory store behind the real planning code.
import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,publicView,validSource,assertGM} from '../scripts/core.mjs';
import {listQuestsTab,filterRows,questRow,navCounts,SUBVIEWS,filterCount,packOptions} from '../scripts/quests-tab.mjs';
import {planBulk,confirmText,backupPackage} from '../scripts/bulk.mjs';
import {createBulkApi} from '../scripts/bulk-api.mjs';
import {bulkBar,questsToolbar,questCard} from '../scripts/gm-panels.mjs';
import {planQuestImport} from '../scripts/core.mjs';

const src=(id,name,pack='[TEST] pack A',o={})=>validSource({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':id.startsWith('CONTRACT')?'contract':'quest',...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),
 status:'approved',version:'1',provenance:{sources:[pack]},visibility:'player',refs:[],name,public_summary:'s',objectives:[{key:'a',goal:'Do it'}],source:{description:'x'},locations:[],parameters:{},outcomes:{},...o});
const mk=()=>{
 const rec=[['QUEST-FRONTIER-FORT','[TEST] Fort','[TEST] frontier'],['QUEST-FRONTIER-WELL','[TEST] Well','[TEST] frontier'],['QUEST-BLIGHT-ONE','[TEST] Blight','[TEST] blight'],['QUEST-CORE-MILL','[TEST] Mill','[TEST] core'],['ORDER-FRONTIER-FORGE','[TEST] Forge','[TEST] frontier']]
  .map(([id,n,p])=>{const source=src(id,n,p);return {source,state:{...initialState(source),status:'Active',revealed:true,partyNotes:'we went there'}};});
 const world={rec,assignments:new Set(['QUEST-CORE-MILL']),user:{isGM:true}};
 const api=createBulkApi({assertGM:()=>assertGM(world.user),entries:()=>world.rec,
  updateState:async(id,patch)=>{const e=world.rec.find(x=>x.source.id===id);e.state={...e.state,...patch};},
  removeRecord:async id=>{if(world.assignments.has(id))throw new Error('Remove/reassign Quest-owned ASSIGN records before deleting this Objective.');world.rec.splice(world.rec.findIndex(x=>x.source.id===id),1);},
  assignmentCount:id=>world.assignments.has(id)?1:0});
 return {world,api};
};

test('players are refused by every bulk call and nothing changes',async()=>{
 const {world,api}=mk();world.user={isGM:false};const before=JSON.stringify(world.rec);
 for(const call of [()=>api.previewBulk('archive',['QUEST-CORE-MILL']),()=>api.archiveQuests(['QUEST-CORE-MILL']),()=>api.restoreQuests(['QUEST-CORE-MILL']),()=>api.deleteQuests(['QUEST-CORE-MILL']),()=>api.idsWithPrefix('QUEST-'),()=>api.countArchived()])
  await assert.rejects(async()=>call(),/GM permission required/);
 assert.equal(JSON.stringify(world.rec),before);
});
test('selection by id prefix (case-insensitive; live or archived) and by source pack and status filters',async()=>{
 const {world,api}=mk();
 assert.deepEqual(api.idsWithPrefix('quest-frontier-'),['QUEST-FRONTIER-FORT','QUEST-FRONTIER-WELL']);
 assert.deepEqual(api.idsWithPrefix(''),[]);
 const rows=world.rec.map(e=>questRow(e));
 assert.deepEqual(filterRows(rows,{idPrefix:' order-'}).map(r=>r.id),['ORDER-FRONTIER-FORGE']);
 assert.deepEqual(filterRows(rows,{pack:'[TEST] frontier'}).map(r=>r.id).sort(),['ORDER-FRONTIER-FORGE','QUEST-FRONTIER-FORT','QUEST-FRONTIER-WELL']);
 assert.deepEqual(filterRows(rows,{pack:'[TEST] frontier',idPrefix:'QUEST-',status:'Active'}).map(r=>r.id).sort(),['QUEST-FRONTIER-FORT','QUEST-FRONTIER-WELL']);
 assert.deepEqual(packOptions(rows).map(o=>o[0]),['[TEST] blight','[TEST] core','[TEST] frontier']);
 assert.equal(filterCount({pack:'x',idPrefix:'Q'}),2);assert.equal(filterCount({}),0);
 await api.archiveQuests(['QUEST-FRONTIER-FORT']);
 assert.deepEqual(api.idsWithPrefix('QUEST-FRONTIER-'),['QUEST-FRONTIER-WELL']);assert.deepEqual(api.idsWithPrefix('QUEST-FRONTIER-',{archived:true}),['QUEST-FRONTIER-FORT']);
});
test('archive then restore round-trips: players lose the quest, status, progress, notes and rewards stay, views and counts follow',async()=>{
 const {world,api}=mk();
 const fort=()=>world.rec.find(e=>e.source.id==='QUEST-FRONTIER-FORT');
 assert.ok(publicView(fort().source,fort().state));
 const before=structuredClone(fort().state);
 const p=api.previewBulk('archive',['QUEST-FRONTIER-FORT','QUEST-CORE-MILL','QUEST-NOPE']);
 assert.deepEqual(p.changes.map(c=>c.name),['[TEST] Fort','[TEST] Mill']);assert.deepEqual(p.willHide,['[TEST] Fort','[TEST] Mill']);
 assert.deepEqual(p.skipped.map(s=>s.reason),['No such quest.']);assert.equal(api.countArchived(),0,'a preview writes nothing');
 const r=await api.archiveQuests(['QUEST-FRONTIER-FORT','QUEST-FRONTIER-FORT','QUEST-NOPE'],{source:'ashen-gate-manager',reason:'sync-not-in-package'});
 assert.deepEqual(r.archived,['QUEST-FRONTIER-FORT']);assert.deepEqual(r.skipped,[{id:'QUEST-NOPE',reason:'No such quest.'}]);
 assert.equal(publicView(fort().source,fort().state),null,'players cannot see it');
 assert.equal(fort().state.status,'Active');assert.equal(fort().state.partyNotes,'we went there');
 assert.deepEqual((await api.archiveQuests(['QUEST-FRONTIER-FORT'])).alreadyArchived,['QUEST-FRONTIER-FORT']);
 await api.archiveQuests(['QUEST-CORE-MILL']);await api.restoreQuests(['QUEST-CORE-MILL']);
 const all=listQuestsTab(world.rec,{},{});assert.equal(all.total,5);assert.equal(all.counts.all,4);assert.equal(all.counts.archived,1);assert.ok(!all.ids.includes('QUEST-FRONTIER-FORT'));
 assert.deepEqual(listQuestsTab(world.rec,{nav:'archived'},{}).ids,['QUEST-FRONTIER-FORT']);
 assert.equal(api.countArchived(),1);
 const back=await api.restoreQuests(['QUEST-FRONTIER-FORT','QUEST-CORE-MILL'],{source:'ashen-gate-manager'});
 assert.deepEqual(back.restored,['QUEST-FRONTIER-FORT']);assert.deepEqual(back.skipped,[{id:'QUEST-CORE-MILL',reason:'Not archived.'}]);
 assert.deepEqual({...fort().state,archived:false,archivedAt:null},{...before,archived:false,archivedAt:null});
 assert.ok(publicView(fort().source,fort().state));
});
test('bulk status/hide skip archived quests; the Archived view only offers Restore and Delete',()=>{
 const {world}=mk();world.rec[0].state.archived=true;
 const p=planBulk('hide',world.rec,['QUEST-FRONTIER-FORT','QUEST-FRONTIER-WELL']);
 assert.deepEqual(p.skipped.map(s=>s.reason),['Archived: restore it first.']);
 const live=bulkBar(2,3),arch=bulkBar(2,3,{archivedView:true});
 assert.match(live,/data-action="bulk-archive"/);assert.match(live,/data-action="bulk-delete"/);
 assert.match(arch,/data-action="bulk-restore"/);assert.match(arch,/data-action="bulk-delete"/);assert.doesNotMatch(arch,/bulk-archive|bulk-status|bulk-hide/);
 const tb=questsToolbar({idPrefix:'QUEST-F',pack:'p'},[],{filtersOpen:true,packs:[['p','p']]});
 assert.match(tb,/id="ag-gm-pack"[\s\S]*<option value="p" selected>/);assert.match(tb,/id="ag-gm-prefix" value="QUEST-F"/);
 assert.match(questCard({...questRow(world.rec[0]),archived:true}),/Archived<\/span>/);
 assert.equal(SUBVIEWS.at(-1).key,'archived');
});
test('delete: backup of exactly those quests first, assignments block, deleted quests are gone and the rest are untouched',async()=>{
 const {world,api}=mk();
 const p=api.previewBulk('delete',['QUEST-CORE-MILL','QUEST-BLIGHT-ONE']);
 assert.deepEqual(p.changes.map(c=>c.id),['QUEST-BLIGHT-ONE']);assert.match(p.skipped[0].reason,/1 assignment: remove it first/);
 const r=await api.deleteQuests(['QUEST-CORE-MILL','QUEST-BLIGHT-ONE','QUEST-FRONTIER-FORT']);
 assert.deepEqual(r.done.sort(),['QUEST-BLIGHT-ONE','QUEST-FRONTIER-FORT']);
 assert.deepEqual(r.backup.records.map(x=>x.id).sort(),['QUEST-BLIGHT-ONE','QUEST-FRONTIER-FORT']);
 assert.equal(r.backup.states['QUEST-FRONTIER-FORT'].partyNotes,'we went there');
 assert.equal(planQuestImport(r.backup,new Set()).errors.length,0,'Import JSON reads the backup');
 assert.deepEqual(world.rec.map(e=>e.source.id).sort(),['ORDER-FRONTIER-FORGE','QUEST-CORE-MILL','QUEST-FRONTIER-WELL']);
 assert.match(confirmText('delete',planBulk('delete',world.rec,['QUEST-FRONTIER-WELL'])),/cannot be undone/);
 assert.deepEqual(backupPackage(world.rec,['QUEST-CORE-MILL']).records.map(x=>x.id),['QUEST-CORE-MILL']);
});
test('imports keep an archived quest archived (an update replaces the source, never the play state)',()=>{
 const {world}=mk();world.rec[0].state.archived=true;
 const plan=planQuestImport({records:[world.rec[0].source]},new Set(world.rec.map(e=>e.source.id)),{mode:'update'});
 assert.equal(plan.rows[0].action,'update');assert.match(plan.rows[0].reason,/keeps its status/);
 assert.equal(world.rec[0].state.archived,true);
});
test('a link to an archived or deleted quest is ignored by consumers: the player view is null, not an error',async()=>{
 const {world,api}=mk();
 await api.archiveQuests(['QUEST-CORE-MILL']);await api.deleteQuests(['QUEST-BLIGHT-ONE']);
 const view=id=>{const e=world.rec.find(x=>x.source.id===id);return e?publicView(e.source,e.state):null;};
 assert.equal(view('QUEST-CORE-MILL'),null);assert.equal(view('QUEST-BLIGHT-ONE'),null);
});
