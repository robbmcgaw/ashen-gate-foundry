/** 0.49.0 (Profession Ledger 0.29.0 shapes): an activity's effect note and a profession's recipe label are shown in the
 *  import preview and in Browse (chip, detail field, search). Display only. Synthetic [TEST] data; mocked Foundry globals:
 *  proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePackage} from '../scripts/core.js';
import {checkContractGraph} from '../scripts/contract.js';
import {compilePackage} from '../scripts/workflows.js';
import {sourceMetadata, readStoredDefinition} from '../scripts/source-projection.mjs';
import {createBrowse, detailOf} from '../scripts/browse.js';
import {professionFacts, effectNoteOf, cleanRecipeLabel, EFFECT_NOTE_MAX, RECIPE_LABEL_MAX} from '../scripts/profession-records.js';

const M = 'ashen-gate-manager';
const SAMPLE = JSON.parse(readFileSync(new URL('../samples/AG_Artistry_v0.49.0_Test.json', import.meta.url), 'utf8'));
const recipe = extra => ({id: 'REC-TEST-X', entity_type: 'Recipe', tier: 'apprentice', effort: 'short', ...extra});
const prof = extra => ({id: 'PROF-TEST-X', entity_type: 'Profession', name: '[TEST] X', ...extra});

test('0.49.0: effect note and recipe label follow the Ledger rules', () => {
  assert.equal(EFFECT_NOTE_MAX, 400);
  assert.equal(RECIPE_LABEL_MAX, 30);
  assert.equal(effectNoteOf({effect_note: '  A   small\\nboon '.replace('\\n', '\n')}), 'A small boon');
  assert.equal(effectNoteOf({effectNote: 'Camel case'}), 'Camel case');
  assert.equal(effectNoteOf({effect_note: 42}), null);
  assert.equal(effectNoteOf({effect_note: '   '}), null);
  const long = effectNoteOf({effect_note: 'x'.repeat(500)});
  assert.equal(long.length, 400);
  assert.ok(long.endsWith('…'));
  assert.equal(cleanRecipeLabel(' Formula '), 'Formula');
  assert.equal(cleanRecipeLabel('x'.repeat(31)), null);
  assert.equal(cleanRecipeLabel(''), null);
  assert.equal(cleanRecipeLabel(3), null);
});

test('0.49.0: professionFacts shows an activity\'s effect note and a profession\'s recipe label', () => {
  const activity = professionFacts(recipe({kind: 'activity', effect_note: '[TEST] A boon'}));
  assert.deepEqual(activity.fields.at(-1), ['Effect note', '[TEST] A boon']);
  assert.equal(activity.summary, 'Activity · Short effort · Apprentice · Effect note');
  assert.deepEqual(activity.chips, ['Activity', 'Effect note']);
  assert.deepEqual(activity.searchText, ['Activity', '[TEST] A boon']);
  // A craft recipe with a note: the Ledger ignores it, so it is not shown (the validator notes it).
  const craft = professionFacts(recipe({effect_note: '[TEST] A boon'}));
  assert.equal(craft.summary, 'Craft · Short effort · Apprentice');
  assert.ok(!craft.fields.some(([label]) => label === 'Effect note'));
  assert.equal(professionFacts(recipe({kind: 'activity', effect_note: 7})).summary, 'Activity · Short effort · Apprentice');

  // Only a recipe label (no category) now gives facts; before 0.49.0 this was null.
  assert.deepEqual(professionFacts(prof({recipeLabel: 'Formula', recipeLabelPlural: 'Formulas'})),
    {label: null, fields: [['Recipe label', 'Formula / Formulas']], summary: 'Recipe label: Formula / Formulas',
      chips: ['Recipe label: Formula / Formulas'], searchText: ['Formula / Formulas']});
  assert.equal(professionFacts(prof({recipeLabelPlural: 'Formulas'})).summary, 'Recipe label: Formulas');
  assert.equal(professionFacts(prof({profession_kind: 'crafting', recipeLabel: 'Formula'})).summary, 'Crafting · Recipe label: Formula');
  assert.equal(professionFacts(prof({recipeLabel: 'x'.repeat(31)})), null, 'a label over 30 characters is ignored');
  assert.equal(professionFacts(prof({})), null, 'a plain profession is unchanged');
  assert.deepEqual(professionFacts(prof({profession_kind: 'gathering'})), {label: 'Gathering', fields: [['Profession category', 'Gathering']], summary: 'Gathering', chips: ['Gathering'], searchText: ['Gathering']});
});

test('0.49.0: the [TEST] Artistry sample validates (strict 0.2 contract) with no errors or warnings', () => {
  assert.deepEqual(validatePackage(structuredClone(SAMPLE)), []);
  assert.deepEqual(checkContractGraph(SAMPLE.records), {errors: [], warnings: [], moduleLinks: []});
  // Stored whole in the source flag (no import change): the new fields round-trip, ids unchanged.
  const compiled = compilePackage(structuredClone(SAMPLE));
  const stored = compiled.records.map(r => readStoredDefinition(sourceMetadata(r, compiled, r.refs)));
  assert.deepEqual(stored.map(d => d.id), ['PROF-ARTISTRY', 'REC-TEST-ARTISTRY-BALLAD', 'REC-TEST-ARTISTRY-PORTRAIT']);
  assert.deepEqual([stored[0].recipeLabel, stored[0].recipeLabelPlural], ['[TEST] Piece', '[TEST] Pieces']);
  assert.equal(stored[1].effect_note, SAMPLE.records[1].effect_note);
});

test('0.49.0: Browse shows the effect note and recipe label as chips and detail fields, and searches them', () => {
  const doc = (id, name, source) => ({documentName: 'Item', id, uuid: `Item.${id}`, name, type: 'loot', system: {}, folder: null, _stats: {modifiedTime: 0},
    flags: {[M]: {source}}, toDragData() { return {}; }});
  const src = r => ({sourceId: r.id, entityType: r.entity_type, status: 'approved', visibility: 'player', refs: r.refs, definition: (({foundry, ...d}) => d)(r)});
  const [artistry, ballad, portrait] = SAMPLE.records;
  const plain = prof({id: 'PROF-TEST-PLAIN', name: '[TEST] Plain'});
  const items = [doc('p', 'Artistry', src(artistry)), doc('b', 'Ballad', src(ballad)), doc('o', 'Portrait', src(portrait)), doc('q', 'Plain', src(plain))];
  const game = {user: {isGM: true}, items: {contents: items}, actors: {contents: []}, journal: {contents: []},
    modules: {get: () => null, values: () => [].values()}, packs: {contents: []}};
  const idx = createBrowse({game}).getIndex();
  const entry = id => idx.find(e => e.id === id);
  const fields = id => Object.fromEntries(detailOf(idx, entry(id).key).fields.map(f => [f.label, f.value]));
  assert.deepEqual(entry('PROF-ARTISTRY').chips, ['Creative', 'Recipe label: [TEST] Piece / [TEST] Pieces']);
  assert.equal(fields('PROF-ARTISTRY')['Recipe label'], '[TEST] Piece / [TEST] Pieces');
  assert.deepEqual(entry('REC-TEST-ARTISTRY-BALLAD').chips, ['Activity', 'Effect note']);
  assert.equal(fields('REC-TEST-ARTISTRY-BALLAD')['Effect note'], ballad.effect_note);
  assert.ok(entry('REC-TEST-ARTISTRY-BALLAD').hay.includes('small boon'), 'searchable by the effect note');
  assert.ok(entry('PROF-ARTISTRY').hay.includes('pieces'), 'searchable by the recipe label');
  assert.deepEqual(entry('REC-TEST-ARTISTRY-PORTRAIT').chips, ['Activity']);
  assert.deepEqual(entry('PROF-TEST-PLAIN').chips, []);
});
