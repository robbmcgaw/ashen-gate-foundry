/** 0.73.0 (Ledger 0.38.0): a GM-applied enchantment recipe (kind activity + gm_applied + bring) round-trips through the import and shows
 * a "GM-applied" chip and a Bring line in the preview and Browse. Mocked data only: proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {professionFacts, gmApplied, bringText} from '../scripts/profession-records.js';
import {sourceMetadata, readStoredDefinition} from '../scripts/source-projection.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const recipe = over => ({id: 'REC-TEST-GLOW', entity_type: 'Recipe', status: 'approved', version: '0.4.0', visibility: 'player', refs: [], provenance: {}, tier: 'apprentice', effort: 'long',
  kind: 'activity', gm_applied: true, bring: {text: ' a  dagger ', item_types: ['weapon'], base_items: ['dagger']}, effect_note: 'The dagger sheds dim light.',
  ingredients: [{material_id: 'MAT-TEST-DUST', quantity: 1}], workstation: 'Enchanting Chamber', foundry: {document_type: 'Item', data: {name: 'Recipe: Glow', type: 'loot'}}, ...over});

test('a GM-applied enchantment shows a GM-applied chip, the Bring line and its effect note', () => {
  const f = professionFacts(recipe());
  assert.equal(f.label, 'Activity');
  assert.deepEqual(f.fields.find(([k]) => k === 'Bring'), ['Bring', 'a dagger']);
  assert.deepEqual(f.fields.find(([k]) => k === 'Applied by'), ['Applied by', 'GM']);
  assert.ok(f.chips.includes('GM-applied')); assert.ok(f.chips.includes('Bring: a dagger')); assert.ok(f.chips.includes('Effect note'));
  assert.match(f.summary, /Activity · GM-applied · Long effort · Apprentice · Effect note/);
  assert.ok(f.searchText.includes('GM-applied enchantment'));
  assert.deepEqual(f.fields.find(([k]) => k === 'Workstation'), ['Workstation', 'Enchanting Chamber'], 'the one requirement row is unchanged');
});
test('gm_applied counts only on an activity, and bring text must be 1 to 80 characters', () => {
  assert.equal(gmApplied(recipe()), true);
  assert.equal(gmApplied(recipe({kind: 'craft'})), false); assert.equal(gmApplied(recipe({kind: undefined})), false);
  assert.equal(gmApplied({id: 'MAT-X', entity_type: 'Material', gm_applied: true}), false);
  assert.equal(gmApplied(recipe({gm_applied: 'yes'})), false);
  const plain = professionFacts(recipe({gm_applied: undefined, bring: undefined}));
  assert.ok(!plain.chips.includes('GM-applied')); assert.equal(plain.fields.find(([k]) => k === 'Bring'), undefined);
  assert.equal(professionFacts(recipe({kind: 'craft'})).fields.find(([k]) => k === 'Bring'), undefined, 'a craft never shows Bring');
  for (const bad of ['', '   ', 'x'.repeat(81), 5, null]) assert.equal(bringText(recipe({bring: {text: bad}})), null, String(bad));
  assert.equal(bringText(recipe({bring: 'a dagger'})), null);
});
test('the new fields survive the import: the stored definition keeps them whole and Browse reads them back', () => {
  const r = recipe();
  const flag = sourceMetadata(r, {manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'PKG-TEST', version: '1'}}, []);
  assert.equal(flag.definition.gm_applied, true);
  assert.deepEqual(flag.definition.bring, {text: ' a  dagger ', item_types: ['weapon'], base_items: ['dagger']});
  assert.equal(flag.definition.result_item_id, undefined);
  const back = readStoredDefinition(flag);
  assert.equal(back.gm_applied, true); assert.equal(back.bring.item_types[0], 'weapon'); assert.deepEqual(back.ingredients, r.ingredients);
  assert.ok(professionFacts({id: flag.sourceId, entity_type: flag.entityType, ...back}).chips.includes('GM-applied'));
  // no field allow-list in the code that writes the definition
  assert.doesNotMatch(read('../scripts/source-projection.mjs').replace(/\/\/.*$/gm, ''), /gm_applied|bring/);
});
test('the pre-session recipe check still looks at the ingredients of a GM-applied enchantment, and still skips plain activities', () => {
  const code = read('../scripts/pre-session-check.js');
  assert.match(code, /recipeKind\(def\) !== 'craft' && def\.gm_applied !== true/);
});
test('0.73.0 version, CHANGELOG and README', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.100.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.100.0/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.73\.0 /m); assert.match(read('../README.md'), /GM-applied/);
});
