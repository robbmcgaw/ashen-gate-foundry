// 0.19.0: selling to a shop (design §7c S1–S9). The sell view rows, the quote, every refusal (S1, S2, S7 container /
// equipped / attuned, S8, Not for sale), price rounding and percent, stacks sold in part, can't afford / can't pay exactly
// (GM whisper with Top up), unlimited money, ep never paid while off, stock raised vs a new hidden line, rollback at B and
// C, a repeated request, party purse sales in History, the projection still hiding sold-in lines, the window and editor.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, sockets, drag-and-drop or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,sellRows,quoteSale,saleText,projectShop,normalizeShop,heldQuantity} from '../scripts/core.mjs';

// ---- Pure helpers ----
const it=(name,type,price,sys={},extra={})=>({_id:name.replace(/\W+/g,'').toLowerCase(),name,type,img:'',system:{quantity:1,price,...sys},...extra});
test('projection: buys only while on, with the percent, the types and whether the merchant\'s coins are shown; sold-in hidden lines never leak',()=>{
 const base={id:'SHOP-T',name:'T',lines:[{lineId:'a',priceCp:100,item:{name:'Rope',system:{}}},{lineId:'b',priceCp:5,hidden:true,soldIn:true,item:{name:'[TEST] Sold Dagger',system:{}}}]};
 assert.equal(projectShop(normalizeShop(base)).buys,null);
 const on=projectShop(normalizeShop({...base,buys:{enabled:true,percent:40,types:['loot','weapon']}}));
 assert.deepEqual(on.buys,{percent:40,types:['weapon','loot'],purse:'none'});
 assert.equal(JSON.stringify(on).includes('Sold Dagger'),false);assert.equal(JSON.stringify(on).includes('soldIn'),false);
 assert.equal(projectShop(normalizeShop({...base,buys:{enabled:true},purse:{gp:1}})).buys.purse,'shown');
 assert.equal(projectShop(normalizeShop({...base,buys:{enabled:true},purse:{gp:1},showPurse:false})).buys.purse,'hidden');
 assert.equal(normalizeShop(base).lines[1].soldIn,true,'soldIn is kept');assert.equal('soldIn' in normalizeShop(base).lines[0],false);
});
test('sell rows: physical items and containers only, sellable first with "Shop pays … each", refused ones with the reason',()=>{
 const view={id:'SHOP-T',rev:0,buys:{percent:50,types:['weapon','equipment','consumable','tool','loot'],purse:'none'}};
 const rows=sellRows(view,[it('[TEST] Dagger','weapon',{value:2,denomination:'gp'}),it('[TEST] Backpack','container',{value:2,denomination:'gp'}),
  it('[TEST] Sword','weapon',{value:15,denomination:'gp'},{equipped:true}),it('[TEST] Ring','equipment',{value:50,denomination:'gp'},{attuned:true}),
  it('[TEST] Heirloom','loot',{value:9,denomination:'gp'},{},{flags:{[ID]:{noSale:true}}}),it('[TEST] Arrow','consumable',{value:1,denomination:'cp'},{quantity:20}),
  it('[TEST] Pebble','loot',{value:0,denomination:'gp'}),it('Second Wind','feat',{value:0}),it('Fire Bolt','spell',{})]);
 assert.deepEqual(rows.map(r=>[r.name,r.ok,r.ok?r.priceText:r.reason]),[
  ['[TEST] Arrow',true,'Shop pays 1 sp for all 20'],['[TEST] Dagger',true,'Shop pays 1 gp each'],
  ['[TEST] Backpack',false,"Containers can't be sold. Empty it and sell the items separately."],['[TEST] Heirloom',false,"That item can't be sold."],
  ['[TEST] Pebble',false,'That item has no value to this shop.'],['[TEST] Ring',false,'Unequip it first.'],['[TEST] Sword',false,'Unequip it first.']]);
 const narrowed=sellRows({...view,buys:{...view.buys,types:['weapon']}},[it('[TEST] Gem','loot',{value:5,denomination:'gp'})]);
 assert.equal(narrowed[0].reason,"This shop doesn't buy that kind of item.");
 assert.equal(heldQuantity({system:{}}),1);
});
test('quote: percent, rounding down to whole copper, stacks, before → after, shown / hidden / unlimited merchant coins',()=>{
 const view=(purse,mode)=>({id:'SHOP-T',rev:3,purse,buys:{percent:30,types:['weapon','loot','consumable'],purse:mode}});
 const arrow=it('[TEST] Arrow','consumable',{value:5,denomination:'cp'},{quantity:20});
 const q=quoteSale({view:view(null,'none'),item:arrow,quantity:7,rev:3,hold:{cp:1,sp:0,gp:2,pp:0}});
 assert.deepEqual([q.ok,q.valueCp,q.totalText,q.paidFrom],[true,10,'1 sp','unlimited'],'30 % × 5 cp × 7 = 10.5 → 10 cp');
 assert.deepEqual(q.pay,{pp:0,gp:0,sp:1,cp:0});assert.deepEqual(q.after,{cp:1,sp:1,gp:2,pp:0});
 assert.equal(quoteSale({view:view(null,'none'),item:arrow,quantity:21,rev:3,hold:{}}).reason,'Choose a whole number from 1 to 20.');
 assert.equal(quoteSale({view:view(null,'none'),item:arrow,quantity:1,rev:2,hold:{}}).reason,'The shop changed. Look again.');
 const dagger=it('[TEST] Dagger','weapon',{value:2,denomination:'gp'});
 assert.equal(quoteSale({view:{...view({gp:0,sp:5},'shown'),buys:{percent:50,types:['weapon'],purse:'shown'}},item:dagger,quantity:1,rev:3,hold:{}}).reason,"Sorry, the vendor can't afford that (1 gp).");
 const hidden=quoteSale({view:{...view(null,'hidden'),buys:{percent:50,types:['weapon'],purse:'hidden'}},item:dagger,quantity:1,rev:3,hold:{gp:0}});
 assert.deepEqual([hidden.ok,hidden.paidFrom,hidden.shopAfter],[true,'purse',null],'hidden coins: the GM client decides');
 assert.equal(quoteSale({view:{...view(null,'none'),buys:null},item:dagger,quantity:1,hold:{}}).reason,"This shop doesn't buy items.");
 assert.equal(saleText({quantity:3,name:'[TEST] Arrow',shopName:'[TEST] Kettle',totalText:'7 cp',payTo:'actor',receiverName:'[TEST] Kestrel'}),'Sold 3 [TEST] Arrow to [TEST] Kettle for 7 cp, paid to [TEST] Kestrel.');
 assert.equal(saleText({quantity:1,name:'[TEST] Dagger',shopName:'K',totalText:'1 gp',payTo:'purse'}),'Sold [TEST] Dagger to K for 1 gp, paid to the party purse.');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map()};const settings=new Map();const hooks=new Map();
globalThis.HTMLElement=class {};
let idn=0;
globalThis.foundry={utils:{randomID:()=>`id${++idn}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true},cara={id:'cara',name:'Cara',isGM:false,active:false};
const users=[gm,alice,bob,cara];users.get=id=>users.find(u=>u.id===id);
const level=(doc,user)=>user.isGM?3:(doc.ownership?.[user.id]??doc.ownership?.default??0);
const LV={NONE:0,LIMITED:1,OBSERVER:2,OWNER:3};
// Journals: pages with ownership, embedded create/update/delete.
const journals=[];
function mkPage(data,j){const page={...structuredClone(data),id:data._id??`pg${++idn}`,parent:j,testUserPermission:(u,l)=>level(page,u)>=LV[l],
 update:async d=>{Object.assign(page,structuredClone(d));},delete:async()=>{j.pages.splice(j.pages.indexOf(page),1);}};return page;}
globalThis.JournalEntry={create:async d=>{const j={...structuredClone(d),id:`j${++idn}`,pages:[],
 createEmbeddedDocuments:async(type,list)=>{for(const p of list)j.pages.push(mkPage(p,j));},
 updateEmbeddedDocuments:async(type,list)=>{for(const u of list){const p=j.pages.find(x=>x.id===u._id);for(const [k,v] of Object.entries(u)){if(k==='_id')continue;if(k.startsWith('flags.')){const path=k.split('.');let o=p;for(const s of path.slice(0,-1))o=o[s]??={};o[path.at(-1)]=v;}else p[k]=structuredClone(v);}}},
 deleteEmbeddedDocuments:async(type,ids)=>{j.pages=j.pages.filter(p=>!ids.includes(p.id));}};journals.push(j);return j;}};
// Actors: coins, items, failure switches.
const fail={create:false,drop:false,update:new Set(),updateOnce:new Set(),del:false,itemUpdate:false};
function mkActor(id,name,{type='character',owners=[],coins={cp:0,sp:0,ep:0,gp:0,pp:0},flags={}}={}){
 const items=[];items.get=x=>items.find(i=>i.id===x);
 const a={id,name,type,documentName:'Actor',uuid:`Actor.${id}`,flags,items,system:{currency:{...coins}},ownership:Object.fromEntries(owners.map(o=>[o,3])),
  getFlag:(ns,k)=>flags?.[ns]?.[k],testUserPermission:(u,l)=>u.isGM||(owners.includes(u.id)&&LV[l]<=3),
  createEmbeddedDocuments:async(type,data)=>{if(fail.create)throw Error('create failed');for(const [i,d] of data.entries()){if(fail.drop&&i===data.length-1)continue;items.push({...structuredClone(d),id:d._id});}return data;},
  updateEmbeddedDocuments:async(type,list)=>{if(fail.itemUpdate)throw Error('item update failed');for(const u of list){const it=items.get(u._id);if(u['system.quantity']!==undefined)it.system.quantity=u['system.quantity'];}},
  deleteEmbeddedDocuments:async(type,ids)=>{if(fail.del)throw Error('delete failed');for(const x of ids){const i=items.findIndex(it=>it.id===x);if(i>=0)items.splice(i,1);}},
  update:async d=>{if(fail.update.has(id)||fail.updateOnce.has(id)){fail.updateOnce.delete(id);throw Error('update failed');}for(const [k,v] of Object.entries(d)){const c=k.match(/^system\.currency\.(\w+)$/);if(c)a.system.currency[c[1]]=v;else if(k==='ownership.default')a.ownership.default=v;}}};
 return a;
}
const kestrel=mkActor('kestrel','[TEST] Kestrel',{owners:['alice'],coins:{cp:0,sp:4,ep:3,gp:7,pp:0}});
const wren=mkActor('wren','[TEST] Wren',{owners:['bob'],coins:{cp:0,sp:0,ep:0,gp:20,pp:0}});
const stash=mkActor('stash','Ashen Gate | Party Stash',{type:'npc',coins:{cp:0,sp:0,ep:0,gp:50,pp:0},flags:{[ID]:{partyStash:true}}});
const actors=[kestrel,wren,stash];actors.get=id=>actors.find(a=>a.id===id);
const chat=[];globalThis.ChatMessage={create:async d=>{chat.push(d);return d;},getSpeaker:()=>({})};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}};
globalThis.fromUuid=async()=>null;
const modules=new Map([[ID,{id:ID,active:true,version:'0.19.0'}]]);
let locs=[{id:'LOC-TEST-MARKET',name:'[TEST] Market Ward',revealed:false,published:null}];
modules.set('ashen-gate-locations',{active:true,api:{listLocations:({revealedOnly}={})=>locs.filter(l=>!revealedOnly||l.revealed)}});
const sent=[];let socketFn=null;
globalThis.game={user:gm,users,actors,journal:journals,items:[],time:{worldTime:0},modules,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(name,msg)=>sent.push(msg),on:(name,fn)=>{socketFn=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',consumable:'Consumable'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!hooks.has(k))hooks.set(k,[]);hooks.get(k).push(fn);},off:()=>{},callAll:(k,...a)=>(hooks.get(k)??[]).forEach(f=>f(...a))};
await import('../scripts/main.mjs');
const trade=await import('../scripts/shop-buy.mjs');
const sale=await import('../scripts/shop-sell.mjs');
const shopsMod=await import('../scripts/shops.mjs');
let lastMsg=null;
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.shops;
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const set=(k,v)=>game.settings.set(ID,k,v);
const gmRecord=id=>api.get(id);
const viewJ=()=>journals.find(j=>j.flags?.[ID]?.store==='shops-player');
/** Stock back to the start and the player view rebuilt (in Foundry the page update hook rebuilds it). */
const restocked=async()=>{await api.restock(SHOP);await trade.syncPlayerView();};
const viewPage=id=>viewJ()?.pages.find(p=>p.flags?.[ID]?.shopId===id);
/** A player's purchase through the socket: the player asks, the GM client carries it out, the receipt comes back. */
async function playerSell(user,req){
 sent.length=0;
 const p=as(user,()=>api.sell(req));
 await new Promise(r=>setTimeout(r,0));
 const msg=sent.find(m=>m.type==='shop-sell');if(!msg)return p;
 lastMsg=msg;
 let ok=false,message='';try{message=await as(gm,()=>sale.executeSell(msg,user));ok=true;}catch(e){message=e.message;}
 await as(user,()=>socketFn({type:'receipt',requestId:msg.requestId,userId:user.id,ok,message}));
 return p;
}
let SHOP;
const give=(actor,list)=>{actor.items.length=0;for(const d of list)actor.items.push({...structuredClone(d),id:d._id});};
const stock=()=>[it('[TEST] Arrow','consumable',{value:5,denomination:'cp'},{quantity:20}),it('[TEST] Dagger','weapon',{value:2,denomination:'gp'}),
 it('[TEST] Backpack','container',{value:2,denomination:'gp'}),it('[TEST] Sword','weapon',{value:15,denomination:'gp'},{equipped:true}),
 it('[TEST] Ring','equipment',{value:50,denomination:'gp'},{attuned:true}),it('[TEST] Heirloom','loot',{value:9,denomination:'gp'},{},{flags:{[ID]:{noSale:true}}})];
const req=(o={})=>({shopId:SHOP,actorId:'kestrel',itemId:'testarrow',quantity:10,payTo:'actor',rev:gmRev(),...o});
function gmRev(){const was=game.user;game.user=gm;try{return api.get(SHOP).rev;}finally{game.user=was;}}
const page=()=>JSON.parse(viewPage(SHOP).flags[ID].shopView);
test('setup: a shown shop that buys at 50 % with a small merchant purse',async()=>{
 const made=await api.create({name:'[TEST] The Copper Kettle',merchant:{name:'[TEST] Brin Tallow'},purse:{cp:10,sp:5,gp:2,pp:0},buys:{enabled:true,percent:50,types:[]},
  lines:[{lineId:'ln_rope',priceCp:100,stock:3,item:{name:'Rope, Hempen (50 ft)',type:'loot',system:{quantity:1}}}]});
 SHOP=made.id;await set('playerAccessEnabled',true);await set('shopsEnabled',true);await set('stashEnabled',true);
 give(kestrel,stock());kestrel.system.currency={cp:0,sp:0,ep:3,gp:1,pp:0};
 await as(alice,()=>assert.equal(api.quoteSell(req()).reason,'This shop is not open for you.'));
 await api.present(SHOP,{mode:'all'});
 assert.deepEqual(page().buys,{percent:50,types:['weapon','equipment','consumable','tool','loot'],purse:'shown'});
});
test('every refusal: not buying, containers, equipped, attuned, Not for sale, someone else\'s character, the party stash; nothing changes',async()=>{
 const before=JSON.stringify([gmRecord(SHOP),kestrel.items,kestrel.system.currency]);
 const no=async(o,re,user=alice)=>{await as(user,()=>assert.equal(api.quoteSell(req(o)).reason,re));await assert.rejects(()=>as(gm,()=>sale.executeSell({requestId:`r${++idn}`,...req(o)},user)),e=>e.message===re);};
 await no({itemId:'testbackpack',quantity:1},"Containers can't be sold. Empty it and sell the items separately.");
 await no({itemId:'testsword',quantity:1},'Unequip it first.');
 await no({itemId:'testring',quantity:1},'Unequip it first.');
 await no({itemId:'testheirloom',quantity:1},"That item can't be sold.");
 await no({},'You can only sell items from a character you own.',bob);
 stash.items.push({_id:'st1',id:'st1',name:'[TEST] Stash Gem',type:'loot',system:{quantity:1,price:{value:5,denomination:'gp'}}});
 await no({actorId:'stash',itemId:'st1',quantity:1},'You can only sell items from a character you own.');stash.items.length=0;
 await no({quantity:0},'Choose a whole number from 1 to 20.');
 await no({rev:99},'The shop changed. Look again.');
 await api.save({...gmRecord(SHOP),buys:{enabled:false,percent:50,types:[]}});await trade.syncPlayerView();
 await as(alice,()=>assert.equal(api.quoteSell(req()).reason,"This shop doesn't buy items."));
 await assert.rejects(()=>as(gm,()=>sale.executeSell({requestId:`r${++idn}`,...req()},alice)),/This shop doesn't buy items\./);
 await api.save({...gmRecord(SHOP),buys:{enabled:true,percent:50,types:[]}});await trade.syncPlayerView();
 assert.equal(JSON.stringify([kestrel.items,kestrel.system.currency]),JSON.stringify(JSON.parse(before).slice(1)));
});
test('sell part of a stack: the merchant pays exactly, largest coins first; a new hidden line; the item is reduced last',async()=>{
 const q=await as(alice,()=>api.quoteSell(req()));
 assert.deepEqual([q.ok,q.valueCp,q.totalText,q.paidFrom,q.receiverName,q.itemName],[true,25,'2 sp 5 cp','purse','[TEST] Kestrel','[TEST] Arrow']);
 const msg=await playerSell(alice,req());
 assert.equal(msg,'Sold 10 [TEST] Arrow to [TEST] The Copper Kettle for 2 sp 5 cp, paid to [TEST] Kestrel.');
 assert.equal(kestrel.items.get('testarrow').system.quantity,10);
 assert.deepEqual(kestrel.system.currency,{cp:5,sp:2,ep:3,gp:1,pp:0},'ep untouched while electrum is off');
 const s=gmRecord(SHOP),line=s.lines.find(l=>l.item?.name==='[TEST] Arrow');
 assert.deepEqual(s.purse,{cp:5,sp:3,gp:2,pp:0});
 assert.deepEqual([line.hidden,line.soldIn,line.stock,line.priceCp,line.item.system.quantity,line.item.system.container],[true,true,10,5,1,null]);
 assert.equal(api.log(SHOP).at(-1).kind,'shop-sale');
 assert.equal(JSON.stringify(page()).includes('[TEST] Arrow'),false,'the player view still hides the sold-in line');
 await as(alice,()=>assert.equal((api.quoteSell(req({quantity:4}))).ok,true));
 assert.match(await playerSell(alice,req({quantity:4})),/Sold 4 \[TEST\] Arrow .* for 1 sp, paid to/);
 assert.equal(gmRecord(SHOP).lines.filter(l=>l.item?.name==='[TEST] Arrow').length,1);assert.equal(gmRecord(SHOP).lines.find(l=>l.soldIn).stock,14,'same item: stock raised');
});
test('the whole item: removed from the character; a repeated request is never carried out twice',async()=>{
 assert.match(await playerSell(alice,req({itemId:'testdagger',quantity:1})),/Sold \[TEST\] Dagger .* for 1 gp/);
 assert.equal(kestrel.items.get('testdagger'),undefined);
 await assert.rejects(()=>as(gm,()=>sale.executeSell(lastMsg,alice)),/already handled/);
});
test('can\'t afford / can\'t pay exactly: the player is told plainly (amount only when coins are shown), the GM gets Top up',async()=>{
 give(kestrel,stock());chat.length=0;
 await api.setPurse(SHOP,{cp:0,sp:5,gp:0,pp:0});await trade.syncPlayerView();
 await as(alice,()=>assert.equal(api.quoteSell(req({itemId:'testdagger',quantity:1})).reason,"Sorry, the vendor can't afford that (1 gp)."));
 await assert.rejects(()=>playerSell(alice,req({itemId:'testdagger',quantity:1})),/^Error: Sorry, the vendor can't afford that \(1 gp\)\.$/);
 await new Promise(r=>setTimeout(r,0));
 const w=chat.at(-1);assert.deepEqual(w.whisper,['gm']);assert.match(w.content,/data-agu-shop-topup="SHOP-TEST-THE-COPPER-KETTLE"/);assert.match(w.content,/holds less than 1 gp/);
 await api.setPurse(SHOP,{cp:0,sp:0,gp:3,pp:0});await api.save({...gmRecord(SHOP),showPurse:false});await trade.syncPlayerView();
 await as(alice,()=>assert.equal(api.quoteSell(req({quantity:3})).ok,true,'hidden coins: the quote cannot tell'));
 await assert.rejects(()=>playerSell(alice,req({quantity:3})),/^Error: Sorry, the vendor can't afford that\.$/,'7 cp from gold only: no exact payment, no amount named');
 await new Promise(r=>setTimeout(r,0));assert.match(chat.at(-1).content,/can&#39;t pay exactly 7 cp/);
 assert.equal(kestrel.items.get('testarrow').system.quantity,20);
});
test('unlimited money (no purse); coins into the party purse with a stash History line and no vote',async()=>{
 await api.save({...gmRecord(SHOP),showPurse:true});await api.setPurse(SHOP,null);await trade.syncPlayerView();
 assert.equal(page().buys.purse,'none');
 const sb=stash.system.currency.gp;
 assert.match(await playerSell(alice,req({itemId:'testdagger',quantity:1,payTo:'purse'})),/paid to the party purse\.$/);
 assert.equal(stash.system.currency.gp,sb+1);
 const h=game.settings.get(ID,'stashHistory').at(-1);assert.deepEqual([h.kind,h.payTo,h.totalCp,h.itemName],['shop-sale','purse',100,'[TEST] Dagger']);
 assert.equal(gmRecord(SHOP).purse,null);
});
test('rollback at B (paying fails) and at C (the item can\'t be taken): the shop page and coins go back, the item stays',async()=>{
 give(kestrel,stock());await api.setPurse(SHOP,{cp:50,sp:50,gp:50,pp:0});await trade.syncPlayerView();
 const snap=()=>JSON.stringify([kestrel.system.currency,kestrel.items.map(i=>[i.id,i.system.quantity]),gmRecord(SHOP).purse,gmRecord(SHOP).lines.map(l=>[l.lineId,l.stock]),api.log(SHOP).length]);
 const before=snap();
 fail.update.add('kestrel');
 await assert.rejects(()=>playerSell(alice,req({itemId:'testdagger',quantity:1})),/^Error: Payment failed\. Nothing was sold\.$/);
 fail.update.delete('kestrel');assert.equal(snap(),before,'B: all back');
 fail.del=true;
 await assert.rejects(()=>playerSell(alice,req({itemId:'testdagger',quantity:1})),/^Error: Could not take the item from \[TEST\] Kestrel\. Nothing was sold\.$/);
 fail.del=false;assert.equal(snap(),before,'C (whole item): coins taken back, shop back');
 fail.itemUpdate=true;
 await assert.rejects(()=>playerSell(alice,req({quantity:5})),/Could not take the item/);
 fail.itemUpdate=false;assert.equal(snap(),before,'C (part of a stack): all back');
});
test('electrum: ep is never paid while off; the merchant\'s ep is not counted',async()=>{
 await set('electrumEnabled',true);await api.setPurse(SHOP,{cp:0,sp:0,ep:4,gp:0,pp:0});await set('electrumEnabled',false);await trade.syncPlayerView();
 await assert.rejects(()=>playerSell(alice,req({quantity:4})),/can't afford/);
 assert.equal(kestrel.system.currency.ep,3);
});
test('player window: Buy / Sell switch, Coins go to, sellable rows and greyed rows with the reason, kit parts only',async()=>{
 await api.setPurse(SHOP,null);await trade.syncPlayerView();give(kestrel,stock());
 const w=await as(alice,()=>api.open(SHOP));w.mode='sell';
 const html=await as(alice,()=>w._renderHTML());
 assert.match(html,/<div class="ag-segmented agu-shop-mode" role="radiogroup" aria-label="Buy or sell"><button type="button" role="radio" data-shop-mode="buy" aria-checked="false">Buy<\/button><button type="button" role="radio" data-shop-mode="sell" aria-checked="true">Sell<\/button><\/div>/);
 assert.match(html,/Coins go to<\/span><div class="ag-segmented"[^>]*><button type="button" role="radio" data-sell-pay="actor" aria-checked="true">\[TEST\] Kestrel<\/button><button type="button" role="radio" data-sell-pay="purse" aria-checked="false">Party purse<\/button>/);
 const plain=html.replace(/<span class="agu-coin__icon"[^>]*>.<\/span>/g,'').replace(/<\/?span[^>]*>/g,'');
 assert.match(plain,/×20[\s\S]*Shop pays 2 cp each[\s\S]*data-action="shop-sell" data-shop="SHOP-TEST-THE-COPPER-KETTLE" data-item-id="testarrow" aria-label="Sell \[TEST\] Arrow"/);
 assert.match(html,/<li class="ag-card ag-card--compact agu-ware-card is-disabled" aria-disabled="true" data-sell-item="testbackpack">[\s\S]*×1 · Containers can&#39;t be sold\. Empty it and sell the items separately\./);
 assert.doesNotMatch(html,/title=|style=/);
 w.mode='buy';assert.match(await as(alice,()=>w._renderHTML()),/For sale · 1/);
});
test('GM editor: sold-in hidden lines show "Bought from players"; an open draft follows sales and purchases',async()=>{
 const rec=gmRecord(SHOP),d=shopsMod.draftFrom(rec);
 const app=await game.modules.get(ID).api.open();app.tab='shops';app.shopSub='editor';app.shopEdTab='items';app.shopDraft=d;
 const html=await app._renderHTML();
 assert.match(html,/<span class="ag-badge ag-badge--warn"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"><\/i> Bought from players<\/span>/);
 d.lines=d.lines.filter(l=>l.lineId!=='ln_rope');
 const extra={lineId:'ln_new',priceCp:5,priceCoin:'cp',hidden:true,soldIn:true,stock:2,item:{name:'[TEST] New',type:'loot',system:{quantity:1}}};
 const stored={...rec,lines:[...rec.lines.map(l=>l.soldIn?{...l,stock:99}:l),extra]};
 assert.equal(shopsMod.followRecord(d,stored),true);
 assert.deepEqual(d.lines.map(l=>l.lineId).includes('ln_rope'),false,'a line the GM removed stays removed');
 assert.equal(d.lines.at(-1).lineId,'ln_new');assert.equal(d.lines.find(l=>l.soldIn&&l.lineId!=='ln_new').stock,99);
 assert.equal('knownLineIds' in shopsMod.recordFrom(d),false);
 app.shopDraft=null;
});
