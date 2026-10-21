// 0.18.0: presenting shops and buying. Player View journal (projection, page ownership per mode), every refusal, the
// party vote (approved, denied, timed out, re-check after the vote), all-or-nothing rollback at A, B and C, two buyers
// for the last one, a repeated requestId, a late GM answer, electrum off/on, and the player window markup.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, sockets or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,purchaseItemData,purchaseCount,presentedOwnership,quotePurchase,nothingCharged,purchaseText,projectShop,normalizeShop} from '../scripts/core.mjs';

// ---- Pure helpers ----
test('purchase data: fresh ids, a stack grows by quantity, a container comes once per purchase with its contents linked',()=>{
 let n=0;const rid=()=>`n${++n}`;
 const rope={lineId:'l1',item:{_id:'old',name:'Arrows',type:'consumable',system:{quantity:20,container:'bag9'}}};
 const d=purchaseItemData(rope,3,{randomId:rid});
 assert.equal(d.length,1);assert.deepEqual([d[0]._id,d[0].system.quantity,d[0].system.container],['n1',60,null]);
 assert.equal(rope.item._id,'old','the snapshot is not changed');assert.equal(purchaseCount(rope,3),60);
 const pack={lineId:'l2',item:{_id:'p',name:'Backpack',type:'container',system:{quantity:1}},contents:[{_id:'c1',name:'Pouch',type:'container',system:{container:'p'}},{_id:'c2',name:'Chalk',system:{container:'c1'}}]};
 const two=purchaseItemData(pack,2,{randomId:rid});
 assert.equal(two.length,6);assert.equal(purchaseCount(pack,2),2);
 const [b,pouch,chalk]=two;assert.equal(pouch.system.container,b._id);assert.equal(chalk.system.container,pouch._id);
 assert.notEqual(two[3]._id,b._id,'each purchase gets its own ids');
});
test('page ownership: Observer for those it is shown to; all players also covers later logins; None for everyone else',()=>{
 assert.deepEqual(presentedOwnership({mode:'all'},['a','b']),{default:2,a:2,b:2});
 assert.deepEqual(presentedOwnership({mode:'users',userIds:['b']},['a','b']),{default:0,a:0,b:2});
 assert.deepEqual(presentedOwnership(null,['a']),{default:0,a:0});
});
test('quote from the player view: checks, change, exact payment, "can\'t make change", and refusals end "Nothing was charged."',()=>{
 const shop=normalizeShop({id:'SHOP-T',name:'T',rev:2,purse:{cp:0,sp:0,gp:0,pp:0},lines:[{lineId:'a',priceCp:150,priceCoin:'sp',stock:2,item:{name:'Rope',system:{}}},{lineId:'b',priceCp:5,stock:0,item:{name:'X',system:{}}}]});
 const view=projectShop(shop);
 assert.equal(quotePurchase({view,lineId:'a',quantity:1,rev:1,hold:{gp:9}}).reason,'The shop changed. Look again.');
 assert.equal(quotePurchase({view,lineId:'b',quantity:1,rev:2,hold:{gp:9}}).reason,'Sold out. Nothing was charged.');
 assert.equal(quotePurchase({view,lineId:'a',quantity:3,rev:2,hold:{gp:9}}).reason,'Only 2 left. Nothing was charged.');
 assert.equal(quotePurchase({view,lineId:'a',quantity:0,rev:2,hold:{gp:9}}).reason,'Choose a whole number of 1 or more.');
 assert.match(quotePurchase({view,lineId:'a',quantity:1,rev:2,hold:{gp:2}}).reason,/can't make change/,'empty merchant purse, no exact coins');
 assert.match(quotePurchase({view,lineId:'a',quantity:1,rev:2,hold:{gp:1}}).reason,/Not enough coins/);
 const ok=quotePurchase({view,lineId:'a',quantity:1,rev:2,hold:{sp:20}});
 assert.deepEqual([ok.ok,ok.exact,ok.pay.sp,ok.totalText],[true,true,15,'15 sp']);
 assert.equal(nothingCharged('Not enough coins'),'Not enough coins. Nothing was charged.');assert.equal(nothingCharged('Sold out. Nothing was charged.'),'Sold out. Nothing was charged.');
 assert.equal(purchaseText({count:2,name:'Rope',receiverName:'[TEST] Kestrel',plan:{pay:{gp:2},back:{sp:5}},payFrom:'actor'}),'2 Rope added to [TEST] Kestrel. Paid 2 gp, change 5 sp.');
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
const fail={create:false,drop:false,update:new Set(),updateOnce:new Set(),del:false};
function mkActor(id,name,{type='character',owners=[],coins={cp:0,sp:0,ep:0,gp:0,pp:0},flags={}}={}){
 const items=[];items.get=x=>items.find(i=>i.id===x);
 const a={id,name,type,documentName:'Actor',uuid:`Actor.${id}`,flags,items,system:{currency:{...coins}},ownership:Object.fromEntries(owners.map(o=>[o,3])),
  getFlag:(ns,k)=>flags?.[ns]?.[k],testUserPermission:(u,l)=>u.isGM||(owners.includes(u.id)&&LV[l]<=3),
  createEmbeddedDocuments:async(type,data)=>{if(fail.create)throw Error('create failed');for(const [i,d] of data.entries()){if(fail.drop&&i===data.length-1)continue;items.push({...structuredClone(d),id:d._id});}return data;},
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
const modules=new Map([[ID,{id:ID,active:true,version:'0.18.0'}]]);
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
async function playerBuy(user,req){
 sent.length=0;
 const p=as(user,()=>api.buy(req));
 await new Promise(r=>setTimeout(r,0));
 const msg=sent.find(m=>m.type==='shop-buy');if(!msg)return p;
 let ok=false,message='';try{message=await as(gm,()=>trade.executeBuy(msg,user));ok=true;}catch(e){message=e.message;}
 await as(user,()=>socketFn({type:'receipt',requestId:msg.requestId,userId:user.id,ok,message}));
 return p;
}
let SHOP,ROPE,BAG,SECRET,ARROWS;
test('setup: a shop with a hidden line, GM notes, cost, a merchant purse; player API calls refused until shops are on',async()=>{
 const made=await api.create({name:'[TEST] The Copper Kettle',merchant:{name:'[TEST] Brin Tallow'},locationId:'LOC-TEST-MARKET',gmNotes:'GM only text.',purse:{cp:10,sp:10,gp:5,pp:0},
  lines:[{lineId:'ln_rope',itemId:'ITEM-TEST-ROPE',itemUuid:'Item.rope',priceCp:100,priceCoin:'gp',stock:3,costCp:40,item:{_id:'rope0',name:'Rope, Hempen (50 ft)',type:'loot',img:'rope.webp',system:{quantity:1,price:{value:1,denomination:'gp'}}}},
   {lineId:'ln_secret',priceCp:2500,hidden:true,item:{name:'[TEST] Sealed Crate',type:'loot',system:{}}},
   {lineId:'ln_bag',priceCp:200,priceCoin:'gp',item:{_id:'bag0',name:'Backpack',type:'container',system:{quantity:1}},contents:[{_id:'bed0',name:'Bedroll',type:'loot',system:{container:'bag0'}}]},
   {lineId:'ln_arrows',priceCp:100,priceCoin:'gp',stock:1,item:{_id:'ar0',name:'Arrows',type:'consumable',system:{quantity:20}}}]});
 SHOP=made.id;ROPE='ln_rope';BAG='ln_bag';SECRET='ln_secret';ARROWS='ln_arrows';
 await set('playerAccessEnabled',true);
 await as(alice,()=>assert.throws(()=>api.forMe(),/^Error: The GM has turned shops off\.$/));
 await as(alice,()=>assert.rejects(()=>api.buy({shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'actor'}),/The GM has turned shops off/));
 await set('shopsEnabled',true);await set('playerAccessEnabled',false);
 await as(alice,()=>assert.throws(()=>api.forMe(),/^Error: Utilities is hidden for players\.$/));
 await set('playerAccessEnabled',true);
 for(const c of [()=>api.present(SHOP,{mode:'all'}),()=>api.stopShowing(SHOP),()=>api.presented()])await as(alice,()=>assert.rejects(async()=>c(),/^Error: GM only\.$/));
 assert.equal(viewJ(),undefined,'nothing is written for a refused call');
});
test('present to chosen players: the Player View page is Observer for them only, holds no GM data, and pings without naming the shop',async()=>{
 sent.length=0;
 await assert.rejects(()=>api.present(SHOP,{mode:'users',userIds:['nobody']}),/Choose at least one player/);
 const s=await api.present(SHOP,{mode:'users',userIds:['alice']});
 assert.deepEqual([s.presented.mode,s.presented.userIds,s.presented.by],['users',['alice'],'gm']);
 const j=viewJ();assert.equal(j.ownership.default,2);assert.equal(j.flags[ID].store,'shops-player');
 const p=viewPage(SHOP);assert.deepEqual(p.ownership,{default:0,alice:2,bob:0,cara:0});
 const text=p.flags[ID].shopView;
 for(const leak of ['GM only text','costCp','Sealed Crate','ITEM-TEST-ROPE','Item.rope','purseStart','presented','alice','LOC-TEST','"item"','rope0'])assert.equal(text.includes(leak),false,leak);
 assert.deepEqual(JSON.parse(text).purse,{cp:10,sp:10,gp:5,pp:0},'merchant coins are shown by default');
 assert.deepEqual(sent.find(m=>m.type==='shop-presented'),{type:'shop-presented',to:['alice']});
 assert.equal(JSON.stringify(sent).includes(SHOP),false,'the ping never names the shop');
 assert.deepEqual(api.presented(),[{id:SHOP,name:'[TEST] The Copper Kettle',presented:s.presented}]);
 await as(alice,()=>assert.deepEqual(api.forMe().map(v=>v.id),[SHOP]));
 await as(bob,()=>assert.deepEqual(api.forMe(),[],'a second player does not see it'));
 const gmPage=journals.find(j=>j.flags?.[ID]?.store==='shops-gm');assert.equal(gmPage.ownership.default,0,'players never read the GM Data journal');
});
test('the projection follows the shop: hidden merchant coins, a revealed place, electrum; all players covers later logins',async()=>{
 await api.save({...gmRecord(SHOP),showPurse:false});await trade.syncPlayerView();
 assert.equal(JSON.parse(viewPage(SHOP).flags[ID].shopView).purse,null);
 locs=[{id:'LOC-TEST-MARKET',name:'[TEST] Market Ward',revealed:true,published:{name:'[TEST] Market Ward'}}];await trade.syncPlayerView();
 assert.deepEqual(JSON.parse(viewPage(SHOP).flags[ID].shopView).location,{name:'[TEST] Market Ward'});
 await api.save({...gmRecord(SHOP),showPurse:true});
 await api.present(SHOP,{mode:'all'});
 assert.deepEqual(viewPage(SHOP).ownership,{default:2,alice:2,bob:2,cara:2});
 await as(bob,()=>assert.deepEqual(api.forMe().map(v=>v.id),[SHOP]));
 assert.equal(viewJ().pages.length,1,'one page per shop, updated in place');
});
test('quote: the plan the buyer sees; nothing changes',async()=>{
 const before=structuredClone(kestrel.system.currency),rev=gmRecord(SHOP).rev;
 const q=await as(alice,()=>api.quote({shopId:SHOP,lineId:ROPE,quantity:2,actorId:'kestrel',payFrom:'actor',rev}));
 assert.equal(q.ok,true);assert.equal(q.totalText,'2 gp');assert.equal(q.receiverName,'[TEST] Kestrel');assert.equal('ep' in q.pay,false,'no ep while electrum is off');
 assert.deepEqual(kestrel.system.currency,before);
 const hidden=await as(alice,()=>api.quote({shopId:SHOP,lineId:SECRET,quantity:1,actorId:'kestrel',payFrom:'actor',rev}));
 assert.equal(hidden.reason,'The shop changed. Look again.','a hidden line can not be bought');
 assert.equal((await as(alice,()=>api.quote({shopId:SHOP,lineId:ROPE,quantity:1,actorId:'wren',payFrom:'actor'}))).reason,'Choose a character you own to receive it.');
});
test('buy with own coins: the item arrives, one currency update, stock and merchant coins change, the sale is logged, not stash History',async()=>{
 const rev=gmRecord(SHOP).rev,history=game.settings.get(ID,'stashHistory').length;
 const msg=await playerBuy(alice,{shopId:SHOP,lineId:ROPE,quantity:2,actorId:'kestrel',payFrom:'actor',rev});
 assert.equal(msg,'2 Rope, Hempen (50 ft) added to [TEST] Kestrel. Paid 2 gp.');
 const got=kestrel.items.filter(i=>i.name==='Rope, Hempen (50 ft)');assert.equal(got.length,1);assert.equal(got[0].system.quantity,2);assert.notEqual(got[0]._id,'rope0');
 assert.deepEqual(kestrel.system.currency,{cp:0,sp:4,ep:3,gp:5,pp:0},'ep left alone while electrum is off');
 const s=gmRecord(SHOP);assert.equal(s.lines.find(l=>l.lineId===ROPE).stock,1);assert.deepEqual(s.purse,{cp:10,sp:10,gp:7,pp:0});assert.equal(s.rev,rev,'a purchase does not change rev');
 const log=api.log(SHOP).at(-1);assert.deepEqual([log.kind,log.payFrom,log.totalCp,log.userName,log.approval],['shop-purchase','actor',200,'Alice','not-required']);
 assert.equal(game.settings.get(ID,'stashHistory').length,history,'own-coin purchases stay out of stash History');
 assert.equal(JSON.parse(viewPage(SHOP).flags[ID].shopView).lines.find(l=>l.lineId===ROPE).stock,1,'the player view is rebuilt');
});
test('a container comes with its contents, linked to the new copy',async()=>{
 const msg=await playerBuy(alice,{shopId:SHOP,lineId:BAG,quantity:1,actorId:'kestrel',payFrom:'actor',rev:gmRecord(SHOP).rev});
 assert.match(msg,/^1 Backpack added to \[TEST\] Kestrel\./);
 const bag=kestrel.items.find(i=>i.name==='Backpack'),bed=kestrel.items.find(i=>i.name==='Bedroll');assert.equal(bed.system.container,bag.id);
});
test('refusals: not shown, wrong owner, unknown line, changed rev, bad quantity, too many, not enough coins; nothing changes',async()=>{
 const rev=gmRecord(SHOP).rev,coins=structuredClone(kestrel.system.currency),items=kestrel.items.length;
 const tryGM=(user,req)=>as(gm,()=>trade.executeBuy({requestId:`r${++idn}`,...req},user));
 const base={shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'actor',rev};
 await assert.rejects(()=>tryGM(alice,{...base,shopId:'SHOP-NOPE'}),/^Error: This shop is not open for you\. Nothing was charged\.$/);
 await assert.rejects(()=>tryGM(bob,{...base}),/Choose a character you own to receive it/);
 await assert.rejects(()=>tryGM(alice,{...base,payerId:'wren'}),/coins of a character you own/);
 await assert.rejects(()=>tryGM(alice,{...base,lineId:SECRET}),/The shop changed\. Look again\. Nothing was charged\./);
 await assert.rejects(()=>tryGM(alice,{...base,rev:rev+5}),/The shop changed/);
 await assert.rejects(()=>tryGM(alice,{...base,quantity:1.5}),/Choose a whole number/);
 await assert.rejects(()=>tryGM(alice,{...base,quantity:4}),/Only 1 left\. Nothing was charged\./);
 await assert.rejects(()=>tryGM(alice,{...base,lineId:BAG,quantity:9}),/Not enough coins.*Nothing was charged/);
 await set('shopsEnabled',false);await assert.rejects(()=>tryGM(alice,base),/The GM has turned shops off/);await set('shopsEnabled',true);
 await set('stashEnabled',false);await assert.rejects(()=>tryGM(alice,{...base,payFrom:'purse'}),/party stash off/);
 assert.deepEqual(kestrel.system.currency,coins);assert.equal(kestrel.items.length,items);
 await api.stopShowing(SHOP);await assert.rejects(()=>tryGM(alice,base),/This shop is not open for you/);
 await api.present(SHOP,{mode:'all'});
});
test('a repeated requestId is never carried out twice',async()=>{
 const req={requestId:'same-1',shopId:SHOP,lineId:BAG,quantity:1,actorId:'wren',payFrom:'actor',rev:gmRecord(SHOP).rev};
 await as(gm,()=>trade.executeBuy(req,bob));const gp=wren.system.currency.gp;
 await assert.rejects(()=>as(gm,()=>trade.executeBuy(req,bob)),/already handled/);
 assert.equal(wren.system.currency.gp,gp);
});
test('two buyers for the last one: handled in order, the second gets "Sold out. Nothing was charged."',async()=>{
 const rev=gmRecord(SHOP).rev,req=user=>({requestId:`x${++idn}`,shopId:SHOP,lineId:ARROWS,quantity:1,actorId:user===alice?'kestrel':'wren',payFrom:'actor',rev});
 const [a,b]=await Promise.allSettled([as(gm,()=>trade.executeBuy(req(alice),alice)),as(gm,()=>trade.executeBuy(req(bob),bob))]);
 assert.equal(a.status,'fulfilled');assert.match(a.value,/^20 Arrows added/);
 assert.equal(b.status,'rejected');assert.equal(b.reason.message,'Sold out. Nothing was charged.');
 assert.equal(wren.items.some(i=>i.name==='Arrows'),false);
});
test('rollback at A (items), B (coins) and C (shop page); a failed put-back is whispered to the GM to fix by hand',async()=>{
 const reqAt=()=>({requestId:`f${++idn}`,shopId:SHOP,lineId:BAG,quantity:1,actorId:'wren',payFrom:'actor',rev:gmRecord(SHOP).rev});
 const snap=()=>JSON.stringify([wren.system.currency,wren.items.map(i=>i.id),gmRecord(SHOP).purse,api.log(SHOP).length]);
 let before=snap();
 fail.create=true;await assert.rejects(()=>as(gm,()=>trade.executeBuy(reqAt(),bob)),/^Error: Could not add the item\. Nothing was charged\.$/);fail.create=false;
 assert.equal(snap(),before);
 fail.drop=true;await assert.rejects(()=>as(gm,()=>trade.executeBuy(reqAt(),bob)),/Could not add the item/);fail.drop=false;
 assert.equal(snap(),before,'a copy that did not arrive: the others are removed again');
 fail.updateOnce.add('wren');await assert.rejects(()=>as(gm,()=>trade.executeBuy(reqAt(),bob)),/^Error: Payment failed\. Nothing was charged and nothing was given\.$/);
 assert.equal(snap(),before);
 const gmJ=journals.find(j=>j.flags?.[ID]?.store==='shops-gm'),pg=gmJ.pages.find(p=>p.flags?.[ID]?.shop?.id===SHOP),orig=pg.update;
 pg.update=async()=>{throw Error('page write failed');};
 await assert.rejects(()=>as(gm,()=>trade.executeBuy(reqAt(),bob)),/Payment failed\. Nothing was charged and nothing was given/);
 assert.equal(snap(),before,'C failed: coins put back, copies deleted');
 chat.length=0;
 let calls=0;const realUpdate=wren.update;wren.update=async d=>{if(++calls===2)throw Error('put back failed');return realUpdate(d);};
 await assert.rejects(()=>as(gm,()=>trade.executeBuy(reqAt(),bob)),/could not be put back yet\. The GM has been told what to fix/);
 wren.update=realUpdate;pg.update=orig;
 assert.match(chat.at(-1).content,/fix by hand[\s\S]*Set \[TEST\] Wren&#39;s coins back to 18 gp \(they are now 16 gp\)/);assert.deepEqual(chat.at(-1).whisper,['gm']);
 wren.system.currency.gp=20;
});
test('the merchant can\'t make change: exact payment if possible, else refused with a GM whisper holding Top up shop purse',async()=>{
 await api.adjustPurse(SHOP,{op:'set',coin:'sp',amount:0});await api.adjustPurse(SHOP,{op:'set',coin:'cp',amount:0});await api.adjustPurse(SHOP,{op:'set',coin:'gp',amount:0});
 await api.restock(SHOP);
 const rev=gmRecord(SHOP).rev;kestrel.system.currency.pp=1;
 chat.length=0;
 const gpBefore=kestrel.system.currency.gp;
 const exact=await as(gm,()=>trade.executeBuy({requestId:`c${++idn}`,shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'actor',rev},alice));
 assert.match(exact,/Paid 1 gp\.$/,'pays exactly with gold rather than breaking the platinum');assert.equal(kestrel.system.currency.gp,gpBefore-1);
 kestrel.system.currency.gp=0;kestrel.system.currency.sp=0;
 await assert.rejects(()=>as(gm,()=>trade.executeBuy({requestId:`c${++idn}`,shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'actor',rev},alice)),/can't make change.*Nothing was charged/);
 await new Promise(r=>setTimeout(r,0));
 assert.match(chat.at(-1).content,/data-agu-shop-topup="SHOP-TEST-THE-COPPER-KETTLE"/);assert.deepEqual(chat.at(-1).whisper,['gm']);
 assert.equal(kestrel.system.currency.pp,1);
 kestrel.system.currency={cp:0,sp:4,ep:3,gp:7,pp:0};
 await api.setPurse(SHOP,null);
 // In Foundry the page update hook rebuilds the player view; the mock journal fires no hooks, so rebuild here.
 await trade.syncPlayerView();
});
test('party purse: vote off pays at once and logs stash History; vote on asks the party (approved, denied, timed out, re-checked after the vote)',async()=>{
 await set('stashEnabled',true);await set('shopPurseVote','off');await restocked();
 const rev=()=>gmRecord(SHOP).rev,req=()=>({shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'purse',rev:rev()});
 const msg=await playerBuy(alice,req());
 assert.equal(msg,'1 Rope, Hempen (50 ft) added to [TEST] Kestrel. Paid 1 gp from the party purse.');
 assert.equal(stash.system.currency.gp,49);
 const h=game.settings.get(ID,'stashHistory').at(-1);assert.deepEqual([h.kind,h.payFrom,h.approval,h.totalCp],['shop-purchase','purse','not-required',100]);
 // Vote on: the poll goes to the other connected player; Bob accepts.
 await set('shopPurseVote','on');sent.length=0;
 const p=as(gm,()=>trade.executeBuy({requestId:`v${++idn}`,...req()},alice));
 await new Promise(r=>setTimeout(r,0));
 const ask=sent.find(m=>m.type==='stash-vote-request');assert.deepEqual(ask.voters,['bob']);assert.equal(ask.purpose,'shop');assert.equal(ask.total,'1 gp');
 await as(gm,()=>socketFn({type:'stash-vote',pollId:ask.pollId,userId:'bob',vote:'accept'},'bob'));
 assert.match(await p,/from the party purse/);assert.equal(game.settings.get(ID,'stashHistory').at(-1).approval,'accepted');
 // Bob denies: nothing changes, the attempt is logged.
 await restocked();sent.length=0;const gp=stash.system.currency.gp;
 const d=as(gm,()=>trade.executeBuy({requestId:`v${++idn}`,...req()},alice));await new Promise(r=>setTimeout(r,0));
 await as(gm,()=>socketFn({type:'stash-vote',pollId:sent.find(m=>m.type==='stash-vote-request').pollId,userId:'bob',vote:'deny'},'bob'));
 await assert.rejects(()=>d,/^Error: The party denied spending the purse on Rope, Hempen \(50 ft\)\. Nothing was charged\.$/);
 assert.equal(stash.system.currency.gp,gp);const den=game.settings.get(ID,'stashHistory').at(-1);assert.deepEqual([den.approval,den.moved],['denied',false]);
 // No answer in time (the poll's own timer is replaced here).
 trade.configureTrade({runConsent:async()=>'expired'});
 await assert.rejects(()=>as(gm,()=>trade.executeBuy({requestId:`v${++idn}`,...req()},alice)),/Not every player answered in time\. Nothing was charged\./);
 assert.equal(game.settings.get(ID,'stashHistory').at(-1).approval,'timed-out');
 // The shop sells out while the party decides: checked again after the vote.
 trade.configureTrade({runConsent:async()=>{const s=gmRecord(SHOP);await api.save({...s,lines:s.lines.map(l=>l.lineId===ROPE?{...l,stock:0}:l)});return 'approved';}});
 await assert.rejects(()=>as(gm,()=>trade.executeBuy({requestId:`v${++idn}`,...req()},alice)),/The shop changed|Sold out/);
 assert.equal(stash.system.currency.gp,gp);
 trade.configureTrade({runConsent:async()=>'approved'});
 await api.restock(SHOP);await trade.syncPlayerView();
 // The GM is never asked.
 sent.length=0;await as(gm,()=>trade.executeBuy({requestId:`v${++idn}`,...req(),actorId:'wren'},gm));
 assert.equal(sent.some(m=>m.type==='stash-vote-request'),false);assert.equal(game.settings.get(ID,'stashHistory').at(-1).approval,'gm');
 await set('shopPurseVote','off');
});
test('a late GM answer still whispers the buyer the real result',async()=>{
 chat.length=0;await restocked();
 trade.configureTrade({runConsent:async()=>{await new Promise(r=>setTimeout(r,30));return 'approved';}});
 await set('shopPurseVote','on');
 await as(gm,()=>trade.executeBuy({requestId:`late${++idn}`,shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'purse',rev:gmRecord(SHOP).rev,timeoutMs:1},alice));
 await new Promise(r=>setTimeout(r,0));
 assert.match(chat.at(-1).content,/Your purchase at \[TEST\] The Copper Kettle went through: 1 Rope/);assert.deepEqual(chat.at(-1).whisper,['alice','gm']);
 await set('shopPurseVote','off');
});
test('electrum: off, ep is never shown or spent; on, ep can pay',async()=>{
 kestrel.system.currency={cp:0,sp:0,ep:4,gp:0,pp:0};await restocked();
 const req={shopId:SHOP,lineId:ROPE,quantity:1,actorId:'kestrel',payFrom:'actor',rev:gmRecord(SHOP).rev};
 assert.match((await as(alice,()=>api.quote(req))).reason,/Not enough coins/);
 assert.equal(JSON.stringify(JSON.parse(viewPage(SHOP).flags[ID].shopView)).includes('"ep"'),false);
 await set('electrumEnabled',true);
 const msg=await as(gm,()=>trade.executeBuy({requestId:`e${++idn}`,...req},alice));
 assert.match(msg,/Paid 2 ep/);assert.equal(kestrel.system.currency.ep,2);
 await set('electrumEnabled',false);kestrel.system.currency={cp:0,sp:4,ep:3,gp:7,pp:0};
});
test('stop showing removes the page; the shop window says it is closed',async()=>{
 await restocked();const w=await as(alice,()=>api.open(SHOP));
 const html=await as(alice,()=>w._renderHTML());
 assert.match(html,/<span class="ag-badge ag-badge--ok"><i class="fa-solid fa-door-open" aria-hidden="true"><\/i> Open for you<\/span>/);
 assert.match(html,/<h3 class="ag-eyebrow">Party purse<\/h3>/);assert.match(html,/<ul class="ag-rows agu-wares">/);
 assert.match(html,/data-action="shop-buy" data-shop="SHOP-TEST-THE-COPPER-KETTLE" data-line-id="ln_rope" aria-label="Buy Rope, Hempen \(50 ft\)"/);
 assert.doesNotMatch(html,/title=|Sealed Crate|GM only text|<option value="ep"/);
 await api.stopShowing(SHOP);
 assert.equal(viewPage(SHOP),undefined);
 await as(alice,()=>assert.deepEqual(api.forMe(),[]));
 assert.match(await as(alice,()=>w._renderHTML()),/This shop is closed now/);
 await as(alice,()=>assert.rejects(()=>api.open(SHOP),/This shop is not open for you/));
});

// ---- Markup: GM Setup, tabs, rows ----
const render=async(user,tab,setup=()=>{})=>as(user,async()=>{const app=await game.modules.get(ID).api.open();app.tab=tab;setup(app);return app._renderHTML();});
test('GM Setup → Shopping: two settings, saved with the footer; the Shops tab shows for players only while both switches are on',async()=>{
 const setup=await render(gm,'setup');
 assert.match(setup,/<h3>Shopping<\/h3>[\s\S]*id="agu-shops-enabled" type="checkbox" data-setup-field checked>Shops on for players[\s\S]*id="agu-shop-vote" type="checkbox" data-setup-field >Party must accept when a player spends the party purse/);
 assert.match(await render(alice,'shops'),/data-tab="shops" aria-selected="true" class="active"><i class="fa-solid fa-store" aria-hidden="true"><\/i>Shops/);
 assert.match(await render(alice,'shops'),/No shops open for you/);
 await set('shopsEnabled',false);
 const off=await render(alice,'shops');assert.doesNotMatch(off,/data-tab="shops"/);assert.match(off,/data-tab="rolls" aria-selected="true"/,'falls back to Rolls');
 await set('shopsEnabled',true);
});
test('GM list rows: Present… on a hidden shop; Shown badge, Open and Stop showing on a presented one',async()=>{
 let html=await render(gm,'shops');
 assert.match(html,/data-action="shop-present" data-shop="SHOP-TEST-THE-COPPER-KETTLE"/);
 await api.present(SHOP,{mode:'users',userIds:['alice','bob']});
 html=await render(gm,'shops');
 assert.match(html,/<span class="ag-badge ag-badge--ok"><i class="fa-solid fa-eye" aria-hidden="true"><\/i> Shown to 2 players<\/span>/);
 assert.match(html,/data-action="shop-view"[\s\S]*data-action="shop-stop"/);
 const player=await render(alice,'shops');
 assert.match(player,/<h3 class="ag-eyebrow">Open shops · 1<\/h3>[\s\S]*data-action="shop-view" data-shop="SHOP-TEST-THE-COPPER-KETTLE"/);
 assert.doesNotMatch(player,/shop-present|shop-stop|shop-edit|GM only text/);
 await assert.rejects(()=>as(alice,()=>trade.handleTrade({}, 'shop-stop',{dataset:{shop:SHOP}},{render:async()=>{}})),/GM only/);
 await api.stopShowing(SHOP);
});
test('Buy dialog: how many / goes to / pay with, then the plan with Confirm purchase; a refusal offers Change purchase',async()=>{
 await api.present(SHOP,{mode:'all'});await restocked();
 const seen=[];let asks=0;
 foundry.applications.api.DialogV2={wait:async o=>{seen.push([o.window.title,o.content]);const ok=o.buttons.at(-1);
  if(o.window.title==='Buy Rope, Hempen (50 ft)')return ok.callback(null,{form:{elements:[{name:'quantity',value:++asks===1?'9':'2'},{name:'actorId',value:'kestrel'},{name:'pay',value:'actor:kestrel'}]}});
  return ok.callback();}};
 try{
  const msg=await trade.buyDialog(SHOP,ROPE,{actorId:'kestrel'});
  assert.equal(msg,'2 Rope, Hempen (50 ft) added to [TEST] Kestrel. Paid 2 gp.');
  assert.deepEqual(seen.map(s=>s[0]),['Buy Rope, Hempen (50 ft)','Can\'t buy this','Buy Rope, Hempen (50 ft)','Buy Rope, Hempen (50 ft)?']);
  assert.match(seen[1][1],/<p class="ag-notice ag-notice--danger" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"><\/i><span>Only 3 left\. Nothing was charged\.<\/span><\/p>/);
  assert.match(seen[3][1],/<dl class="ag-kv"><dt>Buying<\/dt><dd>2 Rope, Hempen \(50 ft\)<\/dd><dt>Goes to<\/dt><dd>\[TEST\] Kestrel<\/dd><dt>Total<\/dt><dd>2 gp<\/dd><dt>You pay<\/dt><dd>2 gp<\/dd>/);
  assert.match(seen[0][1],/Party purse/,'the purse is offered while the stash is on');
 }finally{delete foundry.applications.api.DialogV2;}
});
test('the GM client rebuilds the player view when a shop page changes (hook, after a short wait)',async()=>{
 const gmJ=journals.find(j=>j.flags?.[ID]?.store==='shops-gm'),pg=gmJ.pages.find(p=>p.flags?.[ID]?.shop?.id===SHOP);
 pg.flags[ID].shop={...pg.flags[ID].shop,flavour:'Freshly swept.'};
 Hooks.callAll('updateJournalEntryPage',pg);
 await new Promise(r=>setTimeout(r,400));
 assert.equal(JSON.parse(viewPage(SHOP).flags[ID].shopView).flavour,'Freshly swept.');
 await api.stopShowing(SHOP);
});
