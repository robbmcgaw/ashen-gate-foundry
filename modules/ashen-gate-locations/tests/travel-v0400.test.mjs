/** 0.40.0: location-aware conditions, daily vs persistent, the pure action calculator, the Action preview and the single atomic resolve.
 *  Mocked Foundry data; proves logic, markup and permission checks, not how the real window looks or behaves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../scripts/api.mjs';
import {createOverland, planMigration, normalizePublic} from '../scripts/overland.mjs';
import {CONDITION_IDS, normalizeOverlandConditions, effectiveLocationConditions} from '../scripts/overland-conditions.mjs';
import {calculateAction, mergeSeverities, pressureOf, partyNumbers, GUIDANCE} from '../scripts/overland-preview.mjs';
import {combine} from '../scripts/travel-modifiers.mjs';
import {collectSources} from '../scripts/overland.mjs';
import {travelHtml, previewCard} from '../scripts/overland-view.mjs';
import {normalizeLocation, publishable, exportPackage, importRecords, parseImport} from '../scripts/model.mjs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {writeAll, readViews, readAll} from '../scripts/store.mjs';

const mod = (target, value, extra = {}) => ({target, value, label: '[TEST] x', ...extra});
const item = (id, mods) => ({id: `i-${id}`, name: `[TEST] ${id}`, type: 'feat', flags: {'ashen-gate-manager': {source: {sourceId: id, definition: {modifiers: {schema: 'ag-modifiers/0.1', scope: 'travel', list: mods}}}}}});
const actor = items => ({name: '[TEST] Ana', type: 'character', hasPlayerOwner: true, items});
const partyOf = (...items) => combine(collectSources(items.length ? [actor(items)] : []), {mounted: false});
const sev = (o = {}) => ({...Object.fromEntries(CONDITION_IDS.map(id => [id, 0])), ...o});
const calc = (action, severities, extra = {}) => calculateAction({action, area: {id: 'LOC-TEST-A', name: '[TEST] A'}, severities: sev(severities), party: partyOf(), left: 3, ...extra});
const PIA = {id: 'p1', name: '[TEST] Pia', isGM: false, active: true};

// ---- the locations used throughout ----
const L = (id, name, extra = {}) => ({id, name, state: 'revealed', ...extra});
const LOCS = [
  L('LOC-TEST-REGION', '[TEST] Reach', {isRegion: true, overlandConditions: {'harsh-weather': 2, 'poor-visibility': 1}}),
  L('LOC-TEST-SUB', '[TEST] Low Reach', {isRegion: true, parentLocationId: 'LOC-TEST-REGION', overlandConditions: {'harsh-weather': 0, 'hard-ground': 3}}),
  L('LOC-TEST-TOWN', '[TEST] Town', {parentLocationId: 'LOC-TEST-SUB', type: 'Road'}),
  L('LOC-TEST-CAMP', '[TEST] Camp', {parentLocationId: 'LOC-TEST-REGION', active: true, type: 'Forest',
    beasts: [{label: '[TEST] Wolf', uuid: 'Actor.abc'}], hazards: [{name: '[TEST] Sinkhole', tableUuid: 'RollTable.xyz'}], rollTables: [{name: '[TEST] Omens', uuid: 'RollTable.omen'}], resources: [{label: '[TEST] Reeds', uuid: ''}]}),
  L('LOC-TEST-HIDDEN', '[TEST] Secret Vale', {state: 'hidden', overlandConditions: {'ashen-menace': 3}}),
  L('LOC-TEST-FAR', '[TEST] Far Marsh', {type: 'Marsh', overlandConditions: {'blight-taint': 2}})
];

// ---- 1. effective conditions ----
test('persistent conditions: the nearest level that sets one wins, an explicit 0 clears an inherited value, severities never add', () => {
  const town = effectiveLocationConditions('LOC-TEST-TOWN', LOCS);
  assert.deepEqual(town.severities, sev({'harsh-weather': 0, 'hard-ground': 3, 'poor-visibility': 1}));
  assert.equal(town.sources['harsh-weather'].id, 'LOC-TEST-SUB', 'the explicit 0 is the Low Reach\'s');
  assert.equal(town.sources['poor-visibility'].name, '[TEST] Reach');
  assert.equal(town.sources['ashen-menace'], null);
  const camp = effectiveLocationConditions('LOC-TEST-CAMP', LOCS);
  assert.deepEqual([camp.severities['harsh-weather'], camp.severities['hard-ground']], [2, 0], 'the Low Reach is a sibling, not an ancestor');
  assert.equal(effectiveLocationConditions('LOC-TEST-REGION', LOCS).severities['harsh-weather'], 2);
  // a nearer value replaces a farther one even when it is lower or higher; nothing is summed
  const chain = [L('LOC-TEST-R', 'R', {isRegion: true, overlandConditions: {'harsh-weather': 3}}), L('LOC-TEST-M', 'M', {isRegion: true, parentLocationId: 'LOC-TEST-R', overlandConditions: {'harsh-weather': 1}}),
    L('LOC-TEST-P', 'P', {parentLocationId: 'LOC-TEST-M'})];
  assert.equal(effectiveLocationConditions('LOC-TEST-P', chain).severities['harsh-weather'], 1);
  assert.deepEqual(effectiveLocationConditions('LOC-NOPE', LOCS).severities, sev());
  // a loop in the parents cannot hang it
  assert.doesNotThrow(() => effectiveLocationConditions('LOC-TEST-X', [L('LOC-TEST-X', 'X', {parentLocationId: 'LOC-TEST-Y', isRegion: true}), L('LOC-TEST-Y', 'Y', {parentLocationId: 'LOC-TEST-X', isRegion: true})]));
});
test('the stored shape is sparse, limited to the six ids and 0 to 3; odd values are dropped', () => {
  assert.deepEqual(normalizeOverlandConditions({'harsh-weather': 2, 'hard-ground': 0, 'ashen-menace': 9, bogus: 1, 'poor-visibility': 1.5, 'warped-paths': '2', 'blight-taint': -1}), {'harsh-weather': 2, 'hard-ground': 0, 'ashen-menace': 3}, 'a value over 3 is held at 3');
  assert.deepEqual(normalizeOverlandConditions(null), {}); assert.deepEqual(normalizeOverlandConditions([1, 2]), {});
});

// ---- Location field: GM only ----
test('Location field: kept on the GM record, omitted when empty, never published, exported only in the GM package, imported and kept on update', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', overlandConditions: {'harsh-weather': 2, 'hard-ground': 0, bogus: 3}});
  assert.deepEqual(loc.overlandConditions, {'harsh-weather': 2, 'hard-ground': 0});
  assert.ok(!('overlandConditions' in normalizeLocation({id: 'LOC-TEST-B', name: '[TEST] B'})), 'older records stay byte for byte what they were');
  assert.ok(!('overlandConditions' in normalizeLocation({id: 'LOC-TEST-B', name: 'B', overlandConditions: {}})));
  assert.ok(!('overlandConditions' in publishable(loc)) && !JSON.stringify(publishable(loc)).includes('harsh-weather'));
  const pkg = exportPackage([loc]);
  assert.deepEqual(pkg.records[0].location.overlandConditions, {'harsh-weather': 2, 'hard-ground': 0});
  const back = parseImport(structuredClone(pkg), []).created[0];
  assert.deepEqual(back.overlandConditions, loc.overlandConditions);
  const upd = importRecords([{id: 'LOC-TEST-A', entity_type: 'Location', location: {name: '[TEST] A2'}}], [loc], {mode: 'update'}).updated[0];
  assert.deepEqual(upd.overlandConditions, loc.overlandConditions, 'an update that leaves it out keeps the world\'s value');
  const cleared = importRecords([{id: 'LOC-TEST-A', entity_type: 'Location', location: {name: '[TEST] A2', overlandConditions: {}}}], [loc], {mode: 'update'}).updated[0];
  assert.ok(!('overlandConditions' in cleared), 'an explicit empty field clears it');
});
test('Location field: a player client\'s views and the player journal never hold it', async () => {
  const g = installFoundry(); g.user = gm;
  await writeAll([normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', state: 'revealed', overlandConditions: {'harsh-weather': 2}}),
    normalizeLocation({id: 'LOC-TEST-B', name: '[TEST] B', state: 'unidentified', overlandConditions: {'ashen-menace': 3}})]);
  assert.deepEqual(readAll().find(l => l.id === 'LOC-TEST-A').overlandConditions, {'harsh-weather': 2});
  const playerJournals = JSON.stringify(game.journal.filter(j => j.getFlag('ashen-gate-locations', 'role') === 'player-view'));
  assert.doesNotMatch(playerJournals, /overlandConditions|harsh-weather|ashen-menace/);
  g.user = player;
  assert.doesNotMatch(JSON.stringify(readViews()), /overlandConditions|harsh-weather|ashen-menace/);
  const api = createApi({version: 'x', isGM: () => false, playerAccessEnabled: () => true, readAll: () => { throw new Error('no'); }, readViews});
  assert.doesNotMatch(JSON.stringify(api.listLocations({includeUnidentified: true})), /overlandConditions|harsh-weather|ashen-menace/);
  assert.throws(() => api.exportPackage(), /GM/);
});

// ---- 4. the calculator ----
test('calculator: base costs and a quiet day', () => {
  for (const a of ['travel', 'scout', 'explore']) { const r = calc(a, {}); assert.equal(r.cost, 1, a); assert.equal(r.pressure.id, 'normal'); assert.deepEqual(r.conditions, []); assert.equal(r.blocked, undefined); }
  assert.equal(calc('explore', {}).rangeRings, 1); assert.equal(calc('scout', {}).precision, 0); assert.equal(calc('travel', {}).navigation, null);
  assert.throws(() => calc('fly', {}), /Unknown action/);
});
test('calculator: environmental cost caps at +1 in total, then mitigation and efficiency take it down, never below 1 or above 2', () => {
  assert.equal(calc('travel', {'harsh-weather': 2}).cost, 2);
  assert.equal(calc('travel', {'hard-ground': 2}).cost, 2);
  assert.equal(calc('travel', {'harsh-weather': 3, 'hard-ground': 3}).cost, 2, 'both together still +1');
  assert.equal(calc('travel', {'harsh-weather': 1, 'hard-ground': 1}).cost, 1, 'severity 1 adds nothing');
  assert.match(calc('travel', {'harsh-weather': 2, 'hard-ground': 2}).calculated.join(' '), /Harsh Weather 2 and Difficult Terrain 2.*at most 1 in total/);
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 1, {applies: {condition: 'harsh-weather'}})]);
  assert.equal(calc('travel', {'harsh-weather': 2}, {party: partyOf(cloak)}).cost, 1, 'mitigation against the contributing condition');
  assert.equal(calc('travel', {'hard-ground': 2}, {party: partyOf(cloak)}).cost, 2, 'mitigation against a different condition does nothing');
  assert.equal(calc('travel', {'harsh-weather': 3, 'hard-ground': 3}, {party: partyOf(item('PERK-TEST-BIG', [mod('condition.mitigation', 3, {applies: {condition: 'harsh-weather'}})]))}).cost, 1, 'never below 1');
  const boots = item('ITEM-TEST-BOOTS', [mod('travel.efficiency', 1, {applies: {terrain: ['marsh']}})]);
  assert.equal(calc('travel', {'hard-ground': 2}, {party: partyOf(boots), terrain: 'marsh'}).cost, 1, 'efficiency for the destination terrain');
  assert.equal(calc('travel', {'hard-ground': 2}, {party: partyOf(boots), terrain: 'road'}).cost, 2, 'not for another terrain');
  assert.equal(calc('travel', {}, {party: partyOf(boots), terrain: 'marsh'}).cost, 1, 'efficiency alone never goes below 1');
  const wide = item('ITEM-TEST-ALL', [mod('travel.efficiency', 1, {stack: 'a'}), mod('travel.efficiency', 1, {stack: 'b'})]);
  assert.equal(calc('travel', {'harsh-weather': 3}, {party: partyOf(wide, cloak), terrain: 'road'}).cost, 1);
});
test('calculator: Explore survey range', () => {
  const lens = item('ITEM-TEST-LENS', [mod('explore.range', 1, {stack: 'a'})]), lens2 = item('ITEM-TEST-LENS2', [mod('explore.range', 1, {stack: 'b'})]), lens3 = item('ITEM-TEST-LENS3', [mod('explore.range', 1, {stack: 'c'})]);
  assert.equal(calc('explore', {}, {party: partyOf(lens)}).rangeRings, 2);
  assert.equal(calc('explore', {}, {party: partyOf(lens, lens2, lens3)}).rangeRings, 3, 'the party bonus caps at +2');
  assert.equal(calc('explore', {'poor-visibility': 1}).rangeRings, 1);
  assert.equal(calc('explore', {'poor-visibility': 2}).rangeRings, 0);
  assert.equal(calc('explore', {'poor-visibility': 3}, {party: partyOf(lens)}).rangeRings, 0, 'minus 2 at severity 3, minimum 0');
  assert.equal(calc('explore', {'harsh-weather': 3}).rangeRings, 0);
  assert.equal(calc('explore', {'harsh-weather': 2}).rangeRings, 1);
  assert.equal(calc('explore', {'poor-visibility': 3, 'harsh-weather': 3}, {party: partyOf(lens, lens2)}).rangeRings, 0);
  const none = calc('explore', {'poor-visibility': 2});
  assert.match(none.calculated.join(' '), /current tile only; Explore still reveals useful local information/);
  assert.equal(none.cost, 1);
  // after mitigation
  const veil = item('PERK-TEST-VEIL', [mod('condition.mitigation', 1, {applies: {condition: 'poor-visibility'}})]);
  assert.equal(calc('explore', {'poor-visibility': 2}, {party: partyOf(veil)}).rangeRings, 1, 'severity 2 minus 1 mitigation is below the threshold');
});
test('calculator: Scout precision and navigation flags', () => {
  const eyes = item('ITEM-TEST-EYES', [mod('scout.precision', 2)]);
  assert.equal(calc('scout', {}, {party: partyOf(eyes)}).precision, 2);
  assert.equal(calc('scout', {'poor-visibility': 2}, {party: partyOf(eyes)}).precision, 1);
  assert.equal(calc('scout', {'poor-visibility': 2}).precision, 0, 'never below 0');
  const w2 = calc('scout', {'warped-paths': 2}, {party: partyOf(eyes)});
  assert.equal(w2.precision, 1, 'limited to at most 1'); assert.equal(w2.navigation.text, 'Navigation: uncertain');
  const w3 = calc('scout', {'warped-paths': 3}, {party: partyOf(eyes)});
  assert.equal(w3.navigation.text, 'Navigation: anomalous'); assert.equal(w3.precision, 1);
  assert.equal(calc('scout', {'warped-paths': 1}, {party: partyOf(eyes)}).navigation, null);
  assert.equal(calc('scout', {'warped-paths': 1}, {party: partyOf(eyes)}).precision, 2);
});
test('calculator: Travel flags possible displacement from Warped Paths 1', () => {
  assert.equal(calc('travel', {'warped-paths': 1}).navigation.text, 'Possible displacement: resolve before finalising the destination');
  assert.equal(calc('travel', {}).navigation, null);
  assert.equal(calc('travel', {'warped-paths': 1}).cost, 1, 'no cost penalty');
});
test('calculator: pressure labels come from the effective severities; mitigation never changes them', () => {
  const p = o => pressureOf(sev(o));
  assert.deepEqual([p({}), p({'blight-taint': 1}), p({'blight-taint': 2}), p({'ashen-menace': 1}), p({'ashen-menace': 1, 'blight-taint': 2}), p({'ashen-menace': 2}), p({'ashen-menace': 3}), p({'ashen-menace': 3, 'blight-taint': 3})],
    ['normal', 'normal', 'elevated', 'elevated', 'high', 'high', 'dominant', 'dominant']);
  const ward = item('PERK-TEST-WARD', [mod('condition.mitigation', 3, {applies: {condition: 'ashen-menace'}}), mod('condition.mitigation', 3, {applies: {condition: 'blight-taint'}, stack: 'z'})]);
  const r = calc('travel', {'ashen-menace': 2, 'blight-taint': 2}, {party: partyOf(ward)});
  assert.equal(r.pressure.id, 'high'); assert.equal(r.cost, 1, 'no default action penalty for either');
  assert.deepEqual(r.severities['ashen-menace'], 2, 'the location\'s condition is untouched');
  assert.deepEqual(r.conditions.map(c => [c.id, c.severity]), [['blight-taint', 2], ['ashen-menace', 2]]);
});
test('calculator: guidance lists exactly the listed effect types, only for the action and only when present; mitigation changes the wording for Blight and Menace only', () => {
  const g = calc('explore', {'harsh-weather': 1, 'blight-taint': 1}).guidance;
  assert.deepEqual(g, [`Harsh Weather: ${GUIDANCE['harsh-weather']}`, `Blight Taint: ${GUIDANCE['blight-taint']}`]);
  assert.equal(GUIDANCE['harsh-weather'], 'exposure, shelter, crossings, interrupted gathering.');
  assert.equal(GUIDANCE['hard-ground'], 'impassable routes, mount restrictions, difficult access.');
  assert.equal(GUIDANCE['poor-visibility'], 'reduced encounter warning, hidden hazards.');
  assert.equal(GUIDANCE['warped-paths'], 'shifting paths, uncertain destinations, magical shortcuts.');
  assert.deepEqual(calc('scout', {'harsh-weather': 3, 'hard-ground': 3}).guidance, [], 'not relevant to Scout');
  assert.ok(calc('travel', {'warped-paths': 1}).guidance[0].startsWith('Warped Paths: shifting paths'));
  const ward = item('PERK-TEST-WARD', [mod('condition.mitigation', 2, {applies: {condition: 'blight-taint'}})]);
  const r = calc('explore', {'blight-taint': 2}, {party: partyOf(ward)});
  assert.match(r.guidance[0], /The party is protected from Blight Taint; the area itself is unchanged\./); assert.doesNotMatch(r.guidance.join(), /reduced/i);
  assert.match(calc('travel', {'ashen-menace': 2}).guidance[0], /danger level per the pressure label \(High\)/);
});
test('calculator: blocked when the actions left are fewer than the cost; overrides replace one condition for that call only', () => {
  const r = calc('travel', {'harsh-weather': 2}, {left: 1});
  assert.equal(r.cost, 2); assert.match(r.blocked.reason, /costs 2 actions and only 1 is left/);
  assert.match(calc('scout', {}, {left: 0}).blocked.reason, /No actions are left today/);
  assert.equal(calc('scout', {}, {left: 1}).blocked, undefined);
  const base = sev({'harsh-weather': 2});
  const o = calculateAction({action: 'travel', severities: base, party: partyOf(), left: 3, override: {condition: 'harsh-weather', severity: 0}});
  assert.equal(o.cost, 1); assert.deepEqual(base, sev({'harsh-weather': 2}), 'the input is untouched');
  assert.match(o.calculated.join(' '), /GM override: Harsh Weather 0 for this action only/);
  assert.equal(calculateAction({action: 'explore', severities: base, party: partyOf(), override: {condition: 'poor-visibility', severity: 3}}).rangeRings, 0);
  assert.equal(calculateAction({action: 'travel', severities: base, party: partyOf(), override: {condition: 'bogus', severity: 3}}).cost, 2, 'an invalid override is ignored');
  assert.deepEqual(mergeSeverities({'harsh-weather': 2}, {'harsh-weather': 1, 'hard-ground': 3}), sev({'harsh-weather': 2, 'hard-ground': 3}), 'max, never added');
  assert.deepEqual(partyNumbers(partyOf()).mitigation['harsh-weather'], 0);
});

// ---- the service ----
function boot({actors = [], locations = LOCS, pub = {}, sec = {}} = {}) {
  const world = {pub, sec, announced: [], n: 0, locations};
  const make = isGM => createOverland({
    isGM: () => isGM, playerTravel: () => true, read: () => structuredClone(world.pub), write: async v => { world.pub = structuredClone(v); },
    readSecret: () => { if (!isGM) throw new Error('Only the GM can do that.'); return structuredClone(world.sec); },
    writeSecret: async v => { if (!isGM) throw new Error('Only the GM can do that.'); world.sec = structuredClone(v); },
    actors: () => actors, announce: async t => world.announced.push(t), id: () => `e${++world.n}`, locations: () => (isGM ? structuredClone(world.locations) : []),
    sendDeclare: async action => gmSvc.receiveDeclare(PIA, action)
  });
  const gmSvc = make(true), playerSvc = make(false);
  const apiFor = (svc, isGM) => createApi({version: '0.40.0', isGM: () => isGM, playerAccessEnabled: () => true, overland: svc});
  return {world, gmSvc, playerSvc, gmApi: apiFor(gmSvc, true), playerApi: apiFor(playerSvc, false)};
}

test('daily conditions overlay the places: effective = max(place, daily) per condition; per-area daily; New day clears only the daily ones', async () => {
  const {gmSvc, gmApi, world} = boot();
  await gmSvc.setArea('LOC-TEST-TOWN');
  let pv = gmApi.overland.previewAction({action: 'explore'});
  assert.equal(pv.area.id, 'LOC-TEST-TOWN');
  assert.deepEqual(pv.conditions.map(c => [c.id, c.severity]), [['hard-ground', 3], ['poor-visibility', 1]], 'persistent only');
  await gmSvc.setCondition('poor-visibility', 3);
  pv = gmApi.overland.previewAction({action: 'explore'});
  assert.equal(pv.severities['poor-visibility'], 3, 'daily 3 beats place 1');
  await gmSvc.setCondition('poor-visibility', 0); await gmSvc.setCondition('poor-visibility', 2, {scope: 'area'});
  assert.equal(gmApi.overland.previewAction({action: 'explore'}).severities['poor-visibility'], 2, 'an area-only daily value');
  await gmSvc.setArea('LOC-TEST-FAR');
  assert.equal(gmApi.overland.previewAction({action: 'explore'}).severities['poor-visibility'], 0, 'the area-only value stays with its area');
  await gmSvc.setCondition('harsh-weather', 1);
  assert.equal(gmApi.overland.previewAction({action: 'explore', area: 'LOC-TEST-TOWN'}).severities['harsh-weather'], 1, 'an all-areas value covers a place whose own value is 0');
  const st = await gmSvc.newDay();
  assert.deepEqual(st.conditions, sev()); assert.deepEqual(st.areaConditions, {});
  assert.equal(gmApi.overland.previewAction({action: 'explore', area: 'LOC-TEST-TOWN'}).severities['hard-ground'], 3, 'the place keeps its persistent condition');
  assert.equal(world.locations.find(l => l.id === 'LOC-TEST-TOWN').overlandConditions, undefined, 'daily values are never written onto a place');
  const bare = boot({locations: LOCS.map(l => ({...l, active: false}))});
  await assert.rejects(bare.gmSvc.setCondition('harsh-weather', 1, {scope: 'area'}), /Choose a current area/);
});
test('areas: the current area defaults to the place marked as where the party is, then the last area used; "Other area" uses only daily conditions and overrides', async () => {
  const {gmSvc, gmApi} = boot();
  assert.deepEqual([gmSvc.state().area.id, gmSvc.state().area.source], ['LOC-TEST-CAMP', 'marker']);
  assert.equal(gmApi.overland.previewAction({action: 'scout'}).area.name, '[TEST] Camp');
  await gmSvc.setArea('LOC-TEST-FAR');
  assert.deepEqual([gmSvc.state().area.id, gmSvc.state().area.source], ['LOC-TEST-FAR', 'chosen']);
  await assert.rejects(gmSvc.setArea('LOC-TEST-NOPE'), /not one of your/);
  await gmSvc.setCondition('hard-ground', 2);
  const to = gmApi.overland.previewAction({action: 'travel', destination: 'other'});
  assert.equal(to.destination.kind, 'other');
  assert.equal(to.severities['hard-ground'], 2, 'only the daily value');
  assert.equal(to.severities['blight-taint'], 2, 'the current area still counts for the rest');
  const dest = gmApi.overland.previewAction({action: 'travel', destination: 'LOC-TEST-SUB'});
  assert.equal(dest.severities['hard-ground'], 3, 'Difficult Terrain is the destination\'s'); assert.equal(dest.cost, 2);
  assert.equal(gmApi.overland.previewAction({action: 'travel', destination: 'LOC-TEST-CAMP'}).terrain, 'forest', 'terrain comes from the destination\'s type');
  assert.equal(gmApi.overland.previewAction({action: 'travel', destination: 'LOC-TEST-CAMP', terrain: 'road'}).terrain, 'road');
  assert.deepEqual(gmApi.overland.previewAction({action: 'travel', destination: 'LOC-TEST-CAMP'}).shortcuts.map(x => [x.kind, x.label, x.uuid]),
    [['beast', '[TEST] Wolf', 'Actor.abc'], ['hazard', '[TEST] Sinkhole', 'RollTable.xyz'], ['table', '[TEST] Omens', 'RollTable.omen'], ['resource', '[TEST] Reeds', '']]);
  assert.deepEqual(gmApi.overland.previewAction({action: 'scout', area: 'LOC-TEST-FAR'}).shortcuts, []);
  await assert.rejects(async () => gmApi.overland.previewAction({action: 'explore', area: 'other'}), /Choose a Location or Region/);
});
test('preview: the shape of the answer, and it spends nothing', async () => {
  const {gmApi, world, gmSvc} = boot();
  const pv = gmApi.overland.previewAction({action: 'travel', area: 'LOC-TEST-CAMP', destination: 'LOC-TEST-SUB'});
  assert.deepEqual(Object.keys(pv).sort(), ['action', 'area', 'baseCost', 'blocked', 'calculated', 'conditions', 'contract', 'cost', 'day', 'destination', 'guidance', 'left', 'navigation', 'override', 'precision', 'pressure', 'protectedFrom', 'rangeRings', 'requestUserId', 'severities', 'shortcuts', 'terrain', 'total']
    .filter(k => k !== 'blocked'));
  assert.deepEqual([pv.contract, pv.action, pv.cost, pv.day, pv.left, pv.total], ['ag-overland/1', 'travel', 2, 1, 3, 3]);
  assert.deepEqual(pv.area, {id: 'LOC-TEST-CAMP', name: '[TEST] Camp', kind: 'location'});
  assert.deepEqual(pv.pressure, {id: 'normal', label: 'Normal'});
  assert.deepEqual(world.pub, {}, 'nothing was written'); assert.equal(gmSvc.state().used, 0);
  await assert.rejects(async () => gmApi.overland.previewAction({action: 'fly'}), /Unknown action/);
});
test('resolve is one atomic step: spends the calculated cost, adds a card with the actual cost and area, clears the request, moves the area on Travel', async () => {
  const {gmApi, gmSvc, playerSvc, world} = boot();
  await gmSvc.setArea('LOC-TEST-CAMP');
  await playerSvc.declare('travel');
  const r = await gmApi.overland.resolveAction({action: 'travel', destination: 'LOC-TEST-SUB', text: 'Rain on the ridge.', requestUserId: 'p1'});
  assert.equal(r.cost, 2); assert.equal(r.area, '[TEST] Low Reach'); assert.equal(r.summary, 'Travel · [TEST] Low Reach · 2 actions');
  assert.deepEqual(r.entry, {id: 'e1', day: 1, kind: 'travel', text: 'Rain on the ridge.', by: '[TEST] Pia', cost: 2, area: '[TEST] Low Reach'});
  assert.deepEqual(Object.keys(r).sort(), ['action', 'area', 'contract', 'cost', 'entry', 'preview', 'state', 'summary']);
  assert.equal(r.state.used, 2); assert.equal(r.state.left, 1); assert.deepEqual(r.state.requests, []);
  assert.equal(r.state.area.id, 'LOC-TEST-SUB'); assert.equal(world.pub.area, '[TEST] Low Reach');
  assert.equal(world.pub.used, 2);
  // not enough left: refused, nothing changes
  const before = JSON.stringify({p: world.pub, s: world.sec});
  await assert.rejects(gmApi.overland.resolveAction({action: 'travel', destination: 'LOC-TEST-TOWN'}), /costs 2 actions and only 1 is left/);
  assert.equal(JSON.stringify({p: world.pub, s: world.sec}), before);
  await assert.rejects(gmApi.overland.resolveAction({action: 'travel', cost: 9}), /whole number from 0 to 5/);
  // scout at cost 1 works and uses the current area
  const s = await gmApi.overland.resolveAction({action: 'scout'});
  assert.deepEqual([s.cost, s.entry.area, s.state.left], [1, '[TEST] Low Reach', 0]);
});
test('resolve: Adjust cost, the destination actually reached, and the other-area destination', async () => {
  const {gmApi, gmSvc, world} = boot();
  await gmSvc.setArea('LOC-TEST-CAMP');
  const r = await gmApi.overland.resolveAction({action: 'travel', destination: 'LOC-TEST-FAR', reached: 'LOC-TEST-TOWN', cost: 3});
  assert.deepEqual([r.cost, r.entry.cost, r.entry.area, r.state.area.id, r.state.used], [3, 3, '[TEST] Town', 'LOC-TEST-TOWN', 3]);
  assert.equal(world.pub.journal[0].cost, 3);
  await gmSvc.newDay();
  const o = await gmApi.overland.resolveAction({action: 'travel', destination: 'other'});
  assert.equal(o.state.area.id, 'LOC-TEST-TOWN', 'an Other area destination leaves the current area as it was'); assert.equal(o.entry.area, undefined, 'and names no area on the card');
  const free = await gmApi.overland.resolveAction({action: 'explore', cost: 0});
  assert.deepEqual([free.cost, free.state.used], [0, 1]);
});
test('undo gives back the cost recorded on the card and the previous area', async () => {
  const {gmApi, gmSvc, world} = boot();
  await gmSvc.setArea('LOC-TEST-CAMP');
  await gmApi.overland.resolveAction({action: 'scout'});
  await gmApi.overland.resolveAction({action: 'travel', destination: 'LOC-TEST-SUB'});
  let st = gmSvc.state();
  assert.deepEqual([st.used, st.area.id], [3, 'LOC-TEST-SUB']);
  st = await gmSvc.undo();
  assert.deepEqual([st.used, st.area.id, st.journal.length], [1, 'LOC-TEST-CAMP', 1]);
  assert.equal(world.pub.area, '[TEST] Camp');
  st = await gmSvc.undo();
  assert.deepEqual([st.used, st.journal.length], [0, 0]);
  // a legacy card without a cost gives back one
  await gmSvc.act('travel'); assert.equal((await gmSvc.undo()).used, 0);
  // a cost of 3 comes back as 3
  await gmApi.overland.resolveAction({action: 'explore', cost: 3}); assert.equal((await gmSvc.undo()).used, 0);
  assert.equal(gmSvc.state().area.id, 'LOC-TEST-CAMP');
});
test('the announce line mentions the cost, never a condition', async () => {
  const {gmApi, gmSvc, world} = boot();
  await gmSvc.setAnnounce(true); await gmSvc.setCondition('harsh-weather', 3);
  await gmApi.overland.resolveAction({action: 'travel', destination: 'LOC-TEST-FAR'});
  assert.match(world.announced[0], /Travel: the party uses 2 travel actions \(1 left today\)/);
  assert.doesNotMatch(world.announced.join(), /Harsh|weather|severity|pressure|Reach|Marsh/i);
});
test('GM only: previewAction and resolveAction, areas, setArea and the daily scope refuse a player in the api and the service, and write nothing', async () => {
  const {gmSvc, playerSvc, playerApi, world} = boot();
  assert.throws(() => playerApi.overland.previewAction({action: 'scout'}), /Only the GM/);
  await assert.rejects(playerApi.overland.resolveAction({action: 'scout'}), /Only the GM/);
  assert.throws(() => playerSvc.previewAction({action: 'scout'}), /Only the GM/);
  for (const [fn, a, b] of [['resolveAction', {action: 'scout'}], ['setArea', 'LOC-TEST-FAR'], ['setCondition', 'harsh-weather', 2, {scope: 'area'}]]) {
    if (fn === 'setCondition') await assert.rejects(playerSvc.setCondition('harsh-weather', 2, {scope: 'area'}), /Only the GM/);
    else await assert.rejects(playerSvc[fn](a, b), /Only the GM/, fn);
  }
  assert.throws(() => playerSvc.areas(), /Only the GM/);
  assert.deepEqual(world.pub, {}); assert.deepEqual(world.sec, {});
  assert.equal(gmSvc.areas().length, LOCS.length);
});
test('no leaks: the public setting and every player read carry only day, actions, requests, journal and the area name', async () => {
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]);
  const {gmSvc, gmApi, playerSvc, playerApi, world} = boot({actors: [actor([cloak])]});
  await gmSvc.setCondition('ashen-menace', 3); await gmSvc.setCondition('harsh-weather', 3, {scope: 'all'}); await gmSvc.setArea('LOC-TEST-HIDDEN');
  await gmApi.overland.resolveAction({action: 'explore', text: 'Quiet.'});
  const secret = /severity|conditions|mounted|announce|guidance|mitigation|harsh|hard-ground|poor-visibility|warped|blight|ashen-menace|pressure|partyModifiers|rows|calculated/i;
  const payload = JSON.stringify(world.pub);
  assert.doesNotMatch(payload, secret, payload);
  assert.deepEqual(Object.keys(world.pub).sort(), ['area', 'day', 'journal', 'requests', 'total', 'used']);
  assert.equal(world.pub.area, 'Unknown area', 'a Hidden place is never named in the public state');
  assert.doesNotMatch(payload, /Secret Vale|LOC-/);
  assert.deepEqual(Object.keys(world.pub.journal[0]).sort(), ['area', 'by', 'cost', 'day', 'id', 'kind', 'text']);
  assert.doesNotMatch(JSON.stringify(playerApi.overland.publicState()), secret);
  assert.doesNotMatch(JSON.stringify(playerSvc.publicState()), /LOC-|areaRef|moves/);
  assert.match(JSON.stringify(world.sec), /LOC-TEST-HIDDEN/, 'the real area lives only in the GM-only store');
  // journal text is the GM's own words only
  assert.equal(world.pub.journal[0].text, 'Quiet.');
});
test('public area name: a Revealed place by name, an Unidentified one by its label', async () => {
  const locs = [L('LOC-TEST-U', '[TEST] Real Name', {state: 'unidentified', unidentifiedLabel: 'A dark smudge'}), L('LOC-TEST-R', '[TEST] Open', {})];
  const {gmSvc, gmApi, world} = boot({locations: locs});
  await gmApi.overland.resolveAction({action: 'scout', area: 'LOC-TEST-U'}); assert.equal(world.pub.area, 'A dark smudge'); assert.equal(world.pub.journal[0].area, 'A dark smudge');
  await gmSvc.setArea('LOC-TEST-R'); assert.equal(world.pub.area, '[TEST] Open');
  assert.deepEqual(normalizePublic({area: 'x'.repeat(200), journal: []}).area.length, 80);
});
test('migration of an older world: the new keys default and nothing else changes', () => {
  const plan = planMigration({day: 3, used: 1, journal: [{id: 'a', day: 3, kind: 'scout', text: '', by: null}]}, {conditions: {'harsh-weather': 1}});
  assert.equal(plan.public.area, ''); assert.equal(plan.public.journal[0].cost, undefined);
  assert.deepEqual([plan.secret.areaRef, plan.secret.moves, plan.secret.areaConditions], [null, [], {}]);
});

// ---- the preview card ----
const H = {esc: v => String(v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])), now: '',
  btn: (action, label, {kind = ''} = {}) => `<button type="button" class="ag-btn ${kind}" data-action="${action}">${label}</button>`};
test('Action preview card: header, three headline numbers, chips, Calculated, GM guidance, text box, one primary Resolve button', async () => {
  const {gmApi} = boot();
  const pv = gmApi.overland.previewAction({action: 'explore', area: 'LOC-TEST-REGION', override: {condition: 'poor-visibility', severity: 2}});
  const html = previewCard(pv, {text: 'a <b>'}, {...H, areas: []});
  assert.match(html, /<h3 id="agl-pv-h">Explore · \[TEST\] Reach<\/h3>/); assert.match(html, /Day 1 · 3 of 3 actions remaining/);
  assert.match(html, /<dt>Action cost<\/dt>/); assert.match(html, /<dt>Survey range<\/dt><dd><strong class="agl-pv__num">0 rings/); assert.match(html, /<dt>Pressure<\/dt>/);
  assert.match(html, /Poor Visibility 2<\/li>/); assert.match(html, /Harsh Weather 2<\/li>/);
  assert.match(html, /<strong>Calculated:<\/strong>.*current tile only/); assert.match(html, /<strong>GM guidance:<\/strong>.*reduced encounter warning/);
  assert.match(html, /<textarea id="agl-ov-text"[^>]*>a &lt;b&gt;<\/textarea>/);
  assert.equal((html.match(/ag-btn primary/g) ?? []).length, 1); assert.match(html, /data-action="ov-pv-resolve">Resolve Explore · 1 action<\/button>/);
  assert.match(html, /data-action="ov-pv-cancel"/); assert.match(html, /Adjust cost/); assert.match(html, /GM override/);
  assert.match(html, /GM only/);
  const adj = previewCard(pv, {cost: 2}, {...H}); assert.match(adj, /Resolve Explore · 2 actions/); assert.match(adj, /Calculated 1/);
  const blocked = previewCard({...pv, left: 0, blocked: {reason: 'No actions are left today. Start a New day, or adjudicate this one at the table.'}}, {}, H);
  assert.match(blocked, /<button type="button" disabled class="ag-btn primary"|disabled/); assert.match(blocked, /role="alert">No actions are left today/);
  const travel = previewCard(gmApi.overland.previewAction({action: 'travel', area: 'LOC-TEST-CAMP', destination: 'LOC-TEST-FAR'}), {}, {...H, areas: gmApi.overland.previewAction ? [{id: 'LOC-TEST-FAR', name: '[TEST] Far Marsh', kind: 'location'}] : []});
  assert.match(travel, /<dt>Destination<\/dt><dd><strong class="agl-pv__num">\[TEST\] Far Marsh/); assert.match(travel, /Other area \(use only daily conditions and overrides\)/);
  const warped = previewCard({...gmApi.overland.previewAction({action: 'travel', destination: 'other', override: {condition: 'warped-paths', severity: 1}})}, {}, {...H, areas: []});
  assert.match(warped, /Possible displacement: resolve before finalising the destination/); assert.match(warped, /Destination actually reached/);
  const shortcuts = previewCard(gmApi.overland.previewAction({action: 'explore', area: 'LOC-TEST-CAMP'}), {}, H);
  assert.match(shortcuts, /data-action="ov-open" data-uuid="Actor\.abc"/); assert.match(shortcuts, /nothing is rolled or awarded/);
});
test('Travel tab (GM): current area picker, daily conditions card, the preview first; a player\'s markup has none of it', async () => {
  const {gmSvc, gmApi, playerSvc} = boot();
  await gmSvc.setArea('LOC-TEST-TOWN');
  const state = gmSvc.state(), mods = gmSvc.partyModifiers(), areas = gmSvc.areas();
  const html = travelHtml({state, mods, gm: true, areas, preview: gmApi.overland.previewAction({action: 'scout'}), pv: {}}, H);
  assert.ok(html.indexOf('agl-pv') < html.indexOf('id="agl-ov-today"'), 'the preview comes first');
  assert.match(html, /<select id="agl-ov-area">.*<option value="LOC-TEST-TOWN" selected>\[TEST\] Town/s);
  assert.match(html, /Daily conditions: weather and temporary effects/); assert.match(html, /Apply to/); assert.match(html, /From|from \[TEST\] Reach|on this place/);
  assert.match(html, /data-action="ov-cond" data-cond="harsh-weather" data-sev="0" data-scope="all"/);
  assert.equal((html.match(/ag-btn primary/g) ?? []).length, 1, 'one primary in the view: Resolve');
  assert.match(html, /data-action="ov-newday"/); assert.doesNotMatch(html.match(/<button[^>]*data-action="ov-newday"/)[0], /primary/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /harsh-weather|LOC-TEST/);
  const noPreview = travelHtml({state, mods, gm: true, areas}, H);
  assert.match(noPreview, /class="ag-btn primary" data-action="ov-newday"|primary[^>]*data-action="ov-newday"/);
  const player = travelHtml({state: playerSvc.publicState(), gm: false, userId: 'p1'}, H);
  assert.doesNotMatch(player, /agl-pv|Current area|Daily conditions|ov-pv|ov-cond|<select|<textarea|Poor Visibility|pressure/i);
});
test('journal cards show the area and the cost, nothing else', async () => {
  const {gmApi, gmSvc, playerSvc} = boot();
  await gmSvc.setCondition('harsh-weather', 3);
  await gmApi.overland.resolveAction({action: 'travel', area: 'LOC-TEST-CAMP', destination: 'LOC-TEST-FAR', text: 'Mud.'});
  const html = travelHtml({state: playerSvc.publicState(), gm: false, userId: 'p1'}, H);
  assert.match(html, /<strong>Travel<\/strong> <span class="agl-hint">\[TEST\] Far Marsh<\/span> <span class="agl-hint">2 actions<\/span>/);
  assert.match(html, /The party is in \[TEST\] Far Marsh\./); assert.doesNotMatch(html, /harsh|Harsh|severity|Pressure/);
});
