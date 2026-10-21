/** 1.17.3: Loot & Rewards and Resources drops use the shared ag-item-drop helper; link sections warn on a missing document.
 *  Mocked Foundry: proves the data and the warnings, not how a drag feels in Foundry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {normalizeLocation} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');

const docs = new Map();
const blade = {uuid: 'Item.blade00000001', documentName: 'Item', name: '[TEST] Blade', img: 'icons/blade.webp',
  flags: {'ashen-gate-manager': {source: {sourceId: 'ITEM-TEST-BLADE'}}}};
const plain = {uuid: 'Item.plain00000001', documentName: 'Item', name: '[TEST] Plain', img: '', flags: {}};
const ore = {uuid: 'Item.ore000000001', documentName: 'Item', name: '[TEST] Ore', flags: {'ashen-gate-manager': {source: {sourceId: 'MAT-TEST-ORE'}}}};
const journal = {uuid: 'JournalEntry.j0000000001', documentName: 'JournalEntry', name: '[TEST] Journal'};
const actor = {uuid: 'Actor.a0000000001', documentName: 'Actor', name: '[TEST] Actor'};
const folder = {uuid: 'Folder.f0000000001', documentName: 'Folder', type: 'Item', name: '[TEST] Folder'};
for (const d of [blade, plain, ore, journal, actor, folder]) docs.set(d.uuid, d);

let warned, informed;
function setup() {
  installFoundry();
  warned = []; informed = [];
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  globalThis.ui = {notifications: {warn: m => warned.push(m), info: m => informed.push(m)}};
  const app = new LocationsApp();
  app.draft = normalizeLocation({id: 'LOC-TEST-A', details: [{key: 'd1', title: '', text: '[TEST] note'}]});
  app.dirty = false; app.render = async () => {};
  return app;
}

test('loot drop stores itemId when the Item has one, null when not; still only a link', async () => {
  const app = setup();
  await app.onDrop('loot', {type: 'Item', uuid: blade.uuid});
  await app.onDrop('loot', {type: 'Item', uuid: plain.uuid});
  assert.deepEqual(app.draft.loot.map(l => [l.uuid, l.itemId, l.docType, l.status]),
    [[blade.uuid, 'ITEM-TEST-BLADE', 'Item', 'available'], [plain.uuid, null, 'Item', 'available']]);
  assert.deepEqual(warned, []);
});

test('loot drop: a folder, a missing uuid, a journal or an Actor warn and store nothing', async () => {
  const app = setup();
  await app.onDrop('loot', {type: 'Folder', uuid: folder.uuid});
  await app.onDrop('loot', {type: 'Item', uuid: 'Item.gone000000001'});
  await app.onDrop('loot', {type: 'JournalEntry', uuid: journal.uuid});
  await app.onDrop('loot', {type: 'Actor', uuid: actor.uuid});
  assert.equal(app.draft.loot.length, 0);
  assert.deepEqual(warned, ['Drop items one at a time.', "That item no longer exists or you can't see it.", 'Drop an item.', 'Drop an item.']);
});

test("Locations' own drags (rows, folder moves, reorder) and unreadable drops are ignored quietly", async () => {
  const app = setup();
  for (const data of [{}, null, {type: 'AshenGateReorder'}, {type: 'AshenGateLocation', id: 'LOC-TEST-B'}, {type: 'AshenGateLocationMove', id: 'LOC-TEST-B'}]) {
    await app.onDrop('loot', data);
    await app.onDrop('notes', data);
  }
  assert.deepEqual(warned, []);
  assert.equal(app.draft.loot.length + app.draft.notes.length, 0);
});

test('resource drop unchanged: MAT id kept, no id adds a linked item with a note; folders and non-Items warn', async () => {
  const app = setup();
  await app.onDrop('resources', {type: 'Item', uuid: ore.uuid});
  await app.onDrop('resources', {type: 'Item', uuid: plain.uuid});
  assert.deepEqual(app.draft.resources.map(n => [n.label, n.materialId, n.uuid]), [['[TEST] Ore', 'MAT-TEST-ORE', ore.uuid], ['[TEST] Plain', '', plain.uuid]]);
  assert.equal(informed.length, 1);
  await app.onDrop('resources', {type: 'Folder', uuid: folder.uuid});
  await app.onDrop('resources', {type: 'JournalEntry', uuid: journal.uuid});
  assert.equal(app.draft.resources.length, 2);
  assert.deepEqual(warned, ['Drop items one at a time.', 'Drop an item.']);
});

test('link sections still accept journals, Actors and Items; a missing document warns', async () => {
  const app = setup();
  await app.onDrop('notes', {type: 'JournalEntry', uuid: journal.uuid});
  await app.onDrop('factions', {type: 'Actor', uuid: actor.uuid});
  await app.onDrop('detail:d1', {type: 'Item', uuid: blade.uuid});
  assert.deepEqual(app.draft.notes.map(n => [n.uuid, n.docType]), [[journal.uuid, 'JournalEntry']]);
  assert.deepEqual(app.draft.factions.map(n => [n.uuid, n.docType]), [[actor.uuid, 'Actor']]);
  assert.equal(app.draft.details[0].uuid, blade.uuid);
  assert.deepEqual(warned, []);
  await app.onDrop('notes', {type: 'JournalEntry', uuid: 'JournalEntry.gone0000001'});
  assert.equal(app.draft.notes.length, 1);
  assert.deepEqual(warned, ["That document no longer exists or you can't see it."]);
});

test('normalisation keeps a valid loot itemId, drops a malformed one, and old entries read as null', () => {
  const l = normalizeLocation({id: 'LOC-TEST-A', loot: [
    {key: 'a', label: 'A', uuid: blade.uuid, docType: 'Item', itemId: 'ITEM-TEST-BLADE'},
    {key: 'b', label: 'B', uuid: blade.uuid, docType: 'Item', itemId: '<script>'},
    {key: 'c', label: 'C', uuid: blade.uuid, docType: 'Item'}]});
  assert.deepEqual(l.loot.map(e => e.itemId), ['ITEM-TEST-BLADE', null, null]);
  assert.deepEqual(normalizeLocation(l).loot, l.loot, 're-runnable: normalising twice changes nothing');
});
