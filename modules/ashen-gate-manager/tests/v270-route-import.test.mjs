/** 0.27.0: Route records (Locations 1.10.0+) through Manager's import: validation, order after locations,
 *  update keeping play state, ZIP order, Browse/export. Uses the real Locations API over an in-memory store and
 *  mirrors #preview / #apply in main.js; proves the logic, not the live Manager window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/vendor/jszip.min.js';
import {validatePackage} from '../scripts/core.js';
import {dependencyOrder} from '../scripts/workflows.js';
import {isLocationRecord, planLocation, applyLocations, isRouteRecord, routesApi, planRoute, routesNote, applyRoutes, withLocationIds, routeEnds} from '../scripts/location-handoff.js';
import {readImportBundle} from '../scripts/zip-import.js';
import {collectModuleSections} from '../scripts/world-export.js';
import {buildImportReport} from '../scripts/import-result.js';
import {createApi} from '../../ashen-gate-locations/scripts/api.mjs';
import {playerView} from '../../ashen-gate-locations/scripts/model.mjs';

/** The real Locations API (1.10.0+) over memory, as Locations wires it in Foundry. */
function locations({stored = [], routes = []} = {}) {
  const state = {stored, routes, used: routes.map(r => r.id)};
  const api = createApi({
    version: 'test', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(state.stored), writeAll: async list => { state.stored = list; },
    readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async () => ({}), open: () => {}, openLocation: () => {},
    routes: {readAll: () => structuredClone(state.routes), writeAll: async list => { state.routes = list; state.used = [...new Set([...state.used, ...list.map(r => r.id)])]; },
      readViews: () => [], usedIds: () => state.used, defaultLegKm: () => 10}
  });
  return {api, state};
}
const gameWith = api => ({modules: {get: id => id === 'ashen-gate-locations' ? {active: true, api} : null}});
const base = {status: 'approved', version: '1.0.0', provenance: {sources: ['synthetic test data']}};
const loc = id => ({id, entity_type: 'Location', ...base, visibility: 'player', refs: [], name: `[TEST] ${id}`, location: {name: `[TEST] ${id}`}});
const route = (id, from, to, fields = {}) => ({id, entity_type: 'Route', ...base, visibility: 'gm', name: `[TEST] ${id}`,
  refs: [{relation: 'route_from', target_id: from, mode: 'required'}, {relation: 'route_to', target_id: to, mode: 'required'}],
  route: {from_location_id: from, to_location_id: to, distance_km: 30, leg_km: 10, ...fields}});
const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-ROUTES', version: '1.0.0'}, records});

/** #preview: Locations first (their ids feed route endpoints), then routes, in dependency order. */
function preview(p, api, {includeDrafts = false, updateExisting = false} = {}) {
  const locIds = new Set(api.listLocations().map(l => l.id));
  const rteApi = routesApi(gameWith(api));
  const routeIds = rteApi ? new Set(rteApi.listRoutes().map(r => r.id)) : null;
  const ends = new Set(locIds);
  for (const r of p.records) if (isLocationRecord(r) && ['create', 'update'].includes(planLocation(r, {existingIds: locIds, includeDrafts, updateExisting}).action)) ends.add(r.id);
  return dependencyOrder(p.records).order.map(id => {
    const r = p.records.find(x => x.id === id);
    if (isLocationRecord(r)) return {id, kind: 'Location', ...planLocation(r, {existingIds: locIds, includeDrafts, updateExisting})};
    if (isRouteRecord(r)) return {id, kind: 'Route', ...planRoute(r, {existingIds: routeIds, locationIds: ends, includeDrafts, updateExisting})};
    return {id, kind: 'other'};
  });
}
/** #apply: locations, then routes. */
async function apply(p, api, rows, opts = {}) {
  const pick = kind => rows.filter(r => r.kind === kind && ['create', 'update'].includes(r.action)).map(r => p.records.find(x => x.id === r.id));
  return [...await applyLocations(pick('Location'), api, opts), ...await applyRoutes(pick('Route'), routesApi(gameWith(api)), opts)];
}

test('validation: a route may require a location that lives only in Locations', () => {
  const {api} = locations({stored: [{id: 'LOC-TEST-OLD', name: '[TEST] Old'}]});
  const p = pkg([loc('LOC-TEST-NEW'), route('RTE-TEST-OLD-NEW', 'LOC-TEST-OLD', 'LOC-TEST-NEW')]);
  assert.match(validatePackage(p, new Map()).join(' '), /unresolved required reference LOC-TEST-OLD/, 'without Locations ids it is unresolved');
  assert.deepEqual(validatePackage(p, withLocationIds(new Map(), api)), [], 'with them it validates');
  const idx = withLocationIds(new Map([['LOC-TEST-OLD', {entityType: 'Location', bound: true}]]), api);
  assert.equal(idx.get('LOC-TEST-OLD').bound, true, 'existing index entries win');
  assert.deepEqual(routeEnds({refs: [{relation: 'route_from', target_id: 'LOC-A'}, {relation: 'route_to', target_id: 'LOC-B'}]}), ['LOC-A', 'LOC-B']);
});

test('one run: routes import after the locations they join, whatever the file order; results per record', async () => {
  const {api, state} = locations();
  const p = pkg([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B'), route('RTE-TEST-A-Z', 'LOC-TEST-A', 'LOC-TEST-Z'),
    route('RTE-TEST-A-A', 'LOC-TEST-A', 'LOC-TEST-A'), route('RTE-TEST-BAD', 'LOC-TEST-A', 'LOC-TEST-B', {distance_km: '30'}),
    route('RTE-TEST-LEG', 'LOC-TEST-A', 'LOC-TEST-B', {leg_km: -2}), loc('LOC-TEST-A'), loc('LOC-TEST-B')]);
  const rows = preview(p, api);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by['RTE-TEST-A-B'].action, 'create');
  assert.match(by['RTE-TEST-A-Z'].reason, /Endpoint not in this world or this import: LOC-TEST-Z/);
  assert.match(by['RTE-TEST-A-A'].reason, /two different locations/);
  assert.match(by['RTE-TEST-BAD'].reason, /distance_km must be a number/);
  assert.equal(by['RTE-TEST-LEG'].action, 'create', 'Manager passes it on; Locations checks the rest');
  const results = await apply(p, api, rows);
  assert.deepEqual(state.routes.map(r => r.id), ['RTE-TEST-A-B']);
  assert.deepEqual(results.filter(r => r.kind === 'Route').map(r => [r.id, r.status]), [['RTE-TEST-A-B', 'ok'], ['RTE-TEST-LEG', 'error']]);
  assert.match(results.find(r => r.id === 'RTE-TEST-LEG').message, /leg_km must be a number/, 'Locations\' reason reaches the result panel');
  const report = buildImportReport({file: 'routes.json', results});
  assert.match(JSON.stringify(report), /Locations: routes/);
  assert.equal(state.routes[0].state, 'unknown', 'discovery defaults to unknown');
});

test('re-import: kept by default; update replaces the definition but never discovery or who can see it', async () => {
  const {api, state} = locations();
  const p = pkg([loc('LOC-TEST-A'), loc('LOC-TEST-B'), route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')]);
  await apply(p, api, preview(p, api));
  await api.setRouteState('RTE-TEST-A-B', 'explored');
  const p2 = pkg([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B', {distance_km: 55, discovery_state: 'unknown'})]);
  const kept = preview(p2, api);
  assert.equal(kept[0].action, 'skipped');
  assert.match(kept[0].reason, /Update existing locations, routes and shops/);
  const rows = preview(p2, api, {updateExisting: true});
  assert.equal(rows[0].action, 'update');
  await apply(p2, api, rows, {updateExisting: true});
  assert.deepEqual([state.routes[0].distanceKm, state.routes[0].state], [55, 'explored']);
});

test('drafts, blocked statuses and an old Locations are reported, not imported', () => {
  const {api} = locations({stored: [{id: 'LOC-TEST-A', name: 'a'}, {id: 'LOC-TEST-B', name: 'b'}]});
  const r = route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B');
  const ids = new Set(['LOC-TEST-A', 'LOC-TEST-B']);
  assert.match(planRoute({...r, status: 'draft'}, {existingIds: new Set(), locationIds: ids}).reason, /Include drafts/);
  assert.equal(planRoute({...r, status: 'draft'}, {existingIds: new Set(), locationIds: ids, includeDrafts: true}).action, 'create');
  assert.equal(planRoute({...r, status: 'retired'}, {existingIds: new Set(), locationIds: ids}).action, 'blocked');
  const old = {...api, importRoutes: undefined};
  assert.equal(routesApi(gameWith(old)), null);
  assert.match(planRoute(r, {existingIds: null}).reason, /Locations 1\.10\.0 or later/);
  assert.equal(routesNote([r], null), '1 route record skipped: enable Locations 1.10.0 or later');
});

test('ZIP bundle: a routes-only Manager file is imported after the other Manager files', async () => {
  const z = new globalThis.JSZip();
  z.file('a-routes.json', JSON.stringify(pkg([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')])));
  z.file('b-places.json', JSON.stringify(pkg([loc('LOC-TEST-A'), loc('LOC-TEST-B')])));
  z.file('c-mixed.json', JSON.stringify(pkg([loc('LOC-TEST-C'), route('RTE-TEST-C-A', 'LOC-TEST-C', 'LOC-TEST-A')])));
  const b = await readImportBundle(await z.generateAsync({type: 'uint8array'}), globalThis.JSZip);
  assert.deepEqual(b.files.map(f => [f.filename, f.kind, f.count]), [['b-places.json', 'manager', 2], ['c-mixed.json', 'manager', 2], ['a-routes.json', 'manager', 1]]);
});

test('Browse and World export list routes as definitions, without play state', async () => {
  const {api} = locations();
  const p = pkg([loc('LOC-TEST-A'), loc('LOC-TEST-B'), route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')]);
  await apply(p, api, preview(p, api));
  await api.setRouteState('RTE-TEST-A-B', 'known');
  const sections = collectModuleSections({modules: {get: id => id === 'ashen-gate-locations' ? {active: true, version: '1.10.0', api} : null}});
  assert.equal(sections.routes.status, 'ok');
  const [r] = sections.routes.records;
  assert.deepEqual([r.key, r.data.entity_type, r.data.fromId, r.data.distanceKm], ['routes/RTE-TEST-A-B', 'Route', 'LOC-TEST-A', 30]);
  for (const k of ['state', 'viewKey', 'audience', 'drawingUuid']) assert.equal(k in r.data, false, `no ${k}`);
  const older = collectModuleSections({modules: {get: id => id === 'ashen-gate-locations' ? {active: true, version: '1.9.0', api: {listLocations: () => []}} : null}});
  assert.equal(older.routes.status, 'not available', 'an older Locations is listed as not available, not an error');
});
