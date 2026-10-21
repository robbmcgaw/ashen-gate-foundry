/** 1.15.2: a route or leg can never round to 0 km (no Infinity legs); only characters go on watch.
 *  Mocked Foundry documents: this proves the logic, not the live Foundry window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm} from '../scripts/store.mjs';
import {normalizeRoute, legsOf, legKmOf, defaultLeg, importRouteRecords, ROUTE_DEFAULTS} from '../scripts/routes.mjs';
import {normalizeJourney, setBehaviours, startJourney} from '../scripts/journey.mjs';

class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };

async function world() {
  const g = installFoundry();
  const users = new Users([['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const u = users.get('gm');
  const gm = createApi({version: '1.15.2', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    routes: {readAll: () => as(u, readRoutes), writeAll: list => as(u, () => writeRoutes(list)), readViews: () => as(u, readRouteViews), usedIds: () => as(u, usedRouteIds), defaultLegKm}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? {version: '1.15.2', active: true, api: gm} : null};
  const harbor = await gm.saveLocation({name: '[TEST] Harbor'});
  const mill = await gm.saveLocation({name: '[TEST] Mill'});
  return {gm, harbor, mill};
}

// ---------- routes: rounding and validation agree ----------
test('a distance or leg that rounds to 0 km is never kept as 0, so legs are never Infinity', () => {
  const r = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 0.004, legKm: 0.004});
  assert.equal(r.distanceKm, 0, 'no usable distance');
  assert.equal(r.legKm, null, 'falls back to the world default leg');
  const d = normalizeRoute({distanceKm: 10, legKm: 0.004});
  assert.equal(legKmOf(d, 5), 5);
  assert.equal(legsOf(d, 5), 2);
  assert.equal(legsOf({distanceKm: 10, legKm: 0}, 5), 2, 'a raw leg of 0 uses the default too');
  assert.equal(defaultLeg(0.004), ROUTE_DEFAULTS.legKm, 'a world default that rounds to 0 is not used');
  assert.equal(normalizeRoute({distanceKm: 0.005, legKm: 0.006}).distanceKm, 0.01, 'the smallest kept value is 0.01 km');
  assert.equal(normalizeRoute({distanceKm: 0.005, legKm: 0.006}).legKm, 0.01);
  assert.equal(normalizeRoute({distanceKm: 38, legKm: 5}).legKm, 5, 'ordinary values unchanged');
});

test('import refuses distance_km or leg_km that round to 0 km', () => {
  const rec = route => ({id: 'RTE-A-B', entity_type: 'Route', route: {from_location_id: 'LOC-A', to_location_id: 'LOC-B', ...route}});
  const a = importRouteRecords([rec({distance_km: 0.004})], [], ['LOC-A', 'LOC-B']);
  assert.equal(a.created.length, 0);
  assert.match(a.skipped[0].reason, /distance_km must be a number from 0.01 to 100000/);
  const b = importRouteRecords([rec({distance_km: 10, leg_km: 0.004})], [], ['LOC-A', 'LOC-B']);
  assert.equal(b.created.length, 0);
  assert.match(b.skipped[0].reason, /leg_km must be a number from 0.01 to 100000/);
  const ok = importRouteRecords([rec({distance_km: 10, leg_km: 2.5})], [], ['LOC-A', 'LOC-B']);
  assert.equal(ok.created[0].legKm, 2.5);
});

test('API saveRoute (and so the editor) refuses a distance or leg that rounds to 0 km, with a clear message', async () => {
  const {gm, harbor, mill} = await world();
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 0.004}), /^Error: Distance must be from 0.01 to 100000 km\.$/);
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 10, legKm: 0.004}), /Leg length must be from 0.01 to 100000 km/);
  await assert.rejects(() => gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: '10', legKm: '0'}), /Leg length must be from 0.01/, 'editor values arrive as text');
  assert.equal(gm.listRoutes().length, 0, 'nothing saved');
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: '10', legKm: ''});
  assert.equal(r.legKm, null, 'blank leg is the world default');
  assert.equal(r.legs, 2);
});

test('a journey on a route with a sub-0.01 leg has finite legs', () => {
  const route = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 10, legKm: 0.004, hazardBase: 10});
  const j = startJourney(route, 'forward', {now: 1, id: 'j1', defaultLegKm: 5});
  assert.equal(j.legs, 2);
});

// ---------- watches: characters only ----------
test('setBehaviours refuses anyone but the characters the GM can put on watch; someone already on watch may stay', () => {
  let j = normalizeJourney({journeyId: 'j1', routeId: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 10, legs: 2, status: 'active',
    behaviours: {watch: {first: ['gone1']}}});
  const characterIds = ['a1', 'a2'];
  assert.throws(() => setBehaviours(j, {watch: {second: ['n1']}}, {characterIds}), /Only player characters can go on watch.*n1/);
  assert.throws(() => setBehaviours(j, {watch: {second: ['a1', 'x9']}}, {characterIds}), /Not one: x9/);
  j = setBehaviours(j, {watch: {first: ['gone1', 'a1'], second: ['gone1']}}, {characterIds});
  assert.deepEqual(j.behaviours.watch.first, ['gone1', 'a1'], 'a character who left the party can stay on watch');
  assert.deepEqual(j.behaviours.watch.second, ['gone1']);
  assert.throws(() => setBehaviours(j, {watch: {first: ['n1'], second: ['n1']}}, {characterIds}), /n1/, 'one watch does not vouch for another in the same change');
});
