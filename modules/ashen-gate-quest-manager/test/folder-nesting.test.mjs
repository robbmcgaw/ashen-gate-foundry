// Quest Log keeps its journals under Ashen Gate / Quests and files held reward copies under Backups. Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {SETTING, planHolding, migrateFolders, questFolderId, HOLDING_PATH, LEGACY_HOLDING_NAME} from '../scripts/folder-nesting.mjs';

function setup({items = [], folders = [], done = ''} = {}) {
  const fmap = new Map(folders.map(f => [f.id, f])); let n = 0;
  globalThis.Folder = {create: async d => { const f = {id: `N${++n}`, name: d.name, type: d.type, folder: d.folder ?? null, flags: d.flags ?? {}}; fmap.set(f.id, f); return f; }};
  const store = new Map([[`${MOD}.${SETTING}`, done]]), writes = [];
  const Item = {updateDocuments: async rows => { writes.push(rows); for (const r of rows) items.find(d => d.id === r._id).folder = r.folder; }};
  const game = {user: {id: 'gm', isGM: true}, users: {activeGM: {id: 'gm', isSelf: true}}, folders: fmap, items,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  globalThis.game = game;
  return {game, Item, writes, store, fmap};
}
const held = (id, folder = null) => ({id, folder, flags: {[MOD]: {holding: {from: 'Actor.x'}}}, ownership: {default: 0}});

test('held reward copies are found by the holding flag only', () => {
  assert.deepEqual(planHolding(held('a')), HOLDING_PATH);
  assert.equal(planHolding({name: 'Whatever', flags: {}}), null);
});

test('held copies in the old top-level folder move to Backups / Quest Rewards; GM-filed ones stay; nothing deleted', async () => {
  const w = setup({
    folders: [{id: 'OLD', name: LEGACY_HOLDING_NAME, type: 'Item', folder: null, flags: {[MOD]: {store: 'reward-holding'}}}, {id: 'MINE', name: 'Loot room', type: 'Item', folder: null}],
    items: [held('old', 'OLD'), held('loose'), held('mine', 'MINE'), {id: 'plain', folder: 'OLD', flags: {}}]});
  const r = await migrateFolders(w);
  const dest = [...w.fmap.values()].find(f => f.name === 'Quest Rewards');
  const backups = [...w.fmap.values()].find(f => f.name === 'Backups');
  assert.ok(dest && backups && dest.folder === backups.id);
  const f = id => w.game.items.find(i => i.id === id).folder;
  assert.equal(f('old'), dest.id); assert.equal(f('loose'), dest.id);
  assert.equal(f('mine'), 'MINE'); assert.equal(f('plain'), 'OLD');
  assert.ok(w.fmap.has('OLD'));
  assert.ok(w.writes.flat().every(row => Object.keys(row).sort().join() === '_id,folder'));
  assert.equal(r.items.moved, 2);
});

test('recorded once, re-runnable, GM only', async () => {
  const w = setup({items: [held('x')]});
  await migrateFolders(w);
  assert.equal(await migrateFolders(w), null);
  w.store.set(`${MOD}.${SETTING}`, '');
  assert.equal((await migrateFolders(w)).items.moved, 0);
  const p = setup({items: [held('x')]}); p.game.user.isGM = false;
  assert.equal(await migrateFolders(p), null);
});

test('questFolderId creates Ashen Gate / Quests / <kind> once, even when asked at the same time', async () => {
  const w = setup();
  const [a, b] = await Promise.all([questFolderId('Quest Log'), questFolderId('GM Source')]);
  assert.ok(a && b && a !== b);
  assert.equal([...w.fmap.values()].filter(f => f.name === 'Ashen Gate').length, 1);
  assert.equal([...w.fmap.values()].filter(f => f.name === 'Quests').length, 1);
  assert.equal(await questFolderId('Quest Log'), a);
});
