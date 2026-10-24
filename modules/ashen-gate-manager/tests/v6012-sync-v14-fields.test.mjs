import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSyncSet, planSync, makeSnapshot} from '../scripts/sync.js';
import {exportedFields} from '../scripts/core.js';
import {effectCreateData, planItemEffects, effectDefinition, normalizeType, upgradeBaseline} from '../scripts/item-effects.js';
import {resultCreateData, normalizePackageResult, normalizeLiveResult, legacyDocumentUuid} from '../scripts/table-results.js';

// Mocked Foundry data ([TEST] records), not a live V14 world. The V14 deprecation shims are reproduced as non-enumerable
// accessors on toObject() data: every read is counted, and documentCollection throws like the live
// "Cannot read properties of null (reading 'type')". Code that never reads them passes with zero hits.
const M = 'ashen-gate-manager';
const hits = [];
const DEPRECATED = ['text', 'documentCollection', 'documentId', 'mode'];
function withShims(obj, names) {
  for (const name of names) Object.defineProperty(obj, name, {
    configurable: true, enumerable: false,
    get() { hits.push(name); if (name === 'documentCollection') return null.type; return 'shim'; },
    set() { hits.push(`set:${name}`); }
  });
  return obj;
}
const liveResult = (r, shims = DEPRECATED.filter(n => n !== 'mode')) => withShims({_id: 'r' + Math.random().toString(36).slice(2, 6), drawn: false, flags: {}, ...r}, shims);
const liveChange = c => withShims({...c}, ['mode']);

const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.1', package_id: 'TEST-V14', version: '1.0.0'}, records});
const base = (id, entity_type, document_type, data) => ({id, entity_type, status: 'approved', version: '1', visibility: 'player', provenance: {sources: ['test']}, refs: [], foundry: {document_type, data}});
function doc(record, raw) {
  const d = record.foundry.data, flag = {sourceId: record.id, entityType: record.entity_type, packageId: 'TEST-V14', packageVersion: '1.0.0', managedFields: Object.fromEntries(Object.entries(exportedFields(record)).filter(([k]) => !k.startsWith('effects'))), pagesDefinition: []};
  const data = {_id: 'w-' + record.id, name: d.name, type: d.type, flags: {[M]: {source: flag}}, ...raw};
  return {documentName: record.foundry.document_type, id: data._id, uuid: data._id, name: data.name, type: data.type, getFlag: (s, k) => data.flags?.[s]?.[k], toObject: () => data /* not cloned: keeps the shims */};
}
const plan = (records, docs, over = {}) => planSync(buildSyncSet([{filename: 'a.json', origin: 'a.json', kind: 'manager', payload: pkg(records)}]), {docs: docs.map(x => makeSnapshot(x, {})), characterCount: 0}, {includeDrafts: true, ...over});
const rowOf = (p, id) => p.rows.find(r => r.id === id);

test('mock sanity: reading a shim throws like the live error, and is counted', () => {
  hits.length = 0;
  const r = liveResult({type: 'text'});
  assert.throws(() => r.documentCollection, /reading 'type'/);
  assert.deepEqual(hits, ['documentCollection']);
  hits.length = 0;
});

test('roll table whose live results throw on documentCollection: preview does not fail and reads no deprecated property', () => {
  hits.length = 0;
  const table = base('TBL-V14', 'Table', 'RollTable', {name: '[TEST] T', results: [
    {type: 'text', text: 'Coin', range: [1, 1], weight: 1}, {type: 'document', documentCollection: 'Item', documentId: 'abc123', range: [2, 2], weight: 2, img: 'icons/x.webp'}]});
  const d = doc(table, {results: [
    liveResult({type: 'text', name: '', description: 'Coin', range: [1, 1], weight: 1}),
    liveResult({type: 'document', name: '', description: '', range: [2, 2], weight: 2, img: 'icons/x.webp', documentUuid: 'Item.abc123'})]});
  const p = plan([table], [d]);
  assert.deepEqual(p.errors, []);
  const row = rowOf(p, table.id);
  assert.equal(row.failed, undefined, row.reason);
  assert.equal(row.group, 'untouched', 'the package results already match the V14 live results (old package names mapped)');
  assert.deepEqual(hits, [], `deprecated properties read: ${hits.join(', ')}`);
});

test('roll table with a changed result is detected, and the new results are written with V14 names only', () => {
  hits.length = 0;
  const table = base('TBL-V14', 'Table', 'RollTable', {name: '[TEST] T', results: [{type: 'text', text: 'Gem', range: [1, 1], weight: 1}]});
  const d = doc(table, {results: [liveResult({type: 'text', description: 'Coin', range: [1, 1], weight: 1, drawn: true})]});
  const row = rowOf(plan([table], [d]), table.id);
  assert.equal(row.group, 'overwrite');
  const made = row.ops.results.create;
  assert.deepEqual(made, [{type: 'text', description: 'Gem', range: [1, 1], weight: 1, drawn: false}]);
  for (const k of ['text', 'documentCollection', 'documentId']) assert.ok(!(k in made[0]));
  assert.equal(row.ops.results.deleteIds.length, 1);
  assert.deepEqual(hits, []);
});

test('a null or non-object live result is tolerated', () => {
  const table = base('TBL-V14', 'Table', 'RollTable', {name: '[TEST] T', results: [{type: 'text', text: 'Gem', range: [1, 1]}]});
  const p = plan([table], [doc(table, {results: [null, 5]})]);
  assert.deepEqual(p.errors, []);
  assert.equal(rowOf(p, table.id).failed, undefined);
});

test('result helpers: package names map to V14, live data is read by V14 names only', () => {
  hits.length = 0;
  assert.deepEqual(resultCreateData({_id: 'x', drawn: true, type: 'text', text: 'a', range: [1, 1]}), {type: 'text', description: 'a', range: [1, 1], drawn: false});
  assert.equal(resultCreateData({type: 'document', documentCollection: 'Item', documentId: 'z'}).documentUuid, 'Item.z');
  assert.equal(resultCreateData({type: 'document', documentUuid: 'Item.q', documentCollection: 'Item', documentId: 'z'}).documentUuid, 'Item.q');
  assert.equal(legacyDocumentUuid('dnd5e.items', 'id1', new Map([['dnd5e.items', {documentName: 'Item'}]])), 'Compendium.dnd5e.items.Item.id1');
  assert.equal(normalizePackageResult({text: 'a'}).description, 'a');
  assert.deepEqual(normalizeLiveResult(liveResult({type: 'text', description: 'a'})), {type: 'text', name: '', description: 'a', range: [1, 1], weight: 1, documentUuid: null, img: null});
  assert.deepEqual(normalizeLiveResult(null), normalizeLiveResult({}));
  assert.deepEqual(hits, []);
});

test('effects: numeric and named package modes become V14 types; live changes are read by type only', () => {
  hits.length = 0;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 'ADD', 'override'].map(normalizeType), ['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override', 'add', 'override']);
  assert.equal(normalizeType('plus'), null);
  const eff = {eff_id: 'e1', name: '[TEST] Walk', transfer: false, changes: [{key: 'system.attributes.movement.speeds.walk', mode: 2, value: 10}]};
  const created = effectCreateData(eff);
  assert.deepEqual(created.changes, [{key: 'system.attributes.movement.speeds.walk', type: 'add', value: '10', priority: null}]);
  assert.ok(!('mode' in created.changes[0]));
  assert.equal(effectDefinition({...eff, changes: [{key: 'system.a', type: 'override', value: 1}]}).changes[0].type, 'override');
  // live effect data as V14 returns it: `type` plus a throwing `mode` shim
  const live = [{_id: 'x1', ...structuredClone(created), changes: [liveChange(created.changes[0])]}];
  const again = planItemEffects([eff], live);
  assert.equal(again.writes, 0);
  assert.deepEqual(again.rows.map(r => r.action), ['kept']);
  assert.deepEqual(hits, [], `deprecated properties read: ${hits.join(', ')}`);
});

test('effects created by an older Manager (baseline stores numeric mode) still compare as unchanged, with nothing written', () => {
  const eff = {eff_id: 'e1', name: '[TEST] Walk', transfer: false, changes: [{key: 'system.a', mode: 'add', value: 10}]};
  const oldBaseline = {name: '[TEST] Walk', disabled: false, transfer: false, changes: [{key: 'system.a', mode: 2, value: '10', priority: null}]};
  assert.deepEqual(upgradeBaseline(oldBaseline).changes, [{key: 'system.a', type: 'add', value: '10', priority: null}]);
  const live = [{_id: 'x1', name: '[TEST] Walk', disabled: false, transfer: false, changes: [liveChange({key: 'system.a', type: 'add', value: '10', priority: null})],
    flags: {[M]: {effect: {effId: 'e1', baseline: JSON.stringify(oldBaseline)}}}}];
  hits.length = 0;
  const p = planItemEffects([eff], live);
  assert.deepEqual(p.rows.map(r => r.action), ['kept']);
  assert.equal(p.writes, 0, 'the older numeric baseline is read as the same V14 definition: nothing is written');
  assert.deepEqual(hits, []);
});

test('Sync preview of an Item with effects reads no deprecated change property and detects a real change', () => {
  hits.length = 0;
  const eff = v => ({eff_id: 'e1', name: '[TEST] Walk', transfer: false, changes: [{key: 'system.a', mode: 'add', value: v}]});
  const item = base('ITEM-V14', 'Item', 'Item', {name: '[TEST] I', type: 'loot', system: {}, effects: [eff(10)]});
  const made = effectCreateData(eff(10));
  const d = doc(item, {effects: [{_id: 'x1', ...made, changes: [liveChange(made.changes[0])]}]});
  assert.equal(rowOf(plan([item], [d]), item.id).group, 'untouched');
  const newer = base('ITEM-V14', 'Item', 'Item', {name: '[TEST] I', type: 'loot', system: {}, effects: [eff(20)]});
  const row = rowOf(plan([newer], [d], {overwriteEdited: true}), item.id);
  assert.equal(row.group, 'overwrite', JSON.stringify([row.group, row.reason]));
  assert.equal(row.ops.effects.update[0].changes[0].type, 'add');
  assert.deepEqual(hits, [], `deprecated properties read: ${hits.join(', ')}`);
});
