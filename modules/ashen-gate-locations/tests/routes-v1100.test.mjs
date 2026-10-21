/** 1.10.0: routes between locations: model, discovery and per-player visibility, GM-only API, import/export.
 *  Mocked Foundry documents and permissions: this proves the logic and the data each user receives, not the live
 *  Foundry window or canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm} from '../scripts/store.mjs';
import {normalizeLocation, IMPORT_SCHEMA} from '../scripts/model.mjs';
import {normalizeRoute, legsOf, makeRouteId, routeVariantFor, routeView, routeAudiences, importRouteRecords, routeFromRecord, routeRecord, ROUTE_DEFAULTS, UNKNOWN_PATH} from '../scripts/routes.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };

async function world({access = true} = {}) {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const state = {access};
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '1.10.0', isGM: () => u.isGM, playerAccessEnabled: () => state.access, setPlayerAccess: async v => { state.access = v; },
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    routes: {readAll: () => as(u, readRoutes), writeAll: list => as(u, () => writeRoutes(list)), readViews: () => as(u, readRouteViews),
      usedIds: () => as(u, usedRouteIds), defaultLegKm}}));
  const mod = {version: '1.10.0', active: true, api: apis.get('gm')};
  g.modules = {get: id => id === MOD ? mod : null};
  const api = id => apis.get(id);
  const gm = api('gm');
  const harbor = await gm.saveLocation({name: '[TEST] Harbor'});
  const mill = await gm.saveLocation({name: '[TEST] Mill'});
  const vault = await gm.saveLocation({name: '[TEST] Sunken Vault'});
  await gm.setLocationState(harbor.id, 'revealed');
  await gm.setLocationState(mill.id, 'revealed');
  return {g, users, state, api, gm, mod, harbor, mill, vault, asUser: (id, fn) => { mod.api = apis.get(id); return as(users.get(id), fn); }};
}
const routeJournal = () => [...game.journal].find(j => j.getFlag(MOD, 'role') === 'route-view');

// ---------- model ----------
test('legs are distance ÷ leg length rounded up, with the world default when the route sets none', () => {
  assert.equal(legsOf(normalizeRoute({distanceKm: 30, legKm: 10}), 10), 3);
  assert.equal(legsOf(normalizeRoute({distanceKm: 31, legKm: 10}), 10), 4);
  assert.equal(legsOf(normalizeRoute({distanceKm: 1.1, legKm: 0.1}), 10), 11, 'no extra leg from floating-point error');
  assert.equal(legsOf(normalizeRoute({distanceKm: 4}), 10), 1, 'a short route is one leg');
  assert.equal(legsOf(normalizeRoute({distanceKm: 25}), 5), 5, 'world default leg length');
  assert.equal(legsOf(normalizeRoute({distanceKm: 25}), 'bad'), 5, 'bad setting falls back to the built-in 5 km default');
  assert.equal(legsOf(normalizeRoute({distanceKm: 25}), 10), 3, 'a world that saved 10 km keeps it');
  assert.equal(legsOf(normalizeRoute({}), 10), 0, 'no distance, no legs');
  const r = normalizeRoute({distanceKm: -4, legKm: 0, hazardBase: 140, state: 'nope'});
  assert.deepEqual([r.distanceKm, r.legKm, r.hazardBase, r.state], [0, null, ROUTE_DEFAULTS.hazardBase, 'unknown']);
  assert.deepEqual({...ROUTE_DEFAULTS}, {legKm: 5, hazardBase: 5}, 'shipped defaults: 5 km legs, 5% base hazard');
  assert.equal(normalizeRoute({hazardBase: 10}).hazardBase, 10, 'a saved base chance stays');
  assert.equal(normalizeRoute({hazardBase: 0}).hazardBase, 0);
});

test('route ids come from the endpoints and are never reissued', () => {
  assert.equal(makeRouteId('LOC-TEST-HARBOR', 'LOC-TEST-MILL'), 'RTE-TEST-HARBOR-TEST-MILL');
  assert.equal(makeRouteId('LOC-TEST-HARBOR', 'LOC-TEST-MILL', ['RTE-TEST-HARBOR-TEST-MILL']), 'RTE-TEST-HARBOR-TEST-MILL-2');
});

test('a route reaches a player only when discovered, both ends are visible to them, and they are in its audience', () => {
  const loc = (id, state, extra = {}) => normalizeLocation({id, name: `[TEST] ${id}`, state, ...extra});
  const byId = new Map([loc('LOC-A', 'revealed'), loc('LOC-B', 'unidentified', {unidentifiedLabel: 'Strange ruin'}), loc('LOC-C', 'hidden'),
    loc('LOC-D', 'revealed', {audience: {mode: 'selected', userIds: ['p1']}})].map(l => [l.id, l]));
  const base = {id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 20, state: 'known'};
  assert.equal(routeVariantFor({...base, state: 'unknown'}, byId, 'p1'), null, 'unknown routes are never sent');
  assert.equal(routeVariantFor(base, byId, 'p1'), 'full');
  const full = routeView(base, byId, 'full', {defaultLegKm: 10});
  assert.deepEqual(full.to, {key: byId.get('LOC-B').pinKey, name: 'Strange ruin'}, 'an unidentified end shows its label, no id or name');
  assert.equal(full.legs, 2);
  for (const k of ['id', 'hazardBase', 'hazardTable', 'notes', 'audience']) assert.equal(k in full, false, `no ${k} for players`);
  const toHidden = {...base, id: 'RTE-A-C', toId: 'LOC-C'};
  assert.equal(routeVariantFor(toHidden, byId, 'p1'), null, 'a hidden end hides the route');
  assert.equal(routeVariantFor({...toHidden, unknownPath: true}, byId, 'p1'), 'from', 'unless the GM chooses "Unknown path"');
  const partial = routeView({...toHidden, unknownPath: true, name: 'Road to [TEST] LOC-C', terrain: 'Secret causeway'}, byId, 'from');
  assert.equal(partial.name, UNKNOWN_PATH);
  assert.equal(JSON.stringify(partial).includes('LOC-C'), false, 'nothing of the hidden end, not even the route name');
  assert.equal(JSON.stringify(partial).includes(byId.get('LOC-C').pinKey), false);
  assert.equal(JSON.stringify(partial).includes('causeway'), false);
  const selectedEnd = {...base, id: 'RTE-A-D', toId: 'LOC-D'};
  assert.equal(routeVariantFor(selectedEnd, byId, 'p1'), 'full');
  assert.equal(routeVariantFor(selectedEnd, byId, 'p2'), null, "p2 can't see LOC-D, so not the route");
  assert.equal(routeVariantFor({...base, audience: {mode: 'selected', userIds: ['p2']}}, byId, 'p1'), null, "the route's own audience");
  assert.deepEqual(routeAudiences({...selectedEnd, unknownPath: true}, byId, ['p1', 'p2']).map(g => [g.variant, g.userIds]), [['full', ['p1']], ['from', ['p2']]]);
});

// ---------- store + API ----------
test('GM creates a route: new routes start Unknown, players get no page until it is discovered', async () => {
  const {gm, api, harbor, mill, asUser} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 32, legKm: 8, hazardBase: 15, terrain: 'Coast road', notes: '[TEST] ambush planned', state: 'explored'});
  assert.equal(r.id, 'RTE-TEST-HARBOR-TEST-MILL');
  assert.equal(r.state, 'unknown', 'a new route always starts Unknown');
  assert.equal(r.legs, 4);
  assert.equal(routeJournal(), undefined, 'no player journal while nothing is discovered');
  assert.deepEqual(asUser('p1', () => api('p1').listRoutes()), []);
  await gm.setRouteState(r.id, 'known');
  const views = asUser('p1', () => api('p1').listRoutes());
  assert.equal(views.length, 1);
  assert.equal(views[0].name, '');
  assert.equal(views[0].from.name, '[TEST] Harbor');
  assert.equal(views[0].legs, 4);
  const pages = JSON.stringify(routeJournal().pages);
  assert.doesNotMatch(pages, /RTE-|ambush|hazard/i, 'player pages carry no id, GM notes or hazard data');
  assert.deepEqual(routeJournal().pages.map(p => p.name), ['Route'], 'pages are named generically');
  const again = await gm.saveRoute({...r, distanceKm: 40, state: 'unknown'});
  assert.equal(again.state, 'known', 'Save keeps the discovery state');
  assert.equal(asUser('p1', () => api('p1').listRoutes())[0].legs, 5, 'players see the saved change');
  assert.deepEqual(asUser('p1', () => api('p1').listRoutes({locationId: mill.id})).length, 1, 'by revealed location id');
});

test('hiding an endpoint withdraws the route from players at once; unknown path only names the visible end', async () => {
  const {gm, api, harbor, mill, vault, asUser} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10});
  await gm.setRouteState(r.id, 'rumoured');
  assert.equal(asUser('p1', () => api('p1').listRoutes()).length, 1);
  await gm.setLocationState(mill.id, 'hidden');
  assert.deepEqual(asUser('p1', () => api('p1').listRoutes()), [], 'gone as soon as the location changes');
  assert.equal(routeJournal().pages.length, 0, 'its page is deleted, not just closed');
  const v = await gm.saveRoute({fromId: harbor.id, toId: vault.id, distanceKm: 12, unknownPath: true, name: 'To [TEST] Sunken Vault'});
  await gm.setRouteState(v.id, 'known');
  const seen = asUser('p1', () => api('p1').listRoutes());
  assert.deepEqual(seen.map(x => [x.name, x.from?.name, x.to]), [[UNKNOWN_PATH, '[TEST] Harbor', undefined]]);
  assert.doesNotMatch(JSON.stringify(routeJournal().pages), /Sunken|Vault/, 'the hidden place name never reaches a player page');
});

test('selected-player routes give each player only their own version', async () => {
  const {gm, api, harbor, mill, asUser} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10});
  await gm.setRouteState(r.id, 'known');
  await gm.setRouteAudience(r.id, {mode: 'selected', userIds: ['p2']});
  assert.deepEqual(asUser('p1', () => api('p1').listRoutes()), []);
  assert.equal(asUser('p2', () => api('p2').listRoutes()).length, 1);
  await assert.rejects(() => gm.setRouteAudience(r.id, {mode: 'selected', userIds: ['nobody']}), /Not a player/);
});

test('every route write is GM-only in the API itself', async () => {
  const {gm, api, harbor, mill, asUser} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10});
  const p = api('p1');
  await asUser('p1', async () => {
    for (const call of [() => p.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 5}), () => p.setRouteState(r.id, 'known'), () => p.deleteRoute(r.id),
      () => p.setRouteAudience(r.id, {mode: 'everyone'}), () => p.importRoutes([])])
      await assert.rejects(call, /Only the GM/);
    assert.equal(p.getRoute(r.id), null, 'players cannot read a route by its id');
  });
});

test('Save refuses a route with a missing or repeated endpoint or no distance', async () => {
  const {gm, harbor} = await world();
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, toId: 'LOC-NOWHERE', distanceKm: 5}), /To: no location LOC-NOWHERE/);
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, toId: harbor.id, distanceKm: 5}), /two different locations/);
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, distanceKm: 0}), /Choose where the route ends.*Distance must be from 0.01 to 100000 km/);
  await assert.rejects(() => gm.saveRoute({id: 'RTE-NOPE', fromId: harbor.id, toId: harbor.id}), /No route RTE-NOPE/);
});

test('a deleted route id is never reused, by Save or by import', async () => {
  const {gm, harbor, mill} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10});
  await gm.deleteRoute(r.id);
  const next = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10});
  assert.equal(next.id, `${r.id}-2`);
  const rep = await gm.importRoutes([{id: r.id, entity_type: 'Route', route: {from_location_id: harbor.id, to_location_id: mill.id, distance_km: 3}}]);
  assert.match(rep.skipped[0].reason, /deleted route/);
});

// ---------- import ----------
const rec = (id, route, extra = {}) => ({id, entity_type: 'Route', status: 'approved', version: '1.0.0', refs: [], ...extra, route});

test('Route import validation: missing endpoint, duplicate id, bad numbers and bad state are reported per record', () => {
  const ids = ['LOC-A', 'LOC-B'];
  const r = importRouteRecords([
    rec('RTE-OK', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 12, leg_km: 4, hazard_base_percent: 5, hazard_table: 'RollTable.abc123', terrain: 'Hills'}),
    rec('RTE-OK', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 12}),
    rec('RTE-MISSING', {from_location_id: 'LOC-A', to_location_id: 'LOC-Z', distance_km: 12}),
    rec('RTE-SAME', {from_location_id: 'LOC-A', to_location_id: 'LOC-A', distance_km: 12}),
    rec('RTE-NODIST', {from_location_id: 'LOC-A', to_location_id: 'LOC-B'}),
    rec('RTE-BADNUM', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: '12', leg_km: -1, hazard_base_percent: 120}),
    rec('RTE-BADSTATE', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 1, discovery_state: 'secret'}),
    rec('route-lower', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 1}),
    {id: 'LOC-C', entity_type: 'Location'}
  ], [], ids);
  assert.deepEqual(r.created.map(x => x.id), ['RTE-OK']);
  assert.deepEqual(r.created[0].hazardTable, {uuid: 'RollTable.abc123', name: ''});
  assert.equal(r.created[0].state, 'unknown', 'discovery defaults to unknown');
  const why = Object.fromEntries(r.skipped.map(s => [s.id, s.reason]));
  assert.match(why['RTE-MISSING'], /Endpoint not found: LOC-Z/);
  assert.match(why['RTE-SAME'], /must differ/);
  assert.match(why['RTE-NODIST'], /distance_km is required/);
  assert.match(why['RTE-BADNUM'], /distance_km must be a number.*leg_km.*hazard_base_percent/);
  assert.match(why['RTE-BADSTATE'], /discovery_state/);
  assert.match(why['route-lower'], /RTE-NAME/);
  assert.match(why['LOC-C'], /Not a Route/);
  assert.equal(r.skipped.filter(s => s.id === 'RTE-OK').length, 1, 'the duplicate is skipped, the first kept');
  assert.equal(routeFromRecord(rec('RTE-X', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 1, hazard_table: 'Coast Hazards'})).route.hazardTable.name, 'Coast Hazards');
});

test('Route import update keeps discovery, audience and fields the record leaves out; skip keeps everything', () => {
  const old = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 10, terrain: 'Moor', state: 'explored', unknownPath: true,
    audience: {mode: 'selected', userIds: ['p1']}, notes: 'GM'});
  const incoming = [rec('RTE-A-B', {from_location_id: 'LOC-A', to_location_id: 'LOC-B', distance_km: 14, discovery_state: 'unknown'})];
  const up = importRouteRecords(incoming, [old], ['LOC-A', 'LOC-B'], {mode: 'update'});
  const u = up.updated[0];
  assert.deepEqual([u.distanceKm, u.state, u.unknownPath, u.audience.userIds, u.viewKey, u.terrain, u.notes], [14, 'explored', true, ['p1'], old.viewKey, 'Moor', 'GM']);
  const skip = importRouteRecords(incoming, [old], ['LOC-A', 'LOC-B']);
  assert.deepEqual([skip.updated.length, skip.created.length, skip.skipped[0].reason], [0, 0, 'Already exists; kept unchanged.']);
  assert.throws(() => importRouteRecords([], [], [], {mode: 'replace'}), /Unknown import mode/);
});

test('one package: routes import after the locations they join; export → import round trip', async () => {
  const {gm, harbor, mill} = await world();
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 18, legKm: 6, hazardBase: 20, terrain: 'Ford', name: '[TEST] Ford Road'});
  await gm.setRouteState(r.id, 'known');
  const pkg = gm.exportPackage();
  assert.equal(pkg.manifest.schema_version, IMPORT_SCHEMA);
  const routeRec = pkg.records.find(x => x.entity_type === 'Route');
  assert.deepEqual(routeRec.refs.map(x => x.target_id), [harbor.id, mill.id]);
  assert.equal(routeRec.route.leg_km, 6);
  // A fresh world: the package's own locations exist by the time its routes are read, whatever the record order.
  const w2 = await world();
  for (const l of [...w2.gm.listLocations()]) await w2.gm.deleteLocation(l.id);
  const reordered = {...pkg, records: [routeRec, ...pkg.records.filter(x => x !== routeRec)]};
  const res = await w2.gm.importPackage(reordered);
  assert.deepEqual(res.routes.created, [r.id]);
  const back = w2.gm.getRoute(r.id);
  assert.deepEqual([back.name, back.distanceKm, back.legKm, back.hazardBase, back.terrain, back.state], ['[TEST] Ford Road', 18, 6, 20, 'Ford', 'known'],
    'a new route takes the exported state');
  const again = await w2.gm.importPackage(reordered);
  assert.deepEqual([again.routes.created, again.routes.skipped], [[], [r.id]], 're-import keeps the existing route');
});

// ---------- window ----------
test('Routes tab: GM editor and list; players see only discovered routes, read-only', async () => {
  const w = await world();
  const r = await w.gm.saveRoute({fromId: w.harbor.id, toId: w.mill.id, distanceKm: 20, notes: '[TEST] GM-only note'});
  await w.gm.saveRoute({fromId: w.harbor.id, toId: w.vault.id, distanceKm: 9, name: 'Secret [TEST] Sunken Vault road'});
  game.tables = [{uuid: 'RollTable.t1', name: '[TEST] Coast Hazards'}];
  const app = new LocationsApp();
  app.tab = 'routes';
  const html = await app._renderHTML();
  assert.match(html, /data-tab="routes"/);
  assert.match(html, /New route/);
  assert.match(html, /\[TEST\] Coast Hazards/);
  assert.match(html, /data-rbind="fromId"/);
  assert.match(html, /Delete Route|route-delete/);
  assert.match(html, /Save Changes/);
  assert.doesNotMatch(html, /data-rbind="id"/, 'the id is never typed');
  await w.gm.setRouteState(r.id, 'known');
  const html2 = await w.asUser('p1', () => new LocationsApp()._renderHTML());
  assert.equal(html2.includes('data-tab="routes"'), true);
  const papp = w.asUser('p1', () => { const a = new LocationsApp(); a.tab = 'routes'; return a; });
  const ph = await w.asUser('p1', () => papp._renderHTML());
  assert.match(ph, /\[TEST\] Harbor/);
  assert.match(ph, /20 km · 4 legs/);
  assert.doesNotMatch(ph, /Sunken|GM-only note|RTE-|New route|route-new|data-rbind/);
  w.mod.api = w.gm;
});
