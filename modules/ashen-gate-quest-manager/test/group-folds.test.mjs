import test from 'node:test';import assert from 'node:assert/strict';
import {FOLD_THRESHOLD,isFolded,storeKey,domKey,filterActive,openStates,setAll,readStored,toolbarState} from '../scripts/group-folds.mjs';
import {listQuestsTab,groupRows,CONTENT_ACTIONS} from '../scripts/quests-tab.mjs';
import {initialState} from '../scripts/core.mjs';
import {questCards,questsToolbar} from '../scripts/gm-panels.mjs';
import {uiState} from '../scripts/ag-html.mjs';

const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'g',visibility:'player'}],locations:[],parameters:{},outcomes:{},...o});
const entry=(s,st={})=>({source:s,state:{...initialState(s),...st}});
const STATUS=['Available','Active','Completed'];
const many=n=>Array.from({length:n},(_,i)=>entry(src(`QUEST-T${i}`,`[TEST] Quest ${i}`),{status:STATUS[i%3],revealed:true}));
const groupsOf=(rows,view={})=>listQuestsTab(rows,view);
const memory=()=>{const m={};return {getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=v;}};};

test('group building still groups by mode and drops empty groups',()=>{
 const r=groupsOf(many(6));
 assert.deepEqual(r.groups.map(g=>g.key),['Available','Active','Completed']);
 assert.deepEqual(r.groups.map(g=>g.rows.length),[2,2,2]);
 assert.equal(groupRows([],'status').length,0,'no rows, no groups');
 const filtered=groupsOf(many(6),{status:'Active',search:'Quest 1'});
 assert.ok(filtered.groups.every(g=>g.rows.length>0),'groups with no matching quests are hidden');
});
test('storage keys include the group-by mode and group key; dom keys carry no raw group key',()=>{
 assert.equal(storeKey('status','Active'),'qgroup:status:Active');
 assert.notEqual(storeKey('status','none'),storeKey('location','none'));
 assert.notEqual(domKey('status','Active'),domKey('location','Active'));
 assert.equal(domKey('giver','NPC-TEST-A'),domKey('giver','NPC-TEST-A'));
 assert.doesNotMatch(domKey('giver','NPC-TEST-A'),/NPC/);
});
test('filterActive: search and filters count, the sub-view does not',()=>{
 assert.equal(filterActive({}),false);assert.equal(filterActive({search:'  '}),false);assert.equal(filterActive({nav:'active'}),false);
 assert.equal(filterActive({search:'mill'}),true);assert.equal(filterActive({location:'LOC-A'}),true);assert.equal(filterActive({visible:'no'}),true);
});
test('default open state: open at 12 quests or fewer, closed above, except the group with the selected quest',()=>{
 assert.equal(FOLD_THRESHOLD,12);
 const small=groupsOf(many(12)).groups;
 assert.ok(Object.values(openStates({groups:small,total:12})).every(Boolean));
 const big=groupsOf(many(13)).groups;
 assert.ok(Object.values(openStates({groups:big,total:13})).every(v=>v===false));
 const sel=openStates({groups:big,total:13,selectedId:'QUEST-T1'});
 const holder=big.find(g=>g.rows.some(r=>r.id==='QUEST-T1')).key;
 assert.deepEqual(Object.entries(sel).filter(([,v])=>v).map(([k])=>k),[holder]);
});
test('saved choices win over the default, per mode',()=>{
 const big=groupsOf(many(20)).groups;
 const stored={[storeKey('status','Active')]:true,[storeKey('status','Available')]:false};
 const s=openStates({groups:big,total:20,selectedId:'QUEST-T0',stored});
 assert.equal(s.Active,true);assert.equal(s.Available,false,'a saved close beats the selected-quest default');assert.equal(s.Completed,false);
 const other=openStates({groups:big,total:20,mode:'type',stored});
 assert.ok(Object.values(other).every(v=>v===false),'another mode does not see the status choices');
});
test('an active search or filter opens every group and ignores what was saved',()=>{
 const g=groupsOf(many(20),{search:'Quest'}).groups;
 const stored=setAll(g,'status',false);
 const s=openStates({groups:g,total:20,stored,filtering:true});
 assert.ok(Object.values(s).every(Boolean));
 assert.deepEqual(openStates({groups:g,total:20,stored,filtering:false}),Object.fromEntries(g.map(x=>[x.key,false])),'the saved closes come back');
});
test('collapse all and expand all write one choice per group, and round-trip through uiState',()=>{
 const g=groupsOf(many(6)).groups,ui=uiState('t',{storage:memory(),userId:'gm'});
 for(const [k,v] of Object.entries(setAll(g,'status',false)))ui.set(k,v);
 assert.deepEqual(Object.values(openStates({groups:g,total:6,stored:readStored(ui,g,'status')})),[false,false,false]);
 for(const [k,v] of Object.entries(setAll(g,'status',true)))ui.set(k,v);
 assert.deepEqual(Object.values(openStates({groups:g,total:6,stored:readStored(ui,g,'status')})),[true,true,true]);
 assert.deepEqual(readStored(ui,g,'location'),{},'nothing leaks into another mode');
 const other=uiState('t',{storage:memory(),userId:'alice'});assert.deepEqual(readStored(other,g,'status'),{},'per user');
});
test('toolbar state: off with no grouping, no groups or a filter; otherwise follows what is open',()=>{
 assert.equal(isFolded('none'),false);
 const t=o=>toolbarState(o);
 assert.deepEqual([t({mode:'none',open:{all:true}}).collapse,t({mode:'none',open:{all:true}}).expand],[false,false]);
 assert.equal(t({mode:'status',open:{}}).collapse,false);
 assert.match(t({mode:'status',filtering:true,open:{A:true}}).reason,/search or filter/);
 assert.deepEqual([t({open:{A:true,B:true}}).collapse,t({open:{A:true,B:true}}).expand],[true,false]);
 assert.deepEqual([t({open:{A:false,B:false}}).collapse,t({open:{A:false,B:false}}).expand],[false,true]);
 assert.deepEqual([t({open:{A:true,B:false}}).collapse,t({open:{A:true,B:false}}).expand],[true,true]);
});
test('markup: each group is a keyboard fold with a count and aria-expanded; no fold inside a fold; no grouping stays flat',()=>{
 const {groups}=groupsOf(many(6));
 const open={Available:true,Active:false,Completed:true};
 const html=questCards(groups,null,{total:6,mode:'status',open});
 assert.equal((html.match(/<details /g)||[]).length,3);
 assert.match(html,/<summary class="ag-fold__summary" aria-expanded="false"><span class="ag-fold__title">Active<\/span><span class="ag-fold__count">2<\/span>/);
 assert.match(html,/<details class="ag-fold agq-gfold" data-key="grp-status-[a-z0-9]+">/,'closed group has no open attribute');
 assert.doesNotMatch(html,/<details[^>]*>(?:(?!<\/details>)[^])*<details/,'no fold inside a fold');
 assert.doesNotMatch(html,/<summary>[^]*<button/);
 const flat=questCards(groupsOf(many(6),{group:'none'}).groups,null,{total:6,mode:'none'});
 assert.doesNotMatch(flat,/<details/);assert.match(flat,/<h3 class="ag-eyebrow agq-group__head">All quests/);
});
test('toolbar markup: Collapse all and Expand all are buttons that are content actions',()=>{
 const html=questsToolbar({group:'status'},[],{folds:{filtering:false,open:{A:true,B:false}}});
 assert.match(html,/<button type="button" data-action="collapse-groups" class="ag-btn ag-btn--sm"[^>]*><i [^>]*><\/i> Collapse all<\/button>/);
 assert.match(html,/data-action="expand-groups"[^>]*>[^]*Expand all/);
 assert.doesNotMatch(html,/data-action="(collapse|expand)-groups"[^>]* disabled/);
 const off=questsToolbar({group:'none'},[],{});
 assert.match(off,/data-action="collapse-groups"[^>]* disabled/);
 assert.ok(CONTENT_ACTIONS.includes('collapse-groups')&&CONTENT_ACTIONS.includes('expand-groups'));
});
