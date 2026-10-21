/** 1.17.0 UI standard pass: header, tabs, toolbar, rows, footers, GM Setup (D4: Player Access saves with Save Changes),
 *  tooltips instead of title=, kit table in the Travel tracker, Comfortable window size.
 *  Mocked Foundry: proves the markup and the logic, not how Foundry draws the window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, readRoutes, writeRoutes, readRouteViews, usedRouteIds} from '../scripts/store.mjs';
import {parseImport} from '../scripts/model.mjs';
import {gmTrackerHTML} from '../scripts/travel-view.mjs';
import {travelBehaviours} from '../scripts/travel-behaviours.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};
const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;

/** A world with the [TEST] sample, settings and notifications. Returns what was set and said. */
async function world({access = false} = {}) {
  const g = installFoundry();
  const state = {access, accessCalls: [], settings: new Map([['unidentifiedLabel', 'Unknown place'], ['unknownPinImage', ''], ['defaultLegKm', 5]]), info: [], warn: []};
  g.settings = {get: (_, k) => state.settings.get(k), set: async (_, k, v) => { state.settings.set(k, v); return v; }};
  globalThis.ui = {notifications: {info: m => state.info.push(m), warn: m => state.warn.push(m), error: m => state.warn.push(m)}};
  const mod = {version: '1.17.0', active: true};
  mod.api = createApi({version: '1.17.0', isGM: () => game.user.isGM, playerAccessEnabled: () => state.access,
    setPlayerAccess: async v => { state.accessCalls.push(v); state.access = v; }, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, playerIds: () => [],
    routes: {readAll: readRoutes, writeAll: writeRoutes, readViews: readRouteViews, usedIds: usedRouteIds, defaultLegKm: () => 5}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = gm;
  await writeAll(sample);
  return {api: mod.api, state};
}
/** Stand-in for the GM Setup form: the values the GM typed. */
const setupForm = ({access, label = 'Unknown place', image = '', leg = '5'}) => ({
  querySelector: sel => ({'#agl-set-access': {checked: access}, '#agl-set-label': {value: label}, '#agl-set-unknown': {value: image}, '#agl-set-leg': {value: leg}})[sel] ?? null
});
/** A window whose render() only counts (the tests read _renderHTML() themselves). */
const gmApp = () => { const app = new LocationsApp(); app.element = null; app.renders = 0; app.render = async () => { app.renders++; }; return app; };
const footerOf = html => html.slice(html.lastIndexOf('<footer class="ag-footer'), html.indexOf('</footer>', html.lastIndexOf('<footer class="ag-footer')));

test('header: brand span, version from module.json, Help last; tabs are role="tab" with GM Setup last and marked GM', async () => {
  await world();
  const html = await gmApp()._renderHTML();
  assert.match(html, /<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Locations<\/h1>[\s\S]*<span class="ag-version">v1\.17\.0<\/span><button[^>]*data-action="help"/);
  assert.match(html, /<nav class="ag-tabs ag-tabs--scroll" role="tablist"/);
  const tabs = [...html.matchAll(/<button type="button" role="tab" data-tab="(\w+)" aria-selected="(true|false)" class="([^"]*)"/g)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(tabs.map(t => t[0]), ['locations', 'routes', 'setup']);
  assert.deepEqual(tabs[0].slice(1), ['true', 'active']);
  assert.match(tabs[2][2], /ag-tab--gm/);
  assert.match(html, /<i class="fa-solid fa-gears" aria-hidden="true"><\/i> GM Setup/);
});

test('toolbar: search, filters, count, then Import / Export (small) and a plain New location on the right; players get search only', async () => {
  await world({access: true});
  const html = await gmApp()._renderHTML();
  const bar = html.slice(html.indexOf('<div class="ag-toolbar'), html.indexOf('<div class="agl-body'));
  const order = ['class="ag-search"', 'ag-toolbar__filters', 'ag-toolbar__count', 'ag-toolbar__end', 'data-action="import"', 'data-action="export"', 'data-action="new"'].map(s => bar.indexOf(s));
  assert.ok(order.every(i => i >= 0), 'every part is in the toolbar');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the standard order');
  assert.match(bar, /class="ag-btn ag-btn--sm" data-action="import"/);
  assert.match(bar, /class="ag-btn" data-action="new"><i class="fa-solid fa-plus" aria-hidden="true"><\/i><span>New location<\/span>/, 'create is plain, not gold (D2)');
  assert.match(bar, /id="agl-import-file"/);
  assert.match(bar, /<label class="ag-field ag-field--inline agl-ctl"><span>Threat<\/span><select data-filter="threat"/, 'filters are inline kit fields');
  assert.match(bar, /class="ag-chip" id="agl-tree" aria-pressed="false"/, 'Tree is a toggle chip, not a gold button');
  game.user = player;
  const p = await new LocationsApp()._renderHTML();
  assert.doesNotMatch(p, /data-action="(import|export|new)"|ag-toolbar__filters|agl-import-file/);
});

test('list rows are kit rows (no double padding): button.ag-row inside .ag-rows, selected one marked; groups still fold with counts', async () => {
  await world();
  const app = gmApp();
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /<li><button type="button" class="agl-row/, 'no buttons inside .ag-list items any more');
  assert.match(html, /<div class="ag-rows"><button type="button" class="ag-row agl-row is-selected" aria-current="true" data-action="select" data-id="LOC-TEST-ASH-WASTES"/);
  assert.match(html, /data-action="toggle-group"[^>]*aria-expanded="true"[\s\S]*?<span class="agl-count">1<\/span>/);
  assert.match(html, /<span class="ag-badge ag-badge--danger agl-threat agl-threat--deadly">Deadly<\/span>/, 'threat uses kit badge tones');
  await app.onAction({dataset: {action: 'toggle-group', group: '[TEST] Far Reach'}});
  const folded = await app._renderHTML();
  assert.match(folded, /aria-expanded="false"/);
});

test('location editor: Cancel bottom-left, Save Changes (the only gold button) bottom-right, Delete location in the editor header', async () => {
  await world();
  const app = gmApp();
  app.select('LOC-TEST-MILLBROOK');
  const html = await app._renderHTML();
  const foot = footerOf(html);
  assert.match(foot, /^<footer class="ag-footer agl-footer">\s*<button type="button" class="ag-btn ag-btn--ghost" data-action="cancel">/, 'Cancel is first (left)');
  assert.match(foot, /<span class="ag-footer__status" role="status">/);
  assert.match(foot, /data-action="place"[\s\S]*data-action="save"><i[^>]*><\/i><span>Save Changes<\/span><\/button><\/div>\s*$/, 'Save Changes is last (right)');
  assert.doesNotMatch(foot, /data-action="delete"/, 'Delete never sits by Cancel');
  const head = html.slice(html.indexOf('<div class="agl-editor__head">'), html.indexOf('<div class="agl-title">'));
  assert.match(head, /class="ag-btn ag-btn--danger ag-btn--sm" data-action="delete"><i class="fa-solid fa-trash" aria-hidden="true"><\/i><span>Delete location<\/span>/);
  const editor = html.slice(html.indexOf('<form class="agl-editor"'));
  assert.equal((editor.match(/ag-btn--primary/g) ?? []).length, 1, 'one gold button in the editor');
  assert.match(html, /<div class="ag-segmented agl-state" role="radiogroup" aria-label="What players see">/);
  // A new, unsaved location has nothing to delete: Cancel is the way out.
  await app.onAction({dataset: {action: 'new'}}).catch(() => {});
  app.draft ??= {}; app.selectedId = null;
  const fresh = await app._renderHTML();
  assert.doesNotMatch(fresh, /data-action="delete"/);
});

test('route editor: Cancel left, Save Changes right, Delete route in the editor header', async () => {
  const {api} = await world();
  await api.saveRoute({fromId: 'LOC-TEST-MILLBROOK', toId: 'LOC-TEST-ASH-WASTES', distanceKm: 12});
  const app = gmApp();
  app.tab = 'routes';
  const html = await app._renderHTML();
  const foot = footerOf(html);
  assert.match(foot, /^<footer class="ag-footer agl-footer">\s*<button type="button" class="ag-btn ag-btn--ghost" data-action="route-cancel">/);
  assert.match(foot, /data-action="route-save"[^]*<\/button>\s*$/);
  assert.doesNotMatch(foot, /route-delete/);
  assert.match(html, /<div class="agl-editor__head">[\s\S]*?class="ag-btn ag-btn--danger ag-btn--sm" data-action="route-delete"[\s\S]*?Delete route/);
  assert.match(html, /class="ag-btn" data-action="route-new"><i class="fa-solid fa-plus" aria-hidden="true"><\/i><span>New route<\/span>/);
  assert.match(html, /<div class="ag-rows"><button type="button" class="ag-row agl-row is-selected" aria-current="true" data-action="route-select"/);
});

test('GM Setup holds settings only: no Import/Export, Developer Tools collapsed at the end, one footer with Cancel / Save Changes', async () => {
  await world();
  const app = gmApp();
  app.tab = 'setup';
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /data-action="(import|export)"|Save Pin Defaults|Save Leg Length|route-save-setup/);
  assert.match(html, /<details class="ag-devtools"><summary>Developer Tools<\/summary>[\s\S]*data-action="import-sample"[\s\S]*<\/details>\s*<\/div>\s*<footer class="ag-footer">/);
  const foot = footerOf(html);
  assert.match(foot, /^<footer class="ag-footer"><button type="button" class="ag-btn ag-btn--ghost" data-action="setup-cancel">/);
  assert.match(foot, /class="ag-btn ag-btn--primary" data-action="save-setup"[^]*Save Changes<\/span><\/button><\/footer>?$|data-action="save-setup"[^]*Save Changes/);
  assert.equal((html.match(/ag-btn--primary/g) ?? []).length, 1, 'one gold button on GM Setup');
  assert.match(html, /id="agl-set-access"/);
  assert.match(html, /id="agl-set-leg"/);
});

test('D4: Player Access is not saved on tick; Save Changes saves it with the pin defaults and leg length', async () => {
  const {state} = await world({access: false});
  const app = gmApp();
  app.tab = 'setup';
  const html = await app._renderHTML();
  assert.doesNotMatch(html, /data-action-change="player-access"/, 'no instant-save hook on the checkbox');
  assert.match(html, /<input type="checkbox" id="agl-set-access" > Players can open Locations/);
  assert.deepEqual(state.accessCalls, [], 'rendering saves nothing');
  await app.onAction({dataset: {action: 'setup-cancel'}});
  assert.deepEqual(state.accessCalls, [], 'Cancel saves nothing');
  assert.equal(await app.saveSetup(setupForm({access: true, label: '[TEST] Strange place', image: 'icons/x.webp', leg: '8'})), true);
  assert.deepEqual(state.accessCalls, [true], 'Save Changes turns Player Access on');
  assert.equal(state.access, true);
  assert.equal(state.settings.get('unidentifiedLabel'), '[TEST] Strange place');
  assert.equal(state.settings.get('unknownPinImage'), 'icons/x.webp');
  assert.equal(state.settings.get('defaultLegKm'), 8);
  assert.deepEqual(state.info, ['Saved GM Setup.']);
  // Unchanged Player Access is not written again; a blank label falls back to the default.
  await app.saveSetup(setupForm({access: true, label: '  ', leg: '5'}));
  assert.deepEqual(state.accessCalls, [true]);
  assert.equal(state.settings.get('unidentifiedLabel'), 'Unknown location');
});

test('D4: a bad leg length refuses the whole save, so Player Access is not changed either', async () => {
  const {state} = await world({access: true});
  const app = gmApp();
  assert.equal(await app.saveSetup(setupForm({access: false, label: '[TEST] Changed', leg: '0.001'})), false);
  assert.deepEqual(state.accessCalls, []);
  assert.equal(state.access, true);
  assert.equal(state.settings.get('unidentifiedLabel'), 'Unknown place');
  assert.equal(state.settings.get('defaultLegKm'), 5);
  assert.match(state.warn[0], /Leg length must be from 0\.01 to 100000 km/);
});

test('no native title= anywhere: GM list, editor, Routes, GM Setup and the player view use data-tooltip; icon-only buttons have a label', async () => {
  const {api} = await world({access: true});
  await api.saveRoute({fromId: 'LOC-TEST-MILLBROOK', toId: 'LOC-TEST-ASH-WASTES', distanceKm: 12});
  const app = gmApp();
  const pages = [];
  for (const id of ['LOC-TEST-MILLBROOK', 'LOC-TEST-ASH-WASTES']) { app.select(id); pages.push(await app._renderHTML()); }
  app.treeMode = true; pages.push(await app._renderHTML()); app.treeMode = false;
  app.tab = 'routes'; pages.push(await app._renderHTML());
  app.tab = 'setup'; pages.push(await app._renderHTML());
  await api.setLocationState('LOC-TEST-MILLBROOK', 'revealed');
  game.user = player;
  const p = new LocationsApp(); p.select('LOC-TEST-MILLBROOK'); pages.push(await p._renderHTML());
  for (const html of pages) {
    assert.doesNotMatch(html, /\stitle="/, 'no title attribute');
    for (const [b] of html.matchAll(/<button\b[^>]*>(?:<i[^>]*><\/i>)<\/button>/g)) assert.match(b, /aria-label="[^"]+"[^>]*data-tooltip="[^"]+" data-tooltip-class="ag-tooltip"/, `icon-only button needs a label and a tooltip: ${b}`);
  }
  assert.match(pages[0], /data-action="move-block"[^>]*aria-label="Move Description up" data-tooltip="Move Description up" data-tooltip-class="ag-tooltip"/);
});

test('empty states use the kit layout; the player one names no GM tool', async () => {
  const g = installFoundry();
  g.settings = {get: () => undefined, set: async () => {}};
  const mod = {version: '1.17.0', active: true};
  mod.api = createApi({version: '1.17.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = gm;
  const gmHtml = await new LocationsApp()._renderHTML();
  assert.match(gmHtml, /<p class="ag-empty__title">No locations yet<\/p><p class="ag-empty__text">Create one with New location, or import a file\.<\/p>/);
  g.user = player;
  const pHtml = await new LocationsApp()._renderHTML();
  assert.match(pHtml, /<p class="ag-empty__title">No locations yet<\/p><p class="ag-empty__text">Your GM hasn't revealed any places yet\.<\/p>/);
  assert.doesNotMatch(pHtml, /New location|import/i);
});

test('Travel tracker: brand header, kit table for the night watches, opacity slider kept', () => {
  const j = {id: 'J', routeId: 'R', fromId: 'A', toId: 'B', legs: 4, legIndex: 1, distanceKm: 20, currentChance: 20, hazardCount: 0, status: 'active', log: [], paused: false,
    behaviours: {watch: {enabled: true, first: ['a1'], second: [], third: []}}};
  const behaviours = travelBehaviours({api: () => ({travel: {}}), characters: () => [{id: 'a1', name: '[TEST] Ava'}], skillLabel: id => id});
  const watch = behaviours.find(b => b.id === 'watch');
  const html = gmTrackerHTML({journey: j, version: '1.17.0', panels: [{id: 'watch', label: watch.label, icon: watch.icon, html: watch.render({isGM: true, journey: j})}]});
  assert.match(html, /<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Travel<\/h1>[\s\S]*ag-version/);
  assert.match(html, /<div class="ag-table-wrap"><table class="ag-table agl-travel__watch"><thead><tr><th scope="col">Character<\/th>/);
  assert.match(html, /data-travel-opacity/);
  assert.doesNotMatch(html, /\stitle="/);
});

test('windows open through windowSize(): Comfortable makes the Locations window 1.2× larger', async () => {
  await world();
  const doc = globalThis.document;
  try {
    globalThis.document = {documentElement: {dataset: {}}};
    assert.deepEqual(new LocationsApp().options.position, {width: 980, height: 720});
    globalThis.document = {documentElement: {dataset: {agSize: 'comfortable'}}};
    globalThis.innerWidth = 4000; globalThis.innerHeight = 3000;
    assert.deepEqual(new LocationsApp().options.position, {width: 1176, height: 864});
    assert.deepEqual(LocationsApp.DEFAULT_OPTIONS.classes, ['ag-app', 'agl-app'], 'the window class uses the module prefix');
  } finally { globalThis.document = doc; delete globalThis.innerWidth; delete globalThis.innerHeight; }
});
