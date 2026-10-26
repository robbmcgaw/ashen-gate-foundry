// Shared folder helper (identical in every module that ships ag-folders.mjs). Mocked Foundry world: proves the
// logic, not the live Foundry sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AG_ROOT, AG_BACKUPS, AG_SORT_LAST, ensureFolderPath, findFolderPath, nestDocuments, isMigrationGM, areaPath, backupsPath} from '../js/ag-folders.mjs';

function world({gm = true, preload = [], slow = false} = {}) {
  const folders = new Map(); let n = 0, creates = 0;
  const add = d => { const f = {id: d.id ?? `F${++n}`, name: d.name, type: d.type, folder: d.folder ?? null, sort: d.sort ?? 0}; folders.set(f.id, f); return f; };
  preload.forEach(add);
  const Folder = {create: async d => { creates++; if (slow) await new Promise(r => setTimeout(r, 5)); return add(d); }};
  const game = {user: {id: 'u', isGM: gm}, folders, users: {activeGM: {id: 'u', isSelf: true}}};
  return {game, Folder, folders, creates: () => creates, warn: () => {}};
}
const names = folders => [...folders.values()].map(f => `${f.type}:${f.name}`);

test('ensureFolderPath creates each level once and is idempotent', async () => {
  const env = world();
  const a = await ensureFolderPath('JournalEntry', areaPath('Shops'), env);
  const b = await ensureFolderPath('JournalEntry', areaPath('Shops'), env);
  assert.equal(a.id, b.id);
  assert.equal(env.creates(), 2);
  assert.deepEqual(names(env.folders), ['JournalEntry:Ashen Gate', 'JournalEntry:Shops']);
  assert.equal(a.folder, [...env.folders.values()][0].id);
});

test('an existing Ashen Gate folder (made by anyone) is reused, per document type', async () => {
  const env = world({preload: [{id: 'R', name: AG_ROOT, type: 'JournalEntry'}]});
  const f = await ensureFolderPath('JournalEntry', areaPath('Shops'), env);
  assert.equal(f.folder, 'R');
  const item = await ensureFolderPath('Item', areaPath('Shops'), env);
  assert.notEqual(item.folder, 'R');   // folders are per type: Items get their own Ashen Gate
  assert.equal(env.creates(), 3);
});

test('two modules asking at the same moment get one folder (shared lock + re-check)', async () => {
  for (const slow of [false, true]) {
    const env = world({slow});
    const [a, b, c] = await Promise.all([ensureFolderPath('JournalEntry', backupsPath(), env), ensureFolderPath('JournalEntry', areaPath('Shops'), env), ensureFolderPath('JournalEntry', backupsPath(), env)]);
    assert.equal(a.id, c.id);
    assert.equal(a.folder, b.folder);
    assert.equal([...env.folders.values()].filter(f => f.name === AG_ROOT).length, 1);
    assert.equal([...env.folders.values()].filter(f => f.name === AG_BACKUPS).length, 1);
  }
});

test('a duplicate made elsewhere at the same moment resolves to the lowest id and nothing is deleted', async () => {
  const env = world();
  const warned = [];
  env.warn = m => warned.push(m);
  const create = env.Folder.create;
  env.Folder.create = async d => { const mine = await create(d); env.folders.set('A0', {id: 'A0', name: d.name, type: d.type, folder: d.folder ?? null}); return mine; };
  const f = await ensureFolderPath('JournalEntry', [AG_ROOT], env);
  assert.equal(f.id, 'A0');
  assert.equal(env.folders.size, 2);   // the loser is left alone
  assert.equal(warned.length, 1);
});

test('Backups is created sorted last; a non-GM never creates and only looks up', async () => {
  const env = world();
  const b = await ensureFolderPath('Actor', backupsPath(), env);
  assert.equal(b.sort, AG_SORT_LAST);
  const player = world({gm: false, preload: [{id: 'R', name: AG_ROOT, type: 'Actor'}]});
  assert.equal(await ensureFolderPath('Actor', areaPath('Party'), player), null);
  assert.equal(player.creates(), 0);
  assert.equal((await ensureFolderPath('Actor', [AG_ROOT], player)).id, 'R');
  assert.equal(findFolderPath('Actor', ['Nope'], player), null);
});

const mkDocs = list => list.map(d => ({id: d.id, folder: d.folder ?? null, own: d.own ?? true, ownership: {default: 0}, flags: {}}));

test('nestDocuments moves loose and old-folder documents, leaves GM-moved ones, writes only folder', async () => {
  const env = world({preload: [{id: 'OLD', name: 'Ashen Gate - Old', type: 'JournalEntry'}, {id: 'GM', name: 'My own place', type: 'JournalEntry'}]});
  const docs = mkDocs([{id: 'loose'}, {id: 'old', folder: 'OLD'}, {id: 'gm', folder: 'GM'}, {id: 'other', own: false}]);
  const writes = [];
  const run = () => nestDocuments({type: 'JournalEntry', docs, plan: d => d.own ? areaPath('Shops') : null, legacyIds: new Set(['OLD']), update: async rows => { writes.push(rows); for (const r of rows) docs.find(d => d.id === r._id).folder = r.folder; }, env});
  const first = await run();
  assert.deepEqual(first.ids.sort(), ['loose', 'old']);
  assert.equal(first.left, 1);
  assert.ok(writes[0].every(r => Object.keys(r).sort().join() === '_id,folder'));
  assert.equal(docs.find(d => d.id === 'gm').folder, 'GM');
  assert.equal(docs.find(d => d.id === 'other').folder, null);
  assert.ok(docs.every(d => d.ownership.default === 0));
  assert.ok(env.folders.has('OLD') && env.folders.has('GM'));      // nothing deleted, old folder left behind
  const again = await run();                                         // re-run: nothing more to do
  assert.equal(again.moved, 0);
  assert.equal(writes.length, 1);
  assert.equal(again.inPlace, 2);
});

test('nestDocuments does nothing for a non-GM', async () => {
  const env = world({gm: false});
  const r = await nestDocuments({type: 'JournalEntry', docs: mkDocs([{id: 'x'}]), plan: () => areaPath('Shops'), update: async () => { throw Error('no'); }, env});
  assert.equal(r.moved, 0);
});

test('isMigrationGM: only the active GM client', () => {
  assert.equal(isMigrationGM({game: {user: {id: 'a', isGM: true}, users: {activeGM: {id: 'a', isSelf: true}}}}), true);
  assert.equal(isMigrationGM({game: {user: {id: 'b', isGM: true}, users: {activeGM: {id: 'a', isSelf: false}}}}), false);
  assert.equal(isMigrationGM({game: {user: {id: 'p', isGM: false}}}), false);
});
