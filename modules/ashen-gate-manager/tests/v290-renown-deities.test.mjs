/** 0.29.0: Renown 0.11.0 deities through Manager. A 0.4 file is handed over unchanged, the preview labels deity rows
 *  'Deity', and World export adds a deities section when Renown has getDeities. Uses Renown's real import planner;
 *  proves the logic, not the live Manager window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detectSpecialistFile, specialistCount, planSpecialist, filterSpecialist, applySpecialist} from '../scripts/specialist-handoff.js';
import {collectModuleSections} from '../scripts/world-export.js';
import {planImport} from '../../ashen-gate-factions/scripts/import.mjs';

const doc = fs.readFileSync(new URL('../../../docs/renown-deity-schema.md', import.meta.url), 'utf8');
const deityFile = () => JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)[1]);
const faction = () => structuredClone(JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_Factions_0.6.1.json', import.meta.url), 'utf8')).definitions[0]);
const mixed = () => { const f = deityFile(); f.definitions.push(faction()); return f; };
const renownApi = (calls = []) => ({
  previewFactionsImport: data => { const {errors, rows} = planImport(data); return {errors, rows: rows.map(({id, name, kind, action, reason}) => ({id, name, kind, action, reason}))}; },
  importFactions: async data => { calls.push(data); return {added: data.definitions.map(d => ({id: d.id, name: d.name}))}; }
});

test('an ag-factions-source-export/0.4 file with deities is recognised and handed to Renown unchanged', async () => {
  const file = mixed();
  assert.equal(file.schema_version, 'ag-factions-source-export/0.4');
  assert.equal(detectSpecialistFile(file), 'factions');
  assert.equal(specialistCount('factions', file), 2);
  const all = file.definitions.map(d => d.id);
  assert.deepEqual(filterSpecialist('factions', file, all), file, 'nothing is rewritten when every record is chosen');
  const onlyDeity = filterSpecialist('factions', file, ['DEITY-EXAMPLE-LANTERN']);
  assert.deepEqual(onlyDeity.definitions.map(d => d.id), ['DEITY-EXAMPLE-LANTERN']);
  assert.deepEqual(onlyDeity.starting_state.map(s => s.faction_id), ['DEITY-EXAMPLE-LANTERN'], 'deity starting_state travels with it');
  const calls = [];
  const results = await applySpecialist('factions', file, renownApi(calls), {ids: all});
  assert.equal(calls[0].schema_version, 'ag-factions-source-export/0.4');
  assert.deepEqual(results.filter(r => r.status === 'ok').map(r => r.id).sort(), [...all].sort());
});

test('preview labels each row by Renown\'s row.kind: Deity for deities, Faction for factions and older Renown rows', () => {
  const file = mixed();
  const {errors, rows} = planSpecialist('factions', file, renownApi());
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map(r => [r.id, r.kind, r.action]), [['DEITY-EXAMPLE-LANTERN', 'Deity', 'create'], [file.definitions[1].id, 'Faction', 'create']]);
  const older = {previewFactionsImport: () => ({errors: [], rows: [{id: 'FAC-TEST', name: '[TEST] Guild', action: 'new'}]}), importFactions: async () => ({})};
  assert.equal(planSpecialist('factions', {schema_version: 'ag-factions-source-export/0.3', definitions: []}, older).rows[0].kind, 'Faction');
});

test('World export adds deities from getDeities; an older Renown lists them as not available', () => {
  const deity = deityFile().definitions[0];
  const game = api => ({modules: {get: id => id === 'ashen-gate-factions' ? {active: true, version: '0.11.0', api} : null}});
  const now = collectModuleSections(game({getFactions: () => [{id: 'FAC-TEST', name: '[TEST] Guild'}], getDeities: () => [deity]}));
  assert.equal(now.deities.status, 'ok');
  assert.deepEqual(now.deities.records.map(r => [r.key, r.name, r.data.entity_type]), [['deities/DEITY-EXAMPLE-LANTERN', '[EXAMPLE] The Lantern', 'Deity']]);
  assert.deepEqual(now.factions.records.map(r => r.id), ['FAC-TEST'], 'factions are unchanged');
  const older = collectModuleSections(game({getFactions: () => []}));
  assert.equal(older.factions.status, 'ok');
  assert.equal(older.deities.status, 'not available');
});
