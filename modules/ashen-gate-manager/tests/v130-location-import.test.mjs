import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePackage, planRecord} from '../scripts/core.js';
import {dependencyOrder} from '../scripts/workflows.js';
import {isLocationRecord, locationsApi, planLocation, locationsNote, applyLocations} from '../scripts/location-handoff.js';
import {createApi} from '../../ashen-gate-locations/scripts/api.mjs';
import {playerView} from '../../ashen-gate-locations/scripts/model.mjs';
import {packFileName} from '../../../scripts/build-test-pack.mjs';

const pack = async () => JSON.parse(await readFile(new URL(`../../../test-fixtures/playtest/${packFileName()}`, import.meta.url), 'utf8'));

// The real Locations API over an in-memory store, as the Locations module wires it in Foundry.
function locations({gm = true, stored = []} = {}) {
  const state = {stored};
  const api = createApi({
    version: 'test', isGM: () => gm, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(state.stored), writeAll: async list => { state.stored = list; },
    readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async () => ({}), open: () => {}, openLocation: () => {}
  });
  return {api, state};
}

// Mirrors #preview and #apply in main.js for the rows that need no Foundry documents.
function previewRows(pkg, {api, includeDrafts = false, updateExisting = false}) {
  const existingIds = api ? new Set(api.listLocations().map(l => l.id)) : null;
  return dependencyOrder(pkg.records).order.map(id => {
    const record = pkg.records.find(r => r.id === id);
    if (isLocationRecord(record)) return {id, kind: 'Location', ...planLocation(record, {existingIds, includeDrafts, updateExisting})};
    return {id, kind: record.foundry.document_type, ...planRecord(record, [], false, includeDrafts)};
  });
}

test('one Manager import of the playtest pack creates the documents and all the locations', async () => {
  const pkg = await pack();
  assert.deepEqual(validatePackage(pkg), []);
  const {api, state} = locations();
  const rows = previewRows(pkg, {api});
  const creates = rows.filter(r => r.action === 'create');
  const itemRows = creates.filter(r => r.kind === 'Item');
  const locRows = creates.filter(r => r.kind === 'Location');
  const count = kind => creates.filter(r => r.kind === kind).length;
  assert.equal(itemRows.length, 50, '4 professions, 10 materials, 11 recipes, 11 items (drafts excluded), 8 perks, 4 stash items, 2 hireling records');
  assert.deepEqual(['Actor', 'JournalEntry', 'RollTable'].map(count), [3, 3, 1]);
  assert.deepEqual(locRows.map(r => r.id).sort(), pkg.records.filter(isLocationRecord).map(r => r.id).sort());
  assert.equal(locRows.length, 8);
  assert.ok(!rows.some(r => r.action === 'blocked'), 'locations are no longer blocked');

  // Items are created first, then the selected Location records go to Locations in one call.
  const itemIds = new Set(itemRows.map(r => r.id));
  const results = await applyLocations(locRows.map(r => pkg.records.find(x => x.id === r.id)), api);
  assert.deepEqual(results.map(r => [r.status, r.action]), locRows.map(() => ['ok', 'create']));
  assert.equal(state.stored.length, 8);

  // Every material a node names was created by the same run, so the references resolve.
  const materials = state.stored.flatMap(l => l.resources).flatMap(n => [n.materialId, n.rareMaterialId]).filter(Boolean);
  assert.ok(materials.length > 0);
  for (const id of materials.filter(m => !m.includes('GM-ONLY'))) assert.ok(itemIds.has(id), `${id} is created before the locations`);
});

test('a second import keeps existing locations; update mode replaces them and says so', async () => {
  const pkg = await pack();
  const {api, state} = locations();
  const locRecords = pkg.records.filter(isLocationRecord);
  await applyLocations(locRecords, api);
  state.stored[0].name = 'GM edited';

  const skipRows = previewRows(pkg, {api}).filter(r => r.kind === 'Location');
  assert.ok(skipRows.every(r => r.action === 'skipped' && /already exists/.test(r.reason)));
  const kept = await applyLocations(locRecords, api);
  assert.ok(kept.every(r => r.status === 'skipped' && r.message));
  assert.equal(state.stored[0].name, 'GM edited');

  assert.ok(previewRows(pkg, {api, updateExisting: true}).filter(r => r.kind === 'Location').every(r => r.action === 'update'));
  const updated = await applyLocations(locRecords, api, {updateExisting: true});
  assert.deepEqual(updated.map(r => r.action), locRecords.map(() => 'update'));
  assert.notEqual(state.stored[0].name, 'GM edited');
});

test('without Locations the rows are skipped and the note says how many', async () => {
  const pkg = await pack();
  const game = {modules: new Map([['ashen-gate-locations', {active: false, api: {importLocations() {}}}]])};
  assert.equal(locationsApi(game), null);
  assert.equal(locationsApi({modules: new Map()}), null);
  assert.equal(locationsApi({modules: new Map([['ashen-gate-locations', {active: true, api: {}}]])}), null, 'an old Locations without importLocations is treated as unavailable');
  assert.equal(locationsNote(pkg.records, null), '8 location records skipped: enable Locations');
  assert.equal(locationsNote(pkg.records, {}), null);
  const rows = previewRows(pkg, {api: null}).filter(r => r.kind === 'Location');
  assert.equal(rows.length, 8);
  assert.ok(rows.every(r => r.action === 'skipped' && /enable Locations/.test(r.reason)));
  assert.ok((await applyLocations(pkg.records.filter(isLocationRecord), null)).every(r => r.status === 'skipped'));
});

test('draft and retired location records follow Manager\'s status rules', () => {
  const ids = new Set();
  const rec = status => ({id: 'LOC-X', entity_type: 'Location', status});
  assert.equal(planLocation(rec('draft'), {existingIds: ids}).action, 'skipped');
  assert.equal(planLocation(rec('draft'), {existingIds: ids, includeDrafts: true}).action, 'create');
  assert.equal(planLocation(rec('retired'), {existingIds: ids, includeDrafts: true}).action, 'blocked');
});

test('a player cannot push locations through the Locations API', async () => {
  const pkg = await pack();
  const {api, state} = locations({gm: false});
  const results = await applyLocations(pkg.records.filter(isLocationRecord), api);
  assert.ok(results.every(r => r.status === 'error' && /Only the GM/.test(r.message)));
  assert.deepEqual(state.stored, []);
});
