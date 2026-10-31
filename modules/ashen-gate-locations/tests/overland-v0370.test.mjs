/** 0.37.0: the `travel` modifier scope and light overland travel. Mocked Foundry data; proves logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../scripts/api.mjs';
import {validateModifiers, combine, blockModifiers, TARGETS, TERRAINS, CONDITIONS} from '../scripts/travel-modifiers.mjs';
import {createOverland, collectSources, normalizeState, spend, undo, newDay, BASE_ACTIONS} from '../scripts/overland.mjs';
import {overlandHtml} from '../scripts/overland-view.mjs';

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
  const api = createApi({version: '0.38.0', isGM: () => false, playerAccessEnabled: () => true});
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

// ---- state ----
test('state: normalisation, spend, undo, new day', () => {
  assert.deepEqual(normalizeState(null), {day: 1, used: 0, mounted: false, announce: false, conditions: {'harsh-weather': 0, 'hard-ground': 0, 'poor-visibility': 0, 'warped-paths': 0, 'blight-taint': 0, 'ashen-menace': 0}, log: []});
  assert.equal(normalizeState({day: -4, used: 'x', log: [{kind: 'fly', day: 1}, {kind: 'scout', day: 2}]}).log.length, 1);
  let s = normalizeState({});
  s = spend(s, 'travel', 0); s = spend(s, 'scout', 0); s = spend(s, 'explore', 0);
  assert.equal(s.used, 3); assert.throws(() => spend(s, 'travel', 0), /No overland actions left/);
  assert.equal(spend(s, 'travel', 1).used, 4, 'a bonus action allows one more');
  assert.equal(undo(s).used, 2); assert.throws(() => undo(normalizeState({})), /Nothing to undo/);
  const next = newDay(s); assert.equal(next.day, 2); assert.equal(next.used, 0); assert.equal(next.log.length, 3);
  assert.throws(() => undo(next), /Nothing to undo today/);
  assert.throws(() => spend(s, 'rest', 0), /Unknown/);
  assert.equal(BASE_ACTIONS, 3);
});

// ---- service and API: GM only ----
function boot({gm = true, actors = [], announced = []} = {}) {
  const box = {gm, store: {}, writes: 0};
  const service = createOverland({isGM: () => box.gm, read: () => box.store, write: async v => { box.store = structuredClone(v); box.writes++; }, actors: () => actors, announce: async t => announced.push(t)});
  const api = createApi({version: '0.38.0', isGM: () => box.gm, playerAccessEnabled: () => true, overland: service});
  return {box, service, api};
}
test('GM only: the API and the service refuse players, and nothing is written', async () => {
  const {box, service, api} = boot({gm: false});
  assert.throws(() => api.overland.state(), /Only the GM/); assert.throws(() => api.overland.partyModifiers(), /Only the GM/);
  for (const [fn, arg, arg2] of [['act', 'travel'], ['undo'], ['newDay'], ['setMounted', true], ['setAnnounce', true], ['setCondition', 'harsh-weather', 1]]) await assert.rejects(service[fn](arg, arg2), /Only the GM/, fn);
  assert.equal(box.writes, 0); assert.equal(Object.isFrozen(api.overland), true);
  assert.deepEqual(Object.keys(api.overland).sort(), ['contract', 'partyModifiers', 'state']);
  const noService = createApi({version: '0.38.0', isGM: () => true, playerAccessEnabled: () => true});
  assert.throws(() => noService.overland.state(), /unavailable/);
});
test('service: day and actions, Y includes the capped party bonus, Undo and New day', async () => {
  const flask = item('ITEM-TEST-FLASK', [mod('travel.actions', 2, {stack: 'a'})]), charm = item('ITEM-TEST-CHARM', [mod('travel.actions', 2, {stack: 'b'})]), tonic = item('ITEM-TEST-TONIC', [mod('travel.actions', 1, {stack: 'c'})]);
  const {api, service, box} = boot({actors: [actor('[TEST] Ana', [flask, charm, tonic])]});
  let st = api.overland.state();
  assert.equal(st.total, 5, '3 + capped +2'); assert.equal(st.left, 5); assert.equal(st.day, 1); assert.equal(st.contract, 'ag-overland/1');
  st = await service.act('travel'); assert.equal(st.left, 4); assert.deepEqual(st.log.map(l => l.text), ['Day 1: Travel']);
  await service.act('scout'); await service.act('explore');
  st = await service.undo(); assert.equal(st.left, 3); assert.equal(st.log.length, 2);
  st = await service.newDay(); assert.equal(st.day, 2); assert.equal(st.left, 5);
  await service.setMounted(true); assert.equal(api.overland.state().mounted, true);
  assert.equal(box.store.day, 2); assert.equal(box.store.mounted, true);
  const pm = api.overland.partyModifiers(); assert.equal(pm.bonus.actions, 2); assert.equal(pm.rows[0].capped, true); assert.equal(pm.ladder.length, 3);
  pm.rows[0].total = 99; assert.equal(api.overland.partyModifiers().rows[0].total, 2, 'a copy');
  for (let i = 0; i < 5; i++) await service.act('travel');
  await assert.rejects(service.act('travel'), /No overland actions left/);
});
test('service: Announce to players posts one short line per action, only when on', async () => {
  const announced = [], {service} = boot({announced});
  await service.act('travel'); assert.equal(announced.length, 0);
  await service.setAnnounce(true); await service.act('scout');
  assert.equal(announced.length, 1); assert.match(announced[0], /Scout/); assert.doesNotMatch(announced[0], /LOC-|ITEM-/);
});

// ---- the tab ----
const h = {esc: v => String(v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])), tip: () => '', now: '<span>Applies now</span>',
  btn: (action, label, {kind = ''} = {}) => `<button type="button" class="ag-btn ${kind}" data-action="${action}">${label}</button>`};
test('Overland tab: day, actions left, three actions, one primary, footer, empty state, sources and ladder', async () => {
  const {service} = boot({actors: []});
  let html = overlandHtml(service.state(), service.partyModifiers(), h);
  assert.match(html, /Day 1/); assert.match(html, /Actions left 3 of 3/);
  for (const a of ['ov-travel', 'ov-scout', 'ov-explore', 'ov-undo', 'ov-newday']) assert.match(html, new RegExp(`data-action="${a}"`));
  assert.equal((html.match(/ag-btn primary/g) ?? []).length, 1, 'one primary: New day…'); assert.match(html, /New day…/);
  assert.match(html, /<footer class="ag-footer">/); assert.match(html, /No travel modifiers yet/); assert.match(html, /Applies now/);
  assert.match(html, /Announce to players/); assert.match(html, /id="agl-ov-announce" >/); assert.match(html, /named landmark or route/);
  assert.doesNotMatch(html, /\b(Alpha|Beta|Preview|Experimental)\b/); assert.doesNotMatch(html, /travel\.actions|ITEM-|PERK-/);
  const a = actor('[TEST] Ana', [item('ITEM-TEST-BOOTS', [mod('travel.efficiency', 1, {applies: {terrain: ['forest']}})], {type: 'equipment', equipped: true}), item('PERK-TEST-X', [mod('condition.mitigation', 1, {applies: {condition: 'warped-paths'}})], {type: 'feat'})]);
  const b = boot({actors: [a]}); await b.service.act('travel');
  html = overlandHtml(b.service.state(), b.service.partyModifiers(), h);
  assert.match(html, /Actions left 2 of 3/); assert.match(html, /Day 1: Travel/); assert.match(html, /Travel efficiency: Forest/); assert.match(html, /Condition mitigation: Warped Paths/);
  assert.match(html, /\[TEST\] ITEM-TEST-BOOTS|\[TEST\] Ana/); assert.match(html, /Up to \+2/); assert.match(html, /Up to \+3/);
});

// ---- the window: the tab is GM only and last-but-one ----
test('window: Overland is a GM-only tab before GM Setup; a player never gets it, even by setting the tab', async () => {
  const {installFoundry, player} = await import('./foundry-mock.mjs');
  const {readAll, writeAll, readViews, placeNote} = await import('../scripts/store.mjs');
  const {useOverland} = await import('../scripts/overland.mjs');
  globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
  globalThis.CSS ??= {escape: v => String(v)};
  const {LocationsApp} = await import('../scripts/app.mjs');
  const game = installFoundry();
  const service = createOverland({isGM: () => game.user.isGM, read: () => ({}), write: async () => {}, actors: () => []});
  useOverland(service);
  const m = {version: '0.38.0', active: true};
  m.api = createApi({version: '0.38.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open() {}, openLocation() {}, overland: service});
  game.modules = {get: id => id === 'ashen-gate-locations' ? m : null};
  globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
  const gmApp = new LocationsApp(); gmApp.render = async () => {}; gmApp.tab = 'overland';
  const html = await gmApp._renderHTML();
  const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map(x => x[1]);
  assert.deepEqual(tabs, ['locations', 'overland', 'setup']); assert.match(html, /ag-tab--gm/);
  assert.match(html, /Actions left 3 of 3/); assert.doesNotMatch(html, /agl-setup__body[^]*Player Access[^]*Actions left/);
  game.user = player;
  const playerApp = new LocationsApp(); playerApp.render = async () => {}; playerApp.tab = 'overland';
  const p = await playerApp._renderHTML();
  assert.doesNotMatch(p, /Overland|Actions left|data-tab="overland"/);
});
