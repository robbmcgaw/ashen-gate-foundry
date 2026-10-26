import test from 'node:test';import assert from 'node:assert/strict';
// Mocked Foundry: proves the unlock/refund logic and checks, not the live Foundry UI.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),saved=new Map(),socketHandlers=[],emitted=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>x,randomID:()=>Math.random().toString(36).slice(2)}};
const MOD='ashen-gate-skill-trees';
const tree={id:'PT-TREE-T',name:'[TEST] Tree',description:'',status:'test',visibility:'player',sourceRef:null,provider:{kind:'generic_points',maxPoints:10},nodes:[
  {id:'NODE-A',perkId:'PERK-PT-A',x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown'},
  {id:'NODE-B',perkId:'PERK-PT-MISSING',x:400,y:100,requiresAll:['NODE-A'],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown'},
  {id:'NODE-C',name:'[TEST] Custom',description:'',cost:1,x:100,y:300,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown'},
  {id:'NODE-G',perkId:'PERK-PT-A2',x:400,y:300,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'gm',display:'hidden'}]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=(id,sourceId,name,extra={})=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:'icons/test.webp',ownership:{default:2},
  system:{description:{value:'<p>Synthetic perk of [[AGREF:PROF-PT-X|Alchemy]] and @UUID[Item.abc]{Rope}</p>'}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:sourceId,point_cost:2}}}},
  toObject(){return structuredClone({_id:this.id,folder:'FOLDER',sort:5,ownership:this.ownership,_stats:{},name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});},...extra});
const gm={id:'gm',isGM:true},player={id:'player1',isGM:false},other={id:'player2',isGM:false};
function makeActor(id){
  const actor={id,name:`[TEST] ${id}`,type:'character',isOwner:true,flags:{},items:[],creates:0,
    testUserPermission:(u,level)=>level==='OWNER'&&u.id==='player1',
    async setFlag(m,k,v){if(this.failFlag)throw Error('flag write failed');this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(_t,data){this.creates++;await new Promise(r=>setTimeout(r,5));
      const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});
      actor.items.push(...docs);return docs;}};
  return actor;
}
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('W1','PERK-PT-A','[TEST] Steady Hands'),perk('W2','PERK-PT-A2','[TEST] Secret Perk')]},
  actors:{contents:[],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,player,other],get:id=>[gm,player,other].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const progress=a=>a.flags[MOD]?.progressV2?.['tree:PT-TREE-T']??{unlocks:[]};
const fresh=async(id,points=5)=>{const a=makeActor(id);game.actors.contents.push(a);await api.grantPoints(a,'PT-TREE-T',points,'Start');return a;};
const asUser=u=>{game.user=u;};

test('GM unlock adds a tagged copy of the world perk to the sheet and records the unlock',async()=>{
  const a=await fresh('GM1');
  const r=await api.unlock(a,'PT-TREE-T','NODE-A');
  assert.equal(r.ok,true);assert.equal(a.items.length,1);
  const item=a.items[0];
  assert.equal(item.name,'[TEST] Steady Hands');
  assert.deepEqual(item.flags[MOD].grant,{perkId:'PERK-PT-A',treeId:'PT-TREE-T',nodeId:'NODE-A',wallet:'tree:PT-TREE-T',perkUuid:'Item.W1'});
  assert.equal(item.flags['ashen-gate-manager'].source.sourceId,'PERK-PT-A','Manager source tag travels with the copy');
  for(const k of ['_id','folder','sort','ownership','_stats'])assert.equal(k in item,false,`${k} is not copied`);
  assert.deepEqual(progress(a).unlocks,['NODE-A']);
});
test('a double click unlocks once and creates one Item',async()=>{
  const a=await fresh('GM2');
  const results=await Promise.allSettled([api.unlock(a,'PT-TREE-T','NODE-A'),api.unlock(a,'PT-TREE-T','NODE-A')]);
  assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/Already unlocked/);
  assert.equal(a.items.length,1);assert.equal(a.creates,1);
});
test('a perk missing from the world is reported and nothing is unlocked',async()=>{
  const a=await fresh('GM3');await api.unlock(a,'PT-TREE-T','NODE-A');
  await assert.rejects(()=>api.unlock(a,'PT-TREE-T','NODE-B'),/is not in this world/);
  assert.deepEqual(progress(a).unlocks,['NODE-A']);assert.equal(a.items.length,1);
});
test('if recording the unlock fails, the new Item is removed again',async()=>{
  const a=await fresh('GM4');a.failFlag=true;
  await assert.rejects(()=>api.unlock(a,'PT-TREE-T','NODE-A'),/flag write failed/);
  assert.equal(a.items.length,0);
});
test('custom nodes still unlock (points only, no Item)',async()=>{
  const a=await fresh('GM5');await api.unlock(a,'PT-TREE-T','NODE-C');
  assert.deepEqual(progress(a).unlocks,['NODE-C']);assert.equal(a.items.length,0);
});
test('refund removes the perk from the sheet; players cannot refund',async()=>{
  const a=await fresh('GM6');await api.unlock(a,'PT-TREE-T','NODE-A');
  asUser(player);await assert.rejects(()=>api.refund(a,'PT-TREE-T','NODE-A'),/GM only/);
  await assert.rejects(()=>api.resetTree(a,'PT-TREE-T'),/GM only/);asUser(gm);
  const r=await api.refund(a,'PT-TREE-T','NODE-A');
  assert.deepEqual(r.removed,['[TEST] Steady Hands']);assert.equal(a.items.length,0);assert.deepEqual(progress(a).unlocks,[]);
  await api.unlock(a,'PT-TREE-T','NODE-A');await api.unlock(a,'PT-TREE-T','NODE-C');
  await api.resetTree(a,'PT-TREE-T');
  assert.deepEqual(progress(a).unlocks,[]);assert.equal(a.items.length,0);assert.equal(progress(a).awarded,5,'awarded points stay');
});
test('player unlock goes to the active GM client, which checks ownership and does the writes',async()=>{
  const a=await fresh('PL1');const handle=socketHandlers[0];
  emitted.length=0;
  await handle({type:'unlock-request',requestId:'r1',userId:'player1',actorId:a.id,treeId:'PT-TREE-T',nodeId:'NODE-A'},'player2');
  assert.equal(emitted.at(-1).ok,false,'sender id from the server wins over a claimed userId');
  assert.match(emitted.at(-1).message,/do not own/);assert.equal(a.items.length,0);
  await handle({type:'unlock-request',requestId:'r2',userId:'player1',actorId:a.id,treeId:'PT-TREE-T',nodeId:'NODE-G'},'player1');
  assert.equal(emitted.at(-1).ok,false,'GM-only node cannot be unlocked by a player');assert.equal(a.items.length,0);
  await handle({type:'unlock-request',requestId:'r3',userId:'player1',actorId:a.id,treeId:'PT-TREE-T',nodeId:'NODE-A'},'player1');
  assert.equal(emitted.at(-1).message,"[TEST] Steady Hands unlocked for [TEST] PL1.");assert.equal(emitted.at(-1).userId,'player1');assert.equal(a.items.length,1);
});
test('player client sends a request and shows the GM answer; with no GM online it says so',async()=>{
  const a=await fresh('PL2');await api.publish(); // 0.23.3: a player can only ask for a tree that is published and that their character holds
  asUser(player);emitted.length=0;
  const pending=api.unlock(a,'PT-TREE-T','NODE-A');
  const req=emitted.at(-1);assert.equal(req.type,'unlock-request');assert.equal(req.nodeId,'NODE-A');
  socketHandlers[0]({type:'unlock-result',requestId:req.requestId,userId:'player1',ok:false,message:'Need 1 more point(s)'});
  await assert.rejects(pending,/Need 1 more/);
  game.users.activeGM=null;
  await assert.rejects(()=>api.unlock(a,'PT-TREE-T','NODE-A'),/A GM must be logged in/);
  game.users.activeGM=gm;asUser(gm);
});
test('give missing perks backfills unlocks recorded without an Item, and is safe to re-run',async()=>{
  const a=makeActor('OLD');game.actors.contents.push(a);
  a.flags[MOD]={progressV2:{'tree:PT-TREE-T':{awarded:3,unlocks:['NODE-A','NODE-C'],grants:[],revision:1}}};
  const first=await api.giveMissingPerks();
  assert.ok(first.given.some(g=>g.startsWith('[TEST] OLD')));assert.equal(a.items.length,1);
  await api.giveMissingPerks();assert.equal(a.items.length,1,'no duplicate');
});
test('published player view carries perk names, not perk ids or GM-only nodes',async()=>{
  await api.publish();
  const pub=saved.get('publicTreesV2').trees[0];
  assert.deepEqual(pub.nodes.map(n=>n.id),['NODE-A','NODE-C']);
  assert.equal(pub.nodes[0].name,'[TEST] Steady Hands');assert.equal(pub.nodes[0].description,'Synthetic perk of Alchemy and Rope');assert.equal(pub.nodes[0].cost,2);
  const json=JSON.stringify(pub);assert.ok(!json.includes('PERK-PT')&&!json.includes('PROF-PT')&&!json.includes('Secret Perk')&&!json.includes('Item.W'));
});
