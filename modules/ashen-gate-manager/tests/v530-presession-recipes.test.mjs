/** 0.53.0 pre-session check, Recipes row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, item, recorder, now, by} from './fixtures/pre-session-world.mjs';

test('recipes: every result and MAT-* ingredient in the world is PASS', async () => {
  const [r] = by(await runPreSessionCheck(world().game, {now}), 'Recipes');
  assert.equal(r.status, 'PASS');
  assert.match(r.text, /1 craft recipe is in the world/);
});

test('recipes: a missing result item or ingredient material warns with the recipe id and a fix hint', async () => {
  const rec = recorder();
  const items = [item(rec, 'Herb', {sourceId: 'MAT-TEST-HERB'}),
    item(rec, 'Blade recipe', {sourceId: 'REC-TEST-BLADE', definition: {entity_type: 'Recipe', result_item_id: 'ITEM-TEST-GONE', ingredients: [{material_id: 'MAT-TEST-HERB', quantity: 1}, {materialId: 'MAT-TEST-ORE', quantity: 2}, {name: 'Water', quantity: 1}]}})];
  const [r] = by(await runPreSessionCheck(world({rec, items}).game, {now}), 'Recipes');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /REC-TEST-BLADE \(result ITEM-TEST-GONE, ingredient MAT-TEST-ORE\)/);
  assert.doesNotMatch(r.text, /MAT-TEST-HERB|Water/);
  assert.match(r.text, /Import the missing items/);
});

test('recipes: activity recipes are never flagged, even with a stray result or ingredients', async () => {
  const rec = recorder();
  const items = [item(rec, 'Song', {sourceId: 'REC-TEST-SONG', definition: {entity_type: 'Recipe', kind: 'activity', result_item_id: 'ITEM-NOPE', ingredients: [{material_id: 'MAT-NOPE', quantity: 1}]}})];
  const [r] = by(await runPreSessionCheck(world({rec, items}).game, {now}), 'Recipes');
  assert.equal(r.status, 'PASS');
  assert.match(r.text, /all activities/);
});

test('recipes: N-A when no recipe is imported', async () => {
  const rec = recorder();
  const [r] = by(await runPreSessionCheck(world({rec, items: [item(rec, 'Longsword')]}).game, {now}), 'Recipes');
  assert.equal(r.status, 'N-A');
});

test('recipes: a long list stops after 10 with "and n more"', async () => {
  const rec = recorder();
  const items = Array.from({length: 22}, (_, i) => item(rec, `R${i}`, {sourceId: `REC-TEST-${i}`, definition: {entity_type: 'Recipe', result_item_id: `ITEM-GONE-${i}`}}));
  const [r] = by(await runPreSessionCheck(world({rec, items}).game, {now}), 'Recipes');
  assert.match(r.text, /^22 craft recipes/);
  assert.match(r.text, /and 12 more\./);
  assert.equal((r.text.match(/REC-TEST-/g) ?? []).length, 10);
});
