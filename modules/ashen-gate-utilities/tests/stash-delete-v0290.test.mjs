// 0.29.0: Delete… on a party stash item (whole stack, part of a stack, container with contents).
// Mocked Foundry globals that copy dnd5e 6.0.6's container model: contents are separate Items on the same Actor whose
// system.container is the container's id, and deleting a container without deleteContents leaves its contents behind.
// Proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,planStashDelete,historyEntry} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
let nextId=0;const freshId=()=>`id${String(++nextId).padStart(14,'0')}`;
globalThis.foundry={utils:{randomID:freshId},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},get contents(){return [...m.values()];},[Symbol.iterator]:()=>m.values(),
 add(data){const id=data._id??freshId();const item={...structuredClone(data),id,documentName:'Item',parent:actor,
   toObject(){const {id:_i,documentName:_d,parent:_p,uuid:_u,toObject:_t,delete:_x,...rest}=this;return structuredClone({...rest,_id:this.id});},
   // dnd5e: deleting a container on its own (no deleteContents) leaves its contents on the Actor.
   async delete(){m.delete(this.id);docs.delete(this.uuid);return this;}};
  item.uuid=actor?`Actor.${actor.id}.Item.${id}`:`Item.${id}`;m.set(id,item);docs.set(item.uuid,item);return item;}};}
function mkActor(id,name,owner,flags={}){const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,fail:{},
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u)=>u.isGM||u.id===owner,
 async createEmbeddedDocuments(t,list,o={}){
  if(a.fail.create)throw Error('Server refused the create');
  const out=[];for(const [n,d] of list.entries()){if(a.fail.dropLast&&n===list.length-1)continue;out.push(a.items.add(o.keepId?d:{...d,_id:undefined}));}return out;},
 async deleteEmbeddedDocuments(t,ids){if(a.fail.delete)throw Error('Server refused the delete');return Promise.all(ids.map(i=>a.items.get(i)?.delete()));},
 update:async d=>{a.lastUpdate=d;}};a.items=mkItems(a);return a;}
const stash=mkActor('stash','Party Stash',null,{[ID]:{partyStash:true}});
const pcA=mkActor('pcA','[TEST] Wren','alice'),pcB=mkActor('pcB','[TEST] Ash','bob');
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,pcA,pcB];actors.get=id=>actors.find(a=>a.id===id);
const worldItems=mkItems(null);
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,items:worldItems,time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',container:'Container'}}};
const warns=[];globalThis.ui={notifications:{info:()=>{},warn:m=>warns.push(m),error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',true);await game.settings.set(ID,'stashVoteRequired',false);
const tick=()=>new Promise(r=>setTimeout(r,5));
const receipt=id=>sent.find(m=>m.type==='receipt'&&m.requestId===id);
const last=()=>api.stash.history().at(-1);
const byName=(actor,name)=>[...actor.items].find(i=>i.name===name);


const carol={id:'carol',name:'Carol',isGM:false,active:true};users.push(carol);
const tweak=i=>{Object.defineProperty(i,'update',{enumerable:false,value:async d=>{for(const [k,v] of Object.entries(d)){if(k==='system.quantity')i.system.quantity=v;}return i;}});return i;};
const put=(name,q,extra={})=>tweak(stash.items.add({name,type:'loot',img:'x.webp',system:{quantity:q,container:null,...extra}}));
const del=async(who,itemId,quantity)=>{game.user=who;try{return await api.stash.deleteItem(itemId,quantity);}finally{game.user=gm;}};
const playerDel=async(userId,itemId,quantity,rid)=>{await socketHandler({type:'stash-delete',requestId:rid,userId,itemId,quantity},userId);await tick();return receipt(rid);};
function clear(){for(const i of [...stash.items])i.delete();}

test('planStashDelete: all by default, part of a stack, bad numbers, containers whole',()=>{
 assert.deepEqual(planStashDelete({quantity:5}),{ok:true,remove:5,whole:true,left:0});
 assert.deepEqual(planStashDelete({quantity:5,requested:'all'}),{ok:true,remove:5,whole:true,left:0});
 assert.deepEqual(planStashDelete({quantity:5,requested:'2'}),{ok:true,remove:2,whole:false,left:3});
 assert.equal(planStashDelete({quantity:5,requested:5}).whole,true);
 for(const bad of [0,-1,1.5,'x'])assert.equal(planStashDelete({quantity:5,requested:bad}).ok,false);
 assert.match(planStashDelete({quantity:5,requested:6,name:'Rope'}).reason,/only 5 of Rope/);
 assert.equal(planStashDelete({quantity:3,requested:1,contents:2,name:'Pack'}).ok,false);
 assert.equal(planStashDelete({quantity:3,contents:2}).whole,true);
});
test('history entry: delete kind keeps quantity and what is left',()=>{
 const e=historyEntry({kind:'delete',approval:'gm',item:{name:'Rope',quantity:2,left:3}});
 assert.deepEqual([e.kind,e.quantity,e.left,e.moved],['delete',2,3,true]);
 assert.ok(!('left' in historyEntry({kind:'delete',approval:'gm',item:{name:'Rope',quantity:2}})));
 assert.throws(()=>historyEntry({kind:'bogus',approval:'gm'}),/deposit or withdraw/);
});
test('GM deletes a whole stack and a log entry says who, what and how many',async()=>{
 clear();const rope=put('[TEST] Rope',5);
 assert.equal(await del(gm,rope.id),'GM deleted [TEST] Rope from the party stash.');
 assert.equal(stash.items.get(rope.id),undefined);
 const e=last();assert.deepEqual([e.kind,e.userName,e.itemName,e.quantity,e.approval],['delete','GM','[TEST] Rope',5,'gm']);
});
test('part of a stack: quantity drops, the item stays, the log says how many and how many are left',async()=>{
 clear();const rope=put('[TEST] Rope',5);
 assert.equal(await del(gm,rope.id,2),'GM deleted 2 of [TEST] Rope from the party stash.');
 assert.equal(stash.items.get(rope.id).system.quantity,3);
 const e=last();assert.deepEqual([e.quantity,e.left],[2,3]);
 await assert.rejects(()=>del(gm,rope.id,4),/only 3/);await assert.rejects(()=>del(gm,rope.id,0),/whole number/);
 assert.equal(stash.items.get(rope.id).system.quantity,3,'refused deletes change nothing');
});
test('a player who can take may delete (through the GM client); the log names the player',async()=>{
 clear();const rope=put('[TEST] Rope',4);const before=api.stash.history().length;
 const r=await playerDel('alice',rope.id,1,'p1');
 assert.equal(r.ok,true);assert.equal(r.message,'Alice deleted 1 of [TEST] Rope from the party stash.');
 assert.equal(rope.system.quantity,3);
 const e=last();assert.deepEqual([api.stash.history().length-before,e.userName,e.approval,e.kind],[1,'Alice','not-required','delete']);
});
test('the player path is enforced on the GM client: no character, Player Access off, stash off, gone items',async()=>{
 clear();const rope=put('[TEST] Rope',2);const n=api.stash.history().length;
 const noPc=await playerDel('carol',rope.id,undefined,'c1');assert.equal(noPc.ok,false);assert.match(noPc.error??noPc.message,/character you own/);
 await game.settings.set(ID,'playerAccessEnabled',false);
 const off=await playerDel('alice',rope.id,undefined,'c2');assert.equal(off.ok,false);
 await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',false);
 const stashOff=await playerDel('alice',rope.id,undefined,'c3');assert.equal(stashOff.ok,false);
 await game.settings.set(ID,'stashEnabled',true);
 const gone=await playerDel('alice','nope',undefined,'c4');assert.equal(gone.ok,false);assert.match(gone.error??gone.message,/no longer in the stash/);
 const bad=await playerDel('alice',rope.id,'abc','c5');assert.equal(bad.ok,false);
 assert.ok(stash.items.get(rope.id),'nothing was deleted');assert.equal(api.stash.history().length,n,'refusals write no entry');
 game.user=carol;await assert.rejects(()=>api.stash.deleteItem(rope.id),/character you own/);game.user=gm;
});
test('a container is deleted whole, with everything it holds; part of a container is refused',async()=>{
 clear();
 const pack=tweak(stash.items.add({name:'[TEST] Backpack',type:'container',system:{quantity:1,container:null}}));
 stash.items.add({name:'[TEST] Rope',type:'loot',system:{quantity:3,container:pack.id}});
 const pouch=stash.items.add({name:'[TEST] Pouch',type:'container',system:{quantity:1,container:pack.id}});
 stash.items.add({name:'[TEST] Gem',type:'loot',system:{quantity:2,container:pouch.id}});
 const other=put('[TEST] Lamp',1);
 pack.system.quantity=2;await assert.rejects(()=>del(gm,pack.id,1),/only be deleted whole/);assert.equal(stash.items.size,5);
 pack.system.quantity=1;
 assert.equal(await del(gm,pack.id),'GM deleted [TEST] Backpack (with 3 items inside) from the party stash.');
 assert.deepEqual([...stash.items].map(i=>i.name),['[TEST] Lamp']);assert.equal(last().contents,3);
});
test('a failed delete leaves the stash alone and writes no entry; take-out still works',async()=>{
 clear();const rope=put('[TEST] Rope',2);const n=api.stash.history().length;
 stash.fail.delete=true;await assert.rejects(()=>del(gm,rope.id),/Nothing was deleted/);stash.fail={};
 assert.ok(stash.items.get(rope.id));assert.equal(api.stash.history().length,n);
 assert.equal(await api.stash.withdraw(rope.id,'pcB'),'[TEST] Ash took [TEST] Rope from the party stash.');
 assert.equal(last().kind,'withdraw');
});
test('Delete… shows on every row for the GM and for a player who can take, not for one who cannot; the embed forwards the action',async()=>{
 clear();put('[TEST] Rope',2);
 const render=(user,actorId)=>{game.user=user;let html='';const el={isConnected:true,classList:{add(){},remove(){}},addEventListener(){},contains:()=>true,querySelector:()=>null,set innerHTML(v){html=v;},get innerHTML(){return html;}};
  const h=api.embed.mount(el,{actorId});const out=html;h.unmount();game.user=gm;return out;};
 await tick();
 assert.match(render(gm,'pcA'),/data-action="stash-delete"[^>]*aria-label="Delete \[TEST\] Rope…"/);
 assert.match(render(alice,'pcA'),/data-action="stash-delete"/);
 assert.doesNotMatch(render(carol,''),/data-action="stash-delete"/);
 assert.match(render(alice,'pcA'),/data-action="stash-take"/,'Take is unchanged');
});
