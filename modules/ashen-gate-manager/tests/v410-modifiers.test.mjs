// 0.41.0: record-level modifiers blocks (ag-modifiers/0.1) and the implementation field. Manager checks the shape and
// hands each scope's entries to the owner's api.modifiers.validate (feature-detected). Plain data and stand-in module
// APIs: proves validation and routing, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePackage} from '../scripts/core.js';
import {canonicalDefinition} from '../scripts/source-projection.mjs';
import {modifierRecordProblems, resolvedModifiers, modifierDefinitionChecks, MODIFIERS_SCHEMA} from '../scripts/modifier-definitions.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/modifiers/AG_Test_Modifier_Items.json', import.meta.url), 'utf8'));
const lens = fixture.records.find(r => r.id === 'ITEM-TEST-EMBER-LENS');
const withMods = (list, extra = {}) => ({...structuredClone(lens), modifiers: {schema: MODIFIERS_SCHEMA, list, ...extra}});
const gameWith = api => ({modules: new Map([['ashen-gate-cinders', {active: true, api}]])});

test('the synthetic package passes validatePackage, and the blocks reach source.definition untouched', () => {
  assert.deepEqual(validatePackage(fixture), []);
  const def = canonicalDefinition(lens);
  assert.deepEqual(def.modifiers, lens.modifiers);
  assert.equal(def.implementation, 'automatic');
});

test('shape errors: schema, list size, scope, unknown fields, op, value, label, stack, applies, requires', () => {
  const p = r => modifierRecordProblems(r).join('\n');
  assert.match(p({...lens, modifiers: {...lens.modifiers, schema: 'ag-modifiers/9'}}), /schema must be "ag-modifiers\/0\.1"/);
  assert.match(p(withMods([])), /1 to 20/);
  assert.match(p(withMods(Array(21).fill({target: 'push.cost', value: 1, label: 'x', scope: 'cinder'}))), /1 to 20/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x'}])), /scope is required/);
  assert.equal(p(withMods([{target: 'push.cost', value: 1, label: 'x'}], {scope: 'cinder'})), '', 'block scope is the default');
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'hq'}])), /scope "hq" is not one Manager knows/);
  assert.match(p(withMods([{target: 'x', value: 1, label: 'x'}], {scope: 'hq'})), /modifiers\.scope "hq"/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', bonus: 2}])), /unknown field\(s\) bonus/);
  assert.equal(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', powers: ['POWER-TEST-A'], modes: ['amplify']}])), '', 'Cinders aliases are allowed in its scope');
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', op: 'multiply'}])), /op must be "add"/);
  assert.match(p(withMods([{target: 'push.cost', value: 0, label: 'x', scope: 'cinder'}])), /not 0/);
  assert.match(p(withMods([{target: 'push.cost', value: 1.5, label: 'x', scope: 'cinder'}])), /whole number/);
  assert.match(p(withMods([{target: 'Push Cost', value: 1, label: 'x', scope: 'cinder'}])), /dotted lower-case key/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: '', scope: 'cinder'}])), /label/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', stack: 'Big Stack'}])), /stack/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', applies: []}])), /applies must be an object/);
  assert.match(p(withMods([{target: 'push.cost', value: 1, label: 'x', scope: 'cinder', requires: {powers: ['spark']}}])), /requires\.powers must list canonical ids/);
  assert.match(p({...lens, modifiers: {schema: MODIFIERS_SCHEMA, list: [], extra: 1}}), /unknown field\(s\) extra/);
});

test('modifiers only on ITEM-* / PERK-*; implementation is optional and display only; HPERK keeps its own rule', () => {
  const power = {id: 'POWER-TEST-SPARK', entity_type: 'Power', modifiers: lens.modifiers};
  assert.match(modifierRecordProblems(power).join(), /only on ITEM-\* and PERK-\*/);
  assert.deepEqual(resolvedModifiers(power), []);
  assert.deepEqual(modifierRecordProblems({id: 'PERK-TEST-A', implementation: 'informational'}), []);
  assert.deepEqual(modifierRecordProblems({id: 'PERK-TEST-A'}), []);
  assert.match(modifierRecordProblems({id: 'PERK-TEST-A', implementation: 'hybrid'}).join(), /automatic, informational, gm_resolved/);
  assert.deepEqual(modifierRecordProblems({id: 'HPERK-TEST-A', entity_type: 'HirelingPerk', implementation: 'hybrid'}), [], 'HPERK implementation is checked by its own rule');
  const pkg = structuredClone(fixture);pkg.records[2].implementation = 'sometimes';
  assert.ok(validatePackage(pkg).some(e => e.startsWith('PERK-TEST-QUIET-WORD.implementation')));
});

test('entries reach the scope owner with their scope filled in; owner errors block, warnings show', () => {
  const seen = [];
  const game = gameWith({modifiers: {validate: (entries, ctx) => {seen.push([ctx.recordId, entries.map(e => [e.index, e.scope, e.modifier.target])]);
    return ctx.recordId === 'ITEM-TEST-EMBER-LENS' ? {errors: ['ITEM-TEST-EMBER-LENS: [TEST] bad'], warnings: ['[TEST] note']} : {errors: [], warnings: []};}}});
  const r = modifierDefinitionChecks(game, fixture.records);
  assert.deepEqual(seen, [
    ['ITEM-TEST-EMBER-LENS', [[0, 'cinder', 'push.cost'], [1, 'cinder', 'backfire.chance']]],
    ['PERK-TEST-STEADY-GRIP', [[0, 'cinder', 'strain.recovery']]]]);
  assert.deepEqual(r, {errors: ['ITEM-TEST-EMBER-LENS: [TEST] bad'], warnings: ['[TEST] note']});
});

test('without Cinders, inactive, or a Cinders with no modifier check: imports with one warning; a throwing owner is an error', () => {
  for (const game of [{modules: new Map()}, gameWith({cinder: {}}), {modules: new Map([['ashen-gate-cinders', {active: false, api: {modifiers: {validate: () => ({errors: ['x']})}}}]])}]) {
    const r = modifierDefinitionChecks(game, fixture.records);
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1);assert.match(r.warnings[0], /3 "cinder" modifier\(s\) on 2 record\(s\).*not checked/);
  }
  assert.deepEqual(modifierDefinitionChecks(gameWith({}), [fixture.records[2]]), {errors: [], warnings: []}, 'no modifiers, nothing to say');
  const r = modifierDefinitionChecks(gameWith({modifiers: {validate: () => {throw Error('boom');}}}), [lens]);
  assert.match(r.errors[0], /could not check its modifiers \(boom\)/);
});
