/** Rewards R1 (0.14.0): reward drops, holding copies, grants, missing items and the item-id backfill.
 * In-memory Foundry V14-shaped mocks. It is NOT a Foundry browser runtime test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition} from '../scripts/core.mjs';
const ns='ashen-gate-factions';
const hooks=new Map(),socketHandlers=new Map(),notes=[];
globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn),once:(name,fn)=>hooks.set(name,fn)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
globalThis.window={confirm:()=>true,prompt:()=>null};
class V2{async render(){this.rendered=true;return this;}async close(){this.rendered=false;return this;}async _prepareContext(){return{};}async _onRender(){}}
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C}},utils:{randomID:()=>`R${String(ctr++).padStart(15,'0')}`}};
const flagged={getFlag(mod,key){return this.flags?.[mod]?.[key];}};

// Journals (definitions, claims, views).
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
let jn=0;
function makeJournal(data){const doc={...flagged,id:`J${++jn}`,name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  async setFlag(mod,key,val){this.flags[mod]??={};this.flags[mod][key]=structuredClone(val);return this;},
  async update(p){if(p.name!==undefined)this.name=p.name;if(p.folder!==undefined)this.folder=p.folder;if(p.ownership)this.ownership=structuredClone(p.ownership);for(const [k,v] of Object.entries(p)){if(!k.startsWith('flags.'))continue;const [,mod,flag]=k.split('.');this.flags[mod]??={};this.flags[mod][flag]=structuredClone(v);}return this;},
  testUserPermission(user,level){return Boolean(user.isGM||(this.ownership[user.id]??this.ownership.default)>=level);}};
  journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>makeJournal(x),updateDocuments:async rows=>{for(const r of rows)await journal.get(r._id).update(r);return rows;}};

// Folders (Journal storage + the Item holding folder).
const folders=[];
globalThis.Folder={create:async data=>{const f={...flagged,id:`F${folders.length+1}`,name:data.name,type:data.type,folder:data.folder??null,flags:structuredClone(data.flags??{})};folders.push(f);return f;}};

// Items: world collection, Actor items, compendium-free.
function makeItem(row,parent=null){const id=row._id;const doc={...flagged,id,_id:id,documentName:'Item',name:row.name,img:row.img??null,type:row.type??'loot',flags:structuredClone(row.flags??{}),
  system:structuredClone(row.system??{}),folder:row.folder??null,ownership:structuredClone(row.ownership??{}),parent,pack:null,
  get uuid(){return parent?`${parent.uuid}.Item.${id}`:`Item.${id}`;},
  toObject(){return structuredClone({_id:id,name:this.name,img:this.img,type:this.type,flags:this.flags,system:this.system,folder:this.folder,sort:0,ownership:this.ownership});}};
  return doc;}
const worldItems=[];worldItems.get=id=>worldItems.find(i=>i.id===id);Object.defineProperty(worldItems,'contents',{get:()=>[...worldItems]});
let failWorldCreate=false;
const ItemImpl={async createDocuments(data,opts){assert.equal(opts?.keepId,true);const made=data.map(r=>makeItem(r));worldItems.push(...made);if(failWorldCreate)throw Error('disk full');return made;},
  async deleteDocuments(ids){for(const id of ids){const i=worldItems.findIndex(x=>x.id===id);if(i>=0)worldItems.splice(i,1);}return ids;}};
globalThis.Item={implementation:ItemImpl};

const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
function makeActor(id,type,owner){const actor={id,name:`[TEST] ${id}`,type,ownership:owner?{[owner.id]:3}:{},uuid:`Actor.${id}`,documentName:'Actor',items:[],failAfter:null,
  testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=level;},
  async createEmbeddedDocuments(type,data,opts){assert.equal(type,'Item');assert.equal(opts?.keepId,true);const made=[];
    for(const row of data){if(this.failAfter!==null&&made.length>=this.failAfter)throw Error('connection lost');const doc=makeItem(row,this);this.items.push(doc);made.push(doc);}return made;},
  async deleteEmbeddedDocuments(type,ids){this.items=this.items.filter(i=>!ids.includes(i.id));return ids;}};
  return actor;}
const hero=makeActor('HERO','character',p1),hero2=makeActor('HERO2','character',p1),beast=makeActor('BEAST','npc',null);
const actors=[hero,hero2,beast];actors.get=id=>actors.find(a=>a.id===id);
const mgr=(sourceId,extra={})=>({'ashen-gate-manager':{source:{sourceId,status:'approved',...extra}}});
const world=(id,name,flags={},system={})=>{const d=makeItem({_id:id,name,img:`icons/${id}.webp`,flags,system});worldItems.push(d);return d;};
const blade=world('W1','[TEST] Rusted Blade',mgr('ITEM-TEST-RUSTED-BLADE'));
world('W2','[TEST] Decoy'); // what the uuid points at once the test re-links it
const plain=world('W3','[TEST] Plain Cloak');
const draught=world('W4','[TEST] Healing Draught',mgr('ITEM-TEST-HEALING-DRAUGHT'));
// The beast carries a sack (a container) with a fang inside.
const sack=makeItem({_id:'E1',name:'[TEST] Beast Sack',type:'container',img:'icons/sack.webp',flags:mgr('ITEM-TEST-BEAST-SACK'),system:{quantity:1}},beast);
const fang=makeItem({_id:'E2',name:'[TEST] Fang',system:{container:'E1',quantity:3}},beast);
beast.items.push(sack,fang);
const journalDoc=makeJournal({name:'[TEST] Lore'});
const docsByUuid=()=>new Map([...worldItems,...actors.flatMap(a=>a.items),journalDoc].map(d=>[d.uuid??`JournalEntry.${d.id}`,d]));
globalThis.fromUuid=async uuid=>docsByUuid().get(uuid)??null;

const settings={},mod={api:null};
globalThis.game={user:gm,users,actors,journal,folders,items:worldItems,modules:{get:()=>mod},
  settings:{register:(m,k,v)=>{settings[k]=v.default;},get:(m,k)=>settings[k],set:async(m,k,v)=>settings[k]=v},
  socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notes.push(s),warn:s=>notes.push(`WARN ${s}`),error:s=>notes.push(`ERROR ${s}`)}};

const f0=makeFaction({id:'FACTION-QA-R1',trackId:'RENOWN-QA-R1',name:'[TEST] Reward Guild'});
const defDoc=makeJournal({name:f0.name,flags:{[ns]:{faction:sourceDefinition(f0)}}});
await import('../scripts/module.mjs');
hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const def=()=>defDoc.getFlag(ns,'faction');
const groupDoc=journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id==='FACTION-QA-R1');
const milestone=f0.renown_track.milestones[0].id;
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
await actions.select.call(dashboard,null,{dataset:{id:'FACTION-QA-R1'}});
const root={dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},contains:()=>false};
dashboard.element=root;await dashboard._onRender({},{});
const zone={dataset:{audience:'group',milestone}};
async function drop(data){notes.length=0;await root.listeners.drop({target:{closest:sel=>sel==='[data-reward-drop]'?zone:null},preventDefault(){},dataTransfer:{getData:()=>JSON.stringify(data)}});}
const rewardNamed=name=>def().rewards.find(r=>r.name===name);
const claimState=()=>groupDoc.getFlag(ns,'groupClaims');
async function claim(reward){const s=structuredClone(claimState());s.claims[reward.id]={request_id:`AGF-CLAIM-${reward.id}`,status:'pending',reward_id:reward.id,milestone_id:reward.milestone_id,requester_id:'p1',requested_at:'2026-10-21T00:00:00Z'};await groupDoc.setFlag(ns,'groupClaims',s);}
async function approve(reward,recipient=hero){notes.length=0;dashboard.element={querySelector:()=>({value:recipient.id})};
  await actions.resolveRequest.call(dashboard,null,{dataset:{doc:groupDoc.id,key:reward.id,claim:'1',mode:'approve'}});dashboard.element=root;return claimState().claims[reward.id];}

test('a world Item dropped on a reward level stores uuid, item_id and img',async()=>{
  await drop({type:'Item',uuid:'Item.W1'});
  const r=rewardNamed('[TEST] Rusted Blade');
  assert.ok(r);assert.equal(r.kind,'uuid');assert.equal(r.uuid,'Item.W1');assert.equal(r.item_id,'ITEM-TEST-RUSTED-BLADE');assert.equal(r.img,'icons/W1.webp');
  await drop({type:'Item',uuid:'Item.W3'});
  assert.ok(!('item_id' in rewardNamed('[TEST] Plain Cloak')),'no permanent id: the key is left out');
});

test('an Item dropped from an NPC becomes a GM-only holding copy with its contents; the NPC keeps its item',async()=>{
  const before=JSON.stringify(beast.items.map(i=>i.toObject()));
  await drop({type:'Item',uuid:'Actor.BEAST.Item.E1'});
  assert.equal(JSON.stringify(beast.items.map(i=>i.toObject())),before);
  const folder=folders.find(f=>f.type==='Item'&&f.name==='Renown Rewards');
  const backups=folders.find(f=>f.type==='Item'&&f.name==='Backups'),root=folders.find(f=>f.type==='Item'&&f.name==='Ashen Gate');
  assert.ok(folder&&backups&&root&&!root.folder&&backups.folder===root.id&&folder.folder===backups.id,'held copies file under Ashen Gate / Backups / Renown Rewards');
  const r=rewardNamed('[TEST] Beast Sack'),copy=worldItems.find(i=>i.uuid===r.uuid);
  assert.ok(copy&&copy.id!=='E1');assert.equal(copy.folder,folder.id);assert.equal(copy.ownership.default,0);
  assert.equal(copy.getFlag(ns,'holding').from,'Actor.BEAST');
  assert.equal(r.item_id,'ITEM-TEST-BEAST-SACK');
  const inside=worldItems.filter(i=>i.system.container===copy.id);
  assert.deepEqual(inside.map(i=>[i.name,i.folder,i.ownership.default]),[['[TEST] Fang',folder.id,0]]);
  await drop({type:'Item',uuid:'Actor.BEAST.Item.E2'});
  assert.equal(folders.filter(f=>f.type==='Item').length,3,'the folders are created once');
});

test('a Journal or a folder on the reward zone is refused and nothing is stored',async()=>{
  const before=def().rewards.length;
  await drop({type:'JournalEntry',uuid:`JournalEntry.${journalDoc.id}`});
  assert.deepEqual(notes,['WARN Rewards take items. Drop journals and other documents on the info list.']);
  await drop({type:'Folder',uuid:'Folder.X'});
  assert.deepEqual(notes,['WARN Drop items one at a time.']);
  await drop({type:'Item',uuid:'Item.NOPE'});
  assert.deepEqual(notes,["WARN That item no longer exists or you can't see it."]);
  assert.equal(def().rewards.length,before);
});

test('grant: the permanent id wins over the uuid',async()=>{
  const r=rewardNamed('[TEST] Rusted Blade'),f=structuredClone(def());f.rewards.find(x=>x.id===r.id).uuid='Item.W2';await defDoc.update({[`flags.${ns}.faction`]:f});
  await claim(r);const c=await approve(r);
  assert.equal(c.status,'claimed');assert.equal(c.delivered_to,'HERO');
  const got=hero.items.filter(i=>i.getFlag(ns,'claimId')===c.request_id);
  assert.deepEqual(got.map(i=>i.name),['[TEST] Rusted Blade']);
  assert.equal(got[0].getFlag(ns,'rewardId'),r.id);assert.equal(got[0].getFlag(ns,'factionId'),'FACTION-QA-R1');
});

test('grant: container contents arrive inside the container, without the holding flag',async()=>{
  const r=rewardNamed('[TEST] Beast Sack');await claim(r);const c=await approve(r);
  const got=hero.items.filter(i=>i.getFlag(ns,'claimId')===c.request_id),root=got.find(i=>i.name==='[TEST] Beast Sack'),inner=got.find(i=>i.name==='[TEST] Fang');
  assert.ok(root&&inner);assert.equal(inner.system.container,root.id);assert.equal(root.system.container??null,null);assert.equal(inner.system.quantity,3);
  assert.ok(got.every(i=>!i.getFlag(ns,'holding')));
});

test('grant: an Actor that already has the claim tag gets nothing new',async()=>{
  const r=rewardNamed('[TEST] Rusted Blade'),s=structuredClone(claimState());s.claims[r.id].status='pending';await groupDoc.setFlag(ns,'groupClaims',s);
  const count=hero.items.length,c=await approve(r);
  assert.equal(hero.items.length,count);assert.equal(c.status,'claimed');
});

test('grant: a failure part-way rolls back and the claim stays pending',async()=>{
  const r=rewardNamed('[TEST] Beast Sack'),s=structuredClone(claimState());delete s.claims[r.id];await groupDoc.setFlag(ns,'groupClaims',s);await claim(r);
  hero2.failAfter=1;const c=await approve(r,hero2);hero2.failAfter=null;
  assert.equal(hero2.items.length,0);assert.equal(c.status,'pending');assert.ok(notes.some(n=>n.includes('connection lost')));
});

test('a missing reward item keeps the request pending and tells the GM',async()=>{
  const r=rewardNamed('[TEST] Plain Cloak');await ItemImpl.deleteDocuments(['W3']);
  await claim(r);const count=hero.items.length,c=await approve(r);
  assert.equal(c.status,'pending');assert.equal(hero.items.length,count);
  assert.deepEqual(notes,['ERROR Renown: The reward item is missing ([TEST] Plain Cloak). Fix the reward, then approve again.']);
});

test('backfill: dry run writes nothing; a real run fills only empty ids; re-running changes nothing; claims untouched',async()=>{
  // Older rewards: one whose item has a permanent id, one without, one already filled (never overwritten).
  const f=structuredClone(def()),base={audience:'group',milestone_id:milestone,teaser:'',description:'',tags:[],behavior:'one_time',usage_limit:0,kind:'uuid'};
  world('W5','[TEST] Old Lantern');
  f.rewards.push({...base,id:'rw-old-1',key:'rw_old_1',name:'[TEST] Old Draught',uuid:'Item.W4'},{...base,id:'rw-old-2',key:'rw_old_2',name:'[TEST] Old Lantern',uuid:'Item.W5'},{...base,id:'rw-old-3',key:'rw_old_3',name:'[TEST] Kept',uuid:'Item.W4',item_id:'ITEM-TEST-KEEP-ME'});
  await defDoc.update({[`flags.${ns}.faction`]:f});
  const claims=JSON.stringify(claimState()),before=JSON.stringify(def());
  const dry=await mod.api.rewards.backfillItemIds();
  assert.equal(mod.api.rewards.contract,'ag-renown-rewards/1');
  assert.equal(JSON.stringify(def()),before,'dry run wrote nothing');
  assert.deepEqual(dry.fill.map(x=>[x.rewardId,x.itemId]),[['rw-old-1','ITEM-TEST-HEALING-DRAUGHT']]);
  assert.ok(dry.noId.some(x=>x.rewardId==='rw-old-2'));
  assert.ok(dry.missing.some(x=>x.reward==='[TEST] Plain Cloak'));
  const real=await mod.api.rewards.backfillItemIds({dryRun:false});
  assert.equal(real.written,1);
  const after=def().rewards,by=id=>after.find(r=>r.id===id);
  assert.equal(by('rw-old-1').item_id,'ITEM-TEST-HEALING-DRAUGHT');
  assert.equal(by('rw-old-3').item_id,'ITEM-TEST-KEEP-ME');
  assert.ok(!('item_id' in by('rw-old-2')));
  assert.deepEqual(after.map(r=>r.uuid),JSON.parse(before).rewards.map(r=>r.uuid),'no uuid changed');
  const once=JSON.stringify(def()),again=await mod.api.rewards.backfillItemIds({dryRun:false});
  assert.equal(again.written,0);assert.equal(JSON.stringify(def()),once);
  assert.equal(JSON.stringify(claimState()),claims,'claims untouched');
});

test('backfill is GM only in the API',async()=>{
  game.user=p1;
  try{await assert.rejects(()=>mod.api.rewards.backfillItemIds({dryRun:true}),/GM authorization required/);}
  finally{game.user=gm;}
});

test('saving a reward fills its own empty item_id',async()=>{
  const f=structuredClone(def());f.rewards.find(r=>r.id==='rw-old-2').uuid='Item.W1';await defDoc.update({[`flags.${ns}.faction`]:f});
  globalThis.foundry.applications.api.DialogV2=undefined;
  const fields={name:'[TEST] Old Lantern',teaser:'',description:'',tags:'',behavior:'one_time',usage_limit:'0'};
  let i=0;const keys=Object.keys(fields);globalThis.window.prompt=()=>fields[keys[i++]];
  // formDialog without DialogV2 asks one prompt per field.
  await actions.editReward.call(dashboard,null,{dataset:{reward:'rw-old-2'}});
  globalThis.window.prompt=()=>null;
  const r=def().rewards.find(x=>x.id==='rw-old-2');
  assert.equal(r.item_id,'ITEM-TEST-RUSTED-BLADE');
});

test('removing a reward deletes its holding copy and contents only after the confirm',async()=>{
  await drop({type:'Item',uuid:'Actor.BEAST.Item.E1'});
  const rewards=def().rewards.filter(r=>r.name==='[TEST] Beast Sack'),fresh=rewards.at(-1),copy=worldItems.find(i=>i.uuid===fresh.uuid);
  assert.ok(copy);
  globalThis.window.confirm=()=>false;
  await actions.removeReward.call(dashboard,null,{dataset:{reward:fresh.id}});
  assert.ok(worldItems.includes(copy),'cancelled: copy kept');
  globalThis.window.confirm=()=>true;
  await actions.removeReward.call(dashboard,null,{dataset:{reward:fresh.id}});
  assert.ok(!def().rewards.some(r=>r.id===fresh.id));
  assert.ok(!worldItems.includes(copy));
  assert.ok(!worldItems.some(i=>i.system.container===copy.id),'contents removed with it');
  const claimed=rewards[0];
  await actions.removeReward.call(dashboard,null,{dataset:{reward:claimed.id}});
  assert.ok(def().rewards.some(r=>r.id===claimed.id),'a reward with claims is never removed');
});

test('a failed holding copy leaves no half-made items and no reward',async()=>{
  const items=worldItems.length,rewards=def().rewards.length;failWorldCreate=true;
  await drop({type:'Item',uuid:'Actor.BEAST.Item.E1'});failWorldCreate=false;
  assert.equal(worldItems.length,items);assert.equal(def().rewards.length,rewards);
});

test('player views never carry reward item ids or pictures',async()=>{
  const g=structuredClone(claimState());g.discovery={...(g.discovery??{}),party:true};await groupDoc.setFlag(ns,'groupClaims',g);
  await mod.api.refreshPlayerViews();
  const view=journal.find(d=>d.getFlag(ns,'playerView')?.user_id==='p1')?.getFlag(ns,'playerView');
  const text=JSON.stringify(view?.payload??{});
  assert.ok(text.includes('[TEST] Reward Guild'),'faction projected to the player');
  assert.ok(!text.includes('ITEM-TEST-')&&!text.includes('"img"'));
});
