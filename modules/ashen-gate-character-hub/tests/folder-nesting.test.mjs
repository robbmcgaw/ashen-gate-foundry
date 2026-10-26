// The Hub files level backups and its Journey journal under Ashen Gate. Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID as ID} from '../scripts/constants.mjs';
import {SETTING, planActor, planJournal, migrateFolders, BACKUPS_PATH, JOURNEY_PATH} from '../scripts/folder-nesting.mjs';

function setup({actors = [], journals = [], folders = [], done = ''} = {}) {
  const fmap = new Map(folders.map(f => [f.id, f])); let n = 0;
  globalThis.Folder = {create: async d => { const f = {id: `N${++n}`, name: d.name, type: d.type, folder: d.folder ?? null}; fmap.set(f.id, f); return f; }};
  const store = new Map([[`${ID}.${SETTING}`, done]]), writes = [];
  const mk = list => ({updateDocuments: async rows => { writes.push(rows); for (const r of rows) list.find(d => d.id === r._id).folder = r.folder; }});
  const game = {user: {id: 'gm', isGM: true}, users: {activeGM: {id: 'gm', isSelf: true}}, folders: fmap, actors, journal: journals,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  return {game, Actor: mk(actors), JournalEntry: mk(journals), writes, store, fmap};
}
const backup = (id, folder = null) => ({id, folder, flags: {[ID]: {levelBackup: {sourceId: 'x'}}}, ownership: {default: 0}});

test('plans come from Hub flags only', () => {
  assert.deepEqual(planActor(backup('a')), BACKUPS_PATH);
  assert.equal(planActor({name: 'Wren - level 3', flags: {}}), null);
  assert.deepEqual(planJournal({flags: {[ID]: {journeyStore: true}}}), JOURNEY_PATH);
  assert.equal(planJournal({name: 'Ashen Gate Hub • Journey (GM only)', flags: {}}), null);
});

test('backups in the old "Ashen Gate / Level backups" folder move to Backups; GM-filed ones stay; old folder is left', async () => {
  const w = setup({
    folders: [{id: 'AG', name: 'Ashen Gate', type: 'Actor', folder: null}, {id: 'LB', name: 'Level backups', type: 'Actor', folder: 'AG'}, {id: 'MINE', name: 'Old heroes', type: 'Actor', folder: null}],
    actors: [backup('old', 'LB'), backup('loose'), backup('mine', 'MINE'), {id: 'pc', folder: null, flags: {}}],
    journals: [{id: 'j', folder: null, flags: {[ID]: {journeyStore: true}}, ownership: {default: 0}}]});
  const r = await migrateFolders(w);
  const backups = [...w.fmap.values()].find(f => f.name === 'Backups' && f.type === 'Actor');
  assert.equal(backups.folder, 'AG', 'the existing Ashen Gate Actor folder is reused');
  const f = id => w.game.actors.find(a => a.id === id).folder;
  assert.equal(f('old'), backups.id); assert.equal(f('loose'), backups.id);
  assert.equal(f('mine'), 'MINE'); assert.equal(f('pc'), null);
  assert.ok(w.fmap.has('LB'), 'the old folder is not deleted');
  assert.ok([...w.fmap.values()].some(x => x.name === 'Character Hub' && x.type === 'JournalEntry'));
  assert.deepEqual(w.game.actors[0].ownership, {default: 0});
  assert.ok(w.writes.flat().every(row => Object.keys(row).sort().join() === '_id,folder'));
  assert.equal(r.actors.moved, 2); assert.equal(r.actors.left, 1);
});

test('recorded once, re-runnable, GM only', async () => {
  const w = setup({actors: [backup('loose')]});
  await migrateFolders(w);
  assert.equal(await migrateFolders(w), null);
  w.store.set(`${ID}.${SETTING}`, '');
  assert.equal((await migrateFolders(w)).actors.moved, 0);
  const p = setup({actors: [backup('loose')]}); p.game.user.isGM = false;
  assert.equal(await migrateFolders(p), null);
});
