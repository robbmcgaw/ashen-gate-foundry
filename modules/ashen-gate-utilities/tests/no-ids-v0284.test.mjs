// 0.30.1: Ashen Gate canonical ids (SHOP-, SVC-, MLIST-, ITEM-, REC-, LOC-…) are never shown in the Shops views, the
// import preview or the notifications; they stay in data-* wiring and the stored records. Uses assertNoIds.
// Mocked Foundry globals: proves the markup text, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';
import {ID} from '../scripts/core.mjs';

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
const modules=new Map([[ID,{id:ID,active:true,version:'0.32.0'}]]);
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
const imp=await import('../scripts/shop-import.mjs');

test('the checker itself: a visible id is caught, an id in data-* wiring is not',()=>{
 assert.equal(findId('<p>SHOP-TEST-X</p>'),'SHOP-TEST-X');assert.equal(findId('<button aria-label="Open ITEM-A-1">x</button>'),'ITEM-A-1');
 assert.equal(findId('<button data-shop="SHOP-TEST-X" aria-label="Open Kettle">Open</button>'),null);
});
test('Shops views (GM and player) show names, never ids',async()=>{
 const kettle=await api.create({name:'[TEST] Kettle',merchant:{name:'[TEST] Brin'},locationId:'LOC-TEST-TOWN',buys:{enabled:true},
  lines:[{lineId:'ln_rope',itemId:'ITEM-TEST-ROPE',priceCp:100,priceCoin:'gp',item:{name:'Rope',type:'loot',system:{quantity:1}}},{lineId:'ln_x',priceCp:5,item:{name:'[TEST] Plain Crate',system:{}}}]});
 const bank=await api.services.create({name:'[TEST] Counting House',merchant:{name:'[TEST] Clerk'},service:{type:'bank'}});
 const list=await api.merchants.save({name:'[TEST] Merchants',locationId:'LOC-TEST-TOWN',shopIds:[kettle.id,bank.id,'SHOP-TEST-GONE']});
 await set('playerAccessEnabled',true);await set('shopsEnabled',true);await set('stashEnabled',true);
 assert.match(kettle.id,/^SHOP-/);assert.match(bank.id,/^SVC-/);assert.match(list.id,/^MLIST-/);
 const draft=gmView.draftFrom(api.get(kettle.id));
 const svcDraft=gmView.draftFrom(api.services.get(bank.id));
 const listDraft={id:list.id,name:list.name,locationId:list.locationId,shopIds:[...list.shopIds]};
 for(const [where,html] of Object.entries({
  'shops list':gmView.shopsView({shopSub:'list',shopSearch:'',shopSort:'name'}),
  'shop search by id (matches, does not display)':gmView.shopsView({shopSub:'list',shopSearch:kettle.id,shopSort:'name'}),
  'shop editor':gmView.shopsView({shopSub:'editor',shopDraft:draft,shopStatus:'',shopEdTab:'details'}),
  'shop editor items':gmView.shopsView({shopSub:'editor',shopDraft:draft,shopStatus:'',shopEdTab:'items'}),
  'service editor':gmView.shopsView({shopSub:'editor',shopDraft:svcDraft,shopStatus:''}),
  'merchant lists':gmView.shopsView({shopSub:'lists'}),
  'merchant list editor':gmView.shopsView({shopSub:'lists',listDraft,listStatus:''}),
  'import preview':gmView.shopsView({shopSub:'list',shopImport:{fileName:'x.json',mode:'create',ignored:0,results:[
    {id:'SHOP-TEST-IMP',type:'Shop',name:'',result:'created',lines:{imported:1,skipped:['REC-A','REC-B','REC-C','REC-D'].map(ref=>({ref,reason:'Item not found in this world.'}))},notes:[]},
    {id:'MLIST-TEST-IMP',type:'MerchantList',name:'[TEST] Imported list',result:'skipped',reason:'x',notes:['1 entry is not in this world or this file; the list shows it as missing.']}]}}),
 }))assert.ok(html.length>50,where),assertNoMachineText(html,`GM ${where}`);
 assert.match(gmView.shopsView({shopSub:'list',shopSearch:kettle.id,shopSort:'name'}),/\[TEST\] Kettle/,'search by id still finds it');
 await api.merchants.setVisible(list.id,true);await api.present(kettle.id,{mode:'all'});await api.present(bank.id,{mode:'all'});await trade.syncPlayerView();
 const player=await as(alice,()=>trade.playerShopsView({playerShopSub:'open'}));
 const lists=await as(alice,()=>trade.playerShopsView({playerShopSub:'lists'}));
 const shop=await as(alice,()=>trade.shopViewHTML(trade.viewOf(kettle.id),{actorId:'kestrel'}));
 const svc=await as(alice,()=>trade.shopViewHTML(trade.viewOf(bank.id),{actorId:'kestrel'}));
 for(const [where,html] of Object.entries({'open shops':player,'merchant lists':lists,'shop':shop,'service':svc}))assert.ok(html.length>50,where),assertNoMachineText(html,`player ${where}`);
});
test('notifications and messages name things, not ids',async()=>{
 notes.length=0;
 const msgs=[];
 for(const run of [()=>api.create({name:'x',id:'SHOP-TEST-DUP',lines:[]}).then(()=>api.create({name:'y',id:'SHOP-TEST-DUP',lines:[]})),
   ()=>api.services.create({name:'s',id:'SVC-TEST-DUP',service:{type:'bank'}}).then(()=>api.services.create({name:'t',id:'SVC-TEST-DUP',service:{type:'bank'}}))])
  try{await run();}catch(e){msgs.push(e.message);}
 assert.equal(msgs.length,2);
 for(const m of msgs)assertNoIds(m,'duplicate id error');
});
