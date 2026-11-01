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


// ---- Locations: API, Party Notes and sharing receive the user ----
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';
import {createShareService} from '../scripts/sharing.mjs';

test('getState reports the world setting alone; access checks use the effective answer (Test players included)', () => {
  const base = {version: '0.43.0', isGM: () => false, setPlayerAccess: async () => {}, readAll: () => [], writeAll: async () => {}, readViews: () => [],
    placeNote: async () => ({}), open: () => {}, openLocation: () => {}};
  const api = createApi({...base, playerAccessEnabled: () => true, playerAccessSetting: () => false});
  assert.equal(api.playerAccess.getState().playerAccessEnabled, false, 'a Test player does not change what Manager reads');
  assert.deepEqual(api.listLocations(), [], 'but the player calls are not refused');
  const hidden = createApi({...base, playerAccessEnabled: () => false, playerAccessSetting: () => false});
  assert.throws(() => hidden.listLocations(), /hidden from players/);
  const plain = createApi({...base, playerAccessEnabled: () => true});
  assert.equal(plain.playerAccess.getState().playerAccessEnabled, true, 'without playerAccessSetting the old behaviour holds');
});

test('a Test player cannot change Player Access (no GM power)', async () => {
  const api = createApi({version: '0.43.0', isGM: () => false, playerAccessEnabled: () => true, playerAccessSetting: () => false, setPlayerAccess: async () => {},
    readAll: () => [], writeAll: async () => {}, readViews: () => [], placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  await assert.rejects(() => api.playerAccess.setEnabled(true), /Only the GM/);
});

test('"Share with..." asks Player Access for the requesting user', async () => {
  const seen = [];
  const users = [gm, tester, normal];
  const svc = createShareService({users, currentUser: () => gm, isPrimaryGM: () => true, playerAccessEnabled: u => { seen.push(u?.id); return u?.id === 'u-test'; },
    readAll: () => [], writeAll: async () => {}, socket: {on() {}, emit() {}}});
  await assert.rejects(() => svc.perform({ref: 'LOC-X', userIds: []}, normal), /hidden from players/);
  await assert.rejects(() => svc.perform({ref: 'LOC-X', userIds: []}, tester), err => !/hidden from players/.test(err.message), 'the Test player gets past the access check');
  assert.deepEqual(seen, ['u-real', 'u-test']);
});

test('main.mjs: one effective check feeds the launcher, notes, sharing and the API (wiring)', () => {
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /const playerAccessFor = \(user = game\.user\) => playerAccessEnabled\(\) \|\| isTestPlayer\(user, game\);/);
  assert.match(main, /const mayOpen = \(\) => isGM\(\) \|\| playerAccessFor\(\);/);
  assert.match(main, /playerAccessEnabled: playerAccessFor, playerAccessSetting: playerAccessEnabled/);
  assert.equal((main.match(/playerAccessEnabled: playerAccessFor/g) ?? []).length, 3, 'notes, sharing, api');
  assert.match(main, /isGM\(\) \|\| enabled \|\| isTestPlayer\(game\.user, game\)/);
});
