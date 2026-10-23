/** 0.53.0 pre-session check, Quest rewards row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, now, by} from './fixtures/pre-session-world.mjs';

test('quest rewards: every reward item found is PASS', async () => {
  const [r] = by(await runPreSessionCheck(world().game, {now}), 'Quest rewards');
  assert.equal(r.status, 'PASS');
  assert.match(r.text, /Every item reward \(1\)/);
});

test('quest rewards: a missing reward item warns; removed and history rows are ignored', async () => {
  const rewards = {'QUEST-TEST-OPEN': [{key: 'def:ITEM-TEST-GONE', itemId: 'ITEM-TEST-GONE', status: 'missing'},
    {key: 'def:ITEM-TEST-OLD', itemId: 'ITEM-TEST-OLD', status: 'missing', removed: true},
    {key: 'def:ITEM-TEST-PAST', itemId: 'ITEM-TEST-PAST', status: 'missing', gone: true}]};
  const [r] = by(await runPreSessionCheck(world({rewards}).game, {now}), 'Quest rewards');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /^1 item reward points at an item that is not in the world: QUEST-TEST-OPEN \(ITEM-TEST-GONE\)\./);
  assert.doesNotMatch(r.text, /OLD|PAST/);
});

test('quest rewards: N-A when Quest Log is absent or has no rewards API', async () => {
  for (const mod of [undefined, {id: 'ashen-gate-quest-manager', active: true, version: '0.7.2', api: {listQuests: () => [], getGMSource: () => null}}]) {
    const [r] = by(await runPreSessionCheck(world({modules: {'ashen-gate-quest-manager': mod}}).game, {now}), 'Quest rewards');
    assert.equal(r.status, 'N-A', JSON.stringify(mod));
  }
});
