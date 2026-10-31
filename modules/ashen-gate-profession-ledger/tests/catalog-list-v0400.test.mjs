// 0.40.0: the GM Recipe Catalog list controls (search, Filters (n) with counts, Group by, Sort by, remembered choices). Mocked Foundry: logic and markup only, not the live UI.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import * as L from '../scripts/catalog-list.mjs';
const store=new Map();let storageBroken=false;
globalThis.localStorage={getItem:k=>{if(storageBroken)throw Error('blocked');return store.get(k)??null;},setItem:(k,v)=>{if(storageBroken)throw Error('blocked');store.set(k,String(v));},removeItem:k=>store.delete(k)};
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={};let api;const errors=[];
const values={partyRoster:['a1','a2'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>false,prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e)),warn:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,definition=null,{visibility='player',status='approved'}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='loot')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''},quantity:1},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const world=[];
for(const [p,n] of [['ALCHEMY','Alchemy'],['HERBALISM','Herbalism'],['ARTISTRY','Artistry']])world.push(worldDoc('wp'+p,`${n} — Profession`,src('PROF-'+p,'Profession',def('PROF-'+p,'Profession',{name:n})),'feat'));
world.push(worldDoc('wm1','Material A',src('MAT-TEST-OAK','Material',def('MAT-TEST-OAK','Material',{name:'[TEST] Oakmoss',quality:'common',tier:1}))));
world.push(worldDoc('wi1','[TEST] Tonic item',src('ITEM-TEST-TONIC','Item',def('ITEM-TEST-TONIC','Item',{name:'[TEST] Tonic'})),'consumable'));
world.push(worldDoc('wi2','[TEST] Blade item',src('ITEM-TEST-BLADE','Item',def('ITEM-TEST-BLADE','Item',{name:'[TEST] Blade'})),'weapon'));
const R=(id,name,prof,extra={},vis={})=>world.push(worldDoc('w'+id,`Recipe: ${name}`,src(id,'Recipe',def(id,'Recipe',{name,profession_id:'PROF-'+prof,...extra}),vis)));
R('REC-TEST-A1','[TEST] Tonic','ALCHEMY',{tier:'apprentice',starting:true,result_item_id:'ITEM-TEST-TONIC',workstation:'[TEST] Bench',ingredients:[{material_id:'MAT-TEST-OAK',quantity:1}]});
R('REC-TEST-A2','[TEST] Brew','ALCHEMY',{tier:'expert',required_tools:['Alchemist’s Supplies'],result_item_id:'ITEM-TEST-TONIC'});
R('REC-TEST-A3','[TEST] Blade','ALCHEMY',{tier:'master',tool:'smith',workstation:'[TEST] Forge',result_item_id:'ITEM-TEST-BLADE'});
R('REC-TEST-H1','[TEST] Poultice','HERBALISM',{tier:'journeyman'});
R('REC-TEST-H2','[TEST] Draft Salve','HERBALISM',{tier:'journeyman'},{status:'draft',visibility:'gm'});
R('REC-TEST-R1','[TEST] Ballad','ARTISTRY',{kind:'activity',tier:'apprentice',effect_note:'[TEST] crowd'});
R('REC-TEST-R2','[TEST] Rune','ARTISTRY',{kind:'activity',gm_applied:true,tier:'artisan',bring:{text:'a blade'}});
const actor=(id,name,known)=>({id,name,type:'character',hasPlayerOwner:true,items:Object.assign([],{get:()=>undefined}),flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},testUserPermission:()=>true,setFlag:async()=>{}});
const alpha=actor('a1','[TEST] Alpha',['REC-TEST-A1','REC-TEST-A2','REC-TEST-H1']),bravo=actor('a2','[TEST] Bravo',['REC-TEST-A1']);
const journal={id:'j1',flags:{'ashen-gate-profession-ledger':{role:'gm-data'}},getFlag(m,k){return this.flags[m]?.[k];},async update(){}};
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.41.1'};
globalThis.game={user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},journal:[journal],
  actors:{contents:[alpha,bravo],get:id=>[alpha,bravo].find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'catalog'});app.element={querySelectorAll:()=>[],querySelector:()=>null};
const html=async()=>{app.view='catalog';return (await app._prepareContext({})).html;};
const names=m=>m.rows.map(r=>r.name.replace('[TEST] ',''));
const list=o=>api.catalogList(o);
const ids=m=>m.rows.map(r=>r.id.replace('REC-TEST-',''));

test('the world has the fixtures this file relies on',()=>{
 const m=list({});assert.equal(m.total,7);assert.equal(m.shown,7);assert.equal(m.group,'profession');assert.equal(m.sort,'name');assert.equal(m.empty,'');
});

test('each filter, with the exact rows it keeps',()=>{
 const f=(k,v)=>ids(list({filters:{[k]:v}})).sort().join(',');
 assert.equal(f('profession','Alchemy'),'A1,A2,A3');
 assert.equal(f('profession','Artistry'),'R1,R2');
 assert.equal(f('discipline','crafting'),'A1,A2,A3');assert.equal(f('discipline','gathering'),'H1,H2');assert.equal(f('discipline','creative'),'R1,R2');
 assert.equal(f('tier','Apprentice'),'A1,R1');assert.equal(f('tier','Master'),'A3');assert.equal(f('tier','Journeyman'),'H1,H2');
 assert.equal(f('known','any'),'A1,A2,H1');assert.equal(f('known','none'),'A3,H2,R1,R2');
 assert.equal(f('known','all'),'A1','known by everyone in the party (both characters)');assert.equal(f('known','found'),'','nobody holds an unlearned recipe item here');
 assert.equal(f('player','a1'),'A1,A2,H1');assert.equal(f('player','a2'),'A1');
 assert.equal(f('starting','yes'),'A1');assert.equal(f('starting','no'),'A2,A3,H1,H2,R1,R2');
 assert.equal(f('requirement','tool'),'A2');assert.equal(f('requirement','workstation'),'A1');assert.equal(f('requirement','both'),'A3');assert.equal(f('requirement','neither'),'H1,H2,R1,R2');
 assert.equal(f('makes','Consumable'),'A1,A2');assert.equal(f('makes','Weapon'),'A3');
 assert.equal(f('kind','activity'),'R1');assert.equal(f('kind','enchantment'),'R2');assert.equal(f('kind','craft'),'A1,A2,A3,H1,H2');
 assert.equal(f('visibility','draft'),'H2');assert.equal(f('visibility','released'),'A1,A2,A3,H1,R1,R2');
});

test('combined filters AND together, and counts follow the other filters but not their own',()=>{
 const m=list({filters:{profession:'Alchemy',known:'any'}});assert.equal(ids(m).sort().join(),'A1,A2');
 const c=k=>Object.fromEntries(m.controls.filters.find(x=>x.key===k).options.map(o=>[o.value,o.count]));
 assert.equal(c('profession').Alchemy,2,'own count follows the other filters only');assert.equal(c('profession').Herbalism,1,'Herbalism has one known recipe');assert.equal(c('profession').Artistry,0);
 assert.equal(c('tier').Apprentice,1);assert.equal(c('tier').Expert,1);assert.equal(c('tier').Master,0);
 assert.equal(c('player').a1,2);assert.equal(c('player').a2,1,'every party character is listed, even with a zero count');
 assert.equal(c('known').none,1,'Blade, among the Alchemy recipes');assert.equal(c('known').any,2);
 assert.equal(m.controls.filters.length,10);
});

test('search: name, profession, makes, ingredient, tool, workstation and who knows it; several words must all match',()=>{
 const q=s=>ids(list({query:s})).sort().join();
 assert.equal(q('poultice'),'H1');assert.equal(q('artistry'),'R1,R2');assert.equal(q('oakmoss'),'A1','ingredient name');assert.equal(q('forge'),'A3','workstation');
 assert.equal(q('alchemist'),'A2','tool');assert.equal(q('weapon'),'A3','what it makes');assert.equal(q('bravo'),'A1','known by');assert.equal(q('alpha tonic'),'A1,A2','Brew also makes a Tonic and Alpha knows it');assert.equal(q('bravo brew'),'');
 const none=list({query:'zzz'});assert.equal(none.empty,'no-match');assert.equal(none.shown,0);assert.equal(none.total,7);
 assert.equal(ids(list({query:'alchemy',filters:{tier:'Expert'}})).join(),'A2','search and filters combine');
});

test('each grouping',()=>{
 const g=(group,o={})=>list({group,...o}).groups.map(x=>`${x.label}:${x.rows.length}`).join('|');
 assert.equal(g('profession'),'Alchemy:3|Artistry:2|Herbalism:2');
 assert.equal(g('tier'),'Apprentice:2|Journeyman:2|Expert:1|Artisan:1|Master:1','tiers in ladder order');
 assert.equal(g('discipline'),'Crafting:3|Gathering:2|Creative (Artistry):2');
 assert.equal(g('player'),'[TEST] Alpha:3|[TEST] Bravo:1|Known by nobody:4','a recipe shows under every character who knows it; nobody last');
 assert.equal(g('none'),':7');assert.equal(list({group:'none'}).groups[0].label,'');
 assert.equal(list({group:'bogus'}).group,'profession','unknown mode falls back');
});

test('each sort and direction; ties fall back to name A to Z',()=>{
 const s=(sort,sortDesc=false)=>names(list({sort,sortDesc})).join(',');
 assert.equal(s('name'),'Ballad,Blade,Brew,Draft Salve,Poultice,Rune,Tonic');assert.equal(s('name',true),'Tonic,Rune,Poultice,Draft Salve,Brew,Blade,Ballad');
 assert.equal(s('profession'),'Blade,Brew,Tonic,Ballad,Rune,Draft Salve,Poultice');assert.equal(s('profession',true),'Draft Salve,Poultice,Ballad,Rune,Blade,Brew,Tonic');
 assert.equal(s('tier'),'Ballad,Tonic,Draft Salve,Poultice,Brew,Rune,Blade');assert.equal(s('tier',true),'Blade,Rune,Brew,Draft Salve,Poultice,Ballad,Tonic');
 assert.equal(s('known'),'Ballad,Blade,Draft Salve,Rune,Brew,Poultice,Tonic');assert.equal(s('known',true),'Tonic,Brew,Poultice,Ballad,Blade,Draft Salve,Rune');
 assert.equal(list({sort:'recent'}).sort,'name','no "recently learned" sort: the Ledger does not record when a recipe was learned');
});

test('pure model: GM only, and plain data out',()=>{
 const facts=[L.describeRecipe({id:'REC-X',name:'X',tier:'Expert'},{known:[{id:'a',name:'A'}]})];
 assert.throws(()=>L.buildCatalogModel(facts,{gm:false}),/Only the GM/);assert.throws(()=>L.buildCatalogModel(facts,{}),/Only the GM/);
 const plain=list({});assert.ok(plain.rows.every(r=>!('ref' in r)&&!('search' in r)&&!('uuid' in r)));
 assert.equal(JSON.stringify(plain).includes('Item.w'),false,'no Foundry uuids');
 const found=L.describeRecipe({id:'REC-Y',name:'Y'},{known:[{id:'a',name:'A'}],found:[{id:'a',name:'A'},{id:'b',name:'B'}],partySize:2});
 assert.deepEqual(found.foundOnly.map(x=>x.id),['b'],'a held recipe item counts only for characters who have not learned it');
 assert.equal(L.applyFilters([found],{known:'found'}).length,1);assert.equal(L.applyFilters([found],{known:'all'}).length,0);
 assert.equal(L.applyFilters([L.describeRecipe({id:'Z',name:'Z'},{partySize:0})],{known:'all'}).length,0,'an empty party knows nothing');
});

test('the Ledger has no group recipe knowledge: nothing offers a "known by the group" filter beyond everyone-in-the-party',()=>{
 assert.deepEqual(L.KNOWN_FILTERS.map(k=>k.value),['any','none','all','found']);
 assert.ok(!L.FILTER_CONTROLS.some(c=>/group|workshop|hq/i.test(c.key)));
});

test('markup: one toolbar row with Filters (n); the filter row opens from it; the default keeps profession folders with tier groups',async()=>{
 app.__catPrefs=undefined;store.clear();
 let h=await html();
 assert.match(h,/data-agl-search/);assert.match(h,/<button type="button" class="ag-chip" data-action="catalog-filters" aria-pressed="false" aria-expanded="false"[^>]*><i[^>]*><\/i> Filters<\/button>/);
 assert.match(h,/Showing 7 of 7/);assert.doesNotMatch(h,/agl-catalog-filters"><div/,'filter row closed');
 assert.match(h,/<details class="agl-folder agl-tree-folder" data-folder="alchemy"/);assert.match(h,/data-tier-group="alchemy:apprentice"/);
 assert.match(h,/Known by \[TEST\] Alpha, \[TEST\] Bravo \(2\)/,'names and a count');assert.match(h,/Not found by the party yet/);assert.match(h,/Draft/);
 await app._click('catalog-filters');h=await html();
 assert.match(h,/id="agl-catalog-filters"/);
 for(const k of ['profession','discipline','tier','known','player','starting','requirement','makes','kind','visibility'])assert.match(h,new RegExp(`data-agl-filter="${k}"`),k);
 assert.match(h,/<option value="Alchemy" >Alchemy \(3\)<\/option>/,'counts in the options');assert.match(h,/data-agl-sort/);assert.match(h,/data-agl-group/);
 assert.match(h,/data-action="catalog-sortdir" aria-label="Sort direction: ascending" data-tooltip=/,'icon button has aria-label and tooltip');
 assert.doesNotMatch(h,/data-action="catalog-clear"/,'Clear filters only when something is set');
});

test('choices re-render the list: filters, sort direction, group; Filters (n) counts filters; Clear filters resets them and the search',async()=>{
 app._saveCatalogPrefs({filters:{...app._catalogPrefs.filters,known:'none',tier:'Apprentice'}});
 let h=await html();assert.match(h,/Filters \(2\)/);assert.match(h,/Showing 1 of 7/);assert.match(h,/Ballad/);assert.doesNotMatch(h,/\[TEST\] Tonic/);
 assert.match(h,/data-action="catalog-clear"/);
 app._saveCatalogPrefs({group:'player'});h=await html();assert.match(h,/data-folder="player-nobody"|data-folder="player-x"|agl-group-folder/);assert.match(h,/Known by nobody/);
 app._saveCatalogPrefs({group:'none'});h=await html();assert.doesNotMatch(h,/agl-group-folder|agl-tree-folder/);assert.match(h,/Ballad/);
 await app._click('catalog-sortdir');assert.equal(app._catalogPrefs.sortDesc,true);h=await html();assert.match(h,/Sort direction: descending/);
 app._saveCatalogPrefs({group:'tier',sort:'tier'});h=await html();assert.match(h,/data-folder="tier-Apprentice"/);
 app.query='zzz';h=await html();
 assert.match(h,/No recipes match\./);assert.match(h,/class="ag-btn ag-btn--sm" data-action="catalog-clear"/);assert.match(h,/Showing 0 of 7/);
 await app._click('catalog-clear');assert.equal(app.query,'');assert.deepEqual(Object.values(app._catalogPrefs.filters).filter(Boolean),[]);
 h=await html();assert.match(h,/Showing 7 of 7/);
 app._saveCatalogPrefs({group:'profession',sort:'name',sortDesc:false});
});

test('profession grouping keeps the chosen sort inside each tier',async()=>{
 app._saveCatalogPrefs({group:'profession',sort:'name',sortDesc:true,filters:{profession:'Alchemy'}});
 const h=await html();
 assert.ok(h.indexOf('[TEST] Tonic')>-1&&h.indexOf('[TEST] Brew')>h.indexOf('[TEST] Tonic'),'tier order first (Apprentice before Expert), then the sort inside a tier');
 app._saveCatalogPrefs({filters:{},sortDesc:false});
});

test('choices are remembered per user on this device, with storage failures tolerated',async()=>{
 store.clear();app.__catPrefs=undefined;
 app._saveCatalogPrefs({group:'tier',sort:'known',sortDesc:true,filtersOpen:true,filters:{...L.emptyFilters(),profession:'Alchemy'}});
 assert.ok([...store.keys()].some(k=>k.endsWith(':gm')),'stored under the user');
 app.__catPrefs=undefined;
 assert.deepEqual({...app._catalogPrefs,filters:undefined},{group:'tier',sort:'known',sortDesc:true,filtersOpen:true,filters:undefined});assert.equal(app._catalogPrefs.filters.profession,'Alchemy');
 assert.equal(app.query,'', 'the search text is not remembered');
 store.set([...store.keys()][0],'{not json');app.__catPrefs=undefined;assert.deepEqual(app._catalogPrefs.group,'profession','corrupt storage reads as defaults');
 store.set([...store.keys()][0],JSON.stringify({catalogList:{group:'zzz',sort:5,filters:{tier:7,known:'any'}}}));app.__catPrefs=undefined;
 assert.deepEqual([app._catalogPrefs.group,app._catalogPrefs.sort,app._catalogPrefs.filters.tier,app._catalogPrefs.filters.known],['profession','name','','any']);
 storageBroken=true;app.__catPrefs=undefined;
 assert.equal(app._catalogPrefs.group,'profession');assert.doesNotThrow(()=>app._saveCatalogPrefs({group:'tier'}));assert.equal(app._catalogPrefs.group,'tier','kept in memory');
 storageBroken=false;app._saveCatalogPrefs({group:'profession',filtersOpen:false,filters:{}});
 assert.deepEqual(L.cleanPrefs(null),L.DEFAULT_PREFS);
});

test('GM only: a player gets no list controls and no catalog data, and every entry point refuses',async()=>{
 const before=JSON.stringify(app._catalogPrefs);
 game.user=player;
 assert.throws(()=>api.catalogList({}),/Only the GM/);
 assert.throws(()=>api.catalogList({filters:{visibility:'draft'}}),/Only the GM/);
 app._saveCatalogPrefs({group:'tier',filtersOpen:true});assert.equal(JSON.stringify(app._catalogPrefs),before,'a player cannot change the GM list choices');
 errors.length=0;await app._click('catalog-filters');await app._click('catalog-sortdir');await app._click('catalog-clear');
 assert.ok(errors.some(e=>e.includes('GM only')));assert.equal(JSON.stringify(app._catalogPrefs),before);
 const h=await html();
 assert.doesNotMatch(h,/catalog-filters|data-agl-filter|data-agl-sort|catalog-sortdir|Showing \d+ of/);
 assert.doesNotMatch(h,/Draft Salve|Rune|Ballad/,'draft, GM-only and unfound recipes stay out of a player view');
 assert.throws(()=>app._catalogFacts(app.library),/Only the GM/);
 game.user=gm;
});
