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

test('moods files are checked with the Scenes import preview', async () => {
  const file = presets => ({format: 'ashen-gate.scene-moods', formatVersion: 1, presets});
  const good = file([{id: 'test-fog', label: '[TEST] Fog', kind: 'layer', set: {weather: 'fog'}}, {id: 'test-dusk', label: '[TEST] Dusk', set: {'environment.darknessLevel': 0.5}, transitionMs: 3000}]);
  assert.deepEqual((await checkContent(good, 'x.scene-moods.json')).errors, []);
  assert.match((await checkContent([good.presets[0]], 'x.scene-moods.json')).errors[0], /not an Ashen Gate moods file/);
  const bad = await checkContent(file([{id: 'Test Fog', label: '', set: {'environment.darknessLevel': 2, 'lighting.colour': 'red'}}, {id: 'test-ash', label: '[TEST] Ash', kind: 'layer', set: {weather: 'ashfall'}}]), 'x.scene-moods.json');
  assert.match(bad.errors.join(' | '), /Id must be.*Label is required.*Darkness must be a number from 0 to 1.*lighting.colour is not a supported mood field.*weather "ashfall" is not a core weather id/);
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

test('NPC Codex fields: what the Codex would drop or turn into other text is reported', async () => {
  const npc = over => ({id: 'NPC-TEST-CLERK', entity_type: 'NPC', status: 'approved', version: '1.0.0', provenance: {sources: ['[TEST] synthetic']},
    visibility: 'gm', refs: [], name: '[TEST] Clerk', role: '[TEST] Clerk', gm_notes: ['[TEST] note'],
    codex: {links: ['LOC-TEST-FIELD', 'QUEST-TEST-ONE'], default_reveal: {discovery: 'hidden', fields: {role: 'party'}}},
    foundry: {document_type: 'Actor', data: {name: '[TEST] Clerk', type: 'npc'}}, ...over});
  assert.deepEqual((await checkContent(pack([npc()]))).errors, []);
  const bad = await checkContent(pack([npc({wants: ['a', 'b'], codex: {links: ['ITEM-TEST-X'], default_reveal: {discovery: 'everyone', fields: {portrayal: 'party'}}}})]));
  assert.match(bad.errors.join(' | '), /wants must be text.*codex.links "ITEM-TEST-X" is not a linkable id.*discovery "everyone" must be "hidden" or "party".*fields.portrayal is not revealable/);
  assert.match((await checkContent(pack([item({codex: {links: []}})]))).notes.join(' '), /codex is only read on entity_type NPC/);
});

test('crosswalk baseline files go through the Ledger parser; unknown names are reported', async () => {
  const good = {professions: {fishing: {qualifySkills: ['Survival'], items: ['Fishing Tackle']}, herbalism: {qualifyTools: ['Herbalism Kit'], advantageTools: ['herb']}}};
  const ok = await checkContent(good, 'x.crosswalk.json');
  assert.equal(ok.kind, 'crosswalk');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual((await checkContent({professions: []}, 'x.crosswalk.json')).errors, ['The file needs a "professions" object.']);
  const bad = await checkContent({professions: {Skinning: {qualifySkills: ['sur']}, 'Hunting/Skinning': {}, herbalism: {qualifyTools: ['[TEST] Press'], items: ['']}, Dancing: {}}}, 'x.crosswalk.json');
  assert.match(bad.errors.join(' | '), /listed twice.*"Dancing" is not one of the Ledger's 14 professions.*"\[TEST\] Press" matches no dnd5e tool.*empty or over 200 characters/);
});

test('NPC Codex export files are checked with the restore planner and kept out of the ZIP', async () => {
  const file = {schema_version: 'ag-npc-codex-export/0.1', visibility: 'gm', definitions: [], reveals: {'NPC-TEST-CLERK': {discovery: {party: true, actors: []}}}};
  assert.deepEqual((await checkContent(file, 'x.npc-codex.json')).errors, []);
  assert.deepEqual((await checkContent({...file, schema_version: 'x', reveals: []}, 'x.npc-codex.json')).errors,
    ['schema_version must be ag-npc-codex-export/0.1.', 'reveals must be an object keyed by NPC id.']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-content-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(pack([item()])));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(pack([item({id: 'ITEM-TEST-ROPE'})])));
    fs.writeFileSync(path.join(dir, 'c.npc-codex.json'), JSON.stringify(file));
    fs.writeFileSync(path.join(dir, 'd.crosswalk.json'), JSON.stringify({professions: {mining: {}}}));
    const {ok, lines} = await validateTargets([dir]);
    assert.ok(ok, lines.join('\n'));
    assert.match(lines.at(-1), /ZIP of .*a\.json .*-> b\.json/);
    assert.doesNotMatch(lines.at(-1), /npc-codex|crosswalk/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Item effects (Manager 0.37.0): valid effects pass, bad ones fail with the validator message, dropped flags are notes', async () => {
  const effect = (over = {}) => ({eff_id: 'walk', name: '[TEST] Walk speed', transfer: false, changes: [{key: 'system.attributes.movement.walk', mode: 'add', value: 10}], ...over});
  const gear = (effects, flags) => item({id: 'ITEM-MOUNT-TEST-SADDLE', foundry: {document_type: 'Item', folder_path: 'Ashen Gate/Test',
    data: {name: '[TEST] Saddle', type: 'equipment', effects, ...(flags ? {flags} : {})}}});
  assert.deepEqual(await checkContent(pack([gear([effect()], {'ashen-gate-character-hub': {companion: {role: 'mount-gear'}}})])), {kind: 'manager', errors: [], notes: []});
  for (const [effects, message] of [
    [[effect({changes: [{key: 'system.attributes.ac.bonus', mode: 'plus', value: 1}]})], 'is not a mode'],
    [[effect({changes: [{key: '', mode: 'add', value: 1}]})], 'key is required'],
    [[effect({changes: [{key: 'macro.execute', mode: 'custom', value: 'x'}]})], 'may not run macros'],
    [[effect({changes: [{key: 'system.attributes.ac.bonus', mode: 2, value: [1]}]})], 'must be a string or a number'],
    [[effect({eff_id: ''})], 'eff_id is required'],
    [[effect({transfer: 'no'})], 'transfer is required']
  ]) {
    const {errors} = await checkContent(pack([gear(effects)]));
    assert.ok(errors.some(e => e.includes(message)), `expected "${message}", got ${JSON.stringify(errors)}`);
  }
  const {errors, notes} = await checkContent(pack([gear([effect({transfer: true})], {core: {statusId: 'dead'}})]));
  assert.deepEqual(errors, []);
  assert.ok(notes.some(n => /flags not imported .*core\.statusId/.test(n)), JSON.stringify(notes));
  assert.ok(notes.some(n => /transfer on/.test(n)), JSON.stringify(notes));
});
