// 0.41.0: opening the GM Recipe Catalog no longer freezes the browser: lookups are reused within a render, long lists build their cards lazily,
// and bursts of hooks render once. Mocked Foundry (logic and markup only; the live window is checked by hand in Forge). Synthetic [TEST] data.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import * as L from '../scripts/catalog-list.mjs';
import {buildTree,treeHtml,rowHtmlOf,compareText,folderBodyHtml} from '../scripts/catalog-tree.mjs';
import {lookupWorldDefinition} from '../scripts/definition-lookup.mjs';
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const here=path.dirname(fileURLToPath(import.meta.url));
const onHooks={},hooks={};let api,renders=0;const errors=[];
const values={partyRoster:['a1','a2'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const gm={id:'gm',isGM:true,name:'GM',active:true},player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class FakeApp{constructor(o={}){this.options=o;}async _prepareContext(){return {};}render(){renders++;this.rendered=true;return this;}async close(){return this;}}
globalThis.document={documentElement:{dataset:{}}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:c=>c,DialogV2:{wait:async()=>false,prompt:async()=>{}}}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:(n,f)=>(onHooks[n]??=[]).push(f),callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e)),warn:()=>{}}};
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const src=(id,type,definition=null,{visibility='player',status='approved'}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const worldDoc=(id,name,flags,type='loot')=>({id,uuid:`Item.${id}`,name,img:'',type,flags,system:{description:{value:''},quantity:1},testUserPermission:()=>true,
  toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}});
const world=[];
const PROFS=[['ALCHEMY','Alchemy'],['HERBALISM','Herbalism'],['ARTISTRY','Artistry']];
for(const [p,n] of PROFS)world.push(worldDoc('wp'+p,`${n} — Profession`,src('PROF-'+p,'Profession',def('PROF-'+p,'Profession',{name:n})),'feat'));
world.push(worldDoc('wm1','Material A',src('MAT-TEST-OAK','Material',def('MAT-TEST-OAK','Material',{name:'[TEST] Oakmoss',quality:'common',tier:1}))));
world.push(worldDoc('wi1','[TEST] Tonic item',src('ITEM-TEST-TONIC','Item',def('ITEM-TEST-TONIC','Item',{name:'[TEST] Tonic'})),'consumable'));
const TIER_NAMES=['apprentice','journeyman','expert','artisan','master'];
const N=300;
for(let i=0;i<N;i++){const [p]=PROFS[i%3],id=`REC-TEST-${String(i).padStart(3,'0')}`;
  world.push(worldDoc('w'+id,`Recipe ${i}`,src(id,'Recipe',def(id,'Recipe',{name:`[TEST] Recipe ${String(i).padStart(3,'0')}`,profession_id:'PROF-'+p,tier:TIER_NAMES[i%5],result_item_id:'ITEM-TEST-TONIC',
    ingredients:[{material_id:'MAT-TEST-OAK',quantity:1}]}))));}
const actor=(id,name,known)=>({id,name,type:'character',hasPlayerOwner:true,items:Object.assign([],{get:()=>undefined}),flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},testUserPermission:()=>true,setFlag:async()=>{}});
const alpha=actor('a1','[TEST] Alpha',['REC-TEST-000','REC-TEST-001']),bravo=actor('a2','[TEST] Bravo',['REC-TEST-000']);
let itemReads=0;
const items={get contents(){itemReads++;return world;},get size(){return world.length;},get:id=>world.find(x=>x.id===id)};
const moduleObj={get api(){return api},set api(v){api=v},active:true,version:'0.41.1'};
globalThis.game={user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),get activeGM(){return gm;}},items,
  actors:{contents:[alpha,bravo],size:2,get:id=>[alpha,bravo].find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'catalog'});
const html=async()=>{app.view='catalog';return (await app._prepareContext({})).html;};
const flush=(ms=0)=>new Promise(r=>setTimeout(r,ms));

/** A very small DOM: the folders found in the markup, each with a body that records what is written into it. */
function fakeDom(h){
  const folders=[...h.matchAll(/<details class="agl-folder[^>]*data-tree="([^"]+)"[^>]*?(\sopen)?>/g)].map(m=>{
    const body={innerHTML:'',insertAdjacentHTML(_,x){this.innerHTML+=x;}};
    return {tagName:'DETAILS',dataset:{tree:m[1],folder:m[1].replace(/^p:/,'')},open:Boolean(m[2]),isConnected:true,classList:{contains:()=>false},querySelector:s=>s==='.agl-folder-body'?body:null,body};});
  const root={querySelectorAll:s=>/details\[data-tree\]/.test(s)||/\[data-tree\],\[data-lazy\]/.test(s)?folders:[],querySelector:()=>null,addEventListener(){}};
  return {folders,root};
}
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);

test('definition lookup: with real Collections one render pass reads each collection once, not once per lookup', ()=>{
  let reads=0;const docs=[1,2,3].map(i=>worldDoc(`d${i}`,`Doc ${i}`,src(`MAT-TEST-D${i}`,'Material',def(`MAT-TEST-D${i}`,'Material',{name:`D${i}`}))));
  const col=list=>({get contents(){reads++;return list;},get size(){return list.length;}});
  const mine=list=>({user:gm,items:col(list),journal:col([]),actors:col([]),tables:col([]),macros:col([])});
  const g=mine(docs);
  for(let i=0;i<500;i++)assert.equal(lookupWorldDefinition(g,'MAT-TEST-D2',{entityType:'Material'}).status,'ok');
  assert.ok(reads<=5,`collections were copied ${reads} times for 500 lookups (one index build = 5)`);
  // A different document set (the size changes) is noticed in the same tick.
  const more=[...docs,worldDoc('d4','Doc 4',src('MAT-TEST-D4','Material',def('MAT-TEST-D4','Material',{name:'D4'})))];
  assert.equal(lookupWorldDefinition(mine(docs),'MAT-TEST-D4').status,'not_found');
  assert.equal(lookupWorldDefinition(mine(more),'MAT-TEST-D4').status,'ok');
  // The hit is re-checked: a document archived since the index was built is not returned.
  const g2=mine(docs);assert.equal(lookupWorldDefinition(g2,'MAT-TEST-D1').status,'ok');
  docs[0].flags['ashen-gate-manager'].lifecycle={archived:true};
  assert.equal(lookupWorldDefinition(g2,'MAT-TEST-D1').status,'not_found');
});

test('GM catalog render: the world is read a handful of times, not once per recipe lookup; the result is the same list',async()=>{
  itemReads=0;
  const h=await html();
  assert.match(h,new RegExp(`Showing ${N} of ${N}`));
  assert.ok(itemReads<60,`world Items were copied ${itemReads} times for ${N} recipes`);
});

test('a long list builds no recipe card up front; folders carry their counts and open ones say Loading', async()=>{
  const h=await html();
  assert.doesNotMatch(h,/agl-recipe-row|data-recipe-search/,'no card is built while the window is drawn');
  assert.equal((h.match(/<details class="agl-folder agl-tree-folder"/g)??[]).length,3);
  assert.match(h,/data-folder="alchemy" data-tree="p:alchemy" data-stored-open="0" data-total="100"/,'counts come from the list, not from the cards');
  assert.match(h,/data-folder-count>100 formulas</);
  assert.doesNotMatch(h,/Loading recipes/,'professions start shut: nothing to load');
  app._setTree('p:herbalism',true);
  const open=await html();assert.match(open,/data-folder="herbalism"[^>]*\sopen>[^]*?Loading recipes…/);
  app.__tree={};
});

test('shut folders fill when opened; open folders fill after the window shows; the cards are the same markup',async()=>{
  app._setTree('p:herbalism',true);
  const h=await html();const {folders,root}=fakeDom(h);app.element=root;
  app._pumpLazy();await flush(30);
  const herb=folders.find(f=>f.dataset.tree==='p:herbalism'),alch=folders.find(f=>f.dataset.tree==='p:alchemy');
  assert.match(herb.body.innerHTML,/data-tier-group="herbalism:apprentice"/);
  assert.equal((herb.body.innerHTML.match(/data-recipe-search/g)??[]).length,100,'every herbalism recipe, once');
  assert.match(herb.body.innerHTML,/Known by|Not found by the party yet/,'the same card');
  assert.equal(alch.body.innerHTML,'','a shut folder is not built');
  alch.open=true;app._queueLazy(alch,{front:true});await flush(30);
  assert.equal((alch.body.innerHTML.match(/data-recipe-search/g)??[]).length,100);
  assert.match(alch.body.innerHTML,/Known by \[TEST\] Alpha, \[TEST\] Bravo \(2\)/,'who knows it, with the count');
  assert.equal(app._lazy.has('p:alchemy'),false,'a filled folder is not built twice');
  app.__tree={};app.element=null;
});

test('chunks: a long ungrouped list fills a few cards at a time, one chunk per frame, and never twice',async()=>{
  app._saveCatalogPrefs({group:'none'});
  const h=await html();
  assert.match(h,/class="agl-lazy-list" data-lazy="list">[^]*Loading recipes…/);assert.doesNotMatch(h,/data-recipe-search/);
  const body={innerHTML:'',writes:0,insertAdjacentHTML(_,x){this.innerHTML+=x;this.writes++;}};
  const el={tagName:'DIV',dataset:{lazy:'list'},isConnected:true,classList:{contains:c=>c==='agl-lazy-list'},querySelector:()=>null,get innerHTMLSet(){return 0;}};
  Object.defineProperty(el,'innerHTML',{set(v){body.innerHTML=v;body.writes++;},get(){return body.innerHTML;}});
  el.insertAdjacentHTML=(p,x)=>body.insertAdjacentHTML(p,x);
  app.element={querySelectorAll:()=>[el],querySelector:()=>null,addEventListener(){}};
  app._pumpLazy();await flush(10);
  assert.ok(body.writes>0&&body.writes<N/L.LAZY_CHUNK,'in progress after a few frames');
  await flush(400);
  assert.equal(body.writes,Math.ceil(N/L.LAZY_CHUNK),'one write per chunk');
  assert.equal((body.innerHTML.match(/data-recipe-search/g)??[]).length,N);
  const after=body.writes;app._pumpLazy();await flush(20);assert.equal(body.writes,after,'done means done');
  app._saveCatalogPrefs({group:'profession'});app.element=null;
});

test('a new render drops unfinished lazy work so a stale folder is never written into the new page',async()=>{
  const h=await html();const {folders,root}=fakeDom(h);app.element=root;
  folders[0].open=true;app._queueLazy(folders[0]);
  await html();// re-render before the first frame
  await flush(30);
  assert.equal(folders[0].body.innerHTML,'');
  app.element=null;
});

test('Expand all and Collapse all keep the remembered state of tier groups inside folders that are not filled in yet',async()=>{
  const h=await html();const {folders,root}=fakeDom(h);app.element=root;
  await app._click('tree-expand');
  const st=app._treeState();
  assert.equal(st['p:alchemy'],true);assert.equal(st['t:alchemy:apprentice'],true,'a tier inside an unfilled folder');assert.equal(st['t:herbalism:master'],true);
  await app._click('tree-collapse');
  assert.equal(st['p:alchemy'],false);assert.equal(st['t:alchemy:apprentice'],false);
  app.__tree={};app.element=null;
});

test('search and filters still work on the long list (the model does the work); counts stay right',async()=>{
  app.query='recipe 007';let h=await html();
  assert.match(h,/Showing 1 of 300/);
  app.query='';app._saveCatalogPrefs({filters:{...app._catalogPrefs.filters,profession:'Artistry'}});h=await html();
  assert.match(h,/Showing 100 of 300/);assert.match(h,/data-total="100"/);
  app._saveCatalogPrefs({filters:{}});
});

test('a short list is built at once (nothing flashes in), with the same markup as before',async()=>{
  app._saveCatalogPrefs({filters:{...app._catalogPrefs.filters,tier:'Master'}});app._setTree('p:alchemy',true);
  const h=await html();
  assert.match(h,/Showing 60 of 300/);assert.match(h,/data-recipe-search/);assert.doesNotMatch(h,/Loading recipes/);
  app._saveCatalogPrefs({filters:{}});app.__tree={};
});

test('group folders and the tier group mode are lazy too, with their counts and no cards',async()=>{
  app._saveCatalogPrefs({group:'tier'});
  const h=await html();
  assert.match(h,/data-folder="tier-Apprentice"[^>]*data-total="60"/);assert.doesNotMatch(h,/data-recipe-search/);assert.match(h,/Loading recipes/);
  assert.ok(app._lazy.has('p:tier-Apprentice'));
  app._saveCatalogPrefs({group:'profession'});
});

test('pure: treeHtml and groupFoldersHtml take rows as strings or functions, and a lazy tree asks for no row until a body is built',()=>{
  let built=0;
  const rows=[{group:'Alchemy',recipe:{name:'A',tier:'apprentice'},html:()=>{built++;return '<i>a</i>';}},{group:'Alchemy',recipe:{name:'B',tier:'master'},html:'<i>b</i>'}];
  const registry=new Map();
  const lazy=treeHtml(buildTree(rows),{lazy:(k,b)=>registry.set(k,b)});
  assert.equal(built,0);assert.doesNotMatch(lazy,/<i>/);assert.match(lazy,/data-total="2"/);assert.equal([...registry.keys()].join(),'p:alchemy');
  const out=registry.get('p:alchemy')().map(f=>f()).join('');
  assert.equal(built,1);assert.match(out,/<i>a<\/i>/);assert.match(out,/<i>b<\/i>/);
  const eager=treeHtml(buildTree(rows),{});assert.equal(built,2);assert.match(eager,/<i>a<\/i>/);
  assert.equal(rowHtmlOf({html:'x'}),'x');assert.equal(rowHtmlOf({html:()=>'y'}),'y');
  // The markup of a tree built without lazy is what folderBodyHtml gives, wrapped.
  const t=buildTree(rows);assert.ok(treeHtml(t,{}).includes(folderBodyHtml(t[0],{})));
  const g=[{key:'k',label:'K',rows:[1,2,3,4,5].map(n=>({n}))}];let made=0;const reg2=new Map();
  const grouped=L.groupFoldersHtml(g,'tier',{rowHtml:r=>{made++;return `<b>${r.n}</b>`;},lazy:(k,b)=>reg2.set(k,b)});
  assert.equal(made,0);assert.match(grouped,/Loading recipes…/);assert.equal(reg2.get('p:tier-k')().length,1,'5 rows fit one chunk');
  assert.equal(made,0,'building the chunk list makes no row');
  assert.equal(reg2.get('p:tier-k')()[0](),'<b>1</b><b>2</b><b>3</b><b>4</b><b>5</b>');
  const many=[{key:'k',label:'K',rows:Array.from({length:L.LAZY_CHUNK*2+1},(_,n)=>({n}))}],reg3=new Map();
  L.groupFoldersHtml(many,'none',{rowHtml:r=>String(r.n),lazy:(k,b)=>reg3.set(k,b)});
  assert.equal(reg3.get('list')().length,3,'chunks of LAZY_CHUNK');
});

test('sorting uses one shared collator and gives the same order as localeCompare',()=>{
  const names=['Éclair','apple','Banana','zebra','Zebra','[TEST] Brew','[TEST] Blade','ångström','10','9'];
  assert.deepEqual([...names].sort(compareText),[...names].sort((a,b)=>a.localeCompare(b)));
});

test('a burst of Actor and Item hooks renders the window once, shortly after the last one',async()=>{
  renders=0;await flush(10);
  const hs=['updateActor','createItem','updateItem','deleteItem'].flatMap(n=>onHooks[n]??[]);
  assert.ok(hs.length>=4,'the hooks are registered');
  renders=0;
  for(let i=0;i<10;i++)for(const f of hs)f({documentName:'Actor',parent:null},{});
  assert.equal(renders,0,'nothing renders inside the burst');
  await flush(250);
  assert.equal(renders,1,'one render for the whole burst');
  _test.refreshSoon();_test.refreshSoon();await flush(250);assert.equal(renders,2);
});

test('render pass memo: facts are kept inside a pass and never outside it',()=>{
  let n=0;
  assert.equal(_test.passMemo('t','k',()=>++n),1);assert.equal(_test.passMemo('t','k',()=>++n),2,'outside a pass nothing is kept');
  _test.inRenderPass(()=>{assert.equal(_test.passMemo('t','k',()=>++n),3);assert.equal(_test.passMemo('t','k',()=>++n),3);assert.equal(_test.passMemo('t','j',()=>++n),4);});
  assert.equal(_test.passMemo('t','k',()=>++n),5,'the next pass starts empty');
  assert.throws(()=>_test.inRenderPass(()=>{throw Error('x');}),/x/);assert.equal(_test.passMemo('t','k',()=>++n),6,'a failed pass is closed');
});

test('GM only: a player gets neither the list nor lazy folders, and the catalog API still refuses',async()=>{
  game.user=player;
  assert.throws(()=>api.catalogList({}),/Only the GM/);
  const h=await html();assert.doesNotMatch(h,/Showing \d+ of|data-lazy|Loading recipes|catalog-filters/);
  game.user=gm;
});
