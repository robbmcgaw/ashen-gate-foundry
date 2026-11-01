// Test players (ag-test-players/1): the shared helper. Mocked Foundry only; it proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {isTestPlayer, testPlayerIds, TEST_PLAYERS_CONTRACT} from '../scripts/ag-test-players.mjs';

const KEY = 'ashen-gate-manager.testPlayers';
const gm = {id: 'gm1', isGM: true}, tester = {id: 'u-test', isGM: false}, normal = {id: 'u-real', isGM: false};
/** A game where Manager is active and registered the setting with `value`. */
export const makeGame = (opts = {}) => { const {active = true, registered = true, throws = false} = opts, value = 'value' in opts ? opts.value : ['u-test']; return {
  user: tester,
  users: new Map([gm, tester, normal].map(u => [u.id, u])),
  modules: new Map(active === null ? [] : [['ashen-gate-manager', {id: 'ashen-gate-manager', active}]]),
  settings: {
    settings: new Map(registered ? [[KEY, {}]] : []),
    get: (module, key) => { if (throws) throw new Error('not registered'); assert.equal(`${module}.${key}`, KEY); return value; }
  }
}; };

test('contract id', () => assert.equal(TEST_PLAYERS_CONTRACT, 'ag-test-players/1'));

test('a listed non-GM user is a Test player; an unlisted one is not', () => {
  const g = makeGame();
  assert.equal(isTestPlayer(tester, g), true);
  assert.equal(isTestPlayer(normal, g), false);
  assert.equal(isTestPlayer('u-test', g), true, 'a user id works too');
  assert.equal(isTestPlayer('nobody', g), false);
});

test('a GM is never a Test player, even when listed', () => {
  assert.equal(isTestPlayer(gm, makeGame({value: ['gm1', 'u-test']})), false);
});

test('Manager absent or not active: false, no throw', () => {
  assert.equal(isTestPlayer(tester, makeGame({active: null})), false);
  assert.equal(isTestPlayer(tester, makeGame({active: false})), false);
  assert.equal(isTestPlayer(tester, {user: tester}), false, 'no modules or settings at all');
  assert.equal(isTestPlayer(tester, null), false);
  assert.equal(isTestPlayer(tester, {}), false);
  assert.equal(isTestPlayer(tester, {modules: {}, settings: {}}), false, 'half-built game objects');
});

test('setting not registered: false, and the setting is not read', () => {
  assert.equal(isTestPlayer(tester, makeGame({registered: false})), false);
  assert.equal(isTestPlayer(tester, makeGame({registered: false, throws: true})), false);
  assert.deepEqual(testPlayerIds(makeGame({registered: false})), []);
});

test('a throwing settings.get is swallowed', () => {
  assert.equal(isTestPlayer(tester, makeGame({throws: true})), false);
});

test('malformed values are no Test players', () => {
  for (const value of [undefined, null, 'u-test', {0: 'u-test'}, 7, true, [], [7], [null], [{id: 'u-test'}], ['']])
    assert.equal(isTestPlayer(tester, makeGame({value})), false, JSON.stringify(value));
  assert.deepEqual(testPlayerIds(makeGame({value: ['u-test', 7, null, '', 'u-real']})), ['u-test', 'u-real'], 'only string ids are kept');
});

test('bad users are not Test players', () => {
  const g = makeGame();
  for (const u of [undefined, null, {}, {isGM: false}, {id: 5, isGM: false}, 42]) assert.equal(isTestPlayer(u, g), false);
});


// ---- Character Hub: partner Player Access auto-hide ----
import {partnerHiddenReason, hiddenReason, canSee, requirePart} from '../scripts/visibility.mjs';
import {canChangeSockets} from '../scripts/cinders.mjs';

/** Every partner active, its Player Access `on`; the Hub's own toggles are all on. */
function boot({on, user, ...rest}) {
  const g = makeGame(rest);
  g.user = user;
  const access = {getState: () => ({contract: 'ag-player-access/1', playerAccessEnabled: on})};
  for (const id of ['ashen-gate-profession-ledger', 'ashen-gate-cinders', 'ashen-gate-factions'])
    g.modules.set(id, {id, active: true, api: {playerAccess: access, open() {}}});
  const inner = g.settings.get;
  g.settings.get = (module, key) => module === 'ashen-gate-character-hub' ? undefined : inner(module, key);
  globalThis.game = g;
  return g;
}

test('partner Player Access off: a Test player still sees the part, a normal player does not, the GM view is unchanged', () => {
  boot({on: false, user: tester});
  assert.equal(partnerHiddenReason('ashen-gate-profession-ledger', 'Profession Ledger', tester), null);
  assert.equal(canSee('professions', tester), true);
  assert.equal(requirePart('professions', tester), null);
  assert.equal(partnerHiddenReason('ashen-gate-profession-ledger', 'Profession Ledger', normal), 'Profession Ledger Player Access is off');
  assert.equal(canSee('professions', normal), false);
  assert.equal(requirePart('professions', normal)?.ok, false);
  assert.equal(canSee('professions', gm), true, 'the GM always sees everything');
  assert.equal(hiddenReason('professions', undefined, gm), 'Profession Ledger Player Access is off', 'the GM still gets the real reason for players');
});

test('the current user is the default: a Test player client sees the part', () => {
  boot({on: false, user: tester});
  assert.equal(hiddenReason('renown'), null);
  boot({on: false, user: normal});
  assert.equal(hiddenReason('renown'), 'Renown Player Access is off');
});

test('a Test player does not get a part that is inactive, hidden by the Hub, or whose module refuses', () => {
  const g = boot({on: false, user: tester});
  g.modules.get('ashen-gate-cinders').active = false;
  assert.equal(canSee('cinders', tester), false, 'inactive module');
  g.modules.get('ashen-gate-factions').api.playerAccess = {getState: () => { throw new Error('no'); }};
  assert.equal(canSee('renown', tester), false, 'a module that refuses stays hidden');
  g.settings.get = (module, key) => module === 'ashen-gate-character-hub' ? {professions: false} : undefined;
  assert.equal(canSee('professions', tester), false, 'the Hub\'s own switch still applies');
});

test('Manager absent or the setting malformed: the normal rule applies', () => {
  for (const rest of [{active: null}, {registered: false}, {value: 'u-test'}]) {
    boot({on: false, user: tester, ...rest});
    assert.equal(canSee('professions', tester), false, JSON.stringify(rest));
  }
});

test('socket changes from the Hub: a Test player may when the Cinder is theirs and unlocked; ownership still applies', () => {
  const api = {playerAccess: {getState: () => ({playerAccessEnabled: false})}};
  boot({on: false, user: tester});
  assert.equal(canChangeSockets({canEdit: true, locked: false}, api), true);
  assert.equal(canChangeSockets({canEdit: false, locked: false}, api), false, 'not the owner');
  assert.equal(canChangeSockets({canEdit: true, locked: true}, api), false, 'GM locked it');
  boot({on: false, user: normal});
  assert.equal(canChangeSockets({canEdit: true, locked: false}, api), false);
});
