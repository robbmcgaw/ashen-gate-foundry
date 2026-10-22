// 0.24.0: Shops UI pass. Shared coin markup (icon, metal class, electrum only when on), Settlement (Locations'
// settlements only; typed when Locations is absent), the player tooltip copy (only what the shop shows), item tooltips
// and click-to-open (dnd5e's tooltip for real Items, a temporary Item for shop data), ware cards grouped by category,
// and the merchant from a dropped Actor (a reference note only).
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, dnd5e's tooltips or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,coinBoxHTML,coinStripHTML,coinChipsHTML,isSettlementLocation,shopPlace,listShops,playerTipItem,groupByCategory,normalizeShop,normalizeService,
 projectShop,projectService,merchantActorRef,tradeCardHTML} from '../scripts/core.mjs';

// ---- Pure helpers ----
test('coins: one box per coin with its metal class and icon, centred markup; electrum only while on (dimmed when still held)',()=>{
 const box=coinBoxHTML('gp',12);
 assert.match(box,/^<div class="agu-coin agu-coin--gp" data-coin="gp" role="group" aria-label="Gold: 12"><span class="agu-coin__icon" aria-hidden="true">G<\/span><span class="agu-coin__label">Gold <abbr[^>]*>gp<\/abbr><\/span><strong class="agu-coin__value">12<\/strong><\/div>$/);
 const off=coinStripHTML({cp:1,sp:2,gp:3,pp:4},false);
 assert.deepEqual([...off.matchAll(/data-coin="(\w+)"/g)].map(m=>m[1]),['cp','sp','gp','pp'],'no electrum while it is off');
 const held=coinStripHTML({cp:0,sp:0,ep:3,gp:0,pp:0},false);
 assert.match(held,/class="agu-coin agu-coin--ep agu-coin--off" data-coin="ep" role="group" aria-label="Electrum: 3 \(electrum is off\)"/);
 assert.deepEqual([...coinStripHTML({gp:1},true).matchAll(/data-coin="(\w+)"/g)].map(m=>m[1]),['cp','sp','ep','gp','pp']);
 const chips=coinChipsHTML('1 gp 5 sp');
 assert.deepEqual([...chips.matchAll(/class="agu-coin-chip agu-coin--(\w+)"/g)].map(m=>m[1]),['gp','sp']);
 assert.match(chips,/<span>1 gp<\/span>[\s\S]*<span>5 sp<\/span>/);
 assert.equal(coinChipsHTML('nothing'),'nothing');assert.equal(coinChipsHTML('<b>2 gp</b>').includes('<b>'),false,'escaped');
 const card=tradeCardHTML({kind:'shop-purchase',shopName:'K',itemName:'Rope',quantity:1,totalText:'2 gp',payFrom:'actor',payerName:'P',actorName:'P',userName:'A'});
 assert.match(card,/<strong>Total:<\/strong> <span class="agu-coin-chips"><span class="agu-coin-chip agu-coin--gp"/,'chat cards use the same chips');
});
test('settlement: Locations\' own answer first, then settlement: true / kind / locationType, then the Type naming one as a whole word',()=>{
 assert.equal(isSettlementLocation({type:'Port Town'}),true);assert.equal(isSettlementLocation({type:'CITY'}),true);
 assert.equal(isSettlementLocation({type:'Townhouse'}),false,'whole words only');assert.equal(isSettlementLocation({type:'Ruin'}),false);
 assert.equal(isSettlementLocation({settlement:true}),true);assert.equal(isSettlementLocation({kind:'Settlement'}),true);assert.equal(isSettlementLocation({locationType:'settlement'}),true);
 assert.equal(isSettlementLocation({type:'Town'},{api:{isSettlement:()=>false}}),false,'the Locations API wins when it answers');
 assert.equal(isSettlementLocation({type:'Town'},{api:{isSettlement:()=>{throw Error('x');}}}),true,'a failing API falls back to the record');
 assert.equal(isSettlementLocation(null),false);
});
test('shopPlace and the list: grouped by the nearest settlement; the top of the tree when none; a typed settlement without a link',()=>{
 const locs=new Map([['LOC-R',{name:'[TEST] Vale',parentLocationId:'',type:'Region'}],['LOC-T',{name:'[TEST] Testford',parentLocationId:'LOC-R',type:'Town'}],
  ['LOC-M',{name:'[TEST] Market Ward',parentLocationId:'LOC-T',type:'District'}],['LOC-W',{name:'[TEST] Watchtower',parentLocationId:'LOC-R',type:'Ruin'}]]);
 assert.deepEqual(shopPlace({locationId:'LOC-M'},locs),{place:'[TEST] Market Ward',city:'[TEST] Testford'},'the settlement, not the region on top');
 assert.deepEqual(shopPlace({locationId:'LOC-W'},locs),{place:'[TEST] Watchtower',city:'[TEST] Vale'},'no settlement above: the top');
 assert.deepEqual(shopPlace({settlement:'[TEST] Hamlet'},locs),{place:'[TEST] Hamlet',city:'[TEST] Hamlet'});
 assert.deepEqual(shopPlace({},locs),{place:'',city:'No location'});
 const g=listShops([{id:'SHOP-A',name:'A',locationId:'LOC-M'},{id:'SHOP-B',name:'B',settlement:'[TEST] Hamlet'},{id:'SHOP-C',name:'C'}],{locations:locs});
 assert.deepEqual(g.map(x=>[x.group,x.shops.map(s=>s.id)]),[['[TEST] Hamlet',['SHOP-B']],['[TEST] Testford',['SHOP-A']],['No location',['SHOP-C']]]);
});
test('stored record: the merchant\'s Actor is a reference note only; a typed settlement is kept; players see neither the Actor nor an unrevealed link',()=>{
 assert.deepEqual(merchantActorRef({uuid:'Actor.npc1',id:'npc1',name:'[TEST] Brin',extra:1}),{uuid:'Actor.npc1',id:'npc1',name:'[TEST] Brin'});
 assert.equal(merchantActorRef({name:'only a name'}),null);assert.equal(merchantActorRef('Actor.x'),null);
 const s=normalizeShop({id:'SHOP-TEST-K',name:'[TEST] K',merchant:{name:'[TEST] Brin',img:'brin.webp',actor:{uuid:'Actor.npc1',id:'npc1',name:'[TEST] Brin'}},settlement:'  [TEST] Hamlet '});
 assert.deepEqual(s.merchant,{name:'[TEST] Brin',img:'brin.webp',actor:{uuid:'Actor.npc1',id:'npc1',name:'[TEST] Brin'}});assert.equal(s.settlement,'[TEST] Hamlet');
 assert.equal('settlement' in normalizeShop({id:'SHOP-TEST-K',name:'K'}),false,'additive: nothing new on a shop without it');
 const p=projectShop(s);
 assert.deepEqual(p.merchant,{name:'[TEST] Brin',img:'brin.webp'},'no Actor reference for players');assert.equal(JSON.stringify(p).includes('npc1'),false);
 assert.deepEqual(p.location,{name:'[TEST] Hamlet'},'the typed settlement is shown');
 assert.equal('location' in projectShop({...s,locationId:'LOC-HIDDEN'}),false,'a linked place stays hidden until Locations reveals it');
 const svc=normalizeService({id:'SVC-TEST-B',name:'B',merchant:{name:'C',actor:{id:'npc2'}},settlement:'[TEST] Hamlet',service:{type:'bank'}});
 assert.deepEqual(svc.merchant.actor,{uuid:null,id:'npc2',name:''});assert.equal(JSON.stringify(projectService(svc)).includes('npc2'),false);
});
test('player tooltip copy: unidentified name and text only, secrets removed, the shop\'s price, no flags, effects, ids or cost',()=>{
 const line={lineId:'l1',priceCp:150,priceCoin:'ep',costCp:40,flavour:'f',item:{_id:'x1',name:'True name',type:'weapon',img:'w.webp',flags:{gm:{note:'GM bit'}},effects:[{name:'Curse'}],ownership:{default:0},folder:'f1',
  system:{quantity:2,identified:false,container:'bag1',identifier:'true-name',price:{value:99,denomination:'gp'},description:{value:'<p>Real</p>',chat:'Real chat'},unidentified:{name:'Odd blade',description:'<p>Odd.</p><section class="secret">GM bit</section>'}}}};
 const t=playerTipItem(line,{electrum:false});
 assert.deepEqual(Object.keys(t).sort(),['img','name','system','type']);
 assert.deepEqual([t.name,t.type,t.img],['Odd blade','weapon','w.webp']);
 const text=JSON.stringify(t);for(const leak of ['True name','Real','GM bit','Curse','bag1','true-name','x1','"flags"','"ownership"','99'])assert.equal(text.includes(leak),false,leak);
 assert.deepEqual(t.system.price,{value:7.5,denomination:'sp'},'the shop price per unit: 150 cp for 2 (ep shown as sp while electrum is off)');
 assert.deepEqual(t.system.description,{value:'<p>Odd.</p>',chat:''});assert.equal(t.system.identified,false);
 assert.deepEqual(line.item.system.price,{value:99,denomination:'gp'},'the snapshot is not changed');
 const known=playerTipItem({lineId:'l2',priceCp:100,item:{name:'Rope',type:'loot',system:{description:{value:'<p>Rope.</p><section class="secret">x</section>'}}}});
 assert.deepEqual([known.name,known.system.description.value,known.system.price.denomination],['Rope','<p>Rope.</p>','gp']);
 const view=projectShop(normalizeShop({id:'SHOP-TEST-K',name:'K',lines:[{lineId:'h',hidden:true,item:{name:'[TEST] Sealed Crate',type:'loot',system:{}}},line]}));
 assert.deepEqual(view.lines.map(l=>l.lineId),['l1'],'hidden lines have no tooltip copy either');assert.equal(JSON.stringify(view).includes('Sealed Crate'),false);
});
test('groupByCategory: groups A–Z, lines kept in their own order',()=>{
 assert.deepEqual(groupByCategory([{n:1,type:'Weapon'},{n:2,type:'Consumable'},{n:3,type:'Weapon'},{n:4}]).map(g=>[g.category,g.lines.map(l=>l.n)]),[['Consumable',[2]],['Other',[4]],['Weapon',[1,3]]]);
});

const tips=await import('../scripts/item-tips.mjs');

// ---- Integration through main.mjs ----
const handlers={once:new Map()};const settings=new Map();const hooks=new Map();
globalThis.HTMLElement=class {};
let idn=0;
globalThis.foundry={utils:{randomID:()=>`id${++idn}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const level=(doc,user)=>user.isGM?3:(doc.ownership?.[user.id]??doc.ownership?.default??0);
const LV={NONE:0,LIMITED:1,OBSERVER:2,OWNER:3};
const journals=[];
function mkPage(data,j){const page={...structuredClone(data),id:`pg${++idn}`,parent:j,testUserPermission:(u,l)=>level(page,u)>=LV[l],
 update:async d=>{Object.assign(page,structuredClone(d));},delete:async()=>{j.pages.splice(j.pages.indexOf(page),1);}};return page;}
globalThis.JournalEntry={create:async d=>{const j={...structuredClone(d),id:`j${++idn}`,pages:[],
 createEmbeddedDocuments:async(type,list)=>{for(const p of list)j.pages.push(mkPage(p,j));},
 updateEmbeddedDocuments:async(type,list)=>{for(const u of list){const p=j.pages.find(x=>x.id===u._id);for(const [k,v] of Object.entries(u)){if(k==='_id')continue;if(k.startsWith('flags.')){const path=k.split('.');let o=p;for(const s of path.slice(0,-1))o=o[s]??={};o[path.at(-1)]=v;}else p[k]=structuredClone(v);}}},
 deleteEmbeddedDocuments:async(type,ids)=>{j.pages=j.pages.filter(p=>!ids.includes(p.id));}};journals.push(j);return j;}};
const mkActor=(id,name,{type='character',owners=[],img='',token=''}={})=>{const items=[];items.get=x=>items.find(i=>i.id===x);
 return {id,name,type,img,prototypeToken:{texture:{src:token}},documentName:'Actor',uuid:`Actor.${id}`,flags:{},items,system:{currency:{cp:0,sp:0,ep:0,gp:9,pp:0}},ownership:{},
  testUserPermission:(u,l)=>u.isGM||(owners.includes(u.id)&&LV[l]<=3),getFlag:()=>undefined};};
const kestrel=mkActor('kestrel','[TEST] Kestrel',{owners:['alice']});
kestrel.items.push({id:'dag1',_id:'dag1',name:'[TEST] Dagger',type:'weapon',img:'dagger.webp',uuid:'Actor.kestrel.Item.dag1',system:{quantity:1,price:{value:2,denomination:'gp'}},toObject(){return {_id:'dag1',name:this.name,type:this.type,img:this.img,system:this.system};}});
const brin=mkActor('brin','[TEST] Brin Tallow',{type:'npc',img:'brin.webp'});
const plain=mkActor('plainnpc','[TEST] Plain Clerk',{type:'npc',img:'icons/svg/mystery-man.svg',token:'tokens/clerk.webp'});
const stash=mkActor('stash','Ashen Gate | Party Stash',{type:'npc'});stash.flags={[ID]:{partyStash:true}};
const actors=[kestrel,brin,plain,stash];actors.get=id=>actors.find(a=>a.id===id);
const docs=new Map(actors.map(a=>[a.uuid,a]));let gone=new Set();
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>gone.has(u)?null:docs.get(u)??null;
globalThis.ChatMessage={create:async d=>d,getSpeaker:()=>({})};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}};
let locationsActive=true;
const LOCS=[{id:'LOC-TEST-VALE',name:'[TEST] Vale',parentLocationId:'',type:'Region',isRegion:true},{id:'LOC-TEST-TOWN',name:'[TEST] Testford',parentLocationId:'LOC-TEST-VALE',type:'Town'},
 {id:'LOC-TEST-MARKET',name:'[TEST] Market Ward',parentLocationId:'LOC-TEST-TOWN',type:'District'},{id:'LOC-TEST-HAMLET',name:'[TEST] Brook',parentLocationId:'LOC-TEST-VALE',settlement:true}];
const modules=new Map([[ID,{id:ID,active:true,version:'0.24.0'}]]);
modules.set('ashen-gate-locations',{get active(){return locationsActive;},api:{listLocations:({revealedOnly}={})=>LOCS.filter(l=>!revealedOnly||l.revealed)}});
let socketFn=null;
globalThis.game={user:gm,users,actors,journal:journals,items:[],time:{worldTime:0},modules,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:(name,fn)=>{socketFn=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',consumable:'Consumable',weapon:'Weapon'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!hooks.has(k))hooks.set(k,[]);hooks.get(k).push(fn);},off:()=>{},callAll:(k,...a)=>(hooks.get(k)??[]).forEach(f=>f(...a))};
await import('../scripts/main.mjs');
const shopsMod=await import('../scripts/shops.mjs');
const trade=await import('../scripts/shop-buy.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.shops;
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const render=async(user=gm,setup=()=>{})=>as(user,async()=>{const app=await game.modules.get(ID).api.open();app.tab='shops';setup(app);return {app,html:await app._renderHTML()};});
let SHOP;
test('setup: a shop with lines in two categories, a hidden line and a GM cost',async()=>{
 await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'shopsEnabled',true);
 const s=await api.create({name:'[TEST] The Copper Kettle',merchant:{name:'[TEST] Brin Tallow'},locationId:'LOC-TEST-MARKET',gmNotes:'GM only text.',
  lines:[{lineId:'ln_rope',priceCp:100,priceCoin:'gp',stock:3,costCp:40,sort:1,item:{_id:'rope0',name:'Rope, Hempen (50 ft)',type:'loot',img:'rope.webp',flags:{x:{secret:'flagged'}},system:{quantity:1,price:{value:1,denomination:'gp'},description:{value:'<p>Rope.</p>'}}}},
   {lineId:'ln_arrows',priceCp:15,priceCoin:'sp',sort:2,item:{_id:'ar0',name:'Arrows',type:'consumable',img:'arrows.webp',system:{quantity:20}}},
   {lineId:'ln_secret',priceCp:2500,hidden:true,sort:3,item:{name:'[TEST] Sealed Crate',type:'loot',system:{}}}]});
 SHOP=s.id;
});
test('GM editor: Settlement lists only Locations\' settlements; a linked place that is not one stays, marked; Group by settlement',async()=>{
 const {html}=await render(gm,app=>{app.shopDraft=shopsMod.draftFrom(api.get(SHOP));app.shopSub='editor';});
 const sel=html.match(/Settlement<select data-shop-field="locationId">([\s\S]*?)<\/select>/)?.[1]??'';
 assert.deepEqual([...sel.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]),['','LOC-TEST-HAMLET','LOC-TEST-TOWN','LOC-TEST-MARKET']);
 assert.match(sel,/<option value="LOC-TEST-MARKET" selected>\[TEST\] Market Ward \(not a settlement\)<\/option>/);assert.doesNotMatch(sel,/LOC-TEST-VALE/,'a region is not a settlement');
 assert.doesNotMatch(html,/Linked location|data-shop-field="settlement"/,'no typed field while Locations is active and none was typed');
 const list=(await render(gm,app=>{app.shopSub='list';app.shopDraft=null;})).html;
 assert.match(list,/<option value="location" selected>Group by settlement<\/option>/);assert.match(list,/<h3 class="ag-eyebrow">\[TEST\] Testford · 1<\/h3>/,'grouped by the town, not the region on top');
});
test('GM editor without Locations: Settlement is a text field; saved, shown to players, and used for the list group',async()=>{
 locationsActive=false;
 try{
  const {app,html}=await render(gm,app=>{app.shopDraft=shopsMod.draftFrom(api.get(SHOP));app.shopDraft.locationId=null;app.shopSub='editor';});
  assert.match(html,/<label class="ag-field">Settlement<input type="text" maxlength="120" data-shop-field="settlement" value="" placeholder="Town or city name"><span class="ag-field__hint">Ashen Gate \| Locations is not active, so type the settlement\. Players see this name\.<\/span><\/label>/);
  assert.doesNotMatch(html,/data-shop-field="locationId"/);
  app.shopDraft.settlement='[TEST] Hamlet';
  await as(gm,()=>shopsMod.handleShops(app,'shop-save',{dataset:{}},{render:async()=>{},root:{}}));
  const saved=api.get(SHOP);assert.equal(saved.settlement,'[TEST] Hamlet');assert.equal(saved.locationId,null);
  assert.deepEqual(trade.projectionOf(saved).location,{name:'[TEST] Hamlet'});
  assert.match((await render(gm,app=>{app.shopSub='list';app.shopDraft=null;})).html,/<h3 class="ag-eyebrow">\[TEST\] Hamlet · 1<\/h3>/);
 }finally{locationsActive=true;}
 const back=(await render(gm,app=>{app.shopDraft=shopsMod.draftFrom(api.get(SHOP));app.shopSub='editor';})).html;
 assert.match(back,/Settlement \(typed\)<input[^>]*data-shop-field="settlement" value="\[TEST\] Hamlet"[\s\S]*Typed while Locations was off/,'kept and still editable once Locations is back');
});
test('GM editor: lines grouped by category; each item\'s picture and name show its tooltip and open it',async()=>{
 const {html}=await render(gm,app=>{app.shopDraft=shopsMod.draftFrom(api.get(SHOP));app.shopSub='editor';app.shopEdTab='items';});
 assert.deepEqual([...html.matchAll(/<tr class="agu-shop-lines__cat"><th scope="rowgroup" colspan="5">([^<]+)<\/th>/g)].map(m=>m[1]),['Consumable · 1','Loot · 2']);
 assert.match(html,/<button type="button" class="agu-item-link agu-shop-item__open" data-agu-item-open data-agu-item-tip="gm:ln_rope" data-tooltip="Open Rope, Hempen \(50 ft\)"/);
 assert.equal(trade_tip('gm:ln_rope').name,'Rope, Hempen (50 ft)','the GM sees the line\'s own snapshot');
});
const trade_tip=key=>tips.registeredTip(key);
test('player window: ware cards grouped by category, price as coin chips; tooltips come only from the trimmed copy (no hidden lines, cost, GM notes, flags)',async()=>{
 await api.present(SHOP,{mode:'all'});
 const w=await as(alice,()=>api.open(SHOP));const html=await as(alice,()=>w._renderHTML());
 assert.deepEqual([...html.matchAll(/<section class="agu-ware-group" aria-label="([^"]+)"><h4 class="ag-eyebrow">[^<]+<\/h4>/g)].map(m=>m[1]),['Consumable','Loot']);
 assert.match(html,/<li class="ag-card ag-card--compact agu-ware-card" data-line="ln_rope"><button type="button" class="agu-item-link agu-ware-card__img" data-agu-item-open data-agu-item-tip="SHOP-TEST-THE-COPPER-KETTLE:ln_rope"/);
 assert.match(html,/<strong class="agu-ware__price" aria-label="Price 1 gp"><span class="agu-coin-chips"><span class="agu-coin-chip agu-coin--gp"/);
 assert.match(html,/<span class="ag-badge">3 left<\/span>/);
 assert.doesNotMatch(html,/Sealed Crate|GM only text|title=/);
 const data=tips.registeredTip('SHOP-TEST-THE-COPPER-KETTLE:ln_rope');
 assert.deepEqual(Object.keys(data).sort(),['img','name','system','type']);
 const text=JSON.stringify(data);for(const leak of ['flagged','rope0','costCp','40','GM only'])assert.equal(text.includes(leak),false,leak);
 assert.equal(tips.registeredTip('SHOP-TEST-THE-COPPER-KETTLE:ln_secret'),null,'a hidden line is never registered');
 const page=journals.find(j=>j.flags?.[ID]?.store==='shops-player').pages.find(p=>p.flags?.[ID]?.shopId===SHOP);
 for(const leak of ['flagged','rope0','Sealed Crate','GM only text','"actor"'])assert.equal(page.flags[ID].shopView.includes(leak),false,leak);
});
test('sell view: the seller\'s own items as cards with dnd5e\'s tooltip for the real Item',async()=>{
 const s=api.get(SHOP);await api.save({...s,buys:{enabled:true,percent:50,types:[]}});await trade.syncPlayerView();
 const w=await as(alice,()=>api.open(SHOP));w.mode='sell';const html=await as(alice,()=>w._renderHTML());
 assert.match(html,/<li class="ag-card ag-card--compact agu-ware-card" data-sell-item="dag1"><button type="button" class="agu-item-link agu-ware-card__img" data-agu-item-open data-tooltip="Open \[TEST\] Dagger" data-agu-item-uuid="Actor\.kestrel\.Item\.dag1"/);
 assert.match(html,/Shop pays <span class="agu-coin-chips"><span class="agu-coin-chip agu-coin--gp"[^>]*><span class="agu-coin__icon" aria-hidden="true">G<\/span><span>1 gp<\/span><\/span> each<\/span>/);
});
test('merchant from a dropped Actor: name and portrait (token art for a default portrait), the Actor kept as a note; edit by hand; Clear',async()=>{
 const app={shopDraft:shopsMod.draftFrom(api.get(SHOP)),shopDirty:false};
 await as(alice,()=>assert.rejects(()=>shopsMod.dropMerchant(app,{type:'Actor',uuid:'Actor.brin'}),/^Error: GM only\.$/,'GM only in the data layer'));
 assert.equal(await as(gm,()=>shopsMod.dropMerchant(app,{type:'Item',uuid:'Actor.brin'})),null,'not an Actor drop');
 const m=await as(gm,()=>shopsMod.dropMerchant(app,{type:'Actor',uuid:'Actor.brin'}));
 assert.deepEqual(m,{name:'[TEST] Brin Tallow',img:'brin.webp',actor:{uuid:'Actor.brin',id:'brin',name:'[TEST] Brin Tallow'}});assert.equal(app.shopDirty,true);
 assert.equal(shopsMod.merchantFromActor({},plain).img,'tokens/clerk.webp','Foundry\'s default portrait: the token art');
 app.shopDraft.merchant={...app.shopDraft.merchant,img:'custom.webp'};// overridden by hand
 const saved=await as(gm,()=>api.save(shopsMod.recordFrom(app.shopDraft)));
 assert.deepEqual(saved.merchant,{name:'[TEST] Brin Tallow',img:'custom.webp',actor:{uuid:'Actor.brin',id:'brin',name:'[TEST] Brin Tallow'}});
 let html=(await render(gm,a=>{a.shopDraft=shopsMod.draftFrom(api.get(SHOP));a.shopSub='editor';a.shopEdTab='details';})).html;
 assert.match(html,/Name and art taken from the Actor <strong>\[TEST\] Brin Tallow<\/strong>[\s\S]*data-action="shop-merchant-clear"/);assert.match(html,/data-merchant-drop/);
 gone=new Set(['Actor.brin']);
 html=(await render(gm,a=>{a.shopDraft=shopsMod.draftFrom(api.get(SHOP));a.shopSub='editor';a.shopEdTab='details';})).html;
 assert.match(html,/From an Actor that no longer exists \(\[TEST\] Brin Tallow\); the name and art stay as they are\./,'a deleted Actor never breaks the shop');
 assert.equal(trade.projectionOf(api.get(SHOP)).merchant.img,'custom.webp');gone=new Set();
 const ed={shopDraft:shopsMod.draftFrom(api.get(SHOP)),shopDirty:false};
 await as(gm,()=>shopsMod.handleShops(ed,'shop-merchant-clear',{dataset:{}},{render:async()=>{},root:{}}));
 assert.deepEqual(ed.shopDraft.merchant,{name:'',img:''});assert.equal(ed.shopDirty,true);
 await as(alice,()=>assert.rejects(()=>shopsMod.handleShops(ed,'shop-merchant-clear',{dataset:{}},{render:async()=>{},root:{}}),/GM only/));
});
test('coins everywhere: the party purse and the shop window strips use the shared boxes',async()=>{
 const w=await as(alice,()=>api.open(SHOP));w.mode='buy';const html=await as(alice,()=>w._renderHTML());
 // 0.26.0: one "Paying as" line with that character's coins as chips; the party purse and merchant's coins in a closed Coins fold.
 assert.match(html,/<div class="agu-shop-paying"><label class="ag-field ag-field--inline">Paying as<select id="agu-shop-actor-[^"]+" data-shop-actor>[\s\S]*?<\/select><\/label><span class="agu-shop-paying__coins">(<span class="agu-coin-chips">|No coins)/);
 assert.match(html,/Paying as[\s\S]*?<span class="agu-coin-chip agu-coin--gp" data-coin="gp"><span class="agu-coin__icon" aria-hidden="true">G<\/span><span>9 gp<\/span>/);
 assert.doesNotMatch(html,/data-ag-fold-key="shop-coins"/,'no party purse or merchant purse here: no Coins fold');
 assert.doesNotMatch(html,/data-coin="ep"/,'no electrum while it is off');
});
