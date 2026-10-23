/** 0.53.0 pre-session check, Skill trees row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, now, by} from './fixtures/pre-session-world.mjs';

test('skill trees: every node perk has an imported Item: PASS', async () => {
  const [r] = by(await runPreSessionCheck(world().game, {now}), 'Skill trees');
  assert.equal(r.status, 'PASS');
  assert.match(r.text, /1 tree node/);
});

test('skill trees: a node perk with no imported Item warns, once per perk, with the tree id', async () => {
  const trees = [{id: 'TREE-A', nodes: [{id: 'a', perkId: 'PERK-TEST-GRIT'}, {id: 'b', perkId: 'PERK-TEST-GONE'}]},
    {id: 'TREE-B', nodes: [{id: 'c', perkId: 'PERK-TEST-GONE'}, {id: 'd', perkId: 'POWER-TEST-EMBER'}]}];
  const [r] = by(await runPreSessionCheck(world({trees}).game, {now}), 'Skill trees');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /^2 perks on tree nodes have no imported Item/);
  assert.match(r.text, /PERK-TEST-GONE \(TREE-A\), POWER-TEST-EMBER \(TREE-B\)/);
  assert.match(r.text, /Import the perk files in General Manager/);
});

test('skill trees: N-A when Skill Trees is absent, inactive or has no listTrees', async () => {
  for (const mod of [undefined, {id: 'ashen-gate-skill-trees', active: false, version: '0.21.1', api: null}, {id: 'ashen-gate-skill-trees', active: true, version: '0.21.1', api: {}}]) {
    const [r] = by(await runPreSessionCheck(world({modules: {'ashen-gate-skill-trees': mod}}).game, {now}), 'Skill trees');
    assert.equal(r.status, 'N-A', JSON.stringify(mod));
  }
});

test('skill trees: listTrees throwing is N-A, not a failed run', async () => {
  const {game} = world();
  game.modules.get('ashen-gate-skill-trees').api.listTrees = () => { throw new Error('storage missing'); };
  const [r] = by(await runPreSessionCheck(game, {now}), 'Skill trees');
  assert.equal(r.status, 'N-A');
  assert.match(r.text, /storage missing/);
});
