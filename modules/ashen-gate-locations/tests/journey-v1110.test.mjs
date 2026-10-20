/** 1.11.0: journeys along routes: d100 per leg with a doubling hazard chance, GM-only hazard results, party marker,
 *  arrival log in Party Notes, player progress view. Mocked Foundry documents, permissions, chat and RNG: this
 *  proves the logic and what each user receives, not the live canvas or window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {createNotesService} from '../scripts/party-notes.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm,
  readTravel, writeTravel, readJourneyView, readNotes, writeNotes, readPlayerNotes, syncSharedNotes} from '../scripts/store.mjs';
import {normalizeRoute} from '../scripts/routes.mjs';
import {startJourney, nextLeg, setHazardResult, resolveHazard, reverseJourney, abortJourney, d100, escalate, HAZARD_FALLBACK} from '../scripts/journey.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
/** rng() that yields these d100 results in turn. */
const rolls = (...list) => { let i = 0; return () => (list[i++ % list.length] - 0.5) / 100; };

// ---------- pure ----------
const route = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 40, legKm: 10, hazardBase: 10});

test('a journey starts at the base chance, doubles after each safe leg up to 100%, and resets after a hazard', () => {
  let j = startJourney(normalizeRoute({...route, distanceKm: 70}), 'forward', {now: 1, id: 'J1'});
  assert.deepEqual([j.legs, j.legIndex, j.currentChance, j.baseChance, j.fromId, j.toId], [7, 0, 10, 10, 'LOC-A', 'LOC-B']);
  const seen = [];
  // Rolls: 50 (>10 safe), 30 (>20 safe), 41 (>40 safe), 80 (hazard at 80), ...
  const rng = rolls(50, 30, 41, 80, 99, 99, 99);
  for (const expect of [[20, false], [40, false], [80, false], [10, true]]) {
    const r = nextLeg(j, rng, {now: 2});
    seen.push([r.chance, r.roll, r.hazard]);
    j = r.journey;
    assert.deepEqual([j.currentChance, r.hazard], expect);
    if (r.hazard) {
      assert.throws(() => nextLeg(j, rng), /Deal with the hazard first/, 'the GM must dismiss or share first');
      j = resolveHazard(setHazardResult(j, {text: '[TEST] Rockslide', fromTable: true}), 'dismissed');
    }
  }
  assert.deepEqual(seen, [[10, 50, false], [20, 30, false], [40, 41, false], [80, 80, true]]);
  assert.equal(j.hazardCount, 1);
  assert.deepEqual(j.log.filter(e => e.hazard).map(e => [e.result, e.outcome]), [['[TEST] Rockslide', 'dismissed']]);
  assert.equal(escalate(80), 100, 'capped');
  assert.equal(escalate(100), 100);
  let k = startJourney(normalizeRoute({...route, hazardBase: 0}), 'forward');
  for (let i = 0; i < 4; i++) k = nextLeg(k, rolls(1)).journey;
  assert.equal(k.hazardCount, 0, 'a 0% base chance never fires, even on a roll of 1');
  assert.equal(k.status, 'arrived');
  assert.throws(() => nextLeg(k, rolls(1)), /no journey under way/);
});

test('d100 is 1–100; one-way routes refuse reverse; turning back swaps the ends', () => {
  assert.equal(d100(() => 0), 1);
  assert.equal(d100(() => 0.999999), 100);
  assert.throws(() => startJourney({...route, directed: true}, 'reverse'), /one-way/);
  assert.throws(() => startJourney({...route, distanceKm: 0}), /distance/);
  const back = startJourney(route, 'reverse');
  assert.deepEqual([back.fromId, back.toId], ['LOC-B', 'LOC-A']);
  let j = nextLeg(startJourney(route), rolls(99)).journey;
  assert.throws(() => reverseJourney(j, {...route, directed: true}), /one-way/);
  j = reverseJourney(j, route);
  assert.deepEqual([j.fromId, j.toId, j.legIndex, j.legs, j.direction], ['LOC-B', 'LOC-A', 3, 4, 'reverse'], '1 leg out = 3 legs from the far end, 1 to go');
  assert.equal(abortJourney(j).status, 'aborted');
});

// ---------- world ----------
async function world({rng = rolls(99), tables = {}} = {}) {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const scene = new Scene();
  g.scenes = [scene];
  const chat = {gm: [], public: []};
  const hooks = [];
  const gmDo = fn => (...a) => as(users.get('gm'), () => fn(...a));
  const notes = createNotesService({users, currentUser: () => game.user, isPrimaryGM: () => game.user.isGM, playerAccessEnabled: () => true,
    readAll: gmDo(readAll), readNotes: gmDo(readNotes), writeNotes: gmDo(writeNotes), reconcile: gmDo(loc => syncSharedNotes([loc]))});
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '1.11.0', isGM: () => u.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    notes: {readGM: id => as(u, () => readNotes(id)), readPlayer: key => as(u, () => readPlayerNotes(key)), request: payload => notes.perform(payload, u).then(r => r.notes),
      userId: () => u.id, isActive: notes.isActive, nameOf: notes.nameOf},
    routes: {readAll: () => as(u, readRoutes), writeAll: list => as(u, () => writeRoutes(list)), readViews: () => as(u, readRouteViews), usedIds: () => as(u, usedRouteIds), defaultLegKm},
    travel: {read: () => as(u, readTravel), write: t => as(u, () => writeTravel(t)), readView: () => as(u, readJourneyView),
      drawHazard: async t => tables[t.uuid || t.name] ? {text: tables[t.uuid || t.name], fromTable: true, tableMissing: false} : {text: HAZARD_FALLBACK, fromTable: false, tableMissing: true},
      chat: {gm: async html => chat.gm.push(html), public: async html => chat.public.push(html)}, rng, now: () => 1000, emit: (e, p) => hooks.push([e, p])}}));
  const mod = {version: '1.11.0', active: true, api: apis.get('gm')};
  g.modules = {get: id => id === MOD ? mod : null};
  const gm = apis.get('gm');
  const harbor = await gm.saveLocation({name: '[TEST] Harbor'});
  const mill = await gm.saveLocation({name: '[TEST] Mill'});
  const vault = await gm.saveLocation({name: '[TEST] Sunken Vault'});
  await gm.setLocationState(harbor.id, 'revealed');
  await gm.setLocationState(mill.id, 'revealed');
  await gm.placeOnScene(harbor.id, {scene, x: 100, y: 100});
  await gm.placeOnScene(mill.id, {scene, x: 500, y: 300});
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, distanceKm: 40, legKm: 10, hazardBase: 25, hazardTable: {uuid: 'RollTable.t1', name: '[TEST] Road'}});
  await gm.setRouteState(r.id, 'known');
  return {g, users, scene, chat, hooks, api: id => apis.get(id), gm, mod, harbor, mill, vault, route: r, notes};
}
const marker = scene => scene.notes.filter(n => n.flags?.[MOD]?.partyMarker);

test('GM journey: marker moves along the pins, players see only progress, arrival logs the trip in Party Notes', async () => {
  const w = await world({rng: rolls(80, 99, 99, 99)});
  const j0 = await w.gm.startJourney(w.route.id);
  assert.equal(j0.currentChance, 25);
  assert.deepEqual(marker(w.scene).map(n => [n.x, n.y, n.text]), [[100, 100, 'Party']], 'marker on the start pin');
  const p1 = as(w.users.get('p1'), () => w.api('p1').getJourney());
  assert.deepEqual(p1, {status: 'active', leg: 0, legs: 4, from: {id: w.harbor.id, key: w.harbor.pinKey, name: '[TEST] Harbor'},
    to: {id: w.mill.id, key: w.mill.pinKey, name: '[TEST] Mill'}, routeKey: w.route.viewKey});
  const leg1 = await w.gm.nextLeg();
  assert.deepEqual([leg1.hazard, leg1.roll, leg1.chance, leg1.journey.currentChance], [false, 80, 25, 50]);
  assert.deepEqual(marker(w.scene).map(n => [n.x, n.y]), [[200, 150]], 'a quarter of the way');
  const pages = JSON.stringify([...game.journal].find(j => j.getFlag(MOD, 'role') === 'route-view').pages);
  assert.doesNotMatch(pages, /currentChance|"roll"|chance|hazard/i, 'no chance or roll in anything players can read');
  // Chance 50 then 100: leg 3 is a certain hazard (the doubling rule), which the GM dismisses.
  const leg2 = await w.gm.nextLeg();
  assert.deepEqual([leg2.hazard, leg2.journey.currentChance], [false, 100]);
  const leg3 = await w.gm.nextLeg();
  assert.deepEqual([leg3.hazard, leg3.chance, leg3.journey.currentChance], [true, 100, 25], 'reset to the base chance');
  await w.gm.dismissHazard();
  await w.gm.nextLeg();
  const t = w.gm.getJourney();
  assert.equal(t.journey.status, 'arrived');
  assert.equal(t.partyLocationId, w.mill.id);
  assert.deepEqual(marker(w.scene).map(n => [n.x, n.y]), [[500, 300]], 'marker on the destination pin');
  assert.equal(t.journey.travelLog, 'ok');
  const text = as(w.users.get('gm'), () => readNotes(w.mill.id)).text;
  assert.equal(text, 'Travel: [TEST] Harbor → [TEST] Mill, 40 km, 4 legs, 1 hazard.');
  assert.deepEqual(w.hooks.map(h => h[0]), ['journeyStart', 'journeyLeg', 'journeyLeg', 'journeyLeg', 'journeyLeg', 'journeyArrived']);
  assert.equal(as(w.users.get('p1'), () => w.api('p1').getJourney()).status, 'arrived');
});

test('a hazard rolls the route table for the GM only, resets the chance; Share posts no place names', async () => {
  const w = await world({rng: rolls(10, 99, 99, 99), tables: {'RollTable.t1': '[TEST] Fallen tree'}});
  await w.gm.startJourney(w.route.id);
  const r = await w.gm.nextLeg();
  assert.deepEqual([r.hazard, r.result, r.journey.currentChance, r.journey.hazardCount], [true, '[TEST] Fallen tree', 25, 1]);
  assert.equal(w.chat.gm.length, 1, 'whispered to the GM');
  assert.match(w.chat.gm[0], /Fallen tree/);
  assert.equal(w.chat.public.length, 0, 'nothing for players until the GM shares');
  assert.equal(JSON.stringify(as(w.users.get('p1'), () => w.api('p1').getJourney())).includes('Fallen'), false);
  await assert.rejects(() => w.gm.nextLeg(), /Deal with the hazard first/);
  await w.gm.shareHazard();
  assert.equal(w.chat.public.length, 1);
  assert.match(w.chat.public[0], /Fallen tree/);
  assert.doesNotMatch(w.chat.public[0], /Harbor|Mill|RTE-/, 'shared result names no route or place');
});

test('missing table: the hazard says "Hazard!"; Reroll and Dismiss work; turning back and abort', async () => {
  const w = await world({rng: rolls(1, 99)});
  await w.gm.saveRoute({...w.gm.getRoute(w.route.id), hazardTable: {uuid: 'RollTable.gone', name: ''}});
  await w.gm.startJourney(w.route.id);
  const r = await w.gm.nextLeg();
  assert.deepEqual([r.result, r.journey.pending.tableMissing], [HAZARD_FALLBACK, true]);
  const again = await w.gm.rerollHazard();
  assert.equal(again.result, HAZARD_FALLBACK);
  assert.equal(w.chat.gm.length, 2);
  await w.gm.dismissHazard();
  assert.equal(w.chat.public.length, 0);
  const back = await w.gm.reverseJourney();
  assert.deepEqual([back.fromId, back.legIndex], [w.mill.id, 3]);
  assert.deepEqual(marker(w.scene).map(n => [n.x, n.y]), [[200, 150]], 'turning round does not move the party');
  await assert.rejects(() => w.gm.deleteRoute(w.route.id), /Abort the journey first/);
  const ab = await w.gm.abortJourney();
  assert.equal(ab.status, 'aborted');
  assert.equal(w.gm.getJourney().partyLocationId, '', 'between places');
  assert.equal(as(w.users.get('gm'), () => readNotes(w.mill.id)).text, '', 'abort writes nothing to Party Notes');
});

test('the arrival line never names a place the readers cannot see; a locked Party Notes can be retried', async () => {
  const w = await world({rng: rolls(99)});
  const path = await w.gm.saveRoute({fromId: w.vault.id, toId: w.mill.id, distanceKm: 5});
  // The party is editing the Mill's notes when it arrives.
  await w.notes.perform({op: 'lock', ref: w.mill.pinKey}, w.users.get('p1'));
  await w.gm.startJourney(path.id);
  const r = await w.gm.nextLeg();
  assert.equal(r.arrived, true);
  assert.equal(r.journey.travelLog, 'failed');
  assert.match(r.journey.travelLogError, /editing/);
  await w.notes.perform({op: 'release', ref: w.mill.pinKey}, w.users.get('p1'));
  const ok = await w.gm.retryTravelLog();
  assert.equal(ok.travelLog, 'ok');
  assert.equal(as(w.users.get('gm'), () => readNotes(w.mill.id)).text, 'Travel: an unknown place → [TEST] Mill, 5 km, 1 leg, 0 hazards.');
  const pv = as(w.users.get('p1'), () => w.api('p1').getJourney());
  assert.equal(pv.from, undefined, 'the hidden start is not in the progress view');
  assert.equal(pv.routeKey, undefined, 'nor is the undiscovered route');
  assert.doesNotMatch(JSON.stringify(pv), /Vault/);
});

test('journey calls are GM-only; re-importing the route never touches the journey', async () => {
  const w = await world();
  await w.gm.startJourney(w.route.id);
  await as(w.users.get('p1'), async () => {
    const p = w.api('p1');
    for (const call of [() => p.startJourney(w.route.id), () => p.nextLeg(), () => p.rerollHazard(), () => p.dismissHazard(), () => p.shareHazard(),
      () => p.reverseJourney(), () => p.abortJourney(), () => p.retryTravelLog()]) await assert.rejects(call, /Only the GM/);
  });
  await assert.rejects(() => w.gm.startJourney(w.route.id), /already travelling/);
  const before = JSON.stringify(w.gm.getJourney());
  const rep = await w.gm.importRoutes([{id: w.route.id, entity_type: 'Route', route: {from_location_id: w.harbor.id, to_location_id: w.mill.id, distance_km: 90, discovery_state: 'unknown'}}], {mode: 'update'});
  assert.deepEqual(rep.updated, [w.route.id]);
  assert.equal(JSON.stringify(w.gm.getJourney()), before, 'journey unchanged');
  assert.equal(w.gm.getRoute(w.route.id).state, 'known', 'discovery unchanged');
});

test('window: GM gets Start / Next leg / hazard buttons; players see "leg N of M" and no chance', async () => {
  const w = await world({rng: rolls(5)});
  const app = new LocationsApp();
  app.tab = 'routes';
  app.selectRoute(w.route.id);
  assert.match(await app._renderHTML(), /Start journey: \[TEST\] Harbor → \[TEST\] Mill.*Start journey: \[TEST\] Mill → \[TEST\] Harbor/s);
  await w.gm.startJourney(w.route.id);
  await w.gm.nextLeg();
  const html = await app._renderHTML();
  for (const re of [/Journey under way/, /route-hazard-reroll/, /route-hazard-dismiss/, /Share with players/, /route-journey-abort/, /hazard chance <strong>25%/]) assert.match(html, re);
  w.mod.api = w.api('p1');
  const ph = await as(w.users.get('p1'), () => { const a = new LocationsApp(); a.tab = 'routes'; return a._renderHTML(); });
  assert.match(ph, /leg 1 of 4/);
  assert.doesNotMatch(ph, /25%|hazard|Next leg/i);
  w.mod.api = w.gm;
});
