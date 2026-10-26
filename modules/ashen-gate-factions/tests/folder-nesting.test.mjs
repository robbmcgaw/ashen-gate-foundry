// Renown files its Journals and held reward Items under Ashen Gate. Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID as ID} from '../scripts/core.mjs';
import {migrateFolders, planJournal, planHolding, FACTIONS_PATH, BACKUPS_PATH, HOLDING_PATH, SETTING, LEGACY_STORAGE_NAME, LEGACY_HOLDING_NAME} from '../scripts/folder-nesting.mjs';

function setup({journals = [], items = [], folders = [], done = ''} = {}) {
  const fmap = new Map(folders.map(f => [f.id, f])); let n = 0;
  globalThis.Folder = {create: async d => { const f = {id: `N${++n}`, name: d.name, type: d.type, folder: d.folder ?? null, flags: {}}; fmap.set(f.id, f); return f; }};
  const store = new Map([[`${ID}.${SETTING}`, done]]);
  const writes = [];
  const mk = list => ({updateDocuments: async rows => { writes.push(rows); for (const r of rows) list.find(d => d.id === r._id).folder = r.folder; }});
  const game = {user: {id: 'gm', isGM: true}, users: {activeGM: {id: 'gm', isSelf: true}}, folders: fmap, journal: journals, items,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  return {game, JournalEntry: mk(journals), Item: mk(items), writes, store, fmap};
}
const jd = (id, key, folder = null) => ({id, folder, flags: {[ID]: {[key]: {}}}, ownership: {default: 0}});
const legacy = (id, name, type, flag) => ({id, name, type, folder: null, flags: {[ID]: flag}});

test('plans come from Renown flags: snapshots to Backups, everything else of Renown to Factions Data', () => {
  assert.deepEqual(planJournal(jd('a', 'importSnapshot')), BACKUPS_PATH);
  for (const k of ['faction', 'groupClaims', 'individual', 'playerView', 'folderIndex']) assert.deepEqual(planJournal(jd('b', k)), FACTIONS_PATH);
  assert.equal(planJournal({name: 'Renown Snapshot - fake', flags: {}}), null);
  assert.deepEqual(planHolding({documentName: 'Item', flags: {[ID]: {holding: {}}}}), HOLDING_PATH);
  assert.equal(planHolding({documentName: 'Item', flags: {}}), null);
});

test('migration: old Factions Data folder contents, loose ones and held copies move; GM-filed ones stay; nothing deleted', async () => {
  const w = setup({
    folders: [legacy('OLD', LEGACY_STORAGE_NAME, 'JournalEntry', {storageFolder: true}), legacy('HOLD', LEGACY_HOLDING_NAME, 'Item', {store: 'reward-holding'}),
      {id: 'MINE', name: 'Prep', type: 'JournalEntry', folder: null, flags: {}}],
    journals: [jd('def', 'faction', 'OLD'), jd('snap', 'importSnapshot', 'OLD'), jd('view', 'playerView'), jd('mine', 'faction', 'MINE'), {id: 'other', folder: 'OLD', flags: {}}],
    items: [{id: 'held', documentName: 'Item', folder: 'HOLD', flags: {[ID]: {holding: {}}}, ownership: {default: 0}}, {id: 'plain', folder: 'HOLD', flags: {}}]});
  const r = await migrateFolders(w);
  const by = (type, name) => [...w.fmap.values()].find(f => f.type === type && f.name === name);
  const fd = by('JournalEntry', 'Factions Data'), bk = by('JournalEntry', 'Backups');
  const f = id => w.game.journal.find(d => d.id === id).folder;
  assert.equal(f('def'), fd.id); assert.equal(f('view'), fd.id); assert.equal(f('snap'), bk.id);
  assert.equal(f('mine'), 'MINE'); assert.equal(f('other'), 'OLD');
  assert.equal(w.game.items.find(d => d.id === 'held').folder, by('Item', 'Renown Rewards').id);
  assert.equal(w.game.items.find(d => d.id === 'plain').folder, 'HOLD');
  assert.equal(by('JournalEntry', 'Ashen Gate').folder, null);
  assert.equal(by('JournalEntry', 'Factions Data').folder, by('JournalEntry', 'Ashen Gate').id);
  assert.ok(w.fmap.has('OLD') && w.fmap.has('HOLD'), 'old folders are left in place');
  for (const rows of w.writes) assert.ok(rows.every(row => Object.keys(row).sort().join() === '_id,folder'));
  assert.equal(r.journals.moved, 3); assert.equal(r.journals.left, 1);
  assert.equal(w.store.get(`${ID}.${SETTING}`), '1');
});

test('a folder the GM renamed is not the old default: its documents are left alone', async () => {
  const w = setup({folders: [legacy('OLD', 'Renown (mine)', 'JournalEntry', {storageFolder: true})], journals: [jd('def', 'faction', 'OLD')]});
  await migrateFolders(w);
  assert.equal(w.game.journal[0].folder, 'OLD');
});

test('re-run and non-GM do nothing', async () => {
  const w = setup({journals: [jd('def', 'faction')]});
  await migrateFolders(w);
  assert.equal(await migrateFolders(w), null);
  w.store.set(`${ID}.${SETTING}`, '');
  assert.equal((await migrateFolders(w)).journals.moved, 0);
  const p = setup({journals: [jd('def', 'faction')]}); p.game.user.isGM = false;
  assert.equal(await migrateFolders(p), null);
});

test('an existing Ashen Gate folder made by Manager is reused, not duplicated', async () => {
  const w = setup({folders: [{id: 'AG', name: 'Ashen Gate', type: 'JournalEntry', folder: null, flags: {}}], journals: [jd('def', 'faction')]});
  await migrateFolders(w);
  assert.equal([...w.fmap.values()].filter(f => f.name === 'Ashen Gate' && f.type === 'JournalEntry').length, 1);
  assert.equal([...w.fmap.values()].find(f => f.name === 'Factions Data').folder, 'AG');
});
