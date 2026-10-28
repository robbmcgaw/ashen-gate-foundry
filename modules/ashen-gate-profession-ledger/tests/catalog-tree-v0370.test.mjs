// 0.37.0: the Recipe Catalog and Party By profession: profession folders with tier groups in ladder order. Mocked Foundry: logic and markup only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {recipeTierName,buildTree,treeHtml,treeKeys,applyTreeSearch,OTHER_TIER} from '../scripts/catalog-tree.mjs';
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const here=path.dirname(fileURLToPath(import.meta.url));
const hooks={};let api;
const values={partyRoster:['a1'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>false,prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,definition=null)=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',status:'approved',version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='loot')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''},quantity:1},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const PROFS=['ALCHEMY','COOKING','HERBALISM'];
// Tiers in a deliberately scrambled order; every sixth recipe has none, and the second profession's recipes skip Master.
const TIERS_USED=['master','apprentice','expert','journeyman','artisan',null];
const TIER_OF=i=>TIERS_USED[Math.floor(i/3)%6];
const world=[];
for(const p of PROFS)world.push(worldDoc('wp'+p,`${p} — Profession`,src('PROF-'+p,'Profession',def('PROF-'+p,'Profession',{name:p[0]+p.slice(1).toLowerCase()})),'feat'));
for(let i=0;i<90;i++)world.push(worldDoc('wr'+i,`Recipe: [TEST] Recipe ${i}`,src('REC-TEST-'+i,'Recipe',def('REC-TEST-'+i,'Recipe',{name:`[TEST] Recipe ${i}`,profession_id:'PROF-'+PROFS[i%3],...(TIER_OF(i)?{tier:TIER_OF(i)}:{}),starting:i%2===0,ingredients:[{material_id:'MAT-TEST-A',quantity:1}]}))));
world.push(worldDoc('wma','Material A',src('MAT-TEST-A','Material',def('MAT-TEST-A','Material',{name:'[TEST] Material A',quality:'common',tier:2}))));
const held=(id,name,flags,type='loot')=>({id,name,type,system:{quantity:1,description:{value:''}},flags});
const items=[held('hp','Alchemy — Profession',src('PROF-ALCHEMY','Profession'),'feat'),held('hp2','Cooking — Profession',src('PROF-COOKING','Profession'),'feat')];items.get=i=>items.find(x=>x.id===i);
const actor={id:'a1',name:'[TEST] Alpha',type:'character',hasPlayerOwner:true,items,flags:{'ashen-gate-profession-ledger':{knownRecipes:[]}},testUserPermission:()=>true,setFlag:async()=>{}};
const journal={id:'j1',flags:{'ashen-gate-profession-ledger':{role:'gm-data'}},getFlag(m,k){return this.flags[m]?.[k];},async update(u){for(const [k,v] of Object.entries(u)){const [,m,key]=k.split('.');this.flags[m]??={};this.flags[m][key]=v;}}};
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.37.3'};
globalThis.game={user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},journal:[journal],
  actors:{contents:[actor],get:id=>id==='a1'?actor:undefined},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'catalog'});app.element={querySelectorAll:()=>[],querySelector:()=>null};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};


const tiersOf=h=>[...h.matchAll(/data-tier-group="([^"]+)"/g)].map(m=>m[1]);
const folderHtml=(h,key)=>{const i=h.indexOf(`data-folder="${key}"`);const j=h.indexOf('data-folder="',i+10);return h.slice(i,j<0?h.length:j);};

test('pure: a recipe’s tier reads the same as its chip: tier name, a number, or the minimum level it asks for; none is Other',()=>{
 assert.equal(recipeTierName({tier:'Journeyman'}),'Journeyman');assert.equal(recipeTierName({tier:'expert'}),'Expert');assert.equal(recipeTierName({tier:4}),'Artisan');
 assert.equal(recipeTierName({tier:null,sourceDefinition:{minimum_profession_level:7}}),'Expert');assert.equal(recipeTierName({tier:'bogus'}),null);assert.equal(recipeTierName({}),null);
 const rows=[['Cooking','master'],['Cooking','apprentice'],['Cooking',null],['Alchemy','expert'],['Alchemy','apprentice'],['Alchemy','apprentice']]
  .map(([g,t],i)=>({group:g,recipe:{name:`R${i}`,tier:t},html:`<i>${i}</i>`}));
 const tree=buildTree(rows);
 assert.deepEqual(tree.map(p=>p.name),['Alchemy','Cooking'],'professions by name');
 assert.deepEqual(tree[0].tiers.map(t=>[t.name,t.rows.length]),[['Apprentice',2],['Expert',1]],'ladder order, empty tiers omitted');
 assert.deepEqual(tree[1].tiers.map(t=>t.name),['Apprentice','Master',OTHER_TIER],'Other is last');
 assert.deepEqual(treeKeys(tree).folders,['alchemy','cooking']);
});

test('the tree html: professions are one <details>; tiers are header buttons with aria-expanded and aria-controls, never a nested <details>; state is restored',()=>{
 const rows=[{group:'Alchemy',recipe:{name:'A',tier:'master'},html:'<i>a</i>'},{group:'Alchemy',recipe:{name:'B',tier:'apprentice'},html:'<i>b</i>'}];
 const state={'p:alchemy':true,'t:alchemy:master':false};
 const h=treeHtml(buildTree(rows),{isOpen:(k,d)=>state[k]??d});
 assert.equal((h.match(/<details/g)??[]).length,1,'no fold inside a fold');
 assert.match(h,/<details class="agl-folder agl-tree-folder" data-folder="alchemy" data-tree="p:alchemy" data-stored-open="1" data-total="2" open>/);
 assert.match(h,/<button type="button" class="agl-tier-toggle" data-action="tier-toggle" data-id="alchemy:apprentice" aria-expanded="true" aria-controls="agl-tier-alchemy-apprentice">/);
 assert.match(h,/data-id="alchemy:master" aria-expanded="false" aria-controls="agl-tier-alchemy-master">/);
 assert.match(h,/id="agl-tier-alchemy-master" hidden>/);assert.ok(h.indexOf('Apprentice')<h.indexOf('Master'));
 assert.match(h,/<span class="ag-badge" data-tier-count>1<\/span>/,'text labels and counts');
 assert.match(treeHtml(buildTree(rows),{}),/<details[^>]* data-stored-open="0" [^>]*>/,'professions start closed; tiers open');
});

test('Recipe Catalog: profession folders with tier groups in ladder order; counts add up; every recipe is in exactly one tier',async()=>{
 app.__tree={};
 const h=await html('catalog');
 const alchemy=folderHtml(h,'alchemy');
 assert.deepEqual(tiersOf(alchemy),['alchemy:apprentice','alchemy:journeyman','alchemy:expert','alchemy:artisan','alchemy:master','alchemy:other'],'ladder order, Other last');
 assert.ok(tiersOf(alchemy).at(-1)==='alchemy:other','no/unknown tier last');
 const counts=[...alchemy.matchAll(/data-tier-count>(\d+)</g)].map(m=>Number(m[1]));
 assert.equal(counts.reduce((a,b)=>a+b,0),30,'30 Alchemy recipes in total');
 assert.match(alchemy,/data-folder-count>30 /);
 assert.equal((alchemy.match(/data-recipe-search/g)??[]).length,30);
});

test('open/closed state: a tier click is remembered per user and restored; Expand all and Collapse all set every folder and tier; focus keeps its header',async()=>{
 app.__tree={};store.clear();
 await app._click('tree-expand');
 let h=await html('catalog');
 assert.ok(!/data-stored-open="0"/.test(h),'everything open');assert.match(h,/<details class="agl-folder agl-tree-folder"[^>]*\sopen>/);
 await app._click('tier-toggle','alchemy:apprentice');
 h=await html('catalog');
 assert.match(h,/data-id="alchemy:apprentice" aria-expanded="false"/);assert.match(h,/id="agl-tier-alchemy-apprentice" hidden>/);
 app._flushTree();
 assert.match(store.get([...store.keys()][0]),/"t:alchemy:apprentice":false/,'saved in the per-user store, not world data');
 // A new window (a fresh state read) restores it.
 app.__tree=undefined;h=await html('catalog');assert.match(h,/data-id="alchemy:apprentice" aria-expanded="false"/);
 await app._click('tree-collapse');h=await html('catalog');
 assert.ok(!/data-stored-open="1"/.test(h),'everything shut');assert.ok(!/aria-expanded="true"/.test(h));
 assert.match(h,/data-action="tier-toggle" data-id="alchemy:apprentice"/,'the header keeps its data-action and data-id, which is what restores focus after a re-render');
 app.__tree={};
});

test('the same renderer serves Party: By profession; By player is unchanged',async()=>{
 app.partySort='profession';
 app.actorId='a1';actor.flags['ashen-gate-profession-ledger'].knownRecipes=['REC-TEST-0','REC-TEST-3'];
 const h=await html('party');
 assert.match(h,/agl-tree-folder/);assert.match(h,/data-action="tree-expand"/);assert.match(h,/data-action="tier-toggle"/);
 app.partySort='player';const byPlayer=await html('party');assert.doesNotMatch(byPlayer,/agl-tree-folder|tree-expand/);
 actor.flags['ashen-gate-profession-ledger'].knownRecipes=[];
});

test('players see the same tree (only the recipes they can see), and no GM controls',async()=>{
 game.user=player;app.__tree={};
 const h=await html('catalog');assert.match(h,/data-action="tree-expand"/);assert.doesNotMatch(h,/data-action="manager"/);
 game.user=gm;
});

test('0.37.1: a tier toggle and Expand/Collapse all change the open state in place: no re-render; the write is coalesced',async()=>{
 app.__tree={};store.clear();
 // A stand-in for the rendered tree: one tier group and one profession folder with the attributes the renderer writes.
 const attrs={};const panel={hidden:false},btn={attrs:{'aria-expanded':'true'},setAttribute(k,v){this.attrs[k]=v;}};
 const group={dataset:{tierGroup:'alchemy:apprentice',storedOpen:'1'},querySelector:s=>s==='.agl-tier-body'?panel:s==='.agl-tier-toggle'?btn:null};
 const folder={dataset:{tree:'p:alchemy',folder:'alchemy',storedOpen:'0'},open:false};
 app.element={querySelector:()=>null,querySelectorAll:s=>s==='[data-tier-group]'?[group]:s==='details[data-tree]'?[folder]:[]};
 let renders=0;const render=app.render;app.render=()=>{renders++;return app;};
 let writes=0;const setItem=globalThis.localStorage.setItem;globalThis.localStorage.setItem=(k,v)=>{writes++;return setItem(k,v);};
 try{
  await app._click('tier-toggle','alchemy:apprentice');
  assert.equal(panel.hidden,true);assert.equal(btn.attrs['aria-expanded'],'false');assert.equal(group.dataset.storedOpen,'0');assert.equal(renders,0,'no re-render');
  await app._click('tier-toggle','alchemy:apprentice');assert.equal(panel.hidden,false);assert.equal(btn.attrs['aria-expanded'],'true');
  await app._click('tree-expand');assert.equal(folder.open,true);assert.equal(folder.dataset.storedOpen,'1');
  await app._click('tree-collapse');assert.equal(folder.open,false);assert.equal(renders,0,'still no re-render');
  assert.equal(writes,0,'nothing written on each click');
  await new Promise(r=>setTimeout(r,260));assert.equal(writes,1,'one coalesced write for the whole burst');
  assert.equal(app._treeState()['p:alchemy'],false);
  // While a search is active the panel opens and closes without touching the remembered state.
  app.query='x';await app._click('tier-toggle','alchemy:apprentice');assert.equal(panel.hidden,false,'it opened');assert.equal(app._treeState()['t:alchemy:apprentice'],false,'unchanged by a toggle during a search');app.query='';
 }finally{app.render=render;globalThis.localStorage.setItem=setItem;app.__tree={};}
});
