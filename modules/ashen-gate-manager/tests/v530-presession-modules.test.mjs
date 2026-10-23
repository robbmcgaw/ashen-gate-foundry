/** 0.53.0 pre-session check: Character Hub and Cinders in Module versions and Player Access. Mocked Foundry globals. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck, AG_MODULES} from '../scripts/pre-session-check.js';
import {world, now, by} from './fixtures/pre-session-world.mjs';

test('AG_MODULES lists Character Hub and Cinders with no minimum version', () => {
  for (const [id, title] of [['ashen-gate-character-hub', 'Character Hub'], ['ashen-gate-cinders', 'Cinders']]) {
    const m = AG_MODULES.find(x => x.id === id);
    assert.ok(m, id);
    assert.equal(m.title, title);
    assert.equal(m.min, null);
  }
});

test('module versions: active, not active and not installed for the two new modules', async () => {
  const rows = by(await runPreSessionCheck(world().game, {now}), 'Module versions');
  assert.ok(rows.some(r => r.status === 'PASS' && r.text === 'Character Hub 0.42.0 is active.'));
  assert.ok(rows.some(r => r.status === 'PASS' && r.text === 'Cinders 0.11.0 is active.'));
  const off = by(await runPreSessionCheck(world({modules: {'ashen-gate-character-hub': undefined,
    'ashen-gate-cinders': {id: 'ashen-gate-cinders', active: false, version: '0.11.0', api: null}}}).game, {now}), 'Module versions');
  assert.ok(off.some(r => r.status === 'N-A' && r.text === 'Character Hub is not installed.'));
  assert.ok(off.some(r => r.status === 'WARN' && r.text === 'Cinders 0.11.0 is installed but not active.'));
  // Each module appears once (no second "extra" row from its ashen-gate- id).
  assert.equal(rows.filter(r => /Character Hub/.test(r.text)).length, 1);
});

test('player access: Cinders is read through its playerAccess API; Character Hub has none, so N-A with a reason', async () => {
  const rows = by(await runPreSessionCheck(world().game, {now}), 'Player Access');
  assert.ok(rows.some(r => r.status === 'PASS' && r.text.startsWith('Cinders: Player Access on')));
  const hub = rows.find(r => r.text.startsWith('Character Hub'));
  assert.equal(hub.status, 'N-A');
  assert.match(hub.text, /no Player Access switch/);
  const gone = by(await runPreSessionCheck(world({modules: {'ashen-gate-character-hub': undefined, 'ashen-gate-cinders': undefined}}).game, {now}), 'Player Access');
  assert.ok(gone.some(r => r.status === 'N-A' && r.text === 'Character Hub: not installed.'));
  assert.ok(gone.some(r => r.status === 'N-A' && r.text === 'Cinders: not installed.'));
});

test('player access: if Character Hub ever publishes playerAccess, it is read like the others (feature-detected)', async () => {
  const {game} = world();
  const ACCESS = 'ag-player-access/1';
  game.modules.get('ashen-gate-character-hub').api.playerAccess = {contract: ACCESS, setEnabled: () => {},
    getState: () => ({contract: ACCESS, moduleId: 'ashen-gate-character-hub', audience: 'player', playerAccessEnabled: false, configurable: true})};
  const hub = by(await runPreSessionCheck(game, {now}), 'Player Access').find(r => r.text.startsWith('Character Hub'));
  assert.equal(hub.status, 'WARN');
});
