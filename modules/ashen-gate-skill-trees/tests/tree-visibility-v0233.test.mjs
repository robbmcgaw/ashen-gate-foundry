import test from 'node:test';import assert from 'node:assert/strict';
// 0.23.3: players see only the trees their character holds. Mocked Foundry, a stand-in Ledger and Cinders; logic only (synthetic data).
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),saved=new Map();
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TV-HERB',MUT='MUT-TV-EMBER',MUT2='MUT-TV-OTHER';
const node=id=>({id,perkId:`PERK-TV-${id}`,cost:1,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const tree=(id,kind,sourceRef=null)=>({id,name:`[TEST] ${id}`,description:'',status:'approved',visibility:'player',sourceRef,
  provider:{kind,maxPoints:kind==='profession'?null:kind==='cinder_milestone'?16:10},nodes:[node(`${id}-N1`)]});
const trees=[tree('T-PROF','profession',PROF),tree('T-CIN','cinder_milestone',MUT),tree('T-CIN2','cinder_milestone',MUT2),tree('T-GEN','generic_points')];
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const gm={id:'gm',isGM:true,name:'GM'},p1={id:'u1',isGM:false,name:'P1'},p2={id:'u2',isGM:false,name:'P2'};
const actorOf=(id,owner,{progress,cinders}={})=>({id,name:`[TEST] ${id}`,type:'character',items:[],
  flags:{...(progress?{[MOD]:{progressV2:progress}}:{}),...(cinders?{'ashen-gate-cinders':{cinders}}:{})},
  get isOwner(){return game.user.isGM||game.user.id===owner;},testUserPermission:(u)=>u.isGM||u.id===owner});
const levels={};let socketHandler=null;const sent=[];
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>levels[a.id]?.[p]?{profId:p,xp:5,level:levels[a.id][p],tier:'x'}:null}}};
const cinders={active:true};
const perk=id=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] ${id}`,img:null,ownership:{default:2},system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TV-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TV-${id}`,point_cost:1}}}}});
// none: holds nothing. herbalist: profession level 3. bearer: bound to MUT. buyer: lost the profession but bought a node. crafty: GM awarded generic points.
const none=actorOf('none','u1'),herbalist=actorOf('herbalist','u1'),bearer=actorOf('bearer','u1',{cinders:[{instanceId:'cinst_1',definitionId:MUT}]}),
  buyer=actorOf('buyer','u1',{progress:{'tree:T-PROF':{unlocks:['T-PROF-N1'],history:[]}}}),
  crafty=actorOf('crafty','u1',{progress:{'tree:T-GEN':{awarded:2,unlocks:[],history:[]}}}),theirs=actorOf('theirs','u2',{cinders:[{instanceId:'cinst_2',definitionId:MUT2}]});
levels.herbalist={[PROF]:3};
const all=[none,herbalist,bearer,buyer,crafty,theirs];
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger],['ashen-gate-cinders',cinders]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:trees.map(t=>perk(`${t.id}-N1`))},actors:{contents:all,get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,p1,p2],get:id=>[gm,p1,p2].find(u=>u.id===id),activeGM:gm},socket:{on:(_c,fn)=>{socketHandler=fn;},emit:(_c,m)=>sent.push(m)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const idsFor=a=>api.pointsSummary(a).map(r=>r.treeId).sort();
const as=async user=>{game.user=user;};

test('setup: the GM publishes every tree',async()=>{
  await as(gm);assert.equal(await api.publish(),4);
  assert.equal(saved.get('publicTreesV2').trees.length,4);
});
test('GM sees every tree through every read path',async()=>{
  await as(gm);
  assert.equal(api.listTrees().length,4);
  assert.deepEqual(idsFor(none),['T-CIN','T-CIN2','T-GEN','T-PROF']);
  assert.equal(api.embed.data(none.id).flatMap(g=>g.trees).length,4);
  assert.doesNotThrow(()=>api.open({treeId:'T-CIN2',actorId:none.id}));
});
test('player with no profession and no Cinder: no trees anywhere',async()=>{
  // a user who owns only a character with nothing
  const lone=actorOf('lone','u3');game.actors.contents.push(lone);
  const p3={id:'u3',isGM:false,name:'P3'};game.users.contents.push(p3);game.user=p3;
  assert.deepEqual(api.listTrees(),[]);
  assert.deepEqual(api.pointsSummary(lone),[]);
  assert.deepEqual(api.embed.data(lone.id),[]);
  assert.equal(api.actorProgress(lone,'T-CIN'),null);
  assert.deepEqual(api.listTreesForProfession(PROF),[]);
  assert.equal(api.professionWallet(lone.id,PROF),null);
  for(const id of ['T-PROF','T-CIN','T-CIN2','T-GEN','NOPE'])assert.throws(()=>api.open({treeId:id}),/Unknown tree/,id);
  for(const id of ['T-PROF','T-CIN'])await assert.rejects(async()=>api.unlock(lone,id,`${id}-N1`),/Unknown tree/,id);
  game.actors.contents.pop();
});
test('profession tree: shown only with the profession (Ledger level 1+)',async()=>{
  await as(p1);
  assert.deepEqual(idsFor(herbalist),['T-PROF']);
  assert.deepEqual(idsFor(none),[]);
  assert.doesNotThrow(()=>api.open({treeId:'T-PROF',actorId:herbalist.id}));
  assert.throws(()=>api.open({treeId:'T-PROF',actorId:none.id}),/Unknown tree/);
});
test('Cinder tree: shown only to the bound character, not to another Cinder or another owner',async()=>{
  await as(p1);
  assert.deepEqual(idsFor(bearer),['T-CIN']);
  assert.throws(()=>api.open({treeId:'T-CIN2',actorId:bearer.id}),/Unknown tree/);
  assert.throws(()=>api.open({treeId:'T-CIN',actorId:herbalist.id}),/Unknown tree/);
  await as(p2);
  assert.deepEqual(idsFor(theirs),['T-CIN2']);
  assert.deepEqual(api.listTrees().map(t=>t.id),['T-CIN2']);
  assert.throws(()=>api.open({treeId:'T-CIN'}),/Unknown tree/);
  assert.throws(()=>api.pointsSummary(bearer),/Actor access denied/);
});
test('other (generic) tree: shown once the GM has awarded the character points',async()=>{
  await as(p1);
  assert.deepEqual(idsFor(crafty),['T-GEN']);
  assert.deepEqual(idsFor(none),[]);
});
test('a character that already bought a node keeps seeing that tree',async()=>{
  await as(p1);
  assert.deepEqual(idsFor(buyer),['T-PROF']);
  assert.deepEqual(api.embed.data(buyer.id).flatMap(g=>g.trees.map(t=>t.id)),['T-PROF']);
});
test('listTrees is the union across the player\'s own characters',async()=>{
  await as(p1);
  assert.deepEqual(api.listTrees().map(t=>t.id).sort(),['T-CIN','T-GEN','T-PROF']);
});
test('partner absent: players lose profession/Cinder trees (fail closed), the GM still sees all',async()=>{
  ledger.active=false;cinders.active=false;
  try{
    await as(p1);
    assert.deepEqual(idsFor(herbalist),[]);
    assert.deepEqual(idsFor(bearer),[]);
    assert.deepEqual(idsFor(buyer),['T-PROF']); // bought nodes stay visible
    assert.deepEqual(idsFor(crafty),['T-GEN']);  // generic trees need no partner
    await as(gm);
    assert.equal(api.listTrees().length,4);
    assert.ok(api.open());
  }finally{ledger.active=true;cinders.active=true;}
});
test('the GM client rejects a socket unlock request for a tree the requester\'s character does not hold',async()=>{
  await as(gm);
  const ask=(actor,treeId,requestId)=>{socketHandler({type:'unlock-request',requestId,userId:'u1',actorId:actor.id,treeId,nodeId:`${treeId}-N1`},'u1');};
  const reply=id=>new Promise(r=>setTimeout(()=>r(sent.find(m=>m.type==='unlock-result'&&m.requestId===id)),20));
  sent.length=0;ask(none,'T-CIN','r1');ask(none,'T-PROF','r2');ask(herbalist,'T-CIN2','r3');
  for(const id of ['r1','r2','r3']){const m=await reply(id);assert.equal(m.ok,false,id);assert.match(m.message,/Unknown tree/,id);}
  // the held tree is not refused for visibility (it may still fail on points, which is a different message)
  ask(herbalist,'T-PROF','r4');const m=await reply('r4');
  assert.doesNotMatch(String(m?.message??''),/Unknown tree/);
});
