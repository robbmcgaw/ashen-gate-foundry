// scripts/validate-content.mjs: authored files go through the real module validators. Proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContent, validateTargets } from './validate-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playtest = path.join(root, 'test-fixtures/playtest');
const pack = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-CONTENT', version: '1.0.0'}, records});
const item = (over = {}) => ({id: 'ITEM-TEST-LANTERN', entity_type: 'Item', status: 'approved', version: '1.0.0',
  provenance: {sources: ['[TEST] synthetic']}, visibility: 'player', refs: [],
  foundry: {document_type: 'Item', folder_path: 'Ashen Gate/Test', data: {name: '[TEST] Lantern', type: 'loot'}}, ...over});
const location = node => ({id: 'LOC-TEST-FIELD', entity_type: 'Location', status: 'approved', version: '1.0.0',
  provenance: {sources: ['[TEST] synthetic']}, visibility: 'player', refs: [],
  location: {name: '[TEST] Field', threat: 'hot', state: 'revealed', resources: [node]}});
const node = (over = {}) => ({id: 'n1', label: '[TEST] Herbs', skill: 'Herbalism', tier: 2, dc: 12, materialId: 'MAT-TEST-HERB', ...over});

test('the committed playtest files are accepted, and their ZIP bundle imports Manager first', async () => {
  const {ok, lines} = await validateTargets([playtest]);
  assert.ok(ok, lines.join('\n'));
  assert.match(lines.at(-1), /ZIP of .*AG_Playtest_Pack_[\d.]+\.json \(Manager package, \d+\) -> .*Quest Log/);
});

test('a valid package passes; the documented common mistakes are rejected with the validator message', async () => {
  assert.deepEqual((await checkContent(pack([item()]))).errors, []);
  const cases = [
    [pack([item({provenance: {source: '[TEST] notes'}})]), 'provenance.sources: array of source identifiers required'],
    [pack([item({visibility: 'reveal-gated'})]), 'visibility: expected player/gm/reveal_gated'],
    [pack([item({refs: [{relation: 'x', target_id: 'MAT-TEST-A', mode: 'hard_requirement'}]})]), 'mode:required|optional'],
    [pack([item({foundry: {document_type: 'Item', folder_path: 'Test', data: {name: 'x', type: 'loot'}}})]), 'must begin with "Ashen Gate/"'],
    [pack([location(node({exotics: [{materialId: 'MAT-TEST-STAR', mode: 'random'}]}))]), 'exotics normalised differently'],
    [pack([location(node({tier: 9}))]), 'tier 9 was changed to 1'],
    [pack([item({id: 'REC-TEST-BREW', entity_type: 'Recipe', ingredients: ['2 herbs']})]), 'Ledger cannot craft it'],
    [{records: [item()]}, 'manifest: an object is required']
  ];
  for (const [data, message] of cases) {
    const {errors} = await checkContent(data);
    assert.ok(errors.some(e => e.includes(message)), `expected "${message}", got ${JSON.stringify(errors)}`);
  }
});

test('the exotic and gathering fields Locations keeps are accepted unchanged', async () => {
  const exotics = [{materialId: 'MAT-TEST-STAR', mode: 'designated', chance: 15, condition: 'rare'}, {materialId: 'MAT-TEST-MOON', mode: 'discovery'}];
  assert.deepEqual((await checkContent(pack([location(node({exotics, quantity: 2, rareMaterialId: 'MAT-TEST-RARE', rareQuantity: 1}))]))).errors, []);
});

test('files in an "invalid" folder must be rejected, with the error they name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-content-'));
  try {
    fs.mkdirSync(path.join(dir, 'invalid'));
    const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
    write('invalid/bad.json', {_expect_error: 'provenance.sources', ...pack([item({provenance: {source: 'x'}})])});
    assert.ok((await validateTargets([dir])).ok);
    write('invalid/wrong-reason.json', {_expect_error: 'some other message', ...pack([item({provenance: {source: 'x'}})])});
    write('invalid/actually-fine.json', pack([item()]));
    const {ok, lines} = await validateTargets([dir]);
    assert.equal(ok, false);
    assert.equal(lines.filter(l => l.startsWith('FAIL')).length, 2, lines.join('\n'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('scene mood presets are checked with the Scenes tab validator', async () => {
  const good = [{id: 'test-fog', label: '[TEST] Fog', set: {'environment.darknessLevel': 0.2, weather: 'fog'}}];
  assert.deepEqual((await checkContent(good, 'x.scene-moods.json')).errors, []);
  const bad = [{id: 'Test Fog', label: '', set: {'environment.darknessLevel': 2, 'lighting.colour': 'red'}}];
  assert.equal((await checkContent(bad, 'x.scene-moods.json')).errors.length, 4);
});

test('Route records get every Locations check; endpoints outside the file are noted', async () => {
  const route = over => ({id: 'RTE-TEST-FIELD-MILL', entity_type: 'Route', status: 'approved', version: '1.0.0', provenance: {sources: ['[TEST] synthetic']},
    visibility: 'gm', refs: [], name: '[TEST] Road', route: {from_location_id: 'LOC-TEST-FIELD', to_location_id: 'LOC-TEST-MILL', distance_km: 12, ...over}});
  const ok = await checkContent(pack([location(node()), route({})]), 'routes.json');
  assert.deepEqual(ok.errors, []);
  assert.match(ok.notes.join(' '), /LOC-TEST-MILL is not in this file/);
  const bad = await checkContent(pack([location(node()), route({distance_km: 0, hazard_base_percent: 150})]), 'routes.json');
  assert.match(bad.errors.join(' '), /distance_km must be a number above 0.*hazard_base_percent must be a number from 0 to 100/);
});
