/** 0.37.0: the `travel` modifier scope and light travel's modifier owner check. (The service, tab and window tests moved to travel-v0390.test.mjs.) Mocked Foundry data; proves logic, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../scripts/api.mjs';
import {validateModifiers, combine, blockModifiers, TARGETS, TERRAINS, CONDITIONS} from '../scripts/travel-modifiers.mjs';
import {collectSources} from '../scripts/overland.mjs';

const mod = (target, value, extra = {}) => ({target, value, label: '[TEST] x', ...extra});
const check = (m, id = 'ITEM-TEST-A') => validateModifiers([{index: 0, scope: 'travel', modifier: m}], {recordId: id});
const bad = (m, re) => { const r = check(m); assert.ok(r.errors.length, JSON.stringify(m)); if (re) assert.match(r.errors.join('\n'), re); };
const ok = m => assert.deepEqual(check(m).errors, [], JSON.stringify(m));

test('owner check accepts each target at its allowed values', () => {
  ok(mod('travel.actions', 1)); ok(mod('travel.actions', 2));
  ok(mod('travel.efficiency', 1)); ok(mod('travel.efficiency', 1, {applies: {terrain: ['forest', 'road']}}));
  ok(mod('scout.precision', 1)); ok(mod('scout.precision', 2));
  ok(mod('explore.range', 1));
  for (const v of [1, 2, 3]) ok(mod('condition.mitigation', v, {applies: {condition: 'harsh-weather'}}));
  for (const c of CONDITIONS) ok(mod('condition.mitigation', 1, {applies: {condition: c}}));
  for (const t of TERRAINS) ok(mod('travel.efficiency', 1, {applies: {terrain: [t]}}));
  ok(mod('travel.actions', 1, {applies: {when: ['mounted', 'familiar_terrain']}, stack: 'mount-gear'}));
});
test('owner check rejects unknown targets, out-of-range values and bad shapes', () => {
  bad(mod('travel.speed', 1), /target must be one of/);
  bad(mod('travel.actions', 3), /takes 1 to 2/); bad(mod('travel.actions', 0), /positive whole number/); bad(mod('travel.actions', -1), /positive/); bad(mod('travel.actions', 1.5), /whole number/);
  bad(mod('travel.efficiency', 2), /only 1/); bad(mod('explore.range', 2), /only 1/); bad(mod('scout.precision', 3), /1 to 2/);
  bad(mod('condition.mitigation', 4, {applies: {condition: 'harsh-weather'}}), /no blanket immunity/);
  bad(mod('condition.mitigation', 2), /needs applies\.condition/);
  bad(mod('condition.mitigation', 2, {applies: {}}), /needs applies\.condition/);
  bad(mod('condition.mitigation', 2, {applies: {condition: 'everything'}}), /one of the six/);
  bad(mod('condition.mitigation', 2, {applies: {condition: ['harsh-weather', 'hard-ground']}}), /one of the six/);
  bad(mod('travel.efficiency', 1, {applies: {terrain: ['lava']}}), /applies\.terrain/);
  bad(mod('travel.efficiency', 1, {applies: {terrain: []}}), /applies\.terrain/);
  bad(mod('travel.efficiency', 1, {applies: {terrain: ['road', 'road']}}), /at most once/);
  bad(mod('travel.actions', 1, {applies: {terrain: ['road']}}), /only for travel\.efficiency/);
  bad(mod('travel.actions', 1, {applies: {condition: 'harsh-weather'}}), /only for condition\.mitigation/);
  bad(mod('travel.actions', 1, {applies: {when: ['night']}}), /applies\.when/);
  bad(mod('travel.actions', 1, {applies: {weather: 'rain'}}), /applies\.weather/);
  bad(mod('travel.actions', 1, {applies: []}), /applies must be an object/);
  bad(mod('travel.actions', 1, {requires: {powers: ['POWER-X']}}), /unknown field/);
  bad(mod('travel.actions', 1, {op: 'multiply'}), /op must be "add"/);
  bad(mod('travel.actions', 1, {stack: 'Big Group'}), /stack/);
  bad({target: 'travel.actions', value: 1}, /label/);
  assert.match(validateModifiers([{index: 0, scope: 'cinder', modifier: mod('travel.actions', 1)}], {recordId: 'ITEM-TEST-A'}).errors.join(), /scope must be "travel"/);
  assert.match(check(mod('travel.actions', 1), 'ITEM-TEST-A').errors.concat(check(mod('travel.actions', 0), 'ITEM-TEST-B').errors).join(), /ITEM-TEST-B: modifiers\.list\[0\]/);
  assert.equal(check(mod('travel.actions', 1, {applies: {when: ['familiar_terrain']}})).warnings.length, 1);
});
test('api.modifiers has the contract shape Manager calls', () => {
  const api = createApi({version: '0.39.0', isGM: () => false, playerAccessEnabled: () => true});
  assert.equal(api.modifiers.contract, 'ag-modifier/1'); assert.equal(api.modifiers.scope, 'travel');
  assert.deepEqual(api.modifiers.targets, Object.keys(TARGETS));
  assert.deepEqual(api.modifiers.validate([{index: 0, scope: 'travel', modifier: mod('travel.actions', 1)}], {recordId: 'ITEM-TEST-A', record: {}}), {errors: [], warnings: []});
  assert.ok(api.modifiers.validate([{index: 0, scope: 'travel', modifier: mod('nope', 1)}], {recordId: 'ITEM-TEST-A'}).errors.length);
});

// ---- stacking and caps ----
const src = (name, mods, extra = {}) => ({name, character: extra.character ?? '[TEST] Ana', mountItem: false, inactive: null, modifiers: mods.map(m => blockModifiers({modifiers: {scope: 'travel', list: [m]}})[0]), ...extra});
const row = (res, key) => res.rows.find(r => r.key === key);

test('stacking: the highest value in a group counts, across the party; different groups add; caps apply', () => {
  const same = combine([src('A', [mod('travel.actions', 1)]), src('B', [mod('travel.actions', 2)], {character: '[TEST] Bo'})]);
  assert.equal(row(same, 'travel.actions').total, 2, 'same group (target + applies): best source only');
  assert.deepEqual(row(same, 'travel.actions').sources.map(s => s.counted), [false, true]);
  assert.match(row(same, 'travel.actions').sources[0].note, /B gives more/);
  const named = combine([src('A', [mod('travel.actions', 1, {stack: 'x'})]), src('B', [mod('travel.actions', 1, {stack: 'y'})])]);
  assert.equal(row(named, 'travel.actions').total, 2, 'different stack names add');
  const capped = combine([src('A', [mod('travel.actions', 2, {stack: 'x'})]), src('B', [mod('travel.actions', 2, {stack: 'y'})]), src('C', [mod('travel.actions', 1, {stack: 'z'})])]);
  assert.equal(row(capped, 'travel.actions').total, 2); assert.equal(row(capped, 'travel.actions').capped, true); assert.equal(capped.bonus.actions, 2);
  const sameName = combine([src('A', [mod('travel.actions', 1, {stack: 's'}), mod('explore.range', 1, {stack: 's'})]), src('B', [mod('travel.actions', 2, {stack: 's'})])]);
  assert.equal(row(sameName, 'travel.actions').total, 2); assert.equal(row(sameName, 'explore.range').total, 1, 'a stack name never crosses targets');
  const scout = combine([src('A', [mod('scout.precision', 2, {stack: 'a'})]), src('B', [mod('scout.precision', 2, {stack: 'b'})])]);
  assert.equal(scout.bonus.scout, 2);
  const explore = combine([src('A', [mod('explore.range', 1, {stack: 'a'})]), src('B', [mod('explore.range', 1, {stack: 'b'})]), src('C', [mod('explore.range', 1, {stack: 'c'})])]);
  assert.equal(explore.bonus.explore, 2);
});
test('travel.efficiency is per terrain and capped at +2 per terrain; condition.mitigation is per condition', () => {
  const res = combine([
    src('Boots', [mod('travel.efficiency', 1, {applies: {terrain: ['forest', 'hills']}})]),
    src('Staff', [mod('travel.efficiency', 1, {applies: {terrain: ['forest']}})]),
    src('Cloak', [mod('travel.efficiency', 1, {stack: 'c', applies: {terrain: ['forest']}}), mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]),
    src('Hat', [mod('travel.efficiency', 1), mod('condition.mitigation', 3, {applies: {condition: 'harsh-weather'}}), mod('condition.mitigation', 1, {applies: {condition: 'hard-ground'}})])]);
  assert.equal(row(res, 'travel.efficiency:forest').total, 2, 'capped'); assert.equal(row(res, 'travel.efficiency:forest').capped, true);
  assert.equal(row(res, 'travel.efficiency:hills').total, 2, 'Boots + the any-terrain Hat');
  assert.equal(row(res, 'travel.efficiency:*').total, 1);
  assert.equal(row(res, 'condition.mitigation:harsh-weather').total, 3, 'same group: highest only');
  assert.equal(row(res, 'condition.mitigation:hard-ground').total, 1);
});
test('condition.mitigation: party total per named condition is capped at +3 after stacking (0.38.0)', () => {
  const over = combine([src('Cloak', [mod('condition.mitigation', 2, {stack: 'a', applies: {condition: 'harsh-weather'}})]),
    src('Boots', [mod('condition.mitigation', 2, {stack: 'b', applies: {condition: 'harsh-weather'}})]),
    src('Hat', [mod('condition.mitigation', 1, {stack: 'a', applies: {condition: 'harsh-weather'}})])]);
  const r = row(over, 'condition.mitigation:harsh-weather');
  assert.equal(r.total, 3, 'groups a (2, best) + b (2) = 4, capped'); assert.equal(r.cap, 3); assert.equal(r.capped, true);
  const exact = combine([src('Cloak', [mod('condition.mitigation', 2, {stack: 'a', applies: {condition: 'harsh-weather'}})]), src('Boots', [mod('condition.mitigation', 1, {stack: 'b', applies: {condition: 'harsh-weather'}})])]);
  assert.equal(row(exact, 'condition.mitigation:harsh-weather').total, 3); assert.equal(row(exact, 'condition.mitigation:harsh-weather').capped, false, 'exactly 3 is not flagged');
  const two = combine([src('Cloak', [mod('condition.mitigation', 3, {stack: 'a', applies: {condition: 'harsh-weather'}}), mod('condition.mitigation', 3, {stack: 'a', applies: {condition: 'hard-ground'}})]),
    src('Boots', [mod('condition.mitigation', 2, {stack: 'b', applies: {condition: 'harsh-weather'}}), mod('condition.mitigation', 1, {stack: 'b', applies: {condition: 'hard-ground'}})])]);
  assert.equal(row(two, 'condition.mitigation:harsh-weather').total, 3); assert.equal(row(two, 'condition.mitigation:harsh-weather').capped, true);
  assert.equal(row(two, 'condition.mitigation:hard-ground').total, 3); assert.equal(row(two, 'condition.mitigation:hard-ground').capped, true, 'each condition has its own cap');
  assert.equal(row(two, 'condition.mitigation:harsh-weather').cap, 3);
});
test('counting: inactive (unequipped), Mounted switch, mount items and familiar terrain', () => {
  const sources = [src('Boots', [mod('travel.actions', 1)], {inactive: 'not equipped'}),
    src('Stirrups', [mod('travel.actions', 1, {stack: 'm', applies: {when: ['mounted']}})]),
    src('Mount saddlebag', [mod('explore.range', 1)], {mountItem: true}),
    src('Local lore', [mod('scout.precision', 1, {applies: {when: ['familiar_terrain']}})]),
    src('Both', [mod('scout.precision', 2, {stack: 'b', applies: {when: ['mounted', 'familiar_terrain']}})])];
  const off = combine(sources, {mounted: false}), on = combine(sources, {mounted: true});
  assert.deepEqual(off.bonus, {actions: 0, explore: 0, scout: 0});
  assert.match(row(off, 'travel.actions').sources[0].note, /not equipped/); assert.match(row(off, 'travel.actions').sources[1].note, /Mounted/);
  assert.deepEqual(on.bonus, {actions: 1, explore: 1, scout: 0});
  assert.match(row(on, 'scout.precision').sources[0].note, /your call/);
});

// ---- collecting sources from actors ----
const item = (id, mods, extra = {}) => ({id: `i-${id}`, name: `[TEST] ${id}`, type: extra.type ?? 'loot', system: {equipped: extra.equipped}, flags: {'ashen-gate-manager': {source: {sourceId: id, definition: {modifiers: {schema: 'ag-modifiers/0.1', scope: 'travel', list: mods}}}}}});
const actor = (name, items) => ({name, type: 'character', hasPlayerOwner: true, items});
test('collectSources: equipment must be equipped, perks and loot count on the character, other scopes and plain items are ignored', () => {
  const a = actor('[TEST] Ana', [item('ITEM-TEST-BOOTS', [mod('travel.actions', 1)], {type: 'equipment', equipped: false}), item('ITEM-TEST-HAT', [mod('explore.range', 1)], {type: 'equipment', equipped: true}),
    item('PERK-TEST-EYES', [mod('scout.precision', 1)], {type: 'feat'}), item('ITEM-TEST-LOOT', [mod('travel.actions', 1)]),
    {id: 'x', name: 'Plain', flags: {}}, item('ITEM-TEST-BAD', [mod('travel.actions', 9)]), item('ITEM-TEST-CIND', [{scope: 'cinder', target: 'push.cost', value: -1, label: 'x'}])]);
  const out = collectSources([a]);
  assert.deepEqual(out.map(s => [s.sourceId, s.inactive]), [['ITEM-TEST-BOOTS', 'not equipped'], ['ITEM-TEST-HAT', null], ['PERK-TEST-EYES', null], ['ITEM-TEST-LOOT', null]]);
  assert.equal(out[0].character, '[TEST] Ana');
});
test('collectSources: Hub mount items are marked and only count while Mounted; without the Hub they are just items on the character', () => {
  const a = actor('[TEST] Ana', [item('ITEM-TEST-SADDLE', [mod('travel.actions', 1)], {type: 'equipment', equipped: false}), item('PERK-TEST-RIDER', [mod('explore.range', 1)], {type: 'feat'})]);
  const withHub = collectSources([a], {mountItems: () => new Set(['i-ITEM-TEST-SADDLE'])});
  assert.deepEqual(withHub.map(s => [s.mountItem, s.inactive]), [[true, null], [false, null]]);
  assert.equal(combine(withHub, {mounted: false}).bonus.actions, 0); assert.equal(combine(withHub, {mounted: true}).bonus.actions, 1);
  const noHub = collectSources([a], {mountItems: null});
  assert.deepEqual(noHub.map(s => [s.mountItem, s.inactive]), [[false, 'not equipped'], [false, null]]);
  assert.equal(collectSources([a], {mountItems: () => { throw new Error('hub'); }}).length, 2, 'a throwing Hub falls back');
});
