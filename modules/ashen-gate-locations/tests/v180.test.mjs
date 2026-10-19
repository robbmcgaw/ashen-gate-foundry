/** 1.8.0: Region inheritance switch and migration, nested folders (tree), per-player audience with sharing, and the
 *  Placeable flag. Mocked Foundry documents and permissions: this proves the logic and the data each user gets, not
 *  the live Foundry canvas or window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {createNotesService, NOT_AVAILABLE} from '../scripts/party-notes.mjs';
import {createShareService} from '../scripts/sharing.mjs';
import {readAll, writeAll, readViews, placeNote, migrate, readNotes, writeNotes, readPlayerNotes, readSharedNotes, syncSharedNotes, pinsOf, players} from '../scripts/store.mjs';
import {normalizeLocation, effectiveConditions, playerView, publishable, pinPresentation, isPlaceable, resolvePassConditions, applyShare, exportPackage, importRecords, IMPORT_SCHEMA} from '../scripts/model.mjs';
import {buildTree, withAncestors, breadcrumb, moveTargets, checkMove, flatten, VIEW} from '../scripts/tree.mjs';
import {applyFilters, filterOptions} from '../scripts/list-filter.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const L = (name, extra = {}) => ({name: `[TEST] ${name}`, ...extra});

/** A world with a GM and three players, the real store and API, and one API per user. */
async function world({access = true} = {}) {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}],
    ['p3', {id: 'p3', name: '[TEST] Cole', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const state = {access};
  const gmDo = fn => (...a) => as(users.get('gm'), () => fn(...a));
  const sharing = createShareService({users, currentUser: () => game.user, isPrimaryGM: () => game.user.isGM, playerAccessEnabled: () => state.access,
    readAll: gmDo(readAll), writeAll: gmDo(writeAll)});
  const notes = createNotesService({users, currentUser: () => game.user, isPrimaryGM: () => game.user.isGM, playerAccessEnabled: () => state.access,
    readAll: gmDo(readAll), readNotes: gmDo(readNotes), writeNotes: gmDo(writeNotes), reconcile: gmDo(loc => syncSharedNotes([loc]))});
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '1.8.0', isGM: () => u.isGM, playerAccessEnabled: () => state.access, setPlayerAccess: async v => { state.access = v; },
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, pinsOf, playerIds: () => players().map(x => x.id),
    sharing: {request: payload => sharing.perform(payload, u)},
    notes: {readGM: id => as(u, () => readNotes(id)), readPlayer: key => as(u, () => readPlayerNotes(key)), request: payload => notes.perform(payload, u).then(r => r.notes),
      userId: () => u.id, isActive: notes.isActive, nameOf: notes.nameOf}}));
  const mod = {version: '1.8.0', active: true, api: apis.get('gm')};
  g.modules = {get: id => id === MOD ? mod : null};
  const api = id => apis.get(id);
  return {g, users, state, api, user: id => users.get(id), sharing, notes, mod, asUser: (id, fn) => { mod.api = apis.get(id); return as(users.get(id), fn); }};
}
const reveal = async (api, id) => api.setLocationState(id, 'revealed');

// ---------------- 1. Region inheritance off by default ----------------

test('a new Region passes nothing down until "Pass conditions to places inside" is on', async () => {
  const {api} = await world();
  const region = await api('gm').saveLocation(L('Marsh', {isRegion: true, sections: {conditions: true}, conditions: [{key: 'fog', label: 'Dense fog'}]}));
  assert.equal(region.passConditions, false, 'new records are off, not "unset"');
  const hut = await api('gm').saveLocation(L('Hut', {parentLocationId: region.id, sections: {conditions: true}}));
  assert.deepEqual(effectiveConditions(hut, api('gm').listLocations()), [], 'no inherited section on the child');
  await api('gm').saveLocation({...region, passConditions: true});
  assert.deepEqual(effectiveConditions(hut, api('gm').listLocations()).map(c => [c.label, c.inherited]), [['Dense fog', true]]);
  // Players follow the published switch: off until the Region is published with it on.
  await reveal(api('gm'), hut.id);
  await api('gm').saveLocation({...api('gm').getLocation(region.id), passConditions: false});
  await reveal(api('gm'), region.id);
  assert.equal(api('p1').getLocation(hut.id).conditions, undefined);
  await api('gm').saveLocation({...api('gm').getLocation(region.id), passConditions: true});
  await api('gm').publishLocation(region.id);
  assert.deepEqual(api('p1').getLocation(hut.id).conditions, [{label: 'Dense fog', text: ''}]);
});

test('migration: Regions that were passing conditions stay on (and are listed); the rest are off; re-run writes nothing', async () => {
  const {api} = await world();
  const old = [
    // Written the way 1.7.0 stored them: no passConditions anywhere.
    {id: 'LOC-TEST-VALE', name: '[TEST] Vale', isRegion: true, conditions: [{key: 'c', label: 'Rain'}], sections: {conditions: true}, state: 'revealed'},
    {id: 'LOC-TEST-FARM', name: '[TEST] Farm', parentLocationId: 'LOC-TEST-VALE', sections: {conditions: true}, state: 'revealed'},
    {id: 'LOC-TEST-EMPTY', name: '[TEST] Empty Region', isRegion: true, conditions: [{key: 'c', label: 'Ash'}]},
    {id: 'LOC-TEST-BARE', name: '[TEST] Bare Region', isRegion: true},
    {id: 'LOC-TEST-HAMLET', name: '[TEST] Hamlet', parentLocationId: 'LOC-TEST-BARE'}
  ];
  await JournalEntry.create({name: 'Locations (GM Data)', ownership: {default: 0}, flags: {[MOD]: {role: 'gm-data', locations: old.map(r => {
    const n = normalizeLocation(r);
    const strip = b => { if (b) delete b.passConditions; return b; };
    strip(n); strip(n.published);
    return n;
  })}}});
  // Before the migration nothing changes: the unset switch reads as the old behaviour.
  assert.deepEqual(effectiveConditions(api('gm').getLocation('LOC-TEST-FARM'), api('gm').listLocations()).map(c => c.label), ['Rain']);
  const r = await migrate();
  assert.deepEqual(r.inheritance, [{id: 'LOC-TEST-VALE', name: '[TEST] Vale'}]);
  const by = id => api('gm').getLocation(id);
  assert.deepEqual(['LOC-TEST-VALE', 'LOC-TEST-EMPTY', 'LOC-TEST-BARE', 'LOC-TEST-FARM'].map(id => by(id).passConditions), [true, false, false, false]);
  assert.equal(by('LOC-TEST-VALE').published.passConditions, true, 'the published copy keeps passing too');
  assert.deepEqual(api('p1').getLocation('LOC-TEST-FARM').conditions, [{label: 'Rain', text: ''}], 'players see no change');
  assert.equal(api('gm').hasUnpublishedChanges('LOC-TEST-VALE'), false, 'the migration does not create unpublished edits');
  const again = await migrate();
  assert.deepEqual(again, {records: 0, pages: 0, notes: 0, unsettled: 0, inheritance: []});
});

test('resolvePassConditions only fills unset values and an import of a 1.7.0 package settles them the same way', async () => {
  const list = [normalizeLocation({id: 'LOC-TEST-A', isRegion: true, passConditions: false, conditions: [{label: 'x'}]}), normalizeLocation({id: 'LOC-TEST-B', parentLocationId: 'LOC-TEST-A'})];
  assert.equal(resolvePassConditions(list).list[0].passConditions, false, 'an explicit off is kept');
  const {api} = await world();
  const pkg = {manifest: {schema_version: IMPORT_SCHEMA}, records: [
    {id: 'LOC-TEST-OLD-REGION', entity_type: 'Location', location: {name: '[TEST] Old Region', isRegion: true, conditions: [{label: 'Cold'}]}},
    {id: 'LOC-TEST-OLD-CHILD', entity_type: 'Location', location: {name: '[TEST] Old Child', parentLocationId: 'LOC-TEST-OLD-REGION'}}]};
  await api('gm').importPackage(pkg);
  assert.equal(api('gm').getLocation('LOC-TEST-OLD-REGION').passConditions, true);
  assert.equal(api('gm').getLocation('LOC-TEST-OLD-CHILD').passConditions, false);
});

// ---------------- 2. Nested folders ----------------

async function nested(api) {
  const mk = async (name, parent = '', extra = {}) => (await api('gm').saveLocation(L(name, {parentLocationId: parent, ...extra}))).id;
  const over = await mk('Overworld', '', {isRegion: true});
  const front = await mk('Frontier', over, {isRegion: true});
  const town = await mk('Town', front, {isRegion: true});
  const muster = await mk('Muster', town, {isRegion: true});
  const hall = await mk('Guildhall', muster);
  const inn = await mk('Inn', town);
  const lone = await mk('Lone Tower');
  return {over, front, town, muster, hall, inn, lone};
}

test('tree: any depth, counts direct and total, breadcrumb path, ancestors kept for matches', async () => {
  const {api} = await world();
  const ids = await nested(api);
  const all = api('gm').listLocations();
  const tree = buildTree(all, {sort: (a, b) => a.name.localeCompare(b.name)});
  assert.deepEqual(tree.map(n => n.item.name), ['[TEST] Lone Tower', '[TEST] Overworld']);
  const over = tree[1];
  assert.deepEqual([over.direct, over.total], [1, 5]);
  const town = over.children[0].children[0];
  assert.deepEqual([town.item.name, town.direct, town.total, town.depth], ['[TEST] Town', 2, 3, 2]);
  assert.deepEqual(flatten(tree).map(n => n.depth), [0, 0, 1, 2, 3, 3, 4]);
  assert.deepEqual(flatten(tree, id => id !== ids.town).length, 4, 'a closed folder hides what is inside it');
  assert.deepEqual(breadcrumb(all, ids.hall).map(l => l.name), ['[TEST] Overworld', '[TEST] Frontier', '[TEST] Town', '[TEST] Muster']);
  assert.deepEqual(breadcrumb(all, ids.lone), []);
  const show = withAncestors(all, all.filter(l => l.id === ids.hall));
  assert.deepEqual([...show].sort(), [ids.over, ids.front, ids.town, ids.muster, ids.hall].sort());
  assert.deepEqual(flatten(buildTree(all, {show})).map(n => n.item.name).at(-1), '[TEST] Guildhall');
});

test('reparent: moves at once, refuses a loop, Move to lists only safe Regions, and the move can be undone', async () => {
  const {api} = await world();
  const ids = await nested(api);
  const gm = api('gm');
  await assert.rejects(gm.moveLocation(ids.town, ids.hall), /cannot go inside/);
  await assert.rejects(gm.moveLocation(ids.town, ids.town), /cannot go inside/);
  await assert.rejects(gm.moveLocation(ids.town, 'LOC-TEST-NOPE'), /No location/);
  assert.throws(() => checkMove(gm.listLocations(), ids.front, ids.muster), /inside/);
  const targets = moveTargets(gm.listLocations(), ids.town).map(l => l.id);
  assert.deepEqual(targets.sort(), [ids.over, ids.front].sort(), 'no descendants, no non-Regions, not itself');
  const r = await gm.moveLocation(ids.inn, ids.muster);
  assert.deepEqual(r, {id: ids.inn, from: ids.town, to: ids.muster});
  assert.equal(gm.getLocation(ids.inn).parentLocationId, ids.muster);
  await gm.moveLocation(r.id, r.from);
  assert.equal(gm.getLocation(ids.inn).parentLocationId, ids.town, 'undo puts it back');
  await gm.moveLocation(ids.lone, '');
  assert.equal(gm.getLocation(ids.lone).parentLocationId, '');
});

test('players: tree shows only visible places; an unseen ancestor is never named, an unidentified one by its label', async () => {
  const {api} = await world();
  const ids = await nested(api);
  const gm = api('gm');
  await gm.saveLocation({...gm.getLocation(ids.town), unidentifiedLabel: '[TEST] Smoky town'});
  for (const id of [ids.over, ids.muster, ids.hall]) await reveal(gm, id);
  await gm.setLocationState(ids.town, 'unidentified');
  const views = api('p1').listLocations({includeUnidentified: true});
  const text = JSON.stringify(views);
  assert.doesNotMatch(text, /Frontier|\[TEST\] Town"/, 'hidden Frontier and the true name of the unidentified Town never reach the player');
  const tree = buildTree(views, VIEW);
  const names = flatten(tree).map(n => [n.depth, n.item.name]);
  assert.deepEqual(names.filter(([d]) => d === 0).map(([, n]) => n).sort(), ['[TEST] Overworld', '[TEST] Smoky town'], 'Town has no visible parent: top level');
  assert.ok(names.some(([d, n]) => d === 2 && n === '[TEST] Guildhall'), 'Guildhall sits inside Muster inside the unidentified Town');
  const hallView = views.find(v => v.name === '[TEST] Guildhall');
  assert.deepEqual(breadcrumb(views, hallView.key, VIEW).map(v => v.name), ['[TEST] Smoky town', '[TEST] Muster']);
});

test('GM window: Tree mode renders folders with counts, drop targets, create-inside, filters keep the path; breadcrumb and Move to on the card', async () => {
  const {api, asUser} = await world();
  const ids = await nested(api);
  const app = new LocationsApp();
  app.treeMode = true;
  let html = await asUser('gm', () => app._renderHTML());
  assert.match(html, /id="agl-tree" aria-pressed="true"/);
  assert.match(html, /data-folder="LOC-TEST-OVERWORLD"/);
  assert.match(html, /title="1 directly inside, 5 in total">1 · 5</);
  assert.match(html, /data-action="new-child" data-parent="LOC-TEST-OVERWORLD"/);
  assert.match(html, /data-action="tree-all" data-open="1"/);
  const listPart = h => h.slice(0, h.indexOf('<section class="agl-detail">'));
  assert.doesNotMatch(listPart(html), /\[TEST\] Guildhall/, 'folders start closed');
  LocationsApp.treeOpen.clear();
  app.select(ids.hall);
  html = await asUser('gm', () => app._renderHTML());
  assert.match(listPart(html), /\[TEST\] Guildhall/, "the selected location's folders open");
  assert.match(html, /<nav class="agl-crumbs"[^>]*>.*Overworld.*Frontier.*Town.*Muster/s, 'breadcrumb path on the card');
  assert.match(html, /data-action="move-to"/);
  app.select(ids.lone); app.query = 'guildhall';
  html = await asUser('gm', () => app._renderHTML());
  assert.match(html, /agl-tree__item--path/, 'ancestors of a match are shown, marked as path only');
  assert.match(listPart(html), /\[TEST\] Guildhall/);
  assert.doesNotMatch(listPart(html), /\[TEST\] Inn</);
});

// ---------------- 3. Reveal to specific players, with sharing ----------------

async function restricted() {
  const w = await world();
  const gm = w.api('gm');
  const vale = await gm.saveLocation(L('Vale', {isRegion: true, passConditions: true, sections: {conditions: true, resources: true, quests: true},
    conditions: [{key: 'c', label: 'Public rain'}], resources: [{label: '[TEST] Reeds', materialId: 'MAT-TEST-REED'}], quests: [{questId: 'QUEST-TEST-ONE'}]}));
  const secret = await gm.saveLocation(L('Secret Grove', {parentLocationId: vale.id, isRegion: true, passConditions: true, sections: {conditions: true, resources: true, quests: true},
    conditions: [{key: 's', label: 'Whispering trees'}], resources: [{label: '[TEST] Moonleaf', materialId: 'MAT-TEST-MOON'}], quests: [{questId: 'QUEST-TEST-ONE'}],
    audience: {mode: 'selected', userIds: ['p1']}}));
  const shrine = await gm.saveLocation(L('Shrine', {parentLocationId: secret.id, sections: {conditions: true}}));
  for (const l of [vale, secret, shrine]) await reveal(gm, l.id);
  return {...w, vale, secret, shrine};
}

test('selected players: only listed players get the location on every read path; everyone else gets the Hidden answer', async () => {
  const {api, secret, vale, shrine} = await restricted();
  assert.deepEqual(api('gm').getAudience(secret.id), {mode: 'selected', userIds: ['p1'], sharedBy: {}, sharing: true}, 'audience kept from the new draft');
  const p1 = api('p1'), p2 = api('p2');
  assert.equal(p1.getLocation(secret.id).name, '[TEST] Secret Grove');
  assert.deepEqual(p1.resourcesAt(secret.id).map(r => r.label), ['[TEST] Moonleaf']);
  assert.ok(p1.locationsForQuest('QUEST-TEST-ONE').some(l => l.id === secret.id));
  assert.equal(p2.getLocation(secret.id), null);
  assert.equal(p2.getLocation(secret.pinKey), null, 'not by pin key either');
  assert.equal(p2.resourcesAt(secret.id).length, 0);
  assert.deepEqual(p2.locationsForQuest('QUEST-TEST-ONE').map(l => l.id), [vale.id]);
  assert.deepEqual(p2.locationsWithMaterial('MAT-TEST-MOON'), []);
  assert.deepEqual(p2.nodesForMaterial('MAT-TEST-MOON'), []);
  assert.equal(p2.getPartyNotes(secret.pinKey), null);
  const p2text = JSON.stringify(p2.listLocations({includeUnidentified: true}));
  assert.doesNotMatch(p2text, /Secret Grove|Moonleaf|Whispering|SECRET-GROVE/, 'no name, node, condition or id in anything p2 reads');
  assert.equal(p2.getLocation(vale.id).children, undefined, "the public parent does not list p2's unseen child");
  assert.equal(p2.getLocation(shrine.id).parent, undefined, 'nor does the public child name it');
  // The Shrine card is read by everyone: it inherits the public Vale's condition (through the grove) but nothing from the grove itself.
  assert.deepEqual(p2.getLocation(shrine.id).conditions, [{label: 'Public rain', text: ''}]);
  assert.deepEqual(p1.getLocation(shrine.id).conditions, [{label: 'Public rain', text: ''}]);
  assert.deepEqual(p1.getLocation(secret.id).conditions.map(c => c.label), ['Public rain', 'Whispering trees']);
  assert.deepEqual(p1.getLocation(vale.id).children, undefined);
  assert.deepEqual(p1.getLocation(secret.id).parent.name, '[TEST] Vale', 'p1 sees where the grove is');
  assert.deepEqual(p1.getLocation(secret.id).share, {userIds: ['p1'], canShare: true});
});

test('selected players: pages, shared-notes pages and Map Notes use per-user Foundry ownership; pins carry no label', async () => {
  const {api, secret, g, user} = await restricted();
  const page = game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view').pages.find(p => p.getFlag(MOD, 'pinKey') === secret.pinKey);
  assert.deepEqual(page.ownership, {default: 0, p1: -1, p2: 0, p3: 0});
  assert.equal(page.testUserPermission(user('p1'), 'OBSERVER'), true);
  assert.equal(page.testUserPermission(user('p2'), 'LIMITED'), false, 'Foundry hides a Note on this page from p2');
  const scene = new (await import('./foundry-mock.mjs')).Scene();
  g.scenes = [scene];
  const note = await api('gm').placeOnScene(secret.id, {scene, x: 10, y: 10});
  assert.equal(note.pageId, page.id);
  assert.equal(note.text, '', 'the Note itself carries no name; Foundry labels it from the page for those who may open it');
  assert.deepEqual(api('gm').pinsOf(secret.id).map(p => p.count), [1]);
  assert.equal(pinPresentation({...secret, state: 'revealed', published: publishable(secret)}).text, '');
  // Party Notes: p1 writes, p2 is refused exactly as for a hidden place.
  await api('p1').editPartyNotes(secret.pinKey);
  await api('p1').savePartyNotes(secret.pinKey, '[TEST] p1 notes', 0);
  assert.equal(api('p1').getPartyNotes(secret.pinKey).text, '[TEST] p1 notes');
  await assert.rejects(api('p2').editPartyNotes(secret.pinKey), {message: NOT_AVAILABLE});
  const shared = game.journal.find(j => j.getFlag(MOD, 'role') === 'shared-notes').pages.find(p => p.getFlag(MOD, 'pinKey') === secret.pinKey);
  assert.deepEqual(shared.ownership, {default: 0, p1: 3, p2: 0, p3: 0});
  assert.equal(as(user('p2'), () => readSharedNotes(secret.pinKey)), null);
  assert.equal(as(user('p2'), () => readPlayerNotes(secret.pinKey)), null);
});

test('a notes receipt over the socket never carries a "Selected players" location\'s notes', async () => {
  const {users, secret, vale, api} = await restricted();
  const sent = [];
  const svc = createNotesService({users, currentUser: () => users.get('gm'), isPrimaryGM: () => true, playerAccessEnabled: () => true,
    readAll: () => as(users.get('gm'), readAll), readNotes: id => as(users.get('gm'), () => readNotes(id)), writeNotes: (l, r) => as(users.get('gm'), () => writeNotes(l, r)),
    socket: {emit: (_n, m) => sent.push(m)}});
  await svc.onSocket({type: 'notes-request', requestId: 'r1', userId: 'p1', op: 'lock', ref: secret.pinKey}, 'p1');
  await svc.onSocket({type: 'notes-request', requestId: 'r2', userId: 'p2', op: 'lock', ref: vale.pinKey}, 'p2');
  assert.deepEqual(sent.map(m => [m.ok, m.notes === null]), [[true, true], [true, false]]);
  assert.ok(api('gm'));
});

test('sharing: a player adds others (recorded as shared by them); GM sees it and can undo; every refusal is safe', async () => {
  const {api, secret, vale, users, sharing} = await restricted();
  assert.deepEqual(await api('p1').shareLocation(secret.pinKey, ['p2']), {added: 1});
  assert.deepEqual(api('gm').getAudience(secret.id), {mode: 'selected', userIds: ['p1', 'p2'], sharedBy: {p2: 'p1'}, sharing: true});
  assert.equal(api('p2').getLocation(secret.id).name, '[TEST] Secret Grove', 'p2 now sees it');
  await assert.rejects(api('p3').shareLocation(secret.pinKey, ['p3']), /isn't available/, 'p3 cannot see it, so cannot share it');
  await assert.rejects(sharing.perform({ref: secret.pinKey, userIds: ['p3']}, users.get('p3')), {message: NOT_AVAILABLE}, 'nor by hand over the socket');
  await assert.rejects(sharing.perform({ref: secret.pinKey, userIds: ['gm']}, users.get('p1')), /only share with players/);
  await assert.rejects(sharing.perform({ref: vale.pinKey, userIds: ['p2']}, users.get('p1')), /Everyone can already see/);
  // The GM undoes the share by unticking p2.
  await api('gm').setAudience(secret.id, {userIds: ['p1']});
  assert.equal(api('p2').getLocation(secret.id), null);
  const page = game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view').pages.find(p => p.getFlag(MOD, 'pinKey') === secret.pinKey);
  assert.equal(page.ownership.p2, 0, 'ownership is set back explicitly, not left merged');
  // Sharing off: refused on the API and on the GM side.
  await api('gm').setAudience(secret.id, {sharing: false});
  assert.equal(api('p1').getLocation(secret.id).share.canShare, false);
  await assert.rejects(api('p1').shareLocation(secret.pinKey, ['p3']), /turned sharing off/);
  await assert.rejects(sharing.perform({ref: secret.pinKey, userIds: ['p3']}, users.get('p1')), /turned sharing off/);
  await assert.rejects(api('gm').setAudience(secret.id, {mode: 'nobody'}), /Unknown audience/);
  await assert.rejects(api('gm').setAudience(secret.id, {userIds: ['ghost']}), /Not a player/);
  // Back to Everyone: everyone sees it again; nothing else about the location changed.
  await api('gm').setAudience(secret.id, {mode: 'everyone'});
  assert.equal(api('p3').getLocation(secret.id).name, '[TEST] Secret Grove');
  assert.equal(api('p3').getLocation(secret.id).share, undefined);
});

test('sharing over the socket: receipts carry only ok, a message and a count', async () => {
  const {users} = await restricted();
  const sent = [];
  const gmSvc = createShareService({users, currentUser: () => users.get('gm'), isPrimaryGM: () => true, playerAccessEnabled: () => true,
    readAll: () => as(users.get('gm'), readAll), writeAll: l => as(users.get('gm'), () => writeAll(l)), socket: {emit: (_n, m) => sent.push(m)}});
  const key = as(users.get('gm'), readAll).find(l => l.name === '[TEST] Secret Grove').pinKey;
  await gmSvc.onSocket({type: 'share-request', requestId: 'a', userId: 'p1', ref: key, userIds: ['p3']}, 'p1');
  await gmSvc.onSocket({type: 'share-request', requestId: 'b', userId: 'p2', ref: key, userIds: ['p2']}, 'p2');
  await gmSvc.onSocket({type: 'share-request', requestId: 'c', userId: 'p1', ref: key, userIds: ['p2']}, 'p2');
  assert.deepEqual(sent.map(m => [m.requestId, m.ok, m.added]), [['a', true, 1], ['b', false, 0], ['c', false, 0]]);
  assert.match(sent[2].message, /sender mismatch/);
  for (const m of sent) assert.deepEqual(Object.keys(m).sort(), ['added', 'message', 'ok', 'requestId', 'type', 'userId']);
  assert.doesNotMatch(JSON.stringify(sent), /Grove|LOC-/);
  const pSvc = createShareService({users, currentUser: () => users.get('p1'), isPrimaryGM: () => false, playerAccessEnabled: () => true, readAll, writeAll,
    socket: {emit: () => {}}, timeout: 50});
  users.get('gm').active = false;
  await assert.rejects(pSvc.request({ref: key, userIds: ['p2']}), /GM must be connected/);
});

test('applyShare is pure and adds only', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-X', audience: {mode: 'selected', userIds: ['p1', 'p2'], sharedBy: {p2: 'p1'}}});
  const r = applyShare(loc, 'p2', ['p3', 'p1'], ['p1', 'p2', 'p3']);
  assert.deepEqual(r, {audience: {mode: 'selected', userIds: ['p1', 'p2', 'p3'], sharedBy: {p2: 'p1', p3: 'p2'}, sharing: true}, added: ['p3']});
  assert.deepEqual(loc.audience.userIds, ['p1', 'p2'], 'input untouched');
  assert.throws(() => applyShare(loc, 'p2', [], ['p1']), /at least one/);
});

test('GM card: Who Can See It lists players with "shared by"; players get Share with...', async () => {
  const {api, secret, asUser} = await restricted();
  await api('p1').shareLocation(secret.pinKey, ['p2']);
  const app = new LocationsApp();
  app.select(secret.id);
  const html = await asUser('gm', () => app._renderHTML());
  assert.match(html, /Who Can See It/);
  assert.match(html, /value="selected" checked/);
  assert.match(html, /value="p2" checked> \[TEST\] Bram<\/label>\s*<span class="ag-badge ag-badge--warn" title="Untick to undo">shared by \[TEST\] Ava/);
  assert.match(html, /data-action-change="audience-sharing" checked/);
  const pApp = new LocationsApp();
  const pHtml = await asUser('p1', () => { pApp.select(secret.pinKey); return pApp._renderHTML(); });
  assert.match(pHtml, /data-action="share"/);
  assert.match(pHtml, /Also known to \[TEST\] Bram/);
  const p3 = new LocationsApp();
  assert.doesNotMatch(await asUser('p3', () => p3._renderHTML()), /Secret Grove/);
});

// ---------------- 4. Placeable ----------------

test('placeable: on for places, off for Regions, explicit choice wins; filter, listLocations and the card follow it', async () => {
  const {api, asUser, g} = await world();
  assert.equal(isPlaceable(normalizeLocation({})), true);
  assert.equal(isPlaceable(normalizeLocation({isRegion: true})), false);
  assert.equal(isPlaceable(normalizeLocation({isRegion: true, placeable: true})), true);
  assert.equal(isPlaceable(normalizeLocation({placeable: false})), false);
  const gm = api('gm');
  const region = await gm.saveLocation(L('Region', {isRegion: true}));
  const inn = await gm.saveLocation(L('Inn'));
  const shrine = await gm.saveLocation(L('Wayshrine', {placeable: false}));
  assert.deepEqual(gm.listLocations({placeableOnly: true}).map(l => l.id), [inn.id]);
  assert.equal(gm.listLocations().length, 3, 'the full list is unchanged');
  const rows = gm.listLocations();
  assert.deepEqual(applyFilters(rows, {placeable: 'no'}).map(l => l.id).sort(), [region.id, shrine.id].sort());
  assert.deepEqual(filterOptions(rows, {placeable: ''}).placeable.map(o => o.count), [1, 2]);
  const app = new LocationsApp();
  app.select(region.id);
  let html = await asUser('gm', () => app._renderHTML());
  assert.doesNotMatch(html, /data-action="place"/, 'a representative-only card offers no Place on Scene');
  assert.match(html, /data-id="LOC-TEST-REGION" draggable="true" data-drag-type="AshenGateLocationMove"/, 'and it cannot be dropped on the canvas');
  assert.match(html, /data-id="LOC-TEST-INN" draggable="true" data-drag-type="AshenGateLocation"/);
  assert.match(html, /data-toggle="placeable" >/);
  app.showRep = true;
  html = await asUser('gm', () => app._renderHTML());
  assert.match(html, /data-action="place"/);
  assert.match(html, /data-id="LOC-TEST-REGION" draggable="true" data-drag-type="AshenGateLocation"/);
  // A pinned location always shows its pins and its Place button.
  app.showRep = false;
  const scene = new (await import('./foundry-mock.mjs')).Scene();
  g.scenes = [scene];
  await gm.placeOnScene(shrine.id, {scene, x: 0, y: 0});
  app.select(shrine.id);
  html = await asUser('gm', () => app._renderHTML());
  assert.match(html, /Pinned on Test Scene/);
  assert.match(html, /data-action="place"/);
});

// ---------------- Export / import round trip, regression ----------------

test('export/import round-trips the new fields; update mode keeps the world audience; a 1.7.0 package keeps the world values', async () => {
  const {api} = await restricted();
  const pkg = api('gm').exportPackage();
  const rec = pkg.records.find(r => r.name === '[TEST] Secret Grove');
  assert.equal(rec.location.passConditions, true);
  assert.deepEqual(rec.location.audience, {mode: 'selected', userIds: ['p1'], sharedBy: {}, sharing: true});
  assert.equal(rec.location.placeable, null);
  const fresh = importRecords(pkg.records, []);
  const grove = fresh.created.find(l => l.name === '[TEST] Secret Grove');
  assert.deepEqual([grove.passConditions, grove.audience.mode, grove.isRegion], [true, 'selected', true]);
  const world = api('gm').listLocations();
  const changed = structuredClone(rec);
  changed.location.audience = {mode: 'everyone'};
  changed.location.placeable = true;
  const up = importRecords([changed], world, {mode: 'update'});
  assert.equal(up.updated[0].audience.mode, 'selected', 'who may see it is play state: an update keeps it');
  assert.equal(up.updated[0].placeable, true);
  const old = structuredClone(rec);
  delete old.location.passConditions; delete old.location.placeable; delete old.location.audience;
  const up17 = importRecords([old], world, {mode: 'update'});
  assert.deepEqual([up17.updated[0].passConditions, up17.updated[0].placeable], [true, null]);
});

test('regression: Everyone locations behave as in 1.7.0 for every player', async () => {
  const {api} = await world();
  const gm = api('gm');
  const mill = await gm.saveLocation(L('Mill', {sections: {resources: true}, resources: [{label: '[TEST] Flour'}]}));
  await reveal(gm, mill.id);
  for (const p of ['p1', 'p2', 'p3']) assert.deepEqual(api(p).resourcesAt(mill.id).map(r => r.label), ['[TEST] Flour']);
  const view = api('p1').getLocation(mill.id);
  assert.equal(view.share, undefined);
  assert.equal(pinPresentation(gm.getLocation(mill.id)).text, '[TEST] Mill', 'Everyone pins keep their label');
  const page = game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view').pages.find(p => p.getFlag(MOD, 'pinKey') === mill.pinKey);
  assert.deepEqual(page.ownership, {default: -1, p1: -1, p2: -1, p3: -1});
  assert.deepEqual(gm.getAudience(mill.id), {mode: 'everyone', userIds: [], sharedBy: {}, sharing: true});
  // Saving a stale draft never undoes a share made meanwhile.
  await gm.setAudience(mill.id, {mode: 'selected', userIds: ['p1']});
  await gm.saveLocation({...mill, name: '[TEST] Mill (renamed)'});
  assert.equal(gm.getAudience(mill.id).mode, 'selected');
  assert.equal(playerView(normalizeLocation({}), []), null);
});
