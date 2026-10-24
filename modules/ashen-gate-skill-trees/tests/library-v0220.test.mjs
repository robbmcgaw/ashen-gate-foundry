import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {uiState,bindFolds} from '../scripts/ag-html.mjs';
import {classifyTree,levelRange,libraryRow,sortRows,filterRows,activeFilterCount,cleanFilters,buildLibrary,renderLibraryHtml,renderFiltersFold,
  libraryFoldKey,pickerGroups,CATEGORIES,libraryCountText,filtersTitle} from '../scripts/library.mjs';
import {treePicker} from '../scripts/groups.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';
// 0.22.0 Tree Library folders. Mocked: proves the pure grouping/sorting/filtering/persistence helper and the HTML it renders, not the live Forge window.

const node=(id,extra={})=>({id,name:id,requiredLevel:1,...extra});
const T=(id,name,kind,sourceRef,extra={})=>({id,name,status:'approved',visibility:'player',provider:{kind},sourceRef,nodes:[node('A')],...extra});
const prof=(id,name,ref,extra)=>T(id,name,'profession',ref,extra);
const MIXED=[
  prof('TREE-ALCH','Alchemy','PROF-ALCHEMY',{nodes:[node('A',{requiredLevel:1}),node('B',{requiredLevel:13})],updatedAt:'2026-10-20T10:00:00.000Z'}),
  prof('TREE-SMITH','Blacksmithing','PROF-BLACKSMITHING',{status:'draft',visibility:'gm',nodes:[node('A',{requiredLevel:4}),node('B'),node('C')]}),
  prof('TREE-HERB','Herbalism','PROF-HERBALISM',{updatedAt:'2026-10-23T10:00:00.000Z'}),
  prof('TREE-MINE','Mining','PROF-MINING',{nodes:[]}),
  prof('TREE-HUNT','Hunting/Skinning','PROF-HUNTING-SKINNING'),
  prof('TREE-ART-MUS','Artistry · Music','PROF-ARTISTRY'),prof('TREE-ART-PRF','Artistry · Performance','PROF-ARTISTRY'),
  T('TREE-CIN','Ember Cinder','cinder_milestone','MUT-EMBER',{status:'draft',visibility:'gm'}),
  T('TREE-GEN','Guild Renown','generic_points',null),
  prof('TREE-T1','Alchemy · Prototype','PROF-TG-ALCHEMY'),
  T('TREE-T2','Spare','generic_points',null,{status:'test'}),
  prof('DEMO-TREE-FISH','Fishing · Prototype','PROF-FISHING')
];
const folderKeys=m=>m.folders.map(f=>f.key);
const names=f=>f.units.flatMap(u=>u.type==='tree'?[u.row.name]:u.rows.map(r=>r.name));

test('classifyTree: kind, profession and test markers decide the folder',()=>{
  const by=Object.fromEntries(MIXED.map(t=>[t.id,classifyTree(t)]));
  assert.deepEqual(by,{ 'TREE-ALCH':'crafting','TREE-SMITH':'crafting','TREE-HERB':'gathering','TREE-MINE':'gathering','TREE-HUNT':'gathering',
    'TREE-ART-MUS':'creative','TREE-ART-PRF':'creative','TREE-CIN':'cinder','TREE-GEN':'other','TREE-T1':'test','TREE-T2':'test','DEMO-TREE-FISH':'test'});
  assert.equal(classifyTree(prof('X','Mystery craft','PROF-MYSTERY')),'other','an unknown profession is not guessed');
  assert.equal(classifyTree(prof('X','Fishing','PROF-FISHING')),'gathering');
  assert.equal(classifyTree(prof('X','Cooking','PROF-COOKING')),'crafting');
  assert.equal(classifyTree({}),'other');
});

test('grouping a mixed list: fixed folder order, counts, empty folders left out',()=>{
  const m=buildLibrary(MIXED);
  assert.deepEqual(folderKeys(m),['crafting','gathering','creative','cinder','other','test']);
  assert.deepEqual(m.folders.map(f=>f.count),[2,3,2,1,1,3]);
  assert.deepEqual(names(m.folders[0]),['Alchemy','Blacksmithing']);
  assert.deepEqual(folderKeys(buildLibrary(MIXED.filter(t=>t.provider.kind==='cinder_milestone'))),['cinder'],'a folder with no tree is not shown');
  assert.equal(CATEGORIES.length,6);
});

test('a profession with several trees stays one heading with its shared line inside the folder',()=>{
  const m=buildLibrary(MIXED,{walletText:g=>`wallet for ${g.size} trees`});
  const creative=m.folders.find(f=>f.key==='creative');
  assert.equal(creative.units.length,1);
  const u=creative.units[0];
  assert.equal(u.type,'group');assert.equal(u.name,'Artistry');assert.equal(u.walletText,'wallet for 2 trees');
  assert.deepEqual(u.rows.map(r=>r.memberName),['Music','Performance']);
  const html=renderLibraryHtml(m);
  assert.match(html,/Artistry<\/h4>/);assert.match(html,/wallet for 2 trees/);
  assert.equal((html.match(/<details/g)??[]).length,6,'one fold per folder and no fold inside a fold');
  assert.doesNotMatch(html,/<details[^>]*>(?:(?!<\/details>)[\s\S])*<details/);
});

test('sort modes',()=>{
  const rows=MIXED.map(t=>libraryRow(t));
  const order=sort=>sortRows(rows.filter(r=>['TREE-ALCH','TREE-SMITH','TREE-HERB','TREE-MINE'].includes(r.id)),sort).map(r=>r.name);
  assert.deepEqual(order('name'),['Alchemy','Blacksmithing','Herbalism','Mining']);
  assert.deepEqual(order('name-desc'),['Mining','Herbalism','Blacksmithing','Alchemy']);
  assert.deepEqual(order('level'),['Herbalism','Blacksmithing','Alchemy','Mining'],'lowest first, then narrowest; a tree with no recorded level goes last');
  assert.deepEqual(order('edited'),['Herbalism','Alchemy','Blacksmithing','Mining'],'newest first; never-saved trees last, by name');
  assert.deepEqual(order('perks'),['Blacksmithing','Alchemy','Herbalism','Mining']);
  assert.deepEqual(order('status'),['Alchemy','Herbalism','Mining','Blacksmithing'],'approved before draft');
  assert.deepEqual(order('nonsense'),order('name'),'an unknown sort reads as name');
  assert.equal(sortRows([{name:'b10'},{name:'b9'}]).map(r=>r.name).join(),'b9,b10','numbers sort naturally');
});

test('sorting applies inside each folder and to profession groups as one unit',()=>{
  const m=buildLibrary(MIXED,{sort:'name-desc'});
  assert.deepEqual(names(m.folders[0]),['Blacksmithing','Alchemy']);
  assert.deepEqual(names(m.folders.find(f=>f.key==='gathering')),['Mining','Hunting/Skinning','Herbalism']);
});

test('level range comes from the perks and shows as text',()=>{
  assert.deepEqual(levelRange(MIXED[0]),{min:1,max:13});
  assert.equal(levelRange(MIXED[3]),null);
  assert.deepEqual(levelRange({nodes:[{minLevel:5},{requiredLevel:2}]}),{min:2,max:5});
  assert.equal(libraryRow(MIXED[0]).levelText,'Levels 1–13');
  assert.equal(libraryRow(MIXED[2]).levelText,'Level 1');
  assert.equal(libraryRow(MIXED[3]).levelText,'');
});

test('search and filters combine; the filter count is the n in Filters (n)',()=>{
  const rows=MIXED.map(t=>libraryRow(t));
  assert.deepEqual(filterRows(rows,{query:'alch'}).map(r=>r.name).sort(),['Alchemy','Alchemy · Prototype']);
  assert.deepEqual(filterRows(rows,{query:'alch',filters:{category:'crafting'}}).map(r=>r.name),['Alchemy']);
  assert.deepEqual(filterRows(rows,{query:'GM only',filters:{category:'crafting'}}).map(r=>r.name),['Blacksmithing']);
  assert.deepEqual(filterRows(rows,{filters:{status:'draft',visibility:'gm'}}).map(r=>r.name).sort(),['Blacksmithing','Ember Cinder']);
  assert.deepEqual(filterRows(rows,{query:'cinder gm'}).map(r=>r.name),['Ember Cinder'],'every word must match');
  assert.equal(filterRows(rows,{query:'zzz'}).length,0);
  assert.equal(activeFilterCount({category:'crafting',status:'all',visibility:'gm'}),2);
  assert.equal(activeFilterCount({category:'bogus'}),0);
  assert.equal(filtersTitle({status:'draft'}),'Filters (1)');assert.equal(filtersTitle({}),'Filters');
  assert.deepEqual(cleanFilters({category:'x',status:'draft'}),{category:'all',status:'draft',visibility:'all'});
  const m=buildLibrary(MIXED,{query:'alch',filters:{category:'test'}});
  assert.deepEqual(folderKeys(m),['test'],'folders with no match are hidden');
  assert.equal(m.folders[0].count,1);assert.equal(m.folders[0].total,3,'a folder says how many of its trees match');
  assert.equal(libraryCountText(m.shown,m.total),'1 of 12 trees');
});

test('empty and no-match states',()=>{
  const none=buildLibrary([]);
  assert.equal(none.empty,true);assert.match(renderLibraryHtml(none),/No trees yet/);
  const miss=buildLibrary(MIXED,{query:'zzz'});
  assert.equal(miss.noMatch,true);assert.equal(miss.folders.length,0);
  const html=renderLibraryHtml(miss);
  assert.match(html,/Nothing matches/);assert.match(html,/<button type="button"[^>]*data-agst-library-clear>/);
});

test('other groupings: status, visibility and a flat list',()=>{
  assert.deepEqual(folderKeys(buildLibrary(MIXED,{groupBy:'status'})),['approved','test','draft']);
  assert.deepEqual(folderKeys(buildLibrary(MIXED,{groupBy:'visibility'})),['player','gm']);
  const flat=buildLibrary(MIXED,{groupBy:'none',sort:'name'});
  assert.equal(flat.folders.length,1);assert.equal(flat.folders[0].count,12);
  assert.doesNotMatch(renderLibraryHtml(flat),/<details/);
  assert.equal(buildLibrary(MIXED,{groupBy:'bogus'}).groupBy,'type');
});

test('rendered rows: buttons for actions, readable names, selection, no ids, escaped',()=>{
  const evil=prof('TREE-EVIL','<b>Evil</b> & "co"','PROF-ALCHEMY');
  const m=buildLibrary([...MIXED,evil],{selectedId:'TREE-HERB'});
  const html=renderLibraryHtml(m);
  assert.match(html,/<li class="ag-row is-selected" aria-current="true" data-agst-library-row data-tree="TREE-HERB">/);
  assert.match(html,/<button type="button" class="ag-btn ag-btn--sm" data-act="open-row" data-tree="TREE-HERB" aria-label="Open Herbalism">/);
  assert.match(html,/data-act="export" data-tree="TREE-HERB"/);
  assert.doesNotMatch(html,/<b>Evil/);assert.match(html,/&lt;b&gt;Evil&lt;\/b&gt; &amp; &quot;co&quot;/);
  const visible=html.replace(/ (data-tree|data-ag-fold-key)="[^"]*"/g,'');
  assertNoIds(visible.replace(/<[^>]+>/g,' '));
  assert.doesNotMatch(visible,/PROF-|TREE-|MUT-/);
  assert.doesNotMatch(html,/<a /);assert.doesNotMatch(html,/onclick|role="button"/);
  const [row]=html.match(/<details[^>]*>/g);assert.match(row,/class="ag-fold"/);
});

test('folder open state: key, default, filtering, and per-user persistence',()=>{
  assert.equal(libraryFoldKey('type','crafting'),'lib:type:crafting');
  assert.equal(libraryFoldKey('bogus','x'),'lib:type:x');
  const m=buildLibrary(MIXED,{selectedId:'TREE-CIN'});
  const closed=renderLibraryHtml(m,{openByDefault:false});
  assert.match(closed,/<details class="ag-fold" data-ag-fold-key="lib:type:crafting"><summary/,'big libraries start closed');
  assert.match(closed,/data-ag-fold-key="lib:type:cinder" open>/,'the folder holding the selected tree is open');
  assert.match(renderLibraryHtml(m,{openByDefault:true}),/data-ag-fold-key="lib:type:crafting" open>/);
  const searching=renderLibraryHtml(buildLibrary(MIXED,{query:'alch'}),{openByDefault:false});
  assert.doesNotMatch(searching,/data-ag-fold-key/,'search results are open and not remembered');
  assert.equal((searching.match(/ open>/g)??[]).length,2);
  assert.match(searching,/<span class="ag-fold__count">1 of 2<\/span>/);
  assert.match(renderLibraryHtml(m),/<span class="ag-fold__count">3<\/span>/);
  // persistence: the kit stores fold:<key> under ag-ui:<module>:<user>, separately for each user
  const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
  const gm=uiState('ashen-gate-skill-trees',{storage,userId:'gm1'}),pl=uiState('ashen-gate-skill-trees',{storage,userId:'pl1'});
  assert.equal(gm.key,'ag-ui:ashen-gate-skill-trees:gm1');
  const el=(key,open)=>{const l={};return {open,dataset:{agFoldKey:key},addEventListener:(e,f)=>{l[e]=f;},removeEventListener(){},fire(v){this.open=v;l.toggle();}};};
  const make=(opened)=>{const folds=[el('lib:type:crafting',opened),el('lib:type:cinder',opened)];
    return {folds,root:{querySelectorAll:()=>folds}};};
  const a=make(true);bindFolds(a.root,gm);a.folds[0].fire(false);
  assert.equal(gm.get('fold:lib:type:crafting'),false);
  const again=make(true);bindFolds(again.root,gm);
  assert.equal(again.folds[0].open,false,'a closed folder is still closed after a re-render');assert.equal(again.folds[1].open,true);
  const other=make(true);bindFolds(other.root,pl);assert.equal(other.folds[0].open,true,'another user keeps their own state');
});

test('filters fold: one disclosure with three selects and Clear filters',()=>{
  const html=renderFiltersFold({category:'crafting',visibility:'gm'});
  assert.match(html,/<summary class="ag-fold__summary"><span class="ag-fold__title">Filters \(2\)<\/span>/);
  assert.match(html,/<option value="crafting" selected>Crafting professions<\/option>/);
  assert.match(html,/data-agst-library-clear-filters/);
  assert.equal((html.match(/<details/g)??[]).length,1);
});

test('player vs GM: the helper shows exactly the trees it is given, grouped the same way',()=>{
  const published=MIXED.filter(t=>t.visibility==='player'&&t.status!=='draft');   // what the player snapshot holds
  const gmView=buildLibrary(MIXED),playerView=buildLibrary(published);
  assert.ok(gmView.total>playerView.total);
  const flat=m=>m.folders.flatMap(f=>names(f));
  assert.ok(!flat(playerView).includes('Blacksmithing'),'a GM-only draft is not in the player list');
  assert.ok(!flat(playerView).includes('Ember Cinder'));
  assert.ok(flat(gmView).includes('Blacksmithing'));
  for(const f of playerView.folders)assert.equal(f.key,gmView.folders.find(g=>g.key===f.key).key,'same folders, same order');
  // the player Tree select
  const pick=treePicker(published,'TREE-HERB'),groups=pickerGroups(pick.options,published);
  assert.deepEqual(groups.map(g=>g.label),['Crafting professions','Gathering professions','Creative professions','Other trees','Test trees']);
  assert.deepEqual(groups[1].options.map(o=>o.label),['Herbalism','Hunting/Skinning','Mining']);
  assert.equal(groups.flatMap(g=>g.options).length,pick.options.length,'no tree is lost');
  assert.equal(pickerGroups([{value:'TREE-HERB',label:'Herbalism'}],published),null,'one group: a flat select');
});

test('wiring: the library is GM-only, uses the helper, keeps Open/Export, and updatedAt stays out of the player view',()=>{
  const main=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8'),hbs=fs.readFileSync(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  assert.match(main,/if\(action==='tab-library'\)\{if\(!game\.user\.isGM\)/,'permission check unchanged');
  assert.match(main,/gm&&this\.activeTab==='library'\?readPrivate\(\)/,'library data is read only for the GM');
  assert.match(main,/data-act="open-row"|case 'open-row'/);
  assert.match(hbs,/data-agst-library-region/);assert.match(hbs,/<optgroup label="\{\{label\}\}">/);
  assert.match(fs.readFileSync(new URL('../scripts/library.mjs',import.meta.url),'utf8'),/data-act="export"/);
  assert.doesNotMatch(main,/publicTree\([^)]*updatedAt/);
});
