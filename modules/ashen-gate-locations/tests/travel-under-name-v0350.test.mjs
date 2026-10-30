/** 0.35.0: the Travel button sits directly under the location's name (GM editor + player viewer). Mocked Foundry: proves the HTML, the rules and the click wiring, not the live Forge window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation} from '../scripts/model.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const calls = [];
const makeScene = (id, name, {navigation = false, observers = []} = {}) => ({
  documentName: 'Scene', id, uuid: `Scene.${id}`, name, navigation,
  testUserPermission: (user, need) => user.isGM || (need === 'OBSERVER' && observers.includes(user.id)),
  view: async () => { calls.push(['view', id]); }, activate: async () => { calls.push(['activate', id]); }
});
const SCENES = {
  town: makeScene('town', '[TEST] Town Square', {navigation: true}),
  crypt: makeScene('crypt', '[TEST] Crypt Level', {observers: ['p1']}),
  vault: makeScene('vault', '[TEST] Secret Vault'),
  tower: makeScene('tower', '[TEST] Tower Top', {navigation: true})
};
const resolveScene = uuid => SCENES[uuid.replace('Scene.', '')] ?? null;
function boot() {
  const game = installFoundry(); calls.length = 0;
  const mod = {version: '0.35.0', active: true};
  mod.api = createApi({version: '0.35.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, resolveScene, currentUser: () => game.user});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
  globalThis.fromUuidSync = resolveScene;
  return {game, api: mod.api};
}
async function seed(api, {state = 'revealed', travel = ['Scene.town', 'Scene.crypt'], scenes = ['Scene.town', 'Scene.crypt', 'Scene.tower', 'Scene.vault']} = {}) {
  const loc = await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: scenes, travelSceneUuids: travel, description: 'A hall.'});
  await api.setLocationState(loc.id, state);
}
const detailOf = html => html.slice(html.indexOf('<section class="agl-detail'));
const count = html => (html.match(/data-action="travel"/g) ?? []).length;
const gmPage = async () => { const app = new LocationsApp(); app.select('LOC-TEST-HALL'); return {app, html: detailOf(await app._renderHTML())}; };
const playerPage = async game => { game.user = player; const app = new LocationsApp(); app.select(readViews()[0]?.key ?? 'LOC-TEST-HALL'); return {app, html: await app._renderHTML()}; };

test('GM editor: exactly one Travel button, in a row directly after the name field, not in the header', async () => {
  const {api} = boot(); await seed(api);
  const {html} = await gmPage();
  assert.equal(count(html), 1);
  const head = html.slice(html.indexOf('agl-editor__head'), html.indexOf('class="agl-title"'));
  assert.doesNotMatch(head, /data-action="travel"/, 'old header button is gone');
  const nameAt = html.indexOf('id="agl-name"'), rowAt = html.indexOf('<div class="agl-travel">'), pubAt = html.indexOf('class="agl-publish"');
  assert.ok(nameAt > 0 && nameAt < rowAt && rowAt < pubAt, 'under the name, above the publish row');
  assert.match(html, /<div class="agl-travel">[\s\S]*?<span>Travel to scene…<\/span>/, 'GM: several linked scenes, switches or not');
});

test('GM: one linked scene says Travel; none (or only missing ones) shows nothing', async () => {
  const {api} = boot(); await seed(api, {scenes: ['Scene.town'], travel: []});
  let {html} = await gmPage();
  assert.match(html, /<div class="agl-travel">[\s\S]*?<span>Travel<\/span>/); assert.doesNotMatch(html, /Travel to scene…/);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.gone'], travelSceneUuids: []});
  ({html} = await gmPage()); assert.equal(count(html), 0); assert.doesNotMatch(html, /agl-travel"/);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: []});
  ({html} = await gmPage()); assert.equal(count(html), 0);
});

test('GM: linked scenes but none ticked for players still travel for the GM, with no extra UI', async () => {
  const {api} = boot(); await seed(api, {travel: [], scenes: ['Scene.town', 'Scene.crypt']});
  const {html} = await gmPage(); assert.equal(count(html), 1);
  assert.doesNotMatch(html, /None are open to players|no scene is ticked/i);
});

test('a new, unsaved location shows no Travel', async () => {
  boot(); const app = new LocationsApp(); app.select(null); app.draft = {...normalizeLocation({}), name: ''}; app.dirty = true;
  assert.equal(count(detailOf(await app._renderHTML())), 0);
});

test('editor re-renders with the button after a scene link or the players switch is saved', async () => {
  const {api} = boot(); await seed(api, {scenes: [], travel: []});
  assert.equal(count((await gmPage()).html), 0);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town'], travelSceneUuids: []});
  assert.match((await gmPage()).html, /<span>Travel<\/span>/);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town', 'Scene.crypt'], travelSceneUuids: ['Scene.town']});
  assert.match((await gmPage()).html, /<span>Travel to scene…<\/span>/);
});

test('player viewer: button right under the name when ticked + published + viewable; one Travel, several Travel to scene…', async () => {
  { const {game, api} = boot(); await seed(api); const {html} = await playerPage(game);
    assert.equal(count(html), 1);
    const h2 = html.indexOf('<h2>[TEST] Hall</h2>'), row = html.indexOf('<div class="agl-travel">'), meta = html.indexOf('class="agl-desc"');
    assert.ok(h2 > 0 && h2 < row && row < meta, 'in the title block');
    assert.match(html, /<span>Travel to scene…<\/span>/); }
  { const {game, api} = boot(); await seed(api, {travel: ['Scene.town']}); const {html} = await playerPage(game);
    assert.match(html, /<span>Travel<\/span>/); assert.doesNotMatch(html, /Travel to scene…/); }
  { const {game, api} = boot(); await seed(api, {travel: ['Scene.town', 'Scene.vault']}); const {html} = await playerPage(game);
    assert.match(html, /<span>Travel<\/span>/, 'vault is ticked but this player cannot view it, so only one is offered'); }
});

test('player viewer: absent when nothing is ticked, not published, not viewable, Hidden or Unidentified', async () => {
  for (const [label, opts] of [['not ticked', {travel: []}], ['not viewable', {travel: ['Scene.vault']}], ['unidentified', {state: 'unidentified'}], ['hidden', {state: 'hidden'}]]) {
    const {game, api} = boot(); await seed(api, opts); const {html} = await playerPage(game);
    assert.equal(count(html), 0, label); assert.doesNotMatch(html, /agl-travel"/, label);
  }
  { const {game, api} = boot(); await seed(api, {travel: []});
    await api.publishLocation?.('LOC-TEST-HALL');
    await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', travelSceneUuids: ['Scene.town']}); // saved, not republished
    const {html} = await playerPage(game); assert.equal(count(html), 0, 'ticked but unpublished'); }
});

test('players never get unticked scene uuids or names in the page', async () => {
  const {game, api} = boot(); await seed(api); const {html} = await playerPage(game);
  assert.equal(/Scene\.|Tower Top|Secret Vault|Town Square|Crypt Level/.test(html), false);
});

test('click: one scene goes straight to travelToLocation; several open the chooser first', async () => {
  const {api} = boot(); await seed(api, {scenes: ['Scene.town'], travel: []});
  const app = new LocationsApp(); app.select('LOC-TEST-HALL');
  await app.onAction({dataset: {action: 'travel', ref: 'LOC-TEST-HALL'}});
  assert.deepEqual(calls, [['view', 'town']]);
  await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: ['Scene.town', 'Scene.crypt']});
  calls.length = 0; let asked = null;
  globalThis.foundry.applications.api.DialogV2 = {wait: async o => { asked = o; return o.buttons.find(b => b.action === 'Scene.crypt').callback(); }};
  await app.onAction({dataset: {action: 'travel', ref: 'LOC-TEST-HALL'}});
  assert.ok(asked, 'chooser opened'); assert.deepEqual(calls, [['view', 'crypt']]);
});

test('the button is a real <button> with a visible label and a tooltip', async () => {
  const {api} = boot(); await seed(api, {scenes: ['Scene.town']});
  const {html} = await gmPage();
  assert.match(html, /<button type="button"[^>]*data-action="travel"[^>]*>/);
  assert.match(html, /<div class="agl-travel"><button[^>]*data-tooltip=|<div class="agl-travel"><button[^>]*title=/);
});
