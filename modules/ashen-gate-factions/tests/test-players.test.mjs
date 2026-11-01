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

// ---- Renown: the module boots with mocked Foundry and its Player Access gate is read per user ----
const hooks = new Map(), socketHandlers = new Map();
globalThis.Hooks = {on: (name, fn) => hooks.set(name, fn), once: (name, fn) => hooks.set(name, fn)};
globalThis.HTMLElement = class {};
globalThis.CONST = {DOCUMENT_OWNERSHIP_LEVELS: {NONE: 0, OBSERVER: 2, OWNER: 3}};
class V2 { async render() { this.rendered = true; return this; } async close() { this.rendered = false; return this; } async _prepareContext() { return {}; } async _onRender() {} }
let ctr = 1;
globalThis.foundry = {applications: {api: {ApplicationV2: V2, HandlebarsApplicationMixin: C => C}}, utils: {randomID: () => String(ctr++).padStart(24, 'A')}};
const journal = []; journal.get = id => journal.find(d => d.id === id);
globalThis.Folder = {create: async data => ({id: 'F' + ctr++, name: data.name, type: data.type, folder: data.folder ?? null, flags: {}, getFlag() { return undefined; }})};
globalThis.JournalEntry = {create: async x => ({id: 'J' + ctr++, ...x, getFlag() { return undefined; }, testUserPermission: () => false}), updateDocuments: async rows => rows};
const settings = {}, registered = new Map(), launchers = [];
const mod = {id: 'ashen-gate-factions', active: true, api: null};
const world = makeGame({value: ['u-test']});
const gmUser = world.users.get('gm1');
globalThis.game = {...world, journal, folders: [], actors: Object.assign([], {get: () => null}), users: Object.assign([gm, tester, normal], {get: id => [gm, tester, normal].find(u => u.id === id)}),
  modules: new Map([['ashen-gate-manager', {id: 'ashen-gate-manager', active: true}], ['ashen-gate-factions', mod]]),
  settings: {settings: world.settings.settings, register: (m, k, v) => { settings[k] = v.default; registered.set(k, v); },
    get: (m, k) => m === 'ashen-gate-manager' ? ['u-test'] : settings[k], set: async (m, k, v) => { settings[k] = v; }},
  socket: {on: (id, fn) => socketHandlers.set(id, fn), emit() {}}, user: gm};
globalThis.ui = {actors: {}, notifications: {info() {}, warn() {}, error() {}}};
globalThis.document = {querySelectorAll: () => [], createElement: () => ({})};
await import('../scripts/module.mjs');
hooks.get('init')();
hooks.get('ready')();
await new Promise(r => setTimeout(r, 30));

test('Renown: with Player Access off a Test player opens the dashboard and a normal player is refused', () => {
  settings.playerAccessEnabled = false;
  game.user = normal;
  assert.throws(() => mod.api.open(), /hidden from players/);
  game.user = tester;
  const app = mod.api.open();
  assert.ok(app, 'the dashboard opens for the Test player');
  game.user = gm;
  assert.ok(mod.api.open(), 'the GM is unaffected');
});

test('Renown: Manager absent or the setting malformed leaves the normal refusal', () => {
  settings.playerAccessEnabled = false;
  game.user = tester;
  const real = game.modules.get('ashen-gate-manager');
  game.modules.delete('ashen-gate-manager');
  assert.throws(() => mod.api.open(), /hidden from players/);
  game.modules.set('ashen-gate-manager', real);
  assert.ok(mod.api.open());
});

test('Renown: the GM client checks the requesting user, and a Test player gets no GM power', async () => {
  const src = fs.readFileSync(new URL('../scripts/module.mjs', import.meta.url), 'utf8');
  assert.match(src, /function requestAuthorized\(msg\)\{if\(!playerAccessEnabled\(\)&&!isTestPlayer\(msg\.userId,game\)\)throw/);
  assert.equal(mod.api.playerAccess.getState().playerAccessEnabled, false, 'getState reports the world setting');
  game.user = tester;
  await assert.rejects(() => mod.api.playerAccess.setEnabled(true), /GM authorization/);
});
