import test from 'node:test';
import assert from 'node:assert/strict';
import {groupStateDefaults,blankStanding} from '../scripts/core.mjs';

test('complete group state needs no write and is returned unchanged',()=>{
  const stored={standing:{opening_score:0,score:3,events:[]},requests:{a:1},uses:{},claims:{},choices:{}};
  const {state,changed}=groupStateDefaults(stored);
  assert.equal(changed,false);
  assert.deepEqual(state,stored);
  assert.notEqual(state,stored,'a copy, never the stored object');
});
test('missing keys are filled without touching existing values',()=>{
  const stored={standing:{opening_score:0,score:5,events:[]},claims:{x:true}};
  const {state,changed}=groupStateDefaults(stored);
  assert.equal(changed,true);
  assert.equal(state.standing.score,5);
  assert.deepEqual(state.claims,{x:true});
  assert.deepEqual([state.requests,state.uses,state.choices],[{},{},{}]);
  assert.equal(stored.requests,undefined,'stored object is not mutated');
});
test('legacy party standing seeds a missing standing; otherwise a blank one',()=>{
  const legacy={opening_score:0,score:2,events:[]};
  assert.deepEqual(groupStateDefaults({},legacy).state.standing,legacy);
  assert.deepEqual(groupStateDefaults(undefined).state.standing,blankStanding());
  assert.equal(groupStateDefaults(undefined).changed,true);
});
test('running it twice is a no-op the second time (re-runnable migration)',()=>{
  const first=groupStateDefaults({standing:blankStanding()});
  assert.equal(groupStateDefaults(first.state).changed,false);
});
