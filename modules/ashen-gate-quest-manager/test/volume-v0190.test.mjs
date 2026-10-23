// 0.19.0 Quests list at sandbox volume: level, region, giver names and kind-of-quest detail. Mocked Foundry; logic and markup only.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialState,planQuestImport} from '../scripts/core.mjs';
import {questRow,listQuestsTab,filterRows,sortRows,groupRows,giverLabel,questLevel,questDetail,filterCount,gmViewState,DEFAULT_VIEW} from '../scripts/quests-tab.mjs';
import {questCard,questsToolbar} from '../scripts/gm-panels.mjs';

const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':id.startsWith('CONTRACT')?'contract':'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'[TEST] goal',visibility:'player'}],locations:[],parameters:{},outcomes:{},...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),...o});
const entry=s=>({source:s,state:initialState(s),changed:null});
const REGIONS={'LOC-T-A':'[TEST] North','LOC-T-B':'[TEST] South'};
const ctx={locationName:id=>REGIONS[id]?`Place ${id.slice(-1)}`:null,locationRegion:id=>REGIONS[id]??null};

test('giver ids become names; written names are kept',()=>{
 assert.equal(giverLabel('NPC-HALE-MARROW'),'Hale Marrow');assert.equal(giverLabel('FAC-TEST-POST'),'Test Post');
 assert.equal(giverLabel('[TEST] Miller'),'[TEST] Miller');assert.equal(giverLabel(''),'');
});
test('level reads recommended_level (text or number); out-of-range or missing is no level',()=>{
 assert.equal(questLevel(src('QUEST-A','a',{parameters:{recommended_level:'4'}})),4);
 assert.equal(questLevel(src('QUEST-A','a',{parameters:{recommended_level:3}})),3);
 for(const bad of ['', 'x', '0', '21', '3.5',null])assert.equal(questLevel(src('QUEST-A','a',{parameters:{recommended_level:bad}})),null);
 assert.equal(questLevel(src('ORDER-A','a')),null);
});
test('kind detail: work order domain, quest_type, contract_type',()=>{
 assert.equal(questDetail(src('ORDER-A','a',{work_order_domain:'creative'})),'Creative');
 assert.equal(questDetail(src('QUEST-A','a',{parameters:{quest_type:'investigation'}})),'Investigation');
 assert.equal(questDetail(src('CONTRACT-A','a',{parameters:{contract_type:'escort'}})),'Escort');
 assert.equal(questDetail(src('QUEST-A','a')),'');
 const html=questCard(questRow(entry(src('ORDER-T-X','[TEST] X',{work_order_domain:'production'})),ctx));
 assert.match(html,/<\/i>Order · Production<\/span>/);
});
const many=[];
for(let i=0;i<120;i++){
 const k=['QUEST','ORDER','CONTRACT'][i%3],lvl=i===0?{}:{recommended_level:String(3+i%3)};
 many.push(entry(src(`${k}-T-${i}`,`[TEST] ${i}`,{parameters:lvl,locations:i%4===3?[]:[i%2?'LOC-T-A':'LOC-T-B'],refs:i%5===4?[]:[{relation:'issued_by',target_id:`NPC-T-GIVER-${i%7}`,mode:'optional'}]})));
}
test('120 quests: group, filter and sort by level, region and giver',()=>{
 const r=listQuestsTab(many,{group:'level'},ctx);
 assert.equal(r.total,120);assert.deepEqual(r.groups.map(g=>g.label),['Level 3','Level 4','Level 5','No level']);
 assert.equal(r.groups.at(-1).rows.length,1);
 assert.equal(r.groups.reduce((n,g)=>n+g.rows.length,0),120);
 assert.deepEqual(r.levels,[['3','Level 3'],['4','Level 4'],['5','Level 5']]);
 assert.deepEqual(r.regions,[['[TEST] North','[TEST] North'],['[TEST] South','[TEST] South']]);
 assert.equal(r.givers.length,7);assert.deepEqual(r.givers[0],['NPC-T-GIVER-0','T Giver 0']);
 assert.deepEqual(listQuestsTab(many,{group:'region'},ctx).groups.map(g=>g.label),['[TEST] North','[TEST] South','No region']);
 assert.ok(listQuestsTab(many,{group:'giver'},ctx).groups.at(-1).label==='No giver');
 const lv4=listQuestsTab(many,{level:'4'},ctx);assert.ok(lv4.shown>0&&lv4.ids.every(id=>many.find(e=>e.source.id===id).source.parameters.recommended_level==='4'));
 const rows=many.map(e=>questRow(e,ctx));
 assert.ok(filterRows(rows,{region:'[TEST] North'}).every(x=>x.regions.includes('[TEST] North')));
 assert.ok(filterRows(rows,{giver:'NPC-T-GIVER-2'}).every(x=>x.giverIds.includes('NPC-T-GIVER-2')));
 assert.equal(filterRows(rows,{search:'level 5'}).length,rows.filter(x=>x.level===5).length);
 assert.equal(filterRows(rows,{search:'npc-t-giver-2'}).length,filterRows(rows,{giver:'NPC-T-GIVER-2'}).length,'raw id stays searchable');
 const sorted=sortRows(rows,'level').map(x=>x.level);assert.deepEqual(sorted,[...sorted].sort((a,b)=>(a??99)-(b??99)));
 assert.equal(filterCount({level:'4',region:'x',giver:'y',type:'quest'}),4);
});
test('toolbar offers level, region and giver in the Filters row; card shows level and region',()=>{
 const h=questsToolbar({level:'4'},[],{levels:[['4','Level 4']],regions:[['[TEST] North','[TEST] North']],givers:[['Test Dova','Test Dova']],filtersOpen:true});
 assert.match(h,/id="ag-gm-level"[\s\S]*<option value="4" selected>Level 4/);assert.match(h,/id="ag-gm-region"/);assert.match(h,/id="ag-gm-giver"/);
 assert.match(h,/Filters \(1\)/);
 const card=questCard(questRow(entry(src('QUEST-T-C','[TEST] C',{parameters:{recommended_level:'4',quest_type:'hunt'},locations:['LOC-T-A']})),ctx));
 assert.match(card,/Quest · Hunt/);assert.match(card,/Level 4/);assert.match(card,/Place A \(\[TEST\] North\)/);
 assert.deepEqual(gmViewState({group:'level',sort:'level'}).group,'level');assert.equal(DEFAULT_VIEW.level,'all');
});
test('without Locations (no region lookup) the list still works',()=>{
 const r=listQuestsTab(many,{group:'region'},{});assert.deepEqual(r.groups.map(g=>g.label),['No region']);
});
// The real sandbox files are in the private supplement repo; this runs only where it is checked out.
const SANDBOX='/home/user/ashen-gate-supplement/campaign/content-packs/sandbox-v0.1.0/';
test('sandbox quest, order and contract files import without errors and list sensibly',{skip:!fs.existsSync(SANDBOX)},()=>{
 const all=[];
 for(const f of ['S03_Frontier_Quests_v0.1.0.json','S07_Fosstryn_Trainer_Orders_v0.1.0.json','S12_Blight_Quests_v0.1.0.json']){
  const plan=planQuestImport(JSON.parse(fs.readFileSync(SANDBOX+f,'utf8')));assert.deepEqual(plan.errors,[],f);all.push(...plan.rows.map(x=>x.source));
 }
 assert.ok(all.length>=80);
 const r=listQuestsTab(all.map(entry),{group:'level'},{});
 assert.equal(r.groups.reduce((n,g)=>n+g.rows.length,0),all.length);
 assert.ok(r.groups.some(g=>g.label==='Level 3')&&r.groups.some(g=>g.label==='No level'));
 assert.ok(!listQuestsTab(all.map(entry),{group:'giver'},{}).groups.some(g=>/^NPC-/.test(g.label)),'no raw ids as group names');
});

// ---- 0.19.1 ----
import {giverNames,giverOptions,keepSelected} from '../scripts/quests-tab.mjs';
test('0.19.1: a chosen filter value that is no longer an option stays visible, marked "(none now)", and is still applied',()=>{
 const only5=[entry(src('QUEST-T-1','[TEST] one',{parameters:{recommended_level:'5'},locations:['LOC-T-A']})),entry(src('QUEST-T-2','[TEST] two',{parameters:{recommended_level:'3'}}))];
 assert.deepEqual(listQuestsTab(only5,{level:'5'},ctx).levels,[['3','Level 3'],['5','Level 5']]);
 const gone=[only5[1]];
 const r=listQuestsTab(gone,{level:'5',region:'[TEST] North',location:'LOC-T-A',giver:'NPC-T-GONE'},ctx);
 assert.deepEqual(r.levels.at(-1),['5','Level 5 (none now)']);assert.deepEqual(r.regions.at(-1),['[TEST] North','[TEST] North (none now)']);
 assert.deepEqual(r.locations.at(-1),['LOC-T-A','Place A (none now)']);assert.deepEqual(r.givers.at(-1),['NPC-T-GONE','T Gone (none now)']);
 assert.equal(r.shown,0,'the filter is still applied');
 const html=questsToolbar({level:'5'},[],{levels:r.levels,filtersOpen:true});
 assert.match(html,/<option value="5" selected>Level 5 \(none now\)/);
 assert.deepEqual(keepSelected([['3','Level 3']],'all'),[['3','Level 3']]);assert.deepEqual(keepSelected([['3','Level 3']],'3'),[['3','Level 3']]);
});
test('0.19.1: ids that read alike stay separate giver values; the filter and groups key on the id',()=>{
 const mk=(id,giver)=>entry(src(id,`[TEST] ${id}`,{refs:[{relation:'issued_by',target_id:giver,mode:'optional'}]}));
 const list=[mk('QUEST-T-A','NPC-T-WARDEN'),mk('QUEST-T-B','FACTION-T-WARDEN'),mk('QUEST-T-C','NPC-T-OTHER')];
 const rows=list.map(e=>questRow(e,{}));
 assert.equal(new Set(giverOptions(rows).map(o=>o[0])).size,3);
 assert.deepEqual(giverOptions(rows).map(o=>o[1]),['T Other','T Warden (Faction)','T Warden (Npc)']);
 assert.deepEqual(filterRows(rows,{giver:'NPC-T-WARDEN'}).map(r=>r.id),['QUEST-T-A']);
 assert.deepEqual(filterRows(rows,{giver:'FACTION-T-WARDEN'}).map(r=>r.id),['QUEST-T-B']);
 const g=groupRows(rows,'giver');assert.equal(g.length,3);assert.deepEqual(g.map(x=>x.label),['T Other','T Warden (Faction)','T Warden (Npc)']);
 assert.equal(giverNames(rows).get('NPC-T-OTHER'),'T Other','a unique label has no suffix');
});

// ---- 0.19.2 ----
test('0.19.2: a vanished Location filter shows a readable label, never the raw id',()=>{
 const none=[entry(src('QUEST-T-1','[TEST] one'))];
 const unknown=listQuestsTab(none,{location:'LOC-T-GONE'},{}).locations.at(-1);
 assert.deepEqual(unknown,['LOC-T-GONE','a location that no longer matches (none now)']);
 const named=listQuestsTab(none,{location:'LOC-T-A'},ctx).locations.at(-1);
 assert.deepEqual(named,['LOC-T-A','Place A (none now)']);
 assert.doesNotMatch(questsToolbar({location:'LOC-T-GONE'},[unknown],{filtersOpen:true}),/>LOC-T-GONE/);
});
