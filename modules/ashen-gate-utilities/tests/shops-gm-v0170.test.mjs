// 0.17.0: the GM's Shops tab. Storage in a GM-only Journal found by flag, GM-only API, drops (folder, container, non-Item),
// duplicate, delete with retired ids, the shop purse, electrum, and the list and editor markup.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,listShops,shopPlace,initials,lineFromItem,lineRepeats,duplicateShop,restockLines,planShopPurseAdjust,normalizeShop,NOT_WHOLE_CP} from '../scripts/core.mjs';

// ---- Pure rules ----
const locs=new Map([['LOC-TEST-TOWN',{name:'[TEST] Testford',parentLocationId:''}],['LOC-TEST-MARKET',{name:'[TEST] Market Ward',parentLocationId:'LOC-TEST-TOWN'}],['LOC-TEST-DOCK',{name:'[TEST] Dock',parentLocationId:'LOC-TEST-TOWN'}]]);
const rec=(id,name,extra={})=>({id,name,merchant:{name:`${name} Keeper`,img:''},lines:[],updatedAt:0,...extra});
test('place and city: the linked location and the top of its Locations tree; no link reads "No location"',()=>{
 assert.deepEqual(shopPlace(rec('SHOP-A','A',{locationId:'LOC-TEST-MARKET'}),locs),{place:'[TEST] Market Ward',city:'[TEST] Testford'});
 assert.deepEqual(shopPlace(rec('SHOP-A','A',{locationId:'LOC-TEST-TOWN'}),locs),{place:'[TEST] Testford',city:'[TEST] Testford'});
 assert.deepEqual(shopPlace(rec('SHOP-A','A'),locs),{place:'',city:'No location'});
 assert.deepEqual(shopPlace(rec('SHOP-A','A',{locationId:'LOC-TEST-GONE'}),locs),{place:'LOC-TEST-GONE',city:'LOC-TEST-GONE'});
 const loop=new Map([['LOC-X',{name:'X',parentLocationId:'LOC-Y'}],['LOC-Y',{name:'Y',parentLocationId:'LOC-X'}]]);
 assert.ok(['X','Y'].includes(shopPlace(rec('SHOP-A','A',{locationId:'LOC-X'}),loop).city),'a loop in the tree stops');
});
test('list: search by name, merchant, place, item and id; group by city (default) with No location last; other sorts',()=>{
 const shops=[rec('SHOP-ZED','Zed',{locationId:'LOC-TEST-DOCK',updatedAt:5}),rec('SHOP-ANVIL','Anvil',{locationId:'LOC-TEST-MARKET',updatedAt:9}),
  rec('SHOP-PEDDLER','Peddler',{updatedAt:1,lines:[{lineId:'l1',item:{name:'Candle'}}]})];
 const g=listShops(shops,{locations:locs});
 assert.deepEqual(g.map(x=>[x.group,x.shops.map(s=>s.id)]),[['[TEST] Testford',['SHOP-ZED','SHOP-ANVIL']],['No location',['SHOP-PEDDLER']]],'Dock sorts before Market Ward');
 assert.deepEqual(listShops(shops,{sort:'name'}).map(x=>[x.group,x.shops.map(s=>s.name)]),[[null,['Anvil','Peddler','Zed']]]);
 assert.deepEqual(listShops(shops,{sort:'updated'})[0].shops.map(s=>s.id),['SHOP-ANVIL','SHOP-ZED','SHOP-PEDDLER']);
 assert.deepEqual(listShops(shops,{sort:'merchant'})[0].shops.map(s=>s.id),['SHOP-ANVIL','SHOP-PEDDLER','SHOP-ZED']);
 for(const [q,ids] of [['candle',['SHOP-PEDDLER']],['market',['SHOP-ANVIL']],['zed keeper',['SHOP-ZED']],['shop-anvil',['SHOP-ANVIL']],['testford',['SHOP-ZED','SHOP-ANVIL']],['nothing here',[]]])
  assert.deepEqual(listShops(shops,{search:q,locations:locs}).flatMap(x=>x.shops.map(s=>s.id)),ids,q);
 assert.deepEqual(listShops([],{}),[]);
});
test('initials for missing art',()=>{assert.equal(initials('[TEST] Brin Tallow'),'BT');assert.equal(initials('Ada'),'A');assert.equal(initials(''),'?');});
let n=0;const rid=()=>`r${++n}`;
test('a line from an item: its own price in whole copper, unlimited stock, a copy of the data; ep shows as sp while off',()=>{
 const data={_id:'i1',name:'Rope',type:'loot',folder:'f1',ownership:{default:0},system:{price:{value:1,denomination:'gp'},quantity:1},flags:{'ashen-gate-manager':{source:{sourceId:'ITEM-TEST-ROPE'}}}};
 const l=lineFromItem(data,[],{randomId:rid,uuid:'Item.i1'});
 assert.deepEqual([l.priceCp,l.priceCoin,l.stock,l.hidden,l.itemId,l.itemUuid,l.costCp],[100,'gp',null,false,'ITEM-TEST-ROPE','Item.i1',null]);
 assert.equal(l.item.folder,undefined);assert.equal(l.item.ownership,undefined);assert.equal(data.folder,'f1','the source data is not changed');
 const ep=lineFromItem({name:'Gem',type:'loot',system:{price:{value:3,denomination:'ep'}}},[],{randomId:rid});
 assert.deepEqual([ep.priceCp,ep.priceCoin],[150,'sp']);
 assert.equal(lineFromItem({name:'Gem',system:{price:{value:3,denomination:'ep'}}},[],{randomId:rid,electrum:true}).priceCoin,'ep');
 const bag=lineFromItem({name:'Backpack',system:{price:{value:2,denomination:'gp'}}},[{name:'Bedroll',system:{container:'b'}}],{randomId:rid});
 assert.equal(bag.contents.length,1);assert.equal(bag.contents[0].name,'Bedroll');
 assert.equal(lineFromItem({name:'Free'},[],{randomId:rid}).priceCp,0);
});
test('repeat: same permanent id, same source uuid, or (no id) same name and type',()=>{
 const a=lineFromItem({name:'Rope',type:'loot',flags:{'ashen-gate-manager':{source:{sourceId:'ITEM-R'}}}},[],{randomId:rid,uuid:'Item.1'});
 assert.equal(lineRepeats([a],lineFromItem({name:'Other',type:'loot',flags:{'ashen-gate-manager':{source:{sourceId:'ITEM-R'}}}},[],{randomId:rid})),true);
 assert.equal(lineRepeats([a],lineFromItem({name:'X'},[],{randomId:rid,uuid:'Item.1'})),true);
 const b=lineFromItem({name:'Torch',type:'loot'},[],{randomId:rid});
 assert.equal(lineRepeats([b],lineFromItem({name:'Torch',type:'loot'},[],{randomId:rid})),true);
 assert.equal(lineRepeats([b],lineFromItem({name:'Torch',type:'tool'},[],{randomId:rid})),false);
});
test('duplicate keeps the lines and purse, drops presented, gets a new id that skips retired ones',()=>{
 const s=normalizeShop({id:'SHOP-KETTLE',name:'Kettle',purse:{cp:1,sp:0,gp:2,pp:0},lines:[{lineId:'ln_a',priceCp:5,stock:2}],presented:{mode:'all',userIds:[]},rev:4});
 const d=duplicateShop(s,{taken:['SHOP-KETTLE'],retired:['SHOP-KETTLE-COPY'],now:7,userId:'gm'});
 assert.equal(d.id,'SHOP-KETTLE-COPY-2');assert.equal(d.name,'Kettle (copy)');assert.equal(d.presented,null);assert.equal(d.rev,0);
 assert.deepEqual(d.lines,s.lines);assert.deepEqual(d.purse,s.purse);assert.notEqual(d.lines,s.lines,'a copy, not the same array');
});
test('restock: stock back to stockStart, only the named lines; unlimited stays unlimited',()=>{
 const lines=[{lineId:'a',stock:0,stockStart:3},{lineId:'b',stock:1,stockStart:2},{lineId:'c',stock:null,stockStart:null}];
 assert.deepEqual(restockLines(lines).map(l=>l.stock),[3,2,null]);
 assert.deepEqual(restockLines(lines,['b']).map(l=>l.stock),[0,2,null]);
});
test('shop purse adjust: never below 0, no ep while electrum is off, no purse refused',()=>{
 const purse={cp:0,sp:5,gp:2,pp:0};
 assert.deepEqual(planShopPurseAdjust({purse,op:'add',coin:'gp',amount:3}).after,{cp:0,sp:5,gp:5,pp:0});
 assert.deepEqual(planShopPurseAdjust({purse,op:'set',coin:'sp',amount:0}).after.sp,0);
 assert.throws(()=>planShopPurseAdjust({purse,op:'remove',coin:'gp',amount:3}),/has 2 gp, fewer than 3 gp/);
 assert.throws(()=>planShopPurseAdjust({purse,op:'add',coin:'ep',amount:1}),/Electrum is turned off/);
 assert.throws(()=>planShopPurseAdjust({purse:null,op:'add',coin:'gp',amount:1}),/no coin purse/);
 assert.throws(()=>planShopPurseAdjust({purse,op:'add',coin:'gp',amount:-1}),/whole number/);
 assert.deepEqual(purse,{cp:0,sp:5,gp:2,pp:0},'the input is not changed');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const hooks=new Map();
globalThis.HTMLElement=class {};
globalThis.foundry={utils:{randomID:()=>`id${++n}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[];actors.get=id=>actors.find(a=>a.id===id);
const journals=[];let jn=0;const writes=[];
function mkPage(data,j){const page={...structuredClone(data),id:`p${++jn}`,parent:j,
 update:async(d,o)=>{writes.push({page:page.id,o});assert.equal(o?.recursive,false,'pages are written whole');Object.assign(page,structuredClone(d));},
 delete:async()=>{j.pages.splice(j.pages.indexOf(page),1);}};return page;}
globalThis.JournalEntry={create:async d=>{const j={...structuredClone(d),id:`j${++jn}`,pages:[],createEmbeddedDocuments:async(type,list)=>{assert.equal(type,'JournalEntryPage');for(const p of list)j.pages.push(mkPage(p,j));}};journals.push(j);return j;}};
// World items, a container with two items inside, an actor's item, folders.
const docs=new Map();const sourceUpdates=[];
function mkItem(id,name,{type='loot',price={value:1,denomination:'gp'},container=null,parent=null,flags={},qty=1,folder=null}={}){
 const it={id,name,type,folder,documentName:'Item',uuid:parent?`Actor.${parent.id}.Item.${id}`:`Item.${id}`,parent,flags,system:{price,container,quantity:qty},
  toObject(){return structuredClone({_id:id,name,type,img:`icons/${id}.webp`,folder:'f',flags,system:this.system});},update:async()=>sourceUpdates.push(id),delete:async()=>sourceUpdates.push(id)};
 docs.set(it.uuid,it);return it;}
const worldItems=[mkItem('rope','Rope, Hempen (50 ft)',{folder:'fold',flags:{'ashen-gate-manager':{source:{sourceId:'ITEM-TEST-ROPE'}}}}),mkItem('pack','Backpack',{type:'container',price:{value:2,denomination:'gp'}}),
 mkItem('bedroll','Bedroll',{container:'pack'}),mkItem('skin','Waterskin',{container:'pack',price:{value:2,denomination:'sp'}}),mkItem('torch','Torch',{folder:'fold',price:{value:1,denomination:'cp'}}),
 mkItem('gem','Gem',{price:{value:3,denomination:'ep'}})];
worldItems.contents=worldItems;// a Foundry collection's .contents
const hero={id:'hero',name:'[TEST] Wren',documentName:'Actor',uuid:'Actor.hero',items:[]};docs.set('Actor.hero',hero);
hero.items.push(mkItem('sword','Longsword',{type:'weapon',parent:hero,price:{value:15,denomination:'gp'}}));
const itemFolder={id:'fold',name:'[TEST] Kettle stock',documentName:'Folder',type:'Item',uuid:'Folder.fold',contents:[worldItems[0],worldItems[4]],getSubfolders:()=>[]};docs.set(itemFolder.uuid,itemFolder);
const actorFolder={id:'afold',name:'[TEST] NPCs',documentName:'Folder',type:'Actor',uuid:'Folder.afold',contents:[]};docs.set(actorFolder.uuid,actorFolder);
globalThis.fromUuid=async u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}};
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
let locationsActive=true;
const modules=new Map([[ID,{id:ID,active:true,version:'0.19.0'}]]);
modules.set('ashen-gate-locations',{get active(){return locationsActive;},api:{listLocations:()=>[{id:'LOC-TEST-TOWN',name:'[TEST] Testford',parentLocationId:''},{id:'LOC-TEST-MARKET',name:'[TEST] Market Ward',parentLocationId:'LOC-TEST-TOWN'}]}});
globalThis.game={user:gm,users,actors,journal:journals,items:worldItems,time:{worldTime:0},modules,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',weapon:'Weapon'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!hooks.has(k))hooks.set(k,[]);hooks.get(k).push(fn);},off:()=>{},callAll:(k,...a)=>(hooks.get(k)??[]).forEach(f=>f(...a))};
await import('../scripts/main.mjs');
const shopsMod=await import('../scripts/shops.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.shops;
const asPlayer=async fn=>{game.user=alice;try{return await fn();}finally{game.user=gm;}};
const page=id=>journals[0]?.pages.find(p=>p.flags?.[ID]?.shop?.id===id);

test('every Shops API call is GM only, enforced in the API (players get "GM only.")',async()=>{
 await game.settings.set(ID,'playerAccessEnabled',true);
 assert.equal(api.contract,'ag-utilities-shops/1');
 const calls=[()=>api.list(),()=>api.get('SHOP-X'),()=>api.create({name:'X'}),()=>api.save({id:'SHOP-X',name:'X'}),()=>api.duplicate('SHOP-X'),()=>api.delete('SHOP-X',{confirm:true}),
  ()=>api.addItems('SHOP-X',['Item.rope']),()=>api.restock('SHOP-X'),()=>api.adjustPurse('SHOP-X',{op:'add',coin:'gp',amount:1}),()=>api.setPurse('SHOP-X',{gp:1}),()=>api.restockCash('SHOP-X'),()=>api.log('SHOP-X')];
 for(const c of calls)await asPlayer(()=>assert.rejects(async()=>c(),/^Error: GM only\.$/));
 assert.equal(journals.length,0,'a refused call creates nothing');
});
test('storage: the GM Data journal is made on the first save, with no player permission, and found by its flag (not its name)',async()=>{
 const decoy=await JournalEntry.create({name:'Utilities Shops (GM Data)',flags:{}});
 const kettle=await api.create({name:'[TEST] The Copper Kettle',merchant:{name:'[TEST] Brin Tallow'},locationId:'LOC-TEST-MARKET'});
 assert.equal(kettle.id,'SHOP-TEST-THE-COPPER-KETTLE');
 const store=journals.filter(j=>j.flags?.[ID]?.store==='shops-gm');
 assert.equal(store.length,1);assert.equal(store[0].ownership.default,0);assert.equal(store[0].name,'Utilities Shops (GM Data)');
 assert.equal(decoy.pages.length,0,'a journal with the same name but no flag is never used');
 journals.splice(journals.indexOf(decoy),1);
 store[0].name='Renamed by the GM';
 await api.create({name:'[TEST] Iron Anvil'});
 assert.equal(journals.filter(j=>j.flags?.[ID]?.store==='shops-gm').length,1,'re-runnable: found again by flag after a rename');
 assert.equal(store[0].pages.length,2);
 const p=page(kettle.id);assert.equal(p.name,'[TEST] The Copper Kettle');assert.deepEqual(p.flags[ID].log,[]);
 assert.deepEqual(api.get(kettle.id),kettle);assert.equal(api.get('SHOP-NOPE'),null);
 await assert.rejects(()=>api.create({id:kettle.id,name:'Again'}),/already used/);
 await assert.rejects(()=>api.create({name:''}),/needs a name/);
});
test('drops: a folder adds each item, a container brings its contents, non-Items are skipped, the source never changes',async()=>{
 const id='SHOP-TEST-THE-COPPER-KETTLE';
 const r=await api.addItems(id,[{type:'Folder',uuid:'Folder.fold'},{type:'Item',uuid:'Item.pack'},{type:'Item',uuid:'Actor.hero.Item.sword'},{type:'Actor',uuid:'Actor.hero'},{type:'Folder',uuid:'Folder.afold'},'Item.missing']);
 assert.deepEqual(r.added.map(a=>a.name),['Rope, Hempen (50 ft)','Torch','Backpack','Longsword']);
 assert.deepEqual(r.skipped.map(s=>[s.name,s.reason]),[['[TEST] Wren','Drop an item.'],['[TEST] NPCs','Drop an item.'],['Item.missing',"That item no longer exists or you can't see it."]],'the shared ag-item-drop reasons');
 const s=api.get(id),bag=s.lines.find(l=>l.item.name==='Backpack');
 assert.deepEqual(bag.contents.map(c=>c.name),['Bedroll','Waterskin']);assert.equal(s.lines.length,4,'contents ride with the container, not as lines');
 assert.deepEqual(s.lines.map(l=>[l.priceCp,l.stock]),[[100,null],[1,null],[200,null],[1500,null]]);
 assert.equal(s.lines[0].itemId,'ITEM-TEST-ROPE');assert.equal(s.lines[3].itemUuid,'Actor.hero.Item.sword');
 assert.deepEqual(sourceUpdates,[],'nothing at the source is updated or deleted');assert.equal(hero.items.length,1);
 const again=await api.addItems(id,['Item.rope','Item.bedroll']);
 assert.deepEqual(again.added.map(a=>[a.name,a.repeat]),[['Rope, Hempen (50 ft)',true],['Bedroll',false]],'a repeat is added again and flagged');
 const both=await api.addItems(id,['Item.pack','Item.skin']);
 assert.deepEqual(both.added.map(a=>a.name),['Backpack'],'an item inside a dropped container comes with it');
 assert.equal(api.get(id).rev,3);
});
test('0.20.1: a compendium container dropped on a shop brings its contents (read from its own pack)',async()=>{
 const id='SHOP-TEST-THE-COPPER-KETTLE',entries=new Map(),pack={collection:'world.test-gear',index:[],getIndex:async()=>pack.index,getDocument:async k=>entries.get(k)??null};
 const add=(pid,name,type,container=null)=>{const d={id:pid,name,type,pack:pack.collection,parent:null,documentName:'Item',uuid:`Compendium.world.test-gear.Item.${pid}`,system:{container,quantity:1,price:{value:1,denomination:'sp'}},
  toObject(){return structuredClone({_id:pid,name,type,system:this.system});}};entries.set(pid,d);docs.set(d.uuid,d);pack.index.push({_id:pid,system:{container}});return d;};
 const bag=add('cbag','[TEST] Satchel','container');add('cink','[TEST] Ink','loot','cbag');add('cquill','[TEST] Quill','loot','cbag');
 game.packs=new Map([[pack.collection,pack]]);
 const saved=structuredClone(page(id).flags[ID].shop),before=api.get(id).lines.length,r=await api.addItems(id,[bag.uuid]);
 assert.deepEqual(r.added.map(a=>[a.name,a.contents]),[['[TEST] Satchel',2]]);
 const line=api.get(id).lines.at(-1);assert.equal(api.get(id).lines.length,before+1);assert.deepEqual(line.contents.map(c=>c.name),['[TEST] Ink','[TEST] Quill']);
 delete game.packs;page(id).flags[ID].shop=saved;// later tests count this shop's lines
});
test('duplicate keeps lines and drops presented; delete needs confirm, is refused while presented, retires the id',async()=>{
 const id='SHOP-TEST-THE-COPPER-KETTLE',p=page(id);
 p.flags[ID].shop={...p.flags[ID].shop,presented:{mode:'all',userIds:[],since:1,by:'gm'}};
 const copy=await api.duplicate(id);
 assert.equal(copy.id,'SHOP-TEST-THE-COPPER-KETTLE-COPY');assert.equal(copy.presented,null);
 assert.deepEqual(copy.lines,api.get(id).lines);
 await assert.rejects(()=>api.delete(id),/needs \{confirm: true\}/);
 await assert.rejects(()=>api.delete(id,{confirm:true}),/Stop showing this shop/);
 assert.ok(api.get(id),'still there');
 const kept=await api.save({...api.get(id),name:'[TEST] The Copper Kettle'});
 assert.deepEqual(kept.presented?.mode,'all','save never changes who a shop is shown to');
 assert.deepEqual(await api.delete(copy.id,{confirm:true}),{id:copy.id,name:copy.name});
 assert.equal(api.get(copy.id),null);
 const meta=journals[0].pages.find(x=>x.flags?.[ID]?.meta).flags[ID].meta;assert.deepEqual(meta.retiredIds,[copy.id]);
 const again=await api.duplicate(id);assert.equal(again.id,'SHOP-TEST-THE-COPPER-KETTLE-COPY-2','a deleted id is never reused');
 p.flags[ID].shop={...p.flags[ID].shop,presented:null};
 await api.delete(again.id,{confirm:true});
});
test('shop purse: none by default; set, adjust (never below 0), restock cash; each change logged',async()=>{
 const id='SHOP-TEST-IRON-ANVIL';
 assert.equal(api.get(id).purse,null);
 await assert.rejects(()=>api.adjustPurse(id,{op:'add',coin:'gp',amount:1}),/no coin purse/);
 await api.setPurse(id,{cp:0,sp:10,gp:5,pp:0});
 assert.deepEqual(api.get(id).purseStart,{cp:0,sp:10,gp:5,pp:0});
 await assert.rejects(()=>api.adjustPurse(id,{op:'remove',coin:'gp',amount:6}),/has 5 gp, fewer than 6 gp/);
 assert.equal(api.get(id).purse.gp,5,'a refused change changes nothing');
 const r=await api.adjustPurse(id,{op:'remove',coin:'gp',amount:5,reason:'  paid rent '});
 assert.deepEqual(r.shop.purse,{cp:0,sp:10,gp:0,pp:0});assert.deepEqual([r.entry.kind,r.entry.reason,r.entry.userName],['shop-purse-adjust','paid rent','GM']);
 await api.adjustPurse(id,{op:'set',coin:'cp',amount:7,asStart:true});
 assert.deepEqual(api.get(id).purseStart,{cp:7,sp:10,gp:0,pp:0});
 await api.adjustPurse(id,{op:'add',coin:'pp',amount:1});
 assert.deepEqual((await api.restockCash(id)).purse,{cp:7,sp:10,gp:0,pp:0});
 assert.deepEqual(api.log(id).map(e=>e.kind),['shop-purse-set','shop-purse-adjust','shop-purse-adjust','shop-purse-adjust','shop-purse-restock']);
 await assert.rejects(()=>api.adjustPurse(id,{op:'add',coin:'ep',amount:1}),/Electrum is turned off/);
 await api.setPurse(id,null);assert.equal(api.get(id).purse,null);assert.equal(api.get(id).purseStart,null);
});
test('restock puts stock back to where it started',async()=>{
 const id='SHOP-TEST-THE-COPPER-KETTLE',s=api.get(id);
 s.lines[0].stock=3;s.lines[0].stockStart=3;await api.save(s);
 const sold=api.get(id);sold.lines[0].stock=0;await api.save({...sold});
 assert.equal(api.get(id).lines[0].stock,0);
 assert.equal((await api.restock(id)).lines[0].stock,3);
});

// ---- Markup ----
const render=async(user=gm,setup=()=>{})=>{game.user=user;try{const app=await game.modules.get(ID).api.open();app.tab='shops';setup(app);return {app,html:await app._renderHTML()};}finally{game.user=gm;}};
test('Shops tab: GM only, between Party Inventory and Roll Tables; players see nothing',async()=>{
 const {html}=await render();
 assert.match(html,/data-tab="inventory"[\s\S]*data-tab="shops" aria-controls="agu-main-panel" aria-selected="true" tabindex="0" class="active ag-tab--gm"><i class="fa-solid fa-store" aria-hidden="true"><\/i>Shops[\s\S]*data-tab="tables"/);
 const player=(await render(alice)).html;
 assert.doesNotMatch(player,/data-tab="shops"|agu-shops|Shop editor/);
});
test('list: toolbar (search, sort, count, New shop), city groups with counts, rows with initials, badges and row actions',async()=>{
 const {html}=await render();
 // 0.26.0: kit sub-tabs Shops & services / Merchant lists (no Shop editor sub-tab).
 assert.match(html,/<div class="ag-tabs ag-tabs--sub" role="tablist" aria-label="Shops sections"><button type="button" role="tab" id="agu-shops-tab-list" data-tab="list" aria-controls="agu-shops-panel-list" aria-selected="true" tabindex="0">Shops &amp; services<\/button><button type="button" role="tab" id="agu-shops-tab-lists" data-tab="lists"[^>]*>Merchant lists<\/button><\/div><div class="agu-subpanel" id="agu-shops-panel-list" role="tabpanel"/);
 assert.doesNotMatch(html,/Shop editor|ag-segmented/);
 assert.match(html,/<label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"><\/i><input type="search" id="agu-shop-search"/);
 assert.match(html,/<label class="ag-field ag-field--inline agu-shop-sort">Sort<select id="agu-shop-sort"><option value="location" selected>Group by settlement<\/option><option value="name">Name<\/option><option value="merchant">Merchant<\/option><option value="updated">Recently changed<\/option>/);
 assert.match(html,/<span class="ag-toolbar__count">2 shops<\/span><div class="ag-toolbar__end"><span class="ag-btn-group"><span class="ag-file" data-shop-import=""><button type="button" class="ag-btn ag-btn--sm" data-ag-file-button><i class="fa-solid fa-file-import" aria-hidden="true"><\/i> Import JSON…<\/button><input type="file" class="ag-file__input ag-sr-only"[^>]*accept=".json,application\/json"><\/span><button type="button" class="ag-btn ag-btn--sm" data-action="shop-export"[\s\S]*?<\/span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="shop-new-service"[\s\S]*?New Bank \(deprecated\)<\/button><button type="button" class="ag-btn" data-action="shop-new"/,'0.26.0: Import JSON (a kit file button) and Export grouped, then New Bank (deprecated), then New shop');
 assert.match(html,/<h3 class="ag-eyebrow">\[TEST\] Testford · 1<\/h3>[\s\S]*<h3 class="ag-eyebrow">No location · 1<\/h3>/);
 assert.match(html,/<span class="ag-row__icon agu-shop-avatar" aria-hidden="true">BT<\/span>/);
 assert.match(html,/\[TEST\] Brin Tallow · \[TEST\] Market Ward · 7 items<\/span>/);assert.doesNotMatch(html,/<code>SHOP-/);
 assert.match(html,/Unlimited cash/);
 assert.match(html,/data-action="shop-edit" data-shop="SHOP-TEST-THE-COPPER-KETTLE" aria-label="Edit \[TEST\] The Copper Kettle"/);
 assert.doesNotMatch(html,/data-action="shop-duplicate"/,'0.26.0: Duplicate is in the editor head, not the row');
 const none=(await render(gm,app=>{app.shopSearch='zzz';})).html;
 assert.match(none,/<p class="ag-empty__title">Nothing matches<\/p>[\s\S]*data-action="shop-clear-search"/);assert.match(none,/0 of 2/);
 locationsActive=false;
 try{assert.match((await render(gm,app=>{app.shopSearch='';})).html,/<h3 class="ag-eyebrow">LOC-TEST-MARKET · 1<\/h3>/,'Locations off: the shop still opens, grouped by its id');}finally{locationsActive=true;}
});
test('editor: kit fields, items table, coin purse, buys, footer Cancel / Save Changes and a Danger zone; ep only while electrum is on',async()=>{
 const id='SHOP-TEST-THE-COPPER-KETTLE';
 const open=async(electrum,tab='details')=>{await game.settings.set(ID,'electrumEnabled',electrum);return render(gm,app=>{app.shopDraft=shopsMod.draftFrom(api.get(id));app.shopSub='editor';app.shopEdTab=tab;});};
 const {html}=await open(false);
 // 0.26.0: the editor replaces the list (no sub-tab row), with a back button and its own tabs Details / Items / Coins & buying.
 assert.match(html,/<div class="agu-shop-editor"><div class="agu-shop-editor__head"><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="shop-back"[^>]*>[\s\S]*?All shops<\/button><h2>/);
 assert.match(html,/aria-label="Shop editor sections"><button type="button" role="tab" id="agu-shop-ed-tab-details" data-tab="details"[^>]*aria-selected="true"[^>]*>Details<\/button><button[^>]*data-tab="items"[^>]*>Items <span class="ag-tab__count">7<\/span><\/button><button[^>]*data-tab="coins"[^>]*>Coins &amp; buying<\/button>/);
 assert.doesNotMatch(html,/aria-label="Shops sections"/);
 assert.match(html,/Applies now[\s\S]*data-action="shop-duplicate"[\s\S]*data-action="shop-present"/,'0.26.0: Duplicate and Present… in the head, under Applies now');
 assert.match(html,/<div class="ag-form-grid">[\s\S]*Shop name<input type="text" maxlength="120" data-shop-field="name" value="\[TEST\] The Copper Kettle" required>/);
 // 0.24.0: Settlement lists only settlements; a linked place that is not one stays, marked.
 assert.match(html,/Settlement<select data-shop-field="locationId"><option value="">None<\/option>[\s\S]*?<option value="LOC-TEST-MARKET" selected>\[TEST\] Market Ward \(not a settlement\)<\/option>/);
 assert.match(html,/GM notes <span class="ag-gm-flag"><i class="fa-solid fa-eye-slash" aria-hidden="true"><\/i> GM only<\/span>/);
 assert.match(html,/Danger zone[\s\S]*class="ag-btn ag-btn--danger" data-action="shop-delete"/);
 assert.doesNotMatch(html,/agu-shop-lines|data-shop-field="hasPurse"/,'Items and Coins & buying are their own tabs');
 const items=(await open(false,'items')).html;
 // 0.26.0: five columns; flavour and cost on a second line under each item.
 assert.match(items,/<table class="ag-table agu-shop-lines"><thead><tr><th scope="col">Item<\/th><th scope="col">Price each<\/th><th scope="col">Stock<\/th><th scope="col">Hidden<\/th><th scope="col"><span class="ag-sr-only">Remove<\/span><\/th><\/tr><\/thead>/);
 assert.match(items,/<tr class="agu-line-extra" data-line="[^"]+"><td colspan="5"><div class="agu-line-extra__grid"><label class="ag-field ag-field--inline">Flavour<input[^>]*data-line-field="flavour"[\s\S]*?Cost <span class="ag-gm-flag">[\s\S]*?data-line-field="_cost"/);
 assert.doesNotMatch(items,/<code>ITEM-TEST-ROPE<\/code>/);assert.match(items,/With 2 items inside/);assert.match(items,/Already in this shop/);
 assert.match(items,/class="ag-btn ag-btn--icon ag-btn--sm ag-btn--danger" data-action="shop-line-remove"/);
 assert.match(items,/data-shop-drop>/);assert.match(items,/Applies now[\s\S]*data-action="shop-restock"/);
 const coins=(await open(false,'coins')).html;
 assert.match(coins,/<input type="checkbox" role="switch" data-shop-field="hasPurse"> This shop has its own coin purse/);
 assert.match(coins,/This shop buys items from players[\s\S]*value="50"[\s\S]*data-shop-buy-type="weapon" aria-pressed="false">Weapon/);
 assert.match(html,/<footer class="ag-footer agu-footer"><button type="button" class="ag-btn ag-btn--ghost" data-action="shop-cancel"[^>]*>Cancel<\/button><span class="ag-footer__status" role="status" data-shop-status><\/span><button type="button" class="ag-btn ag-btn--primary" data-action="shop-save"[^>]*>Save Changes<\/button><\/footer>/);
 assert.doesNotMatch(items,/<option value="ep"/,'no electrum while it is off');
 assert.match((await open(true,'items')).html,/<option value="ep"/);
 await game.settings.set(ID,'electrumEnabled',false);
 // 0.26.0: no editor open is the list itself (the old Shop editor sub-tab maps to it), with no footer.
 const empty=(await render(gm,app=>{app.shopDraft=null;app.shopSub='editor';})).html;
 assert.match(empty,/aria-label="Shops sections"[\s\S]*data-action="shop-new"/);assert.doesNotMatch(empty,/data-action="shop-save"/);
});
test('editor saves typed prices as copper and names the item when a price is not whole copper',()=>{
 const d=shopsMod.draftFrom(api.get('SHOP-TEST-THE-COPPER-KETTLE'));
 d.lines[0]._price='1.5';d.lines[0]._coin='gp';d.lines[0]._stock='4';d.lines[0]._stockEdited=true;d.lines[0]._cost='5';d.lines[0]._coin='sp';
 const r=shopsMod.recordFrom(d);assert.deepEqual([r.lines[0].priceCp,r.lines[0].priceCoin,r.lines[0].costCp,r.lines[0].stock,r.lines[0].stockStart],[15,'sp',50,4,4]);
 d.lines[1]._price='0.05';d.lines[1]._coin='cp';
 assert.throws(()=>shopsMod.recordFrom(d),new RegExp(`Torch: ${NOT_WHOLE_CP.replace(/[.']/g,'.')}`));
 d.lines[1]._price='1';d.lines[1]._stock='-1';d.lines[1]._stockEdited=true;
 assert.throws(()=>shopsMod.recordFrom(d),/Torch: stock must be a whole number/);
 assert.ok(!Object.keys(r.lines[0]).some(k=>k.startsWith('_')),'no editor fields are saved');
});
test('editor actions: new shop, drop into the draft, Save Changes creates it; Cancel with changes asks first',async()=>{
 const steps=[];foundry.applications.api.DialogV2={wait:async o=>{steps.push(o.window.title);return o.buttons.at(-1).callback();}};
 const {app}=await render();const b={dataset:{}};const go=a=>shopsMod.handleShops(app,a,b,{render:async()=>{}});
 await go('shop-new');assert.equal(app.shopSub,'list');assert.equal(app.shopDraft.saved,false);assert.equal(app.shopEdTab,'details');
 const r=await shopsMod.dropIntoDraft(app,{type:'Item',uuid:'Item.gem'});
 assert.equal(r.added.length,1);assert.equal(app.shopDraft.lines[0]._coin,'sp','ep price shown in sp while electrum is off');assert.equal(app.shopDraft.lines[0]._price,'15');
 app.shopDraft.name='[TEST] Gem Stall';
 await go('shop-save');
 const saved=api.get('SHOP-TEST-GEM-STALL');assert.ok(saved);assert.equal(saved.lines[0].priceCp,150);assert.equal(app.shopStatus,'Saved');assert.equal(app.shopDirty,false);
 app.shopDirty=true;await go('shop-cancel');assert.deepEqual(steps,['Discard unsaved changes?']);assert.equal(app.shopDraft,null);
 await go('shop-new');app.shopDraft.name='';await assert.rejects(()=>go('shop-save'),/needs a name/);
 app.shopDirty=false;b.dataset.shop='SHOP-TEST-GEM-STALL';await go('shop-edit');assert.equal(app.shopDraft.id,'SHOP-TEST-GEM-STALL');
 await go('shop-delete');assert.equal(steps.at(-1),'Delete [TEST] Gem Stall?');assert.equal(api.get('SHOP-TEST-GEM-STALL'),null);
 assert.equal(await shopsMod.handleShops(app,'stash-take',b,{render:async()=>{}}),false,'other actions pass through');
 delete foundry.applications.api.DialogV2;
});
test('a saved shop or an electrum change re-renders the open Shops tab',async()=>{
 const {app}=await render();let renders=0;const orig=app.render.bind(app);app.render=async(...a)=>{renders++;return orig(...a);};
 Hooks.callAll('updateJournalEntryPage',journals[0].pages[0]);Hooks.callAll('updateJournalEntryPage',{parent:{flags:{}}});
 Hooks.callAll(`${ID}.electrumChanged`,true);
 assert.equal(renders,2);
});
