/** 0.39.0: the player-facing Travel tab, the Journal, conditions only, Travel for players, and the split between public and GM-only state.
 *  Mocked Foundry data; proves logic, markup and the permission checks, not how the real window looks or behaves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';
import {createOverland, useOverland, planMigration, normalizePublic, BASE_ACTIONS, JOURNAL_MAX} from '../scripts/overland.mjs';
import {createTravelChannel} from '../scripts/overland-socket.mjs';
import {OVERLAND_CONDITIONS, CONDITION_IDS} from '../scripts/overland-conditions.mjs';
import {travelHtml} from '../scripts/overland-view.mjs';
import {SOCKET} from '../scripts/party-notes.mjs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote, readOverlandSecret, writeOverlandSecret} from '../scripts/store.mjs';

const mod = (target, value, extra = {}) => ({target, value, label: '[TEST] x', ...extra});
const item = (id, mods) => ({id: `i-${id}`, name: `[TEST] ${id}`, type: 'feat', flags: {'ashen-gate-manager': {source: {sourceId: id, definition: {modifiers: {schema: 'ag-modifiers/0.1', scope: 'travel', list: mods}}}}}});
const actor = items => ({name: '[TEST] Ana', type: 'character', hasPlayerOwner: true, items});
const PIA = {id: 'p1', name: '[TEST] Pia', isGM: false, active: true};
const CALEB = {id: 'p2', name: '[TEST] Caleb', isGM: false, active: true};
const SECRET_WORDS = /severity|conditions|mounted|announce|guidance|mitigation|harsh-weather|hard-ground|poor-visibility|warped-paths|blight-taint|ashen-menace|partyModifiers|rows/i;

/**
 * One world with two clients over the same stores: `gmSvc` and `playerSvc`. The GM-only store refuses anyone but the GM, like store.mjs does.
 * `pub` is the world setting (every client can read it); `sec` is the GM Data flag.
 */
function boot({travel = true, actors = [], pub = {}, sec = {}} = {}) {
  const world = {travel, pub, sec, writes: 0, secretWrites: 0, announced: [], secretReads: 0, n: 0};
  const make = isGM => createOverland({
    isGM: () => isGM, playerTravel: () => world.travel, read: () => structuredClone(world.pub), write: async v => { world.pub = structuredClone(v); world.writes++; },
    readSecret: () => { if (!isGM) throw new Error('Only the GM can do that.'); world.secretReads++; return structuredClone(world.sec); },
    writeSecret: async v => { if (!isGM) throw new Error('Only the GM can do that.'); world.sec = structuredClone(v); world.secretWrites++; },
    actors: () => actors, announce: async t => world.announced.push(t), id: () => `e${++world.n}`,
    sendDeclare: async action => gmSvc.receiveDeclare(world.asker ?? PIA, action)
  });
  const gmSvc = make(true), playerSvc = make(false);
  const apiFor = (svc, isGM) => createApi({version: '0.39.0', isGM: () => isGM, playerAccessEnabled: () => true, overland: svc});
  return {world, gmSvc, playerSvc, gmApi: apiFor(gmSvc, true), playerApi: apiFor(playerSvc, false)};
}

// ---- conditions only ----
test('conditions only: six ids, the cap of 3, Difficult Terrain, kind kept but always "condition"', () => {
  assert.deepEqual(CONDITION_IDS, ['harsh-weather', 'hard-ground', 'poor-visibility', 'warped-paths', 'blight-taint', 'ashen-menace']);
  assert.equal(OVERLAND_CONDITIONS.find(c => c.id === 'hard-ground').label, 'Difficult Terrain');
  assert.ok(OVERLAND_CONDITIONS.every(c => c.kind === 'condition'));
});

// ---- the service: GM actions, journal ----
test('act spends exactly one action and adds one journal card; the optional text is kept; Undo removes the latest card and gives the action back', async () => {
  const {gmSvc, world} = boot();
  let st = gmSvc.state();
  assert.equal(st.left, 3); assert.equal(st.total, 3); assert.deepEqual(st.journal, []);
  st = await gmSvc.act('scout', {text: '  Smoke to the north.  '});
  assert.equal(st.left, 2); assert.equal(st.journal.length, 1);
  assert.deepEqual(st.journal[0], {id: 'e1', day: 1, kind: 'scout', text: 'Smoke to the north.', by: null});
  st = await gmSvc.act('travel');
  assert.deepEqual([st.left, st.journal.length, st.journal[1].text], [1, 2, '']);
  st = await gmSvc.undo();
  assert.deepEqual([st.left, st.journal.map(e => e.kind)], [2, ['scout']]);
  assert.deepEqual(world.pub.journal.map(e => e.kind), ['scout'], 'saved in the public setting');
  await gmSvc.act('explore'); await gmSvc.act('explore');
  await assert.rejects(gmSvc.act('travel'), /No actions left/);
  await assert.rejects(gmSvc.act('fly'), /Unknown action/);
  assert.equal(gmSvc.state().journal.length, 3, 'a refused action adds no card');
});
test('the party bonus (capped) raises the total; the public total follows it', async () => {
  const flask = item('ITEM-TEST-FLASK', [mod('travel.actions', 2, {stack: 'a'})]), charm = item('ITEM-TEST-CHARM', [mod('travel.actions', 2, {stack: 'b'})]);
  const {gmSvc, playerSvc, world} = boot({actors: [actor([flask, charm])]});
  assert.equal((await gmSvc.act('travel')).total, 5);
  assert.equal(world.pub.total, 5);
  assert.deepEqual([playerSvc.publicState().total, playerSvc.publicState().left], [5, 4]);
});
test('New day resets the actions, adds one to the day, clears the conditions and keeps the journal and waiting requests', async () => {
  const {gmSvc, playerSvc, world} = boot();
  await gmSvc.setCondition('harsh-weather', 3); await gmSvc.act('travel', {text: 'Day one.'});
  await playerSvc.declare('scout');
  const st = await gmSvc.newDay();
  assert.deepEqual([st.day, st.used, st.left], [2, 0, 3]);
  assert.equal(st.conditions['harsh-weather'], 0); assert.equal(world.sec.conditions['harsh-weather'], 0);
  assert.equal(st.journal.length, 1); assert.equal(st.requests.length, 1);
  await assert.rejects(gmSvc.undo(), /Nothing to undo today/, 'yesterday\'s card cannot be undone');
  await gmSvc.act('explore', {text: 'Day two.'});
  assert.deepEqual(gmSvc.state().journal.map(e => e.day), [1, 2]);
});
test('Announce posts one short line per action (and per resolved request), only when on, and says nothing secret', async () => {
  const {gmSvc, playerSvc, world} = boot();
  await gmSvc.act('travel'); assert.equal(world.announced.length, 0);
  await gmSvc.setAnnounce(true); await gmSvc.act('scout', {text: 'a secret note'});
  await playerSvc.declare('explore'); await gmSvc.resolve('p1');
  assert.equal(world.announced.length, 2); assert.match(world.announced[0], /Scout/); assert.doesNotMatch(world.announced.join(), /secret|LOC-|ITEM-/);
});

// ---- requests ----
test('declare: a player asks, everyone sees who and which action, one waiting request per user', async () => {
  const {gmSvc, playerSvc, world} = boot();
  assert.deepEqual(await playerSvc.declare('scout'), {contract: 'ag-overland/1', requested: true, action: 'scout'});
  assert.deepEqual(world.pub.requests, [{userId: 'p1', name: '[TEST] Pia', action: 'scout'}]);
  await playerSvc.declare('explore');
  assert.deepEqual(world.pub.requests, [{userId: 'p1', name: '[TEST] Pia', action: 'explore'}], 'a second request from the same user replaces the first');
  world.asker = CALEB; await playerSvc.declare('travel');
  assert.deepEqual(playerSvc.publicState().requests.map(q => [q.name, q.action]), [['[TEST] Pia', 'explore'], ['[TEST] Caleb', 'travel']]);
  assert.equal(gmSvc.state().left, 3, 'a request spends nothing');
  await assert.rejects(playerSvc.declare('rest'), /Unknown action/);
});
test('resolve spends one action, adds a card naming who asked, with the GM text; dismiss spends nothing', async () => {
  const {gmSvc, playerSvc, world} = boot();
  await playerSvc.declare('scout'); world.asker = CALEB; await playerSvc.declare('travel');
  let st = await gmSvc.resolve('p1', {text: 'A watchtower, two hours east.'});
  assert.deepEqual([st.left, st.requests.map(q => q.userId)], [2, ['p2']]);
  assert.deepEqual(st.journal.at(-1), {id: 'e1', day: 1, kind: 'scout', text: 'A watchtower, two hours east.', by: '[TEST] Pia'});
  st = await gmSvc.dismiss('p2');
  assert.deepEqual([st.left, st.requests.length, st.journal.length], [2, 0, 1]);
  await assert.rejects(gmSvc.resolve('p2'), /no longer waiting/);
  await assert.rejects(gmSvc.dismiss('p2'), /no longer waiting/);
});
test('resolve with no actions left keeps the request; declare is refused when none are left', async () => {
  const {gmSvc, playerSvc} = boot();
  for (let i = 0; i < 3; i++) await gmSvc.act('travel');
  await assert.rejects(playerSvc.declare('scout'), /No actions left/);
  await assert.rejects(gmSvc.receiveDeclare(PIA, 'scout'), /No actions left/);
  await gmSvc.newDay(); await playerSvc.declare('scout');
  for (let i = 0; i < 3; i++) await gmSvc.act('travel');
  await assert.rejects(gmSvc.resolve('p1'), /No actions left/);
  assert.equal(gmSvc.state().requests.length, 1);
});
test('the GM cannot declare; the GM-side handler refuses a GM or a missing user', async () => {
  const {gmSvc} = boot();
  await assert.rejects(gmSvc.declare('travel'), /GM uses the Travel, Scout and Explore buttons/);
  await assert.rejects(gmSvc.receiveDeclare({id: 'gm', name: 'GM', isGM: true}, 'travel'), /Only players/);
  await assert.rejects(gmSvc.receiveDeclare(null, 'travel'), /Only players/);
});

// ---- journal edits ----
test('journal: edit one entry\'s text, delete one entry (no action given back), clear the journal; entries stay when the day changes', async () => {
  const {gmSvc} = boot();
  await gmSvc.act('travel', {text: 'one'}); await gmSvc.act('scout', {text: 'two'}); await gmSvc.newDay(); await gmSvc.act('explore', {text: 'three'});
  let st = await gmSvc.editEntry('e2', '  corrected  ');
  assert.deepEqual(st.journal.map(e => e.text), ['one', 'corrected', 'three']);
  st = await gmSvc.deleteEntry('e1');
  assert.deepEqual(st.journal.map(e => e.id), ['e2', 'e3']); assert.equal(st.used, 1, 'deleting a card does not give an action back');
  await assert.rejects(gmSvc.deleteEntry('nope'), /gone/); await assert.rejects(gmSvc.editEntry('nope', 'x'), /gone/);
  st = await gmSvc.clearJournal();
  assert.deepEqual([st.journal.length, st.day, st.used], [0, 2, 1]);
  assert.equal(normalizePublic({journal: Array.from({length: JOURNAL_MAX + 5}, (_, i) => ({id: `x${i}`, day: 1, kind: 'travel'}))}).journal.length, JOURNAL_MAX);
});

// ---- GM only, enforced in the API and the service ----
test('GM only: every read and write other than publicState and declare refuses a player, and nothing is written', async () => {
  const {playerSvc, playerApi, world} = boot();
  assert.throws(() => playerApi.overland.state(), /Only the GM/); assert.throws(() => playerApi.overland.partyModifiers(), /Only the GM/);
  assert.throws(() => playerSvc.state(), /Only the GM/); assert.throws(() => playerSvc.partyModifiers(), /Only the GM/);
  for (const [fn, a, b] of [['act', 'travel'], ['resolve', 'p1'], ['dismiss', 'p1'], ['undo'], ['newDay'], ['setMounted', true], ['setAnnounce', true], ['setCondition', 'harsh-weather', 1],
    ['editEntry', 'e1', 'x'], ['deleteEntry', 'e1'], ['clearJournal'], ['migrate'], ['receiveDeclare', PIA, 'travel'], ['resetDay', {day: 2}]]) await assert.rejects(playerSvc[fn](a, b), /Only the GM/, fn);
  assert.deepEqual([world.writes, world.secretWrites], [0, 0]);
  assert.equal(Object.isFrozen(playerApi.overland), true);
  assert.deepEqual(Object.keys(playerApi.overland).sort(), ['contract', 'declare', 'partyModifiers', 'previewAction', 'publicState', 'resetDay', 'resolveAction', 'state']);
  const none = createApi({version: '0.39.0', isGM: () => true, playerAccessEnabled: () => true});
  assert.throws(() => none.overland.state(), /unavailable/); assert.throws(() => none.overland.publicState(), /unavailable/); await assert.rejects(none.overland.declare('travel'), /unavailable/);
});
test('Travel for players off: the player api refuses publicState and declare; the GM still reads publicState', async () => {
  const {playerApi, gmApi, world} = boot({travel: false});
  assert.throws(() => playerApi.overland.publicState(), /not open to players/);
  await assert.rejects(playerApi.overland.declare('travel'), /not open to players/);
  assert.equal(gmApi.overland.publicState().enabled, false);
  assert.deepEqual(world.pub, {});
  await assert.rejects(boot({travel: false}).gmSvc.receiveDeclare(PIA, 'travel'), /not open to players/, 'the GM client refuses too');
});
test('Travel for players on: publicState is allowed for a player and has exactly the public shape', async () => {
  const {playerApi, gmSvc} = boot();
  await gmSvc.act('scout', {text: 'North.'});
  const ps = playerApi.overland.publicState();
  assert.deepEqual(Object.keys(ps).sort(), ['area', 'contract', 'day', 'enabled', 'journal', 'left', 'requests', 'total', 'used']);
  assert.deepEqual(ps, {contract: 'ag-overland/1', enabled: true, area: '', day: 1, total: 3, used: 1, left: 2, requests: [], journal: [{id: 'e1', day: 1, kind: 'scout', text: 'North.', by: null}]});
  ps.journal[0].text = 'changed'; assert.equal(playerApi.overland.publicState().journal[0].text, 'North.', 'a copy');
});

// ---- no leaks ----
test('no leaks: a player client cannot read severities, Mounted, Announce, party modifiers or guidance through any api, the service or the setting payload', async () => {
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]);
  const {gmSvc, playerSvc, playerApi, world} = boot({actors: [actor([cloak])]});
  await gmSvc.setCondition('harsh-weather', 3); await gmSvc.setCondition('ashen-menace', 2); await gmSvc.setMounted(true); await gmSvc.setAnnounce(true);
  await gmSvc.act('travel', {text: 'Mist on the ridge.'}); await playerSvc.declare('scout');
  // what the GM stored goes to the GM-only store
  assert.equal(world.sec.conditions['harsh-weather'], 3); assert.equal(world.sec.mounted, true); assert.equal(world.sec.announce, true);
  // the setting every client can read has none of it
  const payload = JSON.stringify(world.pub);
  assert.doesNotMatch(payload, SECRET_WORDS, payload);
  assert.deepEqual(Object.keys(world.pub).sort(), ['area', 'day', 'journal', 'requests', 'total', 'used']);
  // the player api and service
  for (const out of [playerApi.overland.publicState(), playerSvc.publicState()]) assert.doesNotMatch(JSON.stringify(out), SECRET_WORDS);
  assert.throws(() => playerApi.overland.state(), /Only the GM/); assert.throws(() => playerApi.overland.partyModifiers(), /Only the GM/);
  // the player-side readSecret throws if it is ever called, and the calls above succeeded: the player client never touches the GM-only store
});
test('no leaks: a public setting that still holds the old secret keys (not yet migrated) is not echoed to a player', () => {
  const legacy = {day: 4, used: 1, mounted: true, announce: true, conditions: {'harsh-weather': 3}, log: [{kind: 'travel', day: 4}], bogus: 'x'};
  const {playerApi, playerSvc} = boot({pub: legacy});
  const out = JSON.stringify(playerApi.overland.publicState());
  assert.doesNotMatch(out, SECRET_WORDS); assert.doesNotMatch(out, /bogus/);
  assert.equal(playerSvc.publicState().day, 4);
});
test('no leaks: the player\'s Travel markup carries no condition, modifier, guidance or GM control', () => {
  const html = travelHtml({state: {contract: 'ag-overland/1', enabled: true, day: 2, total: 3, used: 1, left: 2, requests: [{userId: 'p1', name: '[TEST] Pia', action: 'scout'}], journal: [{id: 'e1', day: 1, kind: 'travel', text: 'A road.', by: '[TEST] Pia'}]}, gm: false, userId: 'p1'}, H);
  assert.doesNotMatch(html, /Today's conditions|Party modifiers|Mounted|Announce|GM only|Difficult Terrain|Harsh Weather|guidance|severity|data-action="ov-(resolve|dismiss|undo|newday|cond|edit|delete|clear|travel|scout|explore)"|<textarea|<footer/i);
  assert.equal((html.match(/data-action="ov-declare"/g) ?? []).length, 3);
});

// ---- migration ----
test('migration: moves severities, Mounted and Announce out of the public setting, turns the log into cards, and is safe to run again', async () => {
  const legacy = {day: 4, used: 2, mounted: true, announce: true, conditions: {'harsh-weather': 3, 'warped-paths': 1}, log: [{kind: 'travel', day: 3}, {kind: 'bogus', day: 3}, {kind: 'scout', day: 4}]};
  const {gmSvc, playerSvc, world} = boot({pub: structuredClone(legacy)});
  // before it runs, the GM still reads the old values
  assert.deepEqual([gmSvc.state().mounted, gmSvc.state().conditions['harsh-weather']], [true, 3]);
  assert.deepEqual(await gmSvc.migrate(), {moved: true, journal: 2});
  assert.deepEqual(Object.keys(world.pub).sort(), ['area', 'day', 'journal', 'requests', 'total', 'used']);
  assert.doesNotMatch(JSON.stringify(world.pub), SECRET_WORDS);
  assert.deepEqual(world.sec, {mounted: true, announce: true, areaConditions: {}, areaRef: null, moves: [], conditions: {'harsh-weather': 3, 'hard-ground': 0, 'poor-visibility': 0, 'warped-paths': 1, 'blight-taint': 0, 'ashen-menace': 0}});
  assert.deepEqual(world.pub.journal, [{id: 'old-1', day: 3, kind: 'travel', text: '', by: null}, {id: 'old-2', day: 4, kind: 'scout', text: '', by: null}]);
  assert.deepEqual([world.pub.day, world.pub.used], [4, 2]);
  const st = gmSvc.state();
  assert.deepEqual([st.mounted, st.announce, st.conditions['harsh-weather'], st.left, st.journal.length], [true, true, 3, 1, 2]);
  assert.deepEqual(playerSvc.publicState().journal.map(e => e.kind), ['travel', 'scout']);
  // again: nothing changes, nothing is written
  const before = structuredClone({pub: world.pub, sec: world.sec}), writes = [world.writes, world.secretWrites];
  assert.deepEqual(await gmSvc.migrate(), {moved: false, journal: 2});
  assert.deepEqual({pub: world.pub, sec: world.sec}, before); assert.deepEqual([world.writes, world.secretWrites], writes);
});
test('migration: an existing GM-only store wins over stale public keys; an interrupted run finishes on the next one; a fresh world writes nothing', async () => {
  const stale = {day: 2, used: 0, mounted: true, conditions: {'harsh-weather': 1}, log: []};
  const {gmSvc, world} = boot({pub: stale, sec: {mounted: false, announce: true, conditions: {'harsh-weather': 3}}});
  await gmSvc.migrate();
  assert.deepEqual([world.sec.mounted, world.sec.announce, world.sec.conditions['harsh-weather']], [false, true, 3]);
  assert.ok(!('mounted' in world.pub) && !('conditions' in world.pub) && !('log' in world.pub));
  const fresh = boot();
  assert.deepEqual(await fresh.gmSvc.migrate(), {moved: false, journal: 0});
  assert.deepEqual([fresh.world.writes, fresh.world.secretWrites], [0, 0]);
  // planMigration never keeps an old key
  assert.deepEqual(Object.keys(planMigration({mounted: true, log: []}, {}).public).sort(), ['area', 'day', 'journal', 'requests', 'total', 'used']);
});
test('migration refreshes the public total when the party bonus changed since it was stored', async () => {
  const flask = item('ITEM-TEST-FLASK', [mod('travel.actions', 1)]);
  const {gmSvc, world} = boot({actors: [actor([flask])], pub: {day: 1, used: 0, total: 3, requests: [], journal: []}, sec: {mounted: false, announce: false, conditions: {}}});
  await gmSvc.migrate();
  assert.equal(world.pub.total, 4);
});

// ---- the socket ----
/** Foundry's game.users is a Collection: a Map that iterates its values. */
class Users extends Map { *[Symbol.iterator]() { yield* this.values(); } }
function sockets() {
  const sent = [], world = boot();
  const users = new Users([['gm', {...gm, name: 'GM', active: true}], [PIA.id, PIA], [CALEB.id, CALEB]]);
  const gmChannel = createTravelChannel({users, currentUser: () => users.get('gm'), isPrimaryGM: () => true, service: world.gmSvc, socket: {emit: (...a) => sent.push(a)}});
  return {sent, users, world, gmChannel};
}
test('socket: the primary GM\'s client re-checks the sender, then adds the request and answers with a receipt', async () => {
  const {sent, world, gmChannel} = sockets();
  await gmChannel.onSocket({type: 'travel-declare', requestId: 'r1', userId: 'p1', action: 'scout'}, 'p1');
  assert.deepEqual(sent.at(-1), [SOCKET, {type: 'travel-receipt', requestId: 'r1', userId: 'p1', ok: true, message: ''}]);
  assert.deepEqual(world.world.pub.requests, [{userId: 'p1', name: '[TEST] Pia', action: 'scout'}]);
  const warn = console.warn; console.warn = () => {};
  try {
    await gmChannel.onSocket({type: 'travel-declare', requestId: 'r2', userId: 'p2', action: 'scout'}, 'p1');   // p1 claims to be p2
    assert.equal(sent.at(-1)[1].ok, false); assert.match(sent.at(-1)[1].message, /sender mismatch/);
    await gmChannel.onSocket({type: 'travel-declare', requestId: 'r3', userId: 'gm', action: 'scout'}, 'gm');
    assert.match(sent.at(-1)[1].message, /Unknown requester/);
    await gmChannel.onSocket({type: 'travel-declare', requestId: 'r4', userId: 'p1', action: 'fly'}, 'p1');
    assert.match(sent.at(-1)[1].message, /Unknown action/);
    world.world.travel = false;
    await gmChannel.onSocket({type: 'travel-declare', requestId: 'r5', userId: 'p1', action: 'scout'}, 'p1');
    assert.match(sent.at(-1)[1].message, /not open to players/);
  } finally { console.warn = warn; }
  assert.equal(world.world.pub.requests.length, 1, 'refused requests change nothing');
});
test('socket: a player\'s client waits for the receipt; a non-primary GM client ignores requests; no GM connected is a plain error', async () => {
  const sent = [], users = new Users([['gm', {...gm, name: 'GM', active: true}], [PIA.id, PIA]]);
  const channel = createTravelChannel({users, currentUser: () => PIA, isPrimaryGM: () => false, service: boot().playerSvc, socket: {emit: (...a) => sent.push(a)}, randomId: () => 'rq', timeout: 50});
  const asked = channel.send('scout');
  assert.deepEqual(sent[0], [SOCKET, {type: 'travel-declare', requestId: 'rq', userId: 'p1', action: 'scout'}]);
  await channel.onSocket({type: 'travel-receipt', requestId: 'rq', userId: 'p2', ok: true});   // someone else's receipt: ignored
  await channel.onSocket({type: 'travel-receipt', requestId: 'rq', userId: 'p1', ok: true});
  await asked;
  const refused = channel.send('travel'); await channel.onSocket({type: 'travel-receipt', requestId: 'rq', userId: 'p1', ok: false, message: 'Nope.'});
  await assert.rejects(refused, /Nope/);
  await assert.rejects(channel.send('travel').then(() => { throw new Error('answered'); }), /did not answer/);
  await channel.onSocket({type: 'travel-declare', requestId: 'x', userId: 'p1', action: 'scout'}, 'p1');
  assert.equal(sent.filter(m => m[1].type === 'travel-receipt').length, 0, 'a player client never answers a request');
  const lonely = createTravelChannel({users: new Users([[PIA.id, PIA]]), currentUser: () => PIA, isPrimaryGM: () => false, service: null, socket: {emit() {}}});
  await assert.rejects(lonely.send('travel'), /No GM is connected/);
  const gmSide = createTravelChannel({users, currentUser: () => users.get('gm'), isPrimaryGM: () => true, service: null, socket: {emit() {}}});
  await assert.rejects(gmSide.send('travel'), /Only players/);
});

// ---- the markup ----
const H = {esc: v => String(v).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])), tip: () => '', now: '<span>Applies now</span>',
  btn: (action, label, {kind = '', data = {}} = {}) => `<button type="button" class="ag-btn ${kind}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('')}>${label}</button>`};
test('GM markup: today, direct buttons with the text box, journal day cards newest day first, GM-only sections last, one primary, no ids or kinds shown', async () => {
  const cloak = item('PERK-TEST-CLOAK', [mod('condition.mitigation', 2, {applies: {condition: 'harsh-weather'}})]);
  const {gmSvc, playerSvc, world} = boot({actors: [actor([cloak])]});
  await gmSvc.act('travel', {text: 'Day one road.'}); await gmSvc.newDay(); await gmSvc.act('scout', {text: 'Smoke.\nTwo plumes.'}); await gmSvc.act('explore');
  await playerSvc.declare('travel'); await gmSvc.setCondition('harsh-weather', 3);
  const html = travelHtml({state: gmSvc.state(), mods: gmSvc.partyModifiers(), gm: true, userId: 'gm', text: 'draft <b>'}, H);
  assert.match(html, /Day 2/); assert.match(html, /Actions left 1 of 3/);
  for (const a of ['ov-travel', 'ov-scout', 'ov-explore', 'ov-undo', 'ov-newday', 'ov-resolve', 'ov-dismiss', 'ov-edit', 'ov-delete', 'ov-clear']) assert.match(html, new RegExp(`data-action="${a}"`), a);
  assert.doesNotMatch(html, /data-action="ov-declare"/);
  assert.doesNotMatch(html, /<textarea/, 'the text box lives in the Action preview card now');
  assert.equal((html.match(/ag-btn primary/g) ?? []).length, 1, 'one primary: New day…');
  assert.ok(html.indexOf('>Day 2</h4>') < html.indexOf('>Day 1</h4>'), 'newest day first');
  const day2 = html.slice(html.indexOf('>Day 2</h4>'), html.indexOf('>Day 1</h4>'));
  assert.ok(day2.indexOf('Smoke.') < day2.indexOf('Explore</strong>'), 'entries in order within the day');
  assert.match(html, /Smoke\.<br>Two plumes\./);
  assert.ok(html.indexOf('id="agl-ov-journal"') < html.indexOf('id="agl-ov-gmhead"'), 'the journal comes before the GM section');
  const gmPart = html.slice(html.indexOf('id="agl-ov-gmhead"'));
  for (const part of ['Table settings', 'Daily conditions: weather and temporary effects', 'Party modifiers', 'agl-ov-mounted', 'agl-ov-announce']) assert.ok(gmPart.includes(part), part);
  assert.ok(!html.slice(0, html.indexOf('id="agl-ov-gmhead"')).includes('Daily conditions'));
  assert.match(html, /<footer class="ag-footer">/);
  assert.match(html, /Pia<\/strong> asks to Travel/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /\bj(?=[0-9a-z]*\d)[0-9a-z]{8,}|\be\d\b|\d{4}-\d\d-\d\d|T\d\d:\d\d|Overland|Hazard|natural|\bkind\b/i, 'no raw ids, timestamps, kinds or the old words in visible text');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /harsh-weather|hard-ground|ashen-menace/);
  assert.match(html, /aria-label="Daily conditions"/);
  assert.equal((html.match(/data-action="ov-cond"/g) ?? []).length, 24, '6 conditions x severity 0 to 3');
  assert.ok(html.includes('Difficult Terrain')); assert.doesNotMatch(html, /Hazards \(unnatural\)|Conditions \(natural\)|Hard Ground/);
  assert.doesNotMatch(html, /\b(Alpha|Beta|Preview|Experimental)\b/);
  assert.match(world.pub.journal.map(e => e.text).join(), /Smoke/);
});
test('GM markup: with no actions left Resolve is disabled; an empty journal says so and has no Clear journal… button', async () => {
  const {gmSvc, playerSvc} = boot();
  await playerSvc.declare('scout');
  let html = travelHtml({state: gmSvc.state(), mods: gmSvc.partyModifiers(), gm: true}, H);
  assert.match(html, /Nothing in the journal yet/); assert.doesNotMatch(html, /ov-clear/);
  for (let i = 0; i < 3; i++) await gmSvc.act('travel');
  html = travelHtml({state: gmSvc.state(), mods: gmSvc.partyModifiers(), gm: true}, H);
  assert.match(html, /<button type="button" class="ag-btn ag-btn--sm" data-action="ov-resolve"[^>]*disabled/);
  assert.match(html, /No actions left today\./);
});
test('player markup: day, actions left, three declare buttons, the viewer\'s own waiting request, and the journal read only', async () => {
  const {gmSvc, playerSvc} = boot();
  await gmSvc.act('scout', {text: 'A <script> tag.'}); await playerSvc.declare('travel');
  const html = travelHtml({state: playerSvc.publicState(), gm: false, userId: 'p1'}, H);
  assert.match(html, /Day 1/); assert.match(html, /Actions left 2 of 3/);
  assert.deepEqual([...html.matchAll(/data-action="ov-declare" data-kind="(\w+)"/g)].map(m => m[1]), ['travel', 'scout', 'explore']);
  assert.match(html, /You asked to Travel\. Waiting for the GM\./); assert.match(html, /Waiting for the GM<\/h4>/);
  assert.match(html, /A &lt;script&gt; tag\./); assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /ov-edit|ov-delete|ov-clear|ov-resolve/);
  const spent = travelHtml({state: {...playerSvc.publicState(), left: 0, used: 3}, gm: false, userId: 'p9'}, H);
  assert.equal((spent.match(/<button type="button" disabled/g) ?? []).length, 3, 'declare buttons are disabled with none left');
});

// ---- the window ----
globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');
const sample = (await import('../scripts/model.mjs')).parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;

/** The real window over the real store: settings in a map, the GM-only store in the GM Data journal. */
async function windowWorld({travel = false, user = gm} = {}) {
  const g = installFoundry();
  const settings = new Map([['unidentifiedLabel', 'Unknown place'], ['unknownPinImage', ''], ['travelForPlayers', travel], ['overland', {}]]);
  g.settings = {get: (_, k) => settings.get(k), set: async (_, k, v) => { settings.set(k, structuredClone(v)); return v; }};
  const notes = {info: [], warn: []};
  globalThis.ui = {notifications: {info: m => notes.info.push(m), warn: m => notes.warn.push(m), error: m => notes.warn.push(m)}};
  g.user = gm; await writeAll(sample);
  const sent = [];
  const service = createOverland({isGM: () => game.user.isGM, playerTravel: () => settings.get('travelForPlayers') === true, read: () => settings.get('overland'), write: v => g.settings.set('x', 'overland', v),
    readSecret: () => game.user.isGM ? readOverlandSecret() : {}, writeSecret: writeOverlandSecret, actors: () => [],
    // a player's request is answered by the GM's client; here we apply it as that GM
    sendDeclare: async action => { sent.push(action); const was = game.user; game.user = gm; try { await service.receiveDeclare({id: 'p1', name: '[TEST] Pia', isGM: false}, action); } finally { game.user = was; } },
    id: (() => { let n = 0; return () => `w${++n}`; })()});
  useOverland(service);
  const mod = {version: '0.39.0', active: true};
  mod.api = createApi({version: '0.39.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open() {}, openLocation() {}, playerIds: () => [], overland: service});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  g.user = user;
  return {g, settings, notes, service, sent, api: mod.api};
}
const appOf = tab => { const app = new LocationsApp(); app.element = null; app.render = async () => {}; if (tab) app.tab = tab; return app; };
const tabsOf = html => [...html.matchAll(/<button type="button" role="tab" data-tab="(\w+)" aria-selected="(true|false)" class="([^"]*)"/g)].map(m => ({tab: m[1], selected: m[2] === 'true', cls: m[3]}));

test('window: tab order is Locations, Travel, GM Setup (GM Setup last and GM-only); the GM always has Travel', async () => {
  await windowWorld({travel: false});
  const html = await appOf()._renderHTML();
  const tabs = tabsOf(html);
  assert.deepEqual(tabs.map(t => t.tab), ['locations', 'travel', 'setup']);
  assert.doesNotMatch(tabs[1].cls, /ag-tab--gm/); assert.match(tabs[2].cls, /ag-tab--gm/);
  assert.match(html, /<i class="fa-solid fa-person-hiking" aria-hidden="true"><\/i> Travel</);
  const travel = await appOf('travel')._renderHTML();
  assert.match(travel, /Actions left 3 of 3/); assert.match(travel, /GM only/); assert.doesNotMatch(travel, /Overland/);
  assert.deepEqual(tabsOf(travel).filter(t => t.selected).map(t => t.tab), ['travel']);
});
test('window: a player sees Travel second only while Travel for players is on; off, the tab and even a forced tab are gone', async () => {
  const w = await windowWorld({travel: true, user: player});
  let html = await appOf()._renderHTML();
  assert.deepEqual(tabsOf(html).map(t => t.tab), ['locations', 'travel']); assert.ok(!/ag-tab--gm/.test(html));
  const view = await appOf('travel')._renderHTML();
  assert.match(view, /Actions left 3 of 3/); assert.match(view, /data-action="ov-declare"/);
  assert.doesNotMatch(view, /Today's conditions|Party modifiers|Mounted|Announce|GM only|ov-resolve/);
  w.settings.set('travelForPlayers', false);
  html = await appOf('travel')._renderHTML();
  assert.doesNotMatch(html, /data-tab="travel"|Actions left|Overland/);
  assert.deepEqual(tabsOf(html), [], 'a lone Locations tab shows no tab bar');
  assert.throws(() => w.api.overland.publicState(), /not open to players/);
});
test('window: GM Setup has a Travel for players switch that saves with Save Changes and defaults to off', async () => {
  const w = await windowWorld({travel: false});
  const html = await appOf('setup')._renderHTML();
  assert.match(html, /<input type="checkbox" id="agl-set-travel" > Travel for players/);
  const form = on => ({querySelector: sel => ({'#agl-set-access': {checked: true}, '#agl-set-label': {value: 'Unknown place'}, '#agl-set-unknown': {value: ''}, '#agl-set-travel': {checked: on}})[sel] ?? null});
  const app = appOf('setup');
  await app.saveSetup(form(true)); assert.equal(w.settings.get('travelForPlayers'), true);
  assert.match(await appOf('setup')._renderHTML(), /id="agl-set-travel" checked>/);
  await app.saveSetup(form(false)); assert.equal(w.settings.get('travelForPlayers'), false);
});
test('window: GM buttons spend one action and add a card with the text; the text box empties; Resolve, Dismiss, Undo, New day… work; secrets land in the GM-only store', async () => {
  const w = await windowWorld({travel: true});
  const app = appOf('travel');
  app.travelText = 'The ford is passable.';
  await app.onAction({dataset: {action: 'ov-travel'}});
  assert.equal(w.settings.get('overland').used ?? 0, 0, 'a button only opens the preview');
  await app.onAction({dataset: {action: 'ov-pv-resolve'}});
  assert.deepEqual(w.settings.get('overland').journal.map(e => [e.kind, e.text]), [['travel', 'The ford is passable.']]);
  assert.equal(app.travelText, '');
  await app.onAction({dataset: {action: 'ov-cond', cond: 'warped-paths', sev: '2'}});
  assert.doesNotMatch(JSON.stringify(w.settings.get('overland')), SECRET_WORDS);
  assert.equal(readOverlandSecret().conditions['warped-paths'], 2);
  const gmData = game.journal.find(j => j.getFlag('ashen-gate-locations', 'role') === 'gm-data');
  assert.equal(gmData.ownership.default, 0, 'the GM-only store is in the GM Data journal, which players cannot open');
  assert.ok(gmData.getFlag('ashen-gate-locations', 'locations').length > 0, 'the locations are still there');
  await app.onAction({dataset: {action: 'ov-undo'}});
  assert.deepEqual([w.settings.get('overland').used, w.settings.get('overland').journal.length], [0, 0]);
  game.user = player; await w.api.overland.declare('scout'); game.user = gm;
  assert.equal(w.settings.get('overland').requests.length, 1);
  app.travelText = 'Hills to the east.';
  await app.onAction({dataset: {action: 'ov-resolve', user: 'p1'}});
  await app.onAction({dataset: {action: 'ov-pv-resolve'}});
  assert.deepEqual(w.settings.get('overland').journal.map(e => [e.kind, e.text, e.by]), [['scout', 'Hills to the east.', '[TEST] Pia']]);
  game.user = player; await w.api.overland.declare('explore'); game.user = gm;
  await app.onAction({dataset: {action: 'ov-dismiss', user: 'p1'}});
  assert.deepEqual([w.settings.get('overland').requests.length, w.settings.get('overland').used], [0, 1]);
  const asked = [];
  foundry.applications.api.DialogV2 = {wait: async o => { asked.push(o); return o.buttons.find(b => b.action === 'confirm').callback(); }};
  await app.onAction({dataset: {action: 'ov-newday'}});
  assert.equal(w.settings.get('overland').day, 2);
  assert.equal(readOverlandSecret().conditions['warped-paths'], 0);
  assert.equal(w.settings.get('overland').journal.length, 1, 'the journal stays');
});
test('window: Delete entry? and Clear journal… are labelled danger confirms with Cancel as the default; Edit… changes the text', async () => {
  const w = await windowWorld({travel: true});
  await w.service.act('travel', {text: 'one'}); await w.service.act('scout', {text: 'two'});
  const app = appOf('travel'), id = w.settings.get('overland').journal[0].id;
  const seen = [];
  foundry.applications.api.DialogV2 = {wait: async o => { seen.push(o); return false; }};
  await app.onAction({dataset: {action: 'ov-delete', id}});
  assert.equal(seen[0].window.title, 'Delete entry?');
  assert.deepEqual(seen[0].buttons.map(b => [b.label, !!b.default]), [['Cancel', true], ['Delete entry', false]]);
  assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.equal(w.settings.get('overland').journal.length, 2, 'cancelled: nothing deleted');
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback()};
  await app.onAction({dataset: {action: 'ov-delete', id}});
  assert.deepEqual(w.settings.get('overland').journal.map(e => e.text), ['two']);
  foundry.applications.api.DialogV2 = {wait: async o => { seen.push(o); return false; }};
  await app.onAction({dataset: {action: 'ov-clear'}});
  assert.equal(seen.at(-1).window.title, 'Clear journal?');
  assert.deepEqual(seen.at(-1).buttons.map(b => [b.label, !!b.default]), [['Cancel', true], ['Clear journal', false]]);
  assert.equal(w.settings.get('overland').journal.length, 1);
  foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback()};
  await app.onAction({dataset: {action: 'ov-clear'}});
  assert.deepEqual(w.settings.get('overland').journal, []);
  await w.service.act('explore', {text: 'before'});
  const keep = w.settings.get('overland').journal[0].id;
  foundry.applications.api.DialogV2 = {wait: async () => ({text: 'after'})};
  await app.onAction({dataset: {action: 'ov-edit', id: keep}});
  assert.equal(w.settings.get('overland').journal[0].text, 'after');
});
test('window: a player\'s buttons only declare; a forged GM action from a player window is refused by the service and writes nothing', async () => {
  const w = await windowWorld({travel: true, user: player});
  const app = appOf('travel');
  await app.onAction({dataset: {action: 'ov-declare', kind: 'scout'}});
  assert.deepEqual(w.sent, ['scout']); assert.equal(w.settings.get('overland').requests[0].action, 'scout');
  const before = JSON.stringify(w.settings.get('overland'));
  for (const action of ['ov-travel', 'ov-newday', 'ov-undo']) { foundry.applications.api.DialogV2 = {wait: async o => o.buttons.find(b => b.action === 'confirm').callback()}; await app.onAction({dataset: {action}}); }
  await app.onAction({dataset: {action: 'ov-cond', cond: 'harsh-weather', sev: '3'}});
  await app.onAction({dataset: {action: 'ov-resolve', user: 'p1'}});
  await app.onAction({dataset: {action: 'ov-delete', id: 'x'}});
  assert.equal(JSON.stringify(w.settings.get('overland')), before);
  assert.ok(w.notes.warn.every(m => /Only the GM|Unknown|gone|Nothing/.test(m)), w.notes.warn.join(' | '));
  assert.ok(w.notes.warn.length >= 5);
  game.user = gm; assert.ok(Object.values(readOverlandSecret().conditions ?? {}).every(v => v === 0), 'no severity was stored');
});
test('window: Help has a Travel entry and no Overland entry', async () => {
  await windowWorld({travel: true});
  let shown = '';
  foundry.applications.api.DialogV2 = {prompt: async o => { shown = o.content; }};
  await appOf().help();
  assert.match(shown, /<summary[^>]*>Travel<\/summary>|>Travel</); assert.doesNotMatch(shown.replace(/<[^>]+>/g, ' '), /Overland|hazards \(|Hazards \(unnatural\)/);
  assert.match(shown, /Travel for players/);
  game.user = player; shown = '';
  await appOf().help();
  assert.match(shown, /Travel for players/); assert.doesNotMatch(shown, /Overland/);
});
test('no Overland in the module\'s UI text, README prose or Help', () => {
  const root = new URL('../', import.meta.url);
  const view = fs.readFileSync(new URL('scripts/overland-view.mjs', root), 'utf8').split('\n').filter(l => !/^\s*(\/\*\*|\*)/.test(l)).join('\n');
  assert.doesNotMatch(view.replace(/overland-conditions\.mjs|agl-overland|api\.overland/g, ''), /Overland/);
  const readme = fs.readFileSync(new URL('README.md', root), 'utf8');
  assert.doesNotMatch(readme.replace(/`[^`]*`/g, ''), /Overland/);
  assert.match(readme, /Travel for players/);
});

// ---- 0.40.0: the window's Action preview and the persistent-conditions block ----
test('window (0.40.0): a direct button opens the Action preview, Adjust cost changes what is spent, Cancel spends nothing, a player cannot open one', async () => {
  const w = await windowWorld({travel: true});
  const app = appOf('travel');
  await app.onAction({dataset: {action: 'ov-scout'}});
  assert.equal(w.settings.get('overland').used ?? 0, 0);
  let html = await app._renderHTML();
  assert.match(html, /<h3 id="agl-pv-h">Scout/); assert.match(html, /Resolve Scout · 1 action/);
  await app.onAction({dataset: {action: 'ov-pv-cost', delta: '1'}});
  html = await app._renderHTML(); assert.match(html, /Resolve Scout · 2 actions/); assert.match(html, /Calculated 1/);
  await app.onAction({dataset: {action: 'ov-pv-cancel'}});
  assert.equal(app.travelPreview, null); assert.doesNotMatch(await app._renderHTML(), /agl-pv-h/);
  assert.equal(w.settings.get('overland').used ?? 0, 0, 'Cancel spends nothing');
  await app.onAction({dataset: {action: 'ov-explore'}});
  await app.onAction({dataset: {action: 'ov-pv-cost', delta: '1'}});
  await app.onAction({dataset: {action: 'ov-pv-resolve'}});
  assert.deepEqual([w.settings.get('overland').used, w.settings.get('overland').journal[0].cost, app.travelPreview], [2, 2, null]);
  await app.onAction({dataset: {action: 'ov-undo'}});
  assert.equal(w.settings.get('overland').used, 0);
  game.user = player;
  const p = appOf('travel'); await p.onAction({dataset: {action: 'ov-scout'}});
  assert.equal(p.travelPreview ?? null, null); assert.match(w.notes.warn.at(-1), /Only the GM/);
});
test('window (0.40.0): the location editor has a GM-only Travel conditions block that edits the draft (Inherit, 0 to 3)', async () => {
  const w = await windowWorld({travel: true});
  const app = appOf(); app.draft = (await import('../scripts/model.mjs')).normalizeLocation({id: 'LOC-TEST-OC', name: '[TEST] OC'}); app.dirty = false;
  const html = app.overlandConditionsHtml(app.draft, []);
  assert.match(html, /Travel conditions here/); assert.match(html, /GM only/);
  assert.equal((html.match(/data-action="oc-set"/g) ?? []).length, 30, '6 conditions x (Inherit, 0, 1, 2, 3)');
  await app.onAction({dataset: {action: 'oc-set', cond: 'warped-paths', val: '2'}});
  assert.deepEqual(app.draft.overlandConditions, {'warped-paths': 2}); assert.equal(app.dirty, true);
  await app.onAction({dataset: {action: 'oc-set', cond: 'warped-paths', val: '0'}});
  assert.deepEqual(app.draft.overlandConditions, {'warped-paths': 0});
  await app.onAction({dataset: {action: 'oc-set', cond: 'warped-paths', val: ''}});
  assert.ok(!('overlandConditions' in app.draft));
  const region = (await import('../scripts/model.mjs')).normalizeLocation({id: 'LOC-TEST-RG', name: '[TEST] Region', isRegion: true, overlandConditions: {'harsh-weather': 2}});
  const child = {...app.draft, parentLocationId: 'LOC-TEST-RG'};
  assert.match(app.overlandConditionsHtml(child, [region]), /Inherited from \[TEST\] Region: 2/);
});
