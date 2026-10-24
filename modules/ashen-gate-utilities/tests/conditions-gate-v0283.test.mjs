// 0.28.3: a status Foundry does not list is named after the effect carrying it (Hub marks), not its raw id.
// The API gate (canApply/canRemove follow Player Access) is a one-line `permitted()&&` in main.mjs; verify it live in Forge (see the PR).
// Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {unknownStatusLabel,conditionGroups} from '../scripts/core.mjs';

const actor={id:'a',name:'Hero',statuses:new Set(['agch-vex','prone']),effects:[{statuses:new Set(['agch-vex']),name:'Vexed (Rapier)'}]};
test('unknownStatusLabel names the carrying effect, else the id',()=>{
 assert.equal(unknownStatusLabel(actor,'agch-vex'),'Vexed (Rapier)');
 assert.equal(unknownStatusLabel(actor,'agch-gone'),'agch-gone');
 assert.equal(unknownStatusLabel({effects:[{statuses:['x'],name:'Arr'}]},'x'),'Arr');
 assert.equal(unknownStatusLabel(null,'x'),'x');
});
test('conditionGroups hands the actor to the label callback',()=>{
 const g=conditionGroups([actor],{label:(id,a)=>id==='prone'?'Prone':unknownStatusLabel(a,id),isNative:id=>id==='prone'});
 assert.deepEqual(g[0].conditions.map(c=>c.label),['Vexed (Rapier)','Prone']);
});
