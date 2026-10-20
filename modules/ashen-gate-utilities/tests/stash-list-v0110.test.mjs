// 0.11.0: api.stash.listItems(). Mocked Foundry globals; proves the logic, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
const handlers={once:new Map(),on:new Map()};const settings=new Map();
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){return this;}async close(){}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
function mkActor(id,name,flags={},items=[]){const m=new Map(items.map(i=>[i.id,i]));return {id,name,type:'npc',flags,statuses:new Set(),effects:[],getFlag:(ns,k)=>flags[ns]?.[k],
 testUserPermission:u=>u.isGM,items:{get:x=>m.get(x),get size(){return m.size;},[Symbol.iterator]:()=>m.values()},update:async()=>{}};}
const item=(id,name,type,system)=>({id,uuid:`Actor.stash.Item.${id}`,name,type,img:`${id}.webp`,system});
const stash=mkActor('stash','Ashen Gate | Party Stash',{[ID]:{partyStash:true}},[
 item('i1','[TEST] Rope','loot',{quantity:2,weight:{value:10,units:'lb'},price:{value:1,denomination:'gp'}}),
 item('i2','[TEST] Dagger','weapon',{quantity:1,weight:{value:1,units:'lb'},price:{value:2,denomination:'gp'}}),
 item('i3','[TEST] Chalk','loot',{quantity:5})]);
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[stash];actors.get=id=>actors.find(a=>a.id===id);
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{settings.get(`${ns}.${key}`).value=v;}},
 socket:{emit:()=>{},on:()=>{}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',weapon:'Weapon'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
const set=(k,v)=>game.settings.set(ID,k,v);

test('GM lists every stash item, sorted by type then name, even with the stash off for players',async()=>{
 game.user=gm;await set('stashEnabled',false);
 assert.deepEqual(api.stash.listItems().map(r=>[r.name,r.typeLabel,r.quantity,r.weight,r.value]),
  [['[TEST] Chalk','Loot',5,'—','—'],['[TEST] Rope','Loot',2,'10 lb','1 gp'],['[TEST] Dagger','Weapon',1,'1 lb','2 gp']]);
 assert.deepEqual(Object.keys(api.stash.listItems()[0]).sort(),['id','img','name','quantity','type','typeLabel','uuid','value','weight']);
});
test('players are refused while Player Access is off or the stash is off; allowed when both are on',async()=>{
 game.user=alice;
 await set('playerAccessEnabled',false);await set('stashEnabled',true);
 assert.throws(()=>api.stash.listItems(),/hidden by the GM/);
 await set('playerAccessEnabled',true);await set('stashEnabled',false);
 assert.throws(()=>api.stash.listItems(),/turned the party stash off/);
 await set('stashEnabled',true);
 assert.equal(api.stash.listItems().length,3);
});
test('no stash yet → []',async()=>{
 game.user=alice;actors.splice(0,1);
 try{assert.deepEqual(api.stash.listItems(),[]);}finally{actors.push(stash);}
});
