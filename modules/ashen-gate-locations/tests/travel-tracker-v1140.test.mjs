/** 1.14.0: the pop-out Travel tracker: pause/resume, the player-safe travel.state(), the tracker's GM and player views,
 *  behaviour panels, and the window's saved position and opacity. Mocked Foundry documents, permissions, chat and RNG:
 *  this proves the logic and what each user receives, not the live window, canvas or scene controls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {createNotesService} from '../scripts/party-notes.mjs';
import {readAll, writeAll, readViews, placeNote, players, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm,
  readTravel, writeTravel, readJourneyView, readNotes, writeNotes, readPlayerNotes, syncSharedNotes} from '../scripts/store.mjs';
import {normalizeRoute} from '../scripts/routes.mjs';
import {startJourney, nextLeg, pauseJourney, safeStreak, kmTravelled, journeyView, setHazardResult, resolveHazard, reverseJourney, HAZARD_FALLBACK} from '../scripts/journey.mjs';
import {gmTrackerHTML, playerTrackerHTML, stripHTML, createBehaviours, clampOpacity, STRIP_MAX_MARKERS} from '../scripts/travel-view.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class {
  constructor(o) { this.options = o; this.position = {...(o?.position ?? {})}; }
  setPosition(p) { Object.assign(this.position, p); return this.position; }
}}}};
globalThis.CSS ??= {escape: v => String(v)};
const {TravelTracker, savedPosition} = await import('../scripts/travel-app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const rolls = (...list) => { let i = 0; return () => (list[i++ % list.length] - 0.5) / 100; };

// ---------- pure ----------
const route = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 38, legKm: 5, hazardBase: 10});

test('pause blocks the next leg until resumed; safe legs in a row; km travelled', () => {
  let j = startJourney(route, 'forward', {now: 1, id: 'J1'});
  assert.equal(j.legs, 8);
  assert.equal(j.paused, false);
  j = nextLeg(j, rolls(99)).journey;
  j = nextLeg(j, rolls(99)).journey;
  assert.deepEqual([safeStreak(j), kmTravelled(j, 5)], [2, 10]);
  j = pauseJourney(j, true);
  assert.throws(() => nextLeg(j, rolls(99)), /paused/);
  assert.equal(journeyView(j).paused, true);
  j = pauseJourney(j, false);
  j = nextLeg(j, rolls(1)).journey;
  assert.equal(safeStreak(j), 0, 'a hazard ends the run');
  j = resolveHazard(setHazardResult(j, {text: '[TEST] Mud'}), 'shared');
  j = reverseJourney(j, route);
  j = nextLeg(j, rolls(99)).journey;
  assert.equal(safeStreak(j), 1, 'turning back does not count');
  assert.equal(kmTravelled({...j, legIndex: 8}, 5), 38, 'the last leg is short: arrival is the whole distance');
  assert.equal(kmTravelled({...j, legIndex: 4}, 0), 19, 'without a leg length, a share of the distance');
  assert.throws(() => pauseJourney({...j, status: 'arrived'}), /no journey under way/);
});

test('players\' progress view: unchanged shape for a plain journey; shared hazards and turning back only', () => {
  let j = startJourney(route, 'forward', {id: 'J2'});
  assert.deepEqual(journeyView(j), {status: 'active', leg: 0, legs: 8}, 'the 1.11.0 shape');
  j = nextLeg(j, rolls(1)).journey;
  j = resolveHazard(setHazardResult(j, {text: '[TEST] Secret ambush'}), 'dismissed');
  j = nextLeg(j, rolls(1)).journey;
  j = resolveHazard(setHazardResult(j, {text: '[TEST] Fallen tree'}), 'shared');
  const v = journeyView(j);
  assert.deepEqual(v.log, [{leg: 2, text: '[TEST] Fallen tree'}]);
  assert.doesNotMatch(JSON.stringify(v), /ambush|chance|roll/i);
});

// ---------- views ----------
test('strip: one marker per leg, current highlighted, hazards outlined; a bar for very long routes', () => {
  const html = stripHTML({leg: 3, legs: 8, hazardLegs: [2]});
  assert.equal((html.match(/<li/g) ?? []).length, 8);
  assert.equal((html.match(/is-done/g) ?? []).length, 3);
  assert.match(html, /<li class="is-done is-current" title="Leg 3">/);
  assert.match(html, /<li class="is-done is-hazard" title="Leg 2: hazard">/);
  assert.match(html, /aria-label="Leg 3 of 8"/);
  assert.match(stripHTML({leg: 0, legs: 8}), /^(?![\s\S]*is-current)/, 'not set out: nothing current');
  const bar = stripHTML({leg: 25, legs: STRIP_MAX_MARKERS + 10});
  assert.match(bar, /agl-travel__strip--bar[\s\S]*width:50%/);
  assert.doesNotMatch(bar, /<li/);
});

test('GM view: chance, safe run, km, Roll next leg; a hazard disables the roll and offers Reroll / Dismiss / Share', () => {
  let j = startJourney(route, 'forward', {id: 'J3'});
  j = nextLeg(nextLeg(nextLeg(j, rolls(99)).journey, rolls(99)).journey, rolls(99)).journey;
  const names = {'LOC-A': '[TEST] Harbor', 'LOC-B': '[TEST] Mill'};
  const base = {routeName: '[TEST] Old <Road>', legKm: 5, nameOf: id => names[id], version: '1.14.0'};
  let html = gmTrackerHTML({...base, journey: j});
  for (const re of [/Ashen Gate \| Travel/, /v1\.14\.0/, /\[TEST\] Old &lt;Road&gt;/, /\[TEST\] Harbor → \[TEST\] Mill/, /Leg 3 of 8, 15 of 38 km/,
    /Hazard chance <strong>80%<\/strong> · 3 safe legs in a row/, /data-travel="next-leg" title="d100 against the hazard chance">/, /data-travel="pause"/, /data-travel="end"/, /data-travel="open-route"/, /data-travel-opacity/])
    assert.match(html, re);
  j = setHazardResult(nextLeg(j, rolls(5)).journey, {text: '[TEST] Wolves', tableMissing: false});
  html = gmTrackerHTML({...base, journey: j});
  assert.match(html, /Hazard on leg 4[\s\S]*\[TEST\] Wolves[\s\S]*Rolled 5 vs 80%/);
  for (const a of ['reroll', 'dismiss', 'share']) assert.match(html, new RegExp(`data-travel="${a}"`));
  assert.match(html, /data-travel="next-leg" title="Deal with the hazard first" disabled/);
  assert.match(gmTrackerHTML({...base, journey: pauseJourney(resolveHazard(j, 'dismissed'))}), /Paused[\s\S]*data-travel="next-leg" title="Resume the journey first" disabled[\s\S]*data-travel="resume"/);
  assert.match(gmTrackerHTML({...base, journey: null}), /No journey yet/);
});

test('player view: route, strip, leg N of M and shared lines; no chance, roll, km or GM buttons', () => {
  const state = {status: 'active', leg: 3, legs: 8, paused: false, routeName: '[TEST] Old Road', routeKey: 'k', from: {name: '[TEST] Harbor', key: 'a'}, to: null,
    log: [{leg: 2, text: '[TEST] Fallen <tree>'}]};
  const html = playerTrackerHTML({state, version: '1.14.0'});
  assert.match(html, /\[TEST\] Old Road[\s\S]*\[TEST\] Harbor → somewhere[\s\S]*Leg 3 of 8[\s\S]*\[TEST\] Fallen &lt;tree&gt;/);
  assert.doesNotMatch(html, /%<|chance|km|next-leg|reroll|dismiss|data-travel="share"|data-travel="end"|data-travel="pause"/i);
  assert.match(playerTrackerHTML({state: null}), /not travelling/);
});

test('behaviour panels: GM-only ones never reach players; appliesTo picks the journey; a broken panel shows an error', () => {
  const b = createBehaviours();
  assert.throws(() => b.register({id: 'bad id!', render: () => ''}), /needs an id/);
  assert.throws(() => b.register({id: 'x'}), /render/);
  const off = b.register({id: 'test.watch', label: '[TEST] Watches', render: () => '<p>GM watch</p>'});
  b.register({id: 'test.pace', label: '[TEST] Pace', audience: 'everyone', appliesTo: ctx => ctx.state?.legs > 2, render: ctx => `<p>Leg ${ctx.state.leg}</p>`});
  b.register({id: 'test.broken', audience: 'everyone', render: () => { throw new Error('boom'); }});
  assert.deepEqual(b.list().map(x => [x.id, x.audience]), [['test.watch', 'gm'], ['test.pace', 'everyone'], ['test.broken', 'everyone']]);
  const st = {leg: 1, legs: 4};
  assert.deepEqual(b.panels({isGM: false, state: st, journey: null}).map(p => p.id), ['test.pace', 'test.broken']);
  assert.match(b.panels({isGM: false, state: st, journey: null})[1].html, /could not be drawn: boom/);
  assert.deepEqual(b.panels({isGM: true, state: {leg: 1, legs: 2}, journey: {}}).map(p => p.id), ['test.watch', 'test.broken']);
  off();
  assert.equal(b.list().length, 2);
  assert.match(playerTrackerHTML({state: {...st, status: 'active'}, panels: b.panels({isGM: false, state: st})}), /data-behaviour="test.pace"[\s\S]*Leg 1/);
});

test('opacity is 20–100%, default opaque', () => {
  assert.deepEqual([clampOpacity(5), clampOpacity(55), clampOpacity(300), clampOpacity('x')], [20, 55, 100, 100]);
});

// ---------- world ----------
async function world({rng = rolls(99)} = {}) {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const scene = new Scene();
  g.scenes = [scene];
  const chat = {gm: [], public: []};
  const settings = new Map([['trackerOpacity', 100]]);
  g.settings = {get: (_m, k) => settings.get(k), set: async (_m, k, v) => settings.set(k, v)};
  let access = true;
  const opened = [];
  const behaviours = createBehaviours();
  const gmDo = fn => (...a) => as(users.get('gm'), () => fn(...a));
  const notes = createNotesService({users, currentUser: () => game.user, isPrimaryGM: () => game.user.isGM, playerAccessEnabled: () => true,
    readAll: gmDo(readAll), readNotes: gmDo(readNotes), writeNotes: gmDo(writeNotes), reconcile: gmDo(loc => syncSharedNotes([loc]))});
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '1.14.0', isGM: () => u.isGM, playerAccessEnabled: () => access, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id),
    notes: {readGM: id => as(u, () => readNotes(id)), readPlayer: key => as(u, () => readPlayerNotes(key)), request: payload => notes.perform(payload, u).then(r => r.notes),
      userId: () => u.id, isActive: notes.isActive, nameOf: notes.nameOf},
    routes: {readAll: () => as(u, readRoutes), writeAll: list => as(u, () => writeRoutes(list)), readViews: () => as(u, readRouteViews), usedIds: () => as(u, usedRouteIds), defaultLegKm},
    travel: {read: () => as(u, readTravel), write: t => as(u, () => writeTravel(t)), readView: () => as(u, readJourneyView),
      drawHazard: async () => ({text: '[TEST] Fallen tree', fromTable: true, tableMissing: false}),
      chat: {gm: async html => chat.gm.push(html), public: async html => chat.public.push(html)}, rng, now: () => 1000},
    tracker: {open: () => opened.push(u.id), behaviours}}));
  const mod = {version: '1.14.0', active: true, api: apis.get('gm')};
  g.modules = {get: id => id === MOD ? mod : null};
  const gm = apis.get('gm');
  const harbor = await gm.saveLocation({name: '[TEST] Harbor'});
  const mill = await gm.saveLocation({name: '[TEST] Mill'});
  await gm.setLocationState(harbor.id, 'revealed');
  await gm.setLocationState(mill.id, 'revealed');
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, name: '[TEST] Old Road', distanceKm: 20, legKm: 5, hazardBase: 25, hazardTable: {uuid: 'RollTable.t1', name: '[TEST] Road'}});
  await gm.setRouteState(r.id, 'known');
  return {g, users, chat, settings, opened, behaviours, api: id => apis.get(id), gm, mod, harbor, mill, route: r, setAccess: v => { access = v; }};
}

test('API: pause/resume are GM-only; travel.state() is the same player-safe view for GM and players', async () => {
  const w = await world({rng: rolls(10, 99)});
  await w.gm.startJourney(w.route.id);
  const p = w.api('p1');
  const pState = () => as(w.users.get('p1'), () => p.travel.state());
  assert.deepEqual(pState(), {status: 'active', leg: 0, legs: 4, paused: false, behaviours: {pace: 'normal'}, routeName: '[TEST] Old Road', routeKey: w.route.viewKey,
    from: {name: '[TEST] Harbor', key: w.harbor.pinKey}, to: {name: '[TEST] Mill', key: w.mill.pinKey}, log: []});
  await w.gm.nextLeg();                       // 10 vs 25%: a hazard, waiting for the GM
  // Random pin/route keys can contain "25" or "roll", so leave them out of the text checked.
  const withoutKeys = JSON.stringify(pState(), (k, v) => /key$/i.test(k) ? undefined : v);
  assert.doesNotMatch(withoutKeys, /Fallen|chance|roll|25/, 'nothing about the waiting hazard');
  await w.gm.shareHazard();
  assert.deepEqual(pState().log, [{leg: 1, text: '[TEST] Fallen tree'}]);
  await as(w.users.get('p1'), async () => {
    await assert.rejects(() => p.pauseJourney(), /Only the GM/);
    await assert.rejects(() => p.resumeJourney(), /Only the GM/);
  });
  await w.gm.pauseJourney();
  assert.equal(pState().paused, true);
  await assert.rejects(() => w.gm.nextLeg(), /paused/);
  await w.gm.resumeJourney();
  assert.equal(pState().paused, false);
  assert.deepEqual(w.gm.travel.state(), pState(), 'the GM gets exactly what players get');
  const left = await w.gm.nextLeg();
  assert.equal(left.journey.legIndex, 2);
  assert.equal(w.gm.getJourney().journey.paused, false);
});

test('API: travel.open() and state() follow Player Access; behaviours pass through', async () => {
  const w = await world();
  const p = w.api('p1');
  await as(w.users.get('p1'), () => p.travel.open());
  assert.deepEqual(w.opened, ['p1']);
  assert.equal(as(w.users.get('p1'), () => p.travel.state()), null, 'no journey yet');
  w.setAccess(false);
  await as(w.users.get('p1'), async () => {
    await assert.rejects(() => p.travel.open(), /hidden from players/);
    assert.throws(() => p.travel.state(), /hidden from players/);
  });
  await w.gm.travel.open();
  assert.equal(w.gm.travel.contract, 'ag-locations-travel/1');
  const off = w.gm.travel.behaviours.register({id: 'test.x', render: () => ''});
  assert.deepEqual(w.gm.travel.behaviours.list(), [{id: 'test.x', label: 'test.x', audience: 'gm'}]);
  off();
  assert.deepEqual(w.gm.travel.behaviours.list(), []);
});

test('window: GM and player render from the API; GM panels never in the player view; position and opacity per user', async () => {
  const w = await world({rng: rolls(99)});
  await w.gm.startJourney(w.route.id);
  await w.gm.nextLeg();
  TravelTracker.behaviours = w.behaviours;
  w.behaviours.register({id: 'test.gm', label: '[TEST] GM watch', render: () => '<p>[TEST] secret watch</p>'});
  w.settings.set('trackerPosition', {left: 40, top: 60, width: 300, height: 'x'});
  assert.deepEqual(savedPosition(), {left: 40, top: 60, width: 300});
  const app = new TravelTracker();
  assert.deepEqual(app.position, {width: 300, height: 420, left: 40, top: 60}, 'saved place, default height');
  const gh = await app._renderHTML();
  assert.match(gh, /Leg 1 of 4, 5 of 20 km[\s\S]*Hazard chance <strong>50%/);
  assert.match(gh, /\[TEST\] secret watch/);
  w.mod.api = w.api('p1');
  const ph = await as(w.users.get('p1'), () => new TravelTracker()._renderHTML());
  w.mod.api = w.gm;
  assert.match(ph, /\[TEST\] Old Road[\s\S]*Leg 1 of 4/);
  assert.doesNotMatch(ph, /secret watch|50%|chance|next-leg/i);
  // Opacity: a custom property on the window element, clamped.
  const props = {};
  app.element = {style: {setProperty: (k, v) => { props[k] = v; }}};
  assert.equal(app.applyOpacity(10), 20);
  assert.deepEqual(props, {'--ag-window-opacity': '20%'});
  // Moving the rendered window saves its place for this user.
  app.rendered = true;
  app.setPosition({left: 120, top: 80});
  app.savePending();
  assert.deepEqual(w.settings.get('trackerPosition'), {left: 120, top: 80, width: 300, height: 420});
  clearTimeout(app.saveTimer);
});
