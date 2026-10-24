import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSyncSet, planSync} from '../scripts/sync.js';
import {checkContractGraph} from '../scripts/contract.js';

// Mocked data and mocked world: proves the planner's logic, not the live Foundry UI.
const rec = (id, entity_type, refs = []) => ({
  id, entity_type, status: 'approved', version: '1', visibility: 'player', scope: 'setting_adapter', provenance: {sources: ['test']}, refs,
  foundry: {document_type: 'Item', data: {name: id, type: 'loot', system: {}}}
});
const pkg = (package_id, records) => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id, version: '1.0.0'}, records});
const src = (filename, payload) => ({filename, origin: filename, kind: 'manager', payload});
const link = (target_id, mode = 'required') => ({relation: 'gathered_by', target_id, mode});

const defs = pkg('TEST-DEFS', [rec('PROF-TEST', 'Profession')]);
const ext = pkg('TEST-EXT', [rec('MAT-TEST-FIELD-01', 'Material', [link('PROF-TEST')])]);

test('a required ref to a record defined in an earlier sync file resolves', () => {
  const plan = planSync(buildSyncSet([src('a.json', defs), src('b.json', ext)]), {docs: []}, {includeDrafts: true});
  assert.deepEqual(plan.errors, []);
});

test('a required ref to a record that is in no file and not in the world is still an error', () => {
  const plan = planSync(buildSyncSet([src('b.json', ext)]), {docs: []}, {includeDrafts: true});
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0], /MAT-TEST-FIELD-01: unresolved required reference PROF-TEST/);
});

test('a required ref to a record that exists only in the world resolves', () => {
  const snap = {documentName: 'Item', flag: {sourceId: 'PROF-TEST', entityType: 'Profession', scope: 'setting_adapter'}};
  const plan = planSync(buildSyncSet([src('b.json', ext)]), {docs: [snap]}, {includeDrafts: true});
  assert.deepEqual(plan.errors, []);
});

test('checkContractGraph accepts a plain Set of known ids', () => {
  const g = checkContractGraph(ext.records, new Set(['PROF-TEST']));
  assert.deepEqual(g.errors, []);
});
