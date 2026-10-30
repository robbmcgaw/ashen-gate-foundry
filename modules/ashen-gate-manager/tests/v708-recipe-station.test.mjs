import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {professionFacts, recipeRequirement} from '../scripts/profession-records.js';
import {sourceMetadata, readStoredDefinition, canonicalDefinition} from '../scripts/source-projection.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const recipe = over => ({id: 'REC-TEST-X', entity_type: 'Recipe', status: 'approved', version: '1', visibility: 'player', refs: [], provenance: {}, tier: 1, effort: 'short', foundry: {document_type: 'Item', data: {name: '[TEST] Recipe', type: 'loot', system: {}}}, ...over});
const row = r => professionFacts(r).fields.filter(([k]) => k === 'Tools' || k === 'Workstation');

test('0.70.8 a station recipe shows Workstation only', () => {
  assert.deepEqual(row(recipe({workstation: 'Alchemy Laboratory'})), [['Workstation', 'Alchemy Laboratory']]);
  assert.deepEqual(recipeRequirement(recipe({workstation: 'Forge'})), ['Workstation', 'Forge']);
});
test('0.70.8 a tool recipe shows its tools, alternatives joined with "or" for crafts and activities', () => {
  assert.deepEqual(row(recipe({required_tools: ['Smith\'s Tools']})), [['Tools', 'Smith\'s Tools']]);
  assert.deepEqual(row(recipe({required_tools: ['Alchemist\'s Supplies', 'Herbalism Kit']})), [['Tools', 'Alchemist\'s Supplies or Herbalism Kit']], 'a craft is any-of too');
  assert.deepEqual(row(recipe({kind: 'activity', required_tools: ['Painter\'s Supplies', 'Calligrapher\'s Supplies']})), [['Tools', 'Painter\'s Supplies or Calligrapher\'s Supplies']]);
});
test('0.70.8 never both; neither falls back to the profession default', () => {
  assert.deepEqual(row(recipe({workstation: 'Kitchen', required_tools: ['Cook\'s Utensils']})), [['Workstation', 'Kitchen']]);
  assert.deepEqual(row(recipe({})), [['Tools', 'Profession default']]);
  assert.deepEqual(row(recipe({required_tools: [], workstation: '  '})), [['Tools', 'Profession default']]);
  assert.equal(professionFacts({id: "MAT-X", entity_type: "Material"}), null);
});
test('0.70.8 workstation survives the import path: the stored definition keeps it, and Browse reads it back', () => {
  const r = recipe({workstation: 'Inscription Desk'});
  const flag = sourceMetadata(r, {manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'PKG-TEST', version: '1'}}, []);
  assert.equal(flag.definition.workstation, 'Inscription Desk');
  assert.equal(canonicalDefinition(r).workstation, 'Inscription Desk');
  const back = readStoredDefinition(flag);
  assert.equal(back.workstation, 'Inscription Desk'); assert.equal(back.required_tools, undefined);
  assert.deepEqual(row({id: flag.sourceId, entity_type: flag.entityType, ...back}), [['Workstation', 'Inscription Desk']]);
  // the code that writes the definition has no field allow-list that could drop it
  assert.doesNotMatch(read('../scripts/source-projection.mjs').replace(/\/\/.*$/gm, ''), /workstation|required_tools/);
});
test('0.70.8 version, CHANGELOG, README and Help', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.87.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.87.0/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.70\.8 /m); assert.match(read('../README.md'), /Workstation: <name>/);
  assert.match(read('../scripts/main.js'), /Workstation/);
});
