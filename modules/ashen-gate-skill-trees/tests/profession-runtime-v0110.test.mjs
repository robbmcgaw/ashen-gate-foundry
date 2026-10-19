import test from 'node:test';import assert from 'node:assert/strict';
// Mocked Foundry + a stand-in Profession Ledger: proves the GM-side checks and writes, not the live Foundry UI.
class FakeApplication {static DEFAULT_OPTIONS={};constructor(){this.rendered=false;}render(){this.rendered=true;return this;}async _prepareContext(){return {};}async _onRender(){}}
const oneTime=new Map(),hooks=new Map(),saved=new Map(),socketHandlers=[],emitted=[],chats=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,fn)};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>Math.random().toString(36).slice(2)}};
globalThis.ChatMessage={create:async m=>{chats.push(m);return m;}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const TIERS=[...Array(6).fill('apprentice'),...Array(5).fill('journeyman'),...Array(5).fill('expert'),...Array(4).fill('artisan'),...Array(4).fill('master')];
const nid=i=>`NODE-P${String(i+1).padStart(2,'0')}`,pid=i=>`PERK-TP-${String(i+1).padStart(2,'0')}`;
const tree={id:'TP-PROF-TREE',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},
  nodes:TIERS.map((t,i)=>({id:nid(i),perkId:pid(i),x:40+(i%6)*200,y:40+Math.floor(i/6)*120,requiresAll:i===1?[nid(0)]:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'}))};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[tree]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const perk=i=>({id:`W${i}`,uuid:`Item.W${i}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${i+1}`,img:null,ownership:{default:2},
  system:{description:{value:''}},testUserPermission:()=>true,
  flags:{'ashen-gate-manager':{source:{sourceId:pid(i),entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:pid(i),tier:TIERS[i],point_cost:3}}}},
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const gm={id:'gm',isGM:true,name:'GM'},player={id:'player1',isGM:false,name:'P1'};
function makeActor(id){
  const actor={id,name:`[TEST] ${id}`,type:'character',isOwner:true,flags:{},items:[],
    testUserPermission:(u,level)=>u.isGM||(['OWNER','OBSERVER'].includes(level)&&u.id==='player1'),
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(_t,data){const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${Math.random()}`,parent:actor,
      toObject(){const {toObject,delete:_d,parent,...rest}=this;return structuredClone(rest);},async delete(){actor.items=actor.items.filter(x=>x!==doc);}};return doc;});
      actor.items.push(...docs);return docs;}};
  return actor;
}
// Stand-in Ledger: the only source of profession levels.
const levels=new Map();
let ledger;
ledger={id:'ashen-gate-profession-ledger',active:true,api:{progression:{contract:'ag-ledger-progression/1',
  level:(actor,profId)=>profId===PROF&&levels.has(actor.id)?{profId,xp:0,level:levels.get(actor.id),tier:'Apprentice'}:null},
  inspectProfessionPerkChoices:(actor,profId)=>profId===PROF&&legacy.has(actor.id)?{selectedPerkIds:legacy.get(actor.id)}:null}};
const legacy=new Map();
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:TIERS.map((_,i)=>perk(i))},
  actors:{contents:[],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,player],get:id=>[gm,player].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;
const acc=a=>a.flags[MOD]?.progressV2?.['tree:TP-PROF-TREE']??{unlocks:[],history:[]};
const fresh=(id,level)=>{const a=makeActor(id);game.actors.contents.push(a);if(level!=null)levels.set(id,level);return a;};
const ask=async(a,nodeId,req='r')=>{await socketHandlers[0]({type:'unlock-request',requestId:req,userId:'player1',actorId:a.id,treeId:'TP-PROF-TREE',nodeId},'player1');return emitted.at(-1);};

test('player picks through the GM client: Ledger level gives the points, tiers gate, the perk Item is added',async()=>{
  const a=fresh('PA',4);
  assert.equal((await ask(a,nid(0))).ok,true);
  assert.equal(a.items.length,1);assert.equal(a.items[0].flags[MOD].grant.nodeId,nid(0));
  const blocked=await ask(a,nid(11));assert.equal(blocked.ok,false);assert.match(blocked.message,/Needs profession level 7 \(now 4\)/);
  for(const i of [2,3,6])assert.equal((await ask(a,nid(i))).ok,true);
  const full=await ask(a,nid(4));assert.match(full.message,/No perk points left \(4 of 4 used at level 4\)/);
  assert.deepEqual(acc(a).history.map(h=>[h.kind,h.by]),[['allocate','player1'],['allocate','player1'],['allocate','player1'],['allocate','player1']]);
});
test('without the Ledger nothing can be picked and nothing is removed',async()=>{
  const a=fresh('PB',3);await ask(a,nid(0));
  ledger.active=false;
  const r=await ask(a,nid(2));assert.equal(r.ok,false);assert.match(r.message,/Profession Ledger is not active/);
  assert.equal(api.professionReport(a,PROF,{}).earned,0);assert.equal(a.items.length,1);
  ledger.active=true;
});
test('level drop: GM is told, the player is blocked, keep clears it; nothing is removed',async()=>{
  const a=fresh('PC',7);for(const i of [0,2,3,4,5,6,11])assert.equal((await ask(a,nid(i))).ok,true);
  chats.length=0;levels.set('PC',4);
  await hooks.get('ashenGateLedger.progressionChanged')({actorId:'PC',profId:PROF,previousLevel:7,level:4});
  assert.equal(chats.length,1);assert.deepEqual(chats[0].whisper,['gm'],'review note goes to the GM only');
  assert.match(chats[0].content,/needs review in <strong>\[TEST\] Herbalism Tree<\/strong>: level 4 no longer covers \[TEST\] Perk 12/);
  assert.match(chats[0].content,/data-agst-open-tree data-actor-id="PC" data-tree-id="TP-PROF-TREE"/);
  const report=api.professionReport(a,PROF,{level:4});
  assert.deepEqual(report.nodesAboveLevel.map(x=>x.nodeId),[nid(11)]);assert.equal(report.overSpent,3);
  assert.match((await ask(a,nid(1))).message,/Waiting on GM review/);
  assert.equal(acc(a).unlocks.length,7);assert.equal(a.items.length,7);
  await assert.rejects(()=>{game.user=player;return api.keep(a,'TP-PROF-TREE',nid(11));},/GM only/);game.user=gm;
  for(const n of acc(a).unlocks)await api.keep(a,'TP-PROF-TREE',n,{reason:'Grandfathered'});
  assert.equal(api.professionReport(a,PROF,{}).overAllocated,false);
  assert.ok(api.reconcileProfessions().every(r=>r.actorId!=='PC'||!r.issues.length));
});
test('GM remove returns the point, keeps the removed Item in history; GM override needs a reason',async()=>{
  const a=fresh('PD',2);await ask(a,nid(0));await ask(a,nid(2));
  game.user=player;await assert.rejects(()=>api.overrideGrant(a,'TP-PROF-TREE',nid(20),{reason:'x'}),/GM only/);
  await assert.rejects(()=>api.refund(a,'TP-PROF-TREE',nid(2)),/GM only/);game.user=gm;
  await api.refund(a,'TP-PROF-TREE',nid(2),{reason:'Swap'});
  const h=acc(a).history.at(-1);assert.equal(h.kind,'remove');assert.equal(h.reason,'Swap');assert.equal(h.itemSnapshot.name,'[TEST] Perk 3');
  assert.equal(a.items.length,1);assert.equal(api.professionReport(a,PROF,{}).spent,1);
  await assert.rejects(()=>api.overrideGrant(a,'TP-PROF-TREE',nid(20),{reason:''}),/reason/);
  const r=await api.overrideGrant(a,'TP-PROF-TREE',nid(20),{reason:'Story reward'});
  assert.match(r.overridden[0],/Needs profession level 13/);assert.equal(a.items.length,2);
  assert.equal(acc(a).history.at(-1).kind,'override');assert.equal(api.professionReport(a,PROF,{}).overAllocated,false);
});
test('level up whispers the owner with a button to open the tree',async()=>{
  const a=fresh('PE',1);chats.length=0;levels.set('PE',3);
  await hooks.get('ashenGateLedger.progressionChanged')({actorId:'PE',profId:PROF,previousLevel:1,level:3});
  assert.equal(chats.length,1);assert.deepEqual(chats[0].whisper.sort(),['gm','player1']);
  assert.match(chats[0].content,/2 perks to choose in <strong>\[TEST\] Herbalism Tree<\/strong> \(level 3; 3 points to spend\)/);
  // A non-active GM client does nothing (one note per change).
  chats.length=0;game.users.activeGM={id:'other-gm'};
  await hooks.get('ashenGateLedger.progressionChanged')({actorId:'PE',profId:PROF,previousLevel:3,level:4});
  assert.equal(chats.length,0);game.users.activeGM=gm;
});
test('profession report respects Actor permission; public view carries level gates',async()=>{
  const a=fresh('PF',2);game.user={id:'stranger',isGM:false};
  assert.throws(()=>api.professionReport(a,PROF,{}),/access denied/);game.user=gm;
  await api.publish();
  const pub=saved.get('publicTreesV2').trees.find(t=>t.id==='TP-PROF-TREE');
  assert.equal(pub.nodes.length,24);assert.deepEqual([...new Set(pub.nodes.map(n=>n.requiredLevel))],[1,4,7,10,13]);
  assert.ok(pub.nodes.every(n=>n.cost===1));assert.ok(!JSON.stringify(pub).includes('PERK-TP'));
});

test('0.12.0: review applies keep/remove in one go, in dependency order, and refuses to strand a kept perk',async()=>{
  const a=fresh('RA',5);for(const i of [0,1,2,3,6])assert.equal((await ask(a,nid(i))).ok,true);
  levels.set('RA',2);
  assert.equal(api.professionReport(a,PROF,{}).overAllocated,true);
  await assert.rejects(()=>api.resolve(a,'TP-PROF-TREE',{remove:[nid(0)],keep:[nid(1),nid(2),nid(3),nid(6)]}),/Cannot remove \[TEST\] Perk 1 \(needed by \[TEST\] Perk 2\)/);
  assert.equal(acc(a).unlocks.length,5,'refused review changed nothing');
  const r=await api.resolve(a,'TP-PROF-TREE',{remove:[nid(0),nid(1),nid(6)],keep:[nid(2),nid(3)],reason:'XP fix'});
  assert.deepEqual(r.removed.sort(),['[TEST] Perk 1','[TEST] Perk 2','[TEST] Perk 7']);
  assert.equal(r.status.overAllocated,false);assert.deepEqual(acc(a).unlocks.sort(),[nid(2),nid(3)]);
  const kinds=acc(a).history.slice(-5).map(h=>h.kind);assert.deepEqual(kinds,['remove','remove','remove','keep','keep']);
  assert.ok(acc(a).history.slice(-5).every(h=>h.reason==='XP fix'&&h.id));
  assert.equal(a.items.length,2);
});
test('0.12.0: undo restores a removed perk exactly, takes back picks and keeps, never twice',async()=>{
  const a=fresh('UA',3);await ask(a,nid(0));await ask(a,nid(2));
  a.items.find(i=>i.flags[MOD].grant.nodeId===nid(2)).system.uses={spent:1};
  await api.refund(a,'TP-PROF-TREE',nid(2),{reason:'Swap'});
  const removal=acc(a).history.at(-1);
  game.user=player;await assert.rejects(()=>api.undo(a,'TP-PROF-TREE',removal.id),/GM only/);game.user=gm;
  const r=await api.undo(a,'TP-PROF-TREE',removal.id);
  assert.equal(r.restored,'[TEST] Perk 3');assert.ok(acc(a).unlocks.includes(nid(2)));
  const back=a.items.find(i=>i.flags[MOD].grant.nodeId===nid(2));assert.deepEqual(back.system.uses,{spent:1},'per-character edits come back');
  await assert.rejects(()=>api.undo(a,'TP-PROF-TREE',removal.id),/already undone/);
  const pick=acc(a).history.find(h=>h.kind==='allocate'&&h.nodeId===nid(0));
  await api.undo(a,'TP-PROF-TREE',pick.id);
  assert.equal(acc(a).unlocks.includes(nid(0)),false);assert.equal(a.items.some(i=>i.flags[MOD].grant.nodeId===nid(0)),false);
  assert.equal(acc(a).history.at(-1).kind,'undo');assert.equal(acc(a).history.at(-1).undoneKind,'allocate');
  levels.set('UA',4);assert.equal((await ask(a,nid(6))).ok,true);
  levels.set('UA',1);await api.keep(a,'TP-PROF-TREE',nid(6));
  assert.equal(api.professionReport(a,PROF,{}).overAllocated,false);
  await api.undo(a,'TP-PROF-TREE',acc(a).history.at(-1).id);
  assert.equal(api.professionReport(a,PROF,{}).overAllocated,true,'undoing a keep flags the character again');
});
test('0.12.0: Import Ledger perk choices: dry run first, re-runnable, links an Item already on the sheet, never touches the Ledger',async()=>{
  const a=fresh('LA',2);
  // A perk already on the sheet from the old Ledger flow (no Skill Trees tag).
  a.items.push({name:'[TEST] Perk 3',id:'OLD3',flags:{'ashen-gate-manager':{source:{sourceId:pid(2)}}},
    async update(u){for(const [k,v] of Object.entries(u)){const parts=k.split('.');let o=this;while(parts.length>1){o[parts[0]]??={};o=o[parts.shift()];}o[parts[0]]=v;}}});
  legacy.set('LA',[pid(0),pid(2),'PERK-TP-NOPE']);
  const before=JSON.stringify(legacy.get('LA'));
  const dry=await api.importLedgerPerkChoices({apply:false});
  const mine=dry.rows.filter(r=>r.actorId==='LA');
  assert.deepEqual(mine.map(r=>r.action),['add','adopt','unmapped']);assert.equal(acc(a).unlocks.length,0,'dry run writes nothing');
  const out=await api.importLedgerPerkChoices({apply:true});
  assert.ok(out.applied.some(r=>r.actorId==='LA'));
  assert.deepEqual(acc(a).unlocks.sort(),[nid(0),nid(2)]);
  assert.equal(a.items.filter(i=>i.flags?.[MOD]?.grant?.nodeId===nid(2)).length,1,'the old Item is linked, not copied');
  assert.equal(a.items.find(i=>i.id==='OLD3').flags[MOD].grant.nodeId,nid(2));
  assert.equal(acc(a).history.filter(h=>h.kind==='migrate').length,2);
  const again=await api.importLedgerPerkChoices({apply:true});
  assert.equal(again.applied.filter(r=>r.actorId==='LA').length,0,'second run changes nothing');
  assert.equal(JSON.stringify(legacy.get('LA')),before,'Ledger choices untouched');
});
