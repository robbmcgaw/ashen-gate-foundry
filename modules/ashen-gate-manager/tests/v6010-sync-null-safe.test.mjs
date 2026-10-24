import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSyncSet, planSync, makeSnapshot} from '../scripts/sync.js';
import {itemKeys} from '../scripts/actor-update.js';
import {exportedFields} from '../scripts/core.js';

// Mocked data and a mocked world ([TEST] records): proves the planner's logic, not the live Foundry UI.
const M = 'ashen-gate-manager';
const pkg = (records, package_id = 'TEST-NULL') => ({manifest: {schema_version: 'ag-foundry-import/0.1', package_id, version: '1.0.0'}, records});
const base = (id, entity_type, document_type, data) => ({id, entity_type, status: 'approved', version: '1', visibility: 'player', provenance: {sources: ['test']}, refs: [], foundry: {document_type, data}});
const npc = base('NPC-TEST-ONE', 'NPC', 'Actor', {name: '[TEST] One', type: 'npc', system: {}, items: [{name: 'Club', type: 'weapon', system: {}}]});
const journal = base('JRN-TEST-ONE', 'Journal', 'JournalEntry', {name: '[TEST] J', pages: [{name: 'P1', type: 'text', text: {content: 'x'}}]});
const table = base('TBL-TEST-ONE', 'Table', 'RollTable', {name: '[TEST] T', results: [{type: 'text', text: 'a', range: [1, 1], weight: 1}]});
const item = base('ITEM-TEST-ONE', 'Item', 'Item', {name: '[TEST] I', type: 'loot', system: {}});
const records = [npc, journal, table, item];
const src = [{filename: 'a.json', origin: 'a.json', kind: 'manager', payload: pkg(records)}];

function doc(record, raw, extraFlag = {}) {
  const d = record.foundry.data, flag = {sourceId: record.id, entityType: record.entity_type, packageId: 'TEST-NULL', packageVersion: '1.0.0', managedFields: exportedFields(record), pagesDefinition: d.pages ?? [], ...extraFlag};
  const data = {_id: 'w-' + record.id, name: d.name, type: d.type, flags: {[M]: {source: flag}}, ...raw};
  return {documentName: record.foundry.document_type, id: data._id, uuid: data._id, name: data.name, type: data.type, getFlag: (s, k) => data.flags?.[s]?.[k], toObject: () => structuredClone(data)};
}
const plan = docs => planSync(buildSyncSet(src), {docs: docs.map(x => x && makeSnapshot(x, {})), characterCount: 0}, {includeDrafts: true});

test('an Actor whose item list holds a null entry (legacy, unmarked items) no longer stops the preview', () => {
  const p = plan([doc(npc, {items: [null, {_id: 'i1', name: 'Club', type: 'weapon', flags: {}}]})]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.rows.find(r => r.id === npc.id).failed, undefined);
});

test('an older import baseline whose items list holds a null entry no longer stops the preview', () => {
  const p = plan([doc(npc, {items: []}, {managedFields: {...exportedFields(npc), items: [null, {name: 'Club', type: 'weapon'}]}})]);
  assert.deepEqual(p.errors, []);
});
test('itemKeys tolerates a null definition', () => assert.deepEqual(itemKeys([null, {name: 'a', type: 'b'}]), ['undefined:undefined', 'b:a']));

test('null pages, page definitions, results and effects, and a null world entry, do not throw', () => {
  const p = plan([null, doc(journal, {pages: [null]}, {pagesDefinition: [null]}), doc(table, {results: [null]}), doc(item, {effects: [null]})]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.rows.filter(r => r.failed).length, 0);
});

test('a missing toObject result is treated as an empty document, not a crash', () => {
  const d = doc(item, {}); d.toObject = () => null;
  const p = plan([d]);
  assert.deepEqual(p.errors, []);
});

test('an unexpected failure on one document is contained: that row is untouched and reported, the rest still plan', () => {
  const bad = doc(item, {}); bad.toObject = () => { throw new Error('boom'); };
  const p = plan([bad, doc(journal, {pages: []})]);
  assert.deepEqual(p.errors, []);
  const row = p.rows.find(r => r.id === item.id);
  assert.equal(row.group, 'untouched'); assert.equal(row.failed, true); assert.match(row.reason, /boom/);
  assert.equal(p.failures.length, 1);
  assert.match(p.notes[0], /could not be compared/);
  assert.ok(p.rows.some(r => r.id === journal.id && r.group === 'overwrite'));
});

test('safety: a document that cannot be checked is never deleted, and characters stay untouched', () => {
  const stray = base('ITEM-TEST-GONE', 'Item', 'Item', {name: '[TEST] gone', type: 'loot', system: {}});
  const gone = doc(stray, {}); Object.defineProperty(gone, 'toObject', {value: () => { throw new Error('bad'); }});
  const chr = doc(base('NPC-TEST-PC', 'NPC', 'Actor', {name: '[TEST] pc', type: 'character'}), {type: 'character'});
  const p = plan([gone, chr]);
  assert.equal(p.rows.filter(r => r.group === 'delete').length, 0);
  assert.ok(p.rows.every(r => !(r.group === 'delete' && r.snap?.type === 'character')));
});
