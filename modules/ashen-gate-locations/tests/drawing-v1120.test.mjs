/** 1.12.0: route ↔ map Drawing links, "Draw for me", drawing visibility from the route, party marker along the line.
 *  Mocked Foundry scenes/drawings (V14 field names): proves the logic and the document changes, not the live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm,
  readTravel, writeTravel, readJourneyView, linkDrawing, unlinkDrawing, drawRouteLine, drawingInfo} from '../scripts/store.mjs';
import {drawingPath, orientPath, pointAlong, routeLineData} from '../scripts/drawing.mjs';

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };

test('paths: scene coordinates, oriented from the From pin, points along by length; Draw for me makes an open line with no text', () => {
  const d = {x: 100, y: 100, rotation: 0, shape: {type: 'p', points: [0, 0, 300, 0, 300, 400]}};
  assert.deepEqual(drawingPath(d), [{x: 100, y: 100}, {x: 400, y: 100}, {x: 400, y: 500}]);
  assert.equal(drawingPath({...d, rotation: 45}), null, 'rotated: not followed');
  assert.equal(drawingPath({...d, shape: {type: 'r', width: 10, height: 10}}), null);
  const back = orientPath(drawingPath(d), {x: 400, y: 500}, {x: 100, y: 100});
  assert.deepEqual(back[0], {x: 400, y: 500}, 'reversed to start at the From pin');
  assert.deepEqual(pointAlong(drawingPath(d), 0.5), {x: 400, y: 150}, 'half of 700 px: 300 along, then 50 down');
  const line = routeLineData({x: 500, y: 300}, {x: 100, y: 100}, {routeId: 'RTE-A-B', hidden: true});
  assert.deepEqual([line.x, line.y, line.shape.type, line.shape.points, line.text, line.hidden, line.fillType], [100, 100, 'p', [400, 200, 0, 0], '', true, 0]);
  assert.equal(line.flags[MOD].routeId, 'RTE-A-B');
});

async function world() {
  const g = installFoundry();
  const users = new Users([['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}], ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}]]);
  g.users = users; g.user = users.get('gm');
  const scene = new Scene();
  g.scenes = [scene];
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '1.12.0', isGM: () => u.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    routes: {readAll: () => as(u, readRoutes), writeAll: list => as(u, () => writeRoutes(list)), readViews: () => as(u, readRouteViews), usedIds: () => as(u, usedRouteIds), defaultLegKm},
    drawings: {link: (r, uuid) => as(u, () => linkDrawing(r, uuid)), unlink: (r, o) => as(u, () => unlinkDrawing(r, o)), draw: (r, s) => as(u, () => drawRouteLine(r, s)),
      info: r => as(u, () => drawingInfo(r)), viewedScene: () => scene},
    travel: {read: () => as(u, readTravel), write: t => as(u, () => writeTravel(t)), readView: () => as(u, readJourneyView), rng: () => 0.99, now: () => 1}}));
  g.modules = {get: id => id === MOD ? {active: true, api: apis.get('gm')} : null};
  const gm = apis.get('gm');
  const a = await gm.saveLocation({name: '[TEST] Harbor'}), b = await gm.saveLocation({name: '[TEST] Mill'});
  await gm.setLocationState(a.id, 'revealed'); await gm.setLocationState(b.id, 'revealed');
  await gm.placeOnScene(a.id, {scene, x: 100, y: 100});
  await gm.placeOnScene(b.id, {scene, x: 400, y: 500});
  const route = await gm.saveRoute({fromId: a.id, toId: b.id, distanceKm: 20, legKm: 10});
  return {g, users, scene, gm, api: id => apis.get(id), a, b, route};
}

test('Draw for me: a hidden line between the pins, shown only while every player sees the whole route', async () => {
  const w = await world();
  const r = await w.gm.drawRoute(w.route.id);
  const [d] = w.scene.drawings;
  assert.equal(r.drawingUuid, d.uuid);
  assert.deepEqual([d.hidden, d.text, d.flags[MOD].routeId], [true, '', w.route.id], 'Unknown route: hidden; no text');
  await w.gm.setRouteState(w.route.id, 'known');
  assert.equal(w.scene.drawings[0].hidden, false, 'both players see it: shown');
  await w.gm.setRouteAudience(w.route.id, {mode: 'selected', userIds: ['p1']});
  assert.equal(w.scene.drawings[0].hidden, true, 'a drawing is all-or-nothing, so one player left out hides it');
  await w.gm.setRouteAudience(w.route.id, {mode: 'everyone'});
  assert.equal(w.scene.drawings[0].hidden, false);
  await w.gm.setLocationState(w.b.id, 'hidden');
  assert.equal(w.scene.drawings[0].hidden, true, 'hiding an end hides the drawing');
  assert.deepEqual(w.gm.routeDrawing(w.route.id), {status: 'linked', sceneName: 'Test Scene', sceneUuid: w.scene.uuid, hidden: true, hasText: false, path: true});
  // The route's own fields never reach the drawing.
  assert.deepEqual(Object.keys(w.scene.drawings[0]).filter(k => /name|notes|terrain/i.test(k)), []);
});

test('Link selected drawing; refuse one linked elsewhere; unlink and delete keep the drawing unless confirmed', async () => {
  const w = await world();
  const [mine] = await w.scene.createEmbeddedDocuments('Drawing', [{x: 0, y: 0, shape: {type: 'p', points: [100, 100, 400, 100, 400, 500]}, hidden: false, text: 'Old road', flags: {}}]);
  await w.gm.linkRouteDrawing(w.route.id, mine.uuid);
  assert.deepEqual([mine.flags[MOD].routeId, w.scene.drawings[0].hidden, w.scene.drawings[0].text], [w.route.id, true, 'Old road'], 'hidden (route Unknown), text left alone');
  assert.equal(w.gm.routeDrawing(w.route.id).hasText, true, 'the editor warns about text');
  const other = await w.gm.saveRoute({fromId: w.b.id, toId: w.a.id, distanceKm: 5});
  await assert.rejects(() => w.gm.linkRouteDrawing(other.id, mine.uuid), /already linked to route/);
  await assert.rejects(() => w.gm.linkRouteDrawing(other.id, 'Scene.nope.Drawing.nope'), /not found/);
  await w.gm.unlinkRouteDrawing(w.route.id);
  assert.deepEqual([w.scene.drawings.length, w.scene.drawings[0].flags[MOD].routeId, w.gm.getRoute(w.route.id).drawingUuid], [1, null, '']);
  await w.gm.linkRouteDrawing(w.route.id, mine.uuid);
  await w.gm.deleteRoute(w.route.id);
  assert.equal(w.scene.drawings.length, 1, 'deleting the route keeps the drawing by default');
  await w.gm.linkRouteDrawing(other.id, mine.uuid);
  await w.gm.deleteRoute(other.id, {deleteDrawing: true});
  assert.equal(w.scene.drawings.length, 0, 'only when the GM chose to delete it too');
});

test('the party marker follows the linked line; Draw for me needs both pins; GM only; re-import keeps the link', async () => {
  const w = await world();
  const [bend] = await w.scene.createEmbeddedDocuments('Drawing', [{x: 0, y: 0, shape: {type: 'p', points: [400, 500, 400, 100, 100, 100]}, hidden: true, flags: {}}]);
  await w.gm.linkRouteDrawing(w.route.id, bend.uuid);
  await w.gm.startJourney(w.route.id);
  await w.gm.nextLeg();
  const m = w.scene.notes.find(n => n.flags?.[MOD]?.partyMarker);
  assert.deepEqual([m.x, m.y], [400, 150], 'half way along the drawn bend (from the Harbor end), not the straight line');
  const scene2 = new Scene();
  w.g.scenes.push(scene2);
  await assert.rejects(() => w.gm.drawRoute(w.route.id, {scene: scene2}), /Place both locations' pins on this scene/);
  await as(w.users.get('p1'), async () => {
    for (const call of [() => w.api('p1').drawRoute(w.route.id), () => w.api('p1').linkRouteDrawing(w.route.id, bend.uuid), () => w.api('p1').unlinkRouteDrawing(w.route.id)])
      await assert.rejects(call, /Only the GM/);
    assert.throws(() => w.api('p1').routeDrawing(w.route.id), /Only the GM/);
  });
  await w.gm.importRoutes([{id: w.route.id, entity_type: 'Route', route: {from_location_id: w.a.id, to_location_id: w.b.id, distance_km: 30}}], {mode: 'update'});
  assert.equal(w.gm.getRoute(w.route.id).drawingUuid, bend.uuid);
  assert.equal(JSON.stringify(w.gm.exportPackage()).includes(bend.id), false, 'drawing links are world-local: never exported');
});
