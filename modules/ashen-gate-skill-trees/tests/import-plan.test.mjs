import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planTreeImport} from '../scripts/engine.mjs';
const pack=JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_SkillTrees_0.5.1.json',import.meta.url),'utf8'));
test('new trees are planned as new and carry normalized trees to apply',()=>{
 const plan=planTreeImport(pack,[]);
 assert.deepEqual(plan.errors,[]);assert.ok(plan.rows.every(r=>r.action==='new'));assert.equal(plan.apply.length,pack.trees.length);
});
test('existing trees are skipped by default and replaced only in update mode',()=>{
 const existing=[{id:pack.trees[0].id}];
 const skip=planTreeImport(pack,existing);
 assert.equal(skip.rows[0].action,'skip');assert.equal(skip.apply.length,pack.trees.length-1);
 const update=planTreeImport(pack,existing,{mode:'update'});
 assert.equal(update.rows[0].action,'update');assert.equal(update.apply.length,pack.trees.length);
});
test('an invalid package reports errors and applies nothing',()=>{
 const plan=planTreeImport({schema:'ag-skill-trees/0.2',trees:'x'},[]);
 assert.ok(plan.errors.length);assert.deepEqual(plan.apply,[]);
 assert.ok(planTreeImport(pack,[],{mode:'bogus'}).errors.length);
});
