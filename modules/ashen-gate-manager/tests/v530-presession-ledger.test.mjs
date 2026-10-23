/** 0.53.0 pre-session check, Profession Ledger row. Mocked Foundry globals: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, now, by} from './fixtures/pre-session-world.mjs';

test('ledger: no unresolved names is PASS', async () => {
  const [r] = by(await runPreSessionCheck(world().game, {now}), 'Profession Ledger');
  assert.equal(r.status, 'PASS');
});

test('ledger: unresolved tool and skill names warn, de-duplicated, with a fix hint', async () => {
  const unresolved = [{profession: 'Smithing', field: 'toolProficienciesAnyOf', name: 'Hammer kit'},
    {profession: 'Smithing', field: 'toolProficienciesAnyOf', name: 'Hammer kit'},
    {profession: 'Herbalism', field: 'skillProficienciesAnyOf', name: 'Botany'}];
  const [r] = by(await runPreSessionCheck(world({unresolved}).game, {now}), 'Profession Ledger');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /^2 tool or skill names/);
  assert.match(r.text, /Smithing: tool "Hammer kit", Herbalism: skill "Botany"/);
  assert.match(r.text, /Profession Ledger > GM Setup > Tools and checks/);
});

test('ledger: N-A when the Ledger is absent, inactive, or has no assign.preview', async () => {
  for (const mod of [undefined, {id: 'ashen-gate-profession-ledger', active: false, version: '0.30.0', api: null},
    {id: 'ashen-gate-profession-ledger', active: true, version: '0.12.0', api: {}}]) {
    const [r] = by(await runPreSessionCheck(world({modules: {'ashen-gate-profession-ledger': mod}}).game, {now}), 'Profession Ledger');
    assert.equal(r.status, 'N-A', JSON.stringify(mod));
  }
});

test('ledger: a preview without an unresolved list is N-A, never invented', async () => {
  const {game} = world();
  game.modules.get('ashen-gate-profession-ledger').api.assign.preview = () => ({rows: []});
  assert.equal(by(await runPreSessionCheck(game, {now}), 'Profession Ledger')[0].status, 'N-A');
});
