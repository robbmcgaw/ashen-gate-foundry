/** 0.53.1 pre-session check: same item availability rule as Quest Log. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, item, recorder, now, by} from './fixtures/pre-session-world.mjs';

const M = 'ashen-gate-manager';
const recipe = (rec, over = {}) => item(rec, 'Blade recipe', {sourceId: 'REC-TEST-BLADE', definition: {entity_type: 'Recipe', result_item_id: 'ITEM-TEST-BLADE', ingredients: [{material_id: 'MAT-TEST-HERB', quantity: 1}], ...over}});
const blade = (rec, name = 'Blade') => item(rec, name, {sourceId: 'ITEM-TEST-BLADE'});
const herb = rec => item(rec, 'Herb', {sourceId: 'MAT-TEST-HERB'});

test('recipes: a retired, superseded or archived result item counts as missing, like Quest Log', async () => {
  for (const mark of [d => { d.flags[M].source.status = 'retired'; }, d => { d.flags[M].source.status = 'superseded'; }, d => { d.flags[M].lifecycle = {archived: true}; }]) {
    const rec = recorder(), b = blade(rec);
    mark(b);
    const [r] = by(await runPreSessionCheck(world({rec, items: [recipe(rec), b, herb(rec)]}).game, {now}), 'Recipes');
    assert.equal(r.status, 'WARN');
    assert.match(r.text, /REC-TEST-BLADE \(result ITEM-TEST-BLADE\)/);
  }
});

test('recipes: two active items sharing the result id are a conflict Quest Log cannot resolve: not present', async () => {
  const rec = recorder();
  const [r] = by(await runPreSessionCheck(world({rec, items: [recipe(rec), blade(rec), blade(rec, 'Blade copy'), herb(rec)]}).game, {now}), 'Recipes');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /result ITEM-TEST-BLADE/);
});

test('recipes: a retired duplicate does not make the live item a conflict', async () => {
  const rec = recorder(), old = blade(rec, 'Old blade');
  old.flags[M].source.status = 'retired';
  const [r] = by(await runPreSessionCheck(world({rec, items: [recipe(rec), blade(rec), old, herb(rec)]}).game, {now}), 'Recipes');
  assert.equal(r.status, 'PASS');
});

test('skill trees: a perk whose only Item is retired or duplicated counts as missing', async () => {
  const rec = recorder(), retired = item(rec, 'Grit', {sourceId: 'PERK-TEST-GRIT'});
  retired.flags[M].source.status = 'retired';
  const trees = [{id: 'TREE-A', nodes: [{id: 'a', perkId: 'PERK-TEST-GRIT'}, {id: 'b', perkId: 'PERK-TEST-TWIN'}]}];
  const items = [retired, item(rec, 'Twin 1', {sourceId: 'PERK-TEST-TWIN'}), item(rec, 'Twin 2', {sourceId: 'PERK-TEST-TWIN'})];
  const [r] = by(await runPreSessionCheck(world({rec, items, trees}).game, {now}), 'Skill trees');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /PERK-TEST-GRIT \(TREE-A\), PERK-TEST-TWIN \(TREE-A\)/);
});

test('quest rewards: a conflict row (two items share the id) warns just like a missing one', async () => {
  const rewards = {'QUEST-TEST-OPEN': [{key: 'def:ITEM-TEST-TWIN', itemId: 'ITEM-TEST-TWIN', status: 'conflict'}]};
  const [r] = by(await runPreSessionCheck(world({rewards}).game, {now}), 'Quest rewards');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /QUEST-TEST-OPEN \(ITEM-TEST-TWIN, two items share this id\)/);
});
