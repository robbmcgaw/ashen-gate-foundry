// 0.21.0: import and export of shops, services and merchant lists (brief 6, design §8). Create / keep / update rules,
// GM edits surviving an update (hand-added lines, stock left, the shop purse now, presenting), unresolved item lines,
// ep refused while electrum is off, retired ids, lists imported hidden, errors naming the record, GM only, the export
// round trip, and the Import JSON preview markup.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, file picker or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,planShopImport,shopImportRecords,importItemRefs,exportShopsPackage,exportPrice} from '../scripts/core.mjs';

const item=(id,name,{price=1,coin='gp',type='loot',sourceId=null,container=null}={})=>({id,name,type,img:'',uuid:`Item.${id}`,documentName:'Item',
 flags:sourceId?{'ashen-gate-manager':{source:{sourceId}}}:{},system:{quantity:1,price:{value:price,denomination:coin},...(container?{container}:{})},
 toObject(){const {toObject,...rest}=this;return structuredClone(rest);}});
const shopRec=(over={})=>({id:'SHOP-TEST-TANNER',entity_type:'Shop',status:'draft',version:'1.0.0',name:"[TEST] Tanner's Stall",visibility:'gm',refs:[],
 provenance:{sources:['synthetic']},shop:{merchant_name:'[TEST] Hollis Reed',flavour:'Smells of oak bark.',location_id:'LOC-TEST-MARKET',gm_notes:'Synthetic.',
  purse:{cp:50,sp:30,gp:20,pp:0},lines:[
   {item_id:'ITEM-TEST-LEATHER',price:{value:10,denomination:'gp'},stock:2,flavour:'Supple.',cost:{value:6,denomination:'gp'}},
   {item_id:'ITEM-TEST-WATERSKIN',price:{value:2,denomination:'sp'}},
   {item_uuid:'Compendium.test.items.Item.ROPE00000000001',price:{value:5,denomination:'sp'},stock:6},
   {item_id:'ITEM-TEST-HIDE',price:{value:3,denomination:'gp'},hidden:true}]},...over});
const svcRec={id:'SVC-TEST-COUNTING-HOUSE',entity_type:'Service',status:'draft',version:'1.0.0',name:'[TEST] Counting House',visibility:'gm',refs:[],provenance:{sources:['synthetic']},
 service:{type:'bank',merchant_name:'[TEST] Clerk Ames',flavour:'Brass scales.',location_id:'LOC-TEST-MARKET',settings:{fee_percent:5}}};
const listRec={id:'MLIST-TEST-TESTFORD',entity_type:'MerchantList',status:'draft',version:'1.0.0',name:'[TEST] Testford merchants',visibility:'gm',refs:[],provenance:{sources:['synthetic']},
 merchant_list:{location_id:'LOC-TEST-TESTFORD',shop_ids:['SHOP-TEST-TANNER','SVC-TEST-COUNTING-HOUSE']}};
const pkg=records=>({manifest:{schema_version:'ag-foundry-import/0.2',package_id:'AG-TEST-SHOPS',version:'1.0.0'},records});
let rid=0;const randomId=()=>`r${++rid}`;
const pureItems=new Map([['id:ITEM-TEST-LEATHER',{data:item('a','[TEST] Leather Armor',{price:10,type:'equipment'}).toObject(),contents:[],uuid:'Item.a'}],
 ['id:ITEM-TEST-WATERSKIN',{data:item('b','[TEST] Waterskin',{price:2,coin:'sp'}).toObject(),contents:[],uuid:'Item.b'}]]);

// ---- Pure rules ----
test('package reading: shop records picked out, others counted, a wrong format refused; item refs listed',()=>{
 const r=shopImportRecords(pkg([{id:'ITEM-TEST-X',entity_type:'Item'},shopRec(),svcRec,listRec]));
 assert.deepEqual([r.records.length,r.ignored],[3,1]);
 assert.equal(shopImportRecords({format:'ag-foundry-import/0.2',records:[svcRec]}).records.length,1,'the GPT brief\'s "format" key is read too');
 assert.throws(()=>shopImportRecords({manifest:{schema_version:'ag-foundry-import/0.1'},records:[]}),/Utilities reads ag-foundry-import\/0\.2/);
 assert.throws(()=>shopImportRecords({}),/Not an import file/);
 assert.deepEqual(importItemRefs([shopRec()]),['id:ITEM-TEST-LEATHER','id:ITEM-TEST-WATERSKIN','uuid:Compendium.test.items.Item.ROPE00000000001','id:ITEM-TEST-HIDE']);
});
test('create: prices to copper, stock, cost, hidden, purse as starting cash, nothing live; unresolved lines skipped, the rest imports',()=>{
 const {results,writes}=planShopImport([shopRec(),svcRec,listRec],{items:pureItems,randomId,now:5,userId:'gm'});
 assert.deepEqual(results.map(r=>[r.id,r.result]),[['SHOP-TEST-TANNER','created'],['SVC-TEST-COUNTING-HOUSE','created'],['MLIST-TEST-TESTFORD','created']]);
 assert.deepEqual(results[0].lines,{imported:2,skipped:[{ref:'Compendium.test.items.Item.ROPE00000000001',reason:'Item not found in this world.'},{ref:'ITEM-TEST-HIDE',reason:'Item not found in this world.'}]});
 const s=writes.shops[0];
 assert.deepEqual([s.presented,s.purse,s.purseStart,s.showPurse,s.buys.enabled,s.locationId,s.gmNotes,s.merchant],[null,{cp:50,sp:30,gp:20,pp:0},{cp:50,sp:30,gp:20,pp:0},true,false,'LOC-TEST-MARKET','Synthetic.',{name:'[TEST] Hollis Reed',img:''}]);
 assert.deepEqual(s.lines.map(l=>[l.itemId,l.priceCp,l.priceCoin,l.stock,l.stockStart,l.costCp,l.hidden,l.flavour,l.importKey,l.item.name]),
  [['ITEM-TEST-LEATHER',1000,'gp',2,2,600,false,'Supple.','id:ITEM-TEST-LEATHER','[TEST] Leather Armor'],['ITEM-TEST-WATERSKIN',20,'sp',null,null,null,false,'','id:ITEM-TEST-WATERSKIN','[TEST] Waterskin']]);
 assert.deepEqual([writes.services[0].service,writes.services[0].presented],[{type:'bank',settings:{feePercent:5}},null]);
 assert.equal('known' in writes.services[0],false);
 assert.deepEqual([writes.lists[0].visible,writes.lists[0].shopIds,results[2].notes],[false,['SHOP-TEST-TANNER','SVC-TEST-COUNTING-HOUSE'],[]],'lists import hidden');
 const noPurse=planShopImport([shopRec({shop:{merchant_name:'[TEST] M',lines:[],show_purse:false,buys:{enabled:true,types:['weapon']}}})],{randomId}).writes.shops[0];
 assert.deepEqual([noPurse.purse,noPurse.showPurse,noPurse.buys],[null,false,{enabled:true,percent:50,types:['weapon']}],'no purse = unlimited cash');
});
test('refusals name the record and the line: ep while electrum is off, bad ids, retired ids, duplicates, unknown service type, bad list entries',()=>{
 const ep=shopRec({shop:{...shopRec().shop,lines:[{item_id:'ITEM-TEST-LEATHER',price:{value:2,denomination:'ep'}}]}});
 const r=planShopImport([ep],{items:pureItems,randomId}).results[0];
 assert.deepEqual([r.id,r.result,r.reason],['SHOP-TEST-TANNER','skipped','line 1 price: ep is refused while Use electrum is off.']);
 assert.equal(planShopImport([ep],{items:pureItems,randomId,electrum:true}).writes.shops[0].lines[0].priceCp,100,'2 ep = 100 cp while electrum is on');
 assert.match(planShopImport([shopRec({shop:{...shopRec().shop,purse:{ep:3}}})],{randomId}).results[0].reason,/^shop\.purse: Electrum is turned off/);
 const why=(rec,opts={})=>planShopImport([].concat(rec),{randomId,...opts}).results.at(-1).reason;
 assert.match(why({...shopRec(),id:'SHOP-lower'}),/id must be SHOP-/);
 assert.equal(why(shopRec(),{retiredIds:['SHOP-TEST-TANNER']}),'This id belonged to something deleted; ids are never reused.');
 assert.equal(why([svcRec,svcRec]),'Duplicate id in this import.');
 assert.equal(why({...svcRec,service:{type:'tailor'}}),'Unknown service type: tailor.');
 assert.match(why({...svcRec,service:{type:'bank',settings:{fee_percent:60}}}),/0 to 50/);
 assert.match(why({...listRec,merchant_list:{shop_ids:['SHOP-TEST-TANNER','LOC-TEST-X']}}),/"LOC-TEST-X" is not a SHOP-\* or SVC-\* id/);
 assert.equal(why(shopRec({shop:{...shopRec().shop,lines:[{price:{value:1,denomination:'gp'}}]}})),'line 1 needs item_id or item_uuid.');
 assert.equal(why(shopRec({shop:{...shopRec().shop,lines:[{item_id:'ITEM-TEST-LEATHER',stock:-1}]}})),'line 1: stock must be a whole number from 0 (leave it out for unlimited).');
 assert.equal(why(shopRec({shop:{...shopRec().shop,merchant_name:''}})),'shop.merchant_name is required.');
 assert.equal(why(shopRec({status:'retired'})),'Status retired: not imported.');
 assert.match(why(shopRec({shop:{...shopRec().shop,buys:{enabled:true,types:['container']}}})),/buys\.types: container/);
 assert.deepEqual(planShopImport([{...listRec,merchant_list:{shop_ids:['SHOP-TEST-ELSEWHERE']}}],{randomId}).results[0].notes,['SHOP-TEST-ELSEWHERE is not in this world or this file; the list shows it as missing.']);
});
test('export: definitions only (starting stock and cash, never presented or stock left), whole-coin prices, lines without a ref named',()=>{
 assert.deepEqual([exportPrice(150,'gp'),exportPrice(1000,'gp'),exportPrice(20,'sp'),exportPrice(7,'gp')],[{value:15,denomination:'sp'},{value:10,denomination:'gp'},{value:2,denomination:'sp'},{value:7,denomination:'cp'}]);
 const shop={id:'SHOP-TEST-A',name:'[TEST] A',merchant:{name:'[TEST] M',img:''},flavour:'',locationId:null,gmNotes:'',purse:{cp:1,sp:0,gp:0,pp:0},purseStart:{cp:9,sp:0,gp:0,pp:0},showPurse:true,
  buys:{enabled:false,percent:50,types:[]},presented:{mode:'all',userIds:[]},lines:[{lineId:'l1',itemId:'ITEM-TEST-X',priceCp:150,priceCoin:'gp',stock:1,stockStart:4,hidden:false,costCp:null,flavour:''},{lineId:'l2',itemId:null,itemUuid:null,item:{name:'[TEST] Loose'},priceCp:1}]};
 const {package:p,notes}=exportShopsPackage({shops:[shop]});
 assert.equal(p.manifest.schema_version,'ag-foundry-import/0.2');
 assert.deepEqual(p.records[0].shop.lines,[{item_id:'ITEM-TEST-X',price:{value:15,denomination:'sp'},stock:4}]);
 assert.deepEqual(p.records[0].shop.purse,{cp:9,sp:0,gp:0,pp:0},'the starting cash, not the coins now');
 assert.equal(JSON.stringify(p).includes('presented'),false);
 assert.deepEqual(notes,['SHOP-TEST-A: [TEST] Loose has no item id or uuid, so it was left out.']);
});

// ---- Integration through main.mjs (storage, item lookup, GM only) ----
const handlers={once:new Map()};const settings=new Map();const hooks=new Map();
globalThis.HTMLElement=class {};
let idn=0;
globalThis.foundry={utils:{randomID:()=>`id${++idn}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const journals=[];
function mkPage(data,j){const page={...structuredClone(data),id:`pg${++idn}`,parent:j,testUserPermission:()=>true,update:async d=>{Object.assign(page,structuredClone(d));},delete:async()=>{j.pages.splice(j.pages.indexOf(page),1);}};return page;}
globalThis.JournalEntry={create:async d=>{const j={...structuredClone(d),id:`j${++idn}`,pages:[],createEmbeddedDocuments:async(type,list)=>{for(const p of list)j.pages.push(mkPage(p,j));},
 updateEmbeddedDocuments:async()=>{},deleteEmbeddedDocuments:async(type,ids)=>{j.pages=j.pages.filter(p=>!ids.includes(p.id));}};journals.push(j);return j;}};
const worldItems=[item('leather','[TEST] Leather Armor',{price:10,type:'equipment',sourceId:'ITEM-TEST-LEATHER'}),item('skin','[TEST] Waterskin',{price:2,coin:'sp',sourceId:'ITEM-TEST-WATERSKIN'}),
 item('hide','[TEST] Hide Bundle',{price:3,sourceId:'ITEM-TEST-HIDE'}),item('crate','[TEST] Crate',{price:1,type:'container',sourceId:'ITEM-TEST-CRATE'}),item('nail','[TEST] Nails',{price:1,coin:'cp',container:'crate'}),
 item('lamp','[TEST] Lamp',{price:5,coin:'sp'})];
worldItems.contents=worldItems;
const rope=item('ROPE00000000001','[TEST] Rope',{price:1});rope.uuid='Compendium.test.items.Item.ROPE00000000001';rope.pack='test.items';
globalThis.fromUuid=async u=>u===rope.uuid?rope:worldItems.find(i=>i.uuid===u)??null;
const actors=[];actors.get=()=>null;
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}};
const modules=new Map([[ID,{id:ID,active:true,version:'0.21.0'}]]);
globalThis.game={user:gm,users,actors,journal:journals,items:worldItems,packs:new Map([['test.items',{getIndex:async()=>[]}]]),time:{worldTime:0},modules,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!hooks.has(k))hooks.set(k,[]);hooks.get(k).push(fn);},off:()=>{},callAll:(k,...a)=>(hooks.get(k)??[]).forEach(f=>f(...a))};
await import('../scripts/main.mjs');
const gmView=await import('../scripts/shops.mjs');
const imp=await import('../scripts/shop-import.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.shops;
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const file=()=>pkg([{id:'ITEM-TEST-LEATHER',entity_type:'Item'},shopRec(),svcRec,listRec]);

test('import: GM only in the API; creates the shop (compendium line by uuid), the Bank and a hidden list; nothing presented',async()=>{
 await as(alice,()=>assert.rejects(()=>api.importShops(file()),/^Error: GM only\.$/));
 await as(alice,()=>assert.throws(()=>api.exportShops(),/^Error: GM only\.$/));
 await as(alice,()=>assert.rejects(()=>api.previewImport(file()),/^Error: GM only\.$/));
 const r=await api.importShops(file());
 assert.deepEqual(r.map(x=>[x.id,x.result]),[['SHOP-TEST-TANNER','created'],['SVC-TEST-COUNTING-HOUSE','created'],['MLIST-TEST-TESTFORD','created']]);
 assert.equal(r.ignored,1);
 const s=api.get('SHOP-TEST-TANNER');
 assert.deepEqual(s.lines.map(l=>[l.item.name,l.priceCp,l.itemUuid]),[['[TEST] Leather Armor',1000,'Item.leather'],['[TEST] Waterskin',20,'Item.skin'],['[TEST] Rope',50,'Compendium.test.items.Item.ROPE00000000001'],['[TEST] Hide Bundle',300,'Item.hide']]);
 assert.deepEqual([s.presented,s.lines[3].hidden,api.log('SHOP-TEST-TANNER')],[null,true,[]]);
 assert.deepEqual([api.services.get('SVC-TEST-COUNTING-HOUSE').service.settings,api.merchants.get('MLIST-TEST-TESTFORD').visible],[{feePercent:5},false]);
 assert.equal(journals.some(j=>j.flags?.[ID]?.store==='shops-player'),false,'a hidden list and an unpresented shop write nothing for players');
});
test('import again: kept as they are (default); an item missing from the world is skipped and reported, the rest imports',async()=>{
 const r=await api.importShops(file());
 assert.deepEqual(r.map(x=>x.result),['kept','kept','kept']);
 const missing=shopRec({id:'SHOP-TEST-ODD',name:'[TEST] Odd',shop:{merchant_name:'[TEST] M',lines:[{item_id:'ITEM-TEST-NOWHERE'},{item_id:'ITEM-TEST-HIDE'}]}});
 const [m]=await api.importShops([missing]);
 assert.deepEqual([m.result,m.lines],['created',{imported:1,skipped:[{ref:'ITEM-TEST-NOWHERE',reason:'Item not found in this world.'}]}]);
 assert.equal(api.get('SHOP-TEST-ODD').lines.length,1);
 const crate=(await api.importShops([shopRec({id:'SHOP-TEST-CRATES',name:'[TEST] Crates',shop:{merchant_name:'[TEST] M',lines:[{item_id:'ITEM-TEST-CRATE'}]}})]))[0];
 assert.equal(crate.result,'created');assert.deepEqual(api.get('SHOP-TEST-CRATES').lines[0].contents.map(c=>c.name),['[TEST] Nails'],'a container comes with what is inside');
});
test('update: file definitions replace name, merchant, flavour and items; GM-added line, stock left, purse now, presenting, location and notes stay',async()=>{
 const id='SHOP-TEST-TANNER';let s=api.get(id);
 await api.save({...s,locationId:'LOC-TEST-ELSEWHERE',gmNotes:'My own note.',lines:s.lines.map(l=>l.item.name==='[TEST] Leather Armor'?{...l,priceCp:1,stock:1}:l)});
 await api.addItems(id,['Item.lamp']);
 await api.adjustPurse(id,{op:'add',coin:'gp',amount:5});
 const before=api.get(id);
 // Being presented is live state: simulate it on the stored record directly.
 const page=journals.find(j=>j.flags?.[ID]?.store==='shops-gm').pages.find(p=>p.flags?.[ID]?.shop?.id===id);page.flags[ID].shop.presented={mode:'all',userIds:[],since:1,by:'gm'};
 const next=shopRec({name:"[TEST] Tanner's Stall (new)",shop:{...shopRec().shop,merchant_name:'[TEST] Hollis Reed II',flavour:'New smell.',purse:{gp:999},
  lines:[shopRec().shop.lines[0],{item_id:'ITEM-TEST-HIDE',price:{value:4,denomination:'gp'}}]}});
 const [r]=await api.importShops([next],{mode:'update'});
 assert.equal(r.result,'updated');
 s=api.get(id);
 assert.deepEqual([s.name,s.merchant.name,s.flavour,s.locationId,s.gmNotes],["[TEST] Tanner's Stall (new)",'[TEST] Hollis Reed II','New smell.','LOC-TEST-ELSEWHERE','My own note.']);
 assert.deepEqual(s.purse,before.purse,'the cash the shop has now is never changed by an update');
 assert.deepEqual(s.presented,{mode:'all',userIds:[],since:1,by:'gm'});
 assert.deepEqual(s.lines.map(l=>[l.item.name,l.priceCp,l.stock,l.stockStart,l.hidden]),[['[TEST] Leather Armor',1000,1,2,false],['[TEST] Hide Bundle',400,null,null,false],['[TEST] Lamp',50,null,null,false]],
  'the hand-edited price is replaced, stock left kept, lines dropped from the file go, the hand-added Lamp stays');
 assert.equal(s.lines[0].lineId,before.lines[0].lineId,'a matched line keeps its id');
 assert.ok(api.log(id).some(e=>e.kind==='shop-purse-adjust'),'the sales log is kept');
 const svc=await api.importShops([{...svcRec,name:'[TEST] Counting House II',service:{...svcRec.service,settings:{fee_percent:10}}}],{mode:'update'});
 assert.deepEqual([svc[0].result,api.services.get(svcRec.id).name,api.services.get(svcRec.id).service.settings.feePercent],['updated','[TEST] Counting House II',10]);
 assert.match((await api.importShops([{...svcRec,service:{type:'tailor'}}],{mode:'update'}))[0].reason,/Unknown service type/);
 await api.merchants.setVisible('MLIST-TEST-TESTFORD',true);
 const l=await api.importShops([{...listRec,merchant_list:{shop_ids:['SVC-TEST-COUNTING-HOUSE']}}],{mode:'update'});
 assert.deepEqual([l[0].result,api.merchants.get('MLIST-TEST-TESTFORD').shopIds,api.merchants.get('MLIST-TEST-TESTFORD').visible],['updated',['SVC-TEST-COUNTING-HOUSE'],true],'update keeps a list shown');
});
test('retired ids are refused; ep refused while electrum is off; export reads back as kept',async()=>{
 await api.delete('SHOP-TEST-ODD',{confirm:true});
 const [r]=await api.importShops([shopRec({id:'SHOP-TEST-ODD',name:'[TEST] Odd'})]);
 assert.deepEqual([r.result,r.reason],['skipped','This id belonged to something deleted; ids are never reused.']);
 const [e]=await api.importShops([shopRec({id:'SHOP-TEST-EP',shop:{merchant_name:'[TEST] M',lines:[{item_id:'ITEM-TEST-HIDE',price:{value:1,denomination:'ep'}}]}})]);
 assert.equal(e.reason,'line 1 price: ep is refused while Use electrum is off.');
 const out=api.exportShops();
 assert.deepEqual(out.records.map(x=>x.id).sort(),['MLIST-TEST-TESTFORD','SHOP-TEST-CRATES','SHOP-TEST-TANNER','SVC-TEST-COUNTING-HOUSE']);
 assert.equal(JSON.stringify(out).includes('presented'),false);
 assert.deepEqual(api.exportShops(['SVC-TEST-COUNTING-HOUSE']).records.map(x=>x.id),['SVC-TEST-COUNTING-HOUSE']);
 assert.deepEqual((await api.importShops(out)).map(x=>x.result),['kept','kept','kept','kept']);
 const again=await api.importShops(out,{mode:'update'});
 assert.deepEqual(again.map(x=>x.result),['updated','updated','updated','updated']);
 assert.equal(api.get('SHOP-TEST-TANNER').lines.length,3,'export then update in the same world does not double the hand-added line');
});
test('Import JSON preview: a badge per record with the reason, the update switch, Import N primary; Cancel writes nothing',async()=>{
 const app={tab:'shops',shopSub:'list',shopSearch:'',shopSort:'location',shopImport:null};
 await imp.openImportFile(app,{name:'test-shops.json',text:async()=>JSON.stringify(pkg([{id:'ITEM-TEST-X',entity_type:'Item'},shopRec({id:'SHOP-TEST-NEW',name:'[TEST] New'}),shopRec(),{...svcRec,service:{type:'tailor'}}]))});
 const html=gmView.shopsView(app),foot=gmView.shopsFooter(app);
 assert.match(html,/<h3 class="ag-section__title">Import test-shops\.json<\/h3>/);
 assert.match(html,/1 other record in this file \(an Item or another type\) is not read here/);
 assert.match(html,/<input type="checkbox" role="switch" data-shop-import-mode> Update shops that already exist/);
 assert.match(html,/\[TEST\] New<\/span><span class="ag-row__meta">Shop · 4 items · <code>SHOP-TEST-NEW<\/code>[\s\S]*?ag-badge ag-badge--ok"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> Create/);
 assert.match(html,/Already in this world; kept as it is\.[\s\S]*?<span class="ag-badge"><i class="fa-solid fa-lock" aria-hidden="true"><\/i> Kept/);
 assert.match(html,/Unknown service type: tailor\.[\s\S]*?ag-badge--danger"><i class="fa-solid fa-ban" aria-hidden="true"><\/i> Skipped/);
 assert.match(foot,/data-action="shop-import-cancel"[\s\S]*<button type="button" class="ag-btn ag-btn--primary" data-action="shop-import-apply" ><i class="fa-solid fa-file-import" aria-hidden="true"><\/i> Import 1<\/button>/);
 const render=async()=>{};
 await gmView.handleShops(app,'shop-import-cancel',{dataset:{}},{render,root:{}});
 assert.equal(app.shopImport,null);assert.equal(api.get('SHOP-TEST-NEW'),null,'Cancel writes nothing');
 await imp.openImportFile(app,{name:'x.json',text:async()=>JSON.stringify(pkg([shopRec({id:'SHOP-TEST-NEW',name:'[TEST] New'})]))});
 await gmView.handleShops(app,'shop-import-apply',{dataset:{}},{render,root:{}});
 assert.equal(api.get('SHOP-TEST-NEW').name,'[TEST] New');assert.equal(app.shopImport,null);
 assert.ok(notes.some(([k,m])=>k==='info'&&/^Imported: 1 created, 0 updated, 0 kept, 0 skipped\.$/.test(m)));
 await assert.rejects(()=>imp.openImportFile(app,{name:'bad.json',text:async()=>'not json'}),/the file is not JSON/);
});
