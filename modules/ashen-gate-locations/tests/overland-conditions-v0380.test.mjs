/** 0.38.0: the six travel conditions (conditions only since 0.39.0; the service and tab tests are in travel-v0390.test.mjs). Mocked Foundry data; proves logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OVERLAND_CONDITIONS, CONDITION_IDS, normalizeConditions, stepsRemaining} from '../scripts/overland-conditions.mjs';
import {validateModifiers, CONDITIONS} from '../scripts/travel-modifiers.mjs';
import {joinState, newDay, setCondition} from '../scripts/overland.mjs';

const mod = (target, value, extra = {}) => ({target, value, label: '[TEST] x', ...extra});
const errorsFor = m => validateModifiers([{index: 0, scope: 'travel', modifier: m}], {recordId: 'ITEM-TEST-A'}).errors;
const SIX = ['harsh-weather', 'hard-ground', 'poor-visibility', 'warped-paths', 'blight-taint', 'ashen-menace'];

test('the six are fixed, in order, with the exported shape', () => {
  assert.deepEqual(CONDITION_IDS, SIX); assert.deepEqual(CONDITIONS, SIX);
  assert.deepEqual(OVERLAND_CONDITIONS.map(c => c.kind), SIX.map(() => 'condition'), 'kind stays for compatibility; there is no hazard class');
  assert.equal(OVERLAND_CONDITIONS[1].label, 'Difficult Terrain'); assert.ok(!OVERLAND_CONDITIONS.some(c => /hazard/i.test(c.label + c.hits + c.guidance)));
  for (const c of OVERLAND_CONDITIONS) {
    assert.deepEqual(Object.keys(c).sort(), ['guidance', 'hits', 'id', 'kind', 'label']);
    assert.ok(Object.isFrozen(c) && c.label && c.hits && c.guidance);
  }
  assert.ok(Object.isFrozen(OVERLAND_CONDITIONS));
});

test('owner check accepts the six and rejects every old id with the list and a re-import hint', () => {
  for (const id of SIX) assert.deepEqual(errorsFor(mod('condition.mitigation', 1, {applies: {condition: id}})), [], id);
  for (const old of ['cold', 'heat', 'rain-and-wind', 'dust-and-ash', 'darkness', 'difficult-terrain', 'mist-and-soft-ground', 'thin-air-quick-weather', 'hissing-grass', 'green-dimness', 'open-haze', 'rising-water', 'everything']) {
    const msg = errorsFor(mod('condition.mitigation', 1, {applies: {condition: old}})).join('\n');
    assert.match(msg, /one of the six ids/, old);
    for (const id of SIX) assert.ok(msg.includes(id), `${old} message lists ${id}`);
    assert.match(msg, /re-import/);
  }
  assert.match(errorsFor(mod('condition.mitigation', 2)).join(), /six condition ids/);
});

test('severity and remaining math: max(0, severity - mitigation), mitigation capped at 3', () => {
  assert.equal(stepsRemaining(3, 1), 2); assert.equal(stepsRemaining(1, 3), 0); assert.equal(stepsRemaining(0, 0), 0); assert.equal(stepsRemaining(2, 2), 0);
  assert.equal(stepsRemaining(9, 0), 3, 'severity is clamped to 3'); assert.equal(stepsRemaining(-2, 0), 0);
  assert.deepEqual(normalizeConditions({'harsh-weather': 2, 'hard-ground': 9, 'poor-visibility': 'x', bogus: 3}),
    {'harsh-weather': 2, 'hard-ground': 3, 'poor-visibility': 0, 'warped-paths': 0, 'blight-taint': 0, 'ashen-menace': 0});
  assert.deepEqual(joinState({day: 4}, {}).conditions, normalizeConditions(null), 'an older saved state defaults to all 0');
  const s = setCondition(joinState({}, {}), 'warped-paths', 2);
  assert.equal(s.conditions['warped-paths'], 2);
  assert.throws(() => setCondition(s, 'cold', 1), /Unknown condition/); assert.throws(() => setCondition(s, 'warped-paths', 4), /0 to 3/);
  assert.throws(() => setCondition(s, 'warped-paths', 1.5), /0 to 3/);
  assert.equal(newDay(s).conditions['warped-paths'], 0, 'New day clears severities');
});

test('every doc and fixture names only the six, as conditions (0.39.0: no hazard class)', () => {
  const root = new URL('../../../', import.meta.url);
  const gone = /\b(rain-and-wind|dust-and-ash|mist-and-soft-ground|thin-air-quick-weather|hissing-grass|green-dimness|open-haze|rising-water)\b/;
  for (const f of ['docs/perks-and-modifiers-for-gpt.md', 'test-fixtures/modifiers/AG_Test_Travel_Items.json', 'modules/ashen-gate-locations/README.md']) {
    assert.doesNotMatch(fs.readFileSync(new URL(f, root), 'utf8'), gone, f);
  }
  const schema = fs.readFileSync(new URL('docs/modifiers-schema.md', root), 'utf8');
  for (const id of SIX) assert.ok(schema.includes(`\`${id}\``), `schema names ${id}`);
  assert.match(schema, /Difficult Terrain/);
  // The Travel docs talk about conditions only: no "hazards (unnatural)" group, no "natural" classification, no Overland tab.
  const section = text => text.slice(text.indexOf('### Conditions'), text.indexOf('### Conditions') + 3000);
  assert.doesNotMatch(section(schema), /unnatural|natural|\| hazard|Hazards \(/i);
  for (const f of ['docs/perks-and-modifiers-for-gpt.md', 'docs/modifiers-schema.md']) {
    const text = fs.readFileSync(new URL(f, root), 'utf8');
    assert.doesNotMatch(text, /Overland tab|condition or hazard|conditions and hazards|Hard Ground/i, f);
  }
});
