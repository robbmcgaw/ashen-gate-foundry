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

// ---- General Manager: owns the setting, the GM Setup picker, the Modules note ----
import {registerTestPlayersSetting, setTestPlayers, cleanTestPlayerIds, testPlayerRows, nonGmUsers, readTestPlayers, guardTestPlayersWrite,
  testPlayersApi, TEST_PLAYERS_SETTING, TEST_PLAYERS_HINT} from '../scripts/test-players.js';
import {readGmSetupForm, saveGmSetup} from '../scripts/gm-setup.js';
import {moduleCards, TEST_PLAYERS_NOTE} from '../scripts/module-cards.js';
import {evaluateDockExtras} from '../scripts/player-dock.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const aria = {id: 'u-aria', name: 'Aria [TEST]', isGM: false};
const users = Object.assign([{...gm, name: 'Gamemaster'}, {...normal, name: 'Real Player'}, aria, {...tester, name: 'Zed Tester'}], {get(id) { return this.find(u => u.id === id); }});
/** A game with a real settings store for the Test players key. */
function store({user = gm, saved = []} = {}) {
  const data = new Map([['testPlayers', saved]]), writes = [], registered = new Map();
  return {writes, registered, game: {user, users, settings: {
    register: (m, k, o) => { registered.set(k, o); if (!data.has(k)) data.set(k, o.default); },
    get: (m, k) => data.get(k), set: async (m, k, v) => { writes.push([k, v]); data.set(k, v); return v; }}}};
}

test('the setting is a world Array, default [], hidden from Game Settings', () => {
  const s = store();
  registerTestPlayersSetting(s.game, 'ashen-gate-manager', {onChange: () => {}});
  const o = s.registered.get('testPlayers');
  assert.equal(TEST_PLAYERS_SETTING, 'testPlayers');
  assert.equal(o.scope, 'world');
  assert.equal(o.config, false);
  assert.equal(o.type, Array);
  assert.deepEqual(o.default, []);
  assert.equal(typeof o.onChange, 'function');
  assert.equal(o.hint, TEST_PLAYERS_HINT);
});

test('the hint is the labelled text from the brief', () => {
  assert.equal(TEST_PLAYERS_HINT, 'These users see every Ashen Gate module as if Player Access were on. Other players follow each module\'s own setting. Item and journal permissions still follow normal player rules.');
  assert.ok(read('../templates/manager.hbs').includes('{{testPlayersHint}}'));
});

test('the picker lists the non-GM users and cleans ids', () => {
  assert.deepEqual(nonGmUsers(users).map(u => u.id), ['u-aria', 'u-real', 'u-test']);
  assert.deepEqual(testPlayerRows(users, ['u-test']).map(r => [r.id, r.checked]), [['u-aria', false], ['u-real', false], ['u-test', true]]);
  assert.deepEqual(testPlayerRows(users, ['u-test'], ['u-aria']).map(r => r.checked), [true, false, false], 'a draft wins over the saved list');
  assert.deepEqual(cleanTestPlayerIds(['u-test', 'u-test', 'gm1', 'ghost', 7, null], users), ['u-test'], 'unique, existing, non-GM');
  assert.deepEqual(cleanTestPlayerIds('u-test', users), []);
});

test('only the GM can set Test players (setTestPlayers, api and the write guard)', async () => {
  let s = store({user: tester});
  await assert.rejects(() => setTestPlayers(s.game, ['u-test']), /Only the GM/);
  await assert.rejects(() => testPlayersApi(s.game).set(['u-test']), /Only the GM/);
  assert.deepEqual(s.writes, []);
  s = store({user: gm});
  assert.deepEqual(await setTestPlayers(s.game, ['u-test', 'gm1', 'ghost']), ['u-test']);
  assert.deepEqual(s.writes, [['testPlayers', ['u-test']]]);
  await setTestPlayers(s.game, ['u-test']);
  assert.equal(s.writes.length, 1, 'unchanged: no write');
  await assert.rejects(() => setTestPlayers(s.game, 'u-test'), TypeError);
  assert.equal(testPlayersApi(s.game).contract, 'ag-test-players/1');
  assert.equal(testPlayersApi(s.game).key, 'ashen-gate-manager.testPlayers');
  const setting = {key: 'ashen-gate-manager.testPlayers'};
  assert.equal(guardTestPlayersWrite(setting, 'gm1', s.game), true);
  assert.equal(guardTestPlayersWrite(setting, 'u-test', s.game), false, 'a player\'s write is cancelled');
  assert.equal(guardTestPlayersWrite(setting, 'nobody', s.game), false);
  assert.equal(guardTestPlayersWrite({key: 'ashen-gate-manager.codexPlayerAccess'}, 'u-test', s.game), true, 'other settings are not this guard\'s business');
  assert.deepEqual(readTestPlayers({settings: {get() { throw new Error('x'); }}}), [], 'unregistered: []');
});

test('GM Setup reads the checklist and saves with Save Changes only, GM only', async () => {
  const boxes = [['u-aria', true], ['u-real', false], ['u-test', true]].map(([id, checked]) => ({checked, dataset: {agSetupTestPlayer: id}}));
  const form = {querySelector: s => s === '[data-ag-test-players]' ? {} : null, querySelectorAll: s => s === '[data-ag-setup-test-player]' ? boxes : []};
  assert.deepEqual(readGmSetupForm(form).testPlayers, ['u-aria', 'u-test']);
  assert.equal(readGmSetupForm({querySelector: () => null, querySelectorAll: () => []}).testPlayers, undefined, 'section missing: leave the setting alone');
  assert.deepEqual(readGmSetupForm({querySelector: s => s === '[data-ag-test-players]' ? {} : null, querySelectorAll: () => []}).testPlayers, [], 'section present, none ticked');
  let s = store({user: gm});
  const ctx = g => ({game: g, moduleId: 'ashen-gate-manager', codexAccessKey: 'codexPlayerAccess'});
  const out = await saveGmSetup({testPlayers: ['u-aria', 'u-test', 'gm1']}, ctx(s.game));
  assert.deepEqual(s.writes, [['testPlayers', ['u-aria', 'u-test']]]);
  assert.match(out.message, /2 test players/);
  await saveGmSetup({testPlayers: ['u-test', 'u-aria']}, ctx(s.game));
  assert.equal(s.writes.length, 1, 'same set: no write');
  assert.match((await saveGmSetup({testPlayers: []}, ctx(s.game))).message, /no test players/);
  s = store({user: tester});
  await assert.rejects(() => saveGmSetup({testPlayers: ['u-test']}, ctx(s.game)), /Only the GM/);
  assert.deepEqual(s.writes, []);
  const tpl = read('../templates/manager.hbs');
  assert.match(tpl, /data-ag-setup-test-player="\{\{id\}\}"/);
  assert.ok(tpl.indexOf('aria-label="Test players"') < tpl.indexOf('{{{backupSettingsHtml}}}'), 'in GM Setup > General, before the backup section');
});

test('Modules tab: a Test players note on player-facing cards while the list is not empty', () => {
  const launchers = [{id: 'a', title: 'A'}, {id: 'b', title: 'B'}, {id: 'c', title: 'C'}];
  const access = [{id: 'a', state: 'Hidden', canToggle: true}, {id: 'b', state: 'Visible', canToggle: true}, {id: 'c', state: 'Unsupported'}];
  assert.deepEqual(moduleCards(launchers, access, 1).map(c => c.testPlayersNote), [TEST_PLAYERS_NOTE, TEST_PLAYERS_NOTE, '']);
  assert.equal(TEST_PLAYERS_NOTE, 'Test players: on');
  assert.deepEqual(moduleCards(launchers, access, 0).map(c => c.testPlayersNote), ['', '', '']);
  assert.deepEqual(moduleCards(launchers, access).map(c => c.testPlayersNote), ['', '', '']);
  assert.match(read('../templates/manager.hbs'), /\{\{#if testPlayersNote\}\}[^]*?\{\{testPlayersNote\}\}/);
});

test('player dock: a Test player is offered a gated module whose Player Access is off', async () => {
  const mods = new Map([['ashen-gate-utilities', {active: true, api: {conditions: {toggleOverlay() {}}, playerAccess: {contract: 'ag-player-access/1', getState: () => ({contract: 'ag-player-access/1', audience: 'player', playerAccessEnabled: false})}}}]]);
  const idsFor = async user => { globalThis.game = {...makeGame(), user}; return [...(await evaluateDockExtras({modules: mods, isGM: false})).ids]; };
  assert.deepEqual(await idsFor(tester), ['conditions']);
  assert.deepEqual(await idsFor(normal), []);
});

// ---- Boot: the setting is registered in init, the write guard is hooked, the NPC Codex menu follows a Test player ----
let booted = null;
async function boot(userId) {
  if (booted) { globalThis.game.user = users.get(userId); return booted; }
  const callbacks = new Map(), hooks = new Map(), registered = new Map(), menus = new Map();
  class ApplicationV2 { constructor(o) { this.options = o; } async render() { return this; } }
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: P => P, DialogV2: {confirm: async () => true}}}};
  globalThis.Hooks = {once: (e, fn) => callbacks.set(e, fn), on: (e, fn) => hooks.set(e, fn)};
  const g = makeGame({value: ['u-test']});
  globalThis.game = {user: users.get(userId), users, modules: g.modules,
    settings: {menus, settings: g.settings.settings,
      register: (m, k, o) => { registered.set(k, o); g.settings.settings.set(`${m}.${k}`, o); },
      registerMenu: (id, key, o) => menus.set(`${id}.${key}`, {key: `${id}.${key}`, ...o}),
      get: (m, k) => k === 'testPlayers' ? ['u-test'] : k === 'codexPlayerAccess' ? false : k === 'folderRenames' ? {} : undefined}};
  await import('../scripts/main.js');
  callbacks.get('init')();
  return booted = {callbacks, hooks, registered, menus};
}

test('Manager boot: Test players is registered as a hidden world Array and writes by players are cancelled', async () => {
  const b = await boot('u-test');
  const o = b.registered.get('testPlayers');
  assert.equal(o.scope, 'world'); assert.equal(o.config, false); assert.equal(o.type, Array); assert.deepEqual(o.default, []);
  const refuse = b.hooks.get('preUpdateSetting');
  assert.equal(refuse({key: 'ashen-gate-manager.testPlayers'}, {}, {}, 'u-test'), false);
  assert.equal(refuse({key: 'ashen-gate-manager.testPlayers'}, {}, {}, 'gm1'), undefined);
  assert.equal(b.hooks.get('preCreateSetting')({key: 'ashen-gate-manager.testPlayers'}, {}, {}, 'u-real'), false);
  assert.equal(refuse({key: 'ashen-gate-manager.importHistory'}, {}, {}, 'u-test'), undefined);
});

test('Manager boot: the NPC Codex menu is open for a Test player even while the Codex is not shared, and closed for a normal player', async () => {
  const b = await boot('u-test');
  try { b.callbacks.get('ready')(); } catch { /* browser-only parts of ready are not under test */ }
  assert.equal(b.menus.get('ashen-gate-manager.npcCodex').restricted, false);
  game.user = normal;
  b.registered.get('codexPlayerAccess').onChange(false);
  assert.equal(b.menus.get('ashen-gate-manager.npcCodex').restricted, true);
});
