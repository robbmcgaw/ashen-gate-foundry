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


// ---- ashen-gate-cinders: the module's Player Access gate ----
import {playerAccessAllowed, assertPlayerAccess, accessState, setPlayerAccess} from '../scripts/player-access.mjs';
const ID = 'ashen-gate-cinders';
/** Player Access is `access` for the world; `user` is this client. */
const gameFor = ({access, user, ...rest}) => {
  const g = makeGame(rest);
  const inner = g.settings.get;
  g.user = user;
  g.settings.get = (module, key) => key === 'playerAccessEnabled' ? access : inner(module, key);
  return g;
};

test('Player Access off: a Test player passes the gate, a normal player does not, a GM is unaffected', () => {
  assert.equal(playerAccessAllowed(gameFor({access: false, user: tester}), ID), true);
  assert.equal(playerAccessAllowed(gameFor({access: false, user: normal}), ID), false);
  assert.equal(playerAccessAllowed(gameFor({access: false, user: gm}), ID), true);
  assert.doesNotThrow(() => assertPlayerAccess(gameFor({access: false, user: tester}), ID));
  assert.throws(() => assertPlayerAccess(gameFor({access: false, user: normal}), ID), /hidden/);
});

test('Player Access on: everyone passes, Test players or not', () => {
  for (const user of [tester, normal, gm]) assert.equal(playerAccessAllowed(gameFor({access: true, user}), ID), true);
});

test('Manager absent, setting unregistered or value malformed: the normal rule applies', () => {
  for (const rest of [{active: null}, {active: false}, {registered: false}, {value: 'u-test'}, {value: null}, {throws: true}])
    assert.equal(playerAccessAllowed(gameFor({access: false, user: tester, ...rest}), ID), false, JSON.stringify(rest));
});

test('the contract state still reports the world setting, and a Test player gets no GM power', async () => {
  const g = gameFor({access: false, user: tester});
  assert.equal(accessState(g, ID).playerAccessEnabled, false);
  await assert.rejects(() => setPlayerAccess(g, ID, true), /Only a GM/);
});

import fs from 'node:fs';
test('the Push/use request check on the GM client tests the requesting user (wiring)', () => {
  const rt = fs.readFileSync(new URL('../scripts/cinder-runtime.mjs', import.meta.url), 'utf8');
  assert.match(rt, /deps\.playerAccess\(user\)/);
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /const playerAccess=\(user=game\.user\)=>game\.settings\.get\(MODULE,PLAYER_ACCESS_SETTING\)!==false\|\|isTestPlayer\(user,game\)/);
});
