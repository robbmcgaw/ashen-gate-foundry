/** 0.32.0: nested, collapsible Region headers in the Locations list, for the GM (Group by Region) and players. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {uiState} from '../scripts/ag-html.mjs';
import {buildRegionSections, sectionHas, flattenSections, readFolds, toggleFold, GM_ACCESS, VIEW_ACCESS, NO_REGION, UNIDENTIFIED} from '../scripts/region-groups.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const R = (id, name, parent = '', extra = {}) => ({id, name, parentLocationId: parent, isRegion: true, ...extra});
const P = (id, name, parent = '', extra = {}) => ({id, name, parentLocationId: parent, isRegion: false, ...extra});
const shape = sections => sections.map(s => [s.label, s.count, s.rows.map(r => r.name), shape(s.sections)]);

/* ---------------- pure ---------------- */
test('nests places under the headers of their Region ancestors, outermost first, from parentLocationId and isRegion', () => {
  const items = [R('LOC-FRONTIER', 'Fosstryn Frontier'), R('LOC-APPROACHES', 'Fosstryn Approaches', 'LOC-FRONTIER'), R('LOC-FOSSTRYN', 'Fosstryn', 'LOC-FRONTIER'),
    P('LOC-MUSTER', 'The Muster', 'LOC-FOSSTRYN'), P('LOC-ROAD', 'Old Road', 'LOC-APPROACHES'), P('LOC-WAYSTONE', 'Waystone', 'LOC-FRONTIER'), P('LOC-ELSEWHERE', 'Elsewhere', '', {region: 'Far Reach'})];
  const out = buildRegionSections(items, GM_ACCESS);
  assert.deepEqual(shape(out), [
    ['Far Reach', 1, ['Elsewhere'], []],
    ['Fosstryn Frontier', 3, ['Waystone'], [['Fosstryn', 1, ['The Muster'], []], ['Fosstryn Approaches', 1, ['Old Road'], []]]]]);
  assert.deepEqual(flattenSections(out).map(x => [x.section.label, x.depth]), [['Far Reach', 0], ['Fosstryn Frontier', 0], ['Fosstryn', 1], ['Fosstryn Approaches', 1]]);
});

test('a non-Region ancestor is skipped by the headers; a Region with nothing inside is an ordinary row; loops and missing parents cannot hang it', () => {
  const items = [R('LOC-A', 'Alpha'), P('LOC-TOWN', 'Town', 'LOC-A'), P('LOC-SHOP', 'Shop', 'LOC-TOWN'), R('LOC-EMPTY', 'Empty Region', 'LOC-A'),
    P('LOC-LOST', 'Lost', 'LOC-GONE'), R('LOC-L1', 'Loop 1', 'LOC-L2'), R('LOC-L2', 'Loop 2', 'LOC-L1')];
  const out = buildRegionSections(items, GM_ACCESS);
  const alpha = out.find(s => s.label === 'Alpha');
  assert.deepEqual(alpha.rows.map(r => r.name).sort(), ['Empty Region', 'Shop', 'Town']);
  assert.equal(alpha.count, 3);
  assert.equal(alpha.sections.length, 0);
  assert.ok(out.find(s => s.label === NO_REGION).rows.some(r => r.name === 'Lost'), 'a parent that is not in the list leaves it at the top');
  assert.ok(flattenSections(out).length >= 2, 'a parent loop still produces sections');
});

test('free-text region groups: "No region" last, and a group named like a top-level Region joins that header', () => {
  const items = [R('LOC-NORTH', 'North'), P('LOC-IN', 'Inside', 'LOC-NORTH'), P('LOC-T', 'Tagged', '', {region: 'north'}), P('LOC-X', 'Nowhere'), P('LOC-S', 'Southern', '', {region: 'South'})];
  const out = buildRegionSections(items, GM_ACCESS);
  assert.deepEqual(out.map(s => s.label), ['North', 'South', NO_REGION]);
  assert.deepEqual(out[0].rows.map(r => r.name).sort(), ['Inside', 'Tagged']);
});

test('players: the chain follows only what they can see, so a hidden Region is never named and its children fall to the nearest visible ancestor', () => {
  // The player's list: LOC-MID is a visible Region whose own parent (a hidden Region) is absent from its view; LOC-DEEP's parent is visible.
  const views = [
    {id: 'LOC-MID', key: 'k-mid', state: 'revealed', name: 'Mid Region', isRegion: true},              // no `parent`: its Region above is hidden
    {id: 'LOC-DEEP', key: 'k-deep', state: 'revealed', name: 'Deep Place', parent: {id: 'LOC-MID', key: 'k-mid', name: 'Mid Region'}},
    {id: 'LOC-ORPHAN', key: 'k-orphan', state: 'revealed', name: 'Orphan'}                              // its Region is hidden, so no parent either
  ];
  const out = buildRegionSections(views, VIEW_ACCESS);
  assert.deepEqual(shape(out), [['Mid Region', 1, ['Deep Place'], []], [NO_REGION, 1, ['Orphan'], []]]);
  assert.doesNotMatch(JSON.stringify(out.map(s => s.label)), /Hidden/);
});

test('players: an unidentified place shows its generic label, is a header only when a visible place sits inside it, and Unidentified stays a flat group', () => {
  const views = [
    {key: 'k-u1', state: 'unidentified', name: 'Abandoned Hamlet'},
    {id: 'LOC-IN', key: 'k-in', state: 'revealed', name: 'Old Well', parent: {key: 'k-u1', name: 'Abandoned Hamlet'}},
    {key: 'k-u2', state: 'unidentified', name: 'Strange Ruin'},
    {id: 'LOC-R', key: 'k-r', state: 'revealed', name: 'Revealed Region', isRegion: true},
    {id: 'LOC-C', key: 'k-c', state: 'revealed', name: 'Child', parent: {id: 'LOC-R', key: 'k-r', name: 'Revealed Region'}}
  ];
  const out = buildRegionSections(views, VIEW_ACCESS);
  assert.deepEqual(out.map(s => [s.label, s.container, s.flat]), [['Revealed Region', false, false], ['Abandoned Hamlet', true, false], [UNIDENTIFIED, false, true]]);
  assert.deepEqual(out[1].rows.map(r => r.name), ['Old Well']);
  assert.deepEqual(out[2].rows.map(r => r.name), ['Strange Ruin']);
});

test('sectionHas finds a place in nested sections or as the header itself', () => {
  const out = buildRegionSections([R('LOC-A', 'A'), R('LOC-B', 'B', 'LOC-A'), P('LOC-C', 'C', 'LOC-B')], GM_ACCESS);
  assert.equal(sectionHas(out[0], 'LOC-C'), true); assert.equal(sectionHas(out[0], 'LOC-B'), true); assert.equal(sectionHas(out[0], 'LOC-X'), false); assert.equal(sectionHas(out[0], ''), false);
});

/* ---------------- remembered fold state ---------------- */
test('fold state: remembered per user in storage, kept live when storage is blocked, bad data and a throwing store never break it', () => {
  const data = {};
  const storage = {getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }};
  const a = uiState('t', {storage, userId: 'u1'});
  const folds = readFolds(a);
  toggleFold(a, folds, 'LOC-A'); toggleFold(a, folds, 'loose:North');
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u1'}))].sort(), ['LOC-A', 'loose:North'], 'a new window for the same user reads it back');
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u2'}))], [], 'another user has their own');
  toggleFold(a, folds, 'LOC-A');
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u1'}))], ['loose:North'], 'unfolding is remembered too');
  const blocked = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  const live = readFolds(uiState('t', {storage: blocked}));
  assert.equal(live.size, 0);
  toggleFold(uiState('t', {storage: blocked}), live, 'LOC-A');
  assert.deepEqual([...live], ['LOC-A'], 'still folds for this window');
  assert.deepEqual([...readFolds({get() { throw new Error('x'); }})], []);
  data['ag-ui:t:u3'] = '{"regionFolds": [1, {}, "ok"]}';
  assert.deepEqual([...readFolds(uiState('t', {storage, userId: 'u3'}))], ['ok'], 'non-string entries are ignored');
});

/* ---------------- the window ---------------- */
function boot() {
  const game = installFoundry();
  const mod = {version: '0.32.0', active: true};
  mod.api = createApi({version: '0.32.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  return {game, api: mod.api};
}
async function seed(api) {
  const make = async (id, name, extra = {}) => (await api.saveLocation({id, name: `[TEST] ${name}`, ...extra}));
  const ids = {};
  for (const [key, name, extra] of [['frontier', 'Frontier', {isRegion: true}], ['fosstryn', 'Fosstryn', {isRegion: true}], ['muster', 'Muster', {}], ['approaches', 'Approaches', {isRegion: true}], ['road', 'Road', {}],
    ['hidden', 'Hidden Realm', {isRegion: true}], ['inner', 'Inner Keep', {}], ['loose', 'Loose Place', {region: 'North'}]]) ids[key] = (await make(`LOC-${key.toUpperCase()}`, name, extra)).id;
  const parents = {fosstryn: 'frontier', muster: 'fosstryn', approaches: 'frontier', road: 'approaches', inner: 'hidden'};
  for (const [k, p] of Object.entries(parents)) await api.moveLocation(ids[k], ids[p]);
  return ids;
}
const listPane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));

test('GM Group by Region: nested collapsible headers with counts, aria-expanded buttons, Region openers, and Tree mode is unchanged', async () => {
  const { api } = boot();
  const ids = await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  let html = listPane(await app._renderHTML());
  assert.equal(app.groupBy, 'region', 'the default view is the nested one');
  const heads = [...html.matchAll(/data-action="region-fold" data-id="([^"]+)" aria-expanded="(true|false)"/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(heads.map(h => h[0]), [ids.frontier, ids.approaches, ids.fosstryn, ids.hidden], 'outermost first, siblings by name');
  assert.ok(heads.every(h => h[1] === 'true'));
  assert.match(html, /<span>\[TEST\] Frontier<\/span><span class="agl-count"[^>]*>2<\/span>/, 'counts places inside, not Regions');
  assert.match(html, new RegExp(`data-action="select" data-id="${ids.frontier}"[^>]*aria-label="Open \\[TEST\\] Frontier"`), 'the Region itself opens from its header');
  assert.match(html, /<span>North<\/span><span class="agl-count">1<\/span>/, 'places with no Region above keep their free-text region group');
  assert.ok(html.indexOf('Muster') > html.indexOf('[TEST] Fosstryn'));
  // Fold one: remembered, rows hidden, focus selector data intact.
  await app.onAction({dataset: {action: 'region-fold', id: ids.fosstryn}});
  html = listPane(await app._renderHTML());
  assert.match(html, new RegExp(`data-id="${ids.fosstryn}" aria-expanded="false"`));
  assert.doesNotMatch(html, /Muster/); assert.match(html, /Road/);
  assert.ok(app.folds.has(ids.fosstryn));
  await app.onAction({dataset: {action: 'region-fold', id: ids.fosstryn}});
  assert.match(listPane(await app._renderHTML()), /Muster/);
  // 0.32.2: selecting a place opens its headers (see folders-collapse-v0322.test.mjs for the full rule).
  await app.onAction({dataset: {action: 'region-fold', id: ids.fosstryn}});
  app.select(ids.muster);
  assert.match(listPane(await app._renderHTML()), /Muster/);
  // Searching opens everything that holds a match.
  app.select(null); app.query = 'road';
  html = listPane(await app._renderHTML());
  assert.match(html, /Road/); assert.doesNotMatch(html, /Muster/);
  assert.match(html, new RegExp(`data-id="${ids.frontier}" aria-expanded="true"`), 'the path to the match stays open and shown');
  app.query = '';
  // Tree mode keeps its own folders, drag targets and counts.
  app.treeMode = true;
  html = listPane(await app._renderHTML());
  assert.match(html, /agl-tree--root/); assert.match(html, /data-folder=/); assert.doesNotMatch(html, /region-fold/);
});

test('GM: other group modes are unchanged; flat region groups keep their own markup and fold through the same remembered state', async () => {
  const { api } = boot();
  await seed(api);
  const app = new LocationsApp(); app.render = async () => {};
  await app.onAction({dataset: {action: 'toggle-group', group: 'North'}});
  assert.ok(app.folds.has('loose:North'));
  let html = listPane(await app._renderHTML());
  assert.match(html, /data-group="North"[^>]*aria-expanded="false"/); assert.doesNotMatch(html, /Loose Place/);
  app.groupBy = 'threat';
  html = listPane(await app._renderHTML());
  assert.doesNotMatch(html, /region-fold/); assert.match(html, /data-action="toggle-group"/);
});

test('players: nested Region headers over what they can see; a hidden Region is never named and its child lands in the nearest visible ancestor', async () => {
  const { game, api } = boot();
  const ids = await seed(api);
  // Reveal: Frontier > Fosstryn > Muster, Approaches (unidentified, with a revealed Road inside); Hidden Realm stays hidden although Inner Keep is revealed.
  for (const k of ['frontier', 'fosstryn', 'muster', 'road', 'inner']) await api.setLocationState(ids[k], 'revealed');
  await api.setLocationState(ids.approaches, 'unidentified');
  await api.saveLocation({...api.getLocation(ids.approaches), unidentifiedLabel: 'Trackless Country'});
  await api.publishLocation(ids.approaches);
  game.user = player;
  const app = new LocationsApp(); app.render = async () => {};
  const html = await app._renderHTML();
  const pane = listPane(html);
  const labels = [...pane.matchAll(/class="agl-group__head[^"]*"[^>]*data-action="region-fold"[^>]*>\s*<i[^>]*><\/i><span>([^<]*)<\/span><span class="agl-count"[^>]*>(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(labels, [['[TEST] Frontier', 1], ['[TEST] Fosstryn', 1], ['Trackless Country', 1], ['No region', 1]]);
  assert.match(pane, /\[TEST\] Frontier/); assert.match(pane, /\[TEST\] Fosstryn/); assert.match(pane, /\[TEST\] Muster/);
  assert.match(pane, /Trackless Country/, 'an unidentified Region shows its generic label');
  assert.match(pane, /\[TEST\] Road/);
  assert.match(pane, /\[TEST\] Inner Keep/);
  assert.doesNotMatch(html, /Hidden Realm|HIDDEN|Approaches|LOC-/, 'a hidden Region and the real name of an unidentified one never reach the player');
  // Inner Keep sits at the top level, not under any Region header.
  const inner = pane.indexOf('Inner Keep');
  const lastHeadBefore = pane.lastIndexOf('region-fold', inner);
  assert.match(pane.slice(lastHeadBefore, lastHeadBefore + 400), /No region|Unidentified|Inner/, 'it is grouped with the places that have no Region above them');
  // Folding works for players too (the selected place's own headers stay open, so fold one that does not hold it).
  const trackless = readViews().find(v => v.name === 'Trackless Country').key;
  await app.onAction({dataset: {action: 'region-fold', id: trackless}});
  const folded = listPane(await app._renderHTML());
  assert.match(folded, new RegExp(`data-id="${trackless}" aria-expanded="false"`));
  assert.doesNotMatch(folded, /\[TEST\] Road/); assert.match(folded, /Muster/);
  const frontierKey = readViews().find(v => v.name === '[TEST] Frontier').key;
  assert.equal(app.selectedId !== null, true);
  await app.onAction({dataset: {action: 'region-fold', id: frontierKey}});
  assert.doesNotMatch(listPane(await app._renderHTML()), /Muster/, '0.32.2: the header holding the selected place can be folded too');
});

test('players never get a Region name from the view of a place inside it when the Region is hidden', async () => {
  const { game, api } = boot();
  const ids = await seed(api);
  await api.setLocationState(ids.inner, 'revealed');
  game.user = player;
  const view = readViews().find(v => v.name === '[TEST] Inner Keep');
  assert.ok(view);
  assert.equal(view.parent, undefined);
  assert.doesNotMatch(JSON.stringify(readViews()), /Hidden Realm|LOC-HIDDEN/);
  const html = await new LocationsApp()._renderHTML();
  assert.doesNotMatch(html, /Hidden Realm/);
});
