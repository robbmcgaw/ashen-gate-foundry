/** 0.27.0: Route records (Locations 1.10.0+) through Manager's import: validation, order after locations, ZIP order,
 *  Browse/export. 0.46.1: Locations 0.20.0 retired routes (no importRoutes / listRoutes), so with it Route records are
 *  skipped with "Routes are retired; …" and the locations in the same run still import. Uses the real Locations API over
 *  an in-memory store and mirrors #preview / #apply in main.js; proves the logic, not the live Manager window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/vendor/jszip.min.js';
import {validatePackage} from '../scripts/core.js';
import {dependencyOrder} from '../scripts/workflows.js';
import {isLocationRecord, planLocation, applyLocations, isRouteRecord, routesApi, planRoute, routesNote, applyRoutes, withLocationIds, routeEnds, ROUTES_RETIRED} from '../scripts/location-handoff.js';
import {readImportBundle} from '../scripts/zip-import.js';
import {collectModuleSections} from '../scripts/world-export.js';
import {buildImportReport} from '../scripts/import-result.js';
import {createApi} from '../../ashen-gate-locations/scripts/api.mjs';
import {playerView} from '../../ashen-gate-locations/scripts/model.mjs';

/** The real Locations API (0.20.0: no route methods) over memory, as Locations wires it in Foundry. */
function locations({stored = []} = {}) {
  const state = {stored};
  const api = createApi({
    version: 'test', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(state.stored), writeAll: async list => { state.stored = list; },
    readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async () => ({}), open: () => {}, openLocation: () => {}
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

test('Manager checks on a Route record (for a Locations that still imports routes): endpoints, distance, drafts, statuses', () => {
  const ids = new Set(['LOC-TEST-A', 'LOC-TEST-B']);
  const plan = (r, o = {}) => planRoute(r, {existingIds: new Set(), locationIds: ids, ...o});
  assert.equal(plan(route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')).action, 'create');
  assert.match(plan(route('RTE-TEST-A-Z', 'LOC-TEST-A', 'LOC-TEST-Z')).reason, /Endpoint not in this world or this import: LOC-TEST-Z/);
  assert.match(plan(route('RTE-TEST-A-A', 'LOC-TEST-A', 'LOC-TEST-A')).reason, /two different locations/);
  assert.match(plan(route('RTE-TEST-BAD', 'LOC-TEST-A', 'LOC-TEST-B', {distance_km: '30'})).reason, /distance_km must be a number/);
  const r = route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B');
  assert.match(plan({...r, status: 'draft'}).reason, /Include drafts/);
  assert.equal(plan({...r, status: 'draft'}, {includeDrafts: true}).action, 'create');
  assert.equal(plan({...r, status: 'retired'}).action, 'blocked');
  assert.match(plan(r, {existingIds: new Set(['RTE-TEST-A-B'])}).reason, /Update existing locations, routes and shops/);
});

test('0.46.1: with Locations 0.20.0 (routes retired) Route records are skipped with the retired message; the locations still import', async () => {
  const {api, state} = locations();
  assert.equal(routesApi(gameWith(api)), null, 'no importRoutes / listRoutes: feature-detected, not by version');
  const p = pkg([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B'), loc('LOC-TEST-A'), loc('LOC-TEST-B')]);
  const rows = preview(p, api);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.deepEqual([by['RTE-TEST-A-B'].action, by['RTE-TEST-A-B'].reason], ['skipped', ROUTES_RETIRED]);
  assert.equal(ROUTES_RETIRED, 'Routes are retired; make a location with type Route instead.');
  assert.equal(routesNote(p.records, null), `1 route record skipped: ${ROUTES_RETIRED}`);
  const results = await apply(p, api, rows);
  assert.deepEqual(state.stored.map(l => l.id).sort(), ['LOC-TEST-A', 'LOC-TEST-B']);
  assert.deepEqual(await applyRoutes([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')], null), [{id: 'RTE-TEST-A-B', kind: 'Route', status: 'skipped', message: ROUTES_RETIRED}]);
  assert.ok(results.every(r => r.kind !== 'Route'), 'nothing is sent to Locations for a skipped route');
  // Locations itself also skips a Route record handed to importLocations, without failing the rest.
  const direct = await api.importLocations([route('RTE-TEST-A-C', 'LOC-TEST-A', 'LOC-TEST-C'), loc('LOC-TEST-C')]);
  assert.deepEqual([direct.created, direct.skipped], [['LOC-TEST-C'], [{id: 'RTE-TEST-A-C', reason: ROUTES_RETIRED}]]);
  assert.doesNotMatch(JSON.stringify(buildImportReport({file: 'routes.json', results: await applyRoutes([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')], null)})), /enable \(or update\) Locations/);
});

test('ZIP bundle: a routes-only Manager file is imported after the other Manager files', async () => {
  const z = new globalThis.JSZip();
  z.file('a-routes.json', JSON.stringify(pkg([route('RTE-TEST-A-B', 'LOC-TEST-A', 'LOC-TEST-B')])));
  z.file('b-places.json', JSON.stringify(pkg([loc('LOC-TEST-A'), loc('LOC-TEST-B')])));
  z.file('c-mixed.json', JSON.stringify(pkg([loc('LOC-TEST-C'), route('RTE-TEST-C-A', 'LOC-TEST-C', 'LOC-TEST-A')])));
  const b = await readImportBundle(await z.generateAsync({type: 'uint8array'}), globalThis.JSZip);
  assert.deepEqual(b.files.map(f => [f.filename, f.kind, f.count]), [['b-places.json', 'manager', 2], ['c-mixed.json', 'manager', 2], ['a-routes.json', 'manager', 1]]);
});

test('Browse and World export: with Locations 0.20.0 the routes section is "not available", not an error', () => {
  const {api} = locations();
  const sections = collectModuleSections({modules: {get: id => id === 'ashen-gate-locations' ? {active: true, version: '0.20.0', api} : null}});
  assert.equal(sections.routes.status, 'not available');
});
