// Test players (ag-test-players/1): the shared helper. Mocked Foundry only; it proves logic, not the live Foundry UI.
import test from 'node:test';
import fs from 'node:fs';
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

// ---- Utilities: launcher, shops, party stash and conditions follow the effective Player Access ----
import {ID, overlayControlState} from '../scripts/core.mjs';
import {accessFor, playerGate} from '../scripts/shop-buy.mjs';
import {fundGate} from '../scripts/party-fund.mjs';

/** Utilities' own Player Access is `access`; the stash and shops are on for players. */
function boot({access, user, ...rest}) {
  const g = makeGame(rest);
  const inner = g.settings.get;
  g.user = user;
  g.settings.get = (module, key) => module === ID ? ({playerAccessEnabled: access, shopsEnabled: true})[key] : inner(module, key);
  globalThis.game = g;
  return g;
}

test('Player Access off: a Test player passes, a normal player does not, a GM is unaffected', () => {
  boot({access: false, user: tester});
  assert.equal(accessFor(tester), true);
  assert.equal(accessFor(normal), false);
  assert.equal(accessFor(), true, 'default: this client');
  assert.doesNotThrow(() => playerGate(tester));
  assert.throws(() => playerGate(normal), /hidden for players/);
  assert.doesNotThrow(() => playerGate(gm));
  assert.equal(overlayControlState({actor: {id: 'a'}, user: tester, playerAccess: accessFor(tester), users: []}).reason !== 'Utilities access is hidden by the GM.', true);
  assert.equal(overlayControlState({actor: {id: 'a'}, user: normal, playerAccess: accessFor(normal), users: []}).reason, 'Utilities access is hidden by the GM.');
});

test('the party stash gate tests the user it is given (the GM client checks the requester)', () => {
  boot({access: false, user: gm});
  assert.equal(accessFor(tester), true, 'checked from the GM client for another user');
  assert.throws(() => fundGate(normal), /hidden for players/);
  assert.throws(() => fundGate(tester), err => !/hidden for players/.test(err.message), 'past Player Access (the stash switch is separate)');
});

test('Manager absent, setting unregistered or malformed: the normal rule applies', () => {
  for (const rest of [{active: null}, {registered: false}, {value: 'u-test'}]) {
    boot({access: false, user: tester, ...rest});
    assert.equal(accessFor(tester), false, JSON.stringify(rest));
    assert.throws(() => playerGate(tester), /hidden for players/);
  }
});

test('Utilities wiring: the launcher, socket handlers and stash all use accessFor', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /const permitted=\(\)=>isGM\(\)\|\|accessFor\(\);/);
  assert.equal((main.match(/!accessFor\(user\)/g) ?? []).length, 4, 'canChangeActor, remove-status, apply-status, stash gate');
  assert.match(main, /playerAccess:isGM\(\)\|\|accessFor\(\),controllers/);
  assert.match(main, /playerAccessEnabled:game\.settings\.get\(ID,'playerAccessEn/, 'getState keeps reading the world setting');
});
