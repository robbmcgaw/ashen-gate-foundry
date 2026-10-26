// Utilities files its shop journals and Party Stash under Ashen Gate. Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
import {migrateFolders, planJournal, planActor, SHOPS_PATH, STASH_PATH, SETTING} from '../scripts/folder-nesting.mjs';

function setup({journals = [], actors = [], folders = [], done = ''} = {}) {
  const fmap = new Map(folders.map(f => [f.id, f])); let n = 0;
  globalThis.Folder = {create: async d => { const f = {id: `N${++n}`, name: d.name, type: d.type, folder: d.folder ?? null}; fmap.set(f.id, f); return f; }};
  const store = new Map([[`${ID}.${SETTING}`, done]]);
  const writes = {JournalEntry: [], Actor: []};
  const mk = (name, list) => ({updateDocuments: async rows => { writes[name].push(rows); for (const r of rows) list.find(d => d.id === r._id).folder = r.folder; }});
  const game = {user: {id: 'gm', isGM: true}, users: {activeGM: {id: 'gm', isSelf: true}}, folders: fmap, journal: journals, actors,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  return {game, JournalEntry: mk('JournalEntry', journals), Actor: mk('Actor', actors), writes, store, fmap};
}
const j = (id, store, folder = null) => ({id, folder, flags: {[ID]: {store}}, ownership: {default: id === 'view' ? 2 : 0}});

test('plans come from Utilities flags, never names', () => {
  assert.deepEqual(planJournal(j('a', 'shops-gm')), SHOPS_PATH);
  assert.deepEqual(planJournal(j('b', 'shops-player')), SHOPS_PATH);
  assert.equal(planJournal({name: 'Utilities Shops (GM Data)', flags: {}}), null);
  assert.deepEqual(planActor({flags: {[ID]: {partyStash: true}}}), STASH_PATH);
  assert.equal(planActor({name: 'Ashen Gate | Party Stash', flags: {}}), null);
});

test('migration moves loose shop journals and the stash, leaves a GM-filed one, never deletes or changes ownership', async () => {
  const w = setup({journals: [j('gm1', 'shops-gm'), j('view', 'shops-player'), j('mine', 'shops-player', 'MINE'), j('x', undefined)],
    actors: [{id: 'stash', folder: null, flags: {[ID]: {partyStash: true}}, ownership: {default: 2}}, {id: 'pc', folder: null, flags: {}}],
    folders: [{id: 'MINE', name: 'Table prep', type: 'JournalEntry', folder: null}]});
  const r = await migrateFolders(w);
  assert.deepEqual(r.journals.ids.sort(), ['gm1', 'view']);
  assert.deepEqual(r.actors.ids, ['stash']);
  const shops = [...w.fmap.values()].find(f => f.name === 'Shops' && f.type === 'JournalEntry');
  assert.equal(w.game.journal.find(d => d.id === 'gm1').folder, shops.id);
  assert.equal(w.game.journal.find(d => d.id === 'mine').folder, 'MINE');
  assert.equal(w.game.journal.find(d => d.id === 'x').folder, null);
  assert.equal(w.game.actors.find(d => d.id === 'pc').folder, null);
  assert.ok([...w.fmap.values()].some(f => f.name === 'Party' && f.type === 'Actor'));
  for (const rows of [...w.writes.JournalEntry, ...w.writes.Actor]) assert.ok(rows.every(row => Object.keys(row).sort().join() === '_id,folder'));
  assert.equal(w.game.journal.find(d => d.id === 'view').ownership.default, 2);
  assert.equal(w.store.get(`${ID}.${SETTING}`), '1');
});

test('migration is re-runnable and a no-op once recorded or for a player', async () => {
  const w = setup({journals: [j('gm1', 'shops-gm')]});
  await migrateFolders(w);
  const calls = w.writes.JournalEntry.length;
  assert.equal(await migrateFolders(w), null);
  w.store.set(`${ID}.${SETTING}`, '');
  const again = await migrateFolders(w);
  assert.equal(again.journals.moved, 0);
  assert.equal(w.writes.JournalEntry.length, calls);
  const p = setup({journals: [j('gm1', 'shops-gm')]}); p.game.user.isGM = false;
  assert.equal(await migrateFolders(p), null);
});
