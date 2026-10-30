/** 0.34.0 api.listModel: the Locations list as data for Character Hub. Mocked Foundry: proves the shape, parity with the window's own list
 *  (same functions), the player-safe rules and the pass-through to openLocation; not the live window or Forge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
import {buildListModel, cleanFilters, cleanSort, LIST_CONTRACT} from '../scripts/list-model.mjs';
import {SORTS, FILTER_CONTROLS} from '../scripts/list-filter.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const opened = [];
function boot({access = true} = {}) {
  const game = installFoundry();
  opened.length = 0;
  const mod = {version: '0.35.0', active: true};
  mod.api = createApi({version: '0.35.0', isGM: () => game.user.isGM, playerAccessEnabled: () => access, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: ref => opened.push(ref), listContext: () => ({templates: [], questName: id => id, materialName: id => id})});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  return {game, api: mod.api};
}
/** Frontier > Approaches > Fosstryn > Muster, a shop inside a non-Region place, loose places, one hidden and one unidentified place. */
async function seed(api) {
  const save = async (data, state = 'revealed') => { const l = await api.saveLocation(data); await api.setLocationState(l.id, state); return l; };
  const frontier = await save({name: '[TEST] Frontier', isRegion: true});
  const approaches = await save({name: '[TEST] Approaches', isRegion: true, parentLocationId: frontier.id});
  const fosstryn = await save({name: '[TEST] Fosstryn', isRegion: true, parentLocationId: approaches.id});
  const muster = await save({name: '[TEST] Muster', type: 'Yard', parentLocationId: fosstryn.id, threat: 'hot'});
  const market = await save({name: '[TEST] Market', parentLocationId: fosstryn.id, threat: 'settled'});
  await save({name: '[TEST] Smithy', parentLocationId: market.id});
  await save({name: '[TEST] Lone Mill', region: '[TEST] Elsewhere', threat: 'deadly'});
  await save({name: '[TEST] Nowhere Hut'});
  await save({name: '[TEST] Secret Vault', parentLocationId: fosstryn.id, description: 'SECRET-GM-TEXT'}, 'hidden');
  await save({name: '[TEST] Real Crypt Name', parentLocationId: fosstryn.id, unidentifiedLabel: 'A dark doorway'}, 'unidentified');
  return {frontier, approaches, fosstryn, muster, market};
}
const headers = html => [...html.matchAll(/agl-group__head[^>]*>\s*<i[^>]*><\/i><span>([^<]*)<\/span>/g)].map(m => m[1]);
const rowNames = html => { const pane = html.slice(html.indexOf('<aside'), html.indexOf('</aside>')); return [...pane.matchAll(/agl-row__name">([^<]*)</g)].map(m => m[1]); };
const flat = (sections, out = {labels: [], rows: []}) => {
  for (const s of sections) { out.labels.push(s.label); flat(s.sections, out); }
  return out;
};
/** Rows in the order the window draws them: a header, its child headers, then its own rows (top level only unless `deep`). */
function drawn(sections, deep = false, out = []) {
  const walk = n => { out.push(n.name); if (deep) n.children.forEach(walk); };
  for (const s of sections) { drawn(s.sections, deep, out); s.rows.forEach(walk); }
  return out;
}

test('GM model: contract, nested Region folders, plain rows, ids as refs', async () => {
  const {api} = boot(); await seed(api);
  const m = api.listModel();
  assert.equal(m.contract, LIST_CONTRACT); assert.equal(api.LIST_CONTRACT, LIST_CONTRACT);
  assert.equal(m.audience, 'gm');
  const names = ss => ss.map(s => s.label);
  assert.deepEqual(names(m.sections), ['[TEST] Elsewhere', '[TEST] Frontier', 'No region'], 'free-text Regions, then folders alphabetical, No region last');
  const frontier = m.sections.find(s => s.label === '[TEST] Frontier'), approaches = frontier.sections[0], fosstryn = approaches.sections[0];
  assert.deepEqual([approaches.label, fosstryn.label], ['[TEST] Approaches', '[TEST] Fosstryn']);
  assert.deepEqual(fosstryn.rows.map(r => r.name), ['[TEST] Market', '[TEST] Muster', '[TEST] Real Crypt Name', '[TEST] Secret Vault', '[TEST] Smithy'], 'GM rows are plain (a place inside a non-Region place is a row of its own), name order');
  assert.ok(fosstryn.ref?.startsWith('LOC-'), 'a Region header carries its own ref');
  assert.equal(fosstryn.count, 5); assert.equal(frontier.count, 5);
  assert.equal(m.total, 10); assert.equal(m.shown, 10);
  assert.ok(m.sections.flatMap(function all(s) { return [...s.rows, ...s.sections.flatMap(all)]; }).every(r => /^LOC-/.test(r.ref)));
});

test('GM model equals the window: same headers, same rows, same order, for search, filters and every sort', async () => {
  const {api} = boot(); await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  const cases = [{}, {query: 'mill'}, {filters: {threat: 'hot'}}, {sort: 'threat'}, {sort: 'threat', sortDesc: true}, {sort: 'region'}, {sort: 'status', sortDesc: true},
    {sort: 'nodes'}, {filters: {region: '[TEST] Elsewhere'}}, {filters: {placeable: 'yes'}, query: 'mu'}, {filters: {status: 'revealed'}, sort: 'name', sortDesc: true}];
  for (const c of cases) {
    Object.assign(app, {query: c.query ?? '', filters: {threat: '', region: '', profession: '', quest: '', status: '', placeable: '', ...(c.filters ?? {})}, sort: c.sort ?? 'name', sortDesc: c.sortDesc === true, groupBy: 'region', treeMode: false});
    const html = await app._renderHTML(), m = api.listModel(c);
    assert.deepEqual(flat(m.sections).labels, headers(html), `headers ${JSON.stringify(c)}`);
    assert.deepEqual(drawn(m.sections), rowNames(html).filter(n => !/^$/.test(n)), `rows ${JSON.stringify(c)}`);
  }
});

test('filter and sort descriptors are the window\'s: same keys, labels, options with counts, sorts', async () => {
  const {api} = boot(); await seed(api);
  const app = new LocationsApp(); app.render = async () => {}; app.query = ''; app.filters = {threat: 'hot', region: '', profession: '', quest: '', status: '', placeable: ''};
  await app._renderHTML();
  const m = api.listModel({filters: {threat: 'hot'}});
  assert.deepEqual(m.controls.filters.map(f => [f.key, f.label, f.all]), FILTER_CONTROLS.map(c => [c.key, c.label, c.all]));
  for (const f of m.controls.filters) assert.deepEqual(f.options, app.fopts[f.key].map(o => ({value: o.value, label: o.label, count: o.count})), f.key);
  assert.equal(m.controls.filters.find(f => f.key === 'threat').value, 'hot');
  assert.deepEqual(m.controls.sorts, SORTS.map(s => ({value: s.value, label: s.label})));
  assert.equal(m.controls.canReverse, true);
  assert.deepEqual(drawn(m.sections), ['[TEST] Muster'].concat([]), 'only the hot place (its Regions are kept as folders)');
  assert.equal(m.filtering, true); assert.equal(m.shown, 1);
});

test('unknown filter keys and sorts are ignored, not trusted', () => {
  assert.deepEqual(cleanFilters({threat: 'hot', evil: 'x', region: 5}), {threat: 'hot', region: '', profession: '', quest: '', status: '', placeable: ''});
  assert.equal(cleanSort('nope'), 'name'); assert.equal(cleanSort('region'), 'region');
  const m = buildListModel([], {gm: true, sort: '__proto__', filters: {__proto__: 'x'}});
  assert.equal(m.sort, 'name'); assert.equal(m.empty, 'none');
});

test('player model equals the window\'s player list: nested folders, name order, search keeps the path to a match', async () => {
  const {game, api} = boot(); await seed(api);
  game.user = player;
  const app = new LocationsApp(); app.render = async () => {};
  const m = api.listModel();
  assert.equal(m.audience, 'player');
  const html = await app._renderHTML();
  assert.deepEqual(flat(m.sections).labels, headers(html));
  assert.deepEqual(drawn(m.sections), rowNames(html), 'top level rows, as the closed window lists them');
  const fosstryn = m.sections.find(s => s.label === '[TEST] Frontier').sections[0].sections[0];
  const market = fosstryn.rows.find(r => r.name === '[TEST] Market');
  assert.deepEqual(market.children.map(c => c.name), ['[TEST] Smithy'], 'a place inside a non-Region place nests under it');
  app.query = 'smithy';
  const q = api.listModel({query: 'smithy'});
  assert.deepEqual(flat(q.sections).labels, headers(await app._renderHTML()));
  assert.deepEqual(drawn(q.sections, true), rowNames(await app._renderHTML()));
  assert.equal(q.shown, 1); assert.equal(q.filtering, true);
  assert.equal(drawn(q.sections, true).includes('[TEST] Smithy'), true);
});

test('player model never leaks: no hidden place, no GM text, unidentified by its generic label with no id; filters and sort are ignored', async () => {
  const {game, api} = boot(); await seed(api);
  game.user = player;
  const m = api.listModel({filters: {threat: 'deadly', status: 'hidden'}, sort: 'threat', sortDesc: true, revealedOnly: true});
  const text = JSON.stringify(m.sections);
  for (const secret of ['Secret Vault', 'SECRET-GM-TEXT', 'Real Crypt Name', '"hot"', '"deadly"', 'audience', 'parentLocationId', 'published']) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(m.filters, {threat: '', region: '', profession: '', quest: '', status: '', placeable: ''}, 'the filters a player sends are not applied or echoed');
  assert.deepEqual(m.controls.filters, []); assert.equal(m.controls.canReverse, false); assert.deepEqual(m.controls.sorts.map(s => s.value), ['name']);
  assert.equal(m.sort, 'name'); assert.equal(m.shown, 9, 'every visible place (the hidden one is absent), filters ignored');
  const all = [];
  (function collect(ss) { for (const s of ss) { all.push(...s.rows); collect(s.sections); } })(m.sections);
  const dark = (function find(n) { for (const x of n) { if (x.name === 'A dark doorway') return x; const f = find(x.children); if (f) return f; } return null; })(all);
  assert.ok(dark, 'the unidentified place is listed by its generic label');
  assert.equal(dark.state, 'unidentified');
  assert.ok(!dark.ref.startsWith('LOC-'), 'its ref is the pin key, never a LOC id');
  for (const r of all) assert.deepEqual(Object.keys(r).filter(k => !['ref', 'name', 'state', 'active', 'isRegion', 'restricted', 'match', 'children', 'type'].includes(k)), [], 'only list fields');
});

test('a player cannot read the model while Player Access is off; a GM can; an archived place is not listed', async () => {
  const {game, api} = boot({access: false}); await seed(api);
  assert.equal(api.listModel().total, 10);
  game.user = player;
  assert.throws(() => api.listModel(), /hidden from players/);
  game.user = gm;
  const lone = readAll().find(l => l.name.includes('Lone Mill'));
  await writeAll(readAll().map(l => l.id === lone.id ? {...l, archived: true} : l));
  assert.equal(api.listModel().total, 9);
});

test('GM revealedOnly keeps revealed places (what the Hub shows the GM)', async () => {
  const {api} = boot(); await seed(api);
  const m = api.listModel({revealedOnly: true});
  assert.equal(m.total, 8, 'hidden and unidentified places are left out');
  assert.equal(JSON.stringify(m).includes('Secret Vault'), false);
});

test('a row\'s ref opens the record through openLocation, which checks access itself', async () => {
  const {game, api} = boot(); await seed(api);
  game.user = player;
  const muster = api.listModel().sections.find(s => s.label === '[TEST] Frontier').sections[0].sections[0].rows.find(r => r.name === '[TEST] Muster');
  await api.openLocation(muster.ref);
  assert.deepEqual(opened, [muster.ref]);
  assert.ok(api.getLocation(muster.ref), 'the ref resolves to the player view');
});
