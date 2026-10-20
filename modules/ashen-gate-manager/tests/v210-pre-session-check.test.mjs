/** Pre-session check (0.21.0). Proves logic with mocked Foundry globals, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck, compareVersions, visibleToPlayers, STATUS} from '../scripts/pre-session-check.js';

const M = 'ashen-gate-manager';
const ACCESS = 'ag-player-access/1';

/** Every write path a mocked document, setting or API offers records itself here. */
function recorder() {
  const writes = [];
  const trap = name => (...args) => { writes.push(name); return Promise.resolve(args[0]); };
  const docWrites = () => Object.fromEntries(['update', 'delete', 'setFlag', 'unsetFlag', 'createEmbeddedDocuments',
    'updateEmbeddedDocuments', 'deleteEmbeddedDocuments'].map(n => [n, trap(n)]));
  return {writes, trap, docWrites};
}
const coll = list => ({contents: list});

function mkDoc(rec, name, {ownership = {default: 0}, flags = {}, pages} = {}) {
  return {name, ownership, flags, id: name, ...(pages ? {pages: coll(pages)} : {}), ...rec.docWrites(),
    testUserPermission(user, level) { return level === 'OBSERVER' && ((this.ownership.default ?? 0) >= 2 || (this.ownership[user.id] ?? 0) >= 2); }};
}
const access = (rec, id, enabled) => ({contract: ACCESS, getState: () => ({contract: ACCESS, moduleId: id, audience: 'player', playerAccessEnabled: enabled, configurable: true}),
  setEnabled: rec.trap(`${id}.setEnabled`)});

const loc = (id, name, state, extra = {}) => ({id, name, state, pinKey: `pin-${id}`, passConditions: false, audience: {mode: 'everyone', userIds: []},
  published: {name, passConditions: false}, parentLocationId: '', isRegion: false, conditions: [], ...extra});

/** A healthy world: every module active, current, Player Access on, nothing leaking. */
function healthy({rec = recorder(), gm = true, overrides = {}} = {}) {
  const locations = [loc('LOC-TEST-TOWN', 'Testford Town', 'revealed'), loc('LOC-TEST-VAULT', 'Sunken Vault', 'hidden'),
    loc('LOC-TEST-RUIN', 'Whispering Ruin', 'unidentified')];
  const views = {'LOC-TEST-TOWN': {id: 'LOC-TEST-TOWN', name: 'Testford Town', children: []}, 'LOC-TEST-RUIN': {key: 'pin-LOC-TEST-RUIN', state: 'unidentified', name: 'Unknown place'}};
  const quests = [{id: 'QUEST-TEST-OPEN', name: 'Open Road', status: 'Active'}, {id: 'QUEST-TEST-SECRET', name: 'Silent Pact', status: 'Hidden'}];
  const states = {'QUEST-TEST-OPEN': {status: 'Active', revealed: true}, 'QUEST-TEST-SECRET': {status: 'Hidden', revealed: false}};
  const writeApi = names => Object.fromEntries(names.map(n => [n, rec.trap(n)]));
  const modules = {
    [M]: {id: M, title: 'Ashen Gate | General Manager', active: true, version: '0.21.0', api: {}},
    'ashen-gate-locations': {id: 'ashen-gate-locations', title: 'Ashen Gate | Locations', active: true, version: '1.8.1', api: {
      listLocations: () => structuredClone(locations), previewLocation: (l, state) => state === 'hidden' ? null : structuredClone(views[l.id] ?? null),
      playerAccess: access(rec, 'ashen-gate-locations', true),
      ...writeApi(['saveLocation', 'setLocationState', 'publishLocation', 'deleteLocation', 'importLocations', 'setAudience', 'markNodeExhausted', 'moveLocation'])}},
    'ashen-gate-quest-manager': {id: 'ashen-gate-quest-manager', title: 'Ashen Gate | Quest Log', active: true, version: '0.7.2', api: {
      listQuests: () => structuredClone(quests), getGMSource: id => ({id, visibility: 'reveal_gated'}), getGMState: id => structuredClone(states[id]),
      listVisible: () => [{id: 'QUEST-TEST-OPEN', name: 'Open Road', summary: 'Walk to Testford Town.', objectives: []}],
      playerAccess: access(rec, 'ashen-gate-quest-manager', true), ...writeApi(['setGMState', 'importQuests'])}},
    'ashen-gate-skill-trees': {id: 'ashen-gate-skill-trees', title: 'Ashen Gate | Skill Trees', active: true, version: '0.10.1', api: {
      listTrees: () => [{id: 'TREE-TEST', name: '[TEST] Tree'}], playerAccess: access(rec, 'ashen-gate-skill-trees', true), ...writeApi(['importTrees', 'publish', 'grantPoints'])}},
    'ashen-gate-factions': {id: 'ashen-gate-factions', title: 'Ashen Gate | Renown', active: true, version: '0.8.3', api: {
      getFactions: () => [{id: 'FAC-TEST', name: 'Guild'}], playerAccess: access(rec, 'ashen-gate-factions', true), ...writeApi(['importFactions', 'refreshPlayerViews'])}},
    'ashen-gate-headquarters': {id: 'ashen-gate-headquarters', title: 'Ashen Gate | Headquarters', active: true, version: '0.8.1', api: {
      exportState: () => ({catalog: [{id: 'FAC-1'}]}), playerAccess: access(rec, 'ashen-gate-headquarters', true), ...writeApi(['importFacilities'])}},
    'ashen-gate-profession-ledger': {id: 'ashen-gate-profession-ledger', title: 'Ashen Gate | Profession Ledger', active: true, version: '0.13.0', api: {playerAccess: access(rec, 'ashen-gate-profession-ledger', true)}},
    'ashen-gate-utilities': {id: 'ashen-gate-utilities', title: 'Ashen Gate | Utilities', active: true, version: '0.7.2', api: {playerAccess: access(rec, 'ashen-gate-utilities', true)}},
    ...overrides.modules
  };
  for (const [k, v] of Object.entries(modules)) if (v === undefined) delete modules[k];
  const users = [{id: 'gm1', isGM: true}, {id: 'p1', isGM: false}];
  const game = {user: {isGM: gm, ...rec.docWrites()}, users: coll(users), world: {id: 'w', title: '[TEST] World'},
    version: '14.367', release: {generation: 14, build: 367}, system: {id: 'dnd5e', version: '6.0.6'},
    modules: new Map(Object.entries(modules)),
    items: coll(overrides.items ?? [mkDoc(rec, 'Longsword')]), actors: coll(overrides.actors ?? []), journal: coll(overrides.journal ?? []),
    settings: {get: () => true, set: rec.trap('settings.set')}, ...overrides.game};
  return {game, rec, locations, views};
}
const now = new Date('2026-10-19T18:00:00Z');
const by = (out, check) => out.rows.filter(r => r.check === check);

test('healthy world: no FAIL or WARN, summary says ready, report text has every check', async () => {
  const {game} = healthy();
  const out = await runPreSessionCheck(game, {now});
  assert.deepEqual(out.rows.filter(r => r.status === 'FAIL' || r.status === 'WARN'), []);
  assert.equal(out.counts.FAIL, 0);
  assert.match(out.summary, /0 WARN, 0 FAIL.*Ready to play\.$/);
  for (const h of ['1. Module versions', '2. GM storage', '3. Player Access', '4. Test data', '5. Leak scan', '6. Migration', '7. Environment'])
    assert.ok(out.text.includes(h), h);
  assert.ok(out.text.startsWith('Ashen Gate pre-session check — [TEST] World, 2026-10-19 18:00'));
  assert.equal(out.filename, 'AG_PreSession_Check_2026-10-19.txt');
  for (const r of out.rows) assert.ok(Object.values(STATUS).includes(r.status));
});

test('GM gate: a player is rejected in the function itself, and nothing is read or written', async () => {
  const {game, rec} = healthy({gm: false});
  let read = false;
  game.modules.get('ashen-gate-locations').api.listLocations = () => { read = true; return []; };
  await assert.rejects(runPreSessionCheck(game), /Only the GM/);
  await assert.rejects(runPreSessionCheck({}), /Only the GM/);
  assert.equal(read, false);
  assert.deepEqual(rec.writes, []);
});

test('read-only: no update/create/delete/setFlag/setting or API write is called, even with problems everywhere', async () => {
  const rec = recorder();
  const items = [mkDoc(rec, '[TEST] Blade', {ownership: {default: 2}}),
    mkDoc(rec, 'Secret Relic', {ownership: {default: 0, p1: 2}, flags: {[M]: {source: {sourceId: 'ITEM-TEST-RELIC', visibility: 'gm'}}}})];
  const {game} = healthy({rec, overrides: {items, journal: [mkDoc(rec, '[TEST] Notes', {ownership: {default: 2}, pages: [mkDoc(rec, '[TEST] Page', {ownership: {default: -1}})]})]}});
  game.modules.get('ashen-gate-quest-manager').api.listVisible = () => [{id: 'QUEST-TEST-OPEN', summary: 'The Silent Pact waits at the Sunken Vault.'}];
  game.modules.get('ashen-gate-factions').api.playerAccess = access(rec, 'ashen-gate-factions', false);
  // Foundry-side create calls, as globals a careless check could reach for.
  for (const k of ['Item', 'Actor', 'JournalEntry']) game[`${k}Class`] = {create: rec.trap(`${k}.create`), createDocuments: rec.trap(`${k}.createDocuments`)};
  const out = await runPreSessionCheck(game, {now});
  assert.ok(out.counts.FAIL > 0 && out.counts.WARN > 0);
  assert.deepEqual(rec.writes, []);
});

test('1 versions: inactive, too old and not installed modules', async () => {
  const {game} = healthy({overrides: {modules: {
    'ashen-gate-factions': {id: 'ashen-gate-factions', active: false, version: '0.8.3', api: null},
    'ashen-gate-quest-manager': {id: 'ashen-gate-quest-manager', active: true, version: '0.5.2', api: {listQuests: () => [], getGMSource: () => null}},
    'ashen-gate-utilities': undefined}}});
  const rows = by(await runPreSessionCheck(game, {now}), 'Module versions');
  assert.ok(rows.some(r => r.status === 'WARN' && /Renown 0\.8\.3 is installed but not active/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'WARN' && /Quest Log 0\.5\.2 is older than 0\.6\.0/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'N-A' && r.text === 'Utilities is not installed.'));
  assert.ok(rows.some(r => r.status === 'PASS' && r.text === 'Locations 1.8.1 is active.'));
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('0.6.0', '0.6'), 0);
});

test('2 storage: missing API fails, throwing store fails, empty warns, not installed is N-A', async () => {
  const {game} = healthy({overrides: {modules: {
    'ashen-gate-skill-trees': {id: 'ashen-gate-skill-trees', active: true, version: '0.10.1', api: {listTrees: () => []}},
    'ashen-gate-headquarters': {id: 'ashen-gate-headquarters', active: true, version: '0.8.1', api: {exportState: () => { throw new Error('vault journal missing'); }}},
    'ashen-gate-factions': {id: 'ashen-gate-factions', active: true, version: '0.6.0', api: {}},
    'ashen-gate-locations': undefined}}});
  game.modules.get('ashen-gate-quest-manager').api.getGMSource = id => id === 'QUEST-TEST-SECRET' ? null : {id};
  const rows = by(await runPreSessionCheck(game, {now}), 'GM storage');
  const find = label => rows.find(r => r.text.startsWith(label));
  assert.equal(find('Locations GM Data').status, 'N-A');
  assert.match(find('Locations GM Data').text, /not installed/);
  assert.equal(find('Quest GM sources').status, 'FAIL');
  assert.match(find('Quest GM sources').text, /QUEST-TEST-SECRET/);
  assert.equal(find('Skill Trees definitions').status, 'WARN');
  assert.match(find('Skill Trees definitions').text, /Initialize GM Storage/);
  assert.equal(find('Renown definitions').status, 'FAIL');
  assert.match(find('Renown definitions').text, /no read API/);
  assert.equal(find('Headquarters vault').status, 'FAIL');
  assert.match(find('Headquarters vault').text, /vault journal missing/);
});

test('3 Player Access: hidden launcher warns, unreadable warns, inactive and missing are N-A; setEnabled never called', async () => {
  const {game, rec} = healthy({overrides: {modules: {'ashen-gate-headquarters': undefined,
    'ashen-gate-utilities': {id: 'ashen-gate-utilities', active: false, version: '0.7.2'},
    'ashen-gate-profession-ledger': {id: 'ashen-gate-profession-ledger', active: true, version: '0.13.0', api: {}}}}});
  game.modules.get('ashen-gate-skill-trees').api.playerAccess = access(rec, 'ashen-gate-skill-trees', false);
  const rows = by(await runPreSessionCheck(game, {now}), 'Player Access');
  assert.ok(rows.some(r => r.status === 'WARN' && /^Skill Trees: Player Access off; players will not see its launcher/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'WARN' && /^Profession Ledger: Player Access could not be read/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'N-A' && r.text === 'Headquarters: not installed.'));
  assert.ok(rows.some(r => r.status === 'N-A' && /^Utilities: not active/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'PASS' && /^Locations: Player Access on/.test(r.text)));
  assert.deepEqual(rec.writes, []);
});

test('4 test data: player-visible [TEST] Items, Actors, journals, pages, locations and quests are listed', async () => {
  const rec = recorder();
  const {game} = healthy({rec, overrides: {
    items: [mkDoc(rec, '[TEST] Blade', {ownership: {default: 2}}), mkDoc(rec, '[TEST] GM Blade')],
    actors: [mkDoc(rec, '[TEST] Hero', {ownership: {default: 0, p1: 3}})],
    journal: [mkDoc(rec, 'Handouts', {ownership: {default: 2}, pages: [mkDoc(rec, '[TEST] Handout', {ownership: {default: -1}})]})]}});
  game.modules.get('ashen-gate-locations').api.listLocations = () => [loc('LOC-TEST-A', '[TEST] Camp', 'revealed'), loc('LOC-TEST-B', '[TEST] Lair', 'hidden')];
  game.modules.get('ashen-gate-quest-manager').api.listQuests = () => [{id: 'QUEST-TEST-OPEN', name: '[TEST] Errand', status: 'Active'}];
  const [r] = by(await runPreSessionCheck(game, {now}), 'Test data');
  assert.equal(r.status, 'WARN');
  assert.match(r.text, /^5 \[TEST\] records visible to players/);
  for (const s of ['Item "[TEST] Blade"', 'Actor "[TEST] Hero"', 'Journal page "[TEST] Handout"', 'Location "[TEST] Camp"', 'Quest "[TEST] Errand"']) assert.ok(r.text.includes(s), s);
  for (const s of ['GM Blade', '[TEST] Lair']) assert.equal(r.text.includes(s), false, s);
  const quiet = healthy({overrides: {items: [mkDoc(rec, '[TEST] GM only')]}});
  quiet.game.modules.get('ashen-gate-skill-trees').api.listTrees = () => [{id: 'T'}];
  assert.match(by(await runPreSessionCheck(quiet.game, {now}), 'Test data')[0].text, /1 \[TEST\] record in the world, none visible/);
});

test('5 leak scan: hidden/unidentified location, unrevealed quest and gm Item names in player views FAIL by id, never by name', async () => {
  const rec = recorder();
  const {game, views} = healthy({rec, overrides: {items: [mkDoc(rec, 'Ember Crown', {flags: {[M]: {source: {sourceId: 'ITEM-TEST-CROWN', visibility: 'gm'}}}}),
    mkDoc(rec, 'Open Shield', {ownership: {default: 2}, flags: {[M]: {source: {sourceId: 'ITEM-TEST-SHIELD', visibility: 'gm'}}}})]}});
  views['LOC-TEST-TOWN'].children = [{key: 'pin-x', name: 'Sunken Vault'}];
  views['LOC-TEST-RUIN'].name = 'Whispering Ruin';
  game.modules.get('ashen-gate-quest-manager').api.listVisible = () => [{id: 'QUEST-TEST-OPEN', summary: 'Find the silent pact and the Ember Crown.'}];
  const out = await runPreSessionCheck(game, {now});
  const fails = by(out, 'Leak scan').filter(r => r.status === 'FAIL').map(r => r.text);
  assert.ok(fails.includes('The name of hidden location LOC-TEST-VAULT appears in Locations player card LOC-TEST-TOWN.'));
  assert.ok(fails.includes('The name of unidentified location LOC-TEST-RUIN appears in Locations player card LOC-TEST-RUIN.'));
  assert.ok(fails.includes('The name of unrevealed quest QUEST-TEST-SECRET appears in Quest Log player view QUEST-TEST-OPEN.'));
  assert.ok(fails.includes('The name of gm-visibility Item ITEM-TEST-CROWN appears in Quest Log player view QUEST-TEST-OPEN.'));
  assert.ok(fails.includes('gm-visibility Item ITEM-TEST-SHIELD is visible to players (Item ownership).'));
  for (const secret of ['Sunken Vault', 'Whispering Ruin', 'Silent Pact', 'Ember Crown']) assert.equal(out.text.includes(secret), false, secret);
  assert.match(out.summary, /Fix the FAIL lines/);
});

test('5 leak scan: clean views pass; modules without a player projection say could not check', async () => {
  const {game} = healthy();
  const rows = by(await runPreSessionCheck(game, {now}), 'Leak scan');
  assert.equal(rows[0].status, 'PASS');
  assert.match(rows[0].text, /No hidden name in 3 player views \(checked against 3 hidden records\)/);
  for (const t of ['Renown', 'Skill Trees', 'Headquarters']) assert.ok(rows.some(r => r.status === 'N-A' && r.text.startsWith(`${t}: could not check`)), t);
  const old = healthy({overrides: {modules: {'ashen-gate-locations': {id: 'ashen-gate-locations', active: true, version: '1.2.0', api: {listLocations: () => []}}}}});
  assert.ok(by(await runPreSessionCheck(old.game, {now}), 'Leak scan').some(r => r.status === 'N-A' && /^Locations: could not check/.test(r.text)));
});

test('6 migration: unsettled inheritance switch warns with a pending Region notice; settled passes; old Locations is N-A', async () => {
  const {game} = healthy();
  game.modules.get('ashen-gate-locations').api.listLocations = () => [
    loc('LOC-TEST-REGION', 'R', 'revealed', {isRegion: true, conditions: [{label: 'Fog'}], passConditions: null}),
    loc('LOC-TEST-CHILD', 'C', 'revealed', {parentLocationId: 'LOC-TEST-REGION'}),
    loc('LOC-TEST-PUB', 'P', 'revealed', {published: {name: 'P'}})];
  const rows = by(await runPreSessionCheck(game, {now}), 'Migration');
  assert.equal(rows[0].status, 'WARN');
  assert.match(rows[0].text, /not settled on 2 locations \(LOC-TEST-REGION, LOC-TEST-PUB\)/);
  assert.ok(rows.some(r => r.status === 'WARN' && /GM notice is pending.*1 Region.*LOC-TEST-REGION/.test(r.text)));
  assert.ok(rows.some(r => r.status === 'PASS' && /audience set/.test(r.text)));
  const ok = by(await runPreSessionCheck(healthy().game, {now}), 'Migration');
  assert.deepEqual(ok.map(r => r.status), ['PASS', 'PASS', 'PASS']);
  const old = healthy({overrides: {modules: {'ashen-gate-locations': {id: 'ashen-gate-locations', active: true, version: '1.7.0', api: {listLocations: () => []}}}}});
  assert.equal(by(await runPreSessionCheck(old.game, {now}), 'Migration')[0].status, 'N-A');
});

test('7 environment: Foundry build and dnd5e version mismatches warn', async () => {
  const {game} = healthy({overrides: {game: {version: '14.360', release: {generation: 14, build: 360}, system: {id: 'dnd5e', version: '5.1.0'}}}});
  const rows = by(await runPreSessionCheck(game, {now}), 'Environment');
  assert.deepEqual(rows.map(r => r.status), ['WARN', 'WARN']);
  assert.match(rows[0].text, /build 360.*build 367/);
  assert.match(rows[1].text, /dnd5e 5\.1\.0; modules are tested on dnd5e 6\.0\.6/);
  const noRelease = healthy({overrides: {game: {release: undefined, version: '14.367'}}});
  assert.equal(by(await runPreSessionCheck(noRelease.game, {now}), 'Environment')[0].status, 'PASS');
});

test('nothing installed but Manager: every partner is N-A or a plain not-installed line, no crash', async () => {
  const off = Object.fromEntries(['ashen-gate-locations', 'ashen-gate-quest-manager', 'ashen-gate-skill-trees', 'ashen-gate-factions',
    'ashen-gate-headquarters', 'ashen-gate-profession-ledger', 'ashen-gate-utilities'].map(id => [id, undefined]));
  const {game} = healthy({overrides: {modules: off}});
  const out = await runPreSessionCheck(game, {now});
  assert.equal(out.counts.FAIL, 0);
  assert.equal(out.counts.WARN, 0);
  assert.ok(out.rows.filter(r => r.check !== 'Environment' && r.check !== 'Test data' && !(r.check === 'Module versions' && /General Manager/.test(r.text)))
    .every(r => r.status === 'N-A'));
});

test('one broken partner API does not stop the other checks', async () => {
  const {game} = healthy();
  game.modules.get('ashen-gate-quest-manager').api.listVisible = () => { throw new Error('boom'); };
  game.modules.get('ashen-gate-skill-trees').api.playerAccess = {contract: ACCESS, getState: () => { throw new Error('kaput'); }};
  const out = await runPreSessionCheck(game, {now});
  assert.ok(by(out, 'Environment').length === 2);
  assert.ok(by(out, 'Player Access').some(r => /Skill Trees: Player Access could not be read/.test(r.text)));
});

test('visibleToPlayers: default observer, per-user grant, inherited page', () => {
  const users = [{id: 'p1'}];
  assert.equal(visibleToPlayers({ownership: {default: 2}}, users), true);
  assert.equal(visibleToPlayers({ownership: {default: 0, p1: 2}}, users), true);
  assert.equal(visibleToPlayers({ownership: {default: 0}}, users), false);
  assert.equal(visibleToPlayers({ownership: {default: -1}}, users, true), true);
  assert.equal(visibleToPlayers({ownership: {default: -1}}, users, false), false);
});
