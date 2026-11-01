import test from 'node:test';import assert from 'node:assert/strict';
// 0.28.1 regression: unreleased perks must not delete nodes from a progressive tree's shared copy. (Harness copied from reveal-v0280.) Pure rules first, then a runtime with mocked Foundry (a GM, a Test player, a normal player; two Cinders, one bound).
// This proves logic and data flow, not the live Forge window. Synthetic [TEST] names only.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}async close(){return this;}}
const oneTime=new Map(),saved=new Map(),socketHandlers=[],emitted=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{},callAll:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.CSS={escape:v=>String(v)};
const {normalizeTree,validateTree,validatePackage,publicTree,publicAvailability}=await import('../scripts/engine.mjs');
const {revealStates,applyReveal,revealDetails,planShowCinderTrees,showCinderTreesText,isProgressive,cleanReveal}=await import('../scripts/reveal.mjs');
const {emptyTabText}=await import('../scripts/tree-tabs.mjs');
const {buildStateExport}=await import('../scripts/state-export.mjs');

// ---- a 24-node synthetic Cinder tree: six core powers chained C1..C6, each with P/M/G enhancements that need their core ----
const CORES=[1,2,3,4,5,6];
const mkNode=(pre,id,extra={})=>({id:`${pre}-${id}`,perkId:`POWER-T-${pre}-${id}`,cost:1,x:40,y:40,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'gm',display:'hidden',...extra});
const cinderNodes=pre=>CORES.flatMap((n,i)=>[
  mkNode(pre,`C${n}`,{x:40+i*220,y:40,requiresAll:i?[`${pre}-C${n-1}`]:[]}),
  ...['P','M','G'].map((k,j)=>mkNode(pre,`C${n}${k}`,{x:40+i*220,y:160+j*110,requiresAll:[`${pre}-C${n}`]}))]);
const cinderTree=(id,pre,mut,o={})=>({id,name:`[TEST] ${pre} Cinder`,description:'',status:'approved',visibility:'gm',sourceRef:mut,provider:{kind:'cinder_milestone',maxPoints:16},nodes:cinderNodes(pre),...o});
const ids=t=>t.nodes.map(n=>n.id);
// the same graph as a published tree, with text on every node (what the GM client holds)
const fullTree=(pre='EMB')=>({...cinderTree('TRE',pre,'MUT-T-X',{visibility:'player',reveal:'progressive'}),nodes:cinderNodes(pre).map(n=>({...n,visibility:'player',display:'shown',name:`[TEST] ${n.id}`,description:`${n.id} secret text`,img:`icons/${n.id}.webp`}))});

const MOD='ashen-gate-skill-trees',MUT='MUT-T-CRIM';
// Robb's live world: the tree is player/progressive, every node shown, but only the first power's perk is released (approved + readable by players).
const tree=cinderTree('CIN-CRIM','CRM',MUT,{visibility:'player',reveal:'progressive'});
tree.nodes=tree.nodes.map(n=>({...n,visibility:'player',display:'shown'}));
const released=new Set(['POWER-T-CRM-C1']);
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};
const perkDoc=n=>{const ok=released.has(n.perkId);return {id:`W-${n.perkId}`,uuid:`Item.W-${n.perkId}`,documentName:'Item',type:'feat',name:`[TEST] ${n.id}`,img:`icons/${n.id}.webp`,ownership:{default:ok?2:0},sheet:{render:()=>{}},
  system:{description:{value:`<h2>Effect &amp; Rules</h2><p>${n.id} secret text.</p>`}},testUserPermission:()=>ok,
  flags:{'ashen-gate-manager':{source:{sourceId:n.perkId,entityType:'Power',status:ok?'approved':'draft',visibility:ok?'player':'gm',definition:{id:n.perkId,point_cost:1,tier:'apprentice'}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}};};
const worldItems={get contents(){return tree.nodes.map(perkDoc);}};
const gm={id:'gm',isGM:true,name:'GM'},tester={id:'u-test',isGM:false,name:'Tester'},real={id:'u-real',isGM:false,name:'Real'};
const mkActor=(id,name,owner)=>{const actor={id,name,documentName:'Actor',type:'character',items:[],flags:{'ashen-gate-cinders':{cinders:[{instanceId:'ci_1',definitionId:MUT}]}},
  get isOwner(){return game.user.isGM||game.user.id===owner;},testUserPermission:(u)=>u.isGM||u.id===owner,
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);actor.writes.push(k);},writes:[],
  async createEmbeddedDocuments(_t,data){const docs=data.map(d=>({...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,sheet:{render:()=>{}},async delete(){actor.items=actor.items.filter(x=>x!==this);}}));actor.items.push(...docs);return docs;}};return actor;};
const geraint=mkActor('G1','[TEST] Geraint Copy','u-test'),other=mkActor('G2','[TEST] Other','u-real');
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-cinders',{id:'ashen-gate-cinders',active:true}],['ashen-gate-manager',{id:'ashen-gate-manager',active:true}]]),
  settings:{settings:new Map([['ashen-gate-manager.testPlayers',{}]]),register:()=>{},registerMenu:()=>{},
    get:(m,k)=>k==='testPlayers'?['u-test']:saved.get(k)??(k==='playerAccessEnabled'?false:undefined),set:async(_m,k,v)=>{saved.set(k,structuredClone(v));return v;}},
  journal:{contents:[journal]},items:worldItems,actors:{contents:[geraint,other],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,tester,real],get:id=>[gm,tester,real].find(u=>u.id===id),activeGM:gm},socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,m)=>emitted.push(m)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const as=u=>{game.user=u;};
const prep=app=>app.constructor.prototype._prepareContext.call(app,{});
const all=CORES.flatMap(n=>['','P','M','G'].map(k=>`CRM-C${n}${k}`));
const leaks=(blob,ids)=>ids.filter(id=>new RegExp(`\\[TEST\\] ${id}(?![A-Z0-9])`).test(blob)||blob.includes(`${id} secret`)||blob.includes(`icons/${id}.webp`));
const view=async(user,actor)=>{as(user);const app=api.open({tab:'cinders',actorId:actor,treeId:'CIN-CRIM'});return {app,c:await prep(app)};};
const ring1=['CRM-C1G','CRM-C1M','CRM-C1P','CRM-C2'];
const idsOf=c=>c.nodes.map(n=>n.id).sort();

test('shared copy: all 24 shown nodes are published, 23 as silhouettes, even though only the first perk is released',async()=>{
  as(gm);await api.publish();
  const pub=saved.get('publicTreesV2').trees.find(t=>t.id==='CIN-CRIM');
  assert.equal(pub.nodes.length,24);assert.equal(pub.nodes.filter(n=>n.silhouette).length,23);
  assert.deepEqual(leaks(JSON.stringify(pub),all.filter(id=>id!=='CRM-C1')),[]);
  assert.ok(JSON.stringify(pub).includes('[TEST] CRM-C1'));
  assert.ok(pub.nodes.filter(n=>n.silhouette).every(n=>n.name==='Undiscovered'&&n.img===null&&n.description===''&&n.unrevealedPrerequisite===true||n.requiresAll.length>0));
});
for(const [label,user,actorId] of [['Test player',tester,'G1'],['normal player',real,'G2']]){
  test(`${label}: nothing unlocked shows the first power plus four silhouettes (window, list, embed.data)`,async()=>{
    if(user===real){as(gm);saved.set('playerAccessEnabled',true);await api.showCinderTrees();}
    const {app,c}=await view(user,actorId);
    assert.deepEqual(idsOf(c),['CRM-C1',...ring1].sort());
    assert.deepEqual(c.nodes.filter(n=>n.silhouette).map(n=>n.id).sort(),ring1);
    assert.ok(c.nodes.filter(n=>n.silhouette).every(n=>n.name==='Undiscovered'&&n.img===null&&/^Undiscovered/.test(n.label)));
    assert.ok(c.nodes.filter(n=>n.silhouette).every(n=>n.listNote!==undefined));
    const hidden=all.filter(id=>!idsOf(c).includes(id));
    assert.deepEqual(leaks(JSON.stringify({n:c.nodes,t:app._tips,e:c.edges,tree:c.tree}),hidden.concat(ring1)),[]);
    const emb=api.embed.data(actorId).flatMap(g=>g.trees).find(t=>t.id==='CIN-CRIM');
    assert.deepEqual(emb.nodes.map(n=>n.id),['CRM-C1']);
  });
}
test('unlocking the first power while the other perks are unreleased keeps silhouettes (never text, never takeable)',async()=>{
  as(gm);await api.grantPoints(geraint,'CIN-CRIM',1,'m1');await api.grantPoints(geraint,'CIN-CRIM',1,'m2');
  as(gm);emitted.length=0;await socketHandlers[0]({type:'unlock-request',requestId:'a',userId:'u-test',actorId:'G1',treeId:'CIN-CRIM',nodeId:'CRM-C1'},'u-test');
  assert.equal(emitted.find(m=>m.type==='unlock-result').ok,true);
  const {c}=await view(tester,'G1');
  assert.deepEqual(c.nodes.filter(n=>n.silhouette).map(n=>n.id).sort(),[...ring1,]);
  assert.equal(c.nodes.find(n=>n.id==='CRM-C1').unlocked,true);
  as(gm);emitted.length=0;await socketHandlers[0]({type:'unlock-request',requestId:'b',userId:'u-test',actorId:'G1',treeId:'CIN-CRIM',nodeId:'CRM-C2'},'u-test');
  assert.equal(emitted.find(m=>m.type==='unlock-result').ok,false,'an unreleased perk cannot be taken by a player');
});
test('once the perks are released and the view republished, unlocking reveals the next ring; refund hides it again and rewrites the record',async()=>{
  for(const n of tree.nodes)released.add(n.perkId);
  as(gm);await api.publish();
  const rec=geraint.flags[MOD].revealV1;
  assert.deepEqual(Object.keys(rec.trees['CIN-CRIM']).sort(),ring1.filter(i=>i!=='CRM-C2').concat('CRM-C2').sort());
  const {app,c}=await view(tester,'G1');
  assert.deepEqual(c.nodes.filter(n=>!n.silhouette).map(n=>n.id).sort(),['CRM-C1',...ring1].sort());
  assert.deepEqual(c.nodes.filter(n=>n.silhouette).map(n=>n.id).sort(),['CRM-C2G','CRM-C2M','CRM-C2P','CRM-C3']);
  assert.equal(c.nodes.find(n=>n.id==='CRM-C2').name,'[TEST] CRM-C2');
  app.nodeId='CRM-C2';const sel=await prep(app);assert.equal(sel.panel.unlock.enabled,true);
  assert.deepEqual(leaks(JSON.stringify({n:c.nodes,t:app._tips,e:c.edges}),all.filter(id=>!idsOf(c).includes(id))),[]);
  const listed=await (async()=>c.nodes.filter(n=>n.silhouette).every(n=>n.name==='Undiscovered'))();assert.ok(listed);
  as(gm);emitted.length=0;await socketHandlers[0]({type:'unlock-request',requestId:'c',userId:'u-test',actorId:'G1',treeId:'CIN-CRIM',nodeId:'CRM-C2'},'u-test');
  assert.equal(emitted.find(m=>m.type==='unlock-result').ok,true);
  assert.ok((await view(tester,'G1')).c.nodes.some(n=>n.id==='CRM-C3'&&!n.silhouette));
  as(gm);await api.refund(geraint,'CIN-CRIM','CRM-C2');
  assert.ok(!('CRM-C2P' in geraint.flags[MOD].revealV1.trees['CIN-CRIM']),'record rewritten without the hidden tier');
  const back=(await view(tester,'G1')).c;
  assert.ok(back.nodes.find(n=>n.id==='CRM-C3').silhouette);
});
test('a draft node of a progressive tree that the GM set to shown is kept as a silhouette, never published with text',async()=>{
  const t=structuredClone(tree);t.nodes[5].status='draft';
  const pub=publicTree(Object.assign(structuredClone(t),{nodes:t.nodes.map((n,i)=>i===5?{...n,unreleased:true}:n)}));
  assert.equal(pub.nodes.find(n=>n.id===t.nodes[5].id).silhouette,true);
  assert.equal(publicTree(t).nodes.length,23,'engine alone still drops an unmarked draft');
});
