// 0.13.1: a container moves to and from the party stash with everything inside it, all or nothing.
// Mocked Foundry globals that copy dnd5e 6.0.6's container model: contents are separate Items on the same Actor whose
// system.container is the container's id, and deleting a container without deleteContents leaves its contents behind.
// Proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,containedItems,moveBundle,historyEntry,contentsNote} from '../scripts/core.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
let nextId=0;const freshId=()=>`id${String(++nextId).padStart(14,'0')}`;
globalThis.foundry={utils:{randomID:freshId},applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},[Symbol.iterator]:()=>m.values(),
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
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',true);await game.settings.set(ID,'stashVoteRequired',false);
const tick=()=>new Promise(r=>setTimeout(r,5));
const receipt=id=>sent.find(m=>m.type==='receipt'&&m.requestId===id);
const last=()=>api.stash.history().at(-1);
const byName=(actor,name)=>[...actor.items].find(i=>i.name===name);

/** [TEST] Backpack holding Rope ×3 and a Pouch, the Pouch holding Gem ×2. The backpack is equipped and flagged. */
function packFor(actor){
 const pack=actor.items.add({name:'[TEST] Backpack',type:'container',img:'pack.webp',system:{quantity:1,container:null,equipped:true,weight:{value:5,units:'lb'}},flags:{test:{mark:'pack'}}});
 actor.items.add({name:'[TEST] Rope',type:'loot',system:{quantity:3,container:pack.id,price:{value:1,denomination:'gp'}},flags:{test:{mark:'rope'}}});
 const pouch=actor.items.add({name:'[TEST] Pouch',type:'container',system:{quantity:1,container:pack.id}});
 actor.items.add({name:'[TEST] Gem',type:'loot',system:{quantity:2,container:pouch.id,attuned:true}});
 return pack;
}
/** The four pieces on `actor`, and that every link points at a container on the same Actor. */
function assertPackOn(actor,{topContainer=null}={}){
 const pack=byName(actor,'[TEST] Backpack'),rope=byName(actor,'[TEST] Rope'),pouch=byName(actor,'[TEST] Pouch'),gem=byName(actor,'[TEST] Gem');
 assert.ok(pack&&rope&&pouch&&gem,`all four items are on ${actor.name}`);
 assert.equal(pack.system.container,topContainer);
 assert.equal(rope.system.container,pack.id);assert.equal(pouch.system.container,pack.id);assert.equal(gem.system.container,pouch.id);
 assert.equal(rope.system.quantity,3);assert.equal(gem.system.quantity,2);
 assert.equal(pack.system.equipped,true,'equipped is kept as is (no reset, same as before)');assert.equal(gem.system.attuned,true,'attuned is kept as is');
 assert.deepEqual(rope.flags,{test:{mark:'rope'}});assert.deepEqual(rope.system.price,{value:1,denomination:'gp'});assert.deepEqual(pack.system.weight,{value:5,units:'lb'});
 return {pack,rope,pouch,gem};
}
const packNames=['[TEST] Backpack','[TEST] Rope','[TEST] Pouch','[TEST] Gem'];
const noneOf=actor=>assert.equal([...actor.items].filter(i=>packNames.includes(i.name)).length,0,`nothing of the pack is left on ${actor.name}`);
function clear(...list){for(const a of list)for(const i of [...a.items])i.delete();for(const a of list)a.fail={};}

test('containedItems: the item, then everything inside it at every depth; cycles visited once',()=>{
 const a={id:'a',system:{}},b={id:'b',system:{container:'a'}},c={id:'c',system:{container:'b'}},d={id:'d',system:{container:'x'}},loop={id:'x',system:{container:'c'}};
 assert.deepEqual(containedItems(a,[d,c,b,a]).map(i=>i.id),['a','b','c']);
 assert.deepEqual(containedItems(a,[a,b,c,loop,d]).map(i=>i.id),['a','b','c','x','d']);
 const self={id:'s',system:{container:'s'}};assert.deepEqual(containedItems(self,[self]).map(i=>i.id),['s']);
});
test('moveBundle: fresh ids, links remapped, the moved item leaves its own container, other data kept',()=>{
 const mk=(id,container,extra={})=>({id,system:{container,quantity:2,...extra},toObject(){return structuredClone({_id:id,name:id,folder:'f',system:this.system});}});
 const outer=mk('out',null),pack=mk('p','out',{equipped:true}),inner=mk('i','p'),stray=mk('s',null);
 let n=0;const b=moveBundle(pack,[outer,pack,inner,stray],{randomId:()=>`n${++n}`,strip:['folder']});
 assert.deepEqual(b.sourceIds,['p','i']);assert.equal(b.contents,1);
 assert.deepEqual(b.data,[{_id:'n1',name:'p',system:{container:null,quantity:2,equipped:true}},{_id:'n2',name:'i',system:{container:'n1',quantity:2}}]);
 assert.equal(pack.system.container,'out','the source item is not changed');
 assert.throws(()=>moveBundle(pack,[],{}),/randomId/);
 assert.equal(moveBundle(mk('q',null),[],{randomId:()=>'z'}).contents,0);
});
test('history: contents count is stored for containers only; older entries read as before',()=>{
 assert.equal(historyEntry({kind:'deposit',approval:'gm',item:{name:'Pack',contents:3}}).contents,3);
 assert.ok(!('contents' in historyEntry({kind:'deposit',approval:'gm',item:{name:'Rope'}})));
 assert.ok(!('contents' in historyEntry({kind:'deposit',approval:'gm',item:{name:'Empty Pack',contents:0}})));
 assert.equal(contentsNote(3),' (with 3 items inside)');assert.equal(contentsNote(1),' (with 1 item inside)');assert.equal(contentsNote(undefined),'');
});

test('bug repro: a player stashes a backpack and every item inside it goes along (Hub uses api.stash.deposit → same path)',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(pcA);
 await socketHandler({type:'stash-deposit',requestId:'d1',userId:'alice',itemUuid:pack.uuid},'alice');await tick();
 assert.equal(receipt('d1').ok,true);assert.equal(receipt('d1').message,'[TEST] Wren put [TEST] Backpack (with 3 items inside) in the party stash.');
 assertPackOn(stash);noneOf(pcA);
 const e=last();assert.deepEqual([e.kind,e.itemName,e.contents,e.actorName],['deposit','[TEST] Backpack',3,'[TEST] Wren']);
});
test('and back out: the GM takes the backpack to a character with its contents',async()=>{
 const pack=byName(stash,'[TEST] Backpack');
 assert.equal(await api.stash.withdraw(pack.id,'pcB'),'[TEST] Ash took [TEST] Backpack (with 3 items inside) from the party stash.');
 assertPackOn(pcB);noneOf(stash);assert.equal(last().contents,3);assert.equal(last().kind,'withdraw');
});
test('a player take-out with the vote on: the prompt names the contents, and accepting moves all of it',async()=>{
 clear(stash,pcA,pcB);packFor(stash);game.user=gm;await api.stash.setVoteRequired(true);
 const pack=byName(stash,'[TEST] Backpack');
 socketHandler({type:'stash-withdraw',requestId:'w1',userId:'alice',itemId:pack.id,actorId:'pcA'},'alice');await tick();
 const vr=sent.filter(m=>m.type==='stash-vote-request').at(-1);assert.equal(vr.item,'[TEST] Backpack');assert.equal(vr.contents,3);
 await socketHandler({type:'stash-vote',pollId:vr.pollId,userId:'bob',vote:'accept'},'bob');await tick();
 assert.equal(receipt('w1').ok,true);assertPackOn(pcA);noneOf(stash);assert.deepEqual([last().approval,last().contents],['accepted',3]);
 await api.stash.setVoteRequired(false);
});
test('drag and drop onto a character sheet goes through the same take-out',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(stash);
 assert.equal(handlers.on.get('dropActorSheetData')(pcB,null,{type:'Item',uuid:pack.uuid}),false);await tick();
 assertPackOn(pcB);noneOf(stash);
});
test('a container nested inside another moves with its own contents and leaves the outer one',async()=>{
 clear(stash,pcA,pcB);packFor(pcA);const pouch=byName(pcA,'[TEST] Pouch');
 assert.match(await api.stash.deposit(pouch.uuid),/\[TEST\] Pouch \(with 1 item inside\)/);
 const p2=byName(stash,'[TEST] Pouch'),g2=byName(stash,'[TEST] Gem');
 assert.equal(p2.system.container,null);assert.equal(g2.system.container,p2.id);assert.equal(byName(pcA,'[TEST] Gem'),undefined);
 assert.ok(byName(pcA,'[TEST] Backpack')&&byName(pcA,'[TEST] Rope'),'the rest of the backpack stays');
});
test('all or nothing: a refused create leaves the source untouched and tells the user',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(pcA);const n=api.stash.history().length;stash.fail.create=true;
 await socketHandler({type:'stash-deposit',requestId:'f1',userId:'alice',itemUuid:pack.uuid},'alice');await tick();
 assert.equal(receipt('f1').ok,false);assert.match(receipt('f1').message,/Could not move \[TEST\] Backpack.*Nothing was moved/);
 assertPackOn(pcA);assert.equal(stash.items.size,0);assert.equal(api.stash.history().length,n,'nothing logged as moved');
});
test('all or nothing: if any copy does not arrive, the partial copies are removed and the source is untouched',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(pcA);stash.fail.dropLast=true;
 await assert.rejects(api.stash.deposit(pack.uuid),/1 of 4 items did not arrive.*Nothing was moved/);
 assertPackOn(pcA);assert.equal(stash.items.size,0);
});
test('all or nothing: if the source cannot be cleared, the copies are removed again (no duplicates, nothing lost)',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(stash);stash.fail.delete=true;
 await assert.rejects(api.stash.withdraw(pack.id,'pcA'),/Nothing was moved/);
 assertPackOn(stash);noneOf(pcA);
});
test('permissions stay in the GM-side handler: a player cannot move a backpack from or to a character they do not own',async()=>{
 clear(stash,pcA,pcB);const pack=packFor(pcB);
 await socketHandler({type:'stash-deposit',requestId:'p1',userId:'alice',itemUuid:pack.uuid},'alice');await tick();
 assert.match(receipt('p1').message,/character you own/);assertPackOn(pcB);assert.equal(stash.items.size,0);
 clear(pcB);const s=packFor(stash);
 await socketHandler({type:'stash-withdraw',requestId:'p2',userId:'alice',itemId:s.id,actorId:'pcB'},'alice');await tick();
 assert.match(receipt('p2').message,/do not own/);assertPackOn(stash);noneOf(pcB);
});
test('GM copying a world container (Items sidebar) brings its world contents, without folders',async()=>{
 clear(stash,pcA,pcB);
 const pack=worldItems.add({name:'[TEST] Backpack',type:'container',folder:'F1',system:{quantity:1,container:null,equipped:true,weight:{value:5,units:'lb'}},flags:{test:{mark:'pack'}}});
 worldItems.add({name:'[TEST] Rope',type:'loot',folder:'F1',system:{quantity:3,container:pack.id,price:{value:1,denomination:'gp'}},flags:{test:{mark:'rope'}}});
 const pouch=worldItems.add({name:'[TEST] Pouch',type:'container',folder:'F1',system:{quantity:1,container:pack.id}});
 worldItems.add({name:'[TEST] Gem',type:'loot',folder:'F1',system:{quantity:2,container:pouch.id,attuned:true}});
 assert.equal(await api.stash.deposit(pack.uuid),'Copied [TEST] Backpack (with 3 items inside) into the party stash.');
 assertPackOn(stash);assert.ok([...stash.items].every(i=>i.folder===undefined));assert.equal(worldItems.size,4,'world items are copied, not moved');
});
test('plain items still move alone, with no contents note',async()=>{
 clear(stash,pcA,pcB);const rope=pcA.items.add({name:'[TEST] Rope',type:'loot',system:{quantity:3}});
 assert.equal(await api.stash.deposit(rope.uuid),'[TEST] Wren put [TEST] Rope in the party stash.');
 assert.equal(stash.items.size,1);assert.equal(pcA.items.size,0);assert.ok(!('contents' in last()));
});
