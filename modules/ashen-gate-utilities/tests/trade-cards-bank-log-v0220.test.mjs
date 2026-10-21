// 0.22.0: chat cards for purchases, sales and bank exchanges (whispered to the player who made it and the GM, never
// public; a chat failure never refuses or rolls back), and the Bank's own GM-only log (on its GM Data page, refused to
// players in the API, capped at 200, shown in the GM editor's Log section).
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI, chat log or layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,tradeCardHTML,SHOP_LOG_CAP} from '../scripts/core.mjs';

test('card markup: purchase, sale and bank exchange; names, item ×quantity, total as the shop shows it, escaped, no ids',()=>{
 const buy=tradeCardHTML({kind:'shop-purchase',shopId:'SHOP-X',shopName:'[TEST] Kettle',itemName:'Rope <50 ft>',quantity:2,totalText:'1 gp 5 sp',payFrom:'actor',payerName:'[TEST] Kestrel',actorName:'[TEST] Kestrel',userName:'Alice'});
 assert.match(buy,/<h3>Bought at \[TEST\] Kettle<\/h3>/);
 for(const s of ['<strong>Buyer:</strong> Alice','<strong>Character:</strong> [TEST] Kestrel','<strong>Bought:</strong> Rope &lt;50 ft&gt; ×2','<strong>Total:</strong> 1 gp 5 sp','<strong>Paid from:</strong> [TEST] Kestrel&#39;s coins'])assert.ok(buy.includes(s),s);
 assert.equal(buy.includes('SHOP-X'),false,'no ids');
 const sale=tradeCardHTML({kind:'shop-sale',shopName:'[TEST] Kettle',itemName:'Dagger',quantity:1,totalText:'1 gp',payTo:'purse',actorName:'[TEST] Kestrel',userName:'Alice'});
 assert.match(sale,/Sold to \[TEST\] Kettle[\s\S]*Seller:<\/strong> Alice[\s\S]*Sold:<\/strong> Dagger ×1[\s\S]*Total:<\/strong> 1 gp[\s\S]*Paid into:<\/strong> the party purse/);
 const bank=tradeCardHTML({kind:'bank-exchange',serviceName:'[TEST] Counting House',payFrom:'actor',payerName:'[TEST] Kestrel',userName:'Alice',from:'sp',to:'gp',give:20,fee:2,total:22,receive:2});
 assert.match(bank,/Coins changed at \[TEST\] Counting House[\s\S]*Character:<\/strong> \[TEST\] Kestrel[\s\S]*Gave:<\/strong> 22 sp[\s\S]*Got:<\/strong> 2 gp[\s\S]*Fee:<\/strong> 2 sp/);
 assert.equal(tradeCardHTML({kind:'bank-exchange',serviceName:'B',payFrom:'purse',userName:'A',from:'cp',to:'gp',fee:0,total:100,receive:1}).includes('Fee'),false,'no fee line without a fee');
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
let chatDown=false;const chat=[];globalThis.ChatMessage={create:async d=>{if(chatDown)throw Error('chat is down');chat.push(d);return d;},getSpeaker:()=>({})};
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
const buy=(user,req)=>viaGM(user,()=>api.buy(req),'shop-buy',trade.executeBuy);
const sale=(user,req)=>viaGM(user,()=>api.sell(req),'shop-sell',sellMod.executeSell);
const cards=()=>chat.filter(m=>String(m.content).includes('ag-utilities-trade'));
const settle=()=>new Promise(r=>setTimeout(r,0));

let KETTLE,BANK;
test('setup: a shop that buys from players and a Bank, both shown to Alice only',async()=>{
 KETTLE=(await api.create({name:'[TEST] Kettle',buys:{enabled:true},lines:[{lineId:'ln_rope',priceCp:150,priceCoin:'sp',item:{name:'Rope',type:'loot',system:{quantity:1}}}]})).id;
 BANK=(await api.services.create({name:'[TEST] Counting House',service:{type:'bank',settings:{feePercent:10}}})).id;
 await set('playerAccessEnabled',true);await set('shopsEnabled',true);await set('stashEnabled',true);
 await api.present(KETTLE,{mode:'users',userIds:['alice']});await api.present(BANK,{mode:'users',userIds:['alice']});
 assert.deepEqual(api.services.log(BANK),[],'a new bank has an empty log');
 kestrel.system.currency={cp:1000,sp:0,ep:0,gp:20,pp:0};
});
test('a player purchase posts one card, whispered to the buyer and the GM only (no public card)',async()=>{
 chat.length=0;
 const msg=await buy(alice,{shopId:KETTLE,lineId:'ln_rope',quantity:2,actorId:'kestrel',payFrom:'actor',payerId:'kestrel',rev:api.get(KETTLE).rev});
 assert.match(msg,/2 Rope added to \[TEST\] Kestrel/);await settle();
 const c=cards();assert.equal(c.length,1);assert.deepEqual(c[0].whisper,['alice','gm']);
 assert.match(c[0].content,/Bought at \[TEST\] Kettle[\s\S]*Buyer:<\/strong> Alice[\s\S]*Character:<\/strong> \[TEST\] Kestrel[\s\S]*Bought:<\/strong> Rope ×2[\s\S]*Total:<\/strong> 30 sp/);
 assert.ok(chat.every(m=>Array.isArray(m.whisper)&&m.whisper.length),'nothing public');
});
test('a player sale posts a card to the seller and the GM',async()=>{
 chat.length=0;
 const msg=await sale(alice,{shopId:KETTLE,itemId:'dag',actorId:'kestrel',quantity:1,payTo:'actor',rev:api.get(KETTLE).rev});
 assert.match(msg,/Dagger/);await settle();
 const c=cards();assert.equal(c.length,1);assert.deepEqual(c[0].whisper,['alice','gm']);
 assert.match(c[0].content,/Sold to \[TEST\] Kettle[\s\S]*Sold:<\/strong> \[TEST\] Dagger ×1[\s\S]*Total:<\/strong> 1 gp[\s\S]*Paid into:<\/strong> \[TEST\] Kestrel&#39;s coins/);
});
test('a bank exchange posts a card and writes the bank log (who, character, from, to, fee, time) on the GM Data page',async()=>{
 chat.length=0;const t0=Date.now();
 const msg=await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'gp',receive:1,rev:api.services.get(BANK).rev});
 assert.equal(msg,'Changed 110 cp into 1 gp (fee 10 cp) for [TEST] Kestrel.');await settle();
 const c=cards();assert.equal(c.length,1);assert.deepEqual(c[0].whisper,['alice','gm']);
 assert.match(c[0].content,/Coins changed at \[TEST\] Counting House[\s\S]*Gave:<\/strong> 110 cp[\s\S]*Got:<\/strong> 1 gp[\s\S]*Fee:<\/strong> 10 cp/);
 const log=api.services.log(BANK);assert.equal(log.length,1);
 const e=log[0];assert.deepEqual([e.kind,e.userName,e.payerName,e.from,e.to,e.total,e.receive,e.fee],['bank-exchange','Alice','[TEST] Kestrel','cp','gp',110,1,10]);
 assert.ok(e.realTime>=t0);
 const page=gmJ().pages.find(p=>p.flags?.[ID]?.service?.id===BANK);
 assert.equal(page.flags[ID].log.length,1,'stored with the bank on its GM Data page');assert.equal(gmJ().ownership.default,0,'which players cannot read');
 assert.equal(page.flags[ID].service.service.settings.feePercent,10,'the bank record is kept');
});
test('the bank log is refused to players in the API, and never reaches the Player View',async()=>{
 await as(alice,()=>assert.throws(()=>api.services.log(BANK),/^Error: GM only\.$/));
 await as(bob,()=>assert.throws(()=>api.services.log(BANK),/^Error: GM only\.$/));
 const view=viewJ().pages.find(p=>p.flags?.[ID]?.shopId===BANK);
 assert.equal(view.flags[ID].shopView.includes('bank-exchange'),false);assert.equal('log' in view.flags[ID],false);
});
test('chat down: purchase, sale and exchange still go through, nothing is rolled back, only a console warning',async()=>{
 const warns=[],was=console.warn;console.warn=(...a)=>warns.push(a.join(' '));chatDown=true;
 try{
  const before=structuredClone(kestrel.system.currency),n=kestrel.items.length,logN=api.services.log(BANK).length;
  await buy(alice,{shopId:KETTLE,lineId:'ln_rope',quantity:1,actorId:'kestrel',payFrom:'actor',payerId:'kestrel',rev:api.get(KETTLE).rev});
  await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'gp',to:'sp',receive:10,rev:api.services.get(BANK).rev});
  await settle();
  assert.equal(kestrel.items.length,n+1,'the rope stayed');
  assert.notDeepEqual(kestrel.system.currency,before,'the coins moved');
  assert.equal(api.services.log(BANK).length,logN+1,'the exchange is logged');
  assert.ok(warns.some(w=>/Could not post the chat card: chat is down/.test(w)));
 }finally{chatDown=false;console.warn=was;}
});
test('a bank log write failure never undoes or refuses the exchange',async()=>{
 const page=gmJ().pages.find(p=>p.flags?.[ID]?.service?.id===BANK),orig=page.update,warns=[],was=console.warn;
 page.update=async()=>{throw Error('disk full');};console.warn=(...a)=>warns.push(a.join(' '));
 try{
  const gp=kestrel.system.currency.gp;
  const msg=await use(alice,{serviceId:BANK,payFrom:'actor',actorId:'kestrel',from:'cp',to:'sp',receive:1,rev:api.services.get(BANK).rev});
  assert.match(msg,/^Changed/);assert.equal(kestrel.system.currency.gp,gp);
  assert.ok(warns.some(w=>/Could not write the bank log: disk full/.test(w)));
 }finally{page.update=orig;console.warn=was;}
});
test(`the bank log keeps the last ${SHOP_LOG_CAP} entries; saving the bank keeps its log`,async()=>{
 for(let i=0;i<SHOP_LOG_CAP+5;i++)await gmView.queueShops(()=>gmView.appendServiceLog(BANK,{id:`x${i}`,kind:'bank-exchange',userName:'GM',payFrom:'actor',payerName:'[TEST] Wren',from:'gp',to:'sp',total:1,receive:10,fee:0,realTime:i}));
 const log=api.services.log(BANK);assert.equal(log.length,SHOP_LOG_CAP);assert.equal(log.at(-1).id,`x${SHOP_LOG_CAP+4}`);assert.equal(log[0].id,`x${5}`);
 await api.services.save({...api.services.get(BANK),flavour:'Brass scales.'});
 assert.equal(api.services.log(BANK).length,SHOP_LOG_CAP,'Save Changes does not touch the log');
});
test('GM editor: a labelled Log section (GM only) for a saved bank, newest first; none for a new service',async()=>{
 const app={tab:'shops',shopSub:'editor',shopSearch:'',shopSort:'location',shopDraft:gmView.draftFrom(api.services.get(BANK))};
 const html=gmView.shopsView(app);
 assert.match(html,/<h3 class="ag-section__title">Log · 200 <span class="ag-gm-flag">/);
 assert.match(html,/Players never see this log/);
 const first=html.indexOf('x204'),rows=[...html.matchAll(/<span class="ag-row__title">([^<]*)<\/span>/g)].map(m=>m[1]);
 assert.equal(rows[0],'GM ([TEST] Wren): 1 gp → 10 sp, no fee','newest first');assert.equal(first,-1,'no ids in the rows');
 const fresh={...app,shopDraft:gmView.draftFrom(null,{kind:'service'})};
 assert.equal(gmView.shopsView(fresh).includes('Log ·'),false);
 assert.equal(await as(alice,()=>gmView.shopsView(app)),'','players get no GM view');
});
