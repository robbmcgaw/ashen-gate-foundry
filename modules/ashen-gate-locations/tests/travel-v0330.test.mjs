/** 0.33.0 Travel to a location's linked scene. Mocked Foundry: these prove the rules, the data and the HTML/listener wiring, not the live canvas or Forge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {normalizeLocation, publishable, playerView, exportPackage, parseImport, importRecords, hasUnpublishedChanges} from '../scripts/model.mjs';
import {sceneViewable, travelOptions, travelLabel} from '../scripts/travel.mjs';
import {travel, chooseScene, showTravelMenu, closeTravelMenu, bindPinTravel, registerPinTravel, travelRefOf, onRowContextMenu} from '../scripts/travel-ui.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

// ---- fake scenes: only `view` may be used; `activate` must never be called ----
const calls = [];
const makeScene = (id, name, {navigation = false, observers = []} = {}) => ({
  documentName: 'Scene', id, uuid: `Scene.${id}`, name, navigation,
  testUserPermission: (user, need) => user.isGM || (need === 'OBSERVER' && observers.includes(user.id)),
  view: async () => { calls.push(['view', id]); },
  activate: async () => { calls.push(['activate', id]); }
});
const SCENES = {
  town: makeScene('town', '[TEST] Town Square', {navigation: true}),
  crypt: makeScene('crypt', '[TEST] Crypt Level', {observers: ['p1']}),
  vault: makeScene('vault', '[TEST] Secret Vault'),            // no navigation, no player permission
  tower: makeScene('tower', '[TEST] Tower Top', {navigation: true}) // linked, but the GM leaves the travel switch off
};
let held = new Set(Object.keys(SCENES));                        // which scenes this client holds (a player is not sent scenes they cannot see)
const resolveScene = uuid => { const s = SCENES[uuid.replace('Scene.', '')]; return s && held.has(s.id) ? s : null; };

function boot({access = true} = {}) {
  const game = installFoundry();
  calls.length = 0; held = new Set(Object.keys(SCENES));
  const mod = {version: '0.33.0', active: true};
  mod.api = createApi({version: '0.33.0', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, resolveScene, currentUser: () => game.user});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  globalThis.ui = {notifications: {warn: t => (globalThis.ui.warned ??= []).push(t), info() {}, error() {}}};
  globalThis.ui.warned = [];
  globalThis.fromUuidSync = uuid => resolveScene(uuid);
  return {game, api: mod.api};
}
const GM_SCENES = ['Scene.town', 'Scene.crypt', 'Scene.vault', 'Scene.tower', 'Scene.gone'];
async function seed(api, {state = 'revealed', travel = ['Scene.town', 'Scene.crypt', 'Scene.vault'], scenes = GM_SCENES} = {}) {
  const loc = await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: scenes, travelSceneUuids: travel, description: 'A hall.'});
  await api.setLocationState(loc.id, state);
  return loc;
}
const asPlayer = game => { game.user = player; };

// ---------- data ----------
test('travelSceneUuids defaults to none, is deduped, capped to safe uuids, and is always a subset of the linked scenes', () => {
  assert.deepEqual(normalizeLocation({name: 'x'}).travelSceneUuids, []);
  assert.deepEqual(normalizeLocation({sceneUuids: ['Scene.a'], travelSceneUuids: ['Scene.a', 'Scene.a', 'Scene.b', '<bad>']}).travelSceneUuids, ['Scene.a'], 'unlinked and unsafe ones drop');
  const loc = normalizeLocation({sceneUuids: ['Scene.a', 'Scene.b'], travelSceneUuids: ['Scene.a', 'Scene.b']});
  assert.deepEqual(normalizeLocation({...loc, sceneUuids: ['Scene.b']}).travelSceneUuids, ['Scene.b'], 'unlinking a scene turns its switch off');
});

test('Publish copies the switches (only for still-linked scenes); the saved-but-unpublished switch shows as an unpublished change', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', state: 'revealed', sceneUuids: ['Scene.a', 'Scene.b'], travelSceneUuids: ['Scene.a']});
  assert.deepEqual(publishable(loc).travelSceneUuids, ['Scene.a']);
  assert.equal('sceneUuids' in publishable(loc), false, 'the linked-scene list itself is still GM only');
  const published = normalizeLocation({...loc, published: publishable(loc)});
  assert.equal(hasUnpublishedChanges(published), false);
  assert.equal(hasUnpublishedChanges({...published, travelSceneUuids: ['Scene.a', 'Scene.b']}), true);
});

test('player view: Revealed carries travelScenes (uuids only); Unidentified and Hidden carry none; an old published copy without the field means none', () => {
  const base = {id: 'LOC-TEST-A', name: '[TEST] A', sceneUuids: ['Scene.a', 'Scene.b'], travelSceneUuids: ['Scene.a'], unidentifiedLabel: 'Unknown place', teaser: 't'};
  const rev = normalizeLocation({...base, state: 'revealed'});
  rev.published = publishable(rev);
  assert.deepEqual(playerView(rev).travelScenes, ['Scene.a']);
  const unk = normalizeLocation({...base, state: 'unidentified'}); unk.published = publishable(unk);
  assert.equal(JSON.stringify(playerView(unk)).includes('travel'), false);
  assert.equal(JSON.stringify(playerView(unk)).includes('Scene.'), false);
  assert.equal(playerView(normalizeLocation({...base, state: 'hidden'})), null);
  const old = normalizeLocation({...base, state: 'revealed', published: (({travelSceneUuids, ...rest}) => rest)(publishable(rev))});
  assert.equal(playerView(old).travelScenes, undefined, 'absent = none');
  assert.equal(JSON.stringify(playerView(rev)).includes('sceneUuids'), false);
});

test('the switch persists through export, import, a Manager update, and an update that leaves it out keeps the world value', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', sceneUuids: ['Scene.a', 'Scene.b'], travelSceneUuids: ['Scene.b']});
  const pkg = exportPackage([loc]);
  assert.deepEqual(pkg.records[0].location.travelSceneUuids, ['Scene.b']);
  assert.deepEqual(parseImport(pkg, []).created[0].travelSceneUuids, ['Scene.b'], 'import round-trip');
  const leaves = {id: 'LOC-TEST-A', entity_type: 'Location', location: {name: '[TEST] Renamed'}};
  assert.deepEqual(importRecords([leaves], [loc], {mode: 'update'}).updated[0].travelSceneUuids, ['Scene.b'], 'a record that leaves it out keeps the world value');
  assert.deepEqual(importRecords([{...leaves, location: {name: 'x', sceneUuids: ['Scene.a', 'Scene.b'], travelSceneUuids: ['Scene.a']}}], [loc], {mode: 'update'}).updated[0].travelSceneUuids, ['Scene.a'], 'a record that sets it wins');
  assert.deepEqual(importRecords([{...leaves, location: {name: 'x', sceneUuids: ['Scene.a']}}], [loc], {mode: 'update'}).updated[0].travelSceneUuids, [], 'an update that unlinks the scene drops its switch');
  assert.deepEqual(normalizeLocation({id: 'LOC-TEST-OLD', name: 'old'}).travelSceneUuids, [], 'a record from before 0.33.0 reads off');
});

// ---------- rules ----------
test('sceneViewable / travelOptions: GM any resolvable scene; player needs navigation or Observer; unresolvable and viewless are skipped', () => {
  assert.equal(sceneViewable(SCENES.vault, gm), true);
  assert.equal(sceneViewable(SCENES.vault, player), false);
  assert.equal(sceneViewable(SCENES.town, player), true);
  assert.equal(sceneViewable(SCENES.crypt, player), true);
  assert.equal(sceneViewable(null, gm), false);
  assert.equal(sceneViewable({name: 'no view fn', navigation: true}, player), false);
  const opts = travelOptions(['Scene.town', 'Scene.crypt', 'Scene.town', 'Scene.nope'], {resolve: u => resolveScene(u) ?? (() => { throw new Error('x'); })(), user: gm});
  assert.deepEqual(opts.map(o => o.name), ['[TEST] Crypt Level', '[TEST] Town Square'], 'sorted by name, deduped, a throwing resolve is skipped');
  assert.equal(travelLabel(1), 'Travel'); assert.equal(travelLabel(2), 'Travel to scene…'); assert.equal(travelLabel(5), 'Travel to scene…');
});

test('GM sees every linked scene that still exists (switch or not); travelToLocation views it, never activates, and never throws', async () => {
  const {api} = boot(); await seed(api);
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.name), ['[TEST] Crypt Level', '[TEST] Secret Vault', '[TEST] Tower Top', '[TEST] Town Square'], 'the deleted scene is skipped');
  assert.deepEqual(await api.travelToLocation('LOC-TEST-HALL', {sceneUuid: 'Scene.tower'}), {ok: true, sceneUuid: 'Scene.tower'});
  assert.deepEqual(calls, [['view', 'tower']]);
  const pinKey = (await api.getLocation('LOC-TEST-HALL')).pinKey;
  assert.equal((await api.travelToLocation(pinKey, {sceneUuid: 'Scene.town'})).ok, true, 'a pin key works too');
  assert.equal(calls.some(c => c[0] === 'activate'), false);
  const many = await api.travelToLocation('LOC-TEST-HALL');
  assert.equal(many.ok, false); assert.match(many.reason, /Choose/);
  assert.equal((await api.travelToLocation('LOC-TEST-HALL', {sceneUuid: 'Scene.elsewhere'})).ok, false, 'a scene that is not linked is refused');
  assert.deepEqual(await api.travelToLocation('LOC-NOPE'), {ok: false, reason: "Travel isn't available for that location."});
});

test('GM: a location with no linked scenes, or only missing ones, has no Travel; one scene needs no choice', async () => {
  const {api} = boot();
  await seed(api, {scenes: [], travel: []});
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), []);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.gone']});
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), []);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town']});
  assert.equal((await api.travelToLocation('LOC-TEST-HALL')).ok, true);
  assert.deepEqual(calls, [['view', 'town']]);
});

test('a scene whose view() fails reports a reason instead of throwing', async () => {
  const {api} = boot(); await seed(api, {scenes: ['Scene.town'], travel: ['Scene.town']});
  const orig = SCENES.town.view; SCENES.town.view = async () => { throw new Error('Scene is locked'); };
  try { assert.deepEqual(await api.travelToLocation('LOC-TEST-HALL'), {ok: false, reason: 'Scene is locked'}); } finally { SCENES.town.view = orig; }
});

test('player: only switched-on scenes they can view; the others are not offered, named, or reachable by uuid', async () => {
  const {game, api} = boot(); await seed(api);
  asPlayer(game);
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), [{uuid: 'Scene.crypt', name: '[TEST] Crypt Level'}, {uuid: 'Scene.town', name: '[TEST] Town Square'}],
    'vault: switched on but the player cannot view it; tower: viewable but the switch is off');
  const r = await api.travelToLocation('LOC-TEST-HALL', {sceneUuid: 'Scene.town'});
  assert.deepEqual([r.ok, calls], [true, [['view', 'town']]]);
  for (const uuid of ['Scene.vault', 'Scene.tower', 'Scene.gone']) assert.deepEqual(await api.travelToLocation('LOC-TEST-HALL', {sceneUuid: uuid}), {ok: false, reason: "Travel isn't available for that location."}, uuid);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(api.travelScenes('LOC-TEST-HALL')).includes('Vault'), false);
});

test('player: a scene the server did not send (does not resolve) is skipped; Observer permission lost means skipped', async () => {
  const {game, api} = boot(); await seed(api);
  asPlayer(game); held.delete('crypt');
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.uuid), ['Scene.town']);
  held.add('crypt'); SCENES.crypt.testUserPermission = () => false;
  try { assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.uuid), ['Scene.town']); }
  finally { SCENES.crypt.testUserPermission = (user, need) => user.isGM || (need === 'OBSERVER' && ['p1'].includes(user.id)); }
});

test('player: Hidden, Unidentified, switch off, unpublished switch, and Player Access off all give no Travel (same empty answer)', async () => {
  for (const state of ['hidden', 'unidentified']) {
    const {game, api} = boot(); await seed(api, {state});
    asPlayer(game);
    assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), [], state);
    assert.deepEqual(await api.travelToLocation('LOC-TEST-HALL', {sceneUuid: 'Scene.town'}), {ok: false, reason: "Travel isn't available for that location."}, state);
    const key = (game.user = gm, await api.getLocation('LOC-TEST-HALL')).pinKey; asPlayer(game);
    assert.deepEqual(api.travelScenes(key), [], `${state} by pin key`);
    assert.equal(calls.length, 0);
  }
  { // switches all off
    const {game, api} = boot(); await seed(api, {travel: []}); asPlayer(game);
    assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), []);
  }
  { // switch ticked after the last Publish: players do not have it yet
    const {game, api} = boot(); await seed(api, {travel: []});
    await api.saveLocation({...(await api.getLocation('LOC-TEST-HALL')), travelSceneUuids: ['Scene.town']});
    asPlayer(game); assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), []);
    game.user = gm; await api.publishLocation('LOC-TEST-HALL'); asPlayer(game);
    assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.uuid), ['Scene.town']);
  }
  { // Player Access off
    const {game, api} = boot({access: false}); await seed(api); asPlayer(game);
    assert.deepEqual(api.travelScenes('LOC-TEST-HALL'), []);
    assert.equal((await api.travelToLocation('LOC-TEST-HALL')).ok, false);
  }
});

test('the player-side data never carries scene names or the full linked list, only switched-on uuids', async () => {
  const {game, api} = boot(); await seed(api);
  asPlayer(game);
  const dump = JSON.stringify([readViews(), api.getLocation('LOC-TEST-HALL'), api.listLocations()]);
  assert.equal(/Town Square|Crypt Level|Secret Vault|Tower Top|sceneUuids/.test(dump), false);
  assert.equal(dump.includes('Scene.tower') || dump.includes('Scene.gone'), false, 'a linked scene with the switch off is not in the player view');
  assert.equal(dump.includes('Scene.town'), true);
});

test('without the partner deps (an older host) the API simply offers no Travel', async () => {
  const game = installFoundry();
  const api = createApi({version: '0.33.0', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open() {}, openLocation() {}});
  assert.deepEqual(api.travelScenes('LOC-X'), []); assert.equal((await api.travelToLocation('LOC-X')).ok, false); assert.ok(game);
});

// ---------- the window ----------
const detailOf = html => html.slice(html.indexOf('<section class="agl-detail'));
test('GM editor: Travel / Travel to scene… in the header, per-scene "Players can travel here" switches (default off, checked when set)', async () => {
  const {api} = boot(); await seed(api);
  const app = new LocationsApp(); app.select('LOC-TEST-HALL');
  let html = detailOf(await app._renderHTML());
  assert.match(html, /data-action="travel" data-ref="LOC-TEST-HALL"[^>]*><i[^>]*><\/i><span>Travel to scene…<\/span>/);
  assert.equal((html.match(/data-travel-scene="/g) ?? []).length, 5);
  assert.match(html, /data-travel-scene="Scene.town" checked/); assert.match(html, /data-travel-scene="Scene.crypt" checked/);
  assert.doesNotMatch(html, /data-travel-scene="Scene.tower" checked/);
  assert.match(html, /Players can travel here/);
  // toggle through the real handler path: the draft changes and is marked dirty
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town']});
  const one = new LocationsApp(); one.select('LOC-TEST-HALL');
  html = detailOf(await one._renderHTML());
  assert.match(html, /<span>Travel<\/span>/); assert.doesNotMatch(html, /Travel to scene…/);
  assert.doesNotMatch(html, /data-travel-scene="Scene.town" checked/, 'default off');
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: []});
  const none = new LocationsApp(); none.select('LOC-TEST-HALL');
  assert.doesNotMatch(detailOf(await none._renderHTML()), /data-action="travel"/);
  // removing a scene in the draft drops its switch
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town', 'Scene.crypt'], travelSceneUuids: ['Scene.town', 'Scene.crypt']});
  const rm = new LocationsApp(); rm.render = async () => {}; rm.select('LOC-TEST-HALL');
  await rm.onAction({dataset: {action: 'remove-scene', uuid: 'Scene.town'}, closest: () => null});
  assert.deepEqual([rm.draft.sceneUuids, rm.draft.travelSceneUuids], [['Scene.crypt'], ['Scene.crypt']]);
});

test('player viewer: Travel button only for a Revealed place with a scene they may view; none for Unidentified', async () => {
  { const {game, api} = boot(); await seed(api); asPlayer(game);
    const app = new LocationsApp(); app.select(readViews()[0].key);
    const html = await app._renderHTML();
    assert.match(html, /<div class="agl-travel">[\s\S]*?<span>Travel to scene…<\/span>/);
    assert.equal(/Town Square|Secret Vault|Scene\./.test(html), false, 'no scene name or uuid in the player window'); }
  { const {game, api} = boot(); await seed(api, {state: 'unidentified'}); asPlayer(game);
    const app = new LocationsApp(); app.select(readViews()[0].key);
    assert.doesNotMatch(await app._renderHTML(), /data-action="travel"/); }
  { const {game, api} = boot(); await seed(api, {travel: ['Scene.vault']}); asPlayer(game);
    const app = new LocationsApp(); app.select(readViews()[0].key);
    assert.doesNotMatch(await app._renderHTML(), /data-action="travel"/, 'the only switched-on scene is not viewable by this player'); }
});

test('the Travel button runs the flow with the clicked reference (no re-render needed)', async () => {
  const {api} = boot(); await seed(api, {scenes: ['Scene.town'], travel: ['Scene.town']});
  const app = new LocationsApp(); app.select('LOC-TEST-HALL');
  await app.onAction({dataset: {action: 'travel', ref: 'LOC-TEST-HALL'}});
  assert.deepEqual(calls, [['view', 'town']]);
});

// ---------- chooser, flow, menus ----------
test('chooser: several scenes ask which (only the allowed ones, by name, names escaped); one goes straight; Cancel does nothing', async () => {
  const {game, api} = boot(); await seed(api); asPlayer(game);
  let seen = null;
  globalThis.foundry.applications.api.DialogV2 = {wait: async o => { seen = o; return o.buttons.find(b => b.action === 'Scene.crypt').callback(); }};
  try {
    const r = await travel('LOC-TEST-HALL');
    assert.equal(r.ok, true); assert.deepEqual(calls, [['view', 'crypt']]);
    assert.deepEqual(seen.buttons.map(b => b.label), ['Cancel', '[TEST] Crypt Level', '[TEST] Town Square'], 'only the scenes this player may go to');
    assert.equal(JSON.stringify(seen).includes('Secret Vault') || JSON.stringify(seen).includes('Tower Top'), false);
    calls.length = 0;
    globalThis.foundry.applications.api.DialogV2 = {wait: async o => o.buttons[0].callback()};
    assert.deepEqual(await travel('LOC-TEST-HALL'), {ok: false, reason: 'cancelled'}); assert.equal(calls.length, 0);
    globalThis.foundry.applications.api.DialogV2 = {wait: async o => { seen = o; return null; }};
    await chooseScene([{uuid: 'Scene.x', name: 'A <b>&</b> B'}]);
    assert.equal(seen.buttons[1].label, 'A &lt;b&gt;&amp;&lt;/b&gt; B');
  } finally { delete globalThis.foundry.applications.api.DialogV2; }
  // one scene: no dialog at all
  const g2 = boot(); await seed(g2.api, {travel: ['Scene.town']}); asPlayer(g2.game);
  const r = await travel('LOC-TEST-HALL', {choose: () => { throw new Error('should not ask'); }});
  assert.equal(r.ok, true);
  // nothing to go to: warns
  g2.game.user = gm; await g2.api.saveLocation({id: 'LOC-TEST-HALL', name: 'x', sceneUuids: []}); calls.length = 0;
  const none = await travel('LOC-TEST-HALL'); assert.equal(none.ok, false); assert.match(globalThis.ui.warned.at(-1), /isn't available/);
});

function fakeDoc() {
  const mk = tag => { const el = {tag, children: [], style: {}, attrs: {}, listeners: {}, className: '', innerHTML: '', removed: false, focused: false,
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; },
    contains(n) { return n === this || this.children.includes(n); }, focus() { this.focused = true; }}; return el; };
  const doc = {listeners: {}, body: mk('body'), createElement: mk, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; }};
  return doc;
}
test('right-click menu: one Travel item at the pointer, focused, runs the flow; Escape and an outside click close it', async () => {
  const doc = fakeDoc(); const ran = [];
  const menu = showTravelMenu({ref: 'LOC-X', x: 120.4, y: 30.6, count: 1, doc, run: ref => ran.push(ref)});
  assert.deepEqual([menu.style.left, menu.style.top], ['120px', '31px']);
  const item = menu.children[0];
  assert.match(item.innerHTML, /<span>Travel<\/span>/); assert.equal(item.focused, true);
  assert.equal(menu.attrs.role, 'group', 'a plain group: no menu role without arrow-key behaviour');
  item.listeners.click({preventDefault() {}});
  assert.deepEqual(ran, ['LOC-X']); assert.equal(menu.removed, true);
  const m2 = showTravelMenu({ref: 'LOC-X', count: 3, doc, run() {}});
  assert.match(m2.children[0].innerHTML, /Travel to scene…/);
  doc.listeners.keydown({key: 'Escape'}); assert.equal(m2.removed, true);
  const m3 = showTravelMenu({ref: 'LOC-X', count: 1, doc, run() {}});
  doc.listeners.pointerdown({target: {}}); assert.equal(m3.removed, true);
  const m4 = showTravelMenu({ref: 'LOC-X', count: 1, doc, run() {}}); const m5 = showTravelMenu({ref: 'LOC-Y', count: 1, doc, run() {}});
  assert.equal(m4.removed, true, 'opening another menu closes the first'); closeTravelMenu(); assert.equal(m5.removed, true);
});

test('list row right-click: opens only where the API offers a scene (the native menu is left alone otherwise)', async () => {
  const {game, api} = boot(); await seed(api); asPlayer(game);
  const doc = fakeDoc(); let prevented = 0;
  const ev = {clientX: 50, clientY: 60, preventDefault() { prevented++; }, currentTarget: {}};
  assert.equal(onRowContextMenu(ev, 'LOC-TEST-HALL', {doc, run() {}}), true); assert.equal(prevented, 1); closeTravelMenu();
  assert.equal(onRowContextMenu(ev, 'LOC-NOPE', {doc, run() {}}), false); assert.equal(prevented, 1, 'nothing prevented');
  game.user = gm; await api.setLocationState('LOC-TEST-HALL', 'hidden'); asPlayer(game);
  assert.equal(onRowContextMenu(ev, 'LOC-TEST-HALL', {doc, run() {}}), false, 'a hidden place has no menu');
});

// ---------- map pins ----------
const noteOf = (flags = {}) => { const handlers = {}; return {handlers, document: {getFlag: (s, k) => (s === 'ashen-gate-locations' ? flags[k] : undefined)}, controlIcon: {on(t, f) { handlers[t] = f; }}}; };
test('pins: a bound Note gets one right-click listener (not re-added on every refresh); companions, markers and foreign Notes get none', () => {
  const { } = boot();
  const note = noteOf({pinKey: 'abcdef123456abcd'});
  assert.equal(bindPinTravel(note), true); assert.equal(bindPinTravel(note), false, 'once per icon');
  assert.equal(typeof note.handlers.rightclick, 'function');
  note.controlIcon = {on() { this.rebuilt = true; }};                              // core redrew the icon: it is bound again
  assert.equal(bindPinTravel(note), true);
  assert.equal(bindPinTravel(noteOf({companionKey: 'abcdef123456abcd', pinKey: 'x'})), false);
  assert.equal(bindPinTravel(noteOf({partyMarker: true, pinKey: 'x'})), false);
  assert.equal(bindPinTravel(noteOf({})), false);
  assert.equal(bindPinTravel({document: {getFlag: () => 'k'}}), false, 'no icon');
  assert.equal(travelRefOf(noteOf({locationId: 'LOC-OLD'})), 'LOC-OLD', '1.2.x Notes still resolve');
  const hooks = {on: (n, f) => (hooks[n] = f)}; registerPinTravel(hooks);
  assert.equal(hooks.refreshNote(noteOf({pinKey: 'k1k1k1k1k1k1k1'})), undefined);
});

test('pins: right-click shows Travel for a player only when they have a scene to go to; a GM gets it for any linked scene', async () => {
  const {game, api} = boot(); await seed(api);
  const key = (await api.getLocation('LOC-TEST-HALL')).pinKey;
  const doc = fakeDoc(); const ran = [];
  const click = (note, native = {clientX: 200, clientY: 100, preventDefault() { this.prevented = true; }}) => note.handlers.rightclick({nativeEvent: native});
  const gmNote = noteOf({pinKey: key}); bindPinTravel(gmNote, {doc, run: r => ran.push(r)});
  click(gmNote); assert.equal(doc.body.children.length, 1, 'GM'); assert.match(doc.body.children[0].children[0].innerHTML, /Travel to scene…/); closeTravelMenu();
  asPlayer(game);
  const pNote = noteOf({pinKey: key}); bindPinTravel(pNote, {doc, run: r => ran.push(r)});
  const native = {clientX: 5, clientY: 6, preventDefault() { this.prevented = true; }};
  click(pNote, native); assert.equal(native.prevented, true); assert.equal(doc.body.children.length, 2, 'player with switched-on, viewable scenes');
  doc.body.children.at(-1).children[0].listeners.click({preventDefault() {}}); assert.deepEqual(ran, [key]);
  // a place the player cannot travel from: nothing opens and the click is not swallowed
  game.user = gm; await api.setLocationState('LOC-TEST-HALL', 'unidentified'); asPlayer(game);
  const before = doc.body.children.length, n2 = {clientX: 1, clientY: 1, preventDefault() { this.prevented = true; }};
  click(pNote, n2); assert.equal(doc.body.children.length, before); assert.equal(n2.prevented, undefined);
  closeTravelMenu();
});
