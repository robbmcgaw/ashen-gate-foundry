/** 0.36.0: "Your party is here" pin, Travel for players (never silent), CRE-* Beasts ids. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation, playerView, previewView, viewHtml, publishable, BEAST_ID, NPC_ID} from '../scripts/model.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {hereMarks} from '../scripts/here-marker.mjs';
import {buildRegionSections, VIEW_ACCESS} from '../scripts/region-groups.mjs';
import {actorFacts} from '../scripts/people-shops.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const calls = [], warned = [], noted = [];
const canvasState = {viewingId: null, loading: false, ready: true};
const makeScene = (id, name, {navigation = false, fail = null} = {}) => ({
  documentName: 'Scene', id, uuid: `Scene.${id}`, name, navigation, testUserPermission: () => false,
  view: async () => { calls.push(id); if (fail) throw new Error(fail); canvasState.viewingId = id; }
});
const SCENES = {town: makeScene('town', '[TEST] Town Square', {navigation: true}), crypt: makeScene('crypt', '[TEST] Crypt', {navigation: true}),
  locked: makeScene('locked', '[TEST] Locked', {navigation: true, fail: 'Scene is locked'}), vault: makeScene('vault', '[TEST] Vault')};
const resolveScene = uuid => SCENES[uuid.replace('Scene.', '')] ?? null;

function boot({sceneState = true} = {}) {
  const game = installFoundry(); calls.length = warned.length = noted.length = 0;
  Object.assign(canvasState, {viewingId: null, loading: false, ready: true});
  LocationsApp.treeOpen.clear();
  const mod = {version: '0.36.0', active: true};
  mod.api = createApi({version: '0.36.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, resolveScene, currentUser: () => game.user,
    ...(sceneState ? {sceneState: () => ({...canvasState})} : {})});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  globalThis.ui = {notifications: {warn: t => warned.push(t), info: t => noted.push(t), error() {}}};
  return {game, api: mod.api};
}
// Frontier (Region) > Fosstryn (Region) > Muster (active) ; Fosstryn > Town > Shop ; Frontier > Waystone
async function seed(api, {active = 'muster', travel = null} = {}) {
  const ids = {};
  const defs = [['frontier', 'Frontier', {isRegion: true}], ['fosstryn', 'Fosstryn', {isRegion: true}], ['muster', 'Muster', {}], ['town', 'Town', {}], ['shop', 'Shop', {}], ['way', 'Waystone', {}]];
  for (const [k, n, x] of defs) ids[k] = (await api.saveLocation({id: `LOC-${k.toUpperCase()}`, name: `[TEST] ${n}`, ...x, ...(travel && k === 'muster' ? travel : {})})).id;
  for (const [k, p] of Object.entries({fosstryn: 'frontier', muster: 'fosstryn', town: 'fosstryn', shop: 'town', way: 'frontier'})) await api.moveLocation(ids[k], ids[p]);
  for (const k of Object.keys(ids)) { await api.setLocationState(ids[k], 'revealed'); await api.publishLocation(ids[k]); }
  if (active) await api.setLocationActive(ids[active], true);
  return ids;
}
const pane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
const marks = html => (html.match(/aria-label="Your party is here"/g) ?? []).length;
const headOf = (html, label) => { const at = html.indexOf(`<span>${label}</span>`); return html.slice(html.lastIndexOf('<h3', at), html.indexOf('</h3>', at)); };
const keyOf = name => readViews().find(v => v.name === `[TEST] ${name}`).key;
const playerApp = game => { game.user = player; const app = new LocationsApp(); app.render = async () => {}; return app; };

/* ---------------- A: where am I ---------------- */
test('player: everything open -> no folder pin (the place row has its Here now badge)', async () => {
  const {game, api} = boot(); await seed(api);
  const html = pane(await playerApp(game)._renderHTML());
  assert.equal(marks(html), 0); assert.match(html, /Here now/); assert.match(html, /\[TEST\] Muster/);
});

test('player: inside a folded folder the pin sits on that folder, after the count and before the open arrow; accessible name, tooltip, no colour-only signal', async () => {
  const { game, api } = boot(); const ids = await seed(api);
  const app = playerApp(game); await app._renderHTML();
  app.folds.add(keyOf('Fosstryn'));
  const html = pane(await app._renderHTML());
  assert.equal(marks(html), 1);
  const head = headOf(html, '[TEST] Fosstryn');
  assert.match(head, /<span class="agl-count"[^>]*>\d+<\/span><\/button><span class="agl-here" role="img" aria-label="Your party is here" data-tooltip="Your party is here"[^>]*><i class="fa-solid fa-location-dot" aria-hidden="true"><\/i><\/span><button/);
  assert.doesNotMatch(html, /Muster/, 'the folded folder hides the place, so the folder carries the answer');
});

test('player: an outer folded folder takes the pin from the inner one (nearest visible folder only)', async () => {
  const {game, api} = boot(); const ids = await seed(api);
  const app = playerApp(game); app.folds.add(keyOf('Fosstryn')); app.folds.add(keyOf('Frontier'));
  const html = pane(await app._renderHTML());
  assert.equal(marks(html), 1); assert.match(headOf(html, '[TEST] Frontier'), /Your party is here/);
});

test('player: a place nested under a closed non-Region parent shows the pin on the parent row; open it and the pin goes (the child has its badge)', async () => {
  const {game, api} = boot(); await seed(api, {active: 'shop'});
  const app = playerApp(game);
  let html = pane(await app._renderHTML());
  assert.equal(marks(html), 1);
  const row = html.slice(html.lastIndexOf('<div class="agl-tree__row"', html.indexOf('Your party is here')), html.indexOf('Your party is here') + 200);
  assert.match(row, /\[TEST\] Town/); assert.doesNotMatch(row, /\[TEST\] Shop/);
  LocationsApp.treeOpen.add(keyOf('Town'));
  html = pane(await app._renderHTML());
  assert.equal(marks(html), 0); assert.match(html, /\[TEST\] Shop[\s\S]*Here now/);
});

test('player: the active place itself being a Region puts the pin on its own header', async () => {
  const {game, api} = boot(); await seed(api, {active: 'fosstryn'});
  assert.equal(marks(pane(await playerApp(game)._renderHTML())), 1);
});

test('player: a hidden active place gives no marker and no name; nobody active gives none', async () => {
  const { game, api } = boot(); const ids = await seed(api);
  const app = playerApp(game); app.folds.add(keyOf('Fosstryn'));
  game.user = { ...game.user, isGM: true }; await api.setLocationState(ids.muster, 'hidden'); game.user = player;
  let html = pane(await app._renderHTML());
  assert.equal(marks(html), 0); assert.doesNotMatch(html, /Muster/);
  const b = boot(); await seed(b.api, {active: null});
  const a2 = playerApp(b.game); a2.folds.add(keyOf('Fosstryn')); assert.equal(marks(pane(await a2._renderHTML())), 0);
});

test('unidentified active place: no real name, and the generic row/folder is what a pin may sit on', async () => {
  const {game, api} = boot(); const ids = await seed(api, {active: null});
  await api.setLocationState(ids.muster, 'unidentified'); await api.setLocationActive(ids.muster, true);
  const html = pane(await playerApp(game)._renderHTML());
  assert.doesNotMatch(html, /\[TEST\] Muster/); assert.match(html, /Here now/);
});

test('GM Group by Region gets the pin on a folded folder too', async () => {
  const {game, api} = boot(); const ids = await seed(api);
  game.user.isGM = true;
  const app = new LocationsApp(); app.render = async () => {}; app.groupBy = 'region'; app.folds.add(ids.fosstryn);
  assert.equal(marks(pane(await app._renderHTML())), 1);
});

test('hereMarks (pure): folded/open are what decides, rows that show get nothing', () => {
  const views = [{key: 'r', id: 'r', name: 'R', state: 'revealed', isRegion: true}, {key: 'p', id: 'p', name: 'P', state: 'revealed', parent: {key: 'r'}, active: true}];
  const sections = buildRegionSections(views, VIEW_ACCESS);
  assert.deepEqual([...hereMarks(sections, {folded: () => false}).sections], []);
  assert.deepEqual([...hereMarks(sections, {folded: id => id === 'r'}).sections], ['r']);
});

test('api.listModel: hereNow / containsHere flags (player and GM), additive, contract unchanged', async () => {
  const {game, api} = boot(); const ids = await seed(api);
  assert.equal(api.LIST_CONTRACT, 'ag-locations-list/1');
  for (const asGM of [false, true]) {
    game.user = asGM ? game.users?.find?.(u => u.isGM) ?? { ...player, isGM: true } : player;
    const m = api.listModel();
    const secs = []; (function walk(ss) { for (const s of ss) { secs.push(s); walk(s.sections); } })(m.sections);
    const f = secs.find(s => s.label === '[TEST] Frontier'), fo = secs.find(s => s.label === '[TEST] Fosstryn');
    assert.equal(f.containsHere, true); assert.equal(f.hereNow, false); assert.equal(fo.containsHere, true);
    const muster = fo.rows.flatMap(function all(r) { return [r, ...r.children.flatMap(all)]; }).find(r => r.name === '[TEST] Muster');
    assert.equal(muster.hereNow, true); assert.equal(muster.active, true); assert.equal(muster.containsHere, false);
    const town = fo.rows.find(r => r.name === '[TEST] Town'); assert.equal(town.containsHere, false);
  }
  void ids;
});

test('api.listModel for a player: a hidden active place sets no flag anywhere', async () => {
  const {game, api} = boot(); const ids = await seed(api);
  await api.setLocationState(ids.muster, 'hidden'); game.user = player;
  assert.doesNotMatch(JSON.stringify(api.listModel()), /"(hereNow|containsHere)":true/);
});

/* ---------------- B: Travel ---------------- */
const travelSeed = async (api, uuids = ['Scene.town']) => {
  const l = await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: uuids, travelSceneUuids: uuids, description: 'A hall.'});
  await api.setLocationState(l.id, 'revealed'); await api.publishLocation(l.id);
  return readViews()[0].key;
};
const click = (app, ref) => app.onAction({dataset: {action: 'travel', ref}});

test('PLAYER click on Travel (ticked + published + viewable scene) views the scene exactly once (this was the bug: the GM-only gate swallowed it)', async () => {
  const {game, api} = boot(); const ref = await travelSeed(api);
  const app = playerApp(game); app.select(ref);
  const html = await app._renderHTML(); assert.match(html, /data-action="travel"/);
  await click(app, ref);
  assert.deepEqual(calls, ['town']); assert.deepEqual(warned, []);
  assert.equal(canvasState.viewingId, 'town');
});

test('player click also works with the real wiring: the rendered button element dispatches through onAction', async () => {
  const {game, api} = boot(); const ref = await travelSeed(api);
  const app = playerApp(game); app.select(ref);
  const html = await app._renderHTML();
  const m = /<button[^>]*data-action="travel"[^>]*data-ref="([^"]+)"/.exec(html) ?? /<button[^>]*data-ref="([^"]+)"[^>]*data-action="travel"/.exec(html);
  assert.ok(m, 'player viewer renders the button with a ref'); await click(app, m[1]); assert.deepEqual(calls, ['town']);
});

test('player: several scenes ask first; Cancel does nothing and says nothing wrong', async () => {
  const {game, api} = boot(); const ref = await travelSeed(api, ['Scene.town', 'Scene.crypt']);
  const app = playerApp(game);
  globalThis.foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'Scene.crypt').callback()};
  await click(app, ref); assert.deepEqual(calls, ['crypt']);
});

test('failure is never silent: not viewable, scene gone, view() throws, canvas still loading, canvas did not switch, unknown place', async () => {
  { const {game, api} = boot(); const ref = await travelSeed(api, ['Scene.vault']); await click(playerApp(game), ref); assert.deepEqual(calls, []); assert.equal(warned.length, 1); assert.match(warned[0], /isn't available/); }
  { const {game, api} = boot(); const ref = await travelSeed(api, ['Scene.locked']); await click(playerApp(game), ref); assert.equal(warned.length, 1); assert.equal(warned[0], 'Scene is locked'); }
  { const {game, api} = boot(); const ref = await travelSeed(api); canvasState.loading = true; await click(playerApp(game), ref);
    assert.deepEqual(calls, []); assert.match(warned[0], /finish loading/); }
  { const {game, api} = boot(); const ref = await travelSeed(api); SCENES.town.view = async () => { calls.push('town'); }; // returns without switching
    await click(playerApp(game), ref); assert.match(warned[0], /could not be opened/); SCENES.town.view = makeScene('town', '', {}).view; }
  { const {game} = boot(); await click(playerApp(game), 'no-such-place'); assert.match(warned[0], /isn't available/); }
});

test('already viewing that scene: a note, not silence; and no second view() call', async () => {
  const {game, api} = boot(); const ref = await travelSeed(api); canvasState.viewingId = 'town';
  await click(playerApp(game), ref);
  assert.deepEqual(calls, []); assert.deepEqual(warned, []); assert.deepEqual(noted, ["You're already viewing that scene."]);
});

test('no canvas information (older host): still views once and reports ok', async () => {
  const {game, api} = boot({sceneState: false}); const ref = await travelSeed(api);
  assert.deepEqual(await api.travelToLocation(ref), {ok: true, sceneUuid: 'Scene.town'}); assert.deepEqual(calls, ['town']); void game;
});

/* ---------------- Beasts ids ---------------- */
test('Beasts keep NPC-* and CRE-* ids; a bad id is dropped; People stay NPC-* only', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-GLADE', name: 'G', beasts: [
    {key: 'a', sourceId: 'CRE-ASHEN-SHAMBLER', docType: 'Actor', uuid: ''}, {key: 'b', sourceId: 'CRE-ASHEN-OSSUARY'}, {key: 'c', sourceId: 'NPC-TEST-WOLF'},
    {key: 'd', sourceId: 'cre-lower'}, {key: 'e', sourceId: 'MON-ASHEN-X'}, {key: 'f', label: 'no link'}],
  npcs: [{key: 'n', sourceId: 'CRE-ASHEN-SHAMBLER', uuid: 'Actor.x'}, {key: 'm', sourceId: 'NPC-TEST-MIRA'}]});
  assert.deepEqual(loc.beasts.map(b => b.sourceId), ['CRE-ASHEN-SHAMBLER', 'CRE-ASHEN-OSSUARY', 'NPC-TEST-WOLF']);
  assert.deepEqual(loc.npcs.map(n => n.sourceId), ['', 'NPC-TEST-MIRA']);
  assert.ok(BEAST_ID.test('CRE-A-B_C') && !BEAST_ID.test('CRE-') && !NPC_ID.test('CRE-ASHEN-SHAMBLER'));
  const again = normalizeLocation(JSON.parse(JSON.stringify(loc)));
  assert.deepEqual(again.beasts, loc.beasts, 'round-trips through JSON');
});

test('Beasts ids are GM only: never in the published copy, the player view, the preview or the page HTML', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-GLADE', name: 'G', state: 'revealed', sections: {beasts: true}, beasts: [{key: 'a', label: '[TEST] Shambler', sourceId: 'CRE-ASHEN-SHAMBLER', visible: true}]});
  assert.equal(loc.beasts[0].sourceId, 'CRE-ASHEN-SHAMBLER');
  for (const out of [playerView(loc), previewView(loc, [loc], 'revealed'), publishable(loc), loc.published]) assert.doesNotMatch(JSON.stringify(out), /CRE-ASHEN|Shambler/);
  assert.doesNotMatch(viewHtml(playerView(loc)), /CRE-ASHEN|Shambler/);
});

test('the Actor picker matches Beasts by CRE-* ids (and People still do not)', () => {
  const actor = {uuid: 'Actor.s', name: 'Shambler', documentName: 'Actor', flags: {'ashen-gate-manager': {source: {sourceId: 'CRE-ASHEN-SHAMBLER'}}}};
  assert.equal(actorFacts(actor, {ids: BEAST_ID}).sourceId, 'CRE-ASHEN-SHAMBLER');
  assert.equal(actorFacts(actor).sourceId, '');
});
