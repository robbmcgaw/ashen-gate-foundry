/**
 * 0.28.0: "Everyone else sees it as unidentified". A Selected-players location can give the players who are NOT selected an unidentified
 * companion pin and page at the same spot. Mocked Foundry documents and permissions: this proves the data each user gets and the sync, NOT
 * that the live Foundry canvas hides or shows each Note per user (that rests on page ownership, as in 1.8.0, and needs a live check).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, Scene} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, pinReport, removeManagedPins, pinsOf, players, syncSceneCompanions, ownershipFor, companionOwnership} from '../scripts/store.mjs';
import {normalizeLocation, normalizeAudience, companionActive, companionView, exportPackage, importRecords, parseImport, publishable, hasUnpublishedChanges, PIN_KEY} from '../scripts/model.mjs';
import {isCompanion, COMPANION_MARK, applyPinLook} from '../scripts/pin-look.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const MOD = 'ashen-gate-locations';
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const REAL = '[TEST] Hollow Crypt';
const DESC = 'Bone-white stairs descend into a vault of [TEST] secrets.';

async function world() {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}],
    ['p3', {id: 'p3', name: '[TEST] Cole', isGM: false, active: true}]]);
  g.users = users;
  g.user = users.get('gm');
  const scene = new Scene();
  g.scenes = [scene];
  const apis = new Map();
  for (const u of users.values()) apis.set(u.id, createApi({version: '0.29.0', isGM: () => u.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(u, readAll), writeAll: list => as(u, () => writeAll(list)), readViews: () => as(u, readViews), placeNote: (loc, o) => as(u, () => placeNote(loc, o)),
    open: () => {}, openLocation: () => {}, pinsOf, playerIds: () => players().map(x => x.id),
    pins: {report: l => as(users.get('gm'), () => pinReport(l)), remove: l => as(users.get('gm'), () => removeManagedPins(l))}}));
  g.modules = {get: id => id === MOD ? {version: '0.29.0', active: true, api: apis.get(game.user.id)} : null};
  const gm = apis.get('gm');
  const crypt = await gm.saveLocation({name: REAL, description: DESC, teaser: 'A [TEST] teaser', unidentifiedLabel: '', sections: {}, show: {description: true}});
  await gm.setLocationState(crypt.id, 'revealed');
  return {g, users, scene, api: id => apis.get(id), gm, crypt, user: id => users.get(id)};
}
const view = (g, id) => as(g.users.get(id), readViews);
const journal = () => [...game.journal].find(j => j.getFlag(MOD, 'role') === 'player-view');
const comps = () => journal().pages.filter(p => p.getFlag(MOD, 'companionKey'));
const reals = () => journal().pages.filter(p => p.getFlag(MOD, 'pinKey'));
const noteSplit = scene => ({real: scene.notes.filter(n => n.getFlag(MOD, 'pinKey')), comp: scene.notes.filter(n => n.getFlag(MOD, 'companionKey'))});
/** Selected = p1, option on, a real pin at (100, 200). */
async function setup(extra = {}) {
  const w = await world();
  await w.gm.setAudience(w.crypt.id, {mode: 'selected', userIds: ['p1'], othersUnidentified: true, ...extra});
  const loc = as(w.users.get('gm'), () => readAll()).find(l => l.id === w.crypt.id);
  const note = await as(w.users.get('gm'), () => placeNote(loc, {scene: w.scene, x: 100.4, y: 200.6}));
  return {...w, loc, note};
}

// ---------------- model ----------------

test('model: defaults off, stores a key only when on, normalises to booleans, round-trips', () => {
  assert.deepEqual(normalizeAudience(undefined), {mode: 'everyone', userIds: [], sharedBy: {}, sharing: true}, 'old data: no key written');
  assert.equal('othersUnidentified' in normalizeAudience({mode: 'selected', userIds: ['p1']}), false);
  for (const bad of ['true', 1, null, {}, []]) assert.equal('othersUnidentified' in normalizeAudience({mode: 'selected', othersUnidentified: bad}), false);
  assert.equal(normalizeAudience({mode: 'selected', othersUnidentified: true}).othersUnidentified, true);
  const on = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}});
  assert.match(on.companionKey, PIN_KEY);
  assert.notEqual(on.companionKey, on.pinKey);
  assert.deepEqual(normalizeLocation(on), on, 'idempotent: the key is kept');
  const off = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1']}, companionKey: on.companionKey});
  assert.equal('companionKey' in off, false, 'no companion key without the option');
  const everyone = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'everyone', othersUnidentified: true}, companionKey: on.companionKey});
  assert.equal('companionKey' in everyone, false, 'Everyone mode has no companion even if the flag is stored');
  assert.equal(everyone.audience.othersUnidentified, true, 'the choice is remembered for when Selected is chosen again');
});

test('model: companionActive needs Selected, the option, a visible state, not archived, and published content', () => {
  const base = {id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}, state: 'revealed', published: publishable(normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A'}))};
  const key = normalizeLocation(base).companionKey;
  const L = extra => normalizeLocation({...base, companionKey: key, ...extra});
  assert.equal(companionActive(L({})), true);
  assert.equal(companionActive(L({state: 'unidentified'})), true);
  assert.equal(companionActive(L({state: 'hidden'})), false, 'Hidden wins: nobody sees anything');
  assert.equal(companionActive(L({archived: true})), false);
  assert.equal(companionActive(L({published: null})), false);
  assert.equal(companionActive(L({audience: {mode: 'everyone', othersUnidentified: true}})), false);
  assert.equal(companionActive(L({audience: {mode: 'selected', userIds: ['p1']}})), false);
});

test('model: the companion view holds the unidentified label and the opaque key only', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: REAL, description: DESC, teaser: 'teaser text', state: 'revealed',
    audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}});
  const pub = {...publishable(loc)};
  const v = companionView({...loc, published: pub}, {label: 'Somewhere dark'});
  assert.deepEqual(Object.keys(v).sort(), ['key', 'name', 'state']);
  assert.equal(v.name, 'Somewhere dark');
  assert.equal(v.key, loc.companionKey);
  assert.equal(companionView({...loc, published: {...pub, unidentifiedLabel: 'The Old Crypt?'}}, {label: 'x'}).name, 'The Old Crypt?', "the location's own unidentified label wins");
  const text = JSON.stringify(v);
  for (const secret of [REAL, DESC, 'teaser text', loc.id, loc.pinKey]) assert.equal(text.includes(secret), false, secret);
});

test('export / import: the option round-trips; an update import keeps the world audience and key; an older package reads off', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}});
  const pkg = exportPackage([loc]);
  assert.equal(pkg.records[0].location.audience.othersUnidentified, true);
  const fresh = parseImport(pkg, []).created[0];
  assert.equal(fresh.audience.othersUnidentified, true);
  assert.match(fresh.companionKey, PIN_KEY);
  const fresh2 = importRecords(pkg.records, []).created[0];
  assert.equal(fresh2.audience.othersUnidentified, true);
  const changed = structuredClone(pkg.records[0]);
  changed.location.audience = {mode: 'everyone'};
  changed.location.companionKey = 'zzzzzzzzzzzzzzzz';
  const up = importRecords([changed], [loc], {mode: 'update'}).updated[0];
  assert.deepEqual([up.audience.mode, up.audience.othersUnidentified, up.companionKey], ['selected', true, loc.companionKey], 'play state is kept');
  const off = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1']}});
  const old = exportPackage([off]);
  assert.equal('othersUnidentified' in old.records[0].location.audience, false);
  assert.equal(importRecords(old.records, []).created[0].audience.othersUnidentified, undefined);
  const upOff = importRecords([structuredClone(pkg.records[0])], [off], {mode: 'update'}).updated[0];
  assert.equal(upOff.audience.othersUnidentified, undefined, 'the world value (off) is kept');
  assert.equal('companionKey' in upOff, false);
});

test('the option is play state: not in the published copy, and changing it is not an unpublished change', () => {
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A'});
  const pub = publishable(loc);
  assert.equal(JSON.stringify(pub).includes('othersUnidentified'), false);
  assert.equal(JSON.stringify(pub).includes('companionKey'), false);
  const on = {...loc, published: pub, audience: {...loc.audience, mode: 'selected', othersUnidentified: true}};
  assert.equal(hasUnpublishedChanges(on), false);
});

// ---------------- ownership matrix ----------------

test('ownership: the real page reaches only the selected players; the companion only the others; later players get the companion, never the real page', async () => {
  const w = await setup();
  const [real] = reals(), [comp] = comps();
  const can = (page, id) => page.testUserPermission(w.users.get(id), 'OBSERVER');
  assert.deepEqual(['p1', 'p2', 'p3'].map(id => can(real, id)), [true, false, false], 'real page');
  assert.deepEqual(['p1', 'p2', 'p3'].map(id => can(comp, id)), [false, true, true], 'companion page');
  assert.equal(can(real, 'gm') && can(comp, 'gm'), true, 'the GM can open both');
  // A player created later is in nobody's list: the defaults decide.
  w.users.set('p4', {id: 'p4', name: '[TEST] Dara', isGM: false, active: true});
  assert.equal(can(real, 'p4'), false, 'a late player never gets the real page');
  assert.equal(can(comp, 'p4'), true, 'a late player gets the unidentified one');
  assert.equal(real.ownership.default, 0);
  assert.equal(comp.ownership.default, 2);
  // And the same after a sync with the new player known.
  await w.gm.setAudience(w.crypt.id, {userIds: ['p1', 'p2']});
  assert.deepEqual(['p1', 'p2', 'p3', 'p4'].map(id => can(comps()[0], id)), [false, false, true, true]);
  assert.deepEqual(['p1', 'p2', 'p3', 'p4'].map(id => can(reals()[0], id)), [true, true, false, false]);
});

test('ownership helpers: Everyone locations are untouched by the option', () => {
  installFoundry(); game.users = new Users([['p1', {id: 'p1', isGM: false}], ['p2', {id: 'p2', isGM: false}]]);
  const loc = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'everyone', othersUnidentified: true}});
  assert.deepEqual(ownershipFor(loc, true, -1), {default: -1, p1: -1, p2: -1});
  const sel = normalizeLocation({id: 'LOC-TEST-A', name: '[TEST] A', audience: {mode: 'selected', userIds: ['p1'], othersUnidentified: true}});
  assert.deepEqual(ownershipFor(sel, true, -1), {default: 0, p1: -1, p2: 0});
  assert.deepEqual(companionOwnership(sel, 2), {default: 2, p1: 0, p2: 2});
});

// ---------------- what each player can read ----------------

test('player lists: selected players get the real entry, the others only the generic unidentified one, the GM list is the records', async () => {
  const w = await setup();
  const p1 = view(w.g, 'p1'), p2 = view(w.g, 'p2'), gmv = view(w.g, 'gm');
  assert.deepEqual(p1.map(v => v.name), [REAL]);
  assert.deepEqual(p2.map(v => [v.name, v.state, v.id]), [['Unknown location', 'unidentified', undefined]]);
  assert.deepEqual(view(w.g, 'p3'), p2);
  assert.deepEqual(gmv.map(v => v.name), [REAL], 'no companion in the GM list');
  // The API a non-selected player calls.
  const a2 = w.api('p2');
  assert.deepEqual(a2.listLocations({includeUnidentified: true}).map(l => l.name), ['Unknown location']);
  assert.deepEqual(a2.listLocations(), [], 'revealed-only lists nothing');
  assert.equal(a2.getLocation(w.crypt.id), null, 'by id: nothing');
  assert.equal(a2.getLocation(w.crypt.pinKey), null, 'by pin key: nothing');
  assert.equal(a2.getLocation(w.loc.companionKey).name, 'Unknown location', 'the companion key opens the generic entry');
  assert.equal(w.api('p1').getLocation(w.crypt.id).name, REAL);
  assert.equal(w.api('p1').getLocation(w.loc.companionKey), null, 'selected players never get the companion');
  // The window a non-selected player opens never names the place.
  const app = new LocationsApp();
  const html = await as(w.users.get('p2'), () => app._renderHTML());
  assert.equal(html.includes('Hollow Crypt'), false);
  assert.match(html, /Unknown location/);
});

test('leak review: nothing a non-selected player can read carries the real name, description, teaser, id, pin key or uuid', async () => {
  const w = await setup();
  const p2 = w.users.get('p2');
  const readable = [];
  for (const page of journal().pages) if (page.testUserPermission(p2, 'OBSERVER')) readable.push({name: page.name, text: page.text, flags: page.flags});
  const companionNote = noteSplit(w.scene).comp[0];
  assert.ok(companionNote);
  const compDoc = {text: companionNote.text, flags: companionNote.flags, src: companionNote.texture.src, label: companionNote.text || readable[0].name};
  const blob = JSON.stringify({readable, companionDoc: compDoc});
  for (const secret of [REAL, 'Hollow', DESC, 'secrets', 'A [TEST] teaser', w.crypt.id, w.crypt.pinKey, 'LOC-']) assert.equal(blob.includes(secret), false, `leaked: ${secret}`);
  assert.equal(companionNote.text, '');
  assert.deepEqual(Object.keys(companionNote.flags[MOD]).sort(), ['companionFor', 'companionKey', 'pin']);
  assert.equal(companionNote.flags[MOD].pinKey, undefined);
  // The only page p2 can open is the generic one; the real page content is not among what p2 can read.
  assert.equal(readable.length >= 1 && readable.every(r => !r.flags[MOD].pinKey), true);
  // The real Note: its text is empty and it carries only the random pin key (no name, no id).
  const realNote = noteSplit(w.scene).real[0];
  const realBlob = JSON.stringify({text: realNote.text, flags: realNote.flags});
  for (const secret of [REAL, DESC, w.crypt.id]) assert.equal(realBlob.includes(secret), false, `real note leaked: ${secret}`);
  assert.equal(realNote.text, '');
});

test('the companion page is generic: the unidentified label from the world setting, no teaser, no other content', async () => {
  const w = await setup();
  const [comp] = comps();
  assert.equal(comp.name, 'Unknown location');
  assert.equal(comp.text.content, '<h1>Unknown location</h1>');
  assert.deepEqual(JSON.parse(comp.getFlag(MOD, 'view')), {key: w.loc.companionKey, state: 'unidentified', name: 'Unknown location'});
  assert.equal(comp.getFlag(MOD, 'partyNotes'), undefined);
  assert.equal(comp.getFlag(MOD, 'pinKey'), undefined);
});

// ---------------- notes ----------------

test('placing a pin makes the companion at the same spot with the unidentified art and the same size; the real pin is unchanged', async () => {
  const w = await setup();
  const {real, comp} = noteSplit(w.scene);
  assert.equal(real.length, 1); assert.equal(comp.length, 1);
  const [r] = real, [c] = comp;
  assert.deepEqual([c.x, c.y, c.iconSize], [r.x, r.y, r.iconSize]);
  assert.equal(c.texture.src, 'icons/svg/mystery-man.svg');
  assert.equal(r.texture.src, 'icons/svg/castle.svg', 'the real pin keeps its own art');
  assert.equal(r.text, '', 'a Selected pin carries no label of its own');
  assert.equal(c.text, '');
  assert.equal(c.entryId, journal().id);
  assert.equal(c.pageId, comps()[0].id);
  assert.equal(r.pageId, reals()[0].id);
  assert.equal(c.flags[MOD].companionFor, r.id);
  assert.equal(isCompanion({document: {getFlag: (s, k) => c.flags[s]?.[k]}}), true);
});

test('Unknown art follows the world and location settings like any unidentified pin', async () => {
  const w = await world();
  const gm = w.gm;
  const loc = await gm.saveLocation({...as(w.users.get('gm'), () => readAll())[0], pin: {unidentifiedImg: 'modules/x/unknown.webp'}});
  await gm.setAudience(loc.id, {mode: 'selected', userIds: ['p1'], othersUnidentified: true});
  await gm.publishLocation(loc.id);
  const l = as(w.users.get('gm'), () => readAll())[0];
  await as(w.users.get('gm'), () => placeNote(l, {scene: w.scene, x: 5, y: 5}));
  assert.equal(noteSplit(w.scene).comp[0].texture.src, 'modules/x/unknown.webp');
});

test('moving the real pin moves the companion (GM hook path); a hand-set companion size is kept; idempotent', async () => {
  const w = await setup();
  const {real: [r], comp: [c]} = noteSplit(w.scene);
  r.x = 640; r.y = 480; r.iconSize = 64;
  await as(w.users.get('gm'), () => syncSceneCompanions(w.scene));
  assert.deepEqual([c.x, c.y, c.iconSize], [640, 480, 64]);
  c.iconSize = 90;                                           // the GM resized the companion by hand
  r.x = 700;
  await as(w.users.get('gm'), () => syncSceneCompanions(w.scene));
  assert.deepEqual([c.x, c.iconSize], [700, 90], 'position follows, a hand-set size stays');
  const before = w.scene.updates ?? 0, count = w.scene.notes.length;
  await as(w.users.get('gm'), () => syncSceneCompanions(w.scene));
  await as(w.users.get('gm'), () => writeAll(readAll()));
  await as(w.users.get('gm'), () => writeAll(readAll()));
  assert.equal(w.scene.notes.length, count, 'no duplicates');
  assert.equal(w.scene.updates ?? 0, before, 'nothing written when nothing changed');
});

test('two pins of one location, on two scenes: one companion each; deleting a real pin removes its companion; parallel syncs make no duplicates', async () => {
  const w = await setup();
  const scene2 = new Scene(); game.scenes.push(scene2);
  await as(w.users.get('gm'), () => placeNote(w.loc, {scene: scene2, x: 9, y: 9}));
  const second = await as(w.users.get('gm'), () => placeNote(w.loc, {scene: w.scene, x: 300, y: 300}));
  assert.deepEqual([noteSplit(w.scene).real.length, noteSplit(w.scene).comp.length, noteSplit(scene2).comp.length], [2, 2, 1]);
  await Promise.all([1, 2, 3].map(() => as(w.users.get('gm'), () => syncSceneCompanions(w.scene))));
  assert.equal(noteSplit(w.scene).comp.length, 2);
  await w.scene.deleteEmbeddedDocuments('Note', [second.id]);
  await as(w.users.get('gm'), () => syncSceneCompanions(w.scene));
  assert.deepEqual([noteSplit(w.scene).real.length, noteSplit(w.scene).comp.length], [1, 1]);
  assert.equal(noteSplit(w.scene).comp[0].x, 100);
});

test('Notes without our flags are never touched by the companion sync', async () => {
  const w = await setup();
  await w.scene.createEmbeddedDocuments('Note', [{x: 1, y: 2, text: 'Camp', entryId: 'x', flags: {}}]);
  const plain = w.scene.notes.find(n => n.text === 'Camp');
  await as(w.users.get('gm'), () => writeAll(readAll()));
  await as(w.users.get('gm'), () => syncSceneCompanions(w.scene));
  assert.deepEqual([plain.x, plain.y, plain.text, plain.entryId], [1, 2, 'Camp', 'x']);
  await w.gm.setAudience(w.crypt.id, {othersUnidentified: false});
  assert.ok(w.scene.notes.includes(plain));
});

// ---------------- state, audience and lifecycle ----------------

test('turning the option off removes the companion note and page and leaves the real pin; turning it on again brings them back', async () => {
  const w = await setup();
  const realId = noteSplit(w.scene).real[0].id;
  await w.gm.setAudience(w.crypt.id, {othersUnidentified: false});
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length, noteSplit(w.scene).real.length, reals().length], [0, 0, 1, 1]);
  assert.equal(noteSplit(w.scene).real[0].id, realId);
  assert.deepEqual(view(w.g, 'p2'), [], 'the others see nothing again');
  assert.equal(w.api('gm').getAudience(w.crypt.id).othersUnidentified, false);
  await w.gm.setAudience(w.crypt.id, {othersUnidentified: true});
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [1, 1]);
  assert.equal(noteSplit(w.scene).comp[0].x, 100);
});

test('Hidden wins: a Hidden location has no companion; revealing it brings it back; Unidentified keeps it', async () => {
  const w = await setup();
  await w.gm.setLocationState(w.crypt.id, 'hidden');
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length, noteSplit(w.scene).real.length], [0, 0, 1]);
  assert.deepEqual([view(w.g, 'p1'), view(w.g, 'p2')], [[], []], 'nobody sees anything');
  await w.gm.setLocationState(w.crypt.id, 'unidentified');
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [1, 1]);
  assert.deepEqual(view(w.g, 'p2').map(v => v.name), ['Unknown location']);
  await w.gm.setLocationState(w.crypt.id, 'revealed');
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [1, 1]);
});

test('switching the audience back to Everyone removes the companion; back to Selected restores it (the option is remembered)', async () => {
  const w = await setup();
  await w.gm.setAudience(w.crypt.id, {mode: 'everyone'});
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [0, 0]);
  assert.equal(view(w.g, 'p2').length, 1); assert.equal(view(w.g, 'p2')[0].name, REAL, 'Everyone: the real entry for all');
  assert.equal(noteSplit(w.scene).real[0].text, REAL);
  await w.gm.setAudience(w.crypt.id, {mode: 'selected'});
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [1, 1]);
  assert.deepEqual(view(w.g, 'p2').map(v => v.name), ['Unknown location']);
});

test('changing the audience set moves the companion with it: a player added stops seeing it, a player removed starts', async () => {
  const w = await setup();
  await w.gm.setAudience(w.crypt.id, {userIds: ['p1', 'p2']});
  assert.deepEqual(view(w.g, 'p2').map(v => v.name), [REAL]);
  assert.deepEqual(view(w.g, 'p3').map(v => v.name), ['Unknown location']);
  await w.gm.setAudience(w.crypt.id, {userIds: ['p2']});
  assert.deepEqual(view(w.g, 'p1').map(v => v.name), ['Unknown location']);
  assert.deepEqual(view(w.g, 'p2').map(v => v.name), [REAL]);
});

test('archive removes the companion (the real pin stays, as before); restore brings it back', async () => {
  const w = await setup();
  await w.gm.archiveLocations([w.crypt.id]);
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length, noteSplit(w.scene).real.length], [0, 0, 1]);
  assert.deepEqual([view(w.g, 'p1'), view(w.g, 'p2')], [[], []]);
  await w.gm.restoreLocations([w.crypt.id]);
  assert.deepEqual([comps().length, noteSplit(w.scene).comp.length], [1, 1]);
  assert.deepEqual(view(w.g, 'p2').map(v => v.name), ['Unknown location']);
});

test('deleting the location removes the real pin, its companion and the companion page', async () => {
  const w = await setup();
  const r = await w.gm.deleteLocations([w.crypt.id]);
  assert.deepEqual(r.deleted, [w.crypt.id]);
  assert.deepEqual([w.scene.notes.length, comps().length, reals().length], [0, 0, 0]);
});

test('delete keeps a hand-customised real pin, but its companion still goes (the location is gone)', async () => {
  const w = await setup();
  noteSplit(w.scene).real[0].iconSize = 123; // the GM resized the real pin by hand
  const r = await w.gm.deleteLocations([w.crypt.id]);
  assert.equal(r.pins.kept.length, 1);
  assert.deepEqual([noteSplit(w.scene).real.length, noteSplit(w.scene).comp.length], [1, 0]);
});

test('a stale companion (its real pin gone, or its location unknown) is removed on the next sync', async () => {
  const w = await setup();
  await w.scene.createEmbeddedDocuments('Note', [{x: 5, y: 5, text: '', flags: {[MOD]: {companionKey: 'abcdefghijklmnop', companionFor: 'nope', pin: {src: 'a', size: 48}}}}]);
  assert.equal(noteSplit(w.scene).comp.length, 2);
  await as(w.users.get('gm'), () => writeAll(readAll()));
  assert.equal(noteSplit(w.scene).comp.length, 1);
  assert.equal(noteSplit(w.scene).comp[0].flags[MOD].companionKey, w.loc.companionKey);
});

test('the companion key is stable across saves and never equals a pin key', async () => {
  const w = await setup();
  const key = w.loc.companionKey;
  await w.gm.saveLocation({...w.gm.getLocation(w.crypt.id), description: 'Changed'});
  await w.gm.publishLocation(w.crypt.id);
  const after = as(w.users.get('gm'), () => readAll())[0];
  assert.equal(after.companionKey, key);
  assert.notEqual(after.companionKey, after.pinKey);
  assert.equal(comps().length, 1);
  assert.equal(comps()[0].getFlag(MOD, 'companionKey'), key);
});

test('old data: a stored record without the option writes nothing new and creates no companion', async () => {
  const w = await world();
  await w.gm.setAudience(w.crypt.id, {mode: 'selected', userIds: ['p1']});
  const stored = JSON.stringify([...game.journal].find(j => j.getFlag(MOD, 'role') === 'gm-data').getFlag(MOD, 'locations'));
  assert.equal(stored.includes('othersUnidentified'), false);
  assert.equal(stored.includes('companionKey'), false);
  assert.equal(comps().length, 0);
});

// ---------------- permissions and API ----------------

test('GM only: players cannot read or set the option, and bad values are refused', async () => {
  const w = await setup();
  await assert.rejects(w.api('p1').setAudience(w.crypt.id, {othersUnidentified: false}), /Only the GM/i);
  await assert.rejects(w.api('p2').setAudience(w.crypt.id, {othersUnidentified: true}), /Only the GM/i);
  await assert.rejects(Promise.resolve().then(() => w.api('p2').getAudience(w.crypt.id)), /Only the GM/i);
  await assert.rejects(w.gm.setAudience(w.crypt.id, {othersUnidentified: 'yes'}), TypeError);
  await assert.rejects(w.gm.setAudience(w.crypt.id, {othersUnidentified: 1}), /true or false/);
  assert.equal(w.gm.getAudience(w.crypt.id).othersUnidentified, true, 'unchanged by the refused calls');
  assert.equal(comps().length, 1);
  // A player's own copy of the view never carries the option or the key.
  const mine = JSON.stringify(view(w.g, 'p1'));
  assert.equal(mine.includes('othersUnidentified') || mine.includes(w.loc.companionKey), false);
  assert.equal(JSON.stringify(w.api('p1').listLocations({includeUnidentified: true})).includes('othersUnidentified'), false);
});

// ---------------- editor ----------------

test('editor: the option shows only in Selected players mode, with its hint; unchecked by default', async () => {
  const w = await world();
  const app = new LocationsApp();
  app.select(w.crypt.id);
  const html0 = await as(w.users.get('gm'), () => app._renderHTML());
  assert.equal(html0.includes('audience-others'), false, 'Everyone mode: no option');
  await w.gm.setAudience(w.crypt.id, {mode: 'selected', userIds: ['p1']});
  const app2 = new LocationsApp();
  app2.select(w.crypt.id);
  const html1 = await as(w.users.get('gm'), () => app2._renderHTML());
  assert.match(html1, /data-action-change="audience-others"\s*>/);
  assert.match(html1, /Everyone else sees it as unidentified/);
  assert.match(html1, /Players you did not pick see an unidentified marker at the same spot instead of nothing; they cannot open the real page/);
  await w.gm.setAudience(w.crypt.id, {othersUnidentified: true});
  const app3 = new LocationsApp();
  app3.select(w.crypt.id);
  const html2 = await as(w.users.get('gm'), () => app3._renderHTML());
  assert.match(html2, /data-action-change="audience-others" checked/);
  assert.match(html2, /Everyone else sees only an unidentified marker/);
  // A player never sees the control.
  const pApp = new LocationsApp();
  assert.equal((await as(w.users.get('p1'), () => pApp._renderHTML())).includes('audience-others'), false);
});

test('editor: ticking the option applies it through the API', async () => {
  const w = await world();
  await w.gm.setAudience(w.crypt.id, {mode: 'selected', userIds: ['p1']});
  const app = new LocationsApp();
  app.select(w.crypt.id);
  await as(w.users.get('gm'), () => app._renderHTML());
  app.render = async () => {};
  await as(w.users.get('gm'), () => app.onAudience({dataset: {actionChange: 'audience-others'}, checked: true}));
  assert.equal(w.gm.getAudience(w.crypt.id).othersUnidentified, true);
  assert.equal(comps().length, 1);
  await as(w.users.get('gm'), () => app.onAudience({dataset: {actionChange: 'audience-others'}, checked: false}));
  assert.equal(w.gm.getAudience(w.crypt.id).othersUnidentified, false);
  assert.equal(comps().length, 0);
});

// ---------------- GM marker ----------------

test('pin look: the GM sees a marked label on a companion; players and real pins are not marked', () => {
  const mk = (flags, text = '') => {
    const f = {[MOD]: flags};
    const doc = {text, label: text || 'Unknown location', iconSize: 48, fontSize: 32, textAnchor: 1, getFlag: (s, k) => f[s]?.[k], page: {getFlag: (s, k) => (k === 'view' ? '{}' : undefined)}};
    return {hover: false, controlled: false, isPreview: false, layer: {highlightObjects: false}, renderFlags: {set() {}}, controlIcon: null,
      tooltip: {visible: false, text: doc.label, position: {x: 0, y: 0, set() {}}, style: {}}, document: doc};
  };
  const companion = mk({companionKey: 'abcdefghijklmnop'}), plain = mk({pinKey: 'abcdefghijklmnop'});
  game.user = {isGM: true};
  assert.equal(applyPinLook(companion, {}), true);
  assert.equal(companion.tooltip.text, `${COMPANION_MARK}Unknown location`);
  applyPinLook(plain, {});
  assert.equal(plain.tooltip.text, 'Unknown location');
  const player = mk({companionKey: 'abcdefghijklmnop'});
  game.user = {isGM: false};
  applyPinLook(player, {});
  assert.equal(player.tooltip.text, 'Unknown location');
  assert.equal(companion.document.label, 'Unknown location', 'the Note data is never changed');
});
