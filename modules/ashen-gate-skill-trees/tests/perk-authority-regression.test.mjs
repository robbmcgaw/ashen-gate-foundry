import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTree,availability,purchase,publicTree,publicAvailability} from '../scripts/engine.mjs';
const base=(contentRef)=>normalizeTree({id:'DEMO-GENERIC',name:'Generic test tree',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},
 nodes:[{id:'DEMO-NODE',name:'Test ability',description:'Only for a test',cost:1,status:'approved',visibility:'player',display:'shown',x:100,y:100,
 requiresAll:[],requiresAny:[],excludes:[],contentRef}]});
const account={awarded:5,unlocks:[],grants:[]};
test('generic tree cannot spend points to buy a PERK (Ledger owns selectedPerkIds)',()=>{
 const t=base({relation:'unlocks_perk',target_id:'PERK-TEST',mode:'required'});
 assert.equal(availability(t,account,'DEMO-NODE').ok,false);
 assert.throws(()=>purchase(t,account,'DEMO-NODE'),/Ledger/);
 assert.deepEqual(account.unlocks,[]);
});
test('public projection advertises Ledger authority without leaking source perk identity',()=>{
 const t=base({relation:'unlocks_perk',target_id:'PERK-HIDDEN-NAME',mode:'required'});
 const p=publicTree(t);
 assert.equal(p.nodes[0].purchaseAuthority,'ledger');
 assert.equal(publicAvailability(p,account,'DEMO-NODE').ok,false);
 assert.equal(JSON.stringify(p).includes('PERK-HIDDEN-NAME'),false);
});
test('generic non-PERK test nodes retain original point-purchase behavior',()=>{
 const t=base(null);assert.equal(availability(t,account,'DEMO-NODE').ok,true);
 assert.deepEqual(purchase(t,account,'DEMO-NODE').unlocks,['DEMO-NODE']);
});
