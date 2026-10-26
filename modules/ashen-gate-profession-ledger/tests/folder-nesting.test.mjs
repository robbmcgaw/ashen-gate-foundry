// Where this module files its world documents (docs/folder-convention.md). Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID as ID, JOURNAL_PATH, SETTING, planJournal, migrateFolders} from '../scripts/folder-nesting.mjs';

function setup({journals = [], folders = [], done = ''} = {}) {
  const fmap = new Map(folders.map(f => [f.id, f])); let n = 0;
  globalThis.Folder = {create: async data => { const f = {id: `N${++n}`, name: data.name, type: data.type, folder: data.folder ?? null, flags: {}}; fmap.set(f.id, f); return f; }};
  const store = new Map([[`${ID}.${SETTING}`, done]]);
  const writes = [];
  const JournalEntry = {updateDocuments: async rows => { writes.push(rows); for (const r of rows) journals.find(d => d.id === r._id).folder = r.folder; }};
  const game = {user: {id: 'gm', isGM: true}, users: {activeGM: {id: 'gm', isSelf: true}}, folders: fmap, journal: journals,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  return {game, JournalEntry, writes, store, fmap};
}
const doc = (id, flags, folder = null) => ({id, folder, flags: {[ID]: flags}, ownership: {default: 0}});

test('the plan is read from this module\'s flags, never from the name', () => {
  assert.deepEqual(planJournal(doc('a', {role:'gm-data'})), JOURNAL_PATH);
  assert.equal(planJournal({id: 'b', name: 'Looks like ours', flags: {}}), null);
  assert.equal(planJournal({id: 'c', flags: {'someone-else': {role:'gm-data'}}}), null);
});

test('migration files the loose journal under Ashen Gate / Professions, leaves a GM-filed one, changes only the folder', async () => {
  const mine = setup({journals: [doc('loose', {role:'gm-data'})]});
  const r = await migrateFolders(mine);
  assert.equal(r.journals.moved, 1);
  const area = [...mine.fmap.values()].find(f => f.name === 'Professions');
  const root = [...mine.fmap.values()].find(f => f.name === 'Ashen Gate');
  assert.ok(area && root && !root.folder && area.folder === root.id);
  assert.equal(mine.game.journal[0].folder, area.id);
  assert.deepEqual(mine.game.journal[0].ownership, {default: 0});
  assert.ok(mine.writes.flat().every(row => Object.keys(row).sort().join() === '_id,folder'));
  const filed = setup({journals: [doc('filed', {role:'gm-data'}, 'MINE')], folders: [{id: 'MINE', name: 'My prep', type: 'JournalEntry', folder: null}]});
  assert.equal((await migrateFolders(filed)).journals.left, 1);
  assert.equal(filed.game.journal[0].folder, 'MINE');
  assert.equal(filed.fmap.size, 1, 'no folder is made when nothing moves');
});

test('refresh snapshots file under Backups, not the area folder', async () => {
  const w = setup({journals: [doc('snap', {role:'refresh-snapshot'}), doc('data', {role:'gm-data'})]});
  await migrateFolders(w);
  const backups = [...w.fmap.values()].find(f => f.name === 'Backups');
  assert.equal(w.game.journal.find(j => j.id === 'snap').folder, backups.id);
  assert.notEqual(w.game.journal.find(j => j.id === 'data').folder, backups.id);
});

test('re-runnable, recorded once, GM only, reuses an existing Ashen Gate folder, never deletes', async () => {
  const w = setup({journals: [doc('loose', {role:'gm-data'})], folders: [{id: 'AG', name: 'Ashen Gate', type: 'JournalEntry', folder: null}]});
  await migrateFolders(w);
  assert.equal([...w.fmap.values()].filter(f => f.name === 'Ashen Gate').length, 1);
  assert.equal(w.store.get(`${ID}.${SETTING}`), '1');
  assert.equal(await migrateFolders(w), null);
  w.store.set(`${ID}.${SETTING}`, '');
  assert.equal((await migrateFolders(w)).journals.moved, 0);
  assert.equal(w.game.journal.length, 1);
  const p = setup({journals: [doc('loose', {role:'gm-data'})]}); p.game.user.isGM = false;
  assert.equal(await migrateFolders(p), null);
});
