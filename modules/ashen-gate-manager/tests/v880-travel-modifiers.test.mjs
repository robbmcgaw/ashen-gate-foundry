// 0.88.0: modifier scope `travel` (owner: Ashen Gate | Locations). Plain data and stand-in module APIs: proves validation and routing, not the live Import window.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePackage} from '../scripts/core.js';
import {modifierRecordProblems, modifierDefinitionChecks, MODIFIER_SCOPES, resolvedModifiers} from '../scripts/modifier-definitions.js';
import {validateModifiers} from '../../ashen-gate-locations/scripts/travel-modifiers.mjs';
import {createApi} from '../../ashen-gate-locations/scripts/api.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/modifiers/AG_Test_Travel_Items.json', import.meta.url), 'utf8'));
const boots = fixture.records.find(r => r.id === 'ITEM-TEST-TRAIL-BOOTS');
const withList = list => ({...structuredClone(boots), modifiers: {schema: 'ag-modifiers/0.1', scope: 'travel', list}});
const locations = active => ({modules: new Map([['ashen-gate-locations', {active, api: active ? {modifiers: createApi({version: '0.37.0', isGM: () => true, playerAccessEnabled: () => true}).modifiers} : {}}]])});

test('travel is a known scope owned by Locations; the synthetic package passes validatePackage', () => {
  assert.deepEqual(MODIFIER_SCOPES.travel, {moduleId: 'ashen-gate-locations', title: 'Ashen Gate | Locations', aliases: []});
  assert.deepEqual(validatePackage(fixture), []);
  assert.deepEqual(modifierRecordProblems(boots), []);
  assert.equal(resolvedModifiers(boots)[0].scope, 'travel');
});
test('Manager checks the shape for travel: unknown scope, cinder aliases and unknown fields are refused', () => {
  const p = r => modifierRecordProblems(r).join('\n');
  assert.match(p(withList([{target: 'travel.actions', value: 1, label: 'x', scope: 'hq'}])), /scope "hq" is not one Manager knows \(cinder, travel\)/);
  assert.match(p(withList([{target: 'travel.actions', value: 1, label: 'x', powers: ['POWER-TEST-A']}])), /unknown field\(s\) powers/);
  assert.match(p(withList([{target: 'travel.actions', value: 0, label: 'x'}])), /not 0/);
});
test('with Locations active its owner check runs: valid entries import clean, bad targets/ranges block', () => {
  const ok = modifierDefinitionChecks(locations(true), fixture.records);
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.warnings.every(w => !/not checked|not active/.test(w)), 'no "not checked" warning');
  assert.ok(ok.warnings.some(w => /familiar_terrain/.test(w)));
  const bad = modifierDefinitionChecks(locations(true), [withList([{target: 'travel.speed', value: 1, label: 'x'}, {target: 'travel.actions', value: 3, label: 'x'},
    {target: 'condition.mitigation', value: 2, label: 'x'}, {target: 'travel.efficiency', value: 1, label: 'x', applies: {terrain: ['lava']}}])]);
  assert.equal(bad.errors.length, 4, bad.errors.join('\n'));
  assert.ok(bad.errors.every(e => e.startsWith('ITEM-TEST-TRAIL-BOOTS: modifiers.list[')));
});
test('without Locations (inactive, older, or absent) the import shows the not-checked warning and still imports', () => {
  for (const game of [locations(false), {modules: new Map([['ashen-gate-locations', {active: true, api: {}}]])}, {modules: new Map()}]) {
    const r = modifierDefinitionChecks(game, [withList([{target: 'travel.speed', value: 99, label: 'x'}])]);
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1); assert.match(r.warnings[0], /"travel" modifier\(s\) on 1 record\(s\): Ashen Gate \| Locations is not active or does not check modifiers yet/);
    assert.match(r.warnings[0], /They import/);
  }
});
test('cinder and travel entries in one package go to their own owners', () => {
  const cinder = {...structuredClone(boots), id: 'ITEM-TEST-LENS', modifiers: {schema: 'ag-modifiers/0.1', scope: 'cinder', list: [{target: 'push.cost', value: -1, label: 'x'}]}};
  const seen = [];
  const game = {modules: new Map([['ashen-gate-locations', {active: true, api: {modifiers: {validate: (e, c) => { seen.push(['travel', c.recordId]); return {errors: [], warnings: []}; }}}}],
    ['ashen-gate-cinders', {active: true, api: {modifiers: {validate: (e, c) => { seen.push(['cinder', c.recordId]); return {errors: [], warnings: []}; }}}}]])};
  modifierDefinitionChecks(game, [boots, cinder]);
  assert.deepEqual(seen.sort(), [['cinder', 'ITEM-TEST-LENS'], ['travel', 'ITEM-TEST-TRAIL-BOOTS']]);
  assert.equal(typeof validateModifiers, 'function');
});
