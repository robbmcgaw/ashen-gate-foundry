// 0.20.0: merchant lists, services and the Bank (brief 5). List visibility and Player View page ownership, read-only
// refusals in the API for buy / sell / use from a list, the service projection, an unknown service type kept and never
// shown, bank conversions both ways, the "multiple of" rule, the fee, electrum off, refusal when short, the party purse
// path with no poll, the History entry, a repeated request, and the markup of the GM and player views.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, sockets or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,bankQuote,bankText,normalizeMerchantList,projectMerchantList,entrySummary,projectService,normalizeService} from '../scripts/core.mjs';

// ---- Pure helpers ----
test('bank quote: both directions, the "multiple of" rule, the fee rounded up on top, ep off, short coins',()=>{
 const up=bankQuote({hold:{cp:245,gp:7},from:'cp',to:'gp',receive:2});
 assert.deepEqual([up.ok,up.give,up.fee,up.total,up.fromAfter,up.toAfter],[true,200,0,200,45,9]);
 const down=bankQuote({hold:{gp:3,sp:1},from:'gp',to:'sp',receive:20});
 assert.deepEqual([down.give,down.total,down.fromAfter,down.toAfter],[2,2,1,21]);
 assert.equal(bankQuote({hold:{gp:9},from:'gp',to:'sp',receive:25}).reason,'Ask for a multiple of 10 sp');
 const fee=bankQuote({hold:{sp:30},from:'sp',to:'gp',receive:2,feePercent:10});
 assert.deepEqual([fee.give,fee.fee,fee.total,fee.fromAfter],[20,2,22,8],'10 % of 20 sp is 2 sp, on top');
 assert.equal(bankQuote({hold:{sp:30},from:'sp',to:'gp',receive:1,feePercent:5}).fee,1,'0.5 sp rounds up to 1 sp');
 assert.equal(bankQuote({hold:{ep:4},from:'ep',to:'gp',receive:1}).reason,'Electrum is turned off in Utilities GM Setup.');
 assert.equal(bankQuote({hold:{ep:4},from:'ep',to:'gp',receive:1,electrum:true}).total,2,'2 ep = 1 gp while electrum is on');
 assert.match(bankQuote({hold:{cp:150},from:'cp',to:'gp',receive:2}).reason,/^Not enough copper: 150 cp held, 200 cp needed\.$/);
 assert.equal(bankQuote({hold:{cp:9},from:'cp',to:'cp',receive:1}).reason,'Choose two different coins.');
 assert.equal(bankText(fee,'[TEST] Kestrel'),'Changed 22 sp into 2 gp (fee 2 sp) for [TEST] Kestrel.');
});
test('merchant list record and projection: valid ids only, in order, unknown or missing entries left out, city only when given',()=>{
 const l=normalizeMerchantList({id:'MLIST-TEST-TOWN',name:' [TEST] Town ',shopIds:['SHOP-A','SVC-B','bad','SHOP-A','MLIST-X'],visible:'yes'});
 assert.deepEqual([l.name,l.shopIds,l.visible],['[TEST] Town',['SHOP-A','SVC-B'],false]);
 assert.throws(()=>normalizeMerchantList({id:'LIST-1',name:'x'}),/MLIST-/);assert.throws(()=>normalizeMerchantList({id:'MLIST-A',name:''}),/needs a name/);
 const views={'SHOP-A':{id:'SHOP-A',lines:[{},{},{}]},'SVC-B':{id:'SVC-B',kind:'service',service:{label:'Bank'}}};
 const v=projectMerchantList({...l,shopIds:['SVC-B','SHOP-GONE','SHOP-A']},{project:id=>views[id]??null});
 assert.deepEqual(v.entries.map(e=>e.id),['SVC-B','SHOP-A']);assert.equal('location' in v,false);
 assert.deepEqual(projectMerchantList(l,{locationName:'[TEST] Town'}).location,{name:'[TEST] Town'});
 assert.deepEqual([entrySummary(views['SHOP-A']),entrySummary(views['SVC-B'])],['3 items','Bank']);
 const unknown=normalizeService({id:'SVC-X',name:'X',service:{type:'tailor',settings:{cut:3}}});
 assert.deepEqual([unknown.known,unknown.service.settings],[false,{cut:3}],'an unknown type keeps its settings untouched');
 assert.equal(projectService(unknown),null,'an unknown type is never projected');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map()};const settings=new Map();const hooks=new Map();
globalThis.HTMLElement=class {};
let idn=0;
globalThis.foundry={utils:{randomID:()=>`id${++idn}`},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const level=(doc,user)=>user.isGM?3:(doc.ownership?.[user.id]??doc.ownership?.default??0);
const LV={NONE:0,LIMITED:1,OBSERVER:2,OWNER:3};
const journals=[];
function mkPage(data,j){const page={...structuredClone(data),id:data._id??`pg${++idn}`,parent:j,testUserPermission:(u,l)=>level(page,u)>=LV[l],
 update:async d=>{Object.assign(page,structuredClone(d));},delete:async()=>{j.pages.splice(j.pages.indexOf(page),1);}};return page;}
globalThis.JournalEntry={create:async d=>{const j={...structuredClone(d),id:`j${++idn}`,pages:[],
 createEmbeddedDocuments:async(type,list)=>{for(const p of list)j.pages.push(mkPage(p,j));},
 updateEmbeddedDocuments:async(type,list)=>{for(const u of list){const p=j.pages.find(x=>x.id===u._id);for(const [k,v] of Object.entries(u)){if(k==='_id')continue;if(k.startsWith('flags.')){const path=k.split('.');let o=p;for(const s of path.slice(0,-1))o=o[s]??={};o[path.at(-1)]=v;}else p[k]=structuredClone(v);}}},
 deleteEmbeddedDocuments:async(type,ids)=>{j.pages=j.pages.filter(p=>!ids.includes(p.id));}};journals.push(j);return j;}};
const fail={update:new Set()};const updates=[];
function mkActor(id,name,{type='character',owners=[],coins={cp:0,sp:0,ep:0,gp:0,pp:0},flags={}}={}){
 const items=[];items.get=x=>items.find(i=>i.id===x);
 const a={id,name,type,documentName:'Actor',uuid:`Actor.${id}`,flags,items,system:{currency:{...coins}},ownership:Object.fromEntries(owners.map(o=>[o,3])),
  getFlag:(ns,k)=>flags?.[ns]?.[k],testUserPermission:(u,l)=>u.isGM||(owners.includes(u.id)&&LV[l]<=3),
  createEmbeddedDocuments:async(type,data)=>{for(const d of data)items.push({...structuredClone(d),id:d._id});return data;},
  deleteEmbeddedDocuments:async(type,ids)=>{for(const x of ids){const i=items.findIndex(it=>it.id===x);if(i>=0)items.splice(i,1);}},
  updateEmbeddedDocuments:async()=>{},
  update:async d=>{if(fail.update.has(id))throw Error('update failed');updates.push({id,d:structuredClone(d)});for(const [k,v] of Object.entries(d)){const c=k.match(/^system\.currency\.(\w+)$/);if(c)a.system.currency[c[1]]=v;}}};
 return a;
}
const kestrel=mkActor('kestrel','[TEST] Kestrel',{owners:['alice'],coins:{cp:245,sp:4,ep:3,gp:7,pp:0}});
const wren=mkActor('wren','[TEST] Wren',{owners:['bob'],coins:{cp:0,sp:0,ep:0,gp:20,pp:0}});
const stash=mkActor('stash','Ashen Gate | Party Stash',{type:'npc',coins:{cp:500,sp:0,ep:0,gp:50,pp:0},flags:{[ID]:{partyStash:true}}});
kestrel.items.push({id:'dag',name:'[TEST] Dagger',type:'weapon',img:'',system:{quantity:1,price:{value:2,denomination:'gp'}},toObject(){return structuredClone({...this,toObject:undefined});}});
const actors=[kestrel,wren,stash];actors.get=id=>actors.find(a=>a.id===id);
const chat=[];globalThis.ChatMessage={create:async d=>{chat.push(d);return d;},getSpeaker:()=>({})};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}};
globalThis.fromUuid=async()=>null;
const modules=new Map([[ID,{id:ID,active:true,version:'0.20.0'}]]);
let locs=[{id:'LOC-TEST-TOWN',name:'[TEST] Testford',revealed:false,published:null}];
modules.set('ashen-gate-locations',{active:true,api:{listLocations:({revealedOnly}={})=>locs.filter(l=>!revealedOnly||l.revealed)}});
const sent=[];let socketFn=null;
globalThis.game={user:gm,users,actors,journal:journals,items:[],time:{worldTime:0},modules,tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(name,msg)=>sent.push(msg),on:(name,fn)=>{socketFn=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',weapon:'Weapon'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{if(!hooks.has(k))hooks.set(k,[]);hooks.get(k).push(fn);},off:()=>{},callAll:(k,...a)=>(hooks.get(k)??[]).forEach(f=>f(...a))};
await import('../scripts/main.mjs');
const trade=await import('../scripts/shop-buy.mjs');
const sellMod=await import('../scripts/shop-sell.mjs');
const svcMod=await import('../scripts/services.mjs');
const gmView=await import('../scripts/shops.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.shops;
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const set=(k,v)=>game.settings.set(ID,k,v);
const viewJ=()=>journals.find(j=>j.flags?.[ID]?.store==='shops-player');
const gmJ=()=>journals.find(j=>j.flags?.[ID]?.store==='shops-gm');
const listPage=id=>viewJ()?.pages.find(p=>p.flags?.[ID]?.listId===id);
const history=()=>game.settings.get(ID,'stashHistory');
/** A player's request through the socket: the player asks, the GM client carries it out, the receipt comes back. */
async function viaGM(user,call,type,exec){
 sent.length=0;
 const p=as(user,call);p.catch(()=>{});
 await new Promise(r=>setTimeout(r,0));
 const msg=sent.find(m=>m.type===type);if(!msg)return p;
 let ok=false,message='';try{message=await as(gm,()=>exec(msg,user));ok=true;}catch(e){message=e.message;}
 await as(user,()=>socketFn({type:'receipt',requestId:msg.requestId,userId:user.id,ok,message}));
 return p;
}
const use=(user,req)=>viaGM(user,()=>api.services.use(req),'service-use',svcMod.executeServiceUse);

let KETTLE,ANVIL,BANK,LIST;
test('setup: two shops, a Bank (fee 0 by default) and a merchant list (hidden by default); every list and service call is GM only',async()=>{
 KETTLE=(await api.create({name:'[TEST] Kettle',merchant:{name:'[TEST] Brin'},buys:{enabled:true},lines:[{lineId:'ln_rope',priceCp:100,priceCoin:'gp',item:{name:'Rope',type:'loot',system:{quantity:1}}},{lineId:'ln_gm',priceCp:5,hidden:true,item:{name:'[TEST] Secret Crate',system:{}}}]})).id;
 ANVIL=(await api.create({name:'[TEST] Anvil',gmNotes:'GM only text.',lines:[]})).id;
 const bank=await api.services.create({name:'[TEST] Counting House',merchant:{name:'[TEST] Clerk Ames'},locationId:'LOC-TEST-TOWN',flavour:'Brass scales.',gmNotes:'GM only bank note.',service:{type:'bank'}});
 BANK=bank.id;
 assert.deepEqual([BANK,bank.kind,bank.service,bank.presented,bank.known],['SVC-TEST-COUNTING-HOUSE','service',{type:'bank',settings:{feePercent:0}},null,true]);
 assert.equal(api.list().some(s=>s.id===BANK),false,'services are not shops');
 assert.deepEqual(api.services.types(),[{id:'bank',label:'Bank',defaults:{feePercent:0}}]);
 await assert.rejects(()=>api.services.create({name:'x',service:{type:'tailor'}}),/Unknown service type: tailor/);
 await assert.rejects(()=>api.services.save({...api.services.get(BANK),service:{type:'bank',settings:{feePercent:60}}}),/0 to 50/);
 const l=await api.merchants.save({name:'[TEST] Testford merchants',locationId:'LOC-TEST-TOWN',shopIds:[KETTLE,BANK,ANVIL]});LIST=l.id;
 assert.deepEqual([LIST,l.visible,l.shopIds],['MLIST-TEST-TESTFORD-MERCHANTS',false,[KETTLE,BANK,ANVIL]]);
 assert.equal(viewJ(),undefined,'a hidden list writes nothing for players');
 await set('playerAccessEnabled',true);await set('shopsEnabled',true);await set('stashEnabled',true);
 for(const c of [()=>api.merchants.list(),()=>api.merchants.save({name:'x'}),()=>api.merchants.setVisible(LIST,true),()=>api.merchants.delete(LIST,{confirm:true}),
  ()=>api.services.list(),()=>api.services.get(BANK),()=>api.services.create({name:'x'}),()=>api.services.save({id:BANK}),()=>api.services.delete(BANK,{confirm:true})])
  await as(alice,()=>assert.rejects(async()=>c(),/^Error: GM only\.$/));
 assert.equal(gmJ().ownership.default,0,'services and lists live in the GM-only journal');
});
test('show a list: one Player View page every player can read, holding projections only (no GM data, no hidden lines); hide removes it',async()=>{
 await api.merchants.setVisible(LIST,true);
 const p=listPage(LIST);assert.ok(p);assert.deepEqual(p.ownership,{default:2,alice:2,bob:2});
 const text=p.flags[ID].listView;
 for(const leak of ['GM only text','GM only bank note','Secret Crate','LOC-TEST','presented','costCp','retiredIds'])assert.equal(text.includes(leak),false,leak);
 const v=JSON.parse(text);assert.deepEqual(v.entries.map(e=>e.id),[KETTLE,BANK,ANVIL]);assert.equal('location' in v,false,'the city stays hidden until revealed');
 assert.deepEqual(v.entries[1].service,{type:'bank',label:'Bank',settings:{feePercent:0}});
 await as(alice,()=>assert.deepEqual(api.browse().map(l=>l.id),[LIST]));
 await as(alice,()=>assert.deepEqual(api.forMe(),[],'browsing is not presenting'));
 locs=[{id:'LOC-TEST-TOWN',name:'[TEST] Testford',revealed:true,published:{name:'[TEST] Testford'}}];await trade.syncPlayerView();
 assert.deepEqual(JSON.parse(listPage(LIST).flags[ID].listView).location,{name:'[TEST] Testford'});
 await api.merchants.setVisible(LIST,false);assert.equal(listPage(LIST),undefined);
 await as(alice,()=>assert.deepEqual(api.browse(),[]));
 await set('shopsEnabled',false);await as(alice,()=>assert.throws(()=>api.browse(),/The GM has turned shops off/));await set('shopsEnabled',true);
 await api.merchants.setVisible(LIST,true);
});
test('read only: buying, selling or using a service from a list is refused in the API and on the GM client; nothing changes',async()=>{
 const coins=structuredClone(kestrel.system.currency),n=kestrel.items.length;
 const rev=api.get(KETTLE).rev;
 await as(alice,()=>assert.equal(api.quote({shopId:KETTLE,lineId:'ln_rope',quantity:1,actorId:'kestrel',payFrom:'actor',rev}).reason,'This shop is not open for you.'));
 await as(alice,()=>assert.rejects(()=>api.buy({shopId:KETTLE,lineId:'ln_rope',quantity:1,actorId:'kestrel',payFrom:'actor',rev}),/This shop is not open for you/));
 await assert.rejects(()=>trade.executeBuy({requestId:'b1',shopId:KETTLE,lineId:'ln_rope',quantity:1,actorId:'kestrel',payFrom:'actor',rev},alice),/This shop is not open for you/);
 await as(alice,()=>assert.rejects(()=>api.sell({shopId:KETTLE,itemId:'dag',actorId:'kestrel',quantity:1,payTo:'actor',rev}),/This shop is not open for you/));
 await assert.rejects(()=>sellMod.executeSell({requestId:'s1',shopId:KETTLE,itemId:'dag',actorId:'kestrel',quantity:1,payTo:'actor',rev},alice),/This shop is not open for you/);
 const req={serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:1};
 await as(alice,()=>assert.equal(api.services.quote(req).reason,'This shop is not open for you.'));
 await as(alice,()=>assert.rejects(()=>api.services.use(req),/This shop is not open for you\. No coins changed\./));
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u1',...req},alice),/This shop is not open for you/);
 assert.deepEqual(kestrel.system.currency,coins);assert.equal(kestrel.items.length,n);
});
test('present the Bank to one player: the second player sees it only read only, and is refused on the GM client',async()=>{
 await api.present(BANK,{mode:'users',userIds:['alice']});
 const page=viewJ().pages.find(p=>p.flags?.[ID]?.shopId===BANK);assert.deepEqual(page.ownership,{default:0,alice:2,bob:0});
 assert.equal(page.flags[ID].shopView.includes('GM only bank note'),false);
 await as(alice,()=>assert.deepEqual(api.forMe().map(v=>[v.id,v.kind]),[[BANK,'service']]));
 await as(bob,()=>assert.deepEqual(api.forMe(),[]));
 await as(bob,()=>assert.equal(trade.browseViewOf(BANK)?.id,BANK,'bob can still look inside from the list'));
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u2',serviceId:BANK,payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10},bob),/This shop is not open for you/);
 assert.deepEqual(api.presented().map(p=>p.id),[BANK]);
});
test('bank: change 2 gp into silver, then copper into gold; one currency update each with both coins; History entries',async()=>{
 const rev=api.services.get(BANK).rev,before=history().length;updates.length=0;
 const q=await as(alice,()=>api.services.quote({serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:20,rev}));
 assert.deepEqual([q.ok,q.total,q.payerName],[true,2,'[TEST] Kestrel']);
 const msg=await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:20,rev});
 assert.equal(msg,'Changed 2 gp into 20 sp for [TEST] Kestrel.');
 assert.deepEqual(kestrel.system.currency,{cp:245,sp:24,ep:3,gp:5,pp:0},'ep left alone');
 assert.deepEqual(updates,[{id:'kestrel',d:{'system.currency.gp':5,'system.currency.sp':24}}],'one update with both coins');
 await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:2,rev});
 assert.deepEqual([kestrel.system.currency.cp,kestrel.system.currency.gp],[45,7]);
 const h=history().slice(before);assert.equal(h.length,2);
 assert.deepEqual([h[1].kind,h[1].payFrom,h[1].from,h[1].to,h[1].total,h[1].receive,h[1].fee,h[1].userName,h[1].serviceName],['bank-exchange','actor','cp','gp',200,2,0,'Alice','[TEST] Counting House']);
});
test('bank refusals: not enough coins, not a multiple, ep off, someone else\'s character, a changed service; nothing changes',async()=>{
 const rev=api.services.get(BANK).rev,coins=structuredClone(kestrel.system.currency);
 await as(alice,()=>assert.rejects(()=>use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:9,rev}),/^Error: Not enough copper: 45 cp held, 900 cp needed\. No coins changed\.$/));
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u3',serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:9,rev},alice),/Not enough copper/,'the GM client re-checks on fresh coins');
 await as(alice,()=>assert.equal(api.services.quote({serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:25,rev}).reason,'Ask for a multiple of 10 sp'));
 await as(alice,()=>assert.equal(api.services.quote({serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'ep',to:'sp',receive:5,rev}).reason,'Electrum is turned off in Utilities GM Setup.'));
 await as(alice,()=>assert.equal(api.services.quote({serviceId:BANK,payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10,rev}).reason,'You can only change the coins of a character you own.'));
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u4',serviceId:BANK,payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10,rev},alice),/character you own/);
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u5',serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10,rev:rev-1},alice),/The service changed\. Look again\./);
 fail.update.add('kestrel');
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u6',serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10,rev},alice),/^Error: The exchange failed\. No coins changed\.$/);
 fail.update.delete('kestrel');
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u6',serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10,rev},alice),/already handled/,'the same requestId is never carried out twice');
 assert.deepEqual(kestrel.system.currency,coins);
});
test('bank: party purse copper into gold with no poll, even with every vote on; logged for the party; a 10 % fee',async()=>{
 await set('purseVoteRequired','on');await set('shopPurseVote','on');sent.length=0;
 let rev=api.services.get(BANK).rev;const before=history().length;
 const msg=await use(alice,{serviceId:BANK,payFrom:'purse',from:'cp',to:'gp',receive:3,rev});
 assert.equal(msg,'Changed 300 cp into 3 gp for the party purse.');
 assert.equal(sent.some(m=>m.type==='stash-vote-request'),false,'no party vote (D13)');
 assert.deepEqual([stash.system.currency.cp,stash.system.currency.gp],[200,53]);
 const e=history().at(-1);assert.deepEqual([e.kind,e.payFrom,e.payerName],['bank-exchange','purse','Ashen Gate | Party Stash']);assert.equal(history().length,before+1);
 await api.services.save({...api.services.get(BANK),service:{type:'bank',settings:{feePercent:10}}});await trade.syncPlayerView();rev=api.services.get(BANK).rev;
 const q=await as(alice,()=>api.services.quote({serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'sp',to:'gp',receive:2,rev}));
 assert.deepEqual([q.give,q.fee,q.total],[20,2,22]);
 await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'sp',to:'gp',receive:2,rev});
 assert.deepEqual([kestrel.system.currency.sp,kestrel.system.currency.gp],[2,9]);
 assert.equal(history().at(-1).fee,2);
 await set('stashEnabled',false);
 await as(alice,()=>assert.equal(api.services.quote({serviceId:BANK,payFrom:'purse',from:'cp',to:'gp',receive:1,rev}).reason,'The party purse is not available.'));
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u7',serviceId:BANK,payFrom:'purse',from:'cp',to:'gp',receive:1,rev},alice),/party stash off/);
 await set('stashEnabled',true);await set('purseVoteRequired','off');await set('shopPurseVote','off');
});
test('History for players: their own and party purse exchanges; another player\'s own-coin exchange is left out',async()=>{
 const rev=api.services.get(BANK).rev;
 await api.present(BANK,{mode:'all'});
 await use(bob,{serviceId:BANK,payFrom:'actor',actorId:'wren',from:'gp',to:'pp',receive:1,rev});
 assert.equal(wren.system.currency.pp,1);assert.equal(wren.system.currency.gp,9,'1 pp costs 10 gp + 10 % fee (1 gp)');
 const forAlice=await as(alice,()=>game.modules.get(ID).api.stash.history()).then(l=>l.filter(h=>h.kind==='bank-exchange'));
 assert.equal(forAlice.some(h=>h.userId==='bob'),false);assert.equal(forAlice.some(h=>h.payFrom==='purse'),true);assert.equal(forAlice.some(h=>h.userId==='alice'&&h.payFrom==='actor'),true);
 const forBob=await as(bob,()=>game.modules.get(ID).api.stash.history()).then(l=>l.filter(h=>h.kind==='bank-exchange'));
 assert.equal(forBob.some(h=>h.userId==='alice'&&h.payFrom==='actor'),false);assert.equal(forBob.some(h=>h.userId==='bob'),true);
 await api.stopShowing(BANK);
});
test('an unknown service type is kept untouched, listed for the GM, never shown to players and never presented',async()=>{
 const j=gmJ();await j.createEmbeddedDocuments('JournalEntryPage',[{name:'[TEST] Tailor',type:'text',flags:{[ID]:{service:{schema:'ag-utilities-service/1',id:'SVC-TEST-TAILOR',kind:'service',name:'[TEST] Tailor',merchant:{name:'',img:''},service:{type:'tailor',settings:{cut:3}},presented:{mode:'all',userIds:[]},rev:0}}}}]);
 const s=api.services.get('SVC-TEST-TAILOR');assert.deepEqual([s.known,s.service],[false,{type:'tailor',settings:{cut:3}}]);
 await assert.rejects(()=>api.services.save({...s,name:'x'}),/Unknown service type: tailor/);
 await assert.rejects(()=>api.present('SVC-TEST-TAILOR',{mode:'all'}),/Unknown service type/);
 await api.merchants.save({...api.merchants.get(LIST),shopIds:[...api.merchants.get(LIST).shopIds,'SVC-TEST-TAILOR']});
 await trade.syncPlayerView();
 assert.equal(viewJ().pages.some(p=>p.flags?.[ID]?.shopId==='SVC-TEST-TAILOR'),false,'not presented even with a stored presented value');
 assert.equal(listPage(LIST).flags[ID].listView.includes('Tailor'),false,'left out of the list');
 await assert.rejects(()=>svcMod.executeServiceUse({requestId:'u8',serviceId:'SVC-TEST-TAILOR',payFrom:'actor',actorId:'kestrel',from:'cp',to:'sp',receive:1},alice),/This shop is not open for you/);
 assert.deepEqual(gmJ().pages.find(p=>p.flags?.[ID]?.service?.id==='SVC-TEST-TAILOR').flags[ID].service.service,{type:'tailor',settings:{cut:3}},'stored record untouched');
 const html=gmView.shopsView({shopSub:'list',shopSearch:'',shopSort:'name'});
 assert.match(html,/\[TEST\] Tailor[\s\S]*?Unknown service type/);
 await assert.rejects(()=>api.services.delete('SVC-TEST-TAILOR',{confirm:true}),/Stop showing/);
});
test('GM views: Shops list with New service and a Bank row; editor with type and fee; Merchant lists cards; kit parts, no title attributes',async()=>{
 const list=gmView.shopsView({shopSub:'list',shopSearch:'',shopSort:'name'});
 assert.match(list,/2 shops · 2 services/);assert.match(list,/data-action="shop-new-service"/);assert.match(list,/\[TEST\] Counting House[\s\S]*?Bank/);
 const app={shopSub:'editor',shopDraft:gmView.draftFrom(api.services.get(BANK)),shopStatus:''};
 const ed=gmView.shopsView(app);
 assert.match(ed,/data-shop-field="serviceType"/);assert.match(ed,/data-svc-setting="feePercent" value="10"/);assert.match(ed,/Delete service/);
 assert.equal(/data-line-field|Merchant's coins/.test(ed),false,'no item lines or coin purse for a service');
 assert.equal(gmView.recordFrom(app.shopDraft).service.settings.feePercent,10);
 const cards=gmView.shopsView({shopSub:'lists'});
 assert.match(cards,/class="ag-card-grid"/);assert.match(cards,/Shared with: <span class="ag-badge ag-badge--ok">[\s\S]*?Whole party/);assert.match(cards,/data-mlist-open="MLIST-TEST-TESTFORD-MERCHANTS" data-entry="/);assert.match(cards,/data-action="mlist-new"/);
 const foot=gmView.shopsFooter({shopSub:'lists',listDraft:{id:null,name:'',shopIds:[]}});assert.match(foot,/mlist-cancel[\s\S]*mlist-save/);
 for(const h of [list,ed,cards])assert.equal(/<button[^>]*\stitle=/.test(h),false);
});
test('player views: Merchant list sub-tab marks entries Open only when presented; a read-only window disables Buy; the Bank form and preview',async()=>{
 await api.present(BANK,{mode:'users',userIds:['alice']});
 const lists=await as(alice,()=>trade.playerShopsView({playerShopSub:'lists'}));
 assert.match(lists,/data-player-shop-sub="lists" aria-checked="true"/);assert.match(lists,/Look inside/);
 assert.match(lists,/\[TEST\] Counting House[\s\S]*?Bank[\s\S]*?ag-badge--ok[^>]*>[^<]*<i[^>]*><\/i> Open/);
 assert.equal((lists.match(/ Open<\/span>/g)??[]).length,1,'only the presented entry is marked Open');
 await api.merchants.setVisible(LIST,false);const empty=await as(bob,()=>trade.playerShopsView({playerShopSub:'lists'}));await api.merchants.setVisible(LIST,true);
 assert.match(empty,/Your GM hasn&#39;t shared a merchant list\./);
 const shopRO=await as(bob,()=>trade.shopViewHTML(trade.browseViewOf(KETTLE),{readOnly:true}));
 assert.match(shopRO,/Browsing only/);assert.match(shopRO,/Ask the GM to open this/);assert.match(shopRO,/data-action="shop-buy" disabled/);assert.equal(shopRO.includes('data-shop-mode'),false,'no Sell from a list');
 const bankRO=await as(bob,()=>trade.shopViewHTML(trade.browseViewOf(BANK),{readOnly:true}));
 assert.match(bankRO,/Ask the GM to open this/);assert.equal(bankRO.includes('bank-confirm'),false);
 const live=await as(alice,()=>trade.shopViewHTML(trade.viewOf(BANK),{actorId:'kestrel',bank:{payFrom:'actor',from:'cp',to:'sp',receive:'2'}}));
 assert.match(live,/class="ag-segmented"[\s\S]*?data-bank-whose="actor" aria-checked="true">\[TEST\] Kestrel[\s\S]*?data-bank-whose="purse"[^>]*>Party purse/);
 assert.match(live,/no vote needed/);// 0.24.0: amounts are coin chips; read without the chip markup.
 const plainLive=live.replace(/<span class="agu-coin__icon"[^>]*>.<\/span>/g,'').replace(/<\/?span[^>]*>/g,'');
 assert.match(plainLive,/<dt>You give<\/dt><dd>22 cp \(20 cp \+ 2 cp fee\)<\/dd>/);assert.match(plainLive,/45 cp → 23 cp, 2 sp → 4 sp/);
 assert.match(live,/class="agu-bank__coins"><div class="agu-coins"><div class="agu-coin agu-coin--cp" data-coin="cp" role="group" aria-label="Copper: 45">/,'the chosen coins as coin boxes');
 assert.match(live,/data-action="bank-confirm"/);assert.equal(/data-action="bank-confirm"[^>]*disabled/.test(live),false);
 assert.equal(/<option value="ep"/.test(live),false,'no electrum while it is off');
 const bad=await as(alice,()=>trade.shopViewHTML(trade.viewOf(BANK),{actorId:'kestrel',bank:{from:'gp',to:'sp',receive:'25'}}));
 assert.match(bad,/ag-notice ag-notice--danger[\s\S]*Ask for a multiple of 10 sp/);assert.match(bad,/data-action="bank-confirm" disabled/);
 await set('electrumEnabled',true);
 assert.match(await as(alice,()=>trade.shopViewHTML(trade.viewOf(BANK),{actorId:'kestrel'})),/<option value="ep"/);
 await set('electrumEnabled',false);
 for(const h of [lists,shopRO,bankRO,live])assert.equal(/<button[^>]*\stitle=/.test(h),false);
});
test('deleting: a list needs confirm and leaves its shops; a shown service can\'t be deleted; a deleted service is skipped by lists and its id retired',async()=>{
 await assert.rejects(()=>api.services.delete(BANK,{confirm:true}),/Stop showing/);
 await api.stopShowing(BANK);
 await assert.rejects(()=>api.services.delete(BANK),/confirm: true/);
 await api.services.delete(BANK,{confirm:true});await trade.syncPlayerView();
 assert.equal(listPage(LIST).flags[ID].listView.includes('Counting House'),false);
 await assert.rejects(()=>api.services.create({id:BANK,name:'again',service:{type:'bank'}}),/already used/);
 await assert.rejects(()=>api.merchants.delete(LIST),/confirm: true/);
 await api.merchants.delete(LIST,{confirm:true});
 assert.equal(listPage(LIST),undefined);assert.ok(api.get(KETTLE),'shops stay');
 await assert.rejects(()=>api.merchants.save({id:LIST,name:'again'}),/already used/);
});
