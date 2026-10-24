import test from 'node:test';import assert from 'node:assert/strict';
import {initialState} from '../scripts/core.mjs';
import {statusChip,questRow,filterRows,sortRows,groupRows,listQuestsTab,CONTENT_ACTIONS,SETUP_ACTIONS,CHIPS} from '../scripts/quests-tab.mjs';
import {setupPanel,questsToolbar,questCards,safeButton,questsAdvanced,filterLabel} from '../scripts/gm-panels.mjs';
import {filterCount} from '../scripts/quests-tab.mjs';
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
 assert.deepEqual(listQuestsTab(data,{location:'LOC-PIER'}).locations,[['LOC-MILL','Unnamed location'],['LOC-PIER','Unnamed location']]);
});
test('sort and group',()=>{
 const rows=data.map(questRow);
 assert.equal(sortRows(rows,'name')[0].name,'[TEST] Active');
 assert.equal(sortRows(rows,'status')[0].chip,'Draft');
 assert.equal(sortRows(rows,'type').at(-1).kindLabel,'Quest');
 assert.deepEqual(groupRows(rows,'type').map(g=>g.key),['Quest','Order','Contract']);
 assert.equal(groupRows(rows,'none').length,1);
});
test('GM Setup holds settings only (0.17.0: the overlay toggle left it)',()=>{
 const html=setupPanel({playerAccess:true,packIds:'world.q'});
 const actions=[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(actions,['cancel-setup','save-setup']);
 for(const a of actions){assert.ok(SETUP_ACTIONS.includes(a),a);assert.ok(!CONTENT_ACTIONS.includes(a),a);}
 assert.ok(!/ag-src-|source-json|Import|Export|New quest|overlay/.test(html));
 assert.match(html,/The Journal tab also follows Character Hub's Quests visibility/,'QJ-06');
});
test('Quests tab toolbar offers New quest; Import and Export sit under Advanced; cards are selectable',()=>{
 const html=questsToolbar({},[]);
 assert.match(html,/data-action="new"/);assert.doesNotMatch(html,/data-action="(import|export)"/);
 const adv=questsAdvanced();
 assert.match(adv,/<details class="ag-fold" data-ag-fold-key="quests-import"><summary class="ag-fold__summary"><span class="ag-fold__title">Advanced: import here, or use General Manager<\/span>/);
 assert.match(adv,/<span class="ag-file"><button type="button" class="ag-btn ag-btn--sm" data-ag-file-button>[^<]*<i[^>]*><\/i> Import JSON…<\/button><input type="file" class="ag-file__input ag-sr-only" tabindex="-1" aria-hidden="true" accept="\.json,application\/json">/,'a real button opens a visually hidden input');
 assert.match(adv,/data-action="export"/);
 const g=listQuestsTab(data).groups;
 assert.match(questCards(g,'QUEST-ACT'),/data-id="QUEST-ACT"/);
 assert.match(questCards([],null,{total:3}),/Nothing matches[\s\S]*data-action="clear-filters"/);
 assert.match(questCards([],null,{total:0}),/No quests yet[\s\S]*data-action="new"/);
});
test('toolbar (QL-05): one row of search, Filters (n), group, sort, count and New quest; type, location and visible in the row Filters opens',()=>{
 const html=questsToolbar({group:'location',sort:'changed'},[['LOC-PIER','[TEST] Pier']],{shown:2,total:8});
 const row1=html.slice(0,html.indexOf('agq-filterrow')),row2=html.slice(html.indexOf('agq-filterrow'));
 const at=k=>row1.indexOf(k);
 assert.ok(at('ag-search')<at('data-action="toggle-filters"')&&at('toggle-filters')<at('ag-gm-group')&&at('ag-gm-group')<at('ag-gm-sort')&&at('ag-gm-sort')<at('ag-toolbar__count')&&at('ag-toolbar__count')<at('ag-toolbar__end'));
 assert.match(row1,/aria-expanded="false" aria-controls="ag-gm-filters"><i class="fa-solid fa-filter" aria-hidden="true"><\/i> <span data-filter-label>Filters<\/span>/);
 assert.doesNotMatch(row1,/ag-gm-type|ag-gm-location|ag-gm-visible/);
 assert.match(row2,/id="ag-gm-filters" role="group" aria-label="Filters" hidden>/);
 for(const id of ['ag-gm-type','ag-gm-location','ag-gm-visible'])assert.match(row2,new RegExp(`id="${id}"`));
 assert.match(row2,/data-action="clear-filters"/);
 assert.match(html,/2 of 8 quests/);
 assert.match(html,/<option value="LOC-PIER" >\[TEST\] Pier<\/option>/);
 assert.match(html,/<option value="location" selected>Group: Location/);assert.match(html,/<option value="changed" selected>Sort: Recently changed/);
 for(const g of ['status','location','type','giver'])assert.match(html,new RegExp(`value="${g}"[^>]*>Group:`));
 for(const s of ['name','status','location','changed'])assert.match(html,new RegExp(`value="${s}"[^>]*>Sort:`));
 assert.match(html,/data-action="new" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> New quest/);
 assert.doesNotMatch(html,/ag-btn--primary|\stitle=|data-qv-status/);
 const open=questsToolbar({type:'contract',visible:'no'},[],{filtersOpen:true});
 assert.match(open,/aria-expanded="true"[^>]*>[^]*Filters \(2\)/);assert.match(open,/aria-label="Filters">/,'the row is shown');
 assert.equal(filterCount({type:'all',location:'LOC-A',visible:'all',sort:'changed'}),1);assert.equal(filterLabel(0),'Filters');
});
test('quest cards: pick box, title, type badge, status chip, visibility, objectives done/total, grouped with counts',()=>{
 const rows=[entry(src('QUEST-TWO','[TEST] Two',{objectives:[{key:'a',goal:'g',visibility:'player'},{key:'b',goal:'h',visibility:'player'}]}),{status:'Active',revealed:true,progress:{a:'complete'}})];
 const r=listQuestsTab(rows);
 assert.equal(r.groups[0].rows[0].done,1);assert.equal(r.groups[0].rows[0].total,2);
 const html=questCards(r.groups,'QUEST-TWO',{total:1});
 assert.match(html,/<details class="ag-fold agq-gfold" data-key="grp-status-[a-z0-9]+" open><summary class="ag-fold__summary" aria-expanded="true"><span class="ag-fold__title">Active<\/span><span class="ag-fold__count">1<\/span>/);
 assert.match(html,/<div class="ag-row agq-card is-selected" data-qid="QUEST-TWO"><label class="agq-card__pick"><input type="checkbox" data-pick="QUEST-TWO"><span class="ag-sr-only">Select \[TEST\] Two<\/span><\/label>/);
 assert.match(html,/<button type="button" class="agq-card__main" data-action="gm-select" data-id="QUEST-TWO" aria-current="true">/);
 assert.match(html,/aria-valuemax="2" aria-valuenow="1"/);
 assert.match(html,/>1\/2</);assert.match(html,/--ag-meter:50%/);
 assert.match(html,/agq-kind agq-kind--quest"><i class="fa-solid fa-scroll" aria-hidden="true"><\/i>Quest<\/span>/);
 assert.match(html,/<span class="ag-badge ag-badge--accent">Active<\/span>/);
 assert.match(html,/ag-badge--ok"[^>]*data-tooltip="Players can see this quest"[^>]*>.*Visible to players/);
 assert.match(html,/Audience: <\/span>Party/);
});
test('buttons: kit classes, tooltips instead of title, icon-only buttons are labelled',()=>{
 assert.equal(safeButton('Save','save-source',{kind:'primary'}),'<button type="button" data-action="save-source" class="ag-btn ag-btn--primary">Save</button>');
 assert.match(safeButton('Delete quest','delete',{kind:'danger',sm:true,icon:'fa-trash'}),/class="ag-btn ag-btn--danger ag-btn--sm"><i class="fa-solid fa-trash" aria-hidden="true"><\/i> Delete quest/);
 assert.match(safeButton('Import','import',{title:'From a file'}),/data-tooltip="From a file" data-tooltip-class="ag-tooltip"/);
 assert.doesNotMatch(safeButton('Import','import',{title:'From a file'}),/\stitle=/);
 const icon=safeButton('Close overlay','x',{iconOnly:true,icon:'fa-xmark'});
 assert.match(icon,/ag-btn--icon/);assert.match(icon,/aria-label="Close overlay"/);assert.match(icon,/data-tooltip="Close overlay"/);
 assert.doesNotMatch(icon,/> Close overlay</);
});
