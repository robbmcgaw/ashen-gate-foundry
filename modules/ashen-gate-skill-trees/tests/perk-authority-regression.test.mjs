import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTree,resolveTree,availability,purchase,publicTree,publicAvailability} from '../scripts/engine.mjs';
// 0.8.0: every node is a perk. Generic/Cinder trees spend their own points; Profession trees take points from the Ledger level (0.11.0).
const base=(kind='generic_points',perkId='PERK-TEST')=>normalizeTree({id:'DEMO-TREE',name:'Test tree',status:'approved',visibility:'player',
 provider:kind==='profession'?{kind,maxPoints:null}:{kind,maxPoints:10},sourceRef:kind==='profession'?'PROF-TEST':null,
 nodes:[{id:'DEMO-NODE',perkId,status:'approved',visibility:'player',display:'shown',x:100,y:100,requiresAll:[],requiresAny:[],excludes:[]}]});
const perk={name:'[TEST] Perk',description:'Text',img:'icons/x.webp',cost:2,uuid:'Item.abc'};
const account={awarded:5,unlocks:[],grants:[]};
test('generic tree can spend points on a perk node, at the cost stored on the perk',()=>{
 const t=resolveTree(base(),()=>perk);
 assert.deepEqual(availability(t,account,'DEMO-NODE'),{ok:true,reason:'Available',cost:2});
 assert.deepEqual(purchase(t,account,'DEMO-NODE').unlocks,['DEMO-NODE']);
});
test('a perk missing from the world blocks the unlock with a clear reason',()=>{
 const t=resolveTree(base(),()=>null);
 const r=availability(t,account,'DEMO-NODE');
 assert.equal(r.ok,false);assert.match(r.reason,/Unnamed perk is not in this world/);
 assert.throws(()=>purchase(t,account,'DEMO-NODE'),/not in this world/);
});
test('0.11.0: profession trees spend Ledger-level points, 1 per node, never without the Ledger',()=>{
 const t=resolveTree(base('profession'),()=>perk);
 assert.match(availability(t,{awarded:99},'DEMO-NODE').reason,/Profession Ledger is not active/);
 assert.deepEqual(availability(t,{},'DEMO-NODE',{level:1}),{ok:true,reason:'Available',cost:1},'perk point_cost is ignored on profession trees');
 const p=publicTree(t);assert.equal(p.nodes[0].requiredLevel,1);assert.equal(p.nodes[0].cost,1);
 assert.equal(publicAvailability(p,{awarded:99},'DEMO-NODE').ok,false,'awarded points mean nothing on a profession tree');
 assert.equal(publicAvailability(p,{},'DEMO-NODE',{level:1}).ok,true);
});
test('public projection shows the perk name and picture but never its id or UUID',()=>{
 const p=publicTree(resolveTree(base('generic_points','PERK-HIDDEN-NAME'),()=>({...perk,uuid:'Item.secretuuid'})));
 assert.equal(p.nodes[0].name,'[TEST] Perk');assert.equal(p.nodes[0].img,'icons/x.webp');assert.equal(p.nodes[0].cost,2);
 const json=JSON.stringify(p);assert.ok(!json.includes('PERK-HIDDEN-NAME')&&!json.includes('secretuuid'));
 assert.equal(publicAvailability(p,account,'DEMO-NODE').ok,true);
});
