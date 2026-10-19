/** 1.5.0 Party Notes: lock, stale saves, the GM-side checks, persistence and what players can read.
 *  One process stands in for three clients (GM, two players) joined by an in-memory socket. This proves the
 *  logic, not live Foundry or real multi-client timing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {createNotesService, SOCKET} from '../scripts/party-notes.mjs';
import {readAll, writeAll, readViews, placeNote, readNotes, writeNotes, readPlayerNotes} from '../scripts/store.mjs';
import {parseImport, applyNotesOp, normalizeNotes, PARTY_NOTES, exportPackage} from '../scripts/model.mjs';

const MOD = 'ashen-gate-locations';
const SAMPLE = JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url)));
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const GM = {id: 'gm', name: '[TEST] GM', isGM: true, active: true};
const P1 = {id: 'p1', name: '[TEST] Ava', isGM: false, active: true};
const P2 = {id: 'p2', name: '[TEST] Bram', isGM: false, active: true};
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const playerJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view');
const notesJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'party-notes');
const pageOf = key => playerJournal().pages.find(p => p.getFlag(MOD, 'pinKey') === key);
const flush = () => new Promise(r => setTimeout(r, 0));

/** A world with the [TEST] sample, a GM client and two player clients. */
async function world({access = true} = {}) {
  installFoundry();
  const users = new Users([[GM.id, {...GM}], [P1.id, {...P1}], [P2.id, {...P2}]]);
  game.users = users;
  const state = {access, now: 1_000_000, log: []};
  await writeAll(parseImport(SAMPLE, []).created);
  const clients = new Map();
  const socket = from => ({emit: (name, msg) => {
    assert.equal(name, SOCKET);
    state.log.push(structuredClone(msg));
    // Foundry delivers to every other client, with the sender's id.
    setTimeout(() => { for (const [id, c] of clients) if (id !== from) c.service.onSocket(structuredClone(msg), from); }, 0);
  }});
  const gmOnly = fn => (...a) => as(users.get('gm'), () => fn(...a));
  for (const user of users.values()) {
    const service = createNotesService({users, currentUser: () => users.get(user.id), isPrimaryGM: () => user.isGM,
      playerAccessEnabled: () => state.access, readAll: gmOnly(readAll), readNotes: gmOnly(readNotes), writeNotes: gmOnly(writeNotes),
      socket: socket(user.id), now: () => state.now, timeout: 500});
    const api = createApi({version: '1.5.0', isGM: () => user.isGM, playerAccessEnabled: () => state.access, setPlayerAccess: async v => { state.access = v; },
      readAll: () => as(users.get(user.id), readAll), writeAll: list => as(users.get(user.id), () => writeAll(list)),
      readViews: () => as(users.get(user.id), readViews), placeNote, open: () => {}, openLocation: () => {},
      notes: {readGM: id => as(users.get(user.id), () => readNotes(id)), readPlayer: key => as(users.get(user.id), () => readPlayerNotes(key)),
        request: service.request, userId: () => user.id, isActive: service.isActive, nameOf: service.nameOf, now: () => state.now}});
    clients.set(user.id, {service, api});
  }
  const api = id => clients.get(id).api;
  const keyOf = id => api('gm').getLocation(id).pinKey;
  return {state, users, clients, api, keyOf};
}

test('pure rules: lock, takeover, lapse, stale save, clear', () => {
  const ctx = (userId, extra = {}) => ({userId, isGM: userId === 'gm', now: 100, isActive: () => true, nameOf: id => ({p1: 'Ava', p2: 'Bram', gm: 'GM'})[id], ...extra});
  let rec = applyNotesOp({}, {op: 'lock'}, ctx('p1'));
  assert.deepEqual(rec.lock, {userId: 'p1', until: 100 + PARTY_NOTES.lockMs});
  assert.throws(() => applyNotesOp(rec, {op: 'lock'}, ctx('p2')), /Ava is editing/);
  assert.throws(() => applyNotesOp(rec, {op: 'save', text: 'x', rev: 0}, ctx('p2')), /Ava is editing/);
  assert.throws(() => applyNotesOp(rec, {op: 'lock', takeover: true}, ctx('p2')), /Ava is editing/, 'players cannot take over');
  assert.equal(applyNotesOp(rec, {op: 'lock', takeover: true}, ctx('gm')).lock.userId, 'gm', 'the GM can');
  assert.equal(applyNotesOp(rec, {op: 'lock'}, ctx('p2', {now: 100 + PARTY_NOTES.lockMs})).lock.userId, 'p2', 'a lapsed lock is free');
  assert.equal(applyNotesOp(rec, {op: 'lock'}, ctx('p2', {isActive: id => id !== 'p1'})).lock.userId, 'p2', 'so is one held by someone who left');
  assert.equal(applyNotesOp(rec, {op: 'release'}, ctx('p2')).lock.userId, 'p1', 'release only clears your own lock');
  assert.equal(applyNotesOp(rec, {op: 'release'}, ctx('p1')).lock, null);
  rec = applyNotesOp(rec, {op: 'save', text: 'Hello', rev: 0}, ctx('p1'));
  assert.deepEqual({text: rec.text, rev: rec.rev, by: rec.updatedBy, lock: rec.lock}, {text: 'Hello', rev: 1, by: 'p1', lock: null});
  assert.throws(() => applyNotesOp(rec, {op: 'save', text: 'Old', rev: 0}, ctx('p2')), /changed by Ava after you started editing\. Your text was not saved/);
  assert.throws(() => applyNotesOp(rec, {op: 'save', text: 'x'}, ctx('p2')), /not saved/, 'a save without a stamp is stale');
  assert.throws(() => applyNotesOp(rec, {op: 'clear'}, ctx('p1')), /Only the GM/);
  assert.equal(applyNotesOp(rec, {op: 'clear'}, ctx('gm')).text, '');
  assert.throws(() => applyNotesOp(rec, {op: 'delete'}, ctx('gm')), /Unknown/);
});

test('one editor at a time across clients; others see who is editing; release on save', async () => {
  const {api, keyOf} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const start = await api('p1').editPartyNotes('LOC-TEST-MILLBROOK');
  assert.deepEqual({text: start.text, rev: start.rev, mine: start.mine}, {text: '', rev: 0, mine: true});
  const seen = api('p2').getPartyNotes(mill);
  assert.deepEqual(seen.editing && {id: seen.editing.id, name: seen.editing.name}, {id: 'p1', name: '[TEST] Ava'}, 'Bram sees Ava editing, live from the page');
  assert.equal(seen.canEdit, false);
  await assert.rejects(() => api('p2').editPartyNotes(mill), /\[TEST\] Ava is editing/);
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'Bram was here', 0), /\[TEST\] Ava is editing/);
  const saved = await api('p1').savePartyNotes(mill, 'We met a [TEST] miller.\nHe owes us.', start.rev);
  assert.equal(saved.text, 'We met a [TEST] miller.\nHe owes us.');
  assert.equal(saved.editing, null, 'Save releases the lock');
  const after = api('p2').getPartyNotes(mill);
  assert.equal(after.text, saved.text, 'the other player reads the new text');
  assert.deepEqual(after.updatedBy, {id: 'p1', name: '[TEST] Ava'});
  assert.equal(after.canEdit, true);
  // Cancel releases too.
  await api('p2').editPartyNotes(mill);
  await api('p2').releasePartyNotes(mill);
  assert.equal(api('p1').getPartyNotes(mill).editing, null);
});

test('the lock lapses after its timeout, and the GM can take over', async () => {
  const {api, state, keyOf} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const a = await api('p1').editPartyNotes(mill);
  state.now += PARTY_NOTES.lockMs - 1;
  await assert.rejects(() => api('p2').editPartyNotes(mill), /is editing/);
  state.now += 1;
  assert.equal(api('p2').getPartyNotes(mill).editing, null, 'shown as free once lapsed');
  const b = await api('p2').editPartyNotes(mill);
  assert.equal(b.mine, true);
  // Takeover: a GM edits now; Bram's later save is refused and nothing is written.
  await assert.rejects(() => api('gm').editPartyNotes('LOC-TEST-MILLBROOK'), /\[TEST\] Bram is editing/, 'no silent takeover');
  const g = await api('gm').editPartyNotes('LOC-TEST-MILLBROOK', {takeover: true});
  assert.equal(g.editing.id, 'gm');
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'Bram text', b.rev), /\[TEST\] GM is editing/);
  await api('gm').savePartyNotes('LOC-TEST-MILLBROOK', 'GM fix', g.rev);
  // Ava's very old editor (lock long gone) can't overwrite either: her stamp is stale.
  await assert.rejects(() => api('p1').savePartyNotes(mill, 'Ava old text', a.rev), /changed by \[TEST\] GM after you started editing/);
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text, 'GM fix');
});

test('stale save is refused with no lost text; two saves arriving together cannot both win', async () => {
  const {api, clients, keyOf, state} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const a = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'first', a.rev);
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'based on an old copy', a.rev), /not saved and is still in the box/);
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text, 'first');
  // Two raw requests with the same stamp, delivered back to back to the GM client.
  const gm = clients.get('gm').service;
  const rev = api('gm').getPartyNotes('LOC-TEST-MILLBROOK').rev;
  state.log.length = 0;
  await Promise.all([
    gm.onSocket({type: 'notes-request', requestId: 'r1', userId: 'p1', op: 'save', ref: mill, text: 'Ava wins', rev}, 'p1'),
    gm.onSocket({type: 'notes-request', requestId: 'r2', userId: 'p2', op: 'save', ref: mill, text: 'Bram wins', rev}, 'p2')]);
  const receipts = state.log.filter(m => m.type === 'notes-receipt');
  assert.deepEqual(receipts.map(r => r.ok), [true, false]);
  assert.match(receipts[1].message, /changed by \[TEST\] Ava/);
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text, 'Ava wins');
});

test('unauthorized writes are rejected on the GM client, not just in the API', async () => {
  const {api, clients, state, keyOf} = await world();
  const cave = keyOf('LOC-TEST-HIDDEN-CAVE'), ash = keyOf('LOC-TEST-ASH-WASTES'), mill = keyOf('LOC-TEST-MILLBROOK');
  const NOPE = /isn't available to you/;
  // Through the API: hidden by key or id, unknown ids, made-up keys, an unidentified place by its LOC id.
  for (const ref of [cave, 'LOC-TEST-HIDDEN-CAVE', 'LOC-NOPE', 'abcdefghijklmnop', 'LOC-TEST-ASH-WASTES', '', null])
    await assert.rejects(() => api('p1').editPartyNotes(ref), NOPE, String(ref));
  assert.equal(api('p1').getPartyNotes(cave), null);
  assert.equal(api('p1').getPartyNotes('LOC-TEST-HIDDEN-CAVE'), null);
  await assert.rejects(() => api('p1').clearPartyNotes(mill), /Only the GM/);
  // Bypassing the API: a player emits requests by hand. The GM client refuses each one.
  const gm = clients.get('gm').service;
  const raw = async (msg, sender = msg.userId) => {
    state.log.length = 0;
    await gm.onSocket({type: 'notes-request', requestId: 'x', ...msg}, sender);
    return state.log.find(m => m.type === 'notes-receipt');
  };
  for (const ref of [cave, 'LOC-TEST-HIDDEN-CAVE', 'LOC-TEST-ASH-WASTES', 'LOC-MADE-UP', 'zzzzzzzzzzzzzzzz', {}, 'x'.repeat(65)]) {
    const r = await raw({userId: 'p1', op: 'save', ref, text: 'sneaky', rev: 0});
    assert.equal(r.ok, false, String(ref));
    assert.match(r.message, NOPE);
  }
  assert.match((await raw({userId: 'p1', op: 'clear', ref: mill})).message, /Only the GM/);
  assert.match((await raw({userId: 'p1', op: 'lock', ref: mill}, 'p2')).message, /sender mismatch/, 'p2 cannot act as p1');
  assert.match((await raw({userId: 'ghost', op: 'lock', ref: mill}, 'ghost')).message, /Unknown requester/);
  assert.match((await raw({userId: 'p1', op: 'save', ref: mill, text: 'x'.repeat(PARTY_NOTES.maxLength * 2 + 1), rev: 0})).message, /too long/);
  // Unidentified is accessible by its pin key (players see its label and teaser).
  assert.equal((await raw({userId: 'p1', op: 'lock', ref: ash})).ok, true);
  // Player Access off: refused everywhere.
  state.access = false;
  assert.match((await raw({userId: 'p2', op: 'lock', ref: mill})).message, /hidden from players/);
  assert.throws(() => api('p2').getPartyNotes(mill), /hidden from players/);
  as(game.users.get('gm'), () => assert.deepEqual(readNotes('LOC-TEST-HIDDEN-CAVE').text, ''), 'nothing was written to the hidden place');
});

test('no GM connected: players can read but not write, and are told why', async () => {
  const {api, users, keyOf} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  users.get('gm').active = false;
  await assert.rejects(() => api('p1').editPartyNotes(mill), /A GM must be connected/);
  assert.equal(api('p1').getPartyNotes(mill).text, '');
});

test('notes survive Save, Publish, imports, state changes, pin deletion and delete + re-import', async () => {
  const {api, keyOf} = await world();
  const say = async (who, ref, text) => { const s = await api(who).editPartyNotes(ref); return api(who).savePartyNotes(ref, text, s.rev); };
  await say('p1', keyOf('LOC-TEST-MILLBROOK'), 'Mill notes');
  const keep = () => api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text;
  const gm = api('gm');
  await gm.saveLocation({...gm.getLocation('LOC-TEST-MILLBROOK'), description: 'edited'});
  await gm.publishLocation('LOC-TEST-MILLBROOK');
  assert.equal(keep(), 'Mill notes');
  await gm.importLocations(SAMPLE.records, {mode: 'update'});
  await gm.importPackage(SAMPLE);
  assert.equal(keep(), 'Mill notes', 'imports never wipe notes');
  assert.equal(api('p2').getPartyNotes(keyOf('LOC-TEST-MILLBROOK')).text, 'Mill notes');
  // Hidden: players lose the notes (API and page), the GM keeps them; they come back on reveal.
  const key = keyOf('LOC-TEST-MILLBROOK');
  await gm.setLocationState('LOC-TEST-MILLBROOK', 'hidden');
  assert.equal(api('p1').getPartyNotes(key), null);
  assert.equal(api('p1').getPartyNotes('LOC-TEST-MILLBROOK'), null);
  assert.equal(pageOf(key).getFlag(MOD, 'partyNotes'), '', 'no copy on the hidden page');
  assert.doesNotMatch(JSON.stringify(playerJournal()), /Mill notes/);
  assert.equal(keep(), 'Mill notes', 'kept privately');
  await gm.setLocationState('LOC-TEST-MILLBROOK', 'unidentified');
  assert.equal(api('p1').getPartyNotes(key).text, 'Mill notes', 'back while unidentified');
  await gm.setLocationState('LOC-TEST-MILLBROOK', 'revealed');
  assert.equal(api('p1').getPartyNotes('LOC-TEST-MILLBROOK').text, 'Mill notes');
  // Map Notes play no part: placing and deleting a pin changes nothing.
  const scene = {notes: [], updateEmbeddedDocuments: async () => {}, createEmbeddedDocuments: async (_, l) => { scene.notes.push(...l); return l; }};
  game.scenes.push(scene);
  await gm.placeOnScene('LOC-TEST-MILLBROOK', {scene, x: 0, y: 0});
  scene.notes.length = 0;
  await writeAll(readAll());
  assert.equal(keep(), 'Mill notes');
  // Deleting the location keeps its notes privately; re-importing the same id brings them back.
  await gm.deleteLocation('LOC-TEST-MILLBROOK');
  assert.equal(api('p1').getPartyNotes(key), null);
  await gm.importPackage(SAMPLE);
  assert.equal(api('p1').getPartyNotes('LOC-TEST-MILLBROOK').text, 'Mill notes');
  // Exports carry the definition only.
  assert.doesNotMatch(JSON.stringify(gm.exportPackage()) + JSON.stringify(exportPackage(readAll())), /Mill notes|partyNotes/);
});

test('notes are plain text: control characters dropped, length capped, escaped on display', async () => {
  const {api, keyOf} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const s = await api('p1').editPartyNotes(mill);
  const saved = await api('p1').savePartyNotes(mill, '<img src=x onerror=alert(1)>\u0000\u0007ok\r\nnext', s.rev);
  assert.equal(saved.text, '<img src=x onerror=alert(1)>ok\nnext', 'stored as text; never parsed');
  assert.equal(normalizeNotes({text: 'x'.repeat(PARTY_NOTES.maxLength + 50)}).text.length, PARTY_NOTES.maxLength);
  const s2 = await api('p1').editPartyNotes(mill);
  await assert.rejects(() => api('p1').savePartyNotes(mill, 12345, s2.rev), /must be text/);
  // Rendering: the card escapes it (see also party-notes UI test below).
  globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
  const {LocationsApp} = await import('../scripts/app.mjs');
  const mod = {version: '1.5.0', active: true, api: api('p2')};
  game.modules = {get: id => id === MOD ? mod : null};
  game.user = game.users.get('p2');
  const html = new LocationsApp().partyNotesHtml(mill);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;ok<br>next/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('players can read nothing they should not: no LOC ids, no hidden notes, no notes journal', async () => {
  const {api, state, keyOf, clients} = await world();
  // The GM writes notes on the hidden cave (GM can view/edit any location).
  const g = await api('gm').editPartyNotes('LOC-TEST-HIDDEN-CAVE');
  await api('gm').savePartyNotes('LOC-TEST-HIDDEN-CAVE', 'CAVE-SECRET-NOTE', g.rev);
  const s = await api('p1').editPartyNotes(keyOf('LOC-TEST-ASH-WASTES'));
  await api('p1').savePartyNotes(keyOf('LOC-TEST-ASH-WASTES'), 'smoke notes', s.rev);
  assert.equal(notesJournal().ownership.default, 0, 'the notes store has no player permission');
  // Everything player-readable: the player journal (all pages, flags, HTML) and every socket message.
  const readable = JSON.stringify(playerJournal()) + JSON.stringify(state.log);
  assert.doesNotMatch(readable, /CAVE-SECRET-NOTE|LOC-TEST-ASH-WASTES|LOC-TEST-HIDDEN-CAVE|Ash Wastes|Hidden Cave/);
  assert.match(pageOf(keyOf('LOC-TEST-ASH-WASTES')).getFlag(MOD, 'partyNotes'), /smoke notes/);
  const out = api('p1').getPartyNotes(keyOf('LOC-TEST-ASH-WASTES'));
  assert.deepEqual(Object.keys(out).sort(), ['canEdit', 'editing', 'key', 'mine', 'rev', 'text', 'updatedAt', 'updatedBy']);
  assert.doesNotMatch(JSON.stringify(out), /LOC-/);
  // A second (non-primary) GM asking about the hidden place: the broadcast receipt carries no notes.
  const gm2 = {id: 'gm2', name: '[TEST] Co-GM', isGM: true, active: true};
  game.users.set('gm2', gm2);
  state.log.length = 0;
  await clients.get('gm').service.onSocket({type: 'notes-request', requestId: 'g2', userId: 'gm2', op: 'lock', ref: 'LOC-TEST-HIDDEN-CAVE'}, 'gm2');
  const receipt = state.log.find(m => m.type === 'notes-receipt');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.notes, null);
  assert.doesNotMatch(JSON.stringify(state.log), /CAVE-SECRET-NOTE/);
  await flush();
});

test('Party Notes card: separate from GM Notes, shows who is editing, Edit/Save/Cancel, GM Take Over and Clear', async () => {
  const {api, keyOf} = await world();
  globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
  const {LocationsApp} = await import('../scripts/app.mjs');
  const mod = {version: '1.5.0', active: true};
  game.modules = {get: id => id === MOD ? mod : null};
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const s = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'Ava wrote this', s.rev);
  await api('p1').editPartyNotes(mill);
  // Bram's card: read-only while Ava edits.
  game.user = game.users.get('p2'); mod.api = api('p2');
  const app = new LocationsApp();
  app.select(mill);
  const html = await app._renderHTML();
  assert.match(html, /Party Notes/);
  assert.match(html, /\[TEST\] Ava is editing/);
  assert.match(html, /data-action="notes-edit" data-ref="[a-z0-9]+" disabled/);
  assert.match(html, /Ava wrote this/);
  assert.match(html, /Last saved by \[TEST\] Ava/);
  assert.doesNotMatch(html, /notes-clear|Take Over/, 'players cannot clear or take over');
  // Ava's own card in edit mode keeps her typing across a re-render.
  game.user = game.users.get('p1'); mod.api = api('p1');
  const ava = new LocationsApp();
  ava.select(mill);
  ava.notesEdit = {ref: mill, text: 'half-typed <b>', rev: 1, renewed: Date.now()};
  const editing = await ava._renderHTML();
  assert.match(editing, /<textarea id="agl-party-text"[^>]*>half-typed &lt;b&gt;<\/textarea>/);
  assert.match(editing, /data-action="notes-cancel"/);
  assert.match(editing, /data-action="notes-save"/);
  // GM editor: Party Notes card is its own section, apart from the GM's Notes block, with Take Over and Clear.
  game.user = game.users.get('gm'); mod.api = api('gm');
  const gmApp = new LocationsApp();
  gmApp.select('LOC-TEST-MILLBROOK');
  const gmHtml = await gmApp._renderHTML();
  assert.match(gmHtml, /data-block="notes"/, 'GM Notes block still there');
  assert.match(gmHtml, /class="ag-card ag-card--accent agl-party"/);
  assert.match(gmHtml, /data-action="notes-edit"[^>]*data-takeover="1"/);
  assert.match(gmHtml, /data-action="notes-clear"/);
  assert.match(gmHtml, /Not part of the location/);
  // Player Preview never shows Party Notes.
  assert.doesNotMatch(gmApp.viewerHtml(api('gm').previewLocation(api('gm').getLocation('LOC-TEST-MILLBROOK')), {partyNotes: false}), /Party Notes/);
  clearTimeout(app.notesTimer); clearTimeout(gmApp.notesTimer);
});
