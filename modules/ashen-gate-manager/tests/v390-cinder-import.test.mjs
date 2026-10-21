// 0.39.0: Cinder / Power / Backfire-table definitions are checked by Ashen Gate | Cinders (feature-detected); the Strain config
// file is handed to Cinders' api.strain. Plain data and stand-in module APIs: proves routing and checks, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cinderDefinitionChecks} from '../scripts/cinder-definitions.js';
import {SPECIALISTS, detectSpecialistFile, specialistCount, specialistApi, planSpecialist, filterSpecialist, applySpecialist} from '../scripts/specialist-handoff.js';
import {BUNDLE_ORDER, bundleRecordIds} from '../scripts/zip-import.js';

const power = {id: 'POWER-TEST-SPARK', entity_type: 'Power', power: {schema: 'ag-power/0.1', kind: 'power', push_modes: [{id: 'amplify', label: '[TEST] Amplify', strain_cost: 2}]}};
const perk = {id: 'PERK-TEST-X', entity_type: 'ProfessionPerk'};
const gameWith = api => ({modules: new Map([['ashen-gate-cinders', {active: true, api}]])});

test('typed definitions go to the Cinders validator; its errors block, its warnings show', () => {
  const seen = [];
  const game = gameWith({cinder: {validateDefinition: r => {seen.push(r.id); return r.id === 'POWER-TEST-SPARK' ? {errors: ['POWER-TEST-SPARK: [TEST] bad'], warnings: ['[TEST] note']} : {errors: [], warnings: []};}}});
  const r = cinderDefinitionChecks(game, [power, perk, {id: 'BF-TEST-A', entity_type: 'BackfireTable'}, {id: 'MUT-TEST-A', entity_type: 'Mutation'}]);
  assert.deepEqual(seen, ['POWER-TEST-SPARK', 'BF-TEST-A'], 'only records with a typed block (a Mutation without cinder is a plain document)');
  assert.deepEqual(r, {errors: ['POWER-TEST-SPARK: [TEST] bad'], warnings: ['[TEST] note']});
});
test('without Cinders (or with a module that has no validator) the definitions still import, with a warning; no typed records, nothing to say', () => {
  for (const game of [{modules: new Map()}, gameWith({}), {modules: new Map([['ashen-gate-cinders', {active: false, api: {cinder: {validateDefinition: () => ({errors: ['x']})}}}]])}]) {
    const r = cinderDefinitionChecks(game, [power]);
    assert.deepEqual(r.errors, []);assert.match(r.warnings[0], /not checked/);
  }
  assert.deepEqual(cinderDefinitionChecks(gameWith({}), [perk]), {errors: [], warnings: []});
  const r = cinderDefinitionChecks(gameWith({cinder: {validateDefinition: () => {throw Error('boom');}}}), [power]);
  assert.match(r.errors[0], /could not check.*boom/);
});
test('Strain config file: detected by schema, handed to api.strain, one row, ordered after trees in a ZIP', async () => {
  const file = {schema: 'ag-strain-config/0.1', bands: [{from: 0, to: null, label: '[TEST] Calm'}]};
  assert.equal(detectSpecialistFile(file), 'strain');
  assert.equal(detectSpecialistFile({schema: 'ag-strain-config/0.1', manifest: {}}), null, 'a Manager package is never a specialist file');
  assert.equal(specialistCount('strain', file), 1);
  assert.deepEqual(bundleRecordIds('strain', file), ['STRAIN-CONFIG']);
  assert.ok(BUNDLE_ORDER.indexOf('strain') > BUNDLE_ORDER.indexOf('skill-trees'));
  assert.equal(filterSpecialist('strain', file, ['STRAIN-CONFIG']), file);
  assert.equal(specialistApi(gameWith({previewConfigImport: () => {}, importConfig: () => {}}), 'strain'), null, 'looks under api.strain, not the top level');
  const calls = [];
  const strain = {previewConfigImport: f => {calls.push(['preview', f]); return {errors: [], rows: [{id: 'STRAIN-CONFIG', name: 'Strain config', action: 'update', reason: '[TEST] replaces'}]};},
    importConfig: async f => {calls.push(['import', f]); return {created: [], updated: ['STRAIN-CONFIG'], skipped: [], failed: [], warnings: []};}};
  const api = specialistApi(gameWith({strain}), 'strain');
  assert.equal(api, strain);
  const plan = planSpecialist('strain', file, api);
  assert.deepEqual(plan.rows.map(r => [r.id, r.kind, r.action]), [['STRAIN-CONFIG', 'Strain config', 'update']]);
  const results = await applySpecialist('strain', file, api, {ids: ['STRAIN-CONFIG']});
  assert.deepEqual(results.map(r => [r.id, r.status]), [['STRAIN-CONFIG', 'ok']]);
  assert.deepEqual(calls.map(c => c[0]), ['preview', 'import']);assert.equal(calls[1][1], file);
  assert.equal(SPECIALISTS.strain.canUpdate, false);
  assert.match(planSpecialist('strain', file, null).rows[0].reason, /not active/);
});
