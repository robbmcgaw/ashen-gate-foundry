/** 1.6.1: threat levels and the grouped GM list. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {THREATS, normalizeLocation} from '../scripts/model.mjs';
import {groupRows, applyFilters, filterOptions, comparator, searchText, matchesQuery, NONE, HAS} from '../scripts/list-filter.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

function boot() {
  const g = installFoundry();
  const mod = {version: '1.6.1', active: true};
  mod.api = createApi({version: '1.6.1', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
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

test('groupRows: region (No region last), threat order, profession with a location under several', () => {
  const rows = [L('B', {region: 'North', threat: 'hot'}), L('A', {region: 'North', threat: 'settled', resources: [{skill: 'Herbalism'}, {skill: 'Mining'}, {skill: 'Herbalism'}]}),
    L('C', {threat: 'deadly'}), L('D', {region: 'Aeries', threat: 'light', resources: [{skill: 'Mining'}]})];
  const r = groupRows(rows.sort(comparator()), 'region');
  assert.deepEqual(r.map(g => g.label), ['Aeries', 'North', 'No region']);
  assert.deepEqual(r[1].rows.map(x => x.name), ['[TEST] A', '[TEST] B'], 'sorted by name');
  assert.deepEqual(groupRows(rows.sort(comparator()), 'threat').map(g => g.label), ['Settled', 'Light', 'Hot', 'Deadly']);
  const p = groupRows(rows.sort(comparator()), 'profession');
  assert.deepEqual(p.map(g => g.label), ['Herbalism', 'Mining', 'No gathering']);
  assert.deepEqual(p[1].rows.map(x => x.name), ['[TEST] A', '[TEST] D']);
  assert.equal(p[0].rows.length, 1, 'duplicate skills on one location count once');
});

async function gmWindow() {
  const api = boot();
  for (const l of [L('Mill', {region: 'North', threat: 'light', resources: [{label: 'Reeds', skill: 'Herbalism'}]}), L('Mine', {region: 'North', threat: 'hot', resources: [{label: 'Ore', skill: 'Mining'}, {label: 'Moss', skill: 'Herbalism'}]}),
    L('Keep', {region: 'South', threat: 'settled'})]) await api.saveLocation(l);
  const app = new LocationsApp();
  app.render = async () => {};
  return app;
}

const listPane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
const names = html => [...listPane(html).matchAll(/agl-row__name">([^<]*)</g)].map(m => m[1].replace('[TEST] ', ''));

test('GM list: counts, fold, group by none/threat/profession/quest', async () => {
  const app = await gmWindow();
  let html = await app._renderHTML();
  assert.match(html, /<span>North<\/span><span class="agl-count">2<\/span>/);
  assert.match(html, /Showing 3 of 3/);
  await app.onAction({dataset: {action: 'toggle-group', group: 'North'}});
  html = await app._renderHTML();
  assert.match(html, /data-group="North"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(listPane(html), /Mill/, 'folded group hides its rows');
  app.groupBy = 'profession';
  html = await app._renderHTML();
  assert.match(html, /<span>Herbalism<\/span><span class="agl-count">2<\/span>/);
  app.groupBy = 'none';
  html = await app._renderHTML();
  assert.doesNotMatch(listPane(html), /agl-group__head/);
  assert.deepEqual(names(html), ['Keep', 'Mill', 'Mine']);
});

test('search finds skills, node and material names, region, threat and linked quest names; words combine', async () => {
  const l = {name: '[TEST] Mill', region: 'North', threat: 'light', resources: [{label: 'Reeds', skill: 'Herbalism', materialId: 'MAT-REED'}], quests: [{questId: 'QUEST-X'}]};
  const text = searchText(l, {questName: () => 'Find the Mill', materialName: id => id === 'MAT-REED' ? 'Reed Bundle' : id});
  for (const q of ['herbalism', 'reeds', 'reed bundle', 'north', 'light', 'find the mill', 'quest-x', 'herbalism north']) assert.ok(matchesQuery(text, q), q);
  assert.ok(!matchesQuery(text, 'mining'));
  const app = await gmWindow();
  app.query = 'Herbalism';
  assert.deepEqual(names(await app._renderHTML()).sort(), ['Mill', 'Mine']);
});

test('filters combine with AND, counts follow the other filters, Clear filters resets, Showing N of M', async () => {
  const app = await gmWindow();
  app.filters.profession = 'Herbalism'; app.filters.threat = 'hot';
  let html = await app._renderHTML();
  assert.deepEqual(names(html), ['Mine']);
  assert.match(html, /Showing 1 of 3/);
  const rows = (await import('../scripts/store.mjs')).readAll();
  const opts = filterOptions(rows, {...app.filters, threat: ''});
  assert.deepEqual(opts.threat.filter(o => o.count).map(o => [o.value, o.count]), [['light', 1], ['hot', 1]], 'threat counts ignore the threat filter itself');
  app.filters.threat = 'deadly';
  html = await app._renderHTML();
  assert.match(html, /Nothing matches[\s\S]*No locations match this search and these filters/);
  assert.match(html, /data-action="clear-filters"/);
  assert.match(html, /agl-detail/, 'the editor is not blanked');
  await app.onAction({dataset: {action: 'clear-filters'}});
  assert.equal(names(await app._renderHTML()).length, 3);
  assert.equal(app.query, '');
});

test('quest and status filters; sort keys and direction', () => {
  const rows = [normalizeLocation({id: 'LOC-A', name: 'A', threat: 'hot', quests: [{questId: 'QUEST-1'}], state: 'revealed', resources: [{skill: 'Mining'}, {skill: 'Mining'}]}),
    normalizeLocation({id: 'LOC-B', name: 'B', threat: 'settled', region: 'Zed', state: 'hidden'}), normalizeLocation({id: 'LOC-C', name: 'C', threat: 'deadly', region: 'Aa', state: 'unidentified'})];
  const f = o => applyFilters(rows, {threat: '', region: '', profession: '', quest: '', status: '', ...o}).map(l => l.name);
  assert.deepEqual(f({quest: HAS}), ['A']);
  assert.deepEqual(f({quest: NONE}), ['B', 'C']);
  assert.deepEqual(f({quest: 'QUEST-1'}), ['A']);
  assert.deepEqual(f({status: 'hidden'}), ['B']);
  assert.deepEqual(f({region: NONE}), ['A']);
  const sorted = (k, d) => [...rows].sort(comparator(k, d)).map(l => l.name);
  assert.deepEqual(sorted('threat', false), ['B', 'A', 'C'], 'safest first');
  assert.deepEqual(sorted('threat', true), ['C', 'A', 'B'], 'most dangerous first');
  assert.deepEqual(sorted('region'), ['C', 'B', 'A'], 'region then name, no region last');
  assert.deepEqual(sorted('nodes', true), ['A', 'B', 'C']);
  assert.deepEqual(sorted('status'), ['B', 'C', 'A']);
  assert.deepEqual(sorted('name', true), ['C', 'B', 'A']);
  assert.deepEqual(groupRows(rows, 'quest').map(g => g.label), ['QUEST-1', 'No quest']);
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
  assert.match(html, /<h3[^>]*>North<\/h3>/);
});

test('100+ locations group quickly', async () => {
  const api = boot();
  await writeAll(Array.from({length: 300}, (_, i) => normalizeLocation({id: `LOC-TEST-${i}`, name: `[TEST] Place ${i}`, region: `R${i % 12}`, threat: THREATS[i % 5].value,
    resources: [{skill: ['Mining', 'Herbalism', 'Fishing'][i % 3]}]})));
  const app = new LocationsApp();
  app.render = async () => {};
  const t = performance.now();
  app.query = 'mining'; app.filters.threat = 'hot'; app.sort = 'nodes';
  for (const m of ['none', 'region', 'threat', 'profession', 'quest']) { app.groupBy = m; await app._renderHTML(); }
  assert.ok(performance.now() - t < 1500, `3 renders of 300 locations took ${Math.round(performance.now() - t)}ms`);
  void api;
});
