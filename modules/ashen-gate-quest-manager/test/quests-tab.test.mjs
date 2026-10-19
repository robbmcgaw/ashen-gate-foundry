import test from 'node:test';import assert from 'node:assert/strict';
import {initialState} from '../scripts/core.mjs';
import {statusChip,questRow,filterRows,sortRows,groupRows,listQuestsTab,CONTENT_ACTIONS,SETUP_ACTIONS,CHIPS} from '../scripts/quests-tab.mjs';
import {setupPanel,questsToolbar,questCards} from '../scripts/gm-panels.mjs';
import {publicView} from '../scripts/core.mjs';
const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':id.startsWith('CONTRACT')?'contract':'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'g',visibility:'player'}],locations:[],parameters:{},outcomes:{},...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),...o});
const entry=(s,st={})=>({source:s,state:{...initialState(s),...st}});
const data=[
 entry(src('QUEST-DRAFT','[TEST] Draft',{status:'draft'})),
 entry(src('QUEST-HID','[TEST] Hidden')),
 entry(src('QUEST-AVAIL','[TEST] Available',{locations:['LOC-MILL']}),{status:'Available',revealed:true}),
 entry(src('QUEST-ACT','[TEST] Active'),{status:'Active',revealed:true,publicLocationIds:['LOC-PIER']}),
 entry(src('QUEST-DONE','[TEST] Done'),{status:'Completed',revealed:true}),
 entry(src('QUEST-FAIL','[TEST] Failed'),{status:'Failed'}),
 entry(src('ORDER-FORGE','[TEST] Forge'),{status:'Active',revealed:false}),
 entry(src('CONTRACT-ESCORT','[TEST] Escort',{visibility:'gm'}),{status:'Active',revealed:true}),
];
test('GM list shows every quest and all six chips',()=>{
 const r=listQuestsTab(data);
 assert.equal(r.total,8);assert.equal(r.shown,8);
 assert.deepEqual(r.groups.map(g=>g.key),CHIPS);
 assert.equal(statusChip(data[0].source,data[0].state),'Draft');
});
test('drafts, hidden and unrevealed quests are never visible to players',()=>{
 const rows=Object.fromEntries(data.map(questRow).map(r=>[r.id,r]));
 assert.equal(rows['QUEST-DRAFT'].visible,false);assert.equal(rows['QUEST-HID'].visible,false);
 assert.equal(rows['ORDER-FORGE'].visible,false);assert.equal(rows['CONTRACT-ESCORT'].visible,false);
 assert.equal(rows['QUEST-ACT'].visible,true);
 assert.equal(publicView(data[0].source,data[0].state),null);
});
test('a published quest that is still marked draft keeps its campaign status chip',()=>{
 const s=src('QUEST-LEGACY','[TEST] Legacy',{status:'draft'});
 assert.equal(statusChip(s,{...initialState(s),status:'Active',revealed:true}),'Active');
});
test('filters: type, status, location, visibility, search',()=>{
 const rows=data.map(questRow);
 assert.deepEqual(filterRows(rows,{type:'work_order'}).map(r=>r.id),['ORDER-FORGE']);
 assert.deepEqual(filterRows(rows,{status:'Draft'}).map(r=>r.id),['QUEST-DRAFT']);
 assert.deepEqual(filterRows(rows,{location:'LOC-PIER'}).map(r=>r.id),['QUEST-ACT']);
 assert.deepEqual(filterRows(rows,{location:'LOC-MILL'}).map(r=>r.id),['QUEST-AVAIL']);
 assert.equal(filterRows(rows,{visible:'yes'}).length,3);assert.equal(filterRows(rows,{visible:'no'}).length,5);
 assert.deepEqual(filterRows(rows,{search:'escort'}).map(r=>r.id),['CONTRACT-ESCORT']);
 assert.deepEqual(listQuestsTab(data,{location:'LOC-PIER'}).locations,['LOC-MILL','LOC-PIER']);
});
test('sort and group',()=>{
 const rows=data.map(questRow);
 assert.equal(sortRows(rows,'name')[0].name,'[TEST] Active');
 assert.equal(sortRows(rows,'status')[0].chip,'Draft');
 assert.equal(sortRows(rows,'type').at(-1).kindLabel,'Quest');
 assert.deepEqual(groupRows(rows,'type').map(g=>g.key),['Quest','Order','Contract']);
 assert.equal(groupRows(rows,'none').length,1);
});
test('GM Setup holds settings only',()=>{
 const html=setupPanel({playerAccess:true,packIds:'world.q',overlayVisible:false});
 const actions=[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(actions.length);
 for(const a of actions){assert.ok(SETUP_ACTIONS.includes(a),a);assert.ok(!CONTENT_ACTIONS.includes(a),a);}
 assert.ok(!/ag-src-|source-json|Import|Export|New quest/.test(html));
});
test('Quests tab toolbar offers New, Import and Export; cards are selectable',()=>{
 const html=questsToolbar({},[]);
 for(const a of ['new','import','export'])assert.match(html,new RegExp(`data-action="${a}"`));
 const g=listQuestsTab(data).groups;
 assert.match(questCards(g,'QUEST-ACT'),/data-id="QUEST-ACT"/);
 assert.match(questCards([],null),/No matching/);
});
