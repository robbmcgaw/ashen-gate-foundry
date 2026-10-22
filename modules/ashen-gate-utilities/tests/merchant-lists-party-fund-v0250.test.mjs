// 0.25.0: merchant lists shared with nobody, the whole party or chosen players, with an Open switch per entry
// (Present / Stop showing for the list's players) and Open all / Close all; the safe, re-runnable migration of 0.20–0.23
// lists (`visible` → `audience`); Party Fund Change coins (rates, fee setting, electrum, gates, the GM client, History,
// whispered cards, a repeated request); deposit/take cards; the Bank kept working but marked deprecated.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, sockets or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,normalizeAudience,normalizeMerchantList,listNeedsMigration,migrateMerchantLists,audiencePresented,presentedCovers,mergePresented,audienceText,
 coinExchangeEntry,exchangeLine,fundLogEntry,tradeCardHTML,bankQuote,planShopImport,BANK_DEPRECATED,purseEntry} from '../scripts/core.mjs';

// ---- Pure helpers ----
test('audience: legacy visible true → whole party, else hidden; chosen players de-duplicated; nobody chosen is hidden',()=>{
 assert.deepEqual(normalizeAudience(undefined,true),{mode:'party',userIds:[]});
 assert.deepEqual(normalizeAudience(undefined,false),{mode:'hidden',userIds:[]});
 assert.deepEqual(normalizeAudience({mode:'users',userIds:['a','a','',3,'b']}),{mode:'users',userIds:['a','b']});
 assert.deepEqual(normalizeAudience({mode:'users',userIds:[]},true),{mode:'hidden',userIds:[]});
 assert.deepEqual(normalizeAudience({mode:'party',userIds:['a']}),{mode:'party',userIds:[]});
 assert.deepEqual(normalizeAudience({mode:'nonsense'},true),{mode:'party',userIds:[]},'an unreadable mode falls back to the legacy flag');
 const l=normalizeMerchantList({id:'MLIST-A',name:'A',visible:true});
 assert.deepEqual([l.audience,l.visible],[{mode:'party',userIds:[]},true]);
 const u=normalizeMerchantList({id:'MLIST-A',name:'A',visible:false,audience:{mode:'users',userIds:['alice']}});
 assert.deepEqual([u.audience.mode,u.visible],['users',true],'audience wins over visible; visible kept for older readers');
});
test('migration: writes audience on old lists only, re-runnable, an unreadable list is kept exactly as it is',()=>{
 const old=[{id:'MLIST-A',name:'A',shopIds:['SHOP-X'],visible:true,createdAt:5},{id:'MLIST-B',name:'B',shopIds:[]},{id:'bad',name:'?'}];
 assert.deepEqual(old.map(listNeedsMigration),[true,true,false]);
 const once=migrateMerchantLists(old);
 assert.deepEqual(once.map(l=>l.audience?.mode),['party','hidden',undefined]);
 assert.deepEqual([once[0].shopIds,once[0].createdAt,once[0].visible],[['SHOP-X'],5,true],'ids, entries and times kept');
 assert.deepEqual(once[2],old[2],'unreadable list untouched');
 const twice=migrateMerchantLists(once);
 assert.deepEqual(twice,once);assert.equal(twice.some(listNeedsMigration),false);
 assert.deepEqual(migrateMerchantLists(undefined),[]);
});
test('open from a list: covers and merge add the audience, never take anyone away',()=>{
 const party={mode:'party',userIds:[]},chosen={mode:'users',userIds:['alice']},hidden={mode:'hidden',userIds:[]};
 assert.equal(audiencePresented(hidden),null);assert.deepEqual(audiencePresented(party),{mode:'all',userIds:[]});
 assert.equal(presentedCovers(null,party),false);assert.equal(presentedCovers({mode:'all'},hidden),false);
 assert.equal(presentedCovers({mode:'all',userIds:[]},chosen),true);
 assert.equal(presentedCovers({mode:'users',userIds:['bob']},chosen),false);assert.equal(presentedCovers({mode:'users',userIds:['bob','alice']},chosen),true);
 assert.equal(presentedCovers({mode:'users',userIds:['alice']},party),false,'shown to one player is not open to the party');
 assert.deepEqual(mergePresented({mode:'users',userIds:['bob']},chosen),{mode:'users',userIds:['bob','alice']});
 assert.deepEqual(mergePresented({mode:'all',userIds:[]},chosen),{mode:'all',userIds:[]});
 assert.deepEqual(mergePresented(null,party),{mode:'all',userIds:[]});
 assert.equal(mergePresented(null,hidden),null);
 assert.equal(audienceText(chosen,id=>id==='alice'?'Alice':id),'1 player: Alice');assert.equal(audienceText(party),'Whole party');assert.equal(audienceText(hidden),'Hidden');
});
test('Party Fund entries: the exchange entry, its line and card; the log keeps coin rows only; deposit/take cards',()=>{
 const q=bankQuote({hold:{cp:300,gp:1},from:'cp',to:'gp',receive:2,feePercent:10});
 const e=coinExchangeEntry({id:'x1',quote:q,payFrom:'actor',payer:{id:'k',name:'[TEST] Kestrel'},user:{id:'alice',name:'Alice'},realTime:1});
 assert.deepEqual([e.kind,e.serviceId,e.serviceName,e.give,e.fee,e.total,e.receive,e.fromAfter,e.toAfter],['coin-exchange',null,'Party Fund',200,20,220,2,80,3]);
 assert.equal(exchangeLine(e),"Alice changed 220 cp into 2 gp (fee 20 cp), [TEST] Kestrel's coins");
 const card=tradeCardHTML(e);assert.match(card,/Coins changed \(Party Fund\)/);assert.match(card,/Gave:<\/strong> <span class="agu-coin-chips">[\s\S]*?220[\s\S]*?cp/);assert.match(card,/Fee:<\/strong> [\s\S]*?20[\s\S]*?\(included above\)/);
 assert.doesNotMatch(card,/\bk\b|alice/,'names only, no ids');
 const dep=purseEntry({id:'p1',kind:'purse-deposit',approval:'not-required',plan:{kind:'deposit',coin:'gp',amount:3,actorBefore:5,actorAfter:2,purseBefore:1,purseAfter:4},user:{id:'alice',name:'Alice'},actor:{id:'k',name:'[TEST] Kestrel'}});
 const dc=tradeCardHTML(dep);assert.match(dc,/Coins put in the party purse/);assert.match(dc,/Put in:<\/strong> <span class="agu-coin-chips">[\s\S]*?3[\s\S]*?gp/);assert.match(dc,/Party purse now:<\/strong> [\s\S]*?4[\s\S]*?gp/);
 assert.match(tradeCardHTML({...dep,kind:'purse-take'}),/Coins taken from the party purse[\s\S]*Took:<\/strong> <span class="agu-coin-chips">/);
 const kinds=[{kind:'purse-deposit'},{kind:'purse-take'},{kind:'purse-adjust'},{kind:'purse-convert'},{kind:'coin-exchange'},{kind:'bank-exchange'},{kind:'shop-purchase',payFrom:'purse'},{kind:'shop-purchase',payFrom:'actor'},{kind:'shop-sale',payTo:'purse'},{kind:'shop-sale',payTo:'actor'},{kind:'deposit'},{kind:'gold-award'}];
 assert.deepEqual(kinds.map(fundLogEntry),[true,true,true,true,true,true,true,false,true,false,false,false]);
});
test('import: a Bank service still imports, with the deprecation note; a new list comes in hidden; an update keeps who it is shared with',()=>{
 const recs=[{id:'SVC-TEST-BANK',entity_type:'Service',name:'[TEST] Bank',service:{type:'bank',settings:{fee_percent:5}}},{id:'MLIST-TEST-L',entity_type:'MerchantList',name:'[TEST] L',merchant_list:{shop_ids:['SVC-TEST-BANK']}}];
 const r=planShopImport(recs,{randomId:()=>'r'});
 assert.deepEqual(r.results.map(x=>x.result),['created','created']);assert.deepEqual(r.results[0].notes,[BANK_DEPRECATED]);
 assert.deepEqual([r.writes.services[0].service,r.writes.lists[0].audience,r.writes.lists[0].visible],[{type:'bank',settings:{feePercent:5}},{mode:'hidden',userIds:[]},false]);
 const old={id:'MLIST-TEST-L',name:'Old',shopIds:[],audience:{mode:'users',userIds:['alice']},visible:true};
 const u=planShopImport([recs[1]],{mode:'update',lists:[old],randomId:()=>'r'});
 assert.deepEqual([u.writes.lists[0].name,u.writes.lists[0].audience],['[TEST] L',{mode:'users',userIds:['alice']}]);
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
const fundMod=await import('../scripts/party-fund.mjs');
const mlMod=await import('../scripts/merchant-lists.mjs');
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


const merchants=api.merchants;
const fundApi=()=>game.modules.get(ID).api.purse;
const shopPage=id=>viewJ()?.pages.find(p=>p.flags?.[ID]?.shopId===id);
let KETTLE,ANVIL,BANK,LIST;
test('setup: two shops, a Bank and a list; the new list calls are GM only',async()=>{
 await set('playerAccessEnabled',true);await set('shopsEnabled',true);await set('stashEnabled',true);
 KETTLE=(await api.create({name:'[TEST] Kettle',merchant:{name:'[TEST] Brin'},lines:[{lineId:'ln_rope',priceCp:100,priceCoin:'gp',item:{name:'Rope',type:'loot',system:{quantity:1}}}]})).id;
 ANVIL=(await api.create({name:'[TEST] Anvil',lines:[]})).id;
 BANK=(await api.services.create({name:'[TEST] Counting House',service:{type:'bank'}})).id;
 const l=await merchants.save({name:'[TEST] Harbour guild',shopIds:[KETTLE,ANVIL,BANK]});LIST=l.id;
 assert.deepEqual(l.audience,{mode:'hidden',userIds:[]});
 for(const c of [()=>merchants.setAudience(LIST,{mode:'party'}),()=>merchants.entries(LIST),()=>merchants.setOpen(LIST,KETTLE,true),()=>merchants.setAllOpen(LIST,true)])
  await as(alice,()=>assert.rejects(async()=>c(),/^Error: GM only\.$/));
});
test('share with chosen players: only they can read the list page; the others see no list; back to hidden removes it',async()=>{
 await assert.rejects(()=>merchants.setAudience(LIST,{mode:'users',userIds:['gm','nobody']}),/Choose at least one player/);
 await assert.rejects(()=>merchants.setAudience(LIST,{mode:'everyone'}),/hidden', 'party' or 'users'/);
 const l=await merchants.setAudience(LIST,{mode:'users',userIds:['alice']});
 assert.deepEqual([l.audience,l.visible],[{mode:'users',userIds:['alice']},true]);
 assert.deepEqual(listPage(LIST).ownership,{default:0,alice:2,bob:0});
 await as(alice,()=>assert.deepEqual(api.browse().map(x=>x.id),[LIST]));
 await as(bob,()=>assert.deepEqual(api.browse(),[]));
 await merchants.setAudience(LIST,{mode:'party'});assert.deepEqual(listPage(LIST).ownership,{default:2,alice:2,bob:2});
 await merchants.setVisible(LIST,false);assert.equal(listPage(LIST),undefined);assert.equal(merchants.get(LIST).audience.mode,'hidden');
 await merchants.setVisible(LIST,true);assert.equal(merchants.get(LIST).audience.mode,'party','setVisible(true) still means the whole party');
 const saved=await merchants.save({id:LIST,name:'[TEST] Harbour guild',shopIds:[KETTLE,ANVIL,BANK]});
 assert.equal(saved.audience.mode,'party','saving the list keeps who it is shared with');
});
test('Open switch: refused while hidden; opens to the list\'s players (adding to who already sees it); Close stops showing to everyone',async()=>{
 await merchants.setAudience(LIST,{mode:'hidden'});
 await assert.rejects(()=>merchants.setOpen(LIST,KETTLE,true),/Share this merchant list/);
 await assert.rejects(()=>merchants.setOpen(LIST,'SHOP-NOT-HERE',true),/not on this merchant list/);
 await merchants.setAudience(LIST,{mode:'users',userIds:['alice']});
 await api.present(KETTLE,{mode:'users',userIds:['bob']});
 sent.length=0;
 const st=await merchants.setOpen(LIST,KETTLE,true);
 assert.deepEqual([st.open,st.presented.mode,st.presented.userIds],[true,'users',['bob','alice']]);
 assert.deepEqual(shopPage(KETTLE).ownership,{default:0,alice:2,bob:2});
 assert.deepEqual(sent.filter(m=>m.type==='shop-presented').map(m=>m.to),[['bob','alice']],'one ping, to the players it is shown to, no shop id');
 await as(alice,()=>assert.deepEqual(api.forMe().map(v=>v.id),[KETTLE],'a presented entry: purchases go through as for any presented shop'));
 const lists=await as(alice,()=>trade.playerShopsView({playerShopSub:'lists'}));
 assert.match(lists,/\[TEST\] Kettle[\s\S]*?<i[^>]*fa-door-open[^>]*><\/i> Open<\/span>[\s\S]*?Open shop/);
 assert.match(lists,/\[TEST\] Anvil[\s\S]*?<i[^>]*fa-door-closed[^>]*><\/i> Closed<\/span>[\s\S]*?Look inside/);
 assert.equal((lists.match(/ Closed<\/span>/g)??[]).length,2);
 const closed=await merchants.setOpen(LIST,KETTLE,false);
 assert.deepEqual([closed.open,closed.presented],[false,null]);assert.equal(shopPage(KETTLE),undefined);
 await as(alice,()=>assert.deepEqual(api.forMe(),[]));
 const rev=api.get(KETTLE).rev;
 await as(alice,()=>assert.rejects(()=>api.buy({shopId:KETTLE,lineId:'ln_rope',quantity:1,actorId:'kestrel',payFrom:'actor',rev}),/not open for you/),'a closed entry can only be looked at');
});
test('Open all / Close all: every entry at once, an unknown service type skipped and named, one rebuild',async()=>{
 const j=gmJ();await j.createEmbeddedDocuments('JournalEntryPage',[{name:'[TEST] Tailor',type:'text',flags:{[ID]:{service:{schema:'ag-utilities-service/1',id:'SVC-TEST-TAILOR',kind:'service',name:'[TEST] Tailor',merchant:{name:'',img:''},service:{type:'tailor',settings:{}},presented:null,rev:0}}}}]);
 await merchants.save({id:LIST,name:'[TEST] Harbour guild',shopIds:[KETTLE,ANVIL,BANK,'SVC-TEST-TAILOR','SHOP-GONE']});
 await merchants.setAudience(LIST,{mode:'party'});
 const r=await merchants.setAllOpen(LIST,true);
 assert.deepEqual(r.changed,[KETTLE,ANVIL,BANK]);
 assert.deepEqual(r.skipped.map(x=>x.id),['SVC-TEST-TAILOR','SHOP-GONE']);
 assert.deepEqual(merchants.entries(LIST).map(e=>e.open),[true,true,true,false,false]);
 for(const id of [KETTLE,ANVIL,BANK])assert.deepEqual(shopPage(id).ownership,{default:2,alice:2,bob:2});
 assert.deepEqual((await merchants.setAllOpen(LIST,true)).changed,[],'already open: nothing written again');
 const html=gmView.shopsView({shopSub:'lists'});
 assert.match(html,/3 of 5 open/);assert.match(html,/data-action="mlist-open-all"[^>]*disabled/);assert.match(html,/data-action="mlist-close-all"/);
 assert.match(html,/data-mlist-open="MLIST-TEST-HARBOUR-GUILD" data-entry="SVC-TEST-TAILOR" disabled/);
 assert.match(html,/Shared with: <span class="ag-badge ag-badge--ok">[\s\S]*?Whole party/);
 const c=await merchants.setAllOpen(LIST,false);
 assert.deepEqual(c.changed,[KETTLE,ANVIL,BANK]);assert.deepEqual(api.presented(),[]);
 await merchants.setAudience(LIST,{mode:'hidden'});
 await assert.rejects(()=>merchants.setAllOpen(LIST,true),/Share this merchant list/);
});
test('migration on ready: a 0.20–0.23 list (visible only) gets audience, its page stays; running again writes nothing',async()=>{
 const meta=gmJ().pages.find(p=>p.flags?.[ID]?.meta);
 meta.flags[ID].meta.lists=[...meta.flags[ID].meta.lists,{id:'MLIST-TEST-OLD',name:'[TEST] Old town',shopIds:[KETTLE],visible:true,createdAt:1,updatedAt:1,updatedBy:'gm'},{id:'MLIST-TEST-SHUT',name:'[TEST] Shut',shopIds:[],visible:false}];
 assert.equal(await mlMod.migrateLists(),2);
 const after=gmJ().pages.find(p=>p.flags?.[ID]?.meta).flags[ID].meta.lists;
 assert.deepEqual(after.find(l=>l.id==='MLIST-TEST-OLD').audience,{mode:'party',userIds:[]});
 assert.deepEqual(after.find(l=>l.id==='MLIST-TEST-SHUT').audience,{mode:'hidden',userIds:[]});
 assert.deepEqual(after.find(l=>l.id==='MLIST-TEST-OLD').shopIds,[KETTLE]);
 assert.deepEqual(listPage('MLIST-TEST-OLD').ownership,{default:2,alice:2,bob:2});
 const snap=JSON.stringify(after);
 assert.equal(await mlMod.migrateLists(),0);assert.equal(JSON.stringify(gmJ().pages.find(p=>p.flags?.[ID]?.meta).flags[ID].meta.lists),snap);
 await as(alice,async()=>assert.equal(await mlMod.migrateLists(),0,'players never write'));
});
const exchange=(user,req)=>viaGM(user,()=>fundApi().exchange(req),'fund-exchange',fundMod.executeExchange);
test('Party Fund Change coins: a player\'s own coins through the GM client, one update, History, whispered card; no fee by default',async()=>{
 kestrel.system.currency={cp:300,sp:0,ep:3,gp:1,pp:0};updates.length=0;chat.length=0;const before=history().length;
 const q=await as(alice,()=>fundApi().quoteExchange({payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:2}));
 assert.deepEqual([q.ok,q.give,q.fee,q.total],[true,200,0,200]);
 const msg=await exchange(alice,{payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:2});
 assert.equal(msg,'Changed 200 cp into 2 gp for [TEST] Kestrel.');
 assert.deepEqual(kestrel.system.currency,{cp:100,sp:0,ep:3,gp:3,pp:0},'ep left alone');
 assert.deepEqual(updates,[{id:'kestrel',d:{'system.currency.cp':100,'system.currency.gp':3}}]);
 const e=history().at(-1);assert.equal(history().length,before+1);
 assert.deepEqual([e.kind,e.payFrom,e.userName,e.payerName,e.total,e.receive],['coin-exchange','actor','Alice','[TEST] Kestrel',200,2]);
 await new Promise(r=>setTimeout(r,0));
 const card=chat.at(-1);assert.deepEqual(card.whisper,['alice','gm']);assert.match(card.content,/Coins changed \(Party Fund\)/);
});
test('Party Fund Change coins: the GM fee, the purse with no vote, electrum off, someone else\'s coins, gates and a repeated request',async()=>{
 await set('exchangeFeePercent',10);await set('purseVoteRequired','on');sent.length=0;
 kestrel.system.currency={cp:0,sp:30,ep:0,gp:0,pp:0};
 const q=await as(alice,()=>fundApi().quoteExchange({payFrom:'actor',actorId:'kestrel',from:'sp',to:'gp',receive:2}));
 assert.deepEqual([q.give,q.fee,q.total],[20,2,22]);
 await exchange(alice,{payFrom:'actor',actorId:'kestrel',from:'sp',to:'gp',receive:2});assert.deepEqual([kestrel.system.currency.sp,kestrel.system.currency.gp],[8,2]);
 const purse=structuredClone(stash.system.currency);
 await exchange(alice,{payFrom:'purse',from:'gp',to:'sp',receive:10});
 assert.deepEqual([stash.system.currency.gp,stash.system.currency.sp],[purse.gp-2,purse.sp+10],'1 gp + 10 % fee rounded up to 1 gp');
 assert.equal(sent.some(m=>m.type==='stash-vote-request'),false,'nothing leaves the party: no vote');
 assert.equal(history().at(-1).payFrom,'purse');
 await set('exchangeFeePercent',0);await set('purseVoteRequired','off');
 await as(alice,()=>assert.equal(fundApi().quoteExchange({payFrom:'actor',actorId:'kestrel',from:'ep',to:'sp',receive:5}).reason,'Electrum is turned off in Utilities GM Setup.'));
 await as(alice,()=>assert.equal(fundApi().quoteExchange({payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10}).reason,'You can only change the coins of a character you own.'));
 await assert.rejects(()=>fundMod.executeExchange({requestId:'f1',payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10},alice),/character you own\. No coins changed\./);
 await assert.rejects(()=>fundMod.executeExchange({requestId:'f2',payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:25},alice),/Ask for a multiple of 10 sp/);
 await assert.rejects(()=>fundMod.executeExchange({requestId:'f2',payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10},alice),/already handled/);
 await set('stashEnabled',false);
 await as(alice,()=>assert.throws(()=>fundApi().quoteExchange({payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10}),/party stash off/));
 await assert.rejects(()=>fundMod.executeExchange({requestId:'f3',payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10},alice),/party stash off/,'refused on the GM client too');
 await set('stashEnabled',true);await set('playerAccessEnabled',false);
 await assert.rejects(()=>fundMod.executeExchange({requestId:'f4',payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10},alice),/hidden for players/);
 await set('playerAccessEnabled',true);
 await set('exchangeFeePercent',99);assert.equal(fundMod.fundFee(),0,'a stored fee out of range reads as no fee');await set('exchangeFeePercent',0);
});
test('deposit and take post the card to the player and the GM; History for players hides other players\' own-coin exchanges',async()=>{
 kestrel.system.currency.gp=5;chat.length=0;
 await as(gm,()=>socketFn({type:'purse-deposit',requestId:'d1',userId:'alice',actorId:'kestrel',coin:'gp',amount:2},'alice'));
 await new Promise(r=>setTimeout(r,0));
 const c=chat.find(m=>/Coins put in the party purse/.test(m.content));assert.ok(c);assert.deepEqual(c.whisper,['alice','gm']);
 await as(gm,()=>socketFn({type:'purse-take',requestId:'t1',userId:'alice',actorId:'kestrel',coin:'gp',amount:1},'alice'));
 await new Promise(r=>setTimeout(r,0));
 const t=chat.find(m=>/Coins taken from the party purse/.test(m.content));assert.ok(t);assert.deepEqual(t.whisper,['alice','gm']);
 wren.system.currency.gp=20;await exchange(bob,{payFrom:'actor',actorId:'wren',from:'gp',to:'sp',receive:10});
 const forAlice=await as(alice,()=>game.modules.get(ID).api.stash.history());
 assert.equal(forAlice.some(h=>h.kind==='coin-exchange'&&h.userId==='bob'),false);assert.equal(forAlice.some(h=>h.kind==='coin-exchange'&&h.userId==='alice'),true);
});
test('Party Fund tab markup: purse with Deposit / Take, Change coins with preview, and the coin log; Items shows the purse in one line',async()=>{
 const app=await as(alice,()=>game.modules.get(ID).api.stash.open());
 app.stashTab='fund';app.fund={payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:'10'};kestrel.system.currency.gp=3;
 const html=await as(alice,()=>app._renderHTML());
 assert.match(html,/role="tab" data-stash-tab="fund" aria-selected="true"[^>]*>Party Fund/);
 assert.match(html,/data-action="purse-deposit"/);assert.match(html,/<h3>Change coins<\/h3>/);
 assert.match(html,/id="agu-fund-whose" data-fund="whose"><option value="actor:kestrel" selected>\[TEST\] Kestrel&#39;s coins<\/option><option value="purse">Party purse<\/option>/);
 assert.doesNotMatch(html.match(/id="agu-fund-from"[\s\S]*?<\/select>/)[0],/value="ep"/,'no electrum while it is off');
 assert.match(html,/You give<\/dt><dd>1 gp<\/dd><dt>You get<\/dt><dd>10 sp<\/dd>/);assert.match(html,/No fee\./);
 assert.doesNotMatch(html,/data-action="fund-exchange" disabled/);
 assert.match(html,/aria-label="Party Fund log"[\s\S]*?Alice changed 200 cp into 2 gp/);
 assert.doesNotMatch(html.slice(html.indexOf('Party Fund log')),/Bob changed/,'another player\'s own coins are not in the log');
 assert.doesNotMatch(html,/<button[^>]*\stitle=/);
 app.stashTab='items';const items=await as(alice,()=>app._renderHTML());
 assert.doesNotMatch(items,/data-action="purse-deposit"/);assert.match(items,/Party purse: <strong>/);
});
test('the Bank is deprecated in the GM editor and toolbar but keeps working',async()=>{
 const ed=gmView.shopsView({shopSub:'editor',shopDraft:gmView.draftFrom(api.services.get(BANK)),shopStatus:''});
 assert.match(ed,/Bank services are deprecated \(exchange only\)/);assert.match(ed,/<option value="bank" selected>Bank \(deprecated\)<\/option>/);
 assert.match(gmView.shopsView({shopSub:'list',shopSearch:'',shopSort:'name'}),/data-action="shop-new-service"[^>]*data-tooltip="A Bank \(deprecated\)/);
 await api.present(BANK,{mode:'all'});kestrel.system.currency.cp=100;
 const rev=api.services.get(BANK).rev;
 const msg=await viaGM(alice,()=>api.services.use({serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'sp',receive:10,rev}),'service-use',svcMod.executeServiceUse);
 assert.equal(msg,'Changed 100 cp into 10 sp for [TEST] Kestrel.');assert.equal(history().at(-1).kind,'bank-exchange');
 await api.stopShowing(BANK);
});
