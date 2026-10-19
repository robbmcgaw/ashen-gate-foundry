// v0.6.0 party stash: take-out vote toggle and the persistent history log.
// Mocked Foundry globals: proves the logic, not live multi-client behaviour.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {ID,historyEntry,appendHistory,STASH_HISTORY_CAP,approvalLabel} from '../scripts/core.mjs';

test('history entry records who, what, quantity, approval and both clocks',()=>{
 const e=historyEntry({id:'h1',kind:'withdraw',approval:'accepted',user:{id:'u',name:'Alice'},actor:{id:'a',name:'Wren'},item:{name:'Rope',uuid:'Actor.a.Item.i',img:'rope.webp',quantity:2},worldTime:500,realTime:9});
 assert.deepEqual(e,{id:'h1',kind:'withdraw',approval:'accepted',moved:true,userId:'u',userName:'Alice',actorId:'a',actorName:'Wren',itemName:'Rope',itemUuid:'Actor.a.Item.i',img:'rope.webp',quantity:2,worldTime:500,realTime:9});
 assert.equal(historyEntry({kind:'withdraw',approval:'denied',item:{name:'x'}}).moved,false);
 assert.equal(historyEntry({kind:'withdraw',approval:'timed-out',item:{name:'x'}}).moved,false);
 assert.throws(()=>historyEntry({kind:'sell',approval:'gm'}),/deposit or withdraw/);
 assert.throws(()=>historyEntry({kind:'deposit',approval:'bribed'}),/approval/);
 assert.equal(approvalLabel({approval:'denied'}),'Party denied');
});
test('history is capped: oldest trimmed, input not mutated',()=>{
 const base=Array.from({length:5},(_,i)=>({id:`e${i}`}));const out=appendHistory(base,{id:'new'},5);
 assert.equal(out.length,5);assert.equal(out[0].id,'e1');assert.equal(out.at(-1).id,'new');assert.equal(base.length,5);assert.equal(base[0].id,'e0');
 assert.equal(appendHistory(undefined,{id:'a'}).length,1);assert.ok(STASH_HISTORY_CAP>=100);
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
globalThis.game={user:gm,users,actors,time:{worldTime:1000},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
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
const log=()=>api.stash.history();
const last=()=>log().at(-1);
const withdrawAs=async(id,user,itemId,actorId)=>{socketHandler({type:'stash-withdraw',requestId:id,userId:user,itemId,actorId},user);await tick();};

test('defaults: vote required is ON and history starts empty',async()=>{
 assert.equal(api.stash.isVoteRequired(),true);game.user=gm;await api.stash.setEnabled(true);assert.deepEqual(log(),[]);
});
test('toggle is GM-only and boolean',async()=>{
 game.user=alice;await assert.rejects(api.stash.setVoteRequired(false),/GM only/);assert.equal(api.stash.isVoteRequired(),true);
 game.user=gm;await assert.rejects(api.stash.setVoteRequired('no'),/Boolean/);
});
test('deposit by a player is logged with user, character and item',async()=>{
 const rope=pcA.items.add({name:'Rope',type:'loot',img:'rope.webp',system:{quantity:2}});
 await socketHandler({type:'stash-deposit',requestId:'d1',userId:'alice',itemUuid:rope.uuid},'alice');await tick();
 const e=last();assert.equal(e.kind,'deposit');assert.equal(e.approval,'not-required');assert.equal(e.userName,'Alice');assert.equal(e.actorName,'Wren');
 assert.equal(e.itemName,'Rope');assert.equal(e.quantity,2);assert.equal(e.img,'rope.webp');assert.match(e.itemUuid,/^Actor\.stash\.Item\./);assert.equal(e.worldTime,1000);assert.ok(e.realTime>0);
});
test('vote ON: accepted, denied and timed-out take-outs are all logged',async()=>{
 const rope=[...stash.items][0];
 await withdrawAs('v1','alice',rope.id,'pcA');let vr=voteRequest();
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'deny'},'bob');await tick();
 assert.deepEqual([last().kind,last().approval,last().moved],['withdraw','denied',false]);assert.ok(stash.items.get(rope.id));
 await withdrawAs('v2','alice',rope.id,'pcA');vr=voteRequest();
 for(const u of ['bob','carol'])await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:u,vote:'accept'},u);await tick();
 assert.deepEqual([last().approval,last().moved,last().actorName],['accepted',true,'Wren']);assert.equal(stash.items.size,0);
 const gem=stash.items.add({name:'Gem',type:'loot',system:{quantity:1}});
 mock.timers.enable({apis:['setTimeout']});
 try{socketHandler({type:'stash-withdraw',requestId:'v3',userId:'alice',itemId:gem.id,actorId:'pcA'},'alice');await Promise.resolve();await Promise.resolve();mock.timers.tick(60001);}finally{mock.timers.reset();}
 await tick();assert.deepEqual([last().approval,last().moved,last().itemName],['timed-out',false,'Gem']);assert.ok(stash.items.get(gem.id));
});
test('vote OFF: a player withdraws freely, no poll is sent, and it is logged as not required',async()=>{
 game.user=gm;await api.stash.setVoteRequired(false);const before=sent.filter(m=>m.type==='stash-vote-request').length;
 const gem=[...stash.items].find(i=>i.name==='Gem');
 await withdrawAs('f1','alice',gem.id,'pcA');
 assert.equal(receipt('f1').ok,true);assert.equal(sent.filter(m=>m.type==='stash-vote-request').length,before);
 assert.equal(stash.items.get(gem.id),undefined);assert.deepEqual([last().approval,last().kind,last().userName],['not-required','withdraw','Alice']);
});
test('vote OFF is enforced in the handler: ownership and stash gates still apply',async()=>{
 const gem=[...pcA.items].find(i=>i.name==='Gem');await socketHandler({type:'stash-deposit',requestId:'f2',userId:'alice',itemUuid:gem.uuid},'alice');await tick();
 const g2=[...stash.items].find(i=>i.name==='Gem');
 await withdrawAs('f3','alice',g2.id,'pcB');assert.match(receipt('f3').message,/do not own/);assert.ok(stash.items.get(g2.id));
});
test('vote back ON restores the poll',async()=>{
 game.user=gm;await api.stash.setVoteRequired(true);const g=[...stash.items].find(i=>i.name==='Gem');
 await withdrawAs('f4','alice',g.id,'pcA');assert.equal(voteRequest().item,'Gem');assert.equal(receipt('f4'),undefined);
 const vr=voteRequest();await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'carol',vote:'deny'},'carol');await tick();
});
test('GM moves are logged as GM with no vote, in both directions',async()=>{
 game.user=gm;const g=[...stash.items].find(i=>i.name==='Gem');await api.stash.withdraw(g.id,'pcB');
 assert.deepEqual([last().kind,last().approval,last().userName,last().actorName],['withdraw','gm','GM','Ash']);
 const moved=[...pcB.items].find(i=>i.name==='Gem');await api.stash.deposit(moved.uuid);
 assert.deepEqual([last().kind,last().approval,last().actorName],['deposit','gm','Ash']);
});
test('history survives a re-read from the stored setting, and players can read it only while the stash is on',async()=>{
 const stored=settings.get(`${ID}.stashHistory`).value;assert.ok(stored.length>=8);
 game.user=alice;assert.deepEqual(api.stash.history(),stored);
 game.user=gm;await api.stash.setEnabled(false);game.user=alice;assert.throws(()=>api.stash.history(),/turned the party stash off/);
 game.user=gm;await api.stash.setEnabled(true);
});
test('players cannot write, forge or clear the history',async()=>{
 game.user=alice;await assert.rejects(api.stash.clearHistory(),/GM only/);
 const n=log().length;
 await socketHandler({type:'stash-history',requestId:'x',userId:'alice',entry:{kind:'deposit'}},'alice');await tick();
 await socketHandler({type:'clear-history',requestId:'x2',userId:'alice'},'alice');await tick();
 assert.equal(log().length,n);const copy=api.stash.history();copy.length=0;assert.equal(log().length,n,'returned list is a copy');
});
test('the log is capped and trims the oldest entries',async()=>{
 game.user=gm;settings.get(`${ID}.stashHistory`).value=Array.from({length:STASH_HISTORY_CAP},(_,i)=>({id:`old${i}`,kind:'deposit',approval:'gm'}));
 const r=stash.items.add({name:'Cap',type:'loot',system:{}});await api.stash.withdraw(r.id,'pcA');
 const l=log();assert.equal(l.length,STASH_HISTORY_CAP);assert.equal(l[0].id,'old1');assert.equal(l.at(-1).itemName,'Cap');
});
test('GM can clear; the window shows a History tab to players and Clear only to the GM',async()=>{
 game.user=alice;const app=await api.stash.open();app.tab='inventory';app.stashTab='history';let html=await app._renderHTML();
 assert.ok(html.includes('data-stash-tab="history"'));assert.ok(html.includes('newest first'));assert.ok(!html.includes('stash-history-clear'));
 game.user=gm;html=await app._renderHTML();assert.ok(html.includes('stash-history-clear'));
 await api.stash.clearHistory();assert.deepEqual(log(),[]);assert.ok((await app._renderHTML()).includes('Nothing has moved'));
});
