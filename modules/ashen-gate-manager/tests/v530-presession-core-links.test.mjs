/** 0.53.0 pre-session check, Core links row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, item, recorder, now, by} from './fixtures/pre-session-world.mjs';

const ref = {core_ref: {name: 'Potion of Healing', source: "PHB'24", type: 'consumable'}};

test('core links: every core_ref Item linked (adopted or link only) is PASS', async () => {
  const rec = recorder();
  const items = [item(rec, 'Potion', {sourceId: 'ITEM-TEST-POTION', definition: ref, coreLink: {uuid: 'Item.x', adopted: true}}),
    item(rec, 'Rope', {sourceId: 'ITEM-TEST-ROPE', definition: {core_ref: 'Rope'}, coreLink: {uuid: 'Item.y', adopted: false}})];
  const [r] = by(await runPreSessionCheck(world({rec, items}).game, {now}), 'Core links');
  assert.equal(r.status, 'PASS');
  assert.match(r.text, /All 2 Items with a core_ref/);
});

test('core links: an unlinked core_ref Item warns and says where to adopt it', async () => {
  const rec = recorder();
  const items = [item(rec, 'Potion', {sourceId: 'ITEM-TEST-POTION', definition: ref}), item(rec, 'Plain', {sourceId: 'ITEM-TEST-PLAIN'})];
  const [r] = by(await runPreSessionCheck(world({rec, items}).game, {now}), 'Core links');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /^1 Item with a core_ref is not adopted: ITEM-TEST-POTION\. Adopt them in Items > Core links\.$/);
});

test('core links: N-A when no imported Item has a core_ref', async () => {
  const [r] = by(await runPreSessionCheck(world().game, {now}), 'Core links');
  assert.equal(r.status, 'N-A');
});
