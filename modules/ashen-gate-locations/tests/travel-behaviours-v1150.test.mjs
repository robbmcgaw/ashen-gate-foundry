/** 1.15.0: travel behaviours (pace, night watches, foraging/navigation checks). Tracking only. Mocked Foundry documents,
 *  permissions and a stand-in Utilities rolls API: this proves the stored shape, the GM-only writes, what players receive
 *  and the Utilities hand-off, not the live tracker window or Utilities' form. */
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
import {normalizeBehaviours, setBehaviours, behavioursView, normalizeJourney} from '../scripts/journey.mjs';
import {travelBehaviours} from '../scripts/travel-behaviours.mjs';

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
  const utilities = {rolls: {open: async req => { utilities.calls.push(req); return {busy: false}; }}, calls: []};
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
    tracker: {open: () => opened.push(u.id), behaviours}, rolls: () => utilities.rolls}));
  const mod = {version: '1.14.0', active: true, api: apis.get('gm')};
  g.modules = {get: id => id === MOD ? mod : null};
  const gm = apis.get('gm');
  const harbor = await gm.saveLocation({name: '[TEST] Harbor'});
  const mill = await gm.saveLocation({name: '[TEST] Mill'});
  await gm.setLocationState(harbor.id, 'revealed');
  await gm.setLocationState(mill.id, 'revealed');
  const r = await gm.saveRoute({fromId: harbor.id, toId: mill.id, name: '[TEST] Old Road', distanceKm: 20, legKm: 5, hazardBase: 25, hazardTable: {uuid: 'RollTable.t1', name: '[TEST] Road'}});
  await gm.setRouteState(r.id, 'known');
  return {utilities, g, users, chat, settings, opened, behaviours, api: id => apis.get(id), gm, mod, harbor, mill, route: r, setAccess: v => { access = v; }};
}

const route2 = normalizeRoute({id: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', distanceKm: 20, legKm: 5, hazardBase: 10});

test('stored shape: defaults on read (no migration), old journeys unchanged otherwise', () => {
  const old = normalizeJourney({journeyId: 'J0', routeId: 'RTE-A-B', fromId: 'LOC-A', toId: 'LOC-B', legs: 4, status: 'active'});
  assert.deepEqual(old.behaviours, {pace: {enabled: true, value: 'normal'}, watch: {enabled: true, first: [], second: [], third: []},
    checks: {enabled: true, forage: 'sur', navigate: 'sur'}});
  assert.deepEqual(normalizeBehaviours({pace: {value: 'sprint', enabled: 'no'}, watch: {first: ['a1', 'a1', 'bad id!', 7]}, checks: {forage: 'xyz', navigate: 'nat'}}),
    {pace: {enabled: true, value: 'normal'}, watch: {enabled: true, first: ['a1'], second: [], third: []}, checks: {enabled: true, forage: 'sur', navigate: 'nat'}});
  assert.equal(normalizeBehaviours({pace: {enabled: false}}).pace.enabled, false);
  assert.deepEqual(normalizeBehaviours(normalizeBehaviours({watch: {second: ['x']}})), normalizeBehaviours({watch: {second: ['x']}}), 're-runnable');
});

test('setBehaviours changes only what it is given and refuses anything unclear', () => {
  let j = startJourney(route2, 'forward', {id: 'J1'});
  j = setBehaviours(j, {pace: {value: 'fast'}, watch: {first: ['a1', 'a2'], third: ['a3']}, checks: {navigate: 'nat'}});
  assert.deepEqual(j.behaviours, {pace: {enabled: true, value: 'fast'}, watch: {enabled: true, first: ['a1', 'a2'], second: [], third: ['a3']},
    checks: {enabled: true, forage: 'sur', navigate: 'nat'}});
  const before = {...j, behaviours: undefined};
  const after = setBehaviours(j, {watch: {enabled: false}});
  assert.equal(after.behaviours.watch.enabled, false);
  assert.deepEqual(after.behaviours.watch.first, ['a1', 'a2'], 'turning off keeps the record');
  assert.deepEqual({...after, behaviours: undefined}, before, 'nothing else about the journey changes (no effect on chance, legs or log)');
  assert.throws(() => setBehaviours(j, {pace: {value: 'jog'}}), /Pace must be/);
  assert.throws(() => setBehaviours(j, {rest: {enabled: true}}), /Unknown travel behaviour/);
  assert.throws(() => setBehaviours(j, {watch: {fourth: []}}), /Unknown setting/);
  assert.throws(() => setBehaviours(j, {watch: {first: 'a1'}}), /list of Actor ids/);
  assert.throws(() => setBehaviours(j, {checks: {forage: 'cooking'}}), /Unknown skill/);
  assert.throws(() => setBehaviours(j, {pace: {enabled: 'yes'}}), /true or false/);
  assert.throws(() => setBehaviours({...j, status: 'arrived'}, {pace: {value: 'slow'}}), /no journey under way/);
});

test('players see pace and watch order only while on; never the check skills', () => {
  const names = {a1: '[TEST] Ava', a2: '[TEST] Bram'};
  const b = normalizeBehaviours({pace: {value: 'slow'}, watch: {first: ['a1'], third: ['a2', 'gone']}, checks: {forage: 'nat'}});
  assert.deepEqual(behavioursView(b, id => names[id]), {pace: 'slow', watch: [{watch: 'first', names: ['[TEST] Ava']}, {watch: 'second', names: []},
    {watch: 'third', names: ['[TEST] Bram']}]});
  assert.deepEqual(behavioursView(normalizeBehaviours({}), id => names[id]), {pace: 'normal'}, 'no watch order until someone is on watch');
  assert.equal(behavioursView(normalizeBehaviours({pace: {enabled: false}, watch: {enabled: false, first: ['a1']}}), id => names[id]), null);
  assert.doesNotMatch(JSON.stringify(behavioursView(b, id => names[id])), /nat|sur|forage|navigate/);
  let j = setBehaviours(startJourney(route2, 'forward', {id: 'J2'}), {pace: {value: 'fast'}});
  assert.deepEqual(journeyView(j), {status: 'active', leg: 0, legs: 4}, 'without a name lookup the 1.11.0 shape is unchanged');
  assert.deepEqual(journeyView(j, {actorName: () => ''}).behaviours, {pace: 'fast'});
  assert.equal(journeyView({...j, status: 'arrived'}, {actorName: () => ''}).behaviours, undefined, 'only while travelling');
});

test('API: behaviours are GM-only to read and write; players get pace and watch order through travel.state()', async () => {
  const w = await world();
  w.g.actors = new Map([['a1', {id: 'a1', name: '[TEST] Ava', type: 'character'}], ['n1', {id: 'n1', name: '[TEST] Spy', type: 'npc'}]]);
  await w.gm.startJourney(w.route.id);
  const p = w.api('p1');
  const pState = () => as(w.users.get('p1'), () => p.travel.state());
  await as(w.users.get('p1'), async () => {
    await assert.rejects(() => p.travel.setBehaviours({pace: {value: 'fast'}}), /Only the GM/);
    assert.throws(() => p.travel.getBehaviours(), /Only the GM/);
    await assert.rejects(() => p.travel.openCheck('forage'), /Only the GM/);
    assert.equal(p.travel.checksAvailable(), false);
  });
  const out = await w.gm.travel.setBehaviours({pace: {value: 'fast'}, watch: {first: ['a1'], second: ['n1']}, checks: {forage: 'nat'}});
  assert.equal(out.pace.value, 'fast');
  assert.deepEqual(w.gm.travel.getBehaviours().watch.first, ['a1']);
  assert.deepEqual(pState().behaviours, {pace: 'fast', watch: [{watch: 'first', names: ['[TEST] Ava']}, {watch: 'second', names: []}, {watch: 'third', names: []}]},
    'only character names reach players');
  assert.doesNotMatch(JSON.stringify(pState()), /nat|Spy|forage/);
  assert.equal(w.gm.getJourney().journey.currentChance, 25, 'no effect on the hazard chance');
  await w.gm.travel.setBehaviours({pace: {enabled: false}, watch: {enabled: false}});
  assert.equal(pState().behaviours, undefined);
  await w.gm.abortJourney();
  await assert.rejects(() => w.gm.travel.setBehaviours({pace: {value: 'slow'}}), /no journey under way/);
});

test('API: foraging and navigation open Utilities prefilled; refused when off or without Utilities', async () => {
  const w = await world();
  await w.gm.startJourney(w.route.id);
  assert.equal(w.gm.travel.checksAvailable(), true);
  await w.gm.travel.setBehaviours({checks: {navigate: 'nat'}});
  await w.gm.travel.openCheck('forage');
  await w.gm.travel.openCheck('navigate');
  assert.deepEqual(w.utilities.calls, [{skills: ['sur'], mode: 'group', title: 'Foraging'}, {skills: ['nat'], mode: 'group', title: 'Navigation'}]);
  await assert.rejects(() => w.gm.travel.openCheck('hunt'), /Unknown check/);
  await w.gm.travel.setBehaviours({checks: {enabled: false}});
  await assert.rejects(() => w.gm.travel.openCheck('forage'), /off for this journey/);
  await w.gm.travel.setBehaviours({checks: {enabled: true}});
  w.utilities.rolls = null;
  assert.equal(w.gm.travel.checksAvailable(), false);
  await assert.rejects(() => w.gm.travel.openCheck('forage'), /Utilities 0.13.0/);
  assert.equal(w.utilities.calls.length, 2);
});

test('panels: GM controls, players see pace and watch order only, checks hidden without Utilities; actions go through the API', async () => {
  const w = await world();
  w.g.actors = new Map([['a1', {id: 'a1', name: '[TEST] Ava', type: 'character'}], ['a2', {id: 'a2', name: '[TEST] Bram', type: 'character'}]]);
  const reg = createBehaviours();
  for (const def of travelBehaviours({api: () => w.api(game.user.id), characters: () => [{id: 'a1', name: '[TEST] Ava'}, {id: 'a2', name: '[TEST] Bram'}], skillLabel: id => `Skill ${id}`}))
    reg.register(def);
  assert.deepEqual(reg.panels({isGM: true, state: null, journey: null}), [], 'no journey, no panels');
  await w.gm.startJourney(w.route.id);
  const gmCtx = () => ({isGM: true, state: w.gm.travel.state(), journey: w.gm.getJourney().journey});
  let gm = reg.panels(gmCtx());
  assert.deepEqual(gm.map(x => x.label), ['Pace (tracking only)', 'Night watches (tracking only)', 'Foraging and navigation (tracking only)']);
  assert.match(gm[0].html, /data-travel-change="bh:pace:value"/);
  assert.match(gm[1].html, /data-watch="first" data-actor="a1"/);
  assert.match(gm[2].html, /data-travel="bh:checks:forage"/);
  assert.match(gm[2].html, /<option value="sur" selected>Skill sur/);
  const el = (attrs) => ({...attrs, dataset: attrs.dataset ?? {}});
  await reg.act('bh:pace:value', {isGM: true, el: el({value: 'slow'})});
  await reg.act('bh:watch:toggle', {isGM: true, el: el({checked: true, dataset: {watch: 'second', actor: 'a2'}})});
  await reg.act('bh:watch:toggle', {isGM: true, el: el({checked: true, dataset: {watch: 'second', actor: 'a1'}})});
  await reg.act('bh:watch:toggle', {isGM: true, el: el({checked: false, dataset: {watch: 'second', actor: 'a2'}})});
  await reg.act('bh:checks:skill', {isGM: true, el: el({value: 'prc', dataset: {check: 'navigate'}})});
  await reg.act('bh:checks:navigate', {isGM: true, el: null});
  assert.deepEqual(w.gm.travel.getBehaviours(), {pace: {enabled: true, value: 'slow'}, watch: {enabled: true, first: [], second: ['a1'], third: []},
    checks: {enabled: true, forage: 'sur', navigate: 'prc'}});
  assert.deepEqual(w.utilities.calls.at(-1), {skills: ['prc'], mode: 'group', title: 'Navigation'});
  const p = w.api('p1');
  const player = as(w.users.get('p1'), () => reg.panels({isGM: false, state: p.travel.state(), journey: null}));
  assert.deepEqual(player.map(x => x.id), ['pace', 'watch']);
  assert.match(player[0].html, /Pace: <strong>Slow/);
  assert.match(player[1].html, /Second watch:<\/strong> \[TEST\] Ava/);
  assert.doesNotMatch(player.map(x => x.html).join(''), /data-travel|select|checkbox|prc|Foraging/, 'no controls or check data for players');
  await assert.rejects(() => reg.act('bh:checks:forage', {isGM: false, el: null}), /Only the GM/);
  await as(w.users.get('p1'), () => assert.rejects(() => reg.act('bh:pace:value', {isGM: false, el: el({value: 'fast'})}), /Only the GM/),
    'the API refuses a player even through an everyone panel');
  await reg.act('bh:pace:enabled', {isGM: true, el: el({checked: false})});
  gm = reg.panels(gmCtx());
  assert.match(gm[0].html, /Off for this journey/);
  assert.doesNotMatch(gm[0].html, /bh:pace:value/);
  w.utilities.rolls = null;
  assert.deepEqual(reg.panels(gmCtx()).map(x => x.id), ['pace', 'watch'], 'checks panel hidden without Utilities');
});
