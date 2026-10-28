// 0.35.0: api.shops.atPlace (GM only), the player view's placeKey (only for a place revealed to everyone) and the
// shopsChanged hook partners listen to. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,placeIdSet,shopsAtPlaces,projectShop,normalizeShop} from '../scripts/core.mjs';

// ---- Pure helpers ----
const tree=new Map([['LOC-TEST-TOWN',{parentLocationId:''}],['LOC-TEST-MARKET',{parentLocationId:'LOC-TEST-TOWN'}],['LOC-TEST-STALL',{parentLocationId:'LOC-TEST-MARKET'}],['LOC-TEST-FAR',{parentLocationId:''}]]);
test('placeIdSet: the place alone, or with everything inside it; a loop ends; nothing for no id',()=>{
 assert.deepEqual([...placeIdSet('LOC-TEST-TOWN',tree)],['LOC-TEST-TOWN']);
 assert.deepEqual([...placeIdSet('LOC-TEST-TOWN',tree,true)].sort(),['LOC-TEST-MARKET','LOC-TEST-STALL','LOC-TEST-TOWN']);
 assert.deepEqual([...placeIdSet('LOC-TEST-MARKET',tree,true)].sort(),['LOC-TEST-MARKET','LOC-TEST-STALL']);
 assert.deepEqual([...placeIdSet('LOC-UNKNOWN',tree,true)],['LOC-UNKNOWN'],'an id Locations does not know still matches itself');
 assert.equal(placeIdSet('',tree,true).size,0);assert.equal(placeIdSet(null).size,0);
 const loop=new Map([['LOC-X',{parentLocationId:'LOC-Y'}],['LOC-Y',{parentLocationId:'LOC-X'}]]);
 assert.deepEqual([...placeIdSet('LOC-X',loop,true)].sort(),['LOC-X','LOC-Y']);
});
test('shopsAtPlaces: small rows by name, who it is shown to, no stock or notes, unknown services left out',()=>{
 const recs=[{id:'SHOP-B',name:'Bell',locationId:'LOC-TEST-MARKET',merchant:{name:'Brin'},gmNotes:'secret',lines:[{lineId:'x'}],presented:{mode:'users',userIds:['a','b']}},
  {id:'SHOP-A',name:'Anvil',locationId:'LOC-TEST-MARKET',merchant:{name:'Ada'},presented:{mode:'all',userIds:[]}},
  {id:'SHOP-C',name:'Candle',locationId:'LOC-TEST-FAR',merchant:{name:'Cy'}},{id:'SHOP-D',name:'Nowhere',merchant:{name:'Dee'}},
  {id:'SVC-BANK',kind:'service',known:true,name:'Bank',locationId:'LOC-TEST-MARKET',merchant:{name:'Teller'}},{id:'SVC-ODD',kind:'service',known:false,name:'Odd',locationId:'LOC-TEST-MARKET'}];
 const rows=shopsAtPlaces(recs,new Set(['LOC-TEST-MARKET']));
 assert.deepEqual(rows.map(r=>r.id),['SHOP-A','SVC-BANK','SHOP-B']);
 assert.deepEqual(rows[0],{id:'SHOP-A',name:'Anvil',merchant:'Ada',kind:'shop',presented:true,mode:'all',count:0});
 assert.deepEqual([rows[1].kind,rows[1].presented,rows[1].mode],['service',false,null]);
 assert.deepEqual([rows[2].mode,rows[2].count],['users',2]);
 assert.equal(JSON.stringify(rows).includes('secret'),false);assert.equal(JSON.stringify(rows).includes('lineId'),false);
 assert.deepEqual(shopsAtPlaces(recs,new Set()),[]);
});
test('projection: placeKey (the pin key, never the LOC id) only travels with a place name that players may see',()=>{
 const shop=normalizeShop({id:'SHOP-T',name:'T',locationId:'LOC-TEST-MARKET',lines:[]});
 assert.equal(projectShop(shop,{locationName:'[TEST] Market Ward',placeKey:'pinmarket0001'}).placeKey,'pinmarket0001');
 assert.equal('placeKey' in projectShop(shop,{locationName:null,placeKey:'pinmarket0001'}),false,'a place that is not revealed leaves no key behind');
 assert.equal('placeKey' in projectShop(normalizeShop({id:'SHOP-U',name:'U',settlement:'Typed town',lines:[]}),{}),false,'a typed settlement has no id');
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
const modules=new Map([[ID,{id:ID,active:true,version:'0.19.0'}]]);
let locs=[{id:'LOC-TEST-MARKET',name:'[TEST] Market Ward',revealed:false,pinKey:'pinother000001',published:null}];
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
const gmShop=async(name,loc,extra={})=>(await api.create({name,merchant:{name:`${name} Keeper`},locationId:loc,gmNotes:'GM only text.',lines:[{lineId:`ln_${name}`,priceCp:100,item:{name:'Rope',type:'loot',system:{}}}],...extra})).id;
let KETTLE,ANVIL,FAR;
locs=[{id:'LOC-TEST-TOWN',name:'[TEST] Town',parentLocationId:'',revealed:true,pinKey:'pintown000001',published:{name:'[TEST] Town'}},
 {id:'LOC-TEST-MARKET',name:'[TEST] Market',parentLocationId:'LOC-TEST-TOWN',revealed:false,pinKey:'pinother000001',published:null},{id:'LOC-TEST-FAR',name:'[TEST] Far',parentLocationId:'',revealed:false,pinKey:'pinother000001',published:null}];
test('atPlace is GM only (enforced in the API) and lists the shops of a place, with the places inside it on request',async()=>{
 KETTLE=await gmShop('Kettle','LOC-TEST-MARKET');ANVIL=await gmShop('Anvil','LOC-TEST-TOWN');FAR=await gmShop('Far','LOC-TEST-FAR');
 await set('playerAccessEnabled',true);await set('shopsEnabled',true);
 await as(alice,()=>assert.throws(()=>api.atPlace('LOC-TEST-TOWN'),/^Error: GM only\.$/));
 assert.deepEqual(api.atPlace('LOC-TEST-TOWN').map(r=>r.name),['Anvil']);
 assert.deepEqual(api.atPlace('LOC-TEST-TOWN',{includeChildren:true}).map(r=>r.name),['Anvil','Kettle']);
 assert.deepEqual(api.atPlace('LOC-TEST-MARKET').map(r=>[r.name,r.presented]),[['Kettle',false]]);
 assert.deepEqual(api.atPlace(''),[]);assert.deepEqual(api.atPlace('LOC-TEST-NOTHING'),[]);
 const text=JSON.stringify(api.atPlace('LOC-TEST-TOWN',{includeChildren:true}));
 for(const leak of ['GM only text','lineId','priceCp'])assert.equal(text.includes(leak),false,leak);
});
test('atPlace follows Present and Stop showing, and a player sees placeKey (not the LOC id) only for a place revealed to everyone',async()=>{
 await api.present(ANVIL,{mode:'users',userIds:['alice']});await api.present(KETTLE,{mode:'all'});
 const rows=api.atPlace('LOC-TEST-TOWN',{includeChildren:true});
 assert.deepEqual(rows.map(r=>[r.name,r.presented,r.mode,r.count]),[['Anvil',true,'users',1],['Kettle',true,'all',0]]);
 await as(alice,()=>{const v=api.forMe();assert.deepEqual(v.map(x=>x.name).sort(),['Anvil','Kettle']);
  assert.equal(v.find(x=>x.name==='Anvil').placeKey,'pintown000001','the town is revealed');
  assert.equal(JSON.stringify(v).includes('LOC-TEST'),false,'a LOC id never reaches a player');
  assert.equal('placeKey' in v.find(x=>x.name==='Kettle'),false,'the market is not revealed: no key');});
 await as(bob,()=>assert.deepEqual(api.forMe().map(x=>x.name),['Kettle']));
 await api.stopShowing(ANVIL);
 assert.equal(api.atPlace('LOC-TEST-TOWN')[0].presented,false);
 await as(alice,()=>assert.deepEqual(api.forMe().map(x=>x.name),['Kettle']));
});
test('shopsChanged is announced when the GM data or the player view changes',async()=>{
 const heard=[];hooks.set(`${ID}.shopsChanged`,[()=>heard.push(1)]);
 const gmJ=journals.find(j=>j.flags?.[ID]?.store==='shops-gm');
 for(const fn of hooks.get('updateJournalEntryPage')??[])fn(gmJ.pages[0]);
 const viewJ=journals.find(j=>j.flags?.[ID]?.store==='shops-player');
 for(const fn of hooks.get('updateJournalEntryPage')??[])fn(viewJ.pages[0]);
 for(const fn of hooks.get('updateJournalEntryPage')??[])fn({parent:{flags:{}}});
 assert.equal(heard.length,2,'other journals are not announced');
 heard.length=0;for(const fn of hooks.get('updateJournalEntryPage')??[])fn(gmJ.pages[0],{},{agBulk:true});
 assert.equal(heard.length,0,'a bulk write is announced once at the end, not per page');
});
