import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTree,resolveTree,validateTree,availability,purchase,refund,overrideGrant,professionStatus,pointsForLevel,nodeThreshold,
  reconcile,cleanAccount,withHistory,publicTree,publicAvailability} from '../scripts/engine.mjs';
// 0.11.0: profession trees take 1 point per Ledger level (16 max) and have 24 perks. Mocked data: proves the rules, not the live UI.
const TIERS=[...Array(6).fill('apprentice'),...Array(5).fill('journeyman'),...Array(5).fill('expert'),...Array(4).fill('artisan'),...Array(4).fill('master')];
const id=i=>`NODE-P${String(i+1).padStart(2,'0')}`;
const profTree=(extra={})=>normalizeTree({id:'TP-PROF-TREE',name:'[TEST] Herbalism Tree',status:'approved',visibility:'player',
  provider:{kind:'profession',maxPoints:null},sourceRef:'PROF-TP-HERB',
  nodes:TIERS.map((tier,i)=>({id:id(i),perkId:`PERK-TP-${String(i+1).padStart(2,'0')}`,status:'approved',visibility:'player',display:'shown',
    x:40+(i%6)*200,y:40+Math.floor(i/6)*120,requiresAll:i===1?[id(0)]:[],requiresAny:[],excludes:[],...(extra[id(i)]??{})}))});
const lookup=pid=>{const i=Number(pid.slice(-2))-1;return {name:`[TEST] Perk ${i+1}`,description:'',img:null,cost:3,uuid:`Item.W${i}`,tier:TIERS[i]};};
const tree=(extra)=>resolveTree(profTree(extra),lookup);
const allocate=(t,acc,ids,level)=>ids.reduce((a,n)=>purchase(t,a,n,{level}),acc);
const byTier=tier=>TIERS.map((x,i)=>x===tier?id(i):null).filter(Boolean);

test('1 point per profession level, level 1 included, 16 at most',()=>{
  assert.deepEqual([0,1,4,16,17].map(pointsForLevel),[0,1,4,16,16]);
});
test('24-node profession trees validate; a size outside the 20 to 36 range warns',()=>{
  assert.deepEqual(validateTree(profTree()).errors,[]);
  assert.equal(validateTree(profTree()).warnings.some(w=>/24 nodes/.test(w)),false);
  const small=profTree();small.nodes=small.nodes.slice(0,10);
  assert.ok(validateTree(small).warnings.some(w=>/usually have 20 to 36 nodes \(16 points to spend\); this one has 10/.test(w)));
});
test('thresholds come from the perk tier; minLevel only raises them',()=>{
  const t=tree({[id(12)]:{minLevel:3},[id(0)]:{minLevel:5}});
  assert.equal(t.nodes[12].requiredLevel,7,'Expert stays 7 although minLevel says 3');
  assert.equal(t.nodes[0].requiredLevel,5,'Apprentice raised to 5');
  assert.deepEqual([1,4,7,10,13].map((l,i)=>nodeThreshold({perkTier:['apprentice','journeyman','expert','artisan','master'][i]})),[1,4,7,10,13]);
  assert.ok(t.nodes.every(n=>n.cost===1),'every profession node costs 1 whatever the perk says');
});
test('level gates, points and prerequisites are enforced; never negative',()=>{
  const t=tree();
  assert.match(availability(t,{},byTier('journeyman')[0],{level:3}).reason,/Needs profession level 4 \(now 3\)/);
  assert.match(availability(t,{},id(1),{level:5}).reason,/prerequisite/i);
  let a=allocate(t,{},[id(0),id(1),id(2),id(3)],4);
  assert.match(availability(t,a,id(4),{level:4}).reason,/No perk points left \(4 of 4 used at level 4\)/);
  assert.throws(()=>purchase(t,a,id(4),{level:4}),/No perk points left/);
  assert.equal(professionStatus(t,a,4).available,0);
  assert.match(availability(t,{},id(0),{level:0}).reason,/does not have this profession/);
  assert.match(availability(t,{},id(0)).reason,/Profession Ledger is not active/);
});
test('level 16: 16 of 24 perks, the 17th is refused',()=>{
  const t=tree(),picks=t.nodes.map(n=>n.id).filter(n=>n!==id(1)).slice(0,16);
  const a=allocate(t,{},picks,16);
  const st=professionStatus(t,a,16);
  assert.deepEqual([st.spent,st.earned,st.available,st.maxPoints,st.nodeCount,st.overAllocated],[16,16,0,16,24,false]);
  assert.match(availability(t,a,t.nodes.map(n=>n.id).find(n=>!picks.includes(n)&&n!==id(1)),{level:16}).reason,/16 of 16 used/);
});
test('lowering the level flags, never removes; keep resolves; a further drop flags again',()=>{
  const t=tree(),expert=byTier('expert')[0];
  let a=allocate(t,{},[id(0),id(2),id(3),id(4),id(5),byTier('journeyman')[0],expert],7);
  let st=professionStatus(t,a,4);
  assert.deepEqual(st.aboveLevel.map(x=>[x.nodeId,x.threshold]),[[expert,7]]);
  assert.equal(st.overSpent,3);assert.equal(st.overAllocated,true);assert.equal(a.unlocks.length,7,'nothing removed');
  assert.match(availability(t,a,id(1),{level:4}).reason,/Waiting on GM review/);
  assert.equal(publicAvailability(publicTree(t),a,id(1),{level:4}).ok,false,'players are blocked too');
  for(const n of a.unlocks)a.kept[n]={level:4,at:1,by:'gm',reason:''};
  st=professionStatus(t,a,4);assert.equal(st.overAllocated,false,'kept at level 4');assert.equal(st.available,-3,'kept perks still use their points');
  assert.match(availability(t,a,id(1),{level:4}).reason,/No perk points left/);
  assert.equal(professionStatus(t,a,3).overAllocated,true,'level 3 is below the kept level');
  assert.equal(professionStatus(t,a,10).available,3,'regaining levels gives picks again');
});
test('remove returns the point and drops the keep; dependents block removal',()=>{
  const t=tree();let a=allocate(t,{},[id(0),id(1)],2);a.kept[id(0)]={level:2};
  assert.throws(()=>refund(t,a,id(0)),/depends on this node/);
  a=refund(t,refund(t,a,id(1)),id(0));
  assert.deepEqual(a.unlocks,[]);assert.deepEqual(a.kept,{});assert.equal(professionStatus(t,a,2).available,2);
});
test('GM override needs a reason, ignores points/level/prerequisites and keeps the node at the current level',()=>{
  const t=tree(),master=byTier('master')[0];
  assert.throws(()=>overrideGrant(t,{},master,{level:2,reason:' '}),/reason/);
  const {account,overridden}=overrideGrant(t,{},master,{level:2,reason:'Story reward',by:'gm',at:5});
  assert.deepEqual(account.unlocks,[master]);assert.match(overridden[0],/Needs profession level 13/);
  assert.deepEqual(account.kept[master],{level:2,at:5,by:'gm',reason:'Story reward'});
  assert.equal(professionStatus(t,account,2).overAllocated,false);
  assert.equal(professionStatus(t,account,1).overAllocated,true);
  assert.throws(()=>overrideGrant(t,account,master,{level:2,reason:'x'}),/Already unlocked/);
});
test('history: last 50 changes; only the last 10 removals keep Item data',()=>{
  let a={};for(let i=0;i<60;i++)a=withHistory(a,{kind:'remove',nodeId:id(0),itemSnapshot:{name:`n${i}`}});
  const c=cleanAccount(a);
  assert.equal(c.history.length,50);assert.equal(c.history.filter(h=>h.itemSnapshot).length,10);
  assert.equal(c.history.at(-1).itemSnapshot.name,'n59');
  assert.deepEqual(cleanAccount({awarded:2,unlocks:['A1B']}).kept,{},'older data reads with empty additions');
});
test('reconcile report names each problem, read-only',()=>{
  const t=tree(),a=allocate(t,{},[id(0),id(2)],2);
  const tag=n=>({perkId:t.nodes.find(x=>x.id===n).perkId,treeId:t.id,nodeId:n});
  const r=reconcile(t,a,{level:1,itemTags:[tag(id(0)),tag(id(0)),tag(id(3)),{perkId:t.nodes[0].perkId,treeId:'OTHER',nodeId:'X1'}]});
  const codes=r.issues.map(i=>`${i.code}:${i.nodeId??''}`).sort();
  assert.deepEqual(codes,['DUPLICATE_ITEM:NODE-P01','DUPLICATE_ITEM:NODE-P01','MISSING_ITEM:NODE-P03','ORPHAN_ITEM:NODE-P04','OVER_SPENT:'].sort());
  assert.deepEqual(reconcile(t,a,{}).issues.map(i=>i.code).filter(c=>c==='LEDGER_UNAVAILABLE'),['LEDGER_UNAVAILABLE']);
  assert.deepEqual(a.unlocks,[id(0),id(2)],'report changes nothing');
});
test('the player view (no perk tiers) flags the same perks as the GM view',()=>{
  const t=tree(),p=publicTree(t),a=allocate(t,{},[id(0),byTier('expert')[0]],7);
  assert.deepEqual(professionStatus(p,a,4).aboveLevel.map(x=>x.nodeId),professionStatus(t,a,4).aboveLevel.map(x=>x.nodeId));
  assert.equal(professionStatus(p,a,4).aboveLevel.length,1);
});
test('0.12.0: review candidates, removal order and the Ledger import plan (pure)',async()=>{
  const {reviewCandidates,removalOrder,planLedgerImport}=await import('../scripts/engine.mjs');
  const t=tree(),a=allocate(t,{},[id(0),id(1),id(2),byTier('journeyman')[0]],4);
  assert.deepEqual(reviewCandidates(t,a,4),[],'nothing to review when the level covers it');
  assert.deepEqual(reviewCandidates(t,a,2).map(r=>[r.nodeId,r.aboveLevel]),[[id(0),false],[id(1),false],[id(2),false],[byTier('journeyman')[0],true]]);
  const o=removalOrder(t,a,[id(0),id(1)]);assert.deepEqual(o.order,[id(1),id(0)]);assert.deepEqual(o.blocked,[]);
  assert.deepEqual(removalOrder(t,a,[id(0)]).blocked.map(b=>b.nodeId),[id(0)]);
  assert.deepEqual(planLedgerImport(t,a,['PERK-TP-01','PERK-TP-05','PERK-TP-05','PERK-TP-99'],['PERK-TP-05']).map(r=>r.action),['skip','adopt','unmapped']);
});
