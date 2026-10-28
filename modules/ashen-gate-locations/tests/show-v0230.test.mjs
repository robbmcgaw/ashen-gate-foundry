/** 0.24.1 Show to Players: mocked users, socket and API; logic only. These tests do not exercise Foundry's real socket or the Locations window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createShowService, SHOW_TYPE} from '../scripts/show.mjs';
import {SOCKET} from '../scripts/party-notes.mjs';

const KEY = 'abcdef123456abcd';
const users = [{id: 'gm', isGM: true, active: true}, {id: 'gm2', isGM: true, active: true}, {id: 'p1', isGM: false, active: true}, {id: 'p2', isGM: false, active: true}, {id: 'p3', isGM: false, active: false}];
const usersOf = list => Object.assign([...list], {get: id => list.find(u => u.id === id)});
const loc = (o = {}) => ({id: 'LOC-secret-id', pinKey: KEY, state: 'revealed', published: {name: 'Real Name'}, audience: {mode: 'everyone', userIds: []}, ...o});

function world({me = 'gm', locs = [loc()], views = {[KEY]: {key: KEY, name: 'Real Name', state: 'revealed'}}, auto = true, mayOpen = true, openResult = true} = {}) {
  const emitted = [], opened = [], notes = []; let t = 1000;
  const svc = createShowService({
    users: usersOf(users), currentUser: () => users.find(u => u.id === me), socket: {emit: (...a) => emitted.push(a)}, readAll: () => locs,
    getLocation: ref => { const v = views[ref]; if (v instanceof Error) throw v; return v ?? null; }, mayOpen: () => mayOpen, autoOpen: () => auto,
    open: async ref => { opened.push(ref); return openResult; }, notify: x => notes.push(x), now: () => t, wait: async () => {}
  });
  return {svc, emitted, opened, notes, tick: ms => { t += ms; }};
}

test('the GM sends only the pin key, to connected users who may see it, on the module socket', () => {
  const w = world(); const r = w.svc.send('LOC-secret-id');
  assert.deepEqual(r, {sent: 2, recipients: 3});
  const [chan, msg, opts] = w.emitted[0];
  assert.equal(chan, SOCKET); assert.deepEqual(msg, {type: SHOW_TYPE, ref: KEY, userId: 'gm'});
  assert.deepEqual(opts, {recipients: ['gm2', 'p1', 'p2']});                    // not the sender, not the offline player
  assert.doesNotMatch(JSON.stringify(msg), /LOC-|Real Name/);
});

test('a player cannot send, and a hidden location is refused', () => {
  assert.throws(() => world({me: 'p1'}).svc.send(KEY), /Only the GM/);
  const w = world({locs: [loc({state: 'hidden', published: null})]});
  assert.throws(() => w.svc.send(KEY), /hidden/); assert.equal(w.emitted.length, 0);
  assert.throws(() => world().svc.send('LOC-nope'), /No location/);
});

test('an unidentified location carries only the key, and the player opens its own (teaser) view', async () => {
  const w = world({me: 'p1', locs: [loc({state: 'unidentified'})], views: {[KEY]: {key: KEY, name: 'Strange Place', state: 'unidentified'}}, auto: false});
  assert.match(JSON.stringify(world({locs: [loc({state: 'unidentified'})]}).svc.send(KEY)), /sent/);
  await w.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
  assert.deepEqual(w.notes, ['The GM is showing Strange Place.']);                // the unidentified label, never the real name
});

test('Selected players: only the selected players are addressed', () => {
  const w = world({locs: [loc({audience: {mode: 'selected', userIds: ['p2']}})]});
  assert.deepEqual(w.svc.send(KEY), {sent: 1, recipients: 2});
  assert.deepEqual(w.emitted[0][2], {recipients: ['gm2', 'p2']});
});

test('nobody to show it to: nothing is emitted', () => {
  const w = world({locs: [loc({audience: {mode: 'selected', userIds: ['p3']}})]});
  assert.deepEqual(w.svc.send(KEY), {sent: 0, recipients: 1}); // the other GM
  const solo = createShowService({users: usersOf([users[0]]), currentUser: () => users[0], socket: {emit() { throw new Error('no'); }}, readAll: () => [loc()]});
  assert.deepEqual(solo.send(KEY), {sent: 0, recipients: 0});
});

test('a player receives and opens it; the sender opens nothing', async () => {
  const w = world({me: 'p1'}); await w.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
  assert.deepEqual(w.opened, [KEY]); assert.deepEqual(w.notes, []);
  const own = world({me: 'gm'}); await own.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
  assert.deepEqual(own.opened, []);
});

test('a message from a player, from an unknown or inactive sender, or with a spoofed userId opens nothing', async () => {
  for (const [msg, from] of [[{type: SHOW_TYPE, ref: KEY, userId: 'p2'}, 'p2'], [{type: SHOW_TYPE, ref: KEY}, 'ghost'], [{type: SHOW_TYPE, ref: KEY}, undefined],
    [{type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'p2'], [{type: SHOW_TYPE, ref: KEY, userId: 'p2'}, 'gm']]) {
    const w = world({me: 'p1'}); assert.equal(await w.svc.onSocket(msg, from), true); assert.deepEqual(w.opened, []); assert.deepEqual(w.notes, []);
  }
});

test('a recipient that fails the visibility check opens nothing and shows nothing', async () => {
  for (const views of [{}, {[KEY]: new Error('Locations is hidden from players')}]) {
    const w = world({me: 'p1', views}); await w.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
    assert.deepEqual(w.opened, []); assert.deepEqual(w.notes, []);
  }
  const off = world({me: 'p1', mayOpen: false}); await off.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm'); assert.deepEqual(off.opened, []);
  for (const ref of ['LOC-secret-id', '', 5, 'x'.repeat(80), null]) { const w = world({me: 'p1'}); await w.svc.onSocket({type: SHOW_TYPE, ref, userId: 'gm'}, 'gm'); assert.deepEqual(w.opened, []); }
});

test('a repeat within a second is ignored, a later one opens again', async () => {
  const w = world({me: 'p1'}); const m = {type: SHOW_TYPE, ref: KEY, userId: 'gm'};
  await w.svc.onSocket(m, 'gm'); w.tick(500); await w.svc.onSocket(m, 'gm'); assert.equal(w.opened.length, 1);
  w.tick(600); await w.svc.onSocket(m, 'gm'); assert.equal(w.opened.length, 2);
});

test('with automatic opening off, or when the window cannot switch, the player gets only a notification', async () => {
  const off = world({me: 'p1', auto: false}); await off.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
  assert.deepEqual(off.opened, []); assert.deepEqual(off.notes, ['The GM is showing Real Name.']);
  const busy = world({me: 'p1', openResult: false}); await busy.svc.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm');
  assert.deepEqual(busy.notes, ['The GM is showing Real Name.']);
});

test('other messages are not ours; a late-arriving player copy is retried once', async () => {
  const w = world({me: 'p1'}); assert.equal(await w.svc.onSocket({type: 'notes-request'}, 'gm'), false); assert.equal(await w.svc.onSocket(null), false);
  let calls = 0; const retry = createShowService({users: usersOf(users), currentUser: () => users[2], mayOpen: () => true, autoOpen: () => true, wait: async () => {},
    getLocation: () => (++calls < 2 ? null : {name: 'N'}), open: async () => true, notify() {}, now: () => 5000});
  await retry.onSocket({type: SHOW_TYPE, ref: KEY, userId: 'gm'}, 'gm'); assert.equal(calls, 2);
});

test('the window switches rather than stacks, and stays out of the way (wiring)', () => {
  const app = fs.readFileSync(new URL('../scripts/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /static async showFromGM\(ref\)[^]*?open\.notesEdit \|\| open\.dirty\)\) return false[^]*?LocationsApp\.show\(ref\)[^]*?active\.focus\(\{preventScroll: true\}\)/);
  assert.match(app, /static async show\(id = null\)[^]*?LocationsApp\.instance\?\.rendered \? LocationsApp\.instance/);
  assert.match(app, /btn\('show-players', 'Show to Players'/); assert.match(app, /case 'show-players'/);
  assert.match(app, /Reveal and show/); assert.match(app, /id="agl-set-showopen"/);
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID, 'showOpensWindow',[^]*?type: Boolean, default: true/);
  assert.match(main, /show: \{send: show\.send\}/);
});

test('nothing is written: the service has no write dependency', () => {
  const src = fs.readFileSync(new URL('../scripts/show.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /writeAll|setFlag|\.update\(|createEmbedded|updateEmbedded/);
});
