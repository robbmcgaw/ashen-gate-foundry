/** 1.6.0: threat levels and the grouped GM list. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {THREATS, groupLocations, normalizeLocation} from '../scripts/model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

function boot() {
  const g = installFoundry();
  const mod = {version: '1.6.0', active: true};
  mod.api = createApi({version: '1.6.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  return mod.api;
}
const L = (name, extra = {}) => ({name: `[TEST] ${name}`, ...extra});

test('threat levels run safest to most dangerous; old values unchanged; Settled and Light are kept on save', () => {
  assert.deepEqual(THREATS.map(t => t.value), ['settled', 'light', 'normal', 'hot', 'deadly']);
  assert.equal(normalizeLocation({threat: 'settled'}).threat, 'settled');
  assert.equal(normalizeLocation({threat: 'light'}).threat, 'light');
  assert.equal(normalizeLocation({threat: 'hot'}).threat, 'hot');
  assert.equal(normalizeLocation({}).threat, 'normal');
  assert.equal(normalizeLocation({threat: 'nonsense'}).threat, 'normal');
});

test('groupLocations: region (No region last), threat order, profession with a location under several', () => {
  const rows = [L('B', {region: 'North', threat: 'hot'}), L('A', {region: 'North', threat: 'settled', resources: [{skill: 'Herbalism'}, {skill: 'Mining'}, {skill: 'Herbalism'}]}),
    L('C', {threat: 'deadly'}), L('D', {region: 'Aeries', threat: 'light', resources: [{skill: 'Mining'}]})];
  const r = groupLocations(rows, 'region');
  assert.deepEqual(r.map(g => g.label), ['Aeries', 'North', 'No region']);
  assert.deepEqual(r[1].rows.map(x => x.name), ['[TEST] A', '[TEST] B'], 'sorted by name');
  assert.deepEqual(groupLocations(rows, 'threat').map(g => g.label), ['Settled', 'Light', 'Hot', 'Deadly']);
  const p = groupLocations(rows, 'profession');
  assert.deepEqual(p.map(g => g.label), ['Herbalism', 'Mining', 'No gathering']);
  assert.deepEqual(p[1].rows.map(x => x.name), ['[TEST] A', '[TEST] D']);
  assert.equal(p[0].rows.length, 1, 'duplicate skills on one location count once');
});

const listPane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
async function gmWindow() {
  const api = boot();
  for (const l of [L('Mill', {region: 'North', threat: 'light', resources: [{label: 'Reeds', skill: 'Herbalism'}]}), L('Mine', {region: 'North', threat: 'hot', resources: [{label: 'Ore', skill: 'Mining'}, {label: 'Moss', skill: 'Herbalism'}]}),
    L('Keep', {region: 'South', threat: 'settled'})]) await api.saveLocation(l);
  const app = new LocationsApp();
  app.render = async () => {};
  return app;
}

test('GM list: groups show counts, fold, group by threat/profession, and only-one-group hides the rest', async () => {
  const app = await gmWindow();
  let html = await app._renderHTML();
  assert.match(html, /<span>North<\/span><span class="agl-count">2<\/span>/);
  assert.match(html, /<span>South<\/span><span class="agl-count">1<\/span>/);
  assert.match(html, /data-group="North"[^>]*aria-expanded="true"/);
  await app.onAction({dataset: {action: 'toggle-group', group: 'North'}});
  html = await app._renderHTML();
  assert.match(html, /data-group="North"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(listPane(html), /\[TEST\] Mill/, 'folded group hides its rows');
  assert.match(listPane(html), /\[TEST\] Keep/);
  app.groupBy = 'profession';
  html = await app._renderHTML();
  assert.match(html, /<span>Herbalism<\/span><span class="agl-count">2<\/span>/);
  assert.match(html, /<span>Mining<\/span><span class="agl-count">1<\/span>/);
  assert.match(html, /<span>No gathering<\/span>/);
  app.groupBy = 'threat';
  html = await app._renderHTML();
  assert.ok(html.indexOf('<span>Settled</span>') < html.indexOf('<span>Light</span>') && html.indexOf('<span>Light</span>') < html.indexOf('<span>Hot</span>'));
  app.groupBy = 'region'; app.onlyGroup = true;
  await app.onAction({dataset: {action: 'toggle-group', group: 'South'}});
  html = await app._renderHTML();
  assert.match(listPane(html), /\[TEST\] Keep/);
  assert.doesNotMatch(listPane(html), /\[TEST\] Mill|\[TEST\] Mine|<span>North<\/span>/, 'everything else is hidden');
  await app.onAction({dataset: {action: 'toggle-group', group: 'South'}});
  assert.match(await app._renderHTML(), /<span>North<\/span>/, 'clicking again shows all');
});

test('player list stays simple: revealed only, plain headings, no grouping controls', async () => {
  const api = boot();
  const a = await api.saveLocation(L('Open', {region: 'North'}));
  await api.saveLocation(L('Secret', {region: 'North'}));
  await api.setLocationState(a.id, 'revealed');
  game.user = player;
  const html = await new LocationsApp()._renderHTML();
  assert.match(html, /\[TEST\] Open/);
  assert.doesNotMatch(html, /Secret|agl-groupby|agl-onlygroup|toggle-group|agl-count/);
  assert.match(html, /<h3>North<\/h3>/);
});

test('100+ locations group quickly', async () => {
  const api = boot();
  await writeAll(Array.from({length: 300}, (_, i) => normalizeLocation({id: `LOC-TEST-${i}`, name: `[TEST] Place ${i}`, region: `R${i % 12}`, threat: THREATS[i % 5].value,
    resources: [{skill: ['Mining', 'Herbalism', 'Fishing'][i % 3]}]})));
  const app = new LocationsApp();
  app.render = async () => {};
  const t = performance.now();
  for (const m of ['region', 'threat', 'profession']) { app.groupBy = m; await app._renderHTML(); }
  assert.ok(performance.now() - t < 1500, `3 renders of 300 locations took ${Math.round(performance.now() - t)}ms`);
  void api;
});
