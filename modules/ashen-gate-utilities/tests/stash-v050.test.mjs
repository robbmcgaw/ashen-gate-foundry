// v0.5.0 party stash: the any-deny consent rule, GM-executed moves and the player gates.
// Mocked Foundry globals: proves the logic, not the live Foundry UI or drag and drop.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {ID,stashRow,consentVoters,createPoll,recordVote,pollOutcome} from '../scripts/core.mjs';

test('consent voters are every other active non-GM user',()=>{
 const users=[{id:'gm',isGM:true,active:true},{id:'a',active:true},{id:'b',active:true},{id:'c',active:false}];
 assert.deepEqual(consentVoters(users,'a'),['b']);
});
test('any deny cancels, even when everyone else accepted',()=>{
 const p=createPoll({id:'p',requesterId:'a',voters:['b','c','d'],now:0});
 recordVote(p,{userId:'b',vote:'accept'});assert.equal(pollOutcome(p,1),'pending');
 recordVote(p,{userId:'c',vote:'deny'});assert.equal(pollOutcome(p,1),'denied');
 recordVote(p,{userId:'d',vote:'accept'});assert.equal(pollOutcome(p,1),'denied');
 recordVote(p,{userId:'c',vote:'accept'});assert.equal(pollOutcome(p,1),'denied','a deny cannot be taken back');
});
test('approval needs every voter; silence until the deadline expires; no voters approves',()=>{
 const p=createPoll({id:'p',requesterId:'a',voters:['b','c'],now:0,timeoutMs:1000});
 recordVote(p,{userId:'b',vote:'accept'});assert.equal(pollOutcome(p,999),'pending');assert.equal(pollOutcome(p,1000),'expired');
 recordVote(p,{userId:'c',vote:'accept'});assert.equal(pollOutcome(p,10),'approved');
 assert.equal(pollOutcome(createPoll({id:'q',requesterId:'a',voters:[]})),'approved');
 assert.deepEqual(createPoll({id:'r',requesterId:'a',voters:['a','b','b']}).voters,['b'],'requester never votes on their own request');
});
test('only listed voters can vote, with accept or deny',()=>{
 const p=createPoll({id:'p',requesterId:'a',voters:['b']});
 assert.throws(()=>recordVote(p,{userId:'a',vote:'accept'}),/not asked/);
 assert.throws(()=>recordVote(p,{userId:'b',vote:'maybe'}),/accept or deny/);
});
test('stash rows show icon, name, quantity, weight, value and type',()=>{
 const r=stashRow({id:'i1',uuid:'Actor.s.Item.i1',img:'rope.webp',name:'Rope',type:'loot',system:{quantity:2,weight:{value:10,units:'lb'},price:{value:1,denomination:'gp'}}},{typeLabel:t=>t.toUpperCase()});
 assert.deepEqual(r,{id:'i1',uuid:'Actor.s.Item.i1',img:'rope.webp',name:'Rope',quantity:2,weight:'10 lb',value:'1 gp',type:'loot',typeLabel:'LOOT'});
 const bare=stashRow({id:'i2',name:'Pebble',type:'loot',system:{weight:0}});assert.equal(bare.quantity,1);assert.equal(bare.weight,'—');assert.equal(bare.value,'—');
});

// ---- Integration through main.mjs ----
const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true},carol={id:'carol',name:'Carol',isGM:false,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values(),_m:m,
 add(data){const item={...structuredClone(data),id:data._id??`i${docs.size+1}`,documentName:'Item',parent:actor,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system)};},async delete(){m.delete(this.id);docs.delete(this.uuid);}};
  item.uuid=`Actor.${actor.id}.Item.${item.id}`;m.set(item.id,item);docs.set(item.uuid,item);return item;}};}
function mkActor(id,name,owner,flags={}){const a={id,name,type:owner?'character':'npc',documentName:'Actor',statuses:new Set(),effects:[],flags,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:(u,level)=>u.isGM||u.id===owner||(level==='LIMITED'),
 createEmbeddedDocuments:async(t,list)=>list.map(d=>{assert.equal(d._id,undefined,'new ids only');return a.items.add(d);}),update:async d=>{a.lastUpdate=d;}};a.items=mkItems(a);return a;}
const stash=mkActor('stash','Ashen Gate | Party Stash',null,{[ID]:{partyStash:true}});
const pcA=mkActor('pcA','Wren','alice'),pcB=mkActor('pcB','Ash','bob');
const users=[gm,alice,bob,carol];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,pcA,pcB];actors.get=id=>actors.find(a=>a.id===id);
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);
const tick=()=>new Promise(r=>setTimeout(r,5));
const receipt=id=>sent.find(m=>m.type==='receipt'&&m.requestId===id);
const voteRequest=()=>sent.filter(m=>m.type==='stash-vote-request').at(-1);

test('stash toggle is GM-only and gives players Observer only while on',async()=>{
 game.user=alice;await assert.rejects(api.stash.setEnabled(true),/GM only/);
 game.user=gm;await api.stash.setEnabled(true);assert.equal(api.stash.isEnabled(),true);assert.deepEqual(stash.lastUpdate,{'ownership.default':2});
 await api.stash.setEnabled(false);assert.deepEqual(stash.lastUpdate,{'ownership.default':0});
});
test('players cannot deposit or take out while the stash is off',async()=>{
 const rope=pcA.items.add({name:'Rope',type:'loot',system:{quantity:1}});
 game.user=alice;await assert.rejects(api.stash.deposit(rope.uuid),/turned the party stash off/);
 game.user=gm;await socketHandler({type:'stash-deposit',requestId:'d0',userId:'alice',itemUuid:rope.uuid},'alice');await tick();
 assert.equal(receipt('d0').ok,false);assert.ok(pcA.items.get(rope.id),'item untouched');
 await api.stash.setEnabled(true);
});
test('drag in: the GM client moves an item from the player\'s own sheet into the stash',async()=>{
 const rope=[...pcA.items][0];
 game.user=alice;const p=api.stash.deposit(rope.uuid);const req=sent.at(-1);assert.equal(req.type,'stash-deposit');assert.ok(pcA.items.get(rope.id),'player client does not move it');
 game.user=gm;await socketHandler(req,'alice');await tick();assert.equal(receipt(req.requestId).ok,true);
 assert.equal(pcA.items.get(rope.id),undefined);assert.equal([...stash.items].map(i=>i.name).join(),'Rope');
 game.user=alice;await socketHandler(receipt(req.requestId));assert.match(await p,/Rope/);game.user=gm;
});
test('a player cannot stash another player\'s item',async()=>{
 const lamp=pcB.items.add({name:'Lamp',type:'loot',system:{}});
 await socketHandler({type:'stash-deposit',requestId:'d2',userId:'alice',itemUuid:lamp.uuid},'alice');await tick();
 assert.match(receipt('d2').message,/character you own/);assert.ok(pcB.items.get(lamp.id));
});
test('take out: one deny keeps the item in the stash',async()=>{
 const rope=[...stash.items][0];
 socketHandler({type:'stash-withdraw',requestId:'w1',userId:'alice',itemId:rope.id,actorId:'pcA'},'alice');await tick();
 const vr=voteRequest();assert.deepEqual(vr.voters,['bob','carol']);assert.equal(vr.item,'Rope');assert.equal(vr.actor,'Wren');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'accept'},'bob');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'carol',vote:'deny'},'carol');
 await tick();
 assert.equal(receipt('w1').ok,false);assert.match(receipt('w1').message,/denied/);assert.ok(stash.items.get(rope.id),'still in stash');
 assert.equal(sent.filter(m=>m.type==='stash-poll-closed'&&m.pollId===vr.pollId)[0].outcome,'denied');
});
test('take out: forged or outsider votes do not count; all accepts move it to the requester',async()=>{
 const rope=[...stash.items][0];
 socketHandler({type:'stash-withdraw',requestId:'w2',userId:'alice',itemId:rope.id,actorId:'pcA'},'alice');await tick();
 const vr=voteRequest();
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'carol',vote:'accept'},'alice');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'alice',vote:'accept'},'alice');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'accept'},'bob');
 assert.equal(receipt('w2'),undefined,'still waiting on Carol');
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'carol',vote:'accept'},'carol');
 await tick();
 assert.equal(receipt('w2').ok,true);assert.equal(stash.items.size,0);assert.equal([...pcA.items].map(i=>i.name).join(),'Rope');
});
test('take out: silence until the deadline cancels',async()=>{
 const gem=stash.items.add({name:'Gem',type:'loot',system:{quantity:3}});
 mock.timers.enable({apis:['setTimeout']});
 try{
  socketHandler({type:'stash-withdraw',requestId:'w3',userId:'alice',itemId:gem.id,actorId:'pcA'},'alice');
  await Promise.resolve();await Promise.resolve();
  socketHandler({type:'stash-vote',pollId:voteRequest().pollId,userId:'bob',vote:'accept'},'bob');
  mock.timers.tick(60001);
 }finally{mock.timers.reset();}
 await tick();
 assert.match(receipt('w3').message,/in time/);assert.ok(stash.items.get(gem.id));
});
test('a player cannot take an item into a character they do not own',async()=>{
 const gem=[...stash.items][0];
 await socketHandler({type:'stash-withdraw',requestId:'w4',userId:'alice',itemId:gem.id,actorId:'pcB'},'alice');await tick();
 assert.match(receipt('w4').message,/do not own/);assert.ok(stash.items.get(gem.id));
});
test('the GM moves freely, with no vote',async()=>{
 const before=sent.filter(m=>m.type==='stash-vote-request').length;const gem=[...stash.items][0];
 game.user=gm;assert.match(await api.stash.withdraw(gem.id,'pcB'),/Ash took Gem/);
 assert.equal(sent.filter(m=>m.type==='stash-vote-request').length,before);assert.equal(stash.items.get(gem.id),undefined);
 const moved=[...pcB.items].find(i=>i.name==='Gem');assert.match(await api.stash.deposit(moved.uuid),/party stash/);assert.ok([...stash.items].some(i=>i.name==='Gem'));
});
test('dropping a stash item on a sheet is intercepted: no native copy, consent request instead',async()=>{
 const gem=[...stash.items][0];game.user=alice;
 const result=handlers.on.get('dropActorSheetData')(pcA,{},{type:'Item',uuid:gem.uuid});
 assert.equal(result,false);await tick();const req=sent.at(-1);assert.equal(req.type,'stash-withdraw');assert.equal(req.itemId,gem.id);assert.equal(req.actorId,'pcA');
 await socketHandler({type:'receipt',requestId:req.requestId,userId:'alice',ok:false,message:'test done'});
 assert.equal(handlers.on.get('dropActorSheetData')(pcA,{},{type:'Item',uuid:'Item.world1'}),undefined,'other drops are left alone');
 game.user=gm;
});
test('stash window lists items with details and opens sheets; players see it only when on',async()=>{
 game.user=alice;const app=await api.stash.open();const html=await app._renderHTML();
 for(const s of ['Gem','Loot','Qty','Weight (each)','Value (each)','data-open-item=','draggable="true"','Take into','Drop items here'])assert.ok(html.includes(s),s);
 game.user=gm;await api.stash.setEnabled(false);game.user=alice;
 assert.ok((await app._renderHTML()).includes('turned the party stash off'));
 await assert.rejects(api.stash.open(),/turned the party stash off/);game.user=gm;
});
