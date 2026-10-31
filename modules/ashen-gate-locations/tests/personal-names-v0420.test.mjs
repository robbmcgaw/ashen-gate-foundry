/** 0.42.0: the "Personal" badge text in a partner's list, and character first names for "Also known to". Mocked Foundry: proves the display
 *  logic, the viewer rules and that no stored record changes; not the live Hub or Forge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {firstName, namesForUser, namesForUsers, playersOfActor} from '../scripts/who-names.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const actor = (id, name, owners = [], extra = {}) => ({id, name, type: 'character', ownership: Object.fromEntries(owners.map(o => [o, 3])),
  testUserPermission(u, level) { return u.isGM || this.ownership[u.id] >= 3 || (level === 'LIMITED' && this.ownership.default >= 1); }, ...extra});
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };

function world() {
  const g = installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true}], ['p1', {id: 'p1', name: '[TEST] Ava'}], ['p2', {id: 'p2', name: '[TEST] Bram'}],
    ['p3', {id: 'p3', name: '[TEST] Cole'}], ['p4', {id: 'p4', name: '[TEST] Dee'}]]);
  const face = actor('a1', 'Face Stomper', ['p1']), ger = actor('a2', '  Geraint   Wynn ', ['p2']), solo = actor('a3', 'Mira', ['p2']), npc = {...actor('n1', 'Old Pete', ['p3']), type: 'npc'};
  g.users = users; g.user = users.get('gm');
  g.actors = Object.assign(new Map([face, ger, solo, npc].map(a => [a.id, a])), {});
  const asList = new Map([...g.actors]); g.actors = {get: id => asList.get(id), [Symbol.iterator]: () => asList.values()};
  const state = {};
  const ctx = viewer => ({users, actors: g.actors, viewer});
  const api = id => createApi({version: '0.42.0', isGM: () => users.get(id).isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => as(users.get(id), readAll), writeAll: l => as(users.get(id), () => writeAll(l)), readViews: () => as(users.get(id), readViews), placeNote, open: () => {}, openLocation: () => {},
    listContext: () => ({templates: [], questName: x => x, materialName: x => x}),
    playersOfActor: actorId => playersOfActor(actorId, ctx(users.get(id)))});
  return {g, users, state, api, ctx, face, ger, solo, npc, as: (id, fn) => as(users.get(id), fn)};
}
async function seed(gmApi) {
  const make = async (name, extra = {}) => { const l = await gmApi.saveLocation({name: `[TEST] ${name}`, ...extra}); await gmApi.setLocationState(l.id, 'revealed'); return l; };
  const mine = await make('Mine', {audience: {mode: 'selected', userIds: ['p1']}});
  const group = await make('Group', {audience: {mode: 'selected', userIds: ['p1', 'p2']}});
  const theirs = await make('Theirs', {audience: {mode: 'selected', userIds: ['p2']}});
  const open = await make('Open');
  return {mine, group, theirs, open};
}
const rowsOf = m => { const out = []; const walk = ss => ss.forEach(s => { s.rows.forEach(function r(n) { out.push(n); n.children.forEach(r); }); walk(s.sections); }); walk(m.sections); return out; };
const label = (m, name) => rowsOf(m).find(r => r.name === `[TEST] ${name}`);

test('first-name rule: first word, extra spaces, single word, empty', () => {
  assert.equal(firstName('Face Stomper'), 'Face');
  assert.equal(firstName('Geraint Wynn'), 'Geraint');
  assert.equal(firstName('   Geraint    Wynn  '), 'Geraint');
  assert.equal(firstName('Mira'), 'Mira');
  assert.equal(firstName('Tab\tSeparated'), 'Tab');
  assert.equal(firstName('   '), '');
  assert.equal(firstName(null), '');
});

test('names for a user: each owned character by first name; several characters; none falls back to the user name; former player', () => {
  const w = world(), c = w.ctx(w.users.get('gm'));
  assert.deepEqual(namesForUser('p1', c), ['Face']);
  assert.deepEqual(namesForUser('p2', c), ['Geraint', 'Mira'], 'both characters, sorted by character name');
  assert.deepEqual(namesForUser('p3', c), ['[TEST] Cole'], 'owns only an NPC: the user name');
  assert.deepEqual(namesForUser('p4', c), ['[TEST] Dee'], 'no character: the user name');
  assert.deepEqual(namesForUser('gone', c), ['A former player']);
  assert.deepEqual(namesForUsers(['p1', 'p2', 'p4'], c), ['Face', 'Geraint', 'Mira', '[TEST] Dee']);
  w.users.get('p4').character = actor('a9', 'Dee Dee Vale');
  assert.deepEqual(namesForUser('p4', c), ['Dee'], 'an assigned character counts');
  w.users.get('p1').character = w.face;
  assert.deepEqual(namesForUser('p1', c), ['Face'], 'owned and assigned: listed once');
});

test('names never reveal a character the viewer may not see: the user name is shown instead (as before)', () => {
  const w = world();
  assert.deepEqual(namesForUser('p2', w.ctx(w.users.get('p1'))), ['[TEST] Bram'], 'p1 has no permission on p2 characters');
  w.ger.ownership.default = 1;
  assert.deepEqual(namesForUser('p2', w.ctx(w.users.get('p1'))), ['Geraint'], 'Limited on one of them: only that name');
  assert.deepEqual(namesForUser('p1', w.ctx(w.users.get('p1'))), ['Face'], 'own character');
});

test('Personal badge: a player on their own character Hub; others in the audience stay "Selected players"', async () => {
  const w = world(); await seed(w.api('gm'));
  const m = w.api('p1').listModel({actorId: 'a1'});
  assert.equal(label(m, 'Mine').restrictedLabel, 'Personal');
  assert.equal(label(m, 'Group').restrictedLabel, 'Personal', 'revealed to this character among others');
  assert.equal(label(m, 'Theirs'), undefined, 'p1 never receives a place revealed to someone else');
  assert.equal(label(m, 'Open').restricted, false);
  assert.equal(label(m, 'Open').restrictedLabel, '');
  assert.equal(label(m, 'Mine').restricted, true, 'restricted flag is unchanged');
});

test('Personal badge: no actorId, or a character the viewer does not own, stays "Selected players"', async () => {
  const w = world(); await seed(w.api('gm'));
  assert.equal(label(w.api('p1').listModel(), 'Mine').restrictedLabel, 'Selected players');
  assert.equal(label(w.api('p1').listModel({actorId: 'a2'}), 'Mine').restrictedLabel, 'Selected players', "looking at someone else's Hub");
  assert.equal(label(w.api('p1').listModel({actorId: 'nope'}), 'Mine').restrictedLabel, 'Selected players');
  assert.equal(label(w.api('p1').listModel({actorId: {}}), 'Mine').restrictedLabel, 'Selected players');
});

test('Personal badge: the GM on their own Hub keeps "Selected players"; on a player character Hub the player rule applies', async () => {
  const w = world(); await seed(w.api('gm'));
  const gm = w.api('gm');
  assert.equal(label(gm.listModel(), 'Group').restrictedLabel, 'Selected players');
  assert.equal(label(gm.listModel({actorId: 'a1'}), 'Mine').restrictedLabel, 'Personal');
  assert.equal(label(gm.listModel({actorId: 'a1'}), 'Group').restrictedLabel, 'Personal');
  assert.equal(label(gm.listModel({actorId: 'a1'}), 'Theirs').restrictedLabel, 'Selected players', 'not revealed to this character');
  assert.equal(label(gm.listModel({actorId: 'a2'}), 'Theirs').restrictedLabel, 'Personal');
  assert.equal(label(gm.listModel({actorId: 'a2'}), 'Mine').restrictedLabel, 'Selected players');
  assert.equal(label(gm.listModel({actorId: 'n1'}), 'Mine').restrictedLabel, 'Selected players', 'an NPC has no player of its own to match');
});

test('playersOfActor: GM sees every owner, a player only themself and only for their own character', () => {
  const w = world();
  assert.deepEqual(playersOfActor('a2', w.ctx(w.users.get('gm'))), ['p2']);
  assert.deepEqual(playersOfActor('a2', w.ctx(w.users.get('p2'))), ['p2']);
  assert.deepEqual(playersOfActor('a2', w.ctx(w.users.get('p1'))), []);
  w.ger.ownership.p1 = 3;
  assert.deepEqual(playersOfActor('a2', w.ctx(w.users.get('gm'))).sort(), ['p1', 'p2'], 'co-owned');
  assert.deepEqual(playersOfActor('a2', w.ctx(w.users.get('p1'))), ['p1'], 'a player never learns the other owner');
  assert.deepEqual(playersOfActor('', w.ctx(w.users.get('gm'))), []);
});

test('listing a Personal badge changes nothing stored, and the model carries no user or character names', async () => {
  const w = world(); const s = await seed(w.api('gm'));
  const before = JSON.stringify(readAll());
  const m = w.api('p1').listModel({actorId: 'a1'}), g = w.api('gm').listModel({actorId: 'a1'});
  assert.equal(JSON.stringify(readAll()), before, 'records untouched');
  assert.deepEqual(w.api('gm').getAudience(s.group.id).userIds, ['p1', 'p2'], 'still keyed by user id');
  assert.doesNotMatch(JSON.stringify([m, g]), /Face|Stomper|Geraint|Ava|Bram/);
});

test('"Also known to" in the window: character first names, several characters, user-name fallback, nothing for yourself', async () => {
  const w = world(); const s = await seed(w.api('gm'));
  await w.api('gm').setAudience(s.group.id, {userIds: ['p1', 'p2', 'p4']});
  w.users.get('p1').character = w.face;
  for (const a of [w.face, w.ger, w.solo]) a.ownership.default = 1;   // the party can see each other's characters (Limited)
  const html = w.as('p1', () => { game.modules = {get: () => ({api: w.api('p1')})}; const app = new LocationsApp(); app.select(readViews().find(v => v.name === '[TEST] Group').key); return app._renderHTML(); });
  const html1 = await html;
  assert.match(html1, /Also known to Geraint, Mira, \[TEST\] Dee\./);
  assert.doesNotMatch(html1, /Face|Bram|Stomper|Wynn/, 'not yourself, no user name where a character is visible');
});

test('"Also known to": a character the viewer cannot see falls back to the user name (nothing new is revealed)', async () => {
  const w = world(); const s = await seed(w.api('gm'));
  await w.api('gm').setAudience(s.group.id, {userIds: ['p1', 'p2']});
  w.ger.testUserPermission = function (u) { return u.isGM || this.ownership[u.id] >= 3; };
  w.solo.testUserPermission = w.ger.testUserPermission;
  const html = await w.as('p1', () => { game.modules = {get: () => ({api: w.api('p1')})}; const app = new LocationsApp(); app.select(readViews().find(v => v.name === '[TEST] Group').key); return app._renderHTML(); });
  assert.match(html, /Also known to \[TEST\] Bram\./);
  assert.doesNotMatch(html, /Geraint|Mira/);
});

test('GM card: Who Can See It lists players by character first name (and "shared by")', async () => {
  const w = world(); const s = await seed(w.api('gm'));
  await w.api('gm').setAudience(s.mine.id, {userIds: ['p1', 'p2']});
  const html = await w.as('gm', () => { game.modules = {get: () => ({api: w.api('gm')})}; const app = new LocationsApp(); app.select(s.mine.id); return app._renderHTML(); });
  assert.match(html, /value="p1" checked> Face<\/label>/);
  assert.match(html, /value="p2" checked> Geraint, Mira<\/label>/);
  assert.match(html, /value="p4" > \[TEST\] Dee<\/label>|value="p4"\s*> \[TEST\] Dee<\/label>/);
});
