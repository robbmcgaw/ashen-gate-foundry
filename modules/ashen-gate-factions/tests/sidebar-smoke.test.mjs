/** Basic Node harness: verifies actor-sidebar hook wiring, not Foundry rendering. */
import assert from 'node:assert/strict';
const hookMap=new Map();
globalThis.Hooks={on:(n,fn)=>{hookMap.set(n,fn);},once:(n,fn)=>{hookMap.set(n,fn);}};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class ApplicationV2{};
globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:cls=>cls}},utils:{randomID:()=> 'abcdefgh12345678'}};
globalThis.game={};
await import('../scripts/module.mjs');
assert.equal(typeof hookMap.get('renderActorDirectory'),'function');
assert.equal(hookMap.has('renderJournalDirectory'),false);
console.log('Actor launcher hooks registered; no Journal launcher hook.');
