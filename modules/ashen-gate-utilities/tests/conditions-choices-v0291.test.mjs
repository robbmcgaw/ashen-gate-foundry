// 0.29.1: the shared conditions list. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedConditionChoices,statusEntries} from '../scripts/core.mjs';

test('the shared list: native statuses A to Z, exhaustion stays (0.29.2), no read-only Strain chip, never an id without a label',()=>{
 const entries=statusEntries({prone:{name:'Prone',img:'p.svg'},blinded:{name:'Blinded',icon:'b.svg'},exhaustion:{name:'Exhaustion'},'ag-strain-high':{name:'Strain'},dead:{name:'Dead'}});
 const list=sharedConditionChoices(entries,{label:id=>({prone:'Prone',blinded:'Blinded',dead:'Dead'})[id]??id});
 assert.deepEqual(list.map(c=>c.id),['blinded','dead','exhaustion','prone']);
 assert.deepEqual(list[0],{id:'blinded',label:'Blinded',img:'b.svg'});
 assert.equal(list[3].img,'p.svg');
});
