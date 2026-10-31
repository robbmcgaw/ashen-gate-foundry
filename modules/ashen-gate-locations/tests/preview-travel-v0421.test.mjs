/** 0.42.1: the Player Preview's Travel chip follows the previewed draft's "Players can travel here" ticks (Revealed card only), not every linked scene.
 *  Mocked Foundry: proves the HTML and the rules, not the live Forge dialog. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {normalizeLocation} from '../scripts/model.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const mk = (id, name, navigation = true) => ({documentName: 'Scene', id, uuid: `Scene.${id}`, name, navigation, testUserPermission: user => user.isGM, view: async () => {}, activate: async () => {}});
const SCENES = {town: mk('town', '[TEST] Town Square'), tower: mk('tower', '[TEST] Tower Top')};
const resolveScene = uuid => SCENES[uuid.replace('Scene.', '')] ?? null;
function boot({access = true} = {}) {
  const game = installFoundry();
  const mod = {version: '0.42.1', active: true};
  mod.api = createApi({version: '0.42.1', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, resolveScene, currentUser: () => game.user});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
  globalThis.fromUuidSync = resolveScene;
  return {game, api: mod.api};
}
const LINKED = ['Scene.town', 'Scene.tower'];
async function seed(api, {state = 'revealed', travel = []} = {}) {
  const loc = await api.saveLocation({id: 'LOC-TEST-HALL', name: '[TEST] Hall', sceneUuids: LINKED, travelSceneUuids: travel, unidentifiedLabel: 'Unknown place', description: 'A hall.'});
  await api.setLocationState(loc.id, state);
}
const count = html => (html.match(/data-action="travel"/g) ?? []).length;
const part = (html, st) => html.split('<section class="agl-preview__part"').find(p => p.includes(`data-state="${st}"`)) ?? '';
async function previewOf(api, travel, state = 'revealed') {
  const app = new LocationsApp();
  app.draft = normalizeLocation({...(await api.getLocation('LOC-TEST-HALL')), travelSceneUuids: travel, state});
  return app.previewHtml(true);
}

test('preview: no travel switch ticked shows no Travel chip on any card, although scenes are linked', async () => {
  const {api} = boot(); await seed(api);
  const html = await previewOf(api, []);
  assert.equal(count(html), 0);
});

test('preview: one tick shows Travel on the Revealed card only; Unidentified never', async () => {
  const {api} = boot(); await seed(api);
  const html = await previewOf(api, ['Scene.town']);
  assert.equal(count(part(html, 'revealed')), 1);
  assert.match(part(html, 'revealed'), /<span>Travel<\/span>/, 'one ticked scene: plain Travel');
  assert.equal(count(part(html, 'unidentified')), 0);
  assert.equal(count(html), 1);
  assert.equal(count(await previewOf(api, ['Scene.town'], 'unidentified')), 1, 'still only the Revealed card');
  assert.equal(count(await previewOf(api, ['Scene.town'], 'hidden')), 1);
  assert.match(part(await previewOf(api, ['Scene.town', 'Scene.tower']), 'revealed'), /Travel to scene…/);
});

test('preview: follows the unsaved draft, and shows nothing when Player Access is off or the ticked scene is gone', async () => {
  const {api} = boot(); await seed(api, {travel: ['Scene.town']});
  assert.equal(count(await previewOf(api, [])), 0, 'saved tick, draft unticked: no chip');
  assert.equal(count(await previewOf(api, ['Scene.tower'])), 1, 'saved untick, draft ticked: chip');
  const off = boot({access: false}); await seed(off.api, {travel: ['Scene.town']});
  assert.equal(count(await previewOf(off.api, ['Scene.town'])), 0, 'players could not open the window');
  const {api: a2} = boot(); await seed(a2);
  const app = new LocationsApp();
  app.draft = normalizeLocation({...(await a2.getLocation('LOC-TEST-HALL')), sceneUuids: [...LINKED, 'Scene.gone'], travelSceneUuids: ['Scene.gone']});
  assert.equal(count(app.previewHtml(true)), 0);
});

test('GM editor Travel button is unchanged (every linked scene, ticks or not) and the GM API still lists them', async () => {
  const {api} = boot(); await seed(api);
  const app = new LocationsApp(); app.select('LOC-TEST-HALL');
  const html = await app._renderHTML();
  const detail = html.slice(html.indexOf('<section class="agl-detail'));
  assert.equal(count(detail), 1);
  assert.match(detail, /<span>Travel to scene…<\/span>/);
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.name), ['[TEST] Tower Top', '[TEST] Town Square']);
  assert.equal(api.previewTravelCount(['Scene.town']), 1);
});

test('real player path is unchanged: only published ticks, Revealed only; previewTravelCount is GM only', async () => {
  const {game, api} = boot(); await seed(api, {travel: ['Scene.town']});
  game.user = player;
  assert.deepEqual(api.travelScenes('LOC-TEST-HALL').map(s => s.uuid), ['Scene.town']);
  const app = new LocationsApp(); app.select(readViews()[0].key);
  assert.equal(count(await app._renderHTML()), 1);
  assert.throws(() => api.previewTravelCount(['Scene.town']), /GM/i);
});
