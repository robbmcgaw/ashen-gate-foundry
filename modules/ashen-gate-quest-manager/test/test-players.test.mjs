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

// ---- Quest Log: Player Access read per user ----
import {MOD} from '../scripts/core.mjs';
import {canUseJournal} from '../scripts/journal-core.mjs';

const callbacks = new Map();
globalThis.Hooks = {once: (event, fn) => callbacks.set(event, fn), on: () => {}, off: () => {}};
globalThis.foundry = {applications: {api: {ApplicationV2: class {}}}};
let access = false;
const projection = {id: 'QUEST-SAFE', entity_type: 'Objective', objective_kind: 'quest', name: '[TEST] Public quest', status: 'Available', scope: 'party', actorId: null, objectives: [{key: 'one', goal: '[TEST] A public objective'}]};
const page = {getFlag: (mod, key) => mod === MOD ? ({public: true, view: projection})[key] : null, testUserPermission: u => u.isGM || u.id === 'u-test' || u.id === 'u-real'};
const questModule = {active: true, api: null};
const world = makeGame({value: ['u-test']});
const actors = []; actors.get = () => null;
globalThis.game = {user: gm, journal: [page], actors, users: [gm, tester, normal], modules: new Map([['ashen-gate-manager', {id: 'ashen-gate-manager', active: true}], [MOD, questModule]]),
  settings: {settings: world.settings.settings, register: () => {}, get: (m, k) => m === 'ashen-gate-manager' ? ['u-test'] : access, set: async (_m, _k, v) => { access = v; }}};
globalThis.document = {querySelectorAll: () => []};
globalThis.ui = {actors: {element: null}, notifications: {info: () => {}, error: () => {}}};
await import('../scripts/main.mjs');
callbacks.get('init')(); callbacks.get('ready')();

test('Player Access off: a Test player reads the player Quest Log API, a normal player is refused, the GM is unaffected', () => {
  access = false;
  game.user = normal;
  assert.throws(() => questModule.api.getVisibleObjective('QUEST-SAFE'), /hidden by the GM/);
  game.user = tester;
  assert.equal(questModule.api.getVisibleObjective('QUEST-SAFE').id, 'QUEST-SAFE');
  assert.equal(questModule.api.resolveObjective('QUEST-SAFE').status, 'ok', 'the objective resolver follows the same gate');
  game.user = gm;
  assert.ok(questModule.api.listVisible());
});

test('a Test player gets no GM power and the contract state is the world setting', async () => {
  access = false;
  game.user = tester;
  assert.throws(() => questModule.api.getGMSource('QUEST-SAFE'), /GM permission/);
  assert.equal(questModule.api.playerAccess.getState().playerAccessEnabled, false);
  await assert.rejects(() => questModule.api.playerAccess.setEnabled(true));
  assert.equal(access, false);
});

test('Manager absent: a Test player is refused like any player', () => {
  access = false;
  game.user = tester;
  game.modules.delete('ashen-gate-manager');
  assert.throws(() => questModule.api.getVisibleObjective('QUEST-SAFE'), /hidden by the GM/);
  game.modules.set('ashen-gate-manager', {id: 'ashen-gate-manager', active: true});
});

test('the Game Journal gate takes the user: canUseJournal(user, {access})', () => {
  assert.equal(canUseJournal(tester, {access: true, hubShown: true}), true);
  assert.equal(canUseJournal(normal, {access: false, hubShown: true}), false);
  assert.equal(canUseJournal(gm, {access: false, hubShown: false}), true);
  const store = fs.readFileSync(new URL('../scripts/journal-store.mjs', import.meta.url), 'utf8');
  assert.match(store, /access:deps\.access\(user\)/);
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /const accessFor=\(user=game\.user\)=>game\.settings\.get\(MOD,'playerAccessEnabled'\)===true\|\|isTestPlayer\(user,game\)/);
  assert.match(main, /access:accessFor,hubShown:hubShowsQuests/);
});
