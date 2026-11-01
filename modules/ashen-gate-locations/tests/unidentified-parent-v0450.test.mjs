/**
 * 0.45.0: an unidentified place (and a Selected-players "companion" placeholder) sits under its visible parent's Region headers in the
 * player list. Synthetic [TEST] data, mocked Foundry: this proves the data, privacy rules and window HTML, NOT the live Forge world.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, players} from '../scripts/store.mjs';
import {normalizeLocation, playerView, companionView, publishable} from '../scripts/model.mjs';
import {buildRegionSections, VIEW_ACCESS, GM_ACCESS, UNIDENTIFIED, NO_REGION} from '../scripts/region-groups.mjs';
import {buildListModel} from '../scripts/list-model.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const listPane = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));

async function world() {
  const g = installFoundry();
  const users = new Users([['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}], ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}]]);
  g.users = users; g.user = users.get('gm'); g.scenes = [new Scene()];
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '0.45.0', isGM: () => u.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, playerIds: () => players().map(x => x.id)}));
  g.modules = {get: id => id === MOD ? {version: '0.45.0', active: true, api: apis.get(game.user.id)} : null};
  const gm = apis.get('gm');
  const ids = {};
  const make = async (key, name, extra = {}) => { ids[key] = (await gm.saveLocation({id: `LOC-TEST-${key.toUpperCase()}`, name, description: ['frontier', 'fosstryn', 'muster', 'private', 'lonely'].includes(key) ? `[TEST] open text of ${name}` : `[TEST] secret text of ${name}`, teaser: `teaser ${key}`, ...extra})).id; };
  await make('frontier', '[TEST] Frontier', {isRegion: true});
  await make('fosstryn', '[TEST] Fosstryn', {isRegion: true});
  await make('muster', '[TEST] Muster');
  await make('shrine', '[TEST] Real Shrine Name', {unidentifiedLabel: 'Unknown location'});     // unidentified, visible Region parent
  await make('hiddenreg', '[TEST] Hidden Realm', {isRegion: true});
  await make('court', '[TEST] Real Court Name', {unidentifiedLabel: 'Unknown location'});      // unidentified, parent hidden
  await make('mystery', '[TEST] Mystery Region', {isRegion: true});
  await make('vault', '[TEST] Real Vault Name', {unidentifiedLabel: 'Unknown location'});      // unidentified, parent unidentified
  await make('private', '[TEST] Private Region', {isRegion: true});
  await make('chamber', '[TEST] Real Chamber Name', {unidentifiedLabel: 'Unknown location'});  // unidentified, parent Selected-players
  await make('lonely', '[TEST] Lonely Region', {isRegion: true});
  await make('only', '[TEST] Real Only Child', {unidentifiedLabel: 'Unknown location'});       // unidentified only child of a Region
  for (const [k, p] of Object.entries({fosstryn: 'frontier', muster: 'fosstryn', shrine: 'fosstryn', court: 'hiddenreg', vault: 'mystery', chamber: 'private', only: 'lonely'})) await gm.moveLocation(ids[k], ids[p]);
  for (const k of ['frontier', 'fosstryn', 'muster', 'private', 'lonely']) await gm.setLocationState(ids[k], 'revealed');
  for (const k of ['shrine', 'court', 'vault', 'chamber', 'only', 'mystery']) await gm.setLocationState(ids[k], 'unidentified');
  await gm.setAudience(ids.private, {mode: 'selected', userIds: ['p2']});
  return {g, users, apis, gm, ids};
}
const HIDDEN_NAMES = ['Hidden Realm', 'Real Shrine Name', 'Real Court Name', 'Real Vault Name', 'Real Chamber Name', 'Real Only Child', 'secret text'];

const everything = w => JSON.stringify([readViewsAs(w, 'p1'), readViewsAs(w, 'p2')]);
const readViewsAs = (w, id) => as(w.users.get(id), readViews);
const pagesText = () => JSON.stringify([...game.journal].flatMap(j => [...j.pages].map(p => [p.name, p.text?.content, p.flags])));
const hiddenParentLeaks = text => HIDDEN_NAMES.filter(n => text.includes(n));

test('player list: an unidentified place sits under its visible parent header; hidden, unidentified and out-of-audience parents fall back to the flat group', async () => {
  const w = await world();
  const m = as(w.users.get('p1'), () => buildListModel(readViews(), {gm: false}));
  const shape = ss => ss.map(s => [s.label, s.count, s.unidentified, s.rows.map(r => r.name).sort(), shape(s.sections)]);
  assert.deepEqual(shape(m.sections), [
    ['[TEST] Frontier', 1, 1, [], [['[TEST] Fosstryn', 1, 1, ['Unknown location', '[TEST] Muster'], []]]],
    [NO_REGION, 1, 1, ['[TEST] Lonely Region'], []],
    [UNIDENTIFIED, 4, 0, Array(4).fill('Unknown location'), []]]);
  // The window: the same grouping, and the unidentified row shows only its generic label.
  const app = new LocationsApp(); app.render = async () => {};
  const html = await as(w.users.get('p1'), () => app._renderHTML());
  const pane = listPane(html);
  const foss = pane.indexOf('[TEST] Fosstryn'), unid = pane.indexOf('<span>Unidentified</span>');
  const shrineRow = pane.indexOf('Unknown location');
  assert.ok(foss > -1 && shrineRow > foss && shrineRow < unid, 'the first Unknown location row is inside Fosstryn, above the flat group');
  assert.match(pane, /<span>\[TEST\] Frontier<\/span><span class="agl-count" [^>]*>1<\/span>/, 'the header counts visible places only');
  assert.match(pane, /1 place inside, and 1 unidentified/, 'the tooltip says the unidentified one apart');
  assert.match(pane, /<span>Unidentified<\/span><span class="agl-count">4<\/span>|<span>Unidentified<\/span><span class="agl-count"[^>]*>4<\/span>/);
  assert.deepEqual(hiddenParentLeaks(html), [], 'no hidden name or text reaches the window');
  assert.doesNotMatch(html, /LOC-TEST-(SHRINE|COURT|VAULT|CHAMBER|ONLY|HIDDENREG|MYSTERY|PRIVATE)/, 'no id of an unidentified or hidden place');
  assert.doesNotMatch(html, /Private Region|Mystery Region/, 'a parent the player cannot see is never named');
});

test('an unidentified place does not make its parent a header, and a Region with only unidentified children stays a plain row', async () => {
  const w = await world();
  const labels = as(w.users.get('p1'), () => buildListModel(readViews(), {gm: false})).sections.map(s => s.label);
  assert.ok(!labels.includes('[TEST] Lonely Region'), 'not a header');
  const views = readViewsAs(w, 'p1');
  const only = views.find(v => v.state === 'unidentified' && v.parent?.name === '[TEST] Lonely Region');
  assert.ok(only, 'it still hangs under the Region row');
  assert.deepEqual(Object.keys(only).sort(), ['key', 'name', 'parent', 'state', 'teaser']);
});

test('the fields an unidentified view carries: key, state, name, teaser, active, share and (only when visible) parent {id, key, name}', async () => {
  const w = await world();
  const views = readViewsAs(w, 'p1');
  const shrine = views.find(v => v.parent?.name === '[TEST] Fosstryn' && v.state === 'unidentified');
  assert.deepEqual(Object.keys(shrine).sort(), ['key', 'name', 'parent', 'state', 'teaser']);
  assert.deepEqual(Object.keys(shrine.parent).sort(), ['id', 'key', 'name']);
  assert.equal(shrine.name, 'Unknown location');
  for (const v of views.filter(v => v.state === 'unidentified' && !v.parent)) assert.deepEqual(Object.keys(v).sort(), ['key', 'name', 'state', 'teaser'], 'no parent key at all, not even empty');
});

test('privacy: no hidden or unidentified id, name, region flag or parent in published pages, API results or views, for p1 (not in the private audience)', async () => {
  const w = await world();
  const api = w.apis.get('p1');
  const out = JSON.stringify([api.listLocations({includeUnidentified: true}), readViewsAs(w, 'p1'),
    readViewsAs(w, 'p1').map(v => api.getLocation(v.key) ?? api.getLocation(v.id)), api.listModel?.({})]);
  assert.deepEqual(hiddenParentLeaks(out), []);
  assert.doesNotMatch(out, /Private Region|Mystery Region|LOC-TEST-(COURT|VAULT|CHAMBER|SHRINE|ONLY|HIDDENREG|MYSTERY|PRIVATE)/);
  // Only a Revealed parent is ever named on an unidentified view.
  const named = readViewsAs(w, 'p1').filter(v => v.state === 'unidentified' && v.parent).map(v => v.parent.name).sort();
  assert.deepEqual(named, ['[TEST] Fosstryn', '[TEST] Lonely Region']);
  // The published unidentified pages: text holds only the label and teaser; the view flag holds the same view a player gets.
  for (const j of game.journal) for (const p of j.pages) {
    const v = JSON.parse(p.flags?.[MOD]?.view || 'null');
    if (v?.state !== 'unidentified') continue;
    assert.equal(p.name, 'Unknown location');
    assert.doesNotMatch(p.text.content, /Fosstryn|Lonely|parent|Real |LOC-/, 'the page text never names a parent');
    assert.ok(!('region' in v) && !('isRegion' in v) && !('id' in v) && !('children' in v), 'no region flag, id or children on an unidentified view');
  }
  // The unidentified card is one page for every reader, so a Selected-players parent is left out even for a player who is in its audience.
  assert.equal(readViewsAs(w, 'p2').some(v => v.parent?.name === '[TEST] Private Region'), false, 'conservative: page-level, not per player');
});

test('a parent that is hidden again, or archived, is left out at the next publish', async () => {
  const w = await world();
  await w.gm.setLocationState(w.ids.fosstryn, 'hidden');
  await w.gm.publishLocation?.(w.ids.shrine);
  const v = readViewsAs(w, 'p1').find(x => x.state === 'unidentified' && x.name === 'Unknown location' && x.teaser === 'teaser shrine');
  assert.ok(v && !('parent' in v), 'hidden parent: not named, flat group again');
  assert.equal(JSON.stringify(readViewsAs(w, 'p1')).includes('[TEST] Fosstryn'), false);
});

test('GM view is unchanged: records, tree and Region grouping with real names', async () => {
  const w = await world();
  const recs = as(w.users.get('gm'), readAll);
  const sections = buildRegionSections(recs.filter(l => !l.archived), GM_ACCESS);
  const front = sections.find(s => s.label === '[TEST] Frontier');
  assert.equal(front.unidentified, 0, 'GM counts are not split');
  assert.equal(front.sections[0].count, 2, 'Muster and the shrine, both counted');
  assert.equal(w.apis.get('gm').getLocation(w.ids.shrine).name, '[TEST] Real Shrine Name');
  const m = as(w.users.get('gm'), () => buildListModel(recs, {gm: true}));
  assert.ok(m.sections.some(s => s.label === '[TEST] Frontier'));
});

test('Test player (Player Access off in the world): the same views and the same rules', async () => {
  const w = await world();
  const t = createApi({version: '0.45.0', isGM: () => false, playerAccessEnabled: () => true, playerAccessSetting: () => false, setPlayerAccess: async () => {},
    readAll: () => [], writeAll: async () => {}, readViews: () => readViewsAs(w, 'p1'), placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  const out = t.listLocations({includeUnidentified: true});
  assert.deepEqual(out.filter(v => v.state === 'unidentified' && v.parent).map(v => v.parent.name).sort(), ['[TEST] Fosstryn', '[TEST] Lonely Region']);
  assert.deepEqual(hiddenParentLeaks(JSON.stringify(out)), []);
});

/* ---------------- pure: model and grouping ---------------- */
let seq = 0;
const L = (id, name, extra = {}) => normalizeLocation({id, name, pinKey: `pk${String(++seq).padStart(14, 'a')}`, ...extra});
const pub = loc => ({...loc, published: publishable(loc), state: loc.state ?? 'revealed'});

test('playerView: parent only for a Revealed, published, covered, unarchived parent', () => {
  const parent = (extra = {}) => pub(L('LOC-TEST-P', '[TEST] P', {state: 'revealed', isRegion: true, ...extra}));
  const child = pub(L('LOC-TEST-C', '[TEST] Real C', {state: 'unidentified', parentLocationId: 'LOC-TEST-P'}));
  const view = (p, c = child) => playerView(c, [p, c]);
  const p0 = parent();
  assert.deepEqual(view(p0).parent, {id: 'LOC-TEST-P', key: p0.pinKey, name: '[TEST] P'});
  for (const extra of [{state: 'hidden'}, {state: 'unidentified'}, {archived: true}, {audience: {mode: 'selected', userIds: ['p9']}}])
    assert.equal('parent' in view(parent(extra)), false, JSON.stringify(extra));
  assert.equal('parent' in view({...parent(), published: null}), false, 'unpublished parent');
  assert.equal('parent' in playerView(child, [child]), false, 'parent missing from the list');
  // A Selected-players child needs a parent at least as widely visible.
  const sel = pub(L('LOC-TEST-C', '[TEST] Real C', {state: 'unidentified', parentLocationId: 'LOC-TEST-P', audience: {mode: 'selected', userIds: ['p1']}}));
  assert.ok(view(parent({audience: {mode: 'selected', userIds: ['p1', 'p2']}}), sel).parent, 'parent open to every reader');
  assert.equal('parent' in view(parent({audience: {mode: 'selected', userIds: ['p2']}}), sel), false, 'parent some reader cannot see');
  assert.equal(JSON.stringify(view(parent())).includes('Real C'), false);
});

test('companionView: real name never present; parent only when Revealed and open to Everyone', () => {
  const mk = (parentExtra = {}) => {
    const parent = pub(L('LOC-TEST-P', '[TEST] P', {state: 'revealed', isRegion: true, ...parentExtra}));
    const real = pub(L('LOC-TEST-R', '[TEST] Real Secret Name', {state: 'revealed', description: 'secret text', parentLocationId: 'LOC-TEST-P', audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}}));
    return {parent, real, view: companionView(real, {label: 'Unknown location', all: [parent, real]})};
  };
  const ok = mk();
  assert.deepEqual(Object.keys(ok.view).sort(), ['key', 'name', 'parent', 'state']);
  assert.deepEqual(ok.view.parent, {id: 'LOC-TEST-P', key: ok.parent.pinKey, name: '[TEST] P'});
  const text = JSON.stringify(ok.view);
  for (const secret of ['Real Secret Name', 'secret text', ok.real.id, ok.real.pinKey]) assert.equal(text.includes(secret), false, secret);
  for (const extra of [{state: 'hidden'}, {state: 'unidentified'}, {archived: true}, {audience: {mode: 'selected', userIds: ['p9']}}])
    assert.equal('parent' in mk(extra).view, false, JSON.stringify(extra));
  assert.equal('parent' in companionView(ok.real, {label: 'x'}), false, 'without the list, no parent');
});

test('companion placeholder in the window: grouped under the real location\'s visible parent, real name absent', async () => {
  const w = await world();
  const c1 = (await w.gm.saveLocation({id: 'LOC-TEST-COMP', name: '[TEST] Real Companion Name', description: 'secret text companion'})).id;
  await w.gm.moveLocation(c1, w.ids.fosstryn);
  await w.gm.setLocationState(c1, 'revealed');
  await w.gm.setAudience(c1, {mode: 'selected', userIds: ['p1'], othersUnidentified: true});
  const m = as(w.users.get('p2'), () => buildListModel(readViews(), {gm: false}));
  const foss = m.sections[0].sections.find(s => s.label === '[TEST] Fosstryn');
  assert.equal(foss.unidentified, 2, 'the Shrine and the placeholder, both only by the generic label');
  assert.equal(foss.rows.filter(r => r.name === 'Unknown location').length, 2);
  const app = new LocationsApp(); app.render = async () => {};
  const html = await as(w.users.get('p2'), () => app._renderHTML());
  assert.equal(/Real Companion Name|secret text companion|LOC-TEST-COMP/.test(html + JSON.stringify(readViewsAs(w, 'p2')) + pagesTextFor(w, 'p2')), false);
  const views = readViewsAs(w, 'p2');
  assert.equal(views.find(v => v.parent?.name === '[TEST] Fosstryn' && v.state === 'unidentified' && !v.teaser)?.parent.name, '[TEST] Fosstryn');
  // A real location with a hidden parent: the placeholder falls back to the flat group.
  const c2 = (await w.gm.saveLocation({id: 'LOC-TEST-COMP2', name: '[TEST] Real Companion Two'})).id;
  await w.gm.moveLocation(c2, w.ids.hiddenreg);
  await w.gm.setLocationState(c2, 'revealed');
  await w.gm.setAudience(c2, {mode: 'selected', userIds: ['p1'], othersUnidentified: true});
  const after = JSON.stringify(readViewsAs(w, 'p2'));
  assert.equal(/Hidden Realm|Real Companion Two|COMP2/.test(after), false);
});
const pagesTextFor = (w, id) => JSON.stringify([...game.journal].flatMap(j => [...j.pages].filter(p => p.testUserPermission(w.users.get(id), 'OBSERVER')).map(p => [p.name, p.text?.content, p.flags])));

test('buildRegionSections: counts, flat fallback and header rule on plain views', () => {
  const R = {id: 'LOC-R', key: 'k-r', state: 'revealed', name: 'Region', isRegion: true};
  const C = {id: 'LOC-C', key: 'k-c', state: 'revealed', name: 'Child', parent: {id: 'LOC-R', key: 'k-r', name: 'Region'}};
  const U = {key: 'k-u', state: 'unidentified', name: 'Unknown location', parent: {id: 'LOC-R', key: 'k-r', name: 'Region'}};
  const F = {key: 'k-f', state: 'unidentified', name: 'Unknown location'};
  const out = buildRegionSections([R, C, U, F], VIEW_ACCESS);
  assert.deepEqual(out.map(s => [s.label, s.count, s.unidentified, s.rows.map(r => r.name)]), [['Region', 1, 1, ['Child', 'Unknown location']], [UNIDENTIFIED, 1, 0, ['Unknown location']]]);
  const only = buildRegionSections([R, U], VIEW_ACCESS);
  assert.deepEqual(only.map(s => [s.label, s.flat, s.count, s.unidentified]), [[NO_REGION, true, 1, 1]], 'no header; Region is a plain row and the unidentified place nests under it');
});
