// 0.34.0: the Party Stash character Actor is named "Party". Mocked Foundry world: proves the logic, not the live sidebar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ID, DEFAULT_STASH_NAME, LEGACY_STASH_NAME} from '../scripts/core.mjs';
import {migrateStashName, SETTING, isStash} from '../scripts/stash-rename.mjs';
import {planActor} from '../scripts/folder-nesting.mjs';

function world({actors, done = '', gm = true, activeIsMe = true} = {}) {
  const store = new Map([[`${ID}.${SETTING}`, done]]), notes = [], writes = [];
  const list = actors.map(a => ({folder: null, ownership: {default: 2}, system: {currency: {gp: 5}}, items: ['i1'], ...a,
    update: async function (d) { writes.push({id: this.id, d}); Object.assign(this, d); }}));
  list.get = id => list.find(a => a.id === id);
  const game = {user: {id: 'gm', isGM: gm}, users: {activeGM: activeIsMe ? {id: 'gm', isSelf: true} : {id: 'gm2', isSelf: false}}, actors: list,
    settings: {get: (m, k) => store.get(`${m}.${k}`), set: async (m, k, v) => { store.set(`${m}.${k}`, v); }}};
  return {game, ui: {notifications: {info: m => notes.push(m)}}, list, notes, writes, store};
}
const stash = (id, name) => ({id, name, flags: {[ID]: {partyStash: true}}});

test('the constants and the Actor create call use the new default', () => {
  assert.equal(DEFAULT_STASH_NAME, 'Party');
  assert.equal(LEGACY_STASH_NAME, 'Ashen Gate | Party Stash');
  const src = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const create = src.match(/Actor\.create\(\{name:([^,]+),/);
  assert.equal(create?.[1], 'DEFAULT_STASH_NAME');
  assert.ok(!src.includes("'Ashen Gate | Party Stash'"));
});

test('renames only a stash still named exactly the old default, with one notification', async () => {
  const w = world({actors: [stash('s', LEGACY_STASH_NAME)]});
  const r = await migrateStashName(w);
  assert.deepEqual(r.map(a => a.id), ['s']);
  assert.equal(w.list[0].name, 'Party');
  assert.deepEqual(w.notes, ['The Party Stash character is now named "Party".']);
  assert.equal(w.store.get(`${ID}.${SETTING}`), '1');
});

test('writes only the name; items, coins, permissions, folder and flags are untouched', async () => {
  const w = world({actors: [{...stash('s', LEGACY_STASH_NAME), folder: 'F1', ownership: {default: 2, u1: 3}}]});
  await migrateStashName(w);
  assert.deepEqual(w.writes, [{id: 's', d: {name: 'Party'}}]);
  const a = w.list[0];
  assert.deepEqual([a.folder, a.ownership, a.system.currency, a.items, a.flags], ['F1', {default: 2, u1: 3}, {gp: 5}, ['i1'], {[ID]: {partyStash: true}}]);
});

test('a stash the GM already renamed is left alone (no notification)', async () => {
  const w = world({actors: [stash('s', 'The Strongbox'), stash('t', 'ashen gate | party stash'), stash('u', LEGACY_STASH_NAME + ' ')]});
  assert.deepEqual(await migrateStashName(w), []);
  assert.deepEqual(w.list.map(a => a.name), ['The Strongbox', 'ashen gate | party stash', LEGACY_STASH_NAME + ' ']);
  assert.deepEqual(w.writes, []); assert.deepEqual(w.notes, []);
});

test('lookup is by flag: an unflagged Actor with the old name or named Party is never touched, a stash named Party is a stash', async () => {
  const w = world({actors: [{id: 'old', name: LEGACY_STASH_NAME, flags: {}}, {id: 'pc', name: 'Party', type: 'character', flags: {}}, stash('s', 'Party')]});
  assert.deepEqual(await migrateStashName(w), []);
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.list.filter(isStash).map(a => a.id), ['s']);
  assert.equal(planActor({name: 'Party', flags: {}}), null);
  assert.ok(planActor({name: 'Party', flags: {[ID]: {partyStash: true}}}));
});

test('idempotent: the marker stops a second run, and a later run on a renamed world writes nothing', async () => {
  const w = world({actors: [stash('s', LEGACY_STASH_NAME)]});
  await migrateStashName(w); await migrateStashName(w);
  assert.equal(w.writes.length, 1); assert.equal(w.notes.length, 1);
  const again = world({actors: [stash('s', 'Party')]});
  assert.deepEqual(await migrateStashName(again), []);
  assert.deepEqual(again.writes, []); assert.deepEqual(again.notes, []);
  assert.equal(again.store.get(`${ID}.${SETTING}`), '1');
});

test('a marker set earlier means nothing runs, even for an old-named stash', async () => {
  const w = world({actors: [stash('s', LEGACY_STASH_NAME)], done: '1'});
  assert.deepEqual(await migrateStashName(w), []);
  assert.equal(w.list[0].name, LEGACY_STASH_NAME);
});

test('GM only, and only the active GM client writes', async () => {
  const player = world({actors: [stash('s', LEGACY_STASH_NAME)], gm: false});
  assert.deepEqual(await migrateStashName(player), []);
  assert.deepEqual(player.writes, []); assert.equal(player.store.get(`${ID}.${SETTING}`), '');
  const second = world({actors: [stash('s', LEGACY_STASH_NAME)], activeIsMe: false});
  assert.deepEqual(await migrateStashName(second), []);
  assert.deepEqual(second.writes, []);
});

test('two GM clients: a name changed by the other client after the list was taken is not written over', async () => {
  const w = world({actors: [stash('s', LEGACY_STASH_NAME)]});
  const stale = w.list[0];
  // The other GM renames it to a custom name; this client's list still holds the stale document with the old name.
  const fresh = {...stale, name: 'Treasury', update: async () => { throw new Error('must not write'); }};
  const list = [stale]; list.get = () => fresh;
  const r = await migrateStashName({game: {...w.game, actors: list}, ui: w.ui});
  assert.deepEqual(r, []); assert.deepEqual(w.notes, []);
});

test('old history entries keep the payer name they were written with', () => {
  const src = readFileSync(new URL('../scripts/core.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('payerName: str(payer?.name)'));   // stored at the time; nothing rewrites it
  assert.ok(!readFileSync(new URL('../scripts/stash-rename.mjs', import.meta.url), 'utf8').includes('stashHistory'));
});
