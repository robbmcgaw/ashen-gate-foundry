/** 0.38.0: the six overland conditions and hazards. Mocked Foundry data; proves logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';
import {OVERLAND_CONDITIONS, CONDITION_IDS, normalizeConditions, stepsRemaining} from '../scripts/overland-conditions.mjs';
import {validateModifiers, CONDITIONS} from '../scripts/travel-modifiers.mjs';
import {createOverland, normalizeState, newDay, setCondition} from '../scripts/overland.mjs';
import {overlandHtml} from '../scripts/overland-view.mjs';

const mod = (target, value, extra = {}) => ({target, value, label: '[TEST] x', ...extra});
const errorsFor = m => validateModifiers([{index: 0, scope: 'travel', modifier: m}], {recordId: 'ITEM-TEST-A'}).errors;
const SIX = ['harsh-weather', 'hard-ground', 'poor-visibility', 'warped-paths', 'blight-taint', 'ashen-menace'];

test('the six are fixed, in order, with the exported shape', () => {
  assert.deepEqual(CONDITION_IDS, SIX); assert.deepEqual(CONDITIONS, SIX);
  assert.deepEqual(OVERLAND_CONDITIONS.map(c => c.kind), ['condition', 'condition', 'condition', 'hazard', 'hazard', 'hazard']);
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
  assert.deepEqual(normalizeState({day: 4}).conditions, normalizeConditions(null), 'an older saved state defaults to all 0');
  const s = setCondition(normalizeState({}), 'warped-paths', 2);
  assert.equal(s.conditions['warped-paths'], 2);
  assert.throws(() => setCondition(s, 'cold', 1), /Unknown condition/); assert.throws(() => setCondition(s, 'warped-paths', 4), /0 to 3/);
  assert.throws(() => setCondition(s, 'warped-paths', 1.5), /0 to 3/);
  assert.equal(newDay(s).conditions['warped-paths'], 0, 'New day clears severities');
});

const item = (id, mods) => ({id: `i-${id}`, name: `[TEST] ${id}`, type: 'feat', flags: {'ashen-gate-manager': {source: {sourceId: id, definition: {modifiers: {schema: 'ag-modifiers/0.1', scope: 'travel', list: mods}}}}}});
const actor = items => ({name: '[TEST] Ana', type: 'character', hasPlayerOwner: true, items});
function boot({gm = true, items = []} = {}) {
  const box = {gm, store: {}, writes: 0};
  const service = createOverland({isGM: () => box.gm, read: () => box.store, write: async v => { box.store = structuredClone(v); box.writes++; }, actors: () => [actor(items)]});
  const api = createApi({version: '0.38.0', isGM: () => box.gm, playerAccessEnabled: () => true, overland: service});
  return {box, service, api};
}

test('service and API: state() carries conditions, partyModifiers() carries mitigation and remaining, New day clears, GM only', async () => {
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]);
  const {box, service, api} = boot({items: [cloak]});
  assert.deepEqual(api.overland.state().conditions, normalizeConditions(null));
  await service.setCondition('harsh-weather', 3); await service.setCondition('ashen-menace', 1);
  assert.equal(box.store.conditions['harsh-weather'], 3); assert.equal(api.overland.state().conditions['ashen-menace'], 1);
  const pm = api.overland.partyModifiers();
  const hw = pm.conditions.find(c => c.id === 'harsh-weather'), am = pm.conditions.find(c => c.id === 'ashen-menace');
  assert.deepEqual([hw.severity, hw.mitigation, hw.remaining], [3, 2, 1]); assert.deepEqual([am.severity, am.mitigation, am.remaining], [1, 0, 1]);
  assert.equal(pm.conditions.length, 6);
  const row = pm.rows.find(r => r.condition === 'harsh-weather'); assert.deepEqual([row.severity, row.total, row.remaining], [3, 2, 1]);
  await service.newDay(); assert.deepEqual(api.overland.state().conditions, normalizeConditions(null));
  await assert.rejects(service.setCondition('cold', 1), /Unknown condition/);
  const player = boot({gm: false});
  await assert.rejects(player.service.setCondition('harsh-weather', 1), /Only the GM/);
  assert.throws(() => player.api.overland.state(), /Only the GM/); assert.throws(() => player.api.overland.partyModifiers(), /Only the GM/);
  assert.equal(player.box.writes, 0);
});

const h = {esc: v => String(v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])), tip: () => '', now: '<span>Applies now</span>',
  btn: (action, label, {kind = ''} = {}) => `<button type="button" class="ag-btn ${kind}" data-action="${action}">${label}</button>`};
test('Overland tab: Today\'s conditions groups natural and unnatural, shows guidance only while steps remain', async () => {
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]);
  const {service} = boot({items: [cloak]});
  let html = overlandHtml(service.state(), service.partyModifiers(), h);
  assert.match(html, /Today's conditions/); assert.match(html, /Conditions \(natural\)/); assert.match(html, /Hazards \(unnatural\)/);
  assert.ok(html.indexOf('Conditions (natural)') < html.indexOf('Hazards (unnatural)'));
  for (const c of OVERLAND_CONDITIONS) { assert.match(html, new RegExp(`data-cond="${c.id}" data-sev="3"`)); assert.ok(html.includes(c.label)); }
  assert.equal((html.match(/data-action="ov-cond"/g) ?? []).length, 24, '6 conditions x severity 0 to 3');
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 6, 'default severity 0 pressed for each');
  assert.doesNotMatch(html, /agl-ov-cond__guide/, 'no guidance at severity 0');
  assert.equal((html.match(/ag-btn primary/g) ?? []).length, 1, 'still one primary');
  await service.setCondition('harsh-weather', 2);   // mitigation 2: nothing remains
  html = overlandHtml(service.state(), service.partyModifiers(), h);
  assert.doesNotMatch(html, /agl-ov-cond__guide/); assert.match(html, /Party mitigation \+2\. Steps remaining <strong>0<\/strong>/);
  await service.setCondition('harsh-weather', 3); await service.setCondition('warped-paths', 2);
  html = overlandHtml(service.state(), service.partyModifiers(), h);
  assert.equal((html.match(/agl-ov-cond__guide/g) ?? []).length, 2);
  assert.match(html, /Each unmitigated step costs the party one daily action/); assert.match(html, /at 2 or more the GM may misdirect/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /harsh-weather|warped-paths|ashen-menace/, 'no raw condition ids in visible text');
});

test('every doc and fixture names only the six', () => {
  const root = new URL('../../../', import.meta.url);
  const gone = /\b(rain-and-wind|dust-and-ash|mist-and-soft-ground|thin-air-quick-weather|hissing-grass|green-dimness|open-haze|rising-water)\b/;
  for (const f of ['docs/perks-and-modifiers-for-gpt.md', 'test-fixtures/modifiers/AG_Test_Travel_Items.json', 'modules/ashen-gate-locations/README.md']) {
    assert.doesNotMatch(fs.readFileSync(new URL(f, root), 'utf8'), gone, f);
  }
  const schema = fs.readFileSync(new URL('docs/modifiers-schema.md', root), 'utf8');
  for (const id of SIX) assert.ok(schema.includes(`\`${id}\``), `schema names ${id}`);
});
