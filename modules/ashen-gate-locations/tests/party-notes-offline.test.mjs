/** 1.7.0 Party Notes with no GM connected: shared Journal, offline lock and saves, GM reconcile, hidden locations,
 *  migration. One process stands in for a GM and two player clients over a fake socket and fake documents. This
 *  proves the logic, not live Foundry permissions or real multi-client timing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {createNotesService, SOCKET} from '../scripts/party-notes.mjs';
import {readAll, writeAll, readViews, placeNote, readNotes, writeNotes, readPlayerNotes, syncSharedNotes, readSharedNotes, writeSharedNotes} from '../scripts/store.mjs';
import {parseImport, reconcileNotes, NOTES_MERGE_DIVIDER, PARTY_NOTES} from '../scripts/model.mjs';

const MOD = 'ashen-gate-locations';
const SAMPLE = JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url)));
class Users extends Map { [Symbol.iterator]() { return this.values(); } }
const as = (user, fn) => { const prev = game.user; game.user = user; try { return fn(); } finally { game.user = prev; } };
const role = r => game.journal.find(j => j.getFlag(MOD, 'role') === r);
const sharedPage = key => role('shared-notes')?.pages.find(p => p.getFlag(MOD, 'pinKey') === key);
/** Writes the GM-only store directly (as an older client or a manual edit would). */
const setStore = async notes => {
  const doc = role('party-notes');
  if (doc) await doc.update({[`flags.${MOD}.notes`]: notes});
  else await JournalEntry.create({name: 'Locations (Party Notes)', ownership: {default: 0}, flags: {[MOD]: {role: 'party-notes', notes}}});
};
const sharedRec = key => JSON.parse(sharedPage(key)?.getFlag(MOD, 'shared') || 'null');

async function world() {
  installFoundry();
  const users = new Users([
    ['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}],
    ['p1', {id: 'p1', name: '[TEST] Ava', isGM: false, active: true}],
    ['p2', {id: 'p2', name: '[TEST] Bram', isGM: false, active: true}]]);
  game.users = users;
  const state = {access: true, now: 1_000_000, log: []};
  await writeAll(parseImport(SAMPLE, []).created);
  const clients = new Map();
  const gmOnly = fn => (...a) => as(users.get('gm'), () => fn(...a));
  for (const user of users.values()) {
    const socket = {emit: (name, msg) => {
      assert.equal(name, SOCKET);
      state.log.push(structuredClone(msg));
      setTimeout(() => { for (const [id, c] of clients) if (id !== user.id && users.get(id).active) c.service.onSocket(structuredClone(msg), user.id); }, 0);
    }};
    const service = createNotesService({users, currentUser: () => users.get(user.id), isPrimaryGM: () => user.isGM,
      playerAccessEnabled: () => state.access, readAll: gmOnly(readAll), readNotes: gmOnly(readNotes), writeNotes: gmOnly(writeNotes),
      reconcile: gmOnly(loc => syncSharedNotes([loc], {now: state.now})),
      shared: {read: key => as(users.get(user.id), () => readSharedNotes(key)), write: (key, rec) => as(users.get(user.id), () => writeSharedNotes(key, rec))},
      socket, now: () => state.now, timeout: 200, settleMs: 5});
    const api = createApi({version: '1.7.0', isGM: () => user.isGM, playerAccessEnabled: () => state.access, setPlayerAccess: async v => { state.access = v; },
      readAll: () => as(users.get(user.id), readAll), writeAll: list => as(users.get(user.id), () => writeAll(list)),
      readViews: () => as(users.get(user.id), readViews), placeNote, open: () => {}, openLocation: () => {},
      notes: {readGM: id => as(users.get(user.id), () => readNotes(id)), readPlayer: key => as(users.get(user.id), () => readPlayerNotes(key)),
        request: service.request, userId: () => user.id, isActive: service.isActive, nameOf: service.nameOf, now: () => state.now}});
    clients.set(user.id, {service, api});
  }
  const api = id => clients.get(id).api;
  const keyOf = id => api('gm').getLocation(id).pinKey;
  const gmGoes = () => { users.get('gm').active = false; };
  // The GM logs back in: the primary GM's ready step.
  const gmReturns = async () => { users.get('gm').active = true; return as(users.get('gm'), () => syncSharedNotes(undefined, {now: state.now})); };
  return {state, users, clients, api, keyOf, gmGoes, gmReturns};
}

test('shared Journal: one page per visible location, players OWNER, no LOC ids or names; hidden gets none', async () => {
  const {keyOf} = await world();
  const j = role('shared-notes');
  assert.equal(j.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, 'players cannot add pages');
  const mill = sharedPage(keyOf('LOC-TEST-MILLBROOK')), ash = sharedPage(keyOf('LOC-TEST-ASH-WASTES'));
  assert.equal(mill.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  assert.equal(ash.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, 'unidentified is visible by its label');
  assert.equal(sharedPage(keyOf('LOC-TEST-HIDDEN-CAVE')), undefined, 'a never-visible location has no page');
  assert.doesNotMatch(JSON.stringify(j), /LOC-|Millbrook|Ash Wastes|Hidden Cave/);
});

test('GM offline: a player saves; the other reads it; one-editor lock, lapse and stale save still apply', async () => {
  const {api, keyOf, state, gmGoes} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  gmGoes();
  const a = await api('p1').editPartyNotes(mill);
  assert.equal(a.mine, true);
  assert.equal(api('p2').getPartyNotes(mill).editing.name, '[TEST] Ava', 'Bram sees Ava editing');
  await assert.rejects(() => api('p2').editPartyNotes(mill), /\[TEST\] Ava is editing/);
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'Bram', 0), /\[TEST\] Ava is editing/);
  const saved = await api('p1').savePartyNotes(mill, 'Offline note', a.rev);
  assert.deepEqual({text: saved.text, rev: saved.rev, editing: saved.editing}, {text: 'Offline note', rev: 1, editing: null});
  assert.equal(api('p2').getPartyNotes(mill).text, 'Offline note');
  // Stale: Bram's editor started at rev 0.
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'old copy', 0), /not saved and is still in the box/);
  // Lock lapses after 2 minutes idle.
  await api('p2').editPartyNotes(mill);
  state.now += PARTY_NOTES.lockMs;
  assert.equal((await api('p1').editPartyNotes(mill)).mine, true, 'free once lapsed');
  await api('p1').releasePartyNotes(mill);
  assert.equal(api('p2').getPartyNotes(mill).editing, null);
  await assert.rejects(() => api('p1').clearPartyNotes(mill), /Only the GM/);
});

test('GM offline: two players racing for the lock or a save cannot both win, and the loser is told', async () => {
  const {api, keyOf, clients, gmGoes} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  gmGoes();
  // Writes land a tick later, as on a real server, so both clients read the page before either write arrives.
  const j = role('shared-notes'), real = j.updateEmbeddedDocuments.bind(j);
  j.updateEmbeddedDocuments = async (...a) => { await new Promise(r => setTimeout(r, 1)); return real(...a); };
  const req = (id, op, extra = {}) => clients.get(id).service.request({op, ref: mill, ...extra});
  const [l1, l2] = await Promise.allSettled([req('p1', 'lock'), req('p2', 'lock')]);
  assert.deepEqual([l1.status, l2.status], ['rejected', 'fulfilled'], 'last write wins; the other is refused');
  assert.match(l1.reason.message, /\[TEST\] Bram started editing these Party Notes at the same moment/);
  await req('p2', 'release');
  const [s1, s2] = await Promise.allSettled([req('p1', 'save', {text: 'Ava', rev: 0}), req('p2', 'save', {text: 'Bram', rev: 0})]);
  assert.deepEqual([s1.status, s2.status], ['rejected', 'fulfilled']);
  assert.match(s1.reason.message, /at the same moment\. Your text was not saved and is still in the box/);
  assert.equal(api('p1').getPartyNotes(mill).text, 'Bram');
});

test('GM can take over a lock a player took offline', async () => {
  const {api, keyOf, gmGoes, gmReturns} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  gmGoes();
  const b = await api('p2').editPartyNotes(mill);
  await gmReturns();
  await assert.rejects(() => api('gm').editPartyNotes('LOC-TEST-MILLBROOK'), /\[TEST\] Bram is editing/, 'the offline lock is honoured');
  const g = await api('gm').editPartyNotes('LOC-TEST-MILLBROOK', {takeover: true});
  assert.equal(sharedRec(mill).lock.userId, 'gm', 'players see the GM holding it');
  await assert.rejects(() => api('p2').savePartyNotes(mill, 'late', b.rev), /\[TEST\] GM is editing/);
  await api('gm').savePartyNotes('LOC-TEST-MILLBROOK', 'GM text', g.rev);
  assert.equal(api('p2').getPartyNotes(mill).text, 'GM text');
});

test('GM reconnect: offline saves move into the GM store; a GM save never overwrites them first', async () => {
  const {api, keyOf, gmGoes, gmReturns} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  const g = await api('gm').editPartyNotes('LOC-TEST-MILLBROOK');
  await api('gm').savePartyNotes('LOC-TEST-MILLBROOK', 'GM start', g.rev);
  gmGoes();
  const a = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'GM start\nAva added', a.rev);
  const r = await gmReturns();
  assert.equal(r.fromPlayers, 1);
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text, 'GM start\nAva added');
  assert.deepEqual(await gmReturns(), {created: 0, updated: 0, fromPlayers: 0, merged: 0, truncated: 0}, 'second run changes nothing');
  // Even without the ready step, a GM-side change reconciles first.
  gmGoes();
  const b = await api('p2').editPartyNotes(mill);
  await api('p2').savePartyNotes(mill, 'Bram rewrote it', b.rev);
  game.users.get('gm').active = true;
  const g2 = await api('gm').editPartyNotes('LOC-TEST-MILLBROOK');
  assert.equal(g2.text, 'Bram rewrote it');
  await api('gm').savePartyNotes('LOC-TEST-MILLBROOK', 'Bram rewrote it. GM ok.', g2.rev);
  assert.equal(api('p1').getPartyNotes(mill).text, 'Bram rewrote it. GM ok.');
});

test('both sides changed: newest rev wins and the older text is kept under a divider', async () => {
  const {api, keyOf, gmGoes, gmReturns} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  gmGoes();
  const a = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'Player version', a.rev);
  const b = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'Player version 2', b.rev);
  // Meanwhile the GM store changed without reaching the page (e.g. written by an older client).
  await setStore([{...normalizeStore('LOC-TEST-MILLBROOK'), text: 'GM version', rev: 1, updatedBy: 'gm', updatedAt: 5, version: 'gmside'}]);
  const r = await gmReturns();
  assert.equal(r.merged, 1);
  const text = api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text;
  assert.ok(text.startsWith('Player version 2\n\n' + NOTES_MERGE_DIVIDER), text);
  assert.match(text, /\(saved by \[TEST\] GM, [^)]+\) -----\nGM version$/);
  assert.equal(api('p2').getPartyNotes(mill).text, text, 'players get the merged text');
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').rev, 3);
});
const normalizeStore = id => ({locationId: id, text: '', rev: 0, updatedBy: '', updatedAt: 0, lock: null, version: '', base: ''});

test('reconcileNotes: pure cases, nothing dropped', () => {
  const s = {locationId: 'LOC-X', text: 'S', rev: 2, updatedBy: 'gm', updatedAt: 10, version: 'v1', base: 'v1'};
  assert.equal(reconcileNotes(s, null).outcome, 'same');
  assert.equal(reconcileNotes(s, {...s}).outcome, 'same');
  const sh = reconcileNotes(s, {...s, text: 'P', rev: 3, version: 'v2'});
  assert.deepEqual([sh.outcome, sh.record.text, sh.record.base, sh.record.locationId], ['shared', 'P', 'v2', 'LOC-X']);
  const st = reconcileNotes({...s, text: 'S2', rev: 3, version: 'v3'}, {...s});
  assert.deepEqual([st.outcome, st.record.text], ['store', 'S2']);
  const m = reconcileNotes({...s, text: 'S2', rev: 3, updatedAt: 20, version: 'v3'}, {...s, text: 'P', rev: 3, updatedAt: 30, version: 'v2'}, {now: 40, newVersion: () => 'v4'});
  assert.equal(m.outcome, 'merged');
  assert.match(m.record.text, /^P\n\n----- Earlier version[^\n]*\nS2$/);
  assert.deepEqual([m.record.rev, m.record.version, m.record.base], [4, 'v4', 'v4']);
  const same = reconcileNotes({...s, text: 'X', version: 'a'}, {...s, text: 'X', version: 'b'});
  assert.equal(same.record.text, 'X', 'identical text is not duplicated');
  const big = 'x'.repeat(PARTY_NOTES.maxLength);
  const cut = reconcileNotes({...s, text: big, rev: 9, version: 'a'}, {...s, text: 'tail', rev: 1, version: 'b'});
  assert.ok(cut.truncated.endsWith('tail'), 'what the cap cut is returned, for the GM console');
});

test('Hidden: blanked and NONE for players, after its text is kept privately; reads and writes refused', async () => {
  const {api, keyOf, clients, gmGoes, gmReturns, users} = await world();
  const mill = keyOf('LOC-TEST-MILLBROOK');
  gmGoes();
  const a = await api('p1').editPartyNotes(mill);
  await api('p1').savePartyNotes(mill, 'Secret-ish', a.rev);
  await gmReturns();
  await api('gm').setLocationState('LOC-TEST-MILLBROOK', 'hidden');
  const page = sharedPage(mill);
  assert.equal(page.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE);
  assert.equal(page.getFlag(MOD, 'shared'), '');
  assert.equal(api('gm').getPartyNotes('LOC-TEST-MILLBROOK').text, 'Secret-ish', 'kept in the GM store');
  gmGoes();
  assert.equal(api('p1').getPartyNotes(mill), null);
  assert.equal(as(users.get('p1'), () => readSharedNotes(mill)), null);
  await assert.rejects(() => clients.get('p1').service.request({op: 'lock', ref: mill}), /isn't available to you/);
  await assert.rejects(() => as(users.get('p1'), () => writeSharedNotes(mill, {text: 'x'})), /isn't available to you/);
  // Revealed again: the notes come back.
  await gmReturns();
  await api('gm').setLocationState('LOC-TEST-MILLBROOK', 'revealed');
  assert.equal(api('p2').getPartyNotes(mill).text, 'Secret-ish');
});

test('GM offline: unauthorised and malformed writes are refused', async () => {
  const {clients, keyOf, state, gmGoes} = await world();
  const svc = clients.get('p1').service, mill = keyOf('LOC-TEST-MILLBROOK'), cave = keyOf('LOC-TEST-HIDDEN-CAVE');
  gmGoes();
  for (const ref of [cave, 'LOC-TEST-MILLBROOK', 'LOC-TEST-HIDDEN-CAVE', 'zzzzzzzzzzzzzzzz', '', null, {}, 'x'.repeat(65)])
    await assert.rejects(() => svc.request({op: 'lock', ref}), /isn't available to you/, String(ref));
  await assert.rejects(() => svc.request({op: 'clear', ref: mill}), /Only the GM/);
  await assert.rejects(() => svc.request({op: 'delete', ref: mill}), /Unknown/);
  await assert.rejects(() => svc.request({op: 'save', ref: mill, text: 42, rev: 0}), /must be text/);
  // A page whose copy was never written (GM has not logged in since updating) is not overwritten.
  const page = sharedPage(mill);
  await role('shared-notes').updateEmbeddedDocuments('JournalEntryPage', [{_id: page.id, [`flags.${MOD}.shared`]: ''}]);
  await assert.rejects(() => svc.request({op: 'lock', ref: mill}), /not set up yet/);
  state.access = false;
  await assert.rejects(() => svc.request({op: 'lock', ref: keyOf('LOC-TEST-ASH-WASTES')}), /hidden from players/);
  // Player-sized text only; tags stay text.
  state.access = true;
  const ash = keyOf('LOC-TEST-ASH-WASTES');
  const s = await clients.get('p2').service.request({op: 'lock', ref: ash});
  const saved = await clients.get('p2').service.request({op: 'save', ref: ash, text: '<b>hi</b>' + 'y'.repeat(PARTY_NOTES.maxLength), rev: s.rev});
  assert.equal(saved.text.length, PARTY_NOTES.maxLength);
  assert.ok(saved.text.startsWith('<b>hi</b>'));
  assert.doesNotMatch(JSON.stringify(sharedPage(ash).flags), /LOC-/);
});

test('migration: creates the shared Journal from 1.6 notes, keeps every note, and is idempotent', async () => {
  installFoundry();
  game.users = new Users([['gm', {id: 'gm', name: '[TEST] GM', isGM: true, active: true}]]);
  // A 1.6.0 world: GM Data, Player View and Party Notes Journals, no shared Journal, records without versions.
  const created = parseImport(SAMPLE, []).created;
  await writeAll(created);
  const j = role('shared-notes');
  game.journal.splice(game.journal.indexOf(j), 1);
  const locs = readAll();
  const mill = locs.find(l => l.id === 'LOC-TEST-MILLBROOK'), cave = locs.find(l => l.id === 'LOC-TEST-HIDDEN-CAVE');
  const legacy = [{locationId: mill.id, text: 'Old mill note', rev: 4, updatedBy: 'p1', updatedAt: 9, lock: null},
    {locationId: cave.id, text: 'Old cave note', rev: 1, updatedBy: 'gm', updatedAt: 3, lock: null},
    {locationId: 'LOC-TEST-DELETED', text: 'Kept for re-import', rev: 1, updatedBy: 'gm', updatedAt: 1, lock: null}];
  await setStore(legacy);
  const r1 = await syncSharedNotes();
  assert.ok(r1.created >= 1);
  assert.equal(sharedRec(mill.pinKey).text, 'Old mill note');
  assert.equal(sharedRec(mill.pinKey).rev, 4);
  assert.equal(sharedPage(cave.pinKey), undefined, 'hidden: no page');
  const store = role('party-notes').getFlag(MOD, 'notes');
  assert.deepEqual(store.map(n => n.text).sort(), ['Kept for re-import', 'Old cave note', 'Old mill note'], 'nothing deleted');
  const before = JSON.stringify(game.journal);
  const r2 = await syncSharedNotes();
  assert.deepEqual(r2, {created: 0, updated: 0, fromPlayers: 0, merged: 0, truncated: 0});
  assert.equal(JSON.stringify(game.journal), before, 'a second run writes nothing');
});
