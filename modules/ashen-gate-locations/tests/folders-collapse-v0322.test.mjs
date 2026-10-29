/** 0.32.2: any folder can be collapsed even with a place selected; selecting a place folds the other folders and opens its path. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {arrangeFolds, buildRegionSections, readFolds, GM_ACCESS} from '../scripts/region-groups.mjs';
import {uiState} from '../scripts/ag-html.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

function boot() {
  const game = installFoundry();
  const mod = {version: '0.32.2', active: true};
  mod.api = createApi({version: '0.32.2', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  return {game, api: mod.api};
}
// North > Keep Region > Hall ; North > Annex Region > Cellar ; South > Pier ; South > Dock
async function seed(api) {
  const ids = {};
  for (const [key, name, extra] of [['north', 'North', {isRegion: true}], ['keep', 'Keep', {isRegion: true}], ['hall', 'Hall', {}], ['annex', 'Annex', {isRegion: true}], ['cellar', 'Cellar', {}],
    ['south', 'South', {isRegion: true}], ['pier', 'Pier', {}], ['dock', 'Dock', {}]]) ids[key] = (await api.saveLocation({id: `LOC-${key.toUpperCase()}`, name: `[TEST] ${name}`, ...extra})).id;
  for (const [k, p] of Object.entries({keep: 'north', hall: 'keep', annex: 'north', cellar: 'annex', pier: 'south', dock: 'south'})) await api.moveLocation(ids[k], ids[p]);
  return ids;
}
const pane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
const state = (html, id) => (pane(html).match(new RegExp(`data-action="(?:region-fold|tree-toggle)" data-id="${id}" aria-expanded="(true|false)"`)) ?? [])[1];
const fold = (app, id) => app.onAction({dataset: {action: 'region-fold', id}});
const draw = async app => pane(await app._renderHTML());

test('selecting a place folds every folder that does not hold it and opens its path; the selected row is shown', async () => {
  const {api} = boot(); const ids = await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  app.select(ids.hall);
  const html = await draw(app);
  assert.equal(state(html, ids.north), 'true'); assert.equal(state(html, ids.keep), 'true');
  assert.equal(state(html, ids.annex), 'false'); assert.equal(state(html, ids.south), 'false');
  assert.match(html, /\[TEST\] Hall/); assert.doesNotMatch(html, /Cellar|Pier|Dock/);
  assert.match(html, /is-selected[^>]*aria-current="true"[^>]*>[\s\S]*?Hall/, 'the selected row is marked');
});

test('the ancestors of the selected place, including its top-level folder, can be collapsed; a redraw does not reopen them', async () => {
  const {api} = boot(); const ids = await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  app.select(ids.hall); await draw(app);
  await fold(app, ids.keep);
  let html = await draw(app);
  assert.equal(state(html, ids.keep), 'false'); assert.doesNotMatch(html, /Hall/, 'the selected row is hidden inside the collapsed folder');
  assert.equal(app.selectedId, ids.hall, 'the selection itself is untouched');
  await fold(app, ids.north);
  html = await draw(app);
  assert.equal(state(html, ids.north), 'false'); assert.doesNotMatch(html, /Keep|Annex/);
  for (let i = 0; i < 3; i++) html = await draw(app);   // redraws (save, publish, refresh)
  assert.equal(state(html, ids.north), 'false', 'redraws leave it collapsed');
  await fold(app, ids.north);
  assert.equal(state(await draw(app), ids.north), 'true', 'and it opens again by click');
});

test('a manually opened non-ancestor stays open until the selection changes; then non-ancestors fold again', async () => {
  const {api} = boot(); const ids = await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  app.select(ids.hall); await draw(app);
  await fold(app, ids.south);
  assert.equal(state(await draw(app), ids.south), 'true');
  app.select(ids.cellar);
  const html = await draw(app);
  assert.equal(state(html, ids.south), 'false', 'South does not hold the new selection');
  assert.equal(state(html, ids.annex), 'true'); assert.equal(state(html, ids.keep), 'false');
  assert.match(html, /Cellar/);
  app.select(ids.cellar); assert.equal(state(await draw(app), ids.annex), 'true', 'selecting the same place again changes nothing');
});

test('the first row picked for an empty window is not a choice, so it does not fold the remembered folders', async () => {
  const {api} = boot(); await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  const html = await draw(app);
  assert.ok(app.selectedId, 'a row was picked');
  assert.equal(app.folds.size, 0, 'nothing was folded by the default pick');
  assert.doesNotMatch(html, /region-fold" data-id="[^"]+" aria-expanded="false"/);
});

test('search opens headers with matches; a manual collapse wins until the search text changes', async () => {
  const {api} = boot(); const ids = await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  app.select(ids.pier); await draw(app);
  app.query = 'e';   // matches Keep/Hall/Annex/Cellar/Pier/Dock-ish names
  let html = await draw(app);
  assert.equal(state(html, ids.north), 'true'); assert.equal(state(html, ids.south), 'true');
  await fold(app, ids.south);
  html = await draw(app);
  assert.equal(state(html, ids.south), 'false', 'collapsed while searching');
  assert.equal(app.folds.has(ids.south), false, 'a search-time collapse is not saved');
  await draw(app); assert.equal(state(await draw(app), ids.south), 'false', 'redraws respect it');
  app.query = 'el';
  html = await draw(app);
  assert.equal(state(html, ids.annex), 'true'); assert.match(html, /Cellar/);
  app.query = 'e';
  assert.equal(state(await draw(app), ids.south), 'true', 'changing the text resets the manual collapse');
  app.query = '';
  assert.equal(state(await draw(app), ids.south), 'true', 'with no search the saved state applies (South holds the open place and was never saved as folded)');
});

test('Tree mode: the same rule for folders', async () => {
  const {api} = boot(); const ids = await seed(api);
  LocationsApp.treeOpen.clear();
  const app = new LocationsApp(); app.render = async () => {};
  app.treeMode = true; app.select(ids.hall);
  let html = await draw(app);
  assert.equal(state(html, ids.north), 'true'); assert.equal(state(html, ids.keep), 'true'); assert.equal(state(html, ids.south), 'false');
  assert.match(html, /Hall/);
  await app.onAction({dataset: {action: 'tree-toggle', id: ids.north}});
  html = await draw(app);
  assert.equal(state(html, ids.north), 'false'); assert.doesNotMatch(html, /Hall/);
  html = await draw(app); assert.equal(state(html, ids.north), 'false', 'a redraw keeps it collapsed');
  await app.onAction({dataset: {action: 'tree-toggle', id: ids.south}});
  assert.equal(state(await draw(app), ids.south), 'true');
  app.select(ids.pier);
  html = await draw(app);
  assert.equal(state(html, ids.south), 'true'); assert.equal(state(html, ids.north), 'false');
  app.query = 'hall'; html = await draw(app);
  assert.equal(state(html, ids.north), 'true', 'search opens the path');
  await app.onAction({dataset: {action: 'tree-toggle', id: ids.north}});
  assert.equal(state(await draw(app), ids.north), 'false', 'and a click collapses it while searching');
  LocationsApp.treeOpen.clear();
});

test('switching between the list and Tree arranges the folders for the open place again', async () => {
  const {api} = boot(); const ids = await seed(api);
  LocationsApp.treeOpen.clear();
  const app = new LocationsApp(); app.render = async () => {};
  app.select(ids.hall); await draw(app); await fold(app, ids.south);
  app.treeMode = true; app.arrangedFor = undefined;   // what the Tree button does
  const tree = await draw(app);
  assert.equal(state(tree, ids.north), 'true'); assert.equal(state(tree, ids.south), 'false');
  app.treeMode = false; app.arrangedFor = undefined;
  const list = await draw(app);
  assert.equal(state(list, ids.south), 'false'); assert.equal(state(list, ids.keep), 'true');
  LocationsApp.treeOpen.clear();
});

test('players: the same rule over what they can see, and a hidden Region is never named', async () => {
  const {game, api} = boot(); const ids = await seed(api);
  for (const k of ['north', 'keep', 'hall', 'annex', 'cellar', 'pier', 'dock']) await api.setLocationState(ids[k], 'revealed');   // South stays hidden
  game.user = player;
  const views = readViews(); const key = n => views.find(v => v.name === `[TEST] ${n}`).key;
  const app = new LocationsApp(); app.render = async () => {};
  app.select(key('Hall'));
  let html = await draw(app);
  assert.equal(state(html, key('North')), 'true'); assert.equal(state(html, key('Keep')), 'true'); assert.equal(state(html, key('Annex')), 'false');
  assert.match(html, /Hall/); assert.doesNotMatch(html, /Cellar/);
  await fold(app, key('Keep'));
  html = await draw(app);
  assert.equal(state(html, key('Keep')), 'false'); assert.doesNotMatch(html, /Hall/);
  html = await draw(app); assert.equal(state(html, key('Keep')), 'false');
  app.select(key('Cellar'));
  html = await draw(app);
  assert.equal(state(html, key('Keep')), 'false'); assert.equal(state(html, key('Annex')), 'true'); assert.match(html, /Cellar/);
  app.query = 'cellar'; html = await draw(app);
  await fold(app, key('Annex')); assert.equal(state(await draw(app), key('Annex')), 'false');
  assert.doesNotMatch(await app._renderHTML(), /\[TEST\] South|LOC-SOUTH/);
});

test('persistence: the arrangement and clicks are remembered per user and read back by a new window', async () => {
  const data = {};
  const storage = {getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }};
  const mem = uiState('t', {storage, userId: 'u1'});
  const items = [{id: 'A', name: 'A', isRegion: true}, {id: 'B', name: 'B', isRegion: true}, {id: 'a1', name: 'a1', parentLocationId: 'A'}, {id: 'b1', name: 'b1', parentLocationId: 'B'}];
  const folds = readFolds(mem);
  arrangeFolds(mem, folds, buildRegionSections(items, GM_ACCESS), 'a1', GM_ACCESS);
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u1'}))], ['B']);
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u2'}))], [], 'another user is untouched');
  arrangeFolds(mem, folds, buildRegionSections(items, GM_ACCESS), 'b1', GM_ACCESS);
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u1'}))], ['A']);
  arrangeFolds(mem, folds, buildRegionSections(items, GM_ACCESS), null, GM_ACCESS);
  assert.deepEqual([...folds], ['A'], 'no selection changes nothing');
  arrangeFolds({set() { throw new Error('blocked'); }}, folds, buildRegionSections(items, GM_ACCESS), 'a1', GM_ACCESS);
  assert.deepEqual([...folds], ['B'], 'blocked storage still arranges the live set');
});
