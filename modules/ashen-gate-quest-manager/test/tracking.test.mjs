import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingState,selectTrackedViews,validTrackedId} from '../scripts/tracking.mjs';

test('tracking preferences normalize invalid IDs, deduplicate, and never include unrelated fields',()=>{
 const state=trackingState({ids:['QUEST-SAFE','QUEST-SAFE','GM-SECRET','ORDER-FORGE','CONTRACT-OPEN','JournalEntry.123'],visible:true,gmNotes:'private'});
 assert.deepEqual(state,{ids:['QUEST-SAFE','ORDER-FORGE','CONTRACT-OPEN'],visible:true});
 assert.equal(validTrackedId('QUEST-A'),true);
 assert.equal(validTrackedId('HIRE-A'),false);
 assert.equal(validTrackedId('__proto__'),false);
});
test('tracking defaults to hidden overlay with empty list and does not trust malformed flags',()=>{
 for(const flag of [undefined,null,'{garbage}',{ids:'QUEST-A',visible:'true'},[]])
   assert.deepEqual(trackingState(flag),{ids:[],visible:false});
});
test('overlay receives only already-published per-viewer projections, never GM-only source objects',()=>{
 const view={id:'QUEST-TRAIL',name:'Trail',status:'Active',objectives:[{key:'first',goal:'Find the path',complete:true},{key:'second',goal:'Follow the signs',failed:false}],source:{secret:'no'},gmNotes:'no'};
 const hidden={id:'QUEST-SEALED',name:'Classified',status:'Hidden',objectives:[{key:'sealed',goal:'Secret'}]};
 const other={id:'QUEST-OTHER',name:'Not tracked',status:'Active',objectives:[{key:'other',goal:'No'}]};
 const result=selectTrackedViews([view,hidden,other],['QUEST-TRAIL','QUEST-SEALED']);
 assert.deepEqual(result,[{id:'QUEST-TRAIL',name:'Trail',status:'Active',objectives:[{key:'first',goal:'Find the path',complete:true,failed:false},{key:'second',goal:'Follow the signs',complete:false,failed:false}]}]);
 assert.equal(JSON.stringify(result).includes('Classified'),false);
 assert.equal(JSON.stringify(result).includes('gmNotes'),false);
});
test('same tracked IDs produce distinct results for distinct player audiences',()=>{
 const alice=[{id:'QUEST-PARTY',status:'Active',name:'Shared',objectives:[{key:'one',goal:'Everyone'}]},
  {id:'QUEST-ALICE',status:'Active',name:'Private A',objectives:[{key:'a',goal:'Only Alice'}]}];
 const bob=alice.slice(0,1);
 const ids=['QUEST-PARTY','QUEST-ALICE'];
 assert.equal(selectTrackedViews(alice,ids).length,2);
 assert.deepEqual(selectTrackedViews(bob,ids).map(x=>x.name),['Shared']);
});
test('after visibility revocation the tracked quest is omitted without losing the preference',()=>{
 const prefs=trackingState({ids:['QUEST-LATER'],visible:true});
 const before=selectTrackedViews([{id:'QUEST-LATER',name:'Old name',status:'Active',objectives:[]}],prefs.ids);
 const after=selectTrackedViews([],prefs.ids);
 assert.equal(before.length,1);assert.deepEqual(after,[]);
 assert.deepEqual(prefs.ids,['QUEST-LATER']);
});
